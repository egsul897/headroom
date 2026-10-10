/**
 * Issuer-agnostic classification of fixed-dollar basket clauses.
 *
 * Detects a single "not to exceed" / "does not exceed" dollar cap and
 * surfaces residual material conditions that must be encoded as gates
 * (never silently dropped into an over-complete affirmative permission).
 */
export type FixedDollarBasketClass =
  | "FIXED_DOLLAR_SOLE_CAP"
  | "FIXED_DOLLAR_WITH_QUALITATIVE_GATES"
  | "NOT_FIXED_DOLLAR";

export interface ResidualCondition {
  kind:
    | "GEOGRAPHIC_SCOPE"
    | "OBJECT_RESTRICTION"
    | "SCHEDULE_REFERENCE"
    | "RATIO_OR_FINANCIAL_COVENANT"
    | "CROSS_SECTION_LINK"
    | "PROVISO_OR_CONDITIONAL"
    | "GROWER_OR_FORMULA"
    | "SHARED_CAP_COMBINE"
    | "OTHER_MATERIAL";
  excerpt: string;
  /** Stable input name used when encoding as TRANSACTION_INPUT_REFERENCE gate. */
  gateInputName: string;
}

export interface FixedDollarClassification {
  class: FixedDollarBasketClass;
  amountUsd: number | null;
  amountRaw: string | null;
  capRoleOk: boolean;
  residuals: ResidualCondition[];
  reasons: string[];
}

const CAP_ROLE_RE =
  /\b(?:not\s+to\s+exceed|does\s+not\s+exceed|shall\s+not\s+exceed|in\s+a\s+maximum\s+aggregate\s+amount\s+not\s+to\s+exceed)\b/i;
const DOLLAR_RE = /\$\s?([\d,]+(?:\.\d+)?)/g;
const COMPLEX_FORMULA_RE =
  /\b(?:greater\s+of|lesser\s+of|difference\s+between|Maximum\s+Facility\s+Amount|Facility\s+Amount|Total\s+(?:Consolidated\s+)?Assets|percent|%)\b|\b\d+(?:\.\d+)?\s*%/i;
const GEO_RE = /\b(?:organized|incorporated|formed)\s+outside\s+the\s+United\s+States\b|\bForeign\s+Subsidiar/i;
// Prefer longer unique excerpts so normalize provenance can bind an unambiguous
// source span (short stems like "in respect of" often appear twice in one clause).
const OBJECT_RE =
  /\b(?:in\s+connection\s+with\s+[^.;]{3,60}|in\s+respect\s+of\s+[^.;]{3,60}|arising\s+(?:under|from)\s+[^.;]{3,40}|secured\s+by\s+[^.;]{3,40}|on\s+cash\s+accounts(?:\s+[^.;]{0,40})?|Permitted\s+Receivables\s+Financings?)/i;
const SCHEDULE_RE = /\bSchedule\s+\d+(?:\([a-z0-9]+\))?/i;
const RATIO_RE = /\b(?:Leverage|Coverage)\s+Ratio\b|\bfinancial\s+covenants?\b|\bpro\s+forma\s+compliance\b/i;
const CROSS_SEC_RE = /\bSection\s+\d+\.\d+(?:\([a-z0-9]+\))?/i;
const PROVISO_RE = /\b(?:provided\s*,?\s*that|so\s+long\s+as|subject\s+to)\b/i;
const SHARED_RE = /\b(?:when\s+combined|without\s+duplication|together\s+with)\b/i;

function parseUsd(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

export function classifyFixedDollarBasket(operativeText: string): FixedDollarClassification {
  const text = operativeText.replace(/\s+/g, " ").trim();
  const reasons: string[] = [];
  if (!text || text.length < 12) {
    return { class: "NOT_FIXED_DOLLAR", amountUsd: null, amountRaw: null, capRoleOk: false, residuals: [], reasons: ["empty_or_too_short"] };
  }
  if (COMPLEX_FORMULA_RE.test(text)) {
    return {
      class: "NOT_FIXED_DOLLAR",
      amountUsd: null,
      amountRaw: null,
      capRoleOk: CAP_ROLE_RE.test(text),
      residuals: [],
      reasons: ["complex_formula_or_grower"],
    };
  }

  const dollars: { raw: string; amount: number }[] = [];
  DOLLAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DOLLAR_RE.exec(text)) !== null) {
    dollars.push({ raw: m[0], amount: parseUsd(m[1]!) });
  }
  if (dollars.length === 0) {
    return { class: "NOT_FIXED_DOLLAR", amountUsd: null, amountRaw: null, capRoleOk: false, residuals: [], reasons: ["no_dollar_amount"] };
  }
  if (dollars.length > 1) {
    // Allow duplicate identical amounts; reject multiple distinct figures.
    const distinct = [...new Set(dollars.map((d) => d.amount))];
    if (distinct.length > 1) {
      return {
        class: "NOT_FIXED_DOLLAR",
        amountUsd: null,
        amountRaw: null,
        capRoleOk: CAP_ROLE_RE.test(text),
        residuals: [],
        reasons: ["multiple_distinct_dollar_amounts"],
      };
    }
  }

  const capRoleOk = CAP_ROLE_RE.test(text);
  if (!capRoleOk) {
    return {
      class: "NOT_FIXED_DOLLAR",
      amountUsd: dollars[0]!.amount,
      amountRaw: dollars[0]!.raw,
      capRoleOk: false,
      residuals: [],
      reasons: ["dollar_present_but_not_cap_role"],
    };
  }

  const residuals: ResidualCondition[] = [];
  const push = (kind: ResidualCondition["kind"], re: RegExp, gateInputName: string) => {
    const hit = text.match(re);
    if (hit) residuals.push({ kind, excerpt: hit[0], gateInputName });
  };
  push("GEOGRAPHIC_SCOPE", GEO_RE, "qualitative_gate:foreign_organization");
  push("OBJECT_RESTRICTION", OBJECT_RE, "qualitative_gate:object_restriction_satisfied");
  push("SCHEDULE_REFERENCE", SCHEDULE_RE, "qualitative_gate:schedule_reference_satisfied");
  push("RATIO_OR_FINANCIAL_COVENANT", RATIO_RE, "qualitative_gate:financial_covenant_satisfied");
  push("CROSS_SECTION_LINK", CROSS_SEC_RE, "qualitative_gate:cross_section_condition_satisfied");
  push("PROVISO_OR_CONDITIONAL", PROVISO_RE, "qualitative_gate:proviso_satisfied");
  push("SHARED_CAP_COMBINE", SHARED_RE, "qualitative_gate:shared_cap_combine_satisfied");

  // "Restricted Compan(y|ies)" alone is standard obligor language, not a residual gate.
  if (residuals.length === 0) {
    reasons.push("sole_fixed_dollar_cap");
    return {
      class: "FIXED_DOLLAR_SOLE_CAP",
      amountUsd: dollars[0]!.amount,
      amountRaw: dollars[0]!.raw,
      capRoleOk: true,
      residuals: [],
      reasons,
    };
  }

  reasons.push("fixed_dollar_with_qualitative_residuals");
  return {
    class: "FIXED_DOLLAR_WITH_QUALITATIVE_GATES",
    amountUsd: dollars[0]!.amount,
    amountRaw: dollars[0]!.raw,
    capRoleOk: true,
    residuals,
    reasons,
  };
}
