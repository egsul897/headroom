/**
 * Issuer-agnostic classification of ratio-based debt incurrence permissions.
 *
 * Does not hardcode thresholds or issuer section numbers. Incomplete formulas
 * (missing ratio name, comparator, threshold, or definition dependency) refuse.
 */

export type RatioIncurrenceClass =
  | "RATIO_INCURRENCE_FULLY_SPECIFIED"
  | "RATIO_INCURRENCE_INCOMPLETE"
  | "NOT_RATIO_INCURRENCE";

export interface RatioIncurrenceClassification {
  class: RatioIncurrenceClass;
  ratioName: string | null;
  comparator: "AT_LEAST" | "NO_GREATER_THAN" | "GREATER_THAN" | "LESS_THAN" | null;
  thresholdNumerator: number | null;
  thresholdDenominator: number | null;
  thresholdRaw: string | null;
  definedTermDependencies: string[];
  entityScopeExcerpts: string[];
  conditionExcerpts: string[];
  reasons: string[];
}

const RATIO_NAME_RE =
  /\b((?:Consolidated\s+)?(?:Fixed\s+Charge\s+Coverage|Interest\s+Coverage|(?:Total\s+|Secured\s+|First\s+Lien\s+|Senior\s+)?(?:Net\s+)?Leverage)\s+Ratio)\b/i;
const AT_LEAST_RE = /\bat\s+least\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\b/i;
const NO_GREATER_RE = /\bno\s+greater\s+than\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\b/i;
const GTE_RE = /\bgreater\s+than\s+or\s+equal\s+to\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\b/i;
const LTE_RE = /\bless\s+than\s+or\s+equal\s+to\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\b/i;
const EXCEED_RE = /\bto\s+exceed\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\b/i;
const WOULD_BE_AT_LEAST = /\bwould\s+be\s+at\s+least\b/i;
const WOULD_BE_NO_GREATER = /\bwould\s+be\s+no\s+greater\s+than\b/i;
const DEFINED_TERM_RE = /[“"]([A-Z][^”"]{2,80})[”"]/g;
const ENTITY_RE = /\b(?:the\s+Company|the\s+Borrower|Restricted\s+Subsidiar(?:y|ies)|Guarantors?|Loan\s+Part(?:y|ies))\b/gi;
const CONDITION_RE = /\b(?:provided\s*,?\s*that|so\s+long\s+as|after\s+giving\s+(?:pro\s+forma\s+)?effect|no\s+(?:Event\s+of\s+)?Default)\b/gi;

export function classifyRatioIncurrencePermission(operativeText: string): RatioIncurrenceClassification {
  const text = operativeText.replace(/\s+/g, " ").trim();
  const reasons: string[] = [];
  if (!text || text.length < 24) {
    return empty("NOT_RATIO_INCURRENCE", ["empty_or_too_short"]);
  }

  const nameHit = text.match(RATIO_NAME_RE);
  if (!nameHit) {
    return empty("NOT_RATIO_INCURRENCE", ["no_ratio_name"]);
  }
  const ratioName = nameHit[1]!.replace(/\s+/g, " ").trim();

  let comparator: RatioIncurrenceClassification["comparator"] = null;
  let thresholdNumerator: number | null = null;
  let thresholdDenominator: number | null = null;
  let thresholdRaw: string | null = null;

  const hits: Array<{ index: number; comparator: NonNullable<RatioIncurrenceClassification["comparator"]>; raw: string; n: string; d: string }> = [];
  const pushHit = (re: RegExp, cmp: NonNullable<RatioIncurrenceClassification["comparator"]>) => {
    const hit = text.match(re);
    if (!hit || hit.index == null || !hit[1] || !hit[2]) return;
    hits.push({ index: hit.index, comparator: cmp, raw: hit[0], n: hit[1], d: hit[2] });
  };
  pushHit(GTE_RE, "AT_LEAST");
  pushHit(LTE_RE, "NO_GREATER_THAN");
  if (WOULD_BE_AT_LEAST.test(text) || /\bat\s+least\b/i.test(text)) pushHit(AT_LEAST_RE, "AT_LEAST");
  if (WOULD_BE_NO_GREATER.test(text) || /\bno\s+greater\s+than\b/i.test(text)) pushHit(NO_GREATER_RE, "NO_GREATER_THAN");
  pushHit(EXCEED_RE, "NO_GREATER_THAN");
  hits.sort((a, b) => a.index - b.index);
  const earliest = hits[0];
  if (earliest) {
    comparator = earliest.comparator;
    thresholdNumerator = Number(earliest.n);
    thresholdDenominator = Number(earliest.d);
    thresholdRaw = earliest.raw;
  }

  if (comparator == null || thresholdNumerator == null || thresholdDenominator == null) {
    reasons.push("missing_comparator_or_threshold");
  }

  const definedTermDependencies = new Set<string>([ratioName]);
  DEFINED_TERM_RE.lastIndex = 0;
  let dm: RegExpExecArray | null;
  while ((dm = DEFINED_TERM_RE.exec(text)) !== null) {
    definedTermDependencies.add(dm[1]!.trim());
  }
  // Bare capitalized defined-term style mentions commonly required for ratio closure.
  for (const term of [
    "Consolidated EBITDA",
    "Consolidated Fixed Charges",
    "Consolidated Total Debt",
    "Consolidated Net Income",
  ]) {
    if (new RegExp(term.replace(/\s+/g, "\\s+"), "i").test(text)) {
      definedTermDependencies.add(term);
    }
  }

  const entityScopeExcerpts = [...text.matchAll(ENTITY_RE)].map((m) => m[0]).slice(0, 6);
  const conditionExcerpts = [...text.matchAll(CONDITION_RE)].map((m) => m[0]).slice(0, 6);

  const missing: string[] = [...reasons];
  if (!ratioName) missing.push("ratio_name");
  if (comparator == null) missing.push("comparator");
  if (thresholdNumerator == null) missing.push("threshold");
  if (entityScopeExcerpts.length === 0) missing.push("entity_scope");
  // Definition closure requires the ratio term plus at least one metric constituent
  // OR an explicit "as set forth" / "calculated" dependency signal.
  const hasMetricDependency =
    definedTermDependencies.size >= 2 ||
    /\b(?:as\s+set\s+forth|calculated\s+on\s+a\s+pro\s+forma\s+basis|defined\s+term)\b/i.test(text);
  if (!hasMetricDependency) missing.push("definition_closure");

  if (missing.length > 0) {
    return {
      class: "RATIO_INCURRENCE_INCOMPLETE",
      ratioName,
      comparator,
      thresholdNumerator,
      thresholdDenominator,
      thresholdRaw,
      definedTermDependencies: [...definedTermDependencies],
      entityScopeExcerpts,
      conditionExcerpts,
      reasons: missing,
    };
  }

  return {
    class: "RATIO_INCURRENCE_FULLY_SPECIFIED",
    ratioName,
    comparator,
    thresholdNumerator,
    thresholdDenominator,
    thresholdRaw,
    definedTermDependencies: [...definedTermDependencies],
    entityScopeExcerpts,
    conditionExcerpts,
    reasons: ["fully_specified_ratio_incurrence"],
  };
}

function empty(
  cls: RatioIncurrenceClass,
  reasons: string[],
): RatioIncurrenceClassification {
  return {
    class: cls,
    ratioName: null,
    comparator: null,
    thresholdNumerator: null,
    thresholdDenominator: null,
    thresholdRaw: null,
    definedTermDependencies: [],
    entityScopeExcerpts: [],
    conditionExcerpts: [],
    reasons,
  };
}
