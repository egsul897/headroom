/**
 * Typed basket classification and cap evaluation.
 *
 * Classification reuses the compiler classifiers and the basket-formula
 * taxonomy. Cap numbers come only from evaluateExpression. Unknown ledger
 * usage is never treated as zero. A ratio test is not converted to dollars
 * unless the clause states that conversion (it does not, here).
 */

import { xbrlInUnit } from "@/lib/covenant-learning-factory/xbrl/bind";
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
import { canonicalOf, namesEqual } from "./ratios";
import { clauseRatioTerm, clauseRatioThreshold } from "./ratio-terms";
export { clauseRatioTerm, clauseRatioThreshold } from "./ratio-terms";
import { dollarAmountIsMillions, dollarToken, millionsToUsd, norm } from "./text";
import { splitSiblingClauses } from "./sibling-split";

const FORMULA_BY_CATEGORY: Record<Exclude<BasketCategory, "UNKNOWN">, FormulaKind> = {
  FIXED_DOLLAR: "FIXED_DOLLAR_CEILING",
  GROWER_GREATER_OF: "GREATER_OF_FIXED_OR_PCT_METRIC",
  PCT_OF_METRIC: "PCT_OF_METRIC_ONLY",
  MULTIPLE_OF_METRIC: "MULTIPLE_OF_METRIC",
  LESSER_OF: "LESSER_OF_FIXED_AND_MULTIPLE",
  RATIO_BASED: "RATIO_INCURRENCE_ROOM",
  BUILDER_AVAILABLE_AMOUNT: "BUILDER_SUM_COMPONENTS",
  UNLIMITED: "UNLIMITED_SUBJECT_TO_GATE",
  UNLIMITED_BY_PURPOSE: "UNLIMITED_SUBJECT_TO_GATE",
  CONDITIONS_LIMITED: "OTHER_SOURCE_STATED",
  FORMULA_AMOUNT: "OTHER_SOURCE_STATED",
  RECLASS: "REALLOCATION_TRANSFER",
  MAINTENANCE_LIMIT: "OTHER_SOURCE_STATED",
};

export function evaluateBaskets(
  pkg: ComputationPackage,
  metrics: readonly MetricInput[],
  ratios: readonly ComputedRatio[],
  rules?: LearnedRuleSet,
): ComputedBasket[] {
  return pkg.baskets.flatMap((clause) => {
    // A span carrying several sibling clauses is evaluated clause by clause, so no clause takes a neighbour's figure.
    const parts = splitSiblingClauses(clause.operativeText);
    if (!parts) return [evaluateBasket(pkg, clause, metrics, ratios, rules)];
    const others = pkg.baskets.filter((b) => b !== clause).map((b) => norm(b.operativeText));
    const relabel = (ref: string, label: string) => (/\([^()]{1,6}\)\s*$/.test(ref) ? ref.replace(/\([^()]{1,6}\)\s*$/, label) : `${ref}${label}`);
    const slug = (label: string) => label.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return parts
      // A later sibling that already has its own basket clause is not evaluated twice.
      .filter((p, k) => k === 0 || !others.some((o) => o.startsWith(norm(p.text).slice(0, 60)) || norm(p.text).startsWith(o.slice(0, 60))))
      .map((p, k) => evaluateBasket(pkg, k === 0
        ? { ...clause, operativeText: p.text }
        : { ...clause, operativeText: p.text, stableKey: `${clause.stableKey}-sib-${slug(p.label)}`, sectionRef: relabel(clause.sectionRef, p.label) }, metrics, ratios, rules));
  });
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
        : category === "LESSER_OF"
          ? evalLesserCombined(pkg, clause, metrics)
          : category === "MULTIPLE_OF_METRIC"
            ? evalMultiple(pkg, clause, metrics)
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
                  : category === "FORMULA_AMOUNT"
                    ? {
                        ...capShell("NEEDS_INPUT", "NONE", null, null, ["formula operands (stated arithmetic on the dollar figure)"], null),
                        note: "The dollar figure is an operand of stated arithmetic, not a cap by itself. Needs the other operands.",
                      }
                  : category === "MAINTENANCE_LIMIT"
                    ? {
                        ...capShell("NEEDS_INPUT", "NONE", null, null, ["not a basket: maintenance limit"], null),
                        note: "A maintenance limit on a stated measure (a test), not capacity. No basket cap is computed from it.",
                      }
                  : category === "RECLASS"
                    ? {
                        ...capShell("NEEDS_INPUT", "NONE", null, null, ["source basket unused", "reclassification election"], null),
                        note: "Reclassification is named. No election record is bound, so no amount is transferred.",
                      }
                    : numericButOpen(clause);
  return present(clause, { ...base, ...partial });
}

/**
 * "The Company will not permit, as of the end of any fiscal quarter, X to have an aggregate of over 25% of Total
 * Assets": a stated measure must stay under a limit at test dates. It grants nothing, so it is not a basket.
 */
export function isMaintenanceLimit(text: string): boolean {
  const t = norm(text);
  const m = /\b(?:will|shall)\s+not\s+permit\b[^.;]{0,160}?\bto\s+(?:have|hold|own|account\s+for|represent|constitute|contribute|generate)\b([^.;]{0,200})/i.exec(t);
  // The measure held is the group's size (assets / revenues / EBITDA), not debt, liens or investments outstanding
  // (a limit on those is capacity).
  if (!m || !/\b(?:Assets|revenues?|EBITDA|Net\s+Worth|net\s+sales)\b/i.test(m[1]!) || /\b(?:Indebtedness|Debt|Liens?|Investments?|Guarantees?|obligations)\b/i.test(m[1]!)) return false;
  // A permission ("may incur / make / pay … not to exceed") is a basket even with test-like words nearby.
  return !/\b(?:may|is\s+permitted\s+to|shall\s+be\s+permitted\s+to)\s+(?:incur|make|pay|declare|create|issue|sell|dispose|invest|guarantee|assume)\b|\bnot\s+otherwise\s+permitted\b|\bpermitted\s+(?:under|by|pursuant)\b/i.test(t);
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
    namedSumLimbs(text).length > 0 ||
    (/\bsum\b/i.test(text) && /\d+(?:\.\d+)?\s*%\s+of\b/i.test(text) && /\bshall not exceed the sum\b/i.test(text)) ||
    (/\bmay be increased by\b/i.test(text) && /\$\s*[\d,]+/.test(text)) ||
    // "(x) $200,000,000 plus (y) 50% of Consolidated Net Income plus (z) 100% of Net Proceeds": a sum with a
    // metric-percentage component is a builder (NEEDS_INPUT until every component is bound), never the fixed part alone.
    (/\$\s*[\d,]+/.test(text) && /\d+(?:\.\d+)?\s*%\s+of\b/i.test(text) && /\bplus\b/i.test(text) && !/\bgreater\s+of\b/i.test(text))
  ) {
    return "BUILDER_AVAILABLE_AMOUNT";
  }
  // A "lesser of" counts only when it is what the amount may not exceed; one inside a condition ("the ratio is at
  // least the lesser of …", "a minimum amount of the lesser of …") does not change the cap.
  const lesserCap = capExtremeAt(text, "lesser");
  const greaterAt = norm(text).search(/\bgreater\s+of\b/i);
  // Both extremes in the cap expression (nested max/min): neither bound direction holds without reading the nesting.
  if (lesserCap >= 0 && greaterAt >= 0 && Math.abs(greaterAt - lesserCap) < 300) return "UNKNOWN";
  if (/\bgreater\s+of\b/i.test(text)) return "GROWER_GREATER_OF";
  // Merge of #398 and release-1: a lesser-of counts only when it is the cap (#398 capExtremeAt guard);
  // evaluation then tries release-1's exact min(fixed, metric limb) and falls back to #398's AT_MOST bound.
  if (lesserCap >= 0 && /\$\s*[\d,]+/.test(text)) return "LESSER_OF";
  const ratio = classifyRatioIncurrencePermission(text);
  if (ratio.class !== "NOT_RATIO_INCURRENCE") return "RATIO_BASED";
  // A maintenance test ("shall not permit the Leverage Ratio to exceed 4.50x") is not a basket; checked before the
  // multiple-of-metric amount cap so a ratio limit is never read as "4.50x Consolidated EBITDA" of dollars.
  if (isMaintenanceLimit(text)) return "MAINTENANCE_LIMIT";
  // An amount cap stated as a multiple of a metric ("not to exceed 3.0x Consolidated EBITDA").
  // Ratio tests already returned above, so a multiple here is an incurrence amount, not a maintenance threshold.
  if (parseMultipleCap(text) != null) return "MULTIPLE_OF_METRIC";
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
  if (/\$\s*[\d,]+/.test(text) && ARITHMETIC_ON_AMOUNT.test(text)) return "FORMULA_AMOUNT";
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

/** "so long as no ...", "provided that no ...", "if no ...", "unless ..." up to the clause's comma: a condition, not a negation. */
const CONDITION_NO = /\b(?:so\s+long\s+as|provided(?:,?\s+however,?)?\s+that|if|when|unless|(?:immediately\s+)?after\s+giving\s+effect[^,;]{0,80}?,)\s+(?:no|not)\b[^,;]{0,160}/gi;
/** A defined set of gating conditions ("Payment Conditions", "RP Conditions", "Payment Condition") or satisfied tests. */
const DEFINED_CONDITIONS = /\b(?:[A-Z][A-Za-z]*\s+)+Conditions?\b|\bconditions?\s+(?:set\s+forth|specified|described)\b|\b(?:is|are)\s+satisfied\b/;
const LEAD_CONDITION = /\b(?:if|so\s+long\s+as|provided\s+that|subject\s+to)\b/i;

export function unlimitedCapacityMatch(text: string): { kind: "NONE" | "UNCONDITIONAL" | "CONDITIONAL" | "NEGATED" } {
  const m = UNLIMITED_CAPACITY_PHRASE.exec(text);
  if (!m) return { kind: "NONE" };
  const before = text.slice(Math.max(0, m.index - 240), m.index);
  // A condition's own "no" ("so long as no Default or Event of Default exists, ...") gates the grant; it does not negate it.
  // Only a condition that closes ("..., ") before the grant is stripped. A "provided that no ..." that runs straight into
  // the grant ("provided that no Restricted Payments may be made in an unlimited amount") is the grant's own negation.
  const beforeGrant = before.replace(CONDITION_NO, (span, at: number) => (/^\s*[,;]/.test(before.slice(at + span.length)) ? " " : span));
  if (UNLIMITED_NEGATION.test(beforeGrant)) return { kind: "NEGATED" };
  // A financial-test condition, or a defined gating condition set ("so long as the Payment Conditions are satisfied"),
  // makes the grant conditional; "so long as no Default exists" alone does not.
  const after = text.slice(m.index + m[0].length);
  if (UNLIMITED_CONDITION.test(after) && (RATIO_CONDITION.test(after) || DEFINED_CONDITIONS.test(after))) return { kind: "CONDITIONAL" };
  if (LEAD_CONDITION.test(before) && DEFINED_CONDITIONS.test(before)) return { kind: "CONDITIONAL" };
  return { kind: "UNCONDITIONAL" };
}

/** True only for an unconditional, non-negated capacity grant. */
export function isCapacityUnlimited(text: string): boolean {
  return unlimitedCapacityMatch(text).kind === "UNCONDITIONAL";
}


function hasNumeric(text: string): boolean {
  return /\$\s*[\d,]+|\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:x|times)\s+(?:the\s+)?[A-Z]/.test(text);
}

function hasClosedCap(text: string): boolean {
  return (
    /\bgreater\s+of\b/i.test(text) ||
    /\blesser\s+of\b/i.test(text) ||
    parseMultipleCap(text) != null ||
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

type BasketPartial = ReturnType<typeof capShell> & { note: string; remainingStatus?: ComputedBasket["remainingStatus"]; capBound?: ComputedBasket["capBound"] };

function evalGrower(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const assets = classifyGreaterOfAssetsBasket(clause.operativeText);
  const ebitda = parseEbitdaGrower(clause.operativeText);
  let fixedToken = assets.class !== "NOT_GREATER_OF_ASSETS"
    ? dollarMatching(clause.operativeText, assets.fixedAmountUsd)
    : ebitda?.fixedToken ?? null;
  let percent = assets.class !== "NOT_GREATER_OF_ASSETS" ? assets.percentFraction : ebitda?.fraction ?? null;
  let metricName = assets.class !== "NOT_GREATER_OF_ASSETS" ? assets.metricName : ebitda?.metricName ?? null;
  if (!fixedToken || percent == null || !metricName) {
    // General two-limb reader: "greater of (x) $A [million] and (y) B% of <metric>" in either order.
    const g = parseGenericGrower(clause.operativeText);
    if (g) ({ fixedToken, percent, metricName } = g);
  }
  if (!fixedToken || percent == null || !metricName) {
    return fixedLimbBound(clause.operativeText, "greater", greaterOfMissingInputs(clause.operativeText)) ?? {
      ...capShell("NEEDS_INPUT", "NONE", null, null, greaterOfMissingInputs(clause.operativeText), null),
      note: "Greater-of language is present. A limb could not be read from the text, so neither limb is used alone.",
    };
  }
  const found = metrics.find((m) => m.metricKey.toLowerCase() === metricName.toLowerCase());
  if (!found || found.value.type !== "MONEY") {
    return fixedLimbBound(clause.operativeText, "greater", [metricName]) ?? {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [metricName], null),
      note: "Greater-of metric is not bound. The fixed limb is not reported as the cap.",
    };
  }
  const statedMillions = dollarAmountIsMillions(clause.operativeText, fixedToken);
  // Filing (XBRL) inputs are exact whole dollars, so expressing them in millions is an exact rescale, not an assumption.
  const metric = xbrlInUnit(found, statedMillions);
  if (metric !== found) metrics = metrics.map((m) => (m === found ? metric : m));
  if (metric.value.type !== "MONEY") return { ...capShell("NEEDS_INPUT", "NONE", null, null, [metricName], null), note: "Greater-of metric is not money." };
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

/**
 * The limbs of "the greater of …" / "the lesser of …": the text after the phrase up to the end of the clause,
 * split at "(x)"-style enumerators (else at "and"/"or"). A limb is fixed when it is only a dollar amount.
 * Null unless at least two limbs are read.
 */
export function extremumLimbs(text: string, which: "greater" | "lesser"): Array<{ raw: string; usd: string | null }> | null {
  const t = norm(text);
  const capAt = capExtremeAt(text, which);
  const at = capAt >= 0 ? capAt : t.search(new RegExp(`\\b${which}\\s+of\\b`, "i"));
  if (at < 0) return null;
  let body = t.slice(at).replace(new RegExp(`^${which}\\s+of\\s*:?\\s*`, "i"), "");
  body = body.split(/;|\.(?:\s|$)|\bprovided\b|\bin\s+each\s+case\b/i)[0]!;
  const enumerated = /^\(\s*[a-z0-9]{1,4}\s*\)/i.test(body);
  const parts = enumerated
    ? body.split(/\(\s*(?:[a-z]{1,4}|\d{1,2})\s*\)/i).map((x) => x.trim()).filter((x) => x.length)
    : body.split(/\s*,?\s+(?:and|or)\s+/i).slice(0, 2);
  const limbs = parts.map((raw) => raw.replace(/\s*\((?:collectively|together|each|the\s+[“"])[^)]*\)\s*$/i, "").replace(/\s*,?\s*(?:and|or)?\s*$/i, "").replace(/^(?:an\s+amount\s+equal\s+to\s+)?/i, "").trim());
  if (limbs.length < 2 || limbs.some((l) => !l)) return null;
  return limbs.map((raw) => {
    const m = /^(?:U\.S\.\s*)?\$\s*([\d,]+(?:\.\d+)?)(\s+million)?\s*$/i.exec(raw);
    if (!m) return { raw, usd: null };
    const tok = m[1]!.replace(/,/g, "");
    return { raw, usd: m[2] ? millionsToUsd(tok) : /^\d+$/.test(tok) ? tok : null };
  });
}

/**
 * Position of a "greater of" / "lesser of" that is the cap ("not to exceed the greater of …"), not a limb of a larger
 * sum ("plus (D) the greater of …") or a floor ("a minimum amount of the lesser of …", "at least the lesser of"). -1 if none.
 */
export function capExtremeAt(text: string, which: "greater" | "lesser"): number {
  const t = norm(text);
  for (const m of t.matchAll(new RegExp(`\\b${which}\\s+of\\b`, "gi"))) {
    const before = t.slice(Math.max(0, m.index! - 120), m.index!);
    if (!/\b(?:not\s+(?:to\s+)?exceed|(?:shall|does|do|will|would)\s+not\s+exceed|not\s+in\s+excess\s+of|up\s+to|not\s+(?:more|greater)\s+than|no\s+(?:more|greater)\s+than|exceeding)\b[^;]{0,60}$/i.test(before)) continue;
    if (/\b(?:minimum|at\s+least|not\s+less\s+than)\b[^;]{0,40}$/i.test(before)) continue;
    return m.index!;
  }
  return -1;
}

/**
 * A greater-of cap is at least its largest fixed limb, whatever the other limbs are; a lesser-of cap is at most its
 * smallest fixed limb. Every limb must be read; the unknown limbs are named as missing. All limbs fixed → exact.
 */
function fixedLimbBound(text: string, which: "greater" | "lesser", missing: string[]): BasketPartial | null {
  // Only a cap: the extreme must be what an amount may not exceed ("not to exceed the greater of …"), not a limb of
  // a larger sum ("plus (D) the greater of …") or a floor ("a minimum amount of the lesser of …", "at least the lesser of").
  if (capExtremeAt(text, which) < 0) return null;
  const limbs = extremumLimbs(text, which);
  if (!limbs) return null;
  const fixed = limbs.filter((l) => l.usd != null).map((l) => BigInt(l.usd!));
  if (!fixed.length) return null;
  const v = fixed.reduce((a, b) => (which === "greater" ? (b > a ? b : a) : (b < a ? b : a)));
  const exact = fixed.length === limbs.length;
  const unknown = limbs.filter((l) => l.usd == null).map((l) => metricPhrase(l.raw.replace(/^\d+(?:\.\d+)?\s*%\s+of\s+/i, "")) || l.raw.slice(0, 60));
  const bound = which === "greater" ? "AT_LEAST" : "AT_MOST";
  return {
    ...capShell("COMPUTED", "AMOUNT", v.toString(), "USD", exact ? [] : unknown.length ? unknown : missing, null),
    ...(exact ? {} : { capBound: bound as "AT_LEAST" | "AT_MOST" }),
    remainingStatus: "NEEDS_INPUT",
    note: exact
      ? `${which === "greater" ? "Greater" : "Lesser"}-of with only fixed limbs: the ${which === "greater" ? "largest" : "smallest"}.`
      : `${which === "greater" ? "Greater" : "Lesser"}-of: the cap is ${which === "greater" ? "at least the largest" : "at most the smallest"} fixed limb; the other limb${unknown.length > 1 ? "s are" : " is"} not known (${unknown.join("; ")}).`,
  };
}

const NONNEG_LIMB = /\b(?:net\s+cash\s+proceeds|cash\s+proceeds|proceeds|capital\s+contributions?|cash\s+contributions?|fair\s+market\s+value|dividends?\s+(?:or\s+distributions?\s+)?received|returns?\s+(?:of|on)\s+capital|repayments?\s+of\s+principal|Declined\s+Proceeds)\b/i;
const MAYBE_NEG_LIMB = /\b(?:net\s+income|income|earnings|deficit|loss(?:es)?|minus|less|negative|reduced|decrease|EBITDA|cash\s+flow)\b/i;

/**
 * "the sum of (a) $X, plus (b) …, plus (c) …": at least the fixed limbs when every other limb is added (no minus
 * limb) and cannot be negative (proceeds, contributions, fair market value received — never income or EBITDA,
 * which can be negative). Otherwise null.
 */
export function sumLowerBound(text: string): BasketPartial | null {
  const t = norm(text);
  const at = t.search(/\bsum\s+of\b/i);
  if (at < 0) return null;
  const body = t.slice(at).replace(/^sum\s+of\s*:?\s*/i, "").split(/;\s*(?:provided|and\s+(?:minus|less))|\bprovided\b|\.(?:\s|$)/i)[0]!;
  if (/\b(?:minus|less|reduced\s+by)\s*(?:\(\s*[a-z0-9]{1,4}\s*\))?\s*(?:the\s+)?(?:aggregate|sum|amount|\d)/i.test(body)) return null;
  if (!/^\(\s*[a-z0-9]{1,4}\s*\)/i.test(body)) return null;
  const limbs = body.split(/\(\s*(?:[a-z]{1,4}|\d{1,2})\s*\)/i).map((x) => x.replace(/[,;]?\s*(?:plus|and)?\s*[,;]?\s*$/i, "").trim()).filter(Boolean);
  if (limbs.length < 2) return null;
  let total = 0n; const unknown: string[] = [];
  for (const l of limbs) {
    const m = /^(?:an\s+amount\s+equal\s+to\s+)?(?:U\.S\.\s*)?\$\s*([\d,]+(?:\.\d+)?)(\s+million)?$/i.exec(l);
    if (m) { const tok = m[1]!.replace(/,/g, ""); if (!m[2] && !/^\d+$/.test(tok)) return null; total += BigInt(m[2] ? millionsToUsd(tok) : tok); continue; }
    if (!NONNEG_LIMB.test(l) || MAYBE_NEG_LIMB.test(l)) return null;
    unknown.push(l.slice(0, 80));
  }
  if (total === 0n || !unknown.length) return null;
  return {
    ...capShell("COMPUTED", "AMOUNT", total.toString(), "USD", unknown, null),
    capBound: "AT_LEAST",
    remainingStatus: "NEEDS_INPUT",
    note: `Sum of limbs: at least the fixed limbs; the other limbs are added and cannot be negative (${unknown.length} unknown).`,
  };
}

function evalLesser(clause: BasketClause): BasketPartial {
  const r = fixedLimbBound(clause.operativeText, "lesser", ["lesser-of limb"]);
  return r ?? { ...capShell("NEEDS_INPUT", "NONE", null, null, ["lesser-of limbs"], null), note: "Lesser-of limbs could not be read; no limb is used alone." };
}

function evalRatioBasket(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
  ratios: readonly ComputedRatio[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const term = clauseRatioTerm(clause.operativeText);
  const ratio = term
    ? ratios.find((r) => r.status !== "UNKNOWN" && namesEqual(r.displayName, term))
    : ratios.find((r) => r.thresholds.some((t) => t.sectionRef === clause.sectionRef));
  const missing = ["contractual dollar conversion of ratio room"];
  if (!ratio) {
    return {
      ...capShell("NEEDS_INPUT", "RATIO_TEST", null, null, [term ? `ratio not in catalog: ${term}` : "contract ratio definition", ...missing], null),
      dollarRoomStatus: "NEEDS_INPUT",
      note: term ? `"${term}" is not a catalog ratio. No other ratio was substituted.` : "No ratio is named in the clause. No dollar room was inferred.",
    };
  }
  if (ratio.status !== "COMPUTED" || !ratio.expression || !ratio.canonical) {
    const why = ratio.missingInputs.includes("contract definition") ? ["contract ratio definition"]
      : ratio.missingInputs.includes("definition arithmetic") ? ["ratio definition arithmetic"]
      : ratio.missingInputs.map((m) => `ratio operand: ${m}`);
    return {
      ...capShell("NEEDS_INPUT", "RATIO_TEST", null, null, [...(why.length ? why : ["ratio operand"]), ...missing], null),
      dollarRoomStatus: "NEEDS_INPUT",
      note: `Linked to ${ratio.displayName}, which is NEEDS_INPUT. No dollar room was inferred.`,
    };
  }
  const classified = clauseRatioThreshold(clause.operativeText);
  if (!classified) {
    return {
      ...capShell("NEEDS_INPUT", "RATIO_TEST", null, null, ["ratio threshold", ...missing], null),
      dollarRoomStatus: "NEEDS_INPUT",
      note: `${ratio.displayName} is computed, but the clause does not state one threshold. The test was not evaluated.`,
    };
  }
  const limit = classified.num / classified.den;
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
  // A limb that is neither a dollar figure nor "N% of <Metric>" ("(B) the Cumulative Credit", "the Available Amount")
  // has no stated value: the sum is not computable, and the dollar limb alone is never the cap.
  const named = namedSumLimbs(text);
  if (named.length > 0) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [...named, "prior usage"], null),
      note: "A builder component has no stated value. The starter dollar is not presented as Available Amount.",
    };
  }
  const missing = metricNames.filter((name) => !metrics.some((m) => m.metricKey.toLowerCase() === name.toLowerCase()));
  if (missing.length > 0) {
    return sumLowerBound(clause.operativeText) ?? {
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

const ARITHMETIC_ON_AMOUNT = /\b(?:quotient|divided\s+by|multiplied\s+by|product\s+of)\b/i;

function soleFixedDollar(text: string): string | null {
  const normed = norm(text);
  if (/\bgreater\s+of\b/i.test(normed) || /\blesser\s+of\b/i.test(normed) || /\d+(?:\.\d+)?\s*%/.test(normed) || /\bmay be increased by\b/i.test(normed)) return null;
  // A dollar figure inside arithmetic ("the quotient of $550 million divided by the rate") is an operand, not the cap.
  if (/\b(?:quotient|divided\s+by|multiplied\s+by|product\s+of)\b/i.test(normed)) return null;
  // A dollar figure beside a multiple cap ("not to exceed $100,000,000 and 3.0x EBITDA", no lesser/greater) states
  // two caps. Neither limb alone is the cap, so the dollar is not a lone fixed dollar.
  if (hasMultipleCapPattern(normed)) return null;
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
    /\bexceeds\s+\$\s*[\d,]+(?:\.\d+)?\s+million\b/i.test(normed) ||
    // Bare "up to $X", "capped at $X", "maximum ... $X", "not exceeding $X": a ceiling directly on the one dollar figure.
    /\bup\s+to\s+\$\s*[\d,]+/i.test(normed) ||
    /\bcapped\s+at\s+\$\s*[\d,]+/i.test(normed) ||
    /\bmaximum\s+(?:aggregate\s+)?(?:principal\s+)?(?:amount\s+)?(?:of\s+)?\$\s*[\d,]+/i.test(normed) ||
    /\bnot\s+exceeding\s+\$\s*[\d,]+/i.test(normed);
  return capRole ? distinct[0]! : null;
}

/** Ceiling language that makes a number a cap rather than a stated amount. */
const CAP_ROLE_WORDS =
  /\b(?:not\s+to\s+exceed|shall\s+not\s+exceed|does\s+not\s+exceed|will\s+not\s+exceed|not\s+in\s+excess\s+of|in\s+excess\s+of|up\s+to|capped\s+at|maximum|not\s+exceeding|lesser\s+of|greater\s+of)\b/i;
/** A ratio name near a multiple means the multiple is a ratio threshold, not an amount cap. */
const RATIO_NAME_NEAR = /\b(?:leverage|coverage|fixed\s+charge\s+coverage|interest\s+coverage|senior\s+secured\s+leverage|total\s+leverage|secured\s+leverage|first\s+lien\s+leverage)\s+ratio\b/i;
/** An amount noun near a multiple means the multiple caps an amount, not a ratio. */
const AMOUNT_NOUN = /\b(?:indebtedness|amount|principal|debt|borrowings?|loans?|notes?|obligations?)\b/i;

export interface MultipleCap {
  /** The stated multiple (e.g. 3.0 for "3.0x Consolidated EBITDA"). */
  multiple: number;
  /** Metric phrase as written in the clause (e.g. "Consolidated EBITDA"). */
  metricName: string;
}

/**
 * A standalone multiple amount cap ("not to exceed 3.0x Consolidated EBITDA").
 * Null unless: exactly one multiple, no dollar token, no percent token, ceiling
 * language present, an amount noun nearby, no ratio name nearby, no arithmetic,
 * and the multiple is in (0, 100]. Two multiples, or a multiple beside a dollar
 * or percent cap, is ambiguous -> null (NEEDS_INPUT downstream, never a guess).
 */
export function parseMultipleCap(text: string): MultipleCap | null {
  const t = norm(text);
  if (/\b(?:quotient|divided\s+by|multiplied\s+by|product\s+of)\b/i.test(t)) return null;
  if (/\$\s*[\d,]+/.test(t) || /\d+(?:\.\d+)?\s*%/.test(t)) return null;
  if (!CAP_ROLE_WORDS.test(t)) return null;
  if (!hasMultipleCapPattern(t)) return null;
  const matches = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(?:x|times)\s+(?:the\s+)?([^.;]{3,120})/gi)];
  if (matches.length !== 1) return null;
  const m = matches[0]!;
  const multiple = Number(m[1]);
  if (!Number.isFinite(multiple) || multiple <= 0 || multiple > 100) return null;
  const before = t.slice(0, m.index ?? 0);
  if (RATIO_NAME_NEAR.test(before.slice(-120))) return null;
  if (!AMOUNT_NOUN.test(before.slice(-200))) return null;
  const metricName = metricPhrase(m[2] ?? "");
  if (metricName.length < 3) return null;
  return { multiple, metricName };
}

/**
 * A multiple-cap shape is present ("N.N x|times <Metric>") with ceiling language,
 * an amount noun nearby, and no ratio name nearby — regardless of whether other
 * numbers (dollar, percent) are also present. Used by soleFixedDollar to refuse
 * a lone-dollar read when a multiple cap also binds. parseMultipleCap adds the
 * standalone exclusions (no $/%, exactly one multiple) on top of this shape.
 */
export function hasMultipleCapPattern(text: string): boolean {
  const t = norm(text);
  if (/\b(?:quotient|divided\s+by|multiplied\s+by|product\s+of)\b/i.test(t)) return false;
  if (!CAP_ROLE_WORDS.test(t)) return false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(?:x|times)\s+(?:the\s+)?([^.;]{3,120})/gi)) {
    if (m.index == null) continue;
    const multiple = Number(m[1]);
    if (!Number.isFinite(multiple) || multiple <= 0 || multiple > 100) continue;
    const before = t.slice(0, m.index);
    if (RATIO_NAME_NEAR.test(before.slice(-120))) continue;
    if (!AMOUNT_NOUN.test(before.slice(-200))) continue;
    if (metricPhrase(m[2] ?? "").length < 3) continue;
    return true;
  }
  return false;
}

export interface LesserOfCap {
  fixedToken: string;
  /** Second limb: a multiple cap, or a percent-of-metric limb (percent + metric name). */
  limb: { kind: "MULTIPLE"; multiple: number; metricName: string } | { kind: "PERCENT"; percent: number; metricName: string };
}

/**
 * An explicit "lesser of (a) $X and (b) N x Metric | N% of Metric" cap (either limb order).
 * Null unless exactly one dollar token and exactly one metric limb are inside the lesser-of span.
 * A bare "dollar and multiple" pair without the words "lesser of" is NOT a lesser-of: it stays
 * unparsed (NEEDS_INPUT) rather than assuming the conjunction is conjunctive.
 */
export function parseLesserOf(text: string): LesserOfCap | null {
  const t = norm(text);
  const m = t.match(/\blesser\s+of\b[\s\S]{0,400}/i);
  if (!m || m.index == null) return null;
  const span = m[0];
  if (/\b(?:quotient|divided\s+by|multiplied\s+by|product\s+of)\b/i.test(span)) return null;
  const dollars = [...span.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((x) => x[1]!.replace(/,/g, ""));
  if (new Set(dollars).size !== 1) return null;
  const multiples = [...span.matchAll(/(\d+(?:\.\d+)?)\s*(?:x|times)\s+(?:the\s+)?([^.;)]{3,120})/gi)];
  const percents = [...span.matchAll(/(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?([^.;)]{3,120})/gi)];
  if (multiples.length === 1 && percents.length === 0) {
    const multiple = Number(multiples[0]![1]);
    if (!Number.isFinite(multiple) || multiple <= 0 || multiple > 100) return null;
    const metricName = metricPhrase(multiples[0]![2] ?? "");
    if (metricName.length < 3) return null;
    return { fixedToken: dollars[0]!, limb: { kind: "MULTIPLE", multiple, metricName } };
  }
  if (percents.length === 1 && multiples.length === 0) {
    const percent = Number(percents[0]![1]);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null;
    const metricName = metricPhrase(percents[0]![2] ?? "");
    if (metricName.length < 3) return null;
    return { fixedToken: dollars[0]!, limb: { kind: "PERCENT", percent, metricName } };
  }
  return null;
}

function evalMultiple(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const parsed = parseMultipleCap(clause.operativeText);
  if (!parsed) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["multiple-of-metric cap"], null),
      note: "A multiple is present. It could not be read as a single amount cap, so no product was returned.",
    };
  }
  const metric = metrics.find((item) => item.metricKey.toLowerCase() === parsed.metricName.toLowerCase());
  if (!metric || metric.value.type !== "MONEY") {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [parsed.metricName], null),
      note: `Multiple of ${parsed.metricName} is not a bound metric. No other base was substituted.`,
    };
  }
  const p = prov(clause);
  const expression: IRExpression = {
    kind: "MULTIPLY",
    type: "MONEY",
    exprId: `cc:${clause.stableKey}:multiple-metric`,
    provenance: p,
    operands: [
      { kind: "NUMBER", type: "NUMBER", value: parsed.multiple, exprId: `cc:${clause.stableKey}:multiple-lit`, provenance: p },
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
      ...capShell("NEEDS_INPUT", "NONE", null, null, [parsed.metricName], null),
      note: "Multiple-of-metric expression did not evaluate.",
    };
  }
  return {
    ...capShell("COMPUTED", "AMOUNT", canonical, metric.value.currency, [], null),
    remainingStatus: "NEEDS_INPUT",
    missingInputs: ["ledger usage"],
    note: "Multiple of a bound metric from evaluateExpression. A ratio test was not converted: the multiple caps an amount. Remaining usage is not bound.",
  };
}

/**
 * Lesser-of cap (merge of #398 and release-1). The exact release-1 evaluation is used only when the
 * lesser-of it parses is the same one #398's guard identified as the cap and it COMPUTED; otherwise the
 * #398 fixed-limb AT_MOST bound (or its NEEDS_INPUT) applies. Never a fixed limb reported as the exact cap.
 */
function evalLesserCombined(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): BasketPartial {
  const text = clause.operativeText;
  const capAt = capExtremeAt(text, "lesser");
  const firstAt = norm(text).search(/\blesser\s+of\b/i);
  if (capAt >= 0 && capAt === firstAt) {
    const exact = evalLesserOf(pkg, clause, metrics);
    if (exact.capStatus === "COMPUTED") return exact as BasketPartial;
  }
  return evalLesser(clause);
}

function evalLesserOf(
  pkg: ComputationPackage,
  clause: BasketClause,
  metrics: readonly MetricInput[],
): Omit<ComputedBasket, "stableKey" | "sectionRef" | "covenantFamily" | "sourceDocumentId" | "citationExcerpt" | "category" | "formulaKind" | "certification" | "scope" | "capFormula"> {
  const parsed = parseLesserOf(clause.operativeText);
  if (!parsed) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, ["lesser-of limbs"], null),
      note: "Lesser-of language is present. A limb could not be read from the text, so neither limb is used alone.",
    };
  }
  const metricName = parsed.limb.metricName;
  const metric = metrics.find((item) => item.metricKey.toLowerCase() === metricName.toLowerCase());
  if (!metric || metric.value.type !== "MONEY") {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [metricName], null),
      note: "Lesser-of metric is not bound. The fixed limb is not reported as the cap.",
    };
  }
  const statedMillions = dollarAmountIsMillions(clause.operativeText, parsed.fixedToken);
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
  const p = prov(clause);
  const fixedOperand: IRExpression = {
    kind: "MONEY",
    type: "MONEY",
    amount: Number(parsed.fixedToken),
    currency,
    exprId: `cc:${clause.stableKey}:fixed`,
    provenance: p,
  };
  const metricOperand: IRExpression =
    parsed.limb.kind === "MULTIPLE"
      ? {
          kind: "MULTIPLY",
          type: "MONEY",
          exprId: `cc:${clause.stableKey}:multiple`,
          provenance: p,
          operands: [
            { kind: "NUMBER", type: "NUMBER", value: parsed.limb.multiple, exprId: `cc:${clause.stableKey}:multiple-lit`, provenance: p },
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
        }
      : {
          kind: "MULTIPLY",
          type: "MONEY",
          exprId: `cc:${clause.stableKey}:pct`,
          provenance: p,
          operands: [
            { kind: "PERCENT", type: "PERCENT", value: parsed.limb.percent / 100, exprId: `cc:${clause.stableKey}:pct-lit`, provenance: p },
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
  const expression: IRExpression = {
    kind: "MIN",
    type: "MONEY",
    exprId: `cc:${clause.stableKey}:lesser`,
    provenance: p,
    operands: [fixedOperand, metricOperand],
  };
  const evaluated = run(pkg, expression, metrics);
  const canonical = canonicalOf(evaluated.value);
  if (evaluated.status !== "EXECUTABLE" || !canonical) {
    return {
      ...capShell("NEEDS_INPUT", "NONE", null, null, [metricName], null),
      note: "Lesser-of expression did not evaluate. No limb was substituted.",
    };
  }
  return {
    ...capShell("COMPUTED", "AMOUNT", canonical, currency, [], null),
    remainingStatus: "NEEDS_INPUT",
    missingInputs: ["ledger usage"],
    note: "Lesser-of cap from evaluateExpression: both limbs bind, the smaller governs. Remaining usage is not bound.",
  };
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
  const metricName = metricPhrase(match?.[3] ?? "");
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
  if (category === "MULTIPLE_OF_METRIC") {
    const match = t.match(/\d+(?:\.\d+)?\s*(?:x|times)\s+(?:the\s+)?[^.;]{3,100}/i);
    return match?.[0] ?? null;
  }
  if (category === "LESSER_OF") {
    const match = t.match(/lesser\s+of\s+\(?[a-z0-9]+\)?\s+\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?\s+(?:and|or)\s+\(?[a-z0-9]+\)?\s+(?:\d+(?:\.\d+)?\s*(?:x|times)\s+(?:the\s+)?[^.;]{3,80}|\d+(?:\.\d+)?\s*%\s+of\s+(?:the\s+)?[^.;]{3,80})/i);
    return match?.[0] ?? "lesser of fixed dollar and multiple / percent of metric";
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

const LIMB = String.raw`(?:\(\s*[a-zA-Z0-9]{1,4}\s*\)\s*)?(?:an\s+amount\s+equal\s+to\s+)?`;
const PCT = String.raw`(?:[a-z][a-z\- ]{2,40}\s+percent\s*\(\s*)?(\d+(?:\.\d+)?)\s*%\s*\)?`;
const USD = String.raw`(?:U\.S\.\s*)?\$\s*([\d,]+(?:\.\d+)?)(?:\s+million)?`;
/** "greater of (x) $A and (y) B% of M" / "greater of B% of M and $A". Fixed limb, percent fraction and the metric as named. */
export function parseGenericGrower(text: string): { fixedToken: string; percent: number; metricName: string } | null {
  const t = norm(text);
  const a = new RegExp(`greater\\s+of\\s*:?\\s*${LIMB}${USD}\\s*,?\\s*(?:and|or)\\s+${LIMB}${PCT}\\s+of\\s+([^.;]{3,180})`, "i").exec(t);
  const b = a ? null : new RegExp(`greater\\s+of\\s*:?\\s*${LIMB}${PCT}\\s+of\\s+(.{3,180}?)\\s*,?\\s*(?:and|or)\\s+${LIMB}${USD}`, "i").exec(t);
  const fixed = a?.[1] ?? b?.[3], pct = a?.[2] ?? b?.[1], raw = a?.[3] ?? b?.[2];
  if (!fixed || !pct || !raw) return null;
  const metricName = metricPhrase(raw.replace(/\s+(?:and|or)\s*\(\s*\w{1,4}\s*\)[\s\S]*$/, ""));
  return metricName.length >= 3 ? { fixedToken: fixed.replace(/,/g, ""), percent: Number(pct) / 100, metricName } : null;
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

/**
 * The metric a percent applies to, as named in the clause: a capitalized defined term
 * ("Consolidated Total Assets") when the phrase starts with one, otherwise the phrase up to the first
 * qualifier ("as of", "at the time", a comma, a parenthetical), at most 10 words. Never invents a name.
 */
export function metricPhrase(raw: string): string {
  const t = norm(raw).replace(/^(?:the|such)\s+/i, "").split(/\bprovided\b/i)[0]!.trim();
  const term = t.match(/^(?:[A-Z][\w’'-]*)(?:\s+(?:of|and|to|for|[A-Z][\w’'-]*))*/);
  if (term) {
    const words = term[0].replace(/\s+(?:of|and|to|for)$/i, "").split(/\s+/);
    if (words.length >= 2 || /^[A-Z]{2,}/.test(words[0]!)) return words.slice(0, 10).join(" ");
  }
  const cut = t.split(/\s*(?:[,;(“"]|\bas of\b|\bat the time\b|\bdetermined\b|\bcalculated\b|\bmeasured\b|\bon a pro forma\b|\bfor the most recent\b)/i)[0]!.trim();
  return cut.split(/\s+/).slice(0, 12).join(" ").replace(/[,:]$/, "").replace(/\s+(?:of|and|the|to|for)$/i, "");
}

/** Metric named in a greater-of clause's percent limb ("greater of $X and Y% of <metric>"), if readable. */
export function namedMetricIn(text: string): string | null {
  const m = norm(text).match(/greater\s+of[^;]{0,300}?\d+(?:\.\d+)?\s*%\s+of\s+([^.;]{3,180})/i);
  const name = m ? metricPhrase(m[1]!) : "";
  return name.length >= 3 ? name : null;
}

/**
 * Missing inputs for a greater-of whose limbs could not be evaluated, named from the clause: the percent
 * limb's metric when there is one, else each "(x) … and (y) …" limb ("then-outstanding principal amount of
 * Priority Lien Debt", "Priority Lien Cap"). Generic labels only when the text names nothing.
 */
export function greaterOfMissingInputs(text: string): string[] {
  const metric = namedMetricIn(text);
  if (metric) return ["greater-of fixed limb", "percent limb", metric];
  const m = norm(text).match(/greater\s+of\s+\(\s*(?:x|a|i|1)\s*\)\s+([^;]{3,200}?)\s+and\s+\(\s*(?:y|b|ii|2)\s*\)\s+([^;]{3,200}?)(?=\s+(?:divided by|plus|minus|multiplied by|times)\b|[,;.)]|$)/i);
  if (m) {
    const limbs = [m[1]!, m[2]!].map((x) => metricPhrase(x)).filter((x) => x.length >= 3);
    if (limbs.length === 2) return limbs;
  }
  return ["greater-of fixed limb", "percent limb", "metric"];
}

/** Limbs of the first "sum of" that are neither a dollar figure nor a percentage of a metric (named balances). */
export function namedSumLimbs(text: string): string[] {
  const m = /\bsum of\b\s*:?/i.exec(text);
  if (!m) return [];
  const rest = text.slice(m.index + m[0].length).split(/[;.](?:\s|$)/)[0]!;
  const limbs = rest.split(/\s*(?:\((?:[a-z]|[ivx]{1,4}|[A-Z]|\d{1,2})\)|,?\s+\bplus\b|,?\s+\band\b(?=\s+(?:\([A-Za-z0-9]{1,4}\)|the\b|\$|\d)))\s*/).map((x) => x.trim().replace(/^[,\s]+|[,\s]+$/g, "")).filter((x) => x.length > 2);
  if (limbs.length < 2) return [];
  return limbs
    .filter((x) => !/\$\s?[\d,]/.test(x) && !/\d+(?:\.\d+)?\s*%\s+of\b/i.test(x))
    // Structural: every additive limb that states no dollar figure and no percentage of a metric is valueless here.
    .map((x) => x.slice(0, 80));
}
