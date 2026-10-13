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
import { classifyFixedDollarBasket } from "../compiler/fixed-dollar-basket/classify";
import { classifyGreaterOfAssetsBasket } from "../compiler/greater-of-assets-basket/classify";
import { classifyRatioIncurrencePermission } from "../compiler/ratio-incurrence/classify";
import type { IRCapacityExpression, IRExpression, SourceProvenance } from "../ir/types";
import { fixtureInputResolver } from "../runtime/input-resolver";
import { evaluateExpression } from "../runtime/evaluate-expression";
import type { MetricInput } from "../runtime/types";
import type { BasketCategory, BasketClause, ComputationPackage, ComputationStatus, ComputedBasket, ComputedRatio } from "./types";
import { CERTIFICATION } from "./types";
import { canonicalOf } from "./ratios";
import { dollarToken, norm } from "./text";

const FORMULA_BY_CATEGORY: Record<Exclude<BasketCategory, "UNKNOWN">, FormulaKind> = {
  FIXED_DOLLAR: "FIXED_DOLLAR_CEILING",
  GROWER_GREATER_OF: "GREATER_OF_FIXED_OR_PCT_METRIC",
  RATIO_BASED: "RATIO_INCURRENCE_ROOM",
  BUILDER_AVAILABLE_AMOUNT: "BUILDER_SUM_COMPONENTS",
  UNLIMITED: "UNLIMITED_SUBJECT_TO_GATE",
  RECLASS: "REALLOCATION_TRANSFER",
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

  if (category === "FIXED_DOLLAR") return { ...base, ...evalFixed(pkg, clause, metrics) };
  if (category === "GROWER_GREATER_OF") return { ...base, ...evalGrower(pkg, clause, metrics) };
  if (category === "RATIO_BASED") return { ...base, ...evalRatioBasket(pkg, clause, metrics, ratios) };
  if (category === "BUILDER_AVAILABLE_AMOUNT") return { ...base, ...evalBuilder(pkg, clause, metrics) };
  if (category === "UNLIMITED") return { ...base, ...evalUnlimited(pkg, clause, metrics) };
  if (category === "RECLASS") {
    return {
      ...base,
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["source basket unused", "reclassification election"], null),
      note: "Reclassification is named. No election record is bound, so no amount is transferred.",
    };
  }
  return {
    ...base,
    ...capShell("UNKNOWN", "NONE", null, null, [], null),
    note: "No typed cap category is supported by the operative text.",
  };
}

export function categorize(operativeText: string): BasketCategory {
  const text = norm(operativeText);
  if (/\breclassif/i.test(text)) return "RECLASS";
  if (
    /\b(available amount|builder basket|cumulative credit)\b/i.test(text) ||
    (/\bsum of\b/i.test(text) && /\d+(?:\.\d+)?\s*%\s+of\b/i.test(text))
  ) {
    return "BUILDER_AVAILABLE_AMOUNT";
  }
  if (/\bgreater\s+of\b/i.test(text)) return "GROWER_GREATER_OF";
  const ratio = classifyRatioIncurrencePermission(text);
  if (ratio.class !== "NOT_RATIO_INCURRENCE") return "RATIO_BASED";
  const unlimited = /\b(unlimited|without limitation)\b/i.test(text);
  const fixed = classifyFixedDollarBasket(text);
  const dollarCap = fixed.class !== "NOT_FIXED_DOLLAR";
  if (unlimited && (dollarCap || /\$\s?[\d,]+/.test(text))) return "UNKNOWN";
  if (unlimited) return "UNLIMITED";
  if (dollarCap) return "FIXED_DOLLAR";
  return "UNKNOWN";
}

function evalFixed(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification"> {
  const fixed = classifyFixedDollarBasket(clause.operativeText);
  const token = fixed.amountRaw ? dollarToken(fixed.amountRaw) : null;
  if (!token || fixed.class === "NOT_FIXED_DOLLAR") {
    return { ...capShell("NEEDS_INPUT", "NONE", null, null, ["fixed-dollar cap token"], null), note: "Classifier did not yield a single cap-role dollar." };
  }
  const expression: IRExpression = {
    kind: "MONEY",
    type: "MONEY",
    amount: Number(token),
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
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification"> {
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
  if (metric.value.currency !== "USD") {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["currency alignment between the fixed-dollar limb (USD) and the metric"], null),
      note: "Fixed dollars and the metric are in different units. No scale factor was assumed.",
    };
  }
  const p = prov(clause);
  const expression: IRExpression = {
    kind: "MAX",
    type: "MONEY",
    exprId: `cc:${clause.stableKey}:grower`,
    provenance: p,
    operands: [
      { kind: "MONEY", type: "MONEY", amount: Number(fixedToken), currency: "USD", exprId: `cc:${clause.stableKey}:fixed`, provenance: p },
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
    ...capShell("COMPUTED", "AMOUNT", canonical, "USD", [], null),
    remainingStatus: "NEEDS_INPUT",
    missingInputs: ["ledger usage"],
    note: "Greater-of cap from evaluateExpression. Remaining usage is not bound.",
  };
}

function evalRatioBasket(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
  ratios: readonly ComputedRatio[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification"> {
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
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification"> {
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
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification"> {
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
