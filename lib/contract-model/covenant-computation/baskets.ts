/**
 * Typed basket classification and cap evaluation.
 *
 * Classification reuses the compiler classifiers and the basket-formula
 * taxonomy. Cap numbers come only from evaluateExpression. Unknown ledger
 * usage is never treated as zero. A ratio test is not converted to dollars
 * unless the clause states that conversion (it does not, here).
 */

import { FORMULA_TAXONOMY } from "@/lib/basket-formula-corpus";
import type { FormulaKind } from "@/lib/basket-formula-corpus";
import { applyCategoryHints } from "@/lib/covenant-learning-factory/learned-rules/apply";
import type { LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
import { classifyFixedDollarBasket } from "../compiler/fixed-dollar-basket/classify";
import { classifyGreaterOfAssetsBasket } from "../compiler/greater-of-assets-basket/classify";
import { classifyRatioIncurrencePermission } from "../compiler/ratio-incurrence/classify";
import type { IRCapacityExpression, IRExpression, SourceProvenance } from "../ir/types";
import { fixtureInputResolver } from "../runtime/input-resolver";
import { evaluateExpression } from "../runtime/evaluate-expression";
import type { MetricInput } from "../runtime/types";
import type { BasketCategory, BasketClause, BasketScope, ComputationPackage, ComputationStatus, ComputedBasket, ComputedRatio } from "./types";
import { CERTIFICATION } from "./types";
import { canonicalOf } from "./ratios";
import { dollarAmountIsMillions, dollarToken, millionsToUsd, norm } from "./text";

const FORMULA_BY_CATEGORY: Record<Exclude<BasketCategory, "UNKNOWN">, FormulaKind> = {
  FIXED_DOLLAR: "FIXED_DOLLAR_CEILING",
  GROWER_GREATER_OF: "GREATER_OF_FIXED_OR_PCT_METRIC",
  PCT_OF_METRIC: "PCT_OF_METRIC_ONLY",
  RATIO_BASED: "RATIO_INCURRENCE_ROOM",
  BUILDER_AVAILABLE_AMOUNT: "BUILDER_SUM_COMPONENTS",
  UNLIMITED: "UNLIMITED_SUBJECT_TO_GATE",
  UNLIMITED_BY_PURPOSE: "UNLIMITED_SUBJECT_TO_GATE",
  CONDITIONS_LIMITED: "OTHER_SOURCE_STATED",
  RECLASS: "REALLOCATION_TRANSFER",
};

export function evaluateBaskets(
  pkg: ComputationPackage,
  metrics: readonly MetricInput[],
  ratios: readonly ComputedRatio[],
  rules?: LearnedRuleSet,
): ComputedBasket[] {
  return pkg.baskets.map((clause) => evaluateBasket(pkg, clause, metrics, ratios, rules));
}

export function evaluateBasket(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
  ratios: readonly ComputedRatio[],
  rules?: LearnedRuleSet,
): ComputedBasket {
  const doc = pkg.documents.find((d) => d.documentId === clause.documentId);
  if (!doc || !norm(doc.text).includes(norm(clause.operativeText))) {
    return basket(clause, "UNKNOWN", "NONE", "UNKNOWN", null, null, ["operative text is not a substring of the cited document"], "Citation does not bind to the cited document.");
  }

  const category = categorize(clause.operativeText, rules);
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
                : category === "UNLIMITED_BY_PURPOSE"
                  ? purposeUnlimited(clause)
                  : category === "CONDITIONS_LIMITED"
                    ? conditionsLimited(clause)
                  : category === "RECLASS"
                    ? {
                        ...capShell("NEEDS_INPUT", "NONE", null, null, ["source basket unused", "reclassification election"], null),
                        note: "Reclassification is named. No election record is bound, so no amount is transferred.",
                      }
                    : numericButOpen(clause);
  return present(clause, { ...base, ...partial });
}

export function categorize(operativeText: string, rules?: LearnedRuleSet): BasketCategory {
  const text = norm(operativeText);
  // Learned rules win over the generic engine heuristics — they are the
  // factory's lessons. Hand-written per-case branches must not be added here.
  const ul = unlimitedCapacityMatch(text);
  // "in an unlimited amount if, after giving effect thereto, [ratio test]" is a ratio permission with its condition.
  if (ul.kind === "CONDITIONAL") return "RATIO_BASED";
  const hinted = applyCategoryHints(text, rules);
  // A learned hint may not grant UNLIMITED unless the text is an unconditional grant.
  if (hinted && !(hinted.category === "UNLIMITED" && ul.kind !== "UNCONDITIONAL")) return hinted.category;
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
  const unlimited = isCapacityUnlimited(text);
  const dollarCap = soleFixedDollar(text) != null;
  if (unlimited && (dollarCap || /\$\s?[\d,]+/.test(text) || /\d+(?:\.\d+)?\s*%/.test(text))) return "UNKNOWN";
  if (unlimited) return "UNLIMITED";
  if (dollarCap) return "FIXED_DOLLAR";
  // A split greater-of prong is only the dollar limb: "(a) $800.0 million and" or "(i) $86,000,000".
  if (/^\([^)]{1,8}\)\s+\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?(?:\s+and)?\s*$/i.test(text)) return "FIXED_DOLLAR";
  // Holder votes, original-issue fractions, equity-control tests, and schedule
  // disclosure floors are numbers, not capacity caps.
  // Owner rule: never unlimited by default. Without explicit unlimited language (handled above) a clause with no
  // capacity number is CONDITIONS_LIMITED (computed as NEEDS_INPUT), not unlimited.
  if (isNonCapacityNumber(text)) return "CONDITIONS_LIMITED";
  if (numeric) return "UNKNOWN";
  return "CONDITIONS_LIMITED";
}

function isNonCapacityNumber(text: string): boolean {
  if (/\b(?:not\s+to\s+exceed|shall\s+not\s+exceed|does\s+not\s+exceed|greater\s+of)\b/i.test(text)) return false;
  if (/%\s+of\s+(?:the\s+)?(?:consolidated\s+)?(?:total\s+)?(?:assets|ebitda|net\s+income|revenues?)/i.test(text)) return false;
  const dollars = [...text.matchAll(/\$\s*[\d,]+(?:\.\d+)?/g)];
  const percents = [...text.matchAll(/\d+(?:\.\d+)?\s*%/g)];
  if (dollars.length >= 1 && percents.length === 0) {
    if (dollars.length === 1 && /in excess of \$\s*[\d,]+(?:\.\d+)?[^.]{0,120}\b(?:described|listed|set forth) on Schedule\b/i.test(text)) {
      return true;
    }
    // Minimum denomination ("principal amount of $2,000 or less", "integral multiples of $1,000").
    return dollars.every((match) => {
      const at = match.index ?? 0;
      const window = text.slice(Math.max(0, at - 80), Math.min(text.length, at + match[0].length + 48));
      return /integral multiples? of|principal amount of \$\s*[\d,]+(?:\.\d+)? or less|shall be in a principal amount of/i.test(window);
    });
  }
  if (dollars.length > 0 || percents.length === 0) return false;
  return percents.every((match) => {
    const at = match.index ?? 0;
    const window = text.slice(Math.max(0, at - 90), Math.min(text.length, at + match[0].length + 140));
    return (
      /holders?\s+of\s+(?:at least|not less than|a majority)/i.test(window) ||
      /original aggregate principal amount/i.test(window) ||
      /\d+(?:\.\d+)?\s*%\s+or more of (?:its |the )?(?:equity|voting|capital stock)/i.test(window)
    );
  });
}

/**
 * Explicit unlimited CAPACITY only. Keyword hits are not enough: "unlimited liability company", "including
 * (without limitation)", "without limitation of the foregoing" and "including but without limitation" are idioms,
 * not capacity grants. Only amount phrasing counts.
 */
export const UNLIMITED_CAPACITY_PHRASE =
  /\bin\s+(?:an?\s+)?unlimited\s+(?:aggregate\s+)?(?:principal\s+)?amounts?\b|\bunlimited\s+in\s+(?:aggregate\s+)?amount\b|\bwithout\s+limit(?:ation)?\s+as\s+to\s+(?:the\s+)?(?:aggregate\s+)?(?:principal\s+)?amount\b|\bwithout\s+(?:any\s+)?(?:dollar|monetary|numerical)\s+(?:limit|cap)\b/i;
const RATIO_CONDITION = /\b(?:ratio|coverage|leverage)\b|\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.0+)?\b|\btimes\b/i;
/** Unlimited phrasing gated by a condition ("in an unlimited amount if, after giving effect thereto, [ratio]"). */
const UNLIMITED_CONDITION = /^[^.;]{0,40}?\b(?:if|so\s+long\s+as|provided\s+that|subject\s+to|to\s+the\s+extent|after\s+giving\s+(?:pro\s+forma\s+)?effect)\b/i;
/** Negated unlimited ("nothing herein shall permit ... in an unlimited amount", "shall not ... unlimited"). */
const UNLIMITED_NEGATION = /\b(?:nothing\s+(?:herein|in\s+this\s+\w+|contained\s+herein)[^.;]{0,160}?\b(?:shall|will|may)\s+(?:be\s+(?:deemed|construed)\s+to\s+)?(?:permit|allow|authorize)|(?:shall|will|may)\s+not\b|\bno\b)[^.;]{0,160}$/i;

export function unlimitedCapacityMatch(text: string): { kind: "NONE" | "UNCONDITIONAL" | "CONDITIONAL" | "NEGATED" } {
  const m = UNLIMITED_CAPACITY_PHRASE.exec(text);
  if (!m) return { kind: "NONE" };
  const before = text.slice(Math.max(0, m.index - 240), m.index);
  if (UNLIMITED_NEGATION.test(before)) return { kind: "NEGATED" };
  // Only a financial-test condition turns the grant into a ratio permission; "so long as no Default exists" does not.
  const after = text.slice(m.index + m[0].length);
  if (UNLIMITED_CONDITION.test(after) && RATIO_CONDITION.test(after)) return { kind: "CONDITIONAL" };
  return { kind: "UNCONDITIONAL" };
}

/** True only for an unconditional, non-negated capacity grant. */
export function isCapacityUnlimited(text: string): boolean {
  return unlimitedCapacityMatch(text).kind === "UNCONDITIONAL";
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
  return /(?:\d+(?:\.\d+)?\s*%|[a-z]+\s+percent\s*\(\s*\d+(?:\.\d+)?\s*%\s*\))\s+of\b/i.test(text);
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
  const assets = classifyGreaterOfAssetsBasket(clause.operativeText);
  const ebitda = parseEbitdaGrower(clause.operativeText);
  const fixedToken = assets.class !== "NOT_GREATER_OF_ASSETS"
    ? dollarMatching(clause.operativeText, assets.fixedAmountUsd)
    : ebitda?.fixedToken ?? null;
  const percent = assets.class !== "NOT_GREATER_OF_ASSETS" ? assets.percentFraction : ebitda?.fraction ?? null;
  const metricName = assets.class !== "NOT_GREATER_OF_ASSETS" ? assets.metricName : ebitda?.metricName ?? null;
  if (!fixedToken || percent == null || !metricName) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["greater-of fixed limb", "percent limb", "metric"], null),
      note: "Greater-of language is present. A limb could not be read from the text, so neither limb is used alone.",
    };
  }
  const metric = metrics.find((m) => m.metricKey.toLowerCase() === metricName.toLowerCase());
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
    return {
      ...capShell("NEEDS_INPUT", "RATIO_TEST", null, null, ["contract ratio definition", ...missing], null),
      dollarRoomStatus: "NEEDS_INPUT",
      note: "Ratio basket has no computed contract ratio. No dollar room was inferred.",
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
    note: "No dollar ceiling in the clause. Unlimited is not a certified capacity grant.",
  };
}

function soleFixedDollar(text: string): string | null {
  const normed = norm(text);
  if (/\bgreater\s+of\b/i.test(normed) || /\d+(?:\.\d+)?\s*%/.test(normed) || /\bmay be increased by\b/i.test(normed)) return null;
  // A dollar figure inside arithmetic ("the quotient of $550 million divided by the rate") is an operand, not the cap.
  if (/\b(?:quotient|divided\s+by|multiplied\s+by|product\s+of)\b/i.test(normed)) return null;
  const tokens = [...normed.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => m[1]!.replace(/,/g, ""));
  const distinct = [...new Set(tokens)];
  if (distinct.length !== 1) return null;
  const capRole =
    /\b(?:not\s+to\s+exceed|does\s+not\s+exceed|shall\s+not\s+exceed|not\s+in\s+excess\s+of|in\s+a\s+maximum\s+aggregate\s+amount\s+not\s+to\s+exceed|up\s+to\s+an\s+aggregate\s+amount\s+of)\b/i.test(
      normed,
    ) ||
    /\bDollars\s*\(\s*\$\s*[\d,]+\.\d{2}/i.test(normed) ||
    // "shall not at any one time exceed $X", "do not ... in excess of $X": a negated ceiling directly on the one dollar figure.
    /\b(?:shall|will|does|do|to)\s+not\s+(?:[\w’',]+\s+){0,6}?exceed\s+\$\s*[\d,]+/i.test(normed) ||
    /\bnot\s+(?:[\w’',]+\s+){0,16}?in\s+excess\s+of\s+\$\s*[\d,]+/i.test(normed) ||
    /\bexceeds\s+\$\s*[\d,]+(?:\.\d+)?\s+million\b/i.test(normed);
  return capRole ? distinct[0]! : null;
}

function evalPercentOfMetric(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const text = norm(clause.operativeText);
  const match = text.match(
    /(?:(\d+(?:\.\d+)?)\s*%|percent\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\))\s+of\s+(?:the\s+)?([^.;]{3,180})/i,
  );
  const pct = match?.[1] ?? match?.[2];
  const metricName = (match?.[3] ?? "").split(/\bprovided\b/i)[0]!.trim().replace(/[,:]$/, "");
  if (!pct || !metricName) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["percent limb", "metric"], null),
      note: "A percent is present. The base it applies to could not be read, so no product was returned.",
    };
  }
  const metric = metrics.find((item) => item.metricKey.toLowerCase() === metricName.toLowerCase());
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

function purposeUnlimited(
  clause: BasketClause,
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  // A learned-rule hint alone is not explicit text: only "unlimited"/"without limitation" keeps an UNLIMITED kind.
  if (!isCapacityUnlimited(norm(clause.operativeText))) return conditionsLimited(clause);
  return {
    ...capShell("NEEDS_INPUT", "UNLIMITED", null, null, [], null),
    note:
      clause.role === "CONDITION"
        ? "No numeric cap. This condition does not grant a dollar capacity."
        : "No numeric cap. The permission is limited to the purpose stated in the clause. No dollar capacity was inferred.",
  };
}

function conditionsLimited(
  clause: BasketClause,
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  return {
    ...capShell("NEEDS_INPUT", "NONE", null, null, ["no cap stated in clause"], null),
    note:
      clause.role === "CONDITION"
        ? "No numeric cap. This condition does not grant a dollar capacity. Not treated as unlimited."
        : "No numeric cap and no explicit unlimited language. Limited by the clause's conditions; never unlimited by default.",
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
      /greater of\s+\([a-z0-9]+\)\s+\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?\s+and\s+\([a-z0-9]+\)\s+\d+(?:\.\d+)?%\s+of\s+(?:the\s+)?(?:Total Assets|Consolidated Total Assets|Total Consolidated Assets|(?:Consolidated\s+)?EBITDA)/i,
    );
    return match?.[0] ?? "greater of fixed dollar and percent of metric";
  }
  if (category === "FIXED_DOLLAR") {
    const match = t.match(/\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?/);
    return match?.[0]?.replace(/\s+/g, " ") ?? null;
  }
  if (category === "PCT_OF_METRIC") {
    const match = t.match(/(?:\d+(?:\.\d+)?\s*%|[a-z]+\s+percent\s*\([^)]+\))\s+of\s+(?:the\s+)?[^.;]{3,100}/i);
    return match?.[0] ?? null;
  }
  if (category === "RATIO_BASED") {
    const classified = classifyRatioIncurrencePermission(t);
    if (classified.ratioName && classified.thresholdRaw) return `${classified.ratioName} ${classified.thresholdRaw}`;
    return classified.ratioName;
  }
  if (category === "BUILDER_AVAILABLE_AMOUNT") return "sum of stated builder components";
  return null;
}

export function basketDisposition(basket: ComputedBasket): "COMPUTED" | "UNLIMITED_BY_PURPOSE" | "NEEDS_INPUT" | "UNKNOWN" {
  if (basket.category === "UNLIMITED_BY_PURPOSE") return "UNLIMITED_BY_PURPOSE";
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

function parseEbitdaGrower(text: string): { fixedToken: string; fraction: number; metricName: string } | null {
  const m = norm(text).match(/\$\s*([\d,]+(?:\.\d+)?)[\s\S]{0,80}?(\d+(?:\.\d+)?)\s*%\s+of\s+((?:Consolidated\s+)?EBITDA)\b/i);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  return { fixedToken: m[1].replace(/,/g, ""), fraction: Number(m[2]) / 100, metricName: m[3].replace(/\s+/g, " ") };
}

function dollarMatching(text: string, amount: number | null): string | null {
  if (amount == null) return null;
  const tokens = [...norm(text).matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => m[1]!.replace(/,/g, ""));
  return tokens.find((token) => Number(token) === amount) ?? null;
}

function fractionBefore(text: string, metricName: string): number {
  const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%\\s+of\\s+${escaped}`, "i"));
  return m?.[1] ? Number(m[1]) / 100 : Number.NaN;
}
