/**
 * Issuer-agnostic classification of "greater of fixed dollar and % of Total Assets"
 * covenant baskets. Facility-difference and other non-assets growers stay unsupported.
 */
export type GreaterOfAssetsClass =
  | "GREATER_OF_FIXED_OR_PCT_ASSETS"
  | "GREATER_OF_FIXED_OR_PCT_ASSETS_WITH_QUALITATIVE_GATES"
  | "NOT_GREATER_OF_ASSETS";

export interface GreaterOfResidual {
  kind:
    | "SHARED_CAP_COMBINE"
    | "CROSS_SECTION_LINK"
    | "PROVISO_OR_CONDITIONAL"
    | "PRO_FORMA_ADJUSTMENT"
    | "OBJECT_RESTRICTION"
    | "AS_OF_MEASUREMENT"
    | "OTHER_MATERIAL";
  excerpt: string;
  gateInputName: string;
}

export interface GreaterOfAssetsClassification {
  class: GreaterOfAssetsClass;
  fixedAmountUsd: number | null;
  percentFraction: number | null;
  percentRaw: string | null;
  metricName: string | null;
  metricExcerpt: string | null;
  sharedCounterpartRefs: string[];
  residuals: GreaterOfResidual[];
  reasons: string[];
}

const GREATER_OF_RE = /\bgreater\s+of\b/i;
const FACILITY_DIFF_RE =
  /\bdifference\s+between\b|\bMaximum\s+Facility\s+Amount\b|\bFacility\s+Amount\b/i;
const PCT_ASSETS_RE =
  /\b(?:ten|five|fifteen|twenty|twenty[- ]five|thirty|\d+(?:\.\d+)?)\s*percent\s*\((\d+(?:\.\d+)?)%\)\s+of\s+the\s+(Total\s+Consolidated\s+Assets|Consolidated\s+Total\s+Assets|Total\s+Assets)\b/i;
const PCT_ASSETS_ALT_RE =
  /\b(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?(Total\s+Consolidated\s+Assets|Consolidated\s+Total\s+Assets|Total\s+Assets)\b/i;
const DOLLAR_RE = /\$\s?([\d,]+(?:\.\d+)?)/g;
// Prefer longer unique excerpts so normalize provenance can bind unambiguously
// when the grower acknowledgment repeats the same short stems.
const SHARED_RE =
  /\bat\s+the\s+time\s+of\s+incurrence(?:\s+\w+){0,6}[,\s]+when\s+combined\s*\(\s*without\s+duplication\s*\)\s+with\s+[^.;]{8,100}/i;
const CROSS_SEC_RE = /\bSection\s+\d+\.\d+\([a-z0-9]+\)/gi;
const PROVISO_RE = /\bprovided\s*,?\s*(?:further\s*,?\s*)?that\b|\bso\s+long\s+as\b/i;
const PRO_FORMA_RE = /\bpro\s+forma\s+(?:basis|effect|adjustment)\b/i;
const AS_OF_RE =
  /\bas\s+of\s+the\s+last\s+day\s+of\s+the\s+fiscal\s+quarter\s+or\s+fiscal\s+year\b/i;
const OBJECT_RE =
  /\b(?:additional\s+Liens\s+securing\s+obligations|additional\s+Indebtedness\s+in\s+an\s+aggregate)\b/i;

function parseUsd(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function wordPercentToFraction(text: string): { fraction: number; raw: string; metric: string; excerpt: string } | null {
  const m = text.match(PCT_ASSETS_RE);
  if (m) {
    return {
      fraction: Number(m[1]) / 100,
      raw: `${m[1]}%`,
      metric: m[2]!,
      excerpt: m[0],
    };
  }
  const alt = text.match(PCT_ASSETS_ALT_RE);
  if (alt) {
    return {
      fraction: Number(alt[1]) / 100,
      raw: `${alt[1]}%`,
      metric: alt[2]!,
      excerpt: alt[0],
    };
  }
  return null;
}

export function classifyGreaterOfAssetsBasket(operativeText: string): GreaterOfAssetsClassification {
  const text = operativeText.replace(/\s+/g, " ").trim();
  const reasons: string[] = [];
  if (!text || text.length < 20) {
    return {
      class: "NOT_GREATER_OF_ASSETS",
      fixedAmountUsd: null,
      percentFraction: null,
      percentRaw: null,
      metricName: null,
      metricExcerpt: null,
      sharedCounterpartRefs: [],
      residuals: [],
      reasons: ["empty_or_too_short"],
    };
  }
  if (FACILITY_DIFF_RE.test(text)) {
    return {
      class: "NOT_GREATER_OF_ASSETS",
      fixedAmountUsd: null,
      percentFraction: null,
      percentRaw: null,
      metricName: null,
      metricExcerpt: null,
      sharedCounterpartRefs: [],
      residuals: [],
      reasons: ["facility_difference_unsupported"],
    };
  }
  if (!GREATER_OF_RE.test(text)) {
    return {
      class: "NOT_GREATER_OF_ASSETS",
      fixedAmountUsd: null,
      percentFraction: null,
      percentRaw: null,
      metricName: null,
      metricExcerpt: null,
      sharedCounterpartRefs: [],
      residuals: [],
      reasons: ["no_greater_of"],
    };
  }

  const pct = wordPercentToFraction(text);
  if (!pct) {
    return {
      class: "NOT_GREATER_OF_ASSETS",
      fixedAmountUsd: null,
      percentFraction: null,
      percentRaw: null,
      metricName: null,
      metricExcerpt: null,
      sharedCounterpartRefs: [],
      residuals: [],
      reasons: ["greater_of_without_pct_of_total_assets"],
    };
  }

  const dollars: number[] = [];
  DOLLAR_RE.lastIndex = 0;
  let dm: RegExpExecArray | null;
  while ((dm = DOLLAR_RE.exec(text)) !== null) dollars.push(parseUsd(dm[1]!));
  // Prefer the large basket figure; ignore small acquisition thresholds (e.g. $20,000,000).
  const materialDollars = dollars.filter((d) => d >= 100_000_000);
  const fixedAmountUsd = materialDollars.length > 0 ? Math.max(...materialDollars) : dollars.length === 1 ? dollars[0]! : null;
  if (fixedAmountUsd == null) {
    return {
      class: "NOT_GREATER_OF_ASSETS",
      fixedAmountUsd: null,
      percentFraction: pct.fraction,
      percentRaw: pct.raw,
      metricName: pct.metric,
      metricExcerpt: pct.excerpt,
      sharedCounterpartRefs: [],
      residuals: [],
      reasons: ["no_material_fixed_dollar_limb"],
    };
  }

  const allCross = [...text.matchAll(CROSS_SEC_RE)].map((m) => m[0].replace(/\s+/g, " "));
  // Prefer a counterpart other than a self-reference inside the same clause text.
  const sharedCounterpartRefs = [...new Set(allCross)];
  const residuals: GreaterOfResidual[] = [];
  const push = (kind: GreaterOfResidual["kind"], re: RegExp, gateInputName: string) => {
    const hit = text.match(re);
    if (hit) residuals.push({ kind, excerpt: hit[0].slice(0, 120), gateInputName });
  };
  push("SHARED_CAP_COMBINE", SHARED_RE, "qualitative_gate:shared_cap_combine_satisfied");
  const counterpart =
    sharedCounterpartRefs.find((r) => !/Section\s+7\.03\(g\)/i.test(r) && !/Section\s+7\.01\(u\)/i.test(r)) ??
    // If both u and g appear, keep the "other" family marker when both are present.
    (sharedCounterpartRefs.length > 1 ? sharedCounterpartRefs.find((r) => /7\.01\(u\)|7\.03\(g\)/i.test(r)) : sharedCounterpartRefs[0]);
  // Prefer the first cross-ref that is not a pure self-echo of every marker; take the
  // numerically "other" of the common MHK pair when both are present.
  const preferredCounterpart = (() => {
    const hasU = sharedCounterpartRefs.some((r) => /7\.01\(u\)/i.test(r));
    const hasG = sharedCounterpartRefs.some((r) => /7\.03\(g\)/i.test(r));
    if (hasU && hasG) {
      // Lien basket cites debt counterpart; debt basket cites lien counterpart.
      if (/\badditional\s+Liens\b/i.test(text)) return "Section 7.03(g)";
      if (/\badditional\s+Indebtedness\b/i.test(text)) return "Section 7.01(u)";
    }
    return counterpart ?? null;
  })();
  if (preferredCounterpart) {
    const crossHit = text.match(
      new RegExp(
        `(?:pursuant\\s+to|under|permitted\\s+under)\\s+${preferredCounterpart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i",
      ),
    );
    residuals.push({
      kind: "CROSS_SECTION_LINK",
      excerpt: (crossHit?.[0] ?? preferredCounterpart).slice(0, 120),
      gateInputName: "qualitative_gate:cross_section_condition_satisfied",
    });
  }
  push("PROVISO_OR_CONDITIONAL", PROVISO_RE, "qualitative_gate:proviso_satisfied");
  push("PRO_FORMA_ADJUSTMENT", PRO_FORMA_RE, "qualitative_gate:pro_forma_election_acknowledged");
  push("AS_OF_MEASUREMENT", AS_OF_RE, "qualitative_gate:as_of_measurement_satisfied");
  push("OBJECT_RESTRICTION", OBJECT_RE, "qualitative_gate:object_restriction_satisfied");

  reasons.push("greater_of_fixed_or_pct_total_assets");
  return {
    class:
      residuals.length === 0
        ? "GREATER_OF_FIXED_OR_PCT_ASSETS"
        : "GREATER_OF_FIXED_OR_PCT_ASSETS_WITH_QUALITATIVE_GATES",
    fixedAmountUsd,
    percentFraction: pct.fraction,
    percentRaw: pct.raw,
    metricName: pct.metric,
    metricExcerpt: pct.excerpt,
    sharedCounterpartRefs: [...new Set(sharedCounterpartRefs)],
    residuals,
    reasons,
  };
}

/** True when two operative texts mutually assert without-duplication combination. */
export function detectMutualSharedCapacity(args: {
  textA: string;
  refA: string;
  textB: string;
  refB: string;
}): { shared: boolean; evidence: string[] } {
  const norm = (s: string) => s.replace(/\s+/g, " ");
  const a = norm(args.textA);
  const b = norm(args.textB);
  const evidence: string[] = [];
  const combineStem = /\bwhen\s+combined\s*\(\s*without\s+duplication\s*\)/i;
  const aHasCombine = combineStem.test(a);
  const bHasCombine = combineStem.test(b);
  const aCitesB = new RegExp(args.refB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(a);
  const bCitesA = new RegExp(args.refA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(b);
  if (aHasCombine) evidence.push(`${args.refA}: when combined (without duplication)`);
  if (bHasCombine) evidence.push(`${args.refB}: when combined (without duplication)`);
  if (aCitesB) evidence.push(`${args.refA} cites ${args.refB}`);
  if (bCitesA) evidence.push(`${args.refB} cites ${args.refA}`);
  return { shared: aHasCombine && bHasCombine && aCitesB && bCitesA, evidence };
}
