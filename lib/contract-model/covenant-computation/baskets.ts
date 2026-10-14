/**
 * Typed basket classification and cap evaluation.
 *
 * Classification reuses the compiler classifiers and the basket-formula
 * taxonomy. Cap numbers come only from evaluateExpression. Unknown ledger
 * usage is never treated as zero. A clause with no numeric cap is conditional,
 * not unlimited. Unlimited capacity requires an explicit "unlimited" or
 * "without limit" quote. A ratio test is not converted to dollars unless the
 * clause states that conversion (it does not, here).
 */

import { FORMULA_TAXONOMY } from "@/lib/basket-formula-corpus";
import type { FormulaKind } from "@/lib/basket-formula-corpus";
import { classifyFixedDollarBasket } from "../compiler/fixed-dollar-basket/classify";
import { classifyRatioIncurrencePermission } from "../compiler/ratio-incurrence/classify";
import type { IRCapacityExpression, IRExpression, SourceProvenance } from "../ir/types";
import { fixtureInputResolver } from "../runtime/input-resolver";
import { evaluateExpression } from "../runtime/evaluate-expression";
import type { MetricInput } from "../runtime/types";
import type { BasketCategory, BasketClause, BasketScope, ComputationPackage, ComputationStatus, ComputedBasket, ComputedRatio } from "./types";
import { CERTIFICATION } from "./types";
import { rationalFromString, toCanonicalString } from "../runtime/decimal";
import { canonicalOf } from "./ratios";
import { dollarAmountIsMillions, dollarToken, millionsToUsd, norm, percentOfPhrase } from "./text";

const FORMULA_BY_CATEGORY: Record<Exclude<BasketCategory, "UNKNOWN">, FormulaKind> = {
  FIXED_DOLLAR: "FIXED_DOLLAR_CEILING",
  GROWER_GREATER_OF: "GREATER_OF_FIXED_OR_PCT_METRIC",
  PCT_OF_METRIC: "PCT_OF_METRIC_ONLY",
  RATIO_BASED: "RATIO_INCURRENCE_ROOM",
  BUILDER_AVAILABLE_AMOUNT: "BUILDER_SUM_COMPONENTS",
  UNLIMITED: "UNLIMITED_SUBJECT_TO_GATE",
  NO_NUMERIC_CAP_CONDITIONAL: "OTHER_SOURCE_STATED",
  RECLASS: "REALLOCATION_TRANSFER",
  STATED_PERIOD: "NON_CAPACITY_APPROVAL_OR_DEFAULT_TRIGGER",
  STATED_PERCENT: "NON_CAPACITY_COMPARATOR",
};

export function evaluateBaskets(
  pkg: ComputationPackage,
  metrics: readonly MetricInput[],
  ratios: readonly ComputedRatio[],
): ComputedBasket[] {
  return pkg.baskets.map((clause) => evaluateBasket(pkg, clause, metrics, ratios));
}

export function evaluateBasket(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
  ratios: readonly ComputedRatio[],
): ComputedBasket {
  const doc = pkg.documents.find((d) => d.documentId === clause.documentId);
  if (!doc || !norm(doc.text).includes(norm(clause.operativeText))) {
    return basket(clause, "UNKNOWN", "NONE", "UNKNOWN", null, null, ["operative text is not a substring of the cited document"], "Citation does not bind to the cited document.");
  }

  const category = categorize(clause.operativeText);
  const formulaKind = category === "UNKNOWN" ? null : formulaLabel(FORMULA_BY_CATEGORY[category]);
  const base = {
    stableKey: clause.stableKey,
    sectionRef: clause.sectionRef,
    covenantFamily: clause.covenantFamily,
    sourceDocumentId: clause.documentId,
    citationExcerpt: clause.operativeText,
    category,
    formulaKind,
    certification: CERTIFICATION,
  };

  const partial =
    category === "FIXED_DOLLAR"
      ? evalFixed(pkg, clause, metrics)
      : category === "GROWER_GREATER_OF"
        ? evalGrower(pkg, clause, metrics)
        : category === "PCT_OF_METRIC"
          ? evalPercentOfMetric(pkg, clause, metrics)
          : category === "RATIO_BASED"
            ? evalRatioBasket(pkg, clause, metrics, ratios)
            : category === "BUILDER_AVAILABLE_AMOUNT"
              ? evalBuilder(pkg, clause, metrics)
              : category === "UNLIMITED"
                ? evalUnlimited(pkg, clause, metrics)
                : category === "NO_NUMERIC_CAP_CONDITIONAL"
                  ? conditionalNoCap(clause)
                  : category === "STATED_PERIOD"
                    ? evalStatedPeriod(clause)
                    : category === "STATED_PERCENT"
                      ? evalStatedPercent(clause)
                      : category === "RECLASS"
                    ? {
                        ...capShell("NEEDS_INPUT", "NONE", null, null, ["source basket unused", "reclassification election"], null),
                        note: "Reclassification is named. No election record is bound, so no amount is transferred.",
                      }
                    : numericButOpen(clause);
  return present(clause, { ...base, ...partial });
}

export function categorize(operativeText: string): BasketCategory {
  const text = norm(operativeText);
  const numeric = hasNumeric(text);
  const closed = hasClosedCap(text);
  if (/\breclassif/i.test(text) && !closed) return "RECLASS";
  if (
    /\b(available amount|builder basket|cumulative credit|available restricted payments amount)\b/i.test(text) ||
    (/\bsum of\b/i.test(text) && /\d+(?:\.\d+)?\s*%\s+of\b/i.test(text)) ||
    (/\bsum\b/i.test(text) && /\d+(?:\.\d+)?\s*%\s+of\b/i.test(text) && /\bshall not exceed the sum\b/i.test(text)) ||
    (/\bmay be increased by\b/i.test(text) && /\$\s*[\d,]+/.test(text))
  ) {
    return "BUILDER_AVAILABLE_AMOUNT";
  }
  if (/\bgreater\s+of\b/i.test(text)) return "GROWER_GREATER_OF";
  const ratio = classifyRatioIncurrencePermission(text);
  if (ratio.class !== "NOT_RATIO_INCURRENCE") return "RATIO_BASED";
  if (percentOfMetric(text) && !/\$\s*[\d,]+/.test(text)) return "PCT_OF_METRIC";
  const unlimited = explicitUnlimitedQuote(text) != null;
  const dollarCap = soleFixedDollar(text) != null;
  if (unlimited && (dollarCap || /\$\s?[\d,]+/.test(text) || /\d+(?:\.\d+)?\s*%/.test(text))) return "UNKNOWN";
  if (unlimited) return "UNLIMITED";
  if (dollarCap) return "FIXED_DOLLAR";
  if (text.length < 240 && statedPeriod(text) && !/\$\s*[\d,]+/.test(text) && !/\d+(?:\.\d+)?\s*%/.test(text)) return "STATED_PERIOD";
  if (text.length < 240 && statedPercent(text) && !/\$\s*[\d,]+/.test(text) && !percentOfMetric(text)) return "STATED_PERCENT";
  if (numeric) return "UNKNOWN";
  return "NO_NUMERIC_CAP_CONDITIONAL";
}

const DAY_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  fifteen: "15",
  twenty: "20",
  thirty: "30",
  forty: "40",
  "forty-five": "45",
  sixty: "60",
  ninety: "90",
};

const DAY_TRIGGER = String.raw`(?:within|no later than|not later than|no fewer than|at least|for a period of|prior to|after receipt|following|that is|more than|not exceeding|not to exceed|given)`;

export interface StatedPeriod {
  count: string;
  unit: "DAYS" | "BUSINESS_DAYS" | "MONTHS";
}

/** A deadline written as a day or month count. Null when the clause does not state one. */
export function statedPeriod(text: string): StatedPeriod | null {
  const src = norm(text);
  const paren = src.match(
    new RegExp(
      `${DAY_TRIGGER}[^.]{0,80}?\\(\\s*(\\d+)\\s*\\)\\s*(consecutive\\s+)?(Business\\s+)?days?\\b|\\(\\s*(\\d+)\\s*\\)\\s*(consecutive\\s+)?(Business\\s+)?days?\\s+prior\\b`,
      "i",
    ),
  );
  const parenCount = paren?.[1] ?? paren?.[4];
  if (parenCount) return { count: parenCount, unit: (paren?.[3] ?? paren?.[6]) ? "BUSINESS_DAYS" : "DAYS" };
  const digits = src.match(
    new RegExp(`${DAY_TRIGGER}[^.]{0,60}?\\b(\\d+)\\s*(consecutive\\s+)?(Business\\s+)?days?\\b|\\b(\\d+)\\s*(consecutive\\s+)?(Business\\s+)?days?\\s+prior\\b`, "i"),
  );
  const digitCount = digits?.[1] ?? digits?.[4];
  if (digitCount) return { count: digitCount, unit: (digits?.[3] ?? digits?.[6]) ? "BUSINESS_DAYS" : "DAYS" };
  const word = src.match(
    new RegExp(
      `${DAY_TRIGGER}[^.]{0,40}?\\b(forty-five|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|sixty|ninety)\\b\\s*(consecutive\\s+)?(Business\\s+)?days?\\b`,
      "i",
    ),
  );
  if (word?.[1] && DAY_WORDS[word[1].toLowerCase()]) {
    return { count: DAY_WORDS[word[1].toLowerCase()]!, unit: word[3] ? "BUSINESS_DAYS" : "DAYS" };
  }
  const months = src.match(
    new RegExp(`${DAY_TRIGGER}[^.]{0,40}?(?:\\(\\s*(\\d+)\\s*\\)|\\b(\\d+)\\b)\\s+months?\\b`, "i"),
  );
  const monthCount = months?.[1] ?? months?.[2];
  if (monthCount) return { count: monthCount, unit: "MONTHS" };
  return null;
}

function statedPercent(text: string): string | null {
  const paren = text.match(/percent\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/i);
  if (paren?.[1]) return paren[1];
  const bare = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return bare?.[1] ?? null;
}

/**
 * The only phrases that grant unlimited capacity.
 * "including, without limitation" is an idiom. "without limitation" is not "without limit".
 */
export function explicitUnlimitedQuote(text: string): string | null {
  const stripped = norm(text).replace(/\bincluding,?\s+without\s+limitation\b/gi, " ");
  const unlimited = stripped.match(/\bunlimited\b/i);
  if (unlimited?.[0]) return unlimited[0].toLowerCase();
  const without = stripped.match(/\bwithout\s+limit\b/i);
  if (without?.[0]) return without[0].toLowerCase().replace(/\s+/g, " ");
  return null;
}

/** True only when the published row is unlimited because the clause says so. */
export function grantsUnlimitedCapacity(basket: { category: string; capKind: string; citationExcerpt: string }): boolean {
  return basket.category === "UNLIMITED" && basket.capKind === "UNLIMITED" && explicitUnlimitedQuote(basket.citationExcerpt) != null;
}

function hasNumeric(text: string): boolean {
  return /\$\s*[\d,]+|\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/.test(text);
}

function hasClosedCap(text: string): boolean {
  return (
    /\bgreater\s+of\b/i.test(text) ||
    soleFixedDollar(text) != null ||
    (classifyRatioIncurrencePermission(text).thresholdNumerator != null &&
      classifyRatioIncurrencePermission(text).class !== "NOT_RATIO_INCURRENCE")
  );
}

function percentOfMetric(text: string): boolean {
  return percentOfPhrase(text) != null;
}

function evalFixed(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const fixed = classifyFixedDollarBasket(clause.operativeText);
  const token = soleFixedDollar(clause.operativeText);
  if (!token) {
    return { ...capShell("NEEDS_INPUT", "NONE", null, null, ["fixed-dollar cap token"], null), note: "Clause did not yield a single cap-role dollar." };
  }
  const millions = dollarAmountIsMillions(clause.operativeText, token);
  const amount = millions ? Number(millionsToUsd(token)) : Number(token);
  const expression: IRExpression = {
    kind: "MONEY",
    type: "MONEY",
    amount,
    currency: "USD",
    exprId: `cc:${clause.stableKey}:cap`,
    provenance: prov(clause),
  };
  const evaluated = run(pkg, expression, metrics);
  const canonical = canonicalOf(evaluated.value);
  const reasons = fixed.residuals.map((r) => r.kind);
  if (evaluated.status !== "EXECUTABLE" || !canonical) {
    return { ...capShell("NEEDS_INPUT", "AMOUNT", null, "USD", ["cap literal"], null), note: "Cap literal did not evaluate.", reasons };
  }
  return {
    ...capShell("COMPUTED", "AMOUNT", canonical, "USD", [], null),
    remainingStatus: "NEEDS_INPUT",
    missingInputs: ["ledger usage"],
    reasons,
    note: "Gross ceiling only. Remaining capacity is NEEDS_INPUT until usage is bound. Qualitative gates are listed, not waived.",
  };
}

function evalGrower(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const read = readGreaterOf(clause.operativeText);
  const fixedToken = read?.fixedToken ?? null;
  const percent = read?.fraction ?? null;
  const metricName = read?.metricName ?? null;
  if (!fixedToken || percent == null || !metricName) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["greater-of fixed limb", "percent limb", "metric"], null),
      note: "Greater-of language is present. A limb could not be read from the text, so neither limb is used alone.",
    };
  }
  const metric = metricNamedIn(metricName, metrics);
  if (!metric || metric.value.type !== "MONEY") {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [metricName], null),
      note: "Greater-of metric is not bound. The fixed limb is not reported as the cap.",
    };
  }
  const statedMillions = dollarAmountIsMillions(clause.operativeText, fixedToken);
  const aligned =
    (statedMillions && metric.value.currency === "USD_MILLIONS") ||
    (!statedMillions && metric.value.currency === "USD");
  if (!aligned) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["currency alignment between the fixed-dollar limb (USD) and the metric"], null),
      note: "Fixed dollars and the metric are in different units. No scale factor was assumed.",
    };
  }
  const currency = metric.value.currency;
  const fixedAmount = Number(fixedToken);
  const p = prov(clause);
  const expression: IRExpression = {
    kind: "MAX",
    type: "MONEY",
    exprId: `cc:${clause.stableKey}:grower`,
    provenance: p,
    operands: [
      { kind: "MONEY", type: "MONEY", amount: fixedAmount, currency, exprId: `cc:${clause.stableKey}:fixed`, provenance: p },
      {
        kind: "MULTIPLY",
        type: "MONEY",
        exprId: `cc:${clause.stableKey}:pct`,
        provenance: p,
        operands: [
          { kind: "PERCENT", type: "PERCENT", value: percent, exprId: `cc:${clause.stableKey}:pct-lit`, provenance: p },
          {
            kind: "METRIC_REFERENCE",
            type: "MONEY",
            metricName: metric.metricKey,
            companyId: pkg.companyId,
            instrumentKey: pkg.instrumentKey,
            resolvedDefinitionId: null,
            exprId: `cc:${clause.stableKey}:metric`,
            provenance: p,
          },
        ],
      },
    ],
  };
  const evaluated = run(pkg, expression, metrics);
  const canonical = canonicalOf(evaluated.value);
  if (evaluated.status !== "EXECUTABLE" || !canonical) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, evaluated.missingInputs.map((m) => m.key), null),
      note: "Greater-of expression did not evaluate. No limb was substituted.",
    };
  }
  return {
    ...capShell("COMPUTED", "AMOUNT", canonical, currency, [], null),
    remainingStatus: "NEEDS_INPUT",
    missingInputs: ["ledger usage"],
    note: statedMillions
      ? "Greater-of cap from evaluateExpression. The fixed limb is written in millions, the same unit as the bound metric. Remaining usage is not bound."
      : "Greater-of cap from evaluateExpression. Remaining usage is not bound.",
  };
}

function evalRatioBasket(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
  ratios: readonly ComputedRatio[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const classified = classifyRatioIncurrencePermission(clause.operativeText);
  const ratio = ratios.find((r) => {
    const nameMatch =
      classified.ratioName != null && r.displayName.toLowerCase() === classified.ratioName.toLowerCase();
    return nameMatch || r.thresholds.some((t) => t.sectionRef === clause.sectionRef);
  });
  const missing = ["contractual dollar conversion of ratio room"];
  if (!ratio?.expression || ratio.status !== "COMPUTED" || !ratio.canonical || !classified.comparator || classified.thresholdNumerator == null || classified.thresholdDenominator == null) {
    const compared = classified.ratioName ?? "the named ratio";
    return {
      ...capShell("NEEDS_INPUT", "RATIO_TEST", null, null, [compared, ...missing], null),
      dollarRoomStatus: "NEEDS_INPUT",
      note: classified.thresholdRaw
        ? "Ratio basket has no computed contract ratio. No dollar room was inferred."
        : `No numeric threshold. The clause compares ${compared} with a figure that is not stated as a number.`,
    };
  }
  const limit = classified.thresholdNumerator / classified.thresholdDenominator;
  const operator = classified.comparator === "AT_LEAST" ? "GTE" : classified.comparator === "GREATER_THAN" ? "GT" : classified.comparator === "LESS_THAN" ? "LT" : "LTE";
  const p = prov(clause);
  const expression: IRExpression = {
    kind: "COMPARE",
    type: "BOOLEAN",
    operator,
    exprId: `cc:${clause.stableKey}:gate`,
    provenance: p,
    left: ratio.expression,
    right: { kind: "RATIO", type: "RATIO", value: limit, exprId: `cc:${clause.stableKey}:limit`, provenance: p },
  };
  const evaluated = run(pkg, expression, metrics);
  if (evaluated.status !== "EXECUTABLE" || evaluated.value?.type !== "BOOLEAN") {
    return {
      ...capShell("NEEDS_INPUT", "RATIO_TEST", null, null, missing, null),
      dollarRoomStatus: "NEEDS_INPUT",
      note: "Ratio gate did not evaluate.",
    };
  }
  return {
    ...capShell("COMPUTED", "RATIO_TEST", null, null, missing, evaluated.value.value),
    dollarRoomStatus: "NEEDS_INPUT",
    note: "Ratio test evaluated. Dollar room stays NEEDS_INPUT — the clause does not state a conversion rate.",
  };
}

function evalBuilder(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const text = norm(clause.operativeText);
  const metricNames = [...text.matchAll(/\b\d+(?:\.\d+)?\s*%\s+of\s+([A-Z][A-Za-z ]{2,60})/g)].map((m) => m[1]!.trim());
  const dollars = [...text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => m[1]!.replace(/,/g, ""));
  if (!/\bsum of\b/i.test(text) || (metricNames.length === 0 && dollars.length === 0)) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["each builder component", "prior usage"], null),
      note: "Builder named. Components are not a closed sum in the text, so no partial Available Amount is returned.",
    };
  }
  const missing = metricNames.filter((name) => !metrics.some((m) => m.metricKey.toLowerCase() === name.toLowerCase()));
  if (missing.length > 0) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [...missing, "prior usage"], null),
      note: "A builder component is unbound. The starter dollar is not presented as Available Amount.",
    };
  }
  const currencies = new Set(metricNames.map((name) => metrics.find((m) => m.metricKey.toLowerCase() === name.toLowerCase())!.value).filter((v) => v.type === "MONEY").map((v) => (v.type === "MONEY" ? v.currency : "")));
  if (dollars.length > 0) currencies.add("USD");
  if (currencies.size !== 1) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["currency alignment across builder components"], null),
      note: "Builder components are not in one currency. No partial sum is returned.",
    };
  }
  if (metricNames.some((name) => !Number.isFinite(fractionBefore(text, name)))) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["builder percent limb"], null),
      note: "A builder percent could not be read. No partial sum is returned.",
    };
  }
  const p = prov(clause);
  const operands: IRExpression[] = [
    ...dollars.map((token, i) => ({
      kind: "MONEY" as const,
      type: "MONEY" as const,
      amount: Number(token),
      currency: "USD",
      exprId: `cc:${clause.stableKey}:d${i}`,
      provenance: p,
    })),
    ...metricNames.map((name, i) => {
      const fraction = fractionBefore(text, name);
      const metric = metrics.find((m) => m.metricKey.toLowerCase() === name.toLowerCase())!;
      return {
        kind: "MULTIPLY" as const,
        type: "MONEY" as const,
        exprId: `cc:${clause.stableKey}:m${i}`,
        provenance: p,
        operands: [
          { kind: "PERCENT" as const, type: "PERCENT" as const, value: fraction, exprId: `cc:${clause.stableKey}:pf${i}`, provenance: p },
          {
            kind: "METRIC_REFERENCE" as const,
            type: "MONEY" as const,
            metricName: metric.metricKey,
            companyId: pkg.companyId,
            instrumentKey: pkg.instrumentKey,
            resolvedDefinitionId: null,
            exprId: `cc:${clause.stableKey}:ref${i}`,
            provenance: p,
          },
        ],
      };
    }),
  ];
  const expression: IRExpression = { kind: "SUM", type: "MONEY", operands, exprId: `cc:${clause.stableKey}:builder`, provenance: p };
  const evaluated = run(pkg, expression, metrics);
  const canonical = canonicalOf(evaluated.value);
  if (evaluated.status !== "EXECUTABLE" || !canonical) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["builder evaluation", "prior usage"], null),
      note: "Builder sum did not evaluate.",
    };
  }
  return {
    ...capShell("COMPUTED", "AMOUNT", canonical, "USD", ["prior usage"], null),
    remainingStatus: "NEEDS_INPUT",
    note: "Closed builder sum evaluated. Prior usage is not bound, so this is not remaining Available Amount.",
  };
}

function evalUnlimited(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const quote = explicitUnlimitedQuote(clause.operativeText);
  if (!quote) return conditionalNoCap(clause);
  const expression: IRCapacityExpression = {
    kind: "UNLIMITED_CAPACITY",
    type: "CAPACITY",
    gatedBy: null,
    provenance: prov(clause),
  };
  const evaluated = evaluateExpression({
    expression,
    inputs: fixtureInputResolver({ metrics: [...metrics] }),
    context: { companyId: pkg.companyId, instrumentKey: pkg.instrumentKey, asOf: pkg.asOf },
  });
  if (evaluated.status !== "EXECUTABLE" || evaluated.value?.type !== "CAPACITY" || evaluated.value.capacity.kind !== "UNLIMITED") {
    return { ...capShell("NEEDS_INPUT", "NONE", null, null, ["unlimited gate"], null), note: "Unlimited capacity did not evaluate." };
  }
  return {
    ...capShell("COMPUTED", "UNLIMITED", null, null, [], null),
    note: `Explicit quote: "${quote}". Unlimited is not a certified capacity grant.`,
  };
}

function soleFixedDollar(text: string): string | null {
  const normed = norm(text);
  if (/\bgreater\s+of\b/i.test(normed) || /\d+(?:\.\d+)?\s*%/.test(normed) || /\bmay be increased by\b/i.test(normed)) return null;
  const tokens = [...normed.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => m[1]!.replace(/,/g, ""));
  const distinct = [...new Set(tokens)];
  if (distinct.length !== 1) return null;
  if (distinct[0] === "1" || distinct[0] === "1.00") return null;
  const capRole =
    /\b(?:not\s+to\s+exceed|does\s+not\s+exceed|shall\s+not\s+exceed|not\s+in\s+excess\s+of|in\s+excess\s+of|in\s+a\s+maximum\s+aggregate\s+amount\s+not\s+to\s+exceed|up\s+to\s+an\s+aggregate\s+amount\s+of)\b/i.test(
      normed,
    ) ||
    /\bDollars\s*\(\s*\$\s*[\d,]+\.\d{2}/i.test(normed) ||
    /\bexceeds\s+\$\s*[\d,]+(?:\.\d+)?\s+million\b/i.test(normed);
  return capRole ? distinct[0]! : null;
}

function evalPercentOfMetric(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const text = norm(clause.operativeText);
  const read = percentOfPhrase(text);
  const pct = read?.pct;
  const metricName = read?.base ?? "";
  if (!pct || !metricName) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["percent limb", "metric"], null),
      note: "A percent is present. The base it applies to could not be read, so no product was returned.",
    };
  }
  const metric = metricNamedIn(metricName, metrics);
  if (!metric || metric.value.type !== "MONEY") {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [metricName], null),
      note: `Percent of ${metricName} is not a bound metric. No other base was substituted.`,
    };
  }
  const p = prov(clause);
  const expression: IRExpression = {
    kind: "MULTIPLY",
    type: "MONEY",
    exprId: `cc:${clause.stableKey}:pct-metric`,
    provenance: p,
    operands: [
      { kind: "PERCENT", type: "PERCENT", value: Number(pct) / 100, exprId: `cc:${clause.stableKey}:pct-lit`, provenance: p },
      {
        kind: "METRIC_REFERENCE",
        type: "MONEY",
        metricName: metric.metricKey,
        companyId: pkg.companyId,
        instrumentKey: pkg.instrumentKey,
        resolvedDefinitionId: null,
        exprId: `cc:${clause.stableKey}:metric`,
        provenance: p,
      },
    ],
  };
  const evaluated = run(pkg, expression, metrics);
  const canonical = canonicalOf(evaluated.value);
  if (evaluated.status !== "EXECUTABLE" || !canonical) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [metricName], null),
      note: "Percent-of-metric expression did not evaluate.",
    };
  }
  return {
    ...capShell("COMPUTED", "AMOUNT", canonical, metric.value.currency, [], null),
    remainingStatus: "NEEDS_INPUT",
    missingInputs: ["ledger usage"],
    note: "Percent of a bound metric from evaluateExpression. Remaining usage is not bound.",
  };
}

function metricNamedIn(phrase: string, metrics: readonly MetricInput[]): MetricInput | undefined {
  const exact = metrics.find((item) => item.metricKey.toLowerCase() === phrase.toLowerCase());
  if (exact) return exact;
  const lead = phrase.replace(/^(?:the\s+)?/i, "");
  const contained = metrics
    .filter((item) => item.value.type === "MONEY")
    .filter((item) => new RegExp(`^${item.metricKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lead))
    .sort((a, b) => b.metricKey.length - a.metricKey.length);
  return contained[0];
}

function evalStatedPeriod(
  clause: BasketClause,
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const period = statedPeriod(clause.operativeText);
  if (!period) {
    return { ...capShell("NEEDS_INPUT", "NONE", null, null, ["day count"], null), note: "A deadline is indicated. The day count could not be read." };
  }
  return {
    ...capShell("COMPUTED", "NONE", period.count, period.unit, [], null),
    remainingStatus: "NEEDS_INPUT",
    note: "Stated deadline. Whether it has been met is not computed.",
  };
}

function evalStatedPercent(
  clause: BasketClause,
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const pct = statedPercent(norm(clause.operativeText));
  if (!pct) {
    return { ...capShell("NEEDS_INPUT", "NONE", null, null, ["percent"], null), note: "A percent is indicated. The figure could not be read." };
  }
  return {
    ...capShell("COMPUTED", "NONE", toCanonicalString(rationalFromString(pct)), "PERCENT", [], null),
    remainingStatus: "NEEDS_INPUT",
    note: "Stated percent threshold. The measured base is not a bound dollar metric.",
  };
}

function conditionalNoCap(
  clause: BasketClause,
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  return {
    ...capShell("NEEDS_INPUT", "NONE", null, null, ["stated dollar or ratio cap"], null),
    note:
      clause.role === "CONDITION"
        ? "No numeric cap. This condition does not grant dollar capacity, and it is not unlimited."
        : "No numeric cap. The clause is limited to its stated purpose or conditions. Absence of a cap is not unlimited capacity.",
  };
}

function numericButOpen(
  clause: BasketClause,
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const text = norm(clause.operativeText);
  const missing = /\$\s*[\d,]+/.test(text) ? ["single cap-role dollar"] : ["closed-form cap"];
  return {
    ...capShell("NEEDS_INPUT", "NONE", null, null, missing, null),
    note: "A number appears in the clause but it is not a single closed-form cap. No amount was inferred.",
  };
}

function present(
  clause: BasketClause,
  row: Omit<ComputedBasket, "scope" | "capFormula">,
): ComputedBasket {
  return { ...row, scope: scopeOf(clause), capFormula: capFormulaOf(row.category, clause.operativeText) };
}

export function scopeOf(clause: BasketClause): BasketScope {
  const hay = `${clause.sectionRef}\n${clause.operativeText}`;
  if (/Non-Guarantor|non-guarantor proviso/i.test(clause.sectionRef)) return "PURPOSE_SPECIFIC";
  if (
    /not otherwise permitted|other Restricted Payments\b|Available Restricted Payments Amount/i.test(hay) ||
    /§4\.09\(a\)$/.test(clause.sectionRef) ||
    /Investments pursuant to this clause \(17\)/i.test(clause.operativeText)
  ) {
    return "GENERAL";
  }
  return "PURPOSE_SPECIFIC";
}

function capFormulaOf(category: BasketCategory, text: string): string | null {
  const t = norm(text);
  if (category === "GROWER_GREATER_OF") {
    const match = t.match(
      /greater of\s+\([A-Za-z0-9]+\)\s+\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?\s+and\s+\([A-Za-z0-9]+\)\s+\d+(?:\.\d+)?%\s+of\s+(?:the\s+)?(?:[A-Z][A-Za-z0-9]+)(?:\s+[A-Z][A-Za-z0-9]+){0,8}/,
    );
    return match?.[0] ?? "greater of fixed dollar and percent of metric";
  }
  if (category === "FIXED_DOLLAR") {
    const match = t.match(/\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?/);
    return match?.[0]?.replace(/\s+/g, " ") ?? null;
  }
  if (category === "PCT_OF_METRIC") {
    const read = percentOfPhrase(t);
    return read ? `${read.pct}% of ${read.base}` : null;
  }
  if (category === "RATIO_BASED") {
    const classified = classifyRatioIncurrencePermission(t);
    if (classified.ratioName && classified.thresholdRaw) return `${classified.ratioName} ${classified.thresholdRaw}`;
    return classified.ratioName;
  }
  if (category === "BUILDER_AVAILABLE_AMOUNT") return "sum of stated builder components";
  if (category === "UNLIMITED") return explicitUnlimitedQuote(t);
  if (category === "STATED_PERIOD") {
    const period = statedPeriod(t);
    if (!period) return null;
    if (period.unit === "BUSINESS_DAYS") return period.count === "1" ? "1 Business Day" : `${period.count} Business Days`;
    if (period.unit === "MONTHS") return `${period.count} months`;
    return `${period.count} days`;
  }
  if (category === "STATED_PERCENT") {
    const pct = statedPercent(t);
    return pct ? `${pct}%` : null;
  }
  return null;
}

export function basketDisposition(basket: ComputedBasket): "COMPUTED" | "NO_NUMERIC_CAP_CONDITIONAL" | "NEEDS_INPUT" | "UNKNOWN" {
  if (basket.category === "NO_NUMERIC_CAP_CONDITIONAL") return "NO_NUMERIC_CAP_CONDITIONAL";
  if (basket.capKind === "UNLIMITED" && explicitUnlimitedQuote(basket.citationExcerpt) == null) return "NEEDS_INPUT";
  if (basket.category === "RECLASS") return "NEEDS_INPUT";
  if (basket.capStatus === "COMPUTED") return "COMPUTED";
  if (basket.capStatus === "UNKNOWN") return "UNKNOWN";
  return "NEEDS_INPUT";
}

function capShell(
  capStatus: ComputationStatus,
  capKind: ComputedBasket["capKind"],
  capCanonical: string | null,
  capCurrency: string | null,
  missingInputs: string[],
  gateOpen: boolean | null,
): Pick<ComputedBasket, "capStatus" | "capCanonical" | "capCurrency" | "capKind" | "dollarRoomStatus" | "remainingStatus" | "missingInputs" | "gateOpen" | "reasons" | "note"> {
  return {
    capStatus,
    capCanonical,
    capCurrency,
    capKind,
    dollarRoomStatus: capKind === "AMOUNT" ? capStatus : "NEEDS_INPUT",
    remainingStatus: "NEEDS_INPUT",
    missingInputs,
    gateOpen,
    reasons: [],
    note: "",
  };
}

function basket(
  clause: BasketClause,
  category: BasketCategory,
  capKind: ComputedBasket["capKind"],
  capStatus: ComputationStatus,
  capCanonical: string | null,
  capCurrency: string | null,
  missing: string[],
  note: string,
): ComputedBasket {
  return {
    stableKey: clause.stableKey,
    sectionRef: clause.sectionRef,
    covenantFamily: clause.covenantFamily,
    sourceDocumentId: clause.documentId,
    citationExcerpt: clause.operativeText,
    category,
    formulaKind: category === "UNKNOWN" ? null : formulaLabel(FORMULA_BY_CATEGORY[category]),
    certification: CERTIFICATION,
    scope: scopeOf(clause),
    capFormula: capFormulaOf(category, clause.operativeText),
    ...capShell(capStatus, capKind, capCanonical, capCurrency, missing, null),
    note,
  };
}

function run(pkg: ComputationPackage, expression: IRExpression, metrics: readonly MetricInput[]) {
  return evaluateExpression({
    expression,
    inputs: fixtureInputResolver({ metrics: [...metrics] }),
    context: { companyId: pkg.companyId, instrumentKey: pkg.instrumentKey, asOf: pkg.asOf },
  });
}

function prov(clause: BasketClause): SourceProvenance {
  return {
    documentId: clause.documentId,
    sourceNodeKey: null,
    sourceCitation: clause.sectionRef,
    excerpt: norm(clause.operativeText).slice(0, 400),
  };
}

function formulaLabel(kind: FormulaKind): string {
  return FORMULA_TAXONOMY.find((entry) => entry.formulaKind === kind)?.formulaKind ?? kind;
}

/** The dollar and percent written in "greater of $X and Y% of <Defined Term>". No size cutoff. */
function readGreaterOf(text: string): { fixedToken: string; fraction: number; metricName: string } | null {
  const src = norm(text);
  if (!/\bgreater\s+of\b/i.test(src)) return null;
  const marked = src.match(
    /[Gg]reater\s+of\s+\(\s*[A-Za-z0-9]+\s*\)\s+\$\s*([\d,]+(?:\.\d+)?)(?:\s+[Mm]illion)?\s+and\s+\(\s*[A-Za-z0-9]+\s*\)\s+(\d+(?:\.\d+)?)\s*%\s+of\s+(?:[Tt]he\s+)?((?:[A-Z][A-Za-z0-9]+)(?:\s+[A-Z][A-Za-z0-9]+){0,8})/,
  );
  if (marked?.[1] && marked[2] && marked[3]) {
    return { fixedToken: marked[1].replace(/,/g, ""), fraction: Number(marked[2]) / 100, metricName: marked[3].replace(/\s+/g, " ").trim() };
  }
  return parseEbitdaGrower(src);
}

function parseEbitdaGrower(text: string): { fixedToken: string; fraction: number; metricName: string } | null {
  const m = norm(text).match(
    /\$\s*([\d,]+(?:\.\d+)?)[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?([A-Za-z][A-Za-z0-9][A-Za-z0-9 ]{1,48}?)(?=\s*(?:$|[,;.]|\bprovided\b|\bas\b|\bimmediately\b|\bfor\b|\bin\b))/i,
  );
  if (!m?.[1] || !m[2] || !m[3]) return null;
  return { fixedToken: m[1].replace(/,/g, ""), fraction: Number(m[2]) / 100, metricName: m[3].replace(/\s+/g, " ").trim() };
}

function fractionBefore(text: string, metricName: string): number {
  const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%\\s+of\\s+${escaped}`, "i"));
  return m?.[1] ? Number(m[1]) / 100 : Number.NaN;
}
