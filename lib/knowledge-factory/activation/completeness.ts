/**
 * Cycle 6 — operative completeness for counsel-compile eligibility.
 *
 * Formula discovery / EXECUTABLE_FORMULA_CANDIDATE ≠ legally complete rule.
 * Abbreviated excerpts must not be promoted to complete-rule representations.
 */

import type { CovenantSummaryItem } from "../../product/covenant-intelligence/summarize";

export type PromotionState =
  /** Formula shape discovered; not executable. */
  | "DISCOVERED"
  /** Numeric formula may be evaluated with labeled inputs; NOT legally complete. */
  | "EXECUTABLE_FORMULA_ONLY"
  /** Evidence sufficient for counsel review queue (still UNVERIFIED). */
  | "REVIEW_READY"
  /** May enter parseCounselFormulaForTest → compileAcceptedInterpretation. */
  | "COUNSEL_COMPILE_ELIGIBLE"
  /** Never set by KF activation — requires counsel ACCEPT + durable lifecycle. */
  | "PRODUCTION_AUTHORITATIVE";

export interface CompletenessVerdict {
  complete: boolean;
  abbreviatedExcerpt: boolean;
  conditionsStructured: boolean;
  chapeauPresent: boolean;
  definitionsBlocking: boolean;
  nonPermissionThreshold: boolean;
  reasons: string[];
}

const CONDITION_RE =
  /\b(?:provided that|so long as|subject to|no Default|Event of Default|Payment Conditions)\b/i;

const CHAPEAU_RE =
  /\b(?:shall not|may not|will not|agrees not to|not to exceed|Incur|create|assume|No Obligor shall)\b/i;

/** Headings that are monetary but never affirmative capacity baskets. */
export const NON_PERMISSION_HEADING_RE =
  /\b(?:Events?\s+of\s+Default|Judgments?|Indemnit(?:y|ies)|Mandatory\s+Prepayments?|Prepayment\s+of\s+Loans|Financial\s+(?:Statements|Reporting)|Reporting\s+Requirements|Notices?\s+and\s+Reports|Information\s+Covenants?)\b/i;

export const NON_PERMISSION_FAMILIES_RE =
  /^(?:EVENTS_OF_DEFAULT|JUDGMENTS?|MANDATORY_PREPAYMENTS|REPORTING_COVENANTS?|INFORMATION_COVENANTS?)$/i;

const CAPACITY_HEADING_RE =
  /\b(?:Indebtedness|Liens?|Restricted Payments?|Dividends?|Distributions?|Investments?|Asset (?:Sales?|Dispositions?)|Sales?\s+of\s+Assets)\b/i;

export function isNonPermissionThreshold(item: Pick<CovenantSummaryItem, "heading" | "families" | "sectionRef">): boolean {
  const heading = item.heading ?? "";
  // Heading is authoritative for EOD / judgment / indemnity / prepay / reporting articles.
  if (NON_PERMISSION_HEADING_RE.test(heading) && !CAPACITY_HEADING_RE.test(heading)) return true;
  const families = item.families ?? [];
  const hasCapacityFamily =
    families.some((f) =>
      /INDEBTEDNESS|LIENS?|RESTRICTED_PAYMENTS?|INVESTMENTS?|AVAILABLE_AMOUNT|ASSET_SALES?/i.test(f),
    ) || CAPACITY_HEADING_RE.test(heading);
  const hasNonPermissionFamily = families.some((f) => NON_PERMISSION_FAMILIES_RE.test(f));
  // Family-only block when non-permission is present without a capacity family/heading
  // (avoids co-tagged EVENTS_OF_DEFAULT on real baskets that merely mention Defaults).
  if (hasNonPermissionFamily && !hasCapacityFamily) return true;
  return false;
}

export function assessOperativeCompleteness(params: {
  item: CovenantSummaryItem;
  operativeExcerpt: string;
  /** Optional fuller operative window from source bytes (when available). */
  fullOperativeWindow?: string;
}): CompletenessVerdict {
  const excerpt = (params.operativeExcerpt ?? "").replace(/\s+/g, " ").trim();
  const reasons: string[] = [];
  const nonPermission = isNonPermissionThreshold(params.item);
  if (nonPermission) reasons.push("non_permission_monetary_threshold");

  const chapeauPresent = CHAPEAU_RE.test(excerpt);
  if (!chapeauPresent) reasons.push("missing_chapeau_or_operative_verb");

  const minLen = params.item.families?.some((f) => /INDEBTEDNESS|LIEN|RESTRICTED_PAYMENT/i.test(f)) ? 160 : 120;
  const abbreviatedExcerpt =
    excerpt.length < minLen ||
    /\b(?:\.\.\.|…)\s*$/.test(excerpt) ||
    /,\s*$/.test(excerpt) ||
    /\b(?:and|or|the|of|to|under|pursuant)\s*$/i.test(excerpt);
  if (abbreviatedExcerpt) reasons.push("abbreviated_operative_excerpt");

  const hasConditionLang = CONDITION_RE.test(excerpt);
  const conditionsStructured = !hasConditionLang || (params.item.conditions ?? []).length > 0;
  if (!conditionsStructured) reasons.push("conditions_not_structured");

  // If fuller window shows condition/proviso language absent from the excerpt → incomplete.
  const full = (params.fullOperativeWindow ?? "").replace(/\s+/g, " ").trim();
  if (full.length > excerpt.length + 80) {
    const fullHasCond = CONDITION_RE.test(full);
    const excerptHasCond = CONDITION_RE.test(excerpt);
    if (fullHasCond && !excerptHasCond) {
      reasons.push("conditions_only_in_full_operative_window");
    }
    const fullHasShared =
      /\b(?:combined with|without duplication|pursuant to clauses?)\b/i.test(full) &&
      !/\b(?:combined with|without duplication|pursuant to clauses?)\b/i.test(excerpt);
    if (fullHasShared) reasons.push("shared_capacity_only_in_full_window");
  }

  const definitionsBlocking = (params.item.applicableDefinitions ?? []).some((d) => d.resolved === false);
  if (definitionsBlocking) reasons.push("unresolved_definitions");

  const complete =
    !nonPermission &&
    chapeauPresent &&
    !abbreviatedExcerpt &&
    conditionsStructured &&
    !definitionsBlocking &&
    !reasons.includes("conditions_only_in_full_operative_window") &&
    !reasons.includes("shared_capacity_only_in_full_window");

  return {
    complete,
    abbreviatedExcerpt,
    conditionsStructured,
    chapeauPresent,
    definitionsBlocking,
    nonPermissionThreshold: nonPermission,
    reasons: [...new Set(reasons)],
  };
}

export function promotionStateFrom(params: {
  executableEligible: boolean;
  counselCompileEligible: boolean;
  readiness: string;
}): PromotionState {
  if (params.counselCompileEligible) return "COUNSEL_COMPILE_ELIGIBLE";
  if (params.executableEligible) return "EXECUTABLE_FORMULA_ONLY";
  if (params.readiness === "REVIEW_REQUIRED" || params.readiness.startsWith("NEEDS_")) return "REVIEW_READY";
  return "DISCOVERED";
}
