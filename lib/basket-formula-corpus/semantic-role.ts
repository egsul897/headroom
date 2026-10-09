/**
 * Legal-semantic role model for basket/formula intelligence.
 *
 * Distinguishes permission authority from ceilings, consumption rules,
 * shared-capacity limits, financial formulas, definitions, prohibition
 * thresholds, and conditional exceptions.
 *
 * Aligns with Architecture Remediation / Legal Core: a shall-not-exceed
 * ceiling is not independently executable permission (see §7.04 THRESHOLD
 * vs permission conflict pattern from PR #136).
 *
 * Does not modify the Legal Core verifier or the production capacity engine.
 */

export const SEMANTIC_ROLES = [
  "PERMISSION_AUTHORITY",
  "CAPACITY_CEILING",
  "CAPACITY_CONSUMPTION",
  "SHARED_CAPACITY_LIMITATION",
  "FINANCIAL_FORMULA",
  "DEFINITION",
  "PROHIBITION_THRESHOLD",
  "CONDITIONAL_EXCEPTION",
  "INCOMPLETE_OR_AMBIGUOUS",
] as const;

export type SemanticRole = (typeof SEMANTIC_ROLES)[number];

export interface SemanticRoleClassification {
  role: SemanticRole;
  /** Maps to corpus capacitySemantics without promoting executability. */
  capacitySemantics: "AFFIRMATIVE_CAPACITY" | "NOT_CAPACITY" | "INCOMPLETE_SEMANTICS";
  rationale: string;
  /** True only when operative permission language is present in-span or bound. */
  suppliesPermissionAuthority: boolean;
  /** True when the span is a numeric/ratio ceiling or threshold. */
  isCeilingOrThreshold: boolean;
}

const MAY_RE =
  /\b(may|is permitted to|shall be permitted to|borrower(?:s)? may|the company may)\b/i;
const CEILING_RE =
  /\b(shall not exceed|may not exceed|not to exceed|in an aggregate (?:principal )?amount (?:not|which[, ]+when))\b/i;
const PROHIBITION_RE =
  /\b(shall not|may not|will not)\b.{0,80}\b(incur|create|make|permit|suffer to exist)\b/i;
const DEFINITION_RE = /^\s*[“"']?[A-Z][^”"']{0,120}[”"']?\s+means\b/i;
const WITHOUT_DUP_RE = /\bwithout (?:duplication|double counting)\b/i;
const SHARED_RE = /\b(together with|in the aggregate with|shared (?:basket|capacity)|available rp capacity)\b/i;
const SUBJECT_TO_RE = /\b(subject to|so long as|provided that|provided,? however)\b/i;

export function classifySemanticRole(input: {
  spanText: string;
  governingContext?: string | null;
  hasBoundPermissionAuthority?: boolean;
  spanFidelity?: "OPERATIVE_PROVISION" | "NUMERICAL_FRAGMENT" | "HEADING_ONLY" | "UNRESOLVED";
}): SemanticRoleClassification {
  const span = input.spanText || "";
  const ctx = `${span}\n${input.governingContext || ""}`;
  const fidelity = input.spanFidelity ?? "UNRESOLVED";
  const thin = fidelity === "NUMERICAL_FRAGMENT" || fidelity === "HEADING_ONLY" || fidelity === "UNRESOLVED";

  if (DEFINITION_RE.test(span) && !MAY_RE.test(span)) {
    return {
      role: "DEFINITION",
      capacitySemantics: "INCOMPLETE_SEMANTICS",
      rationale: "Definitional formula without operative permission language.",
      suppliesPermissionAuthority: false,
      isCeilingOrThreshold: false,
    };
  }

  // Anti-duplication must appear in the extracted span itself — not merely in an
  // expanded governing window — or builders/permissions get over-demoted.
  if (WITHOUT_DUP_RE.test(span) && !MAY_RE.test(span) && !/other (indebtedness|investments|liens)/i.test(span)) {
    return {
      role: "CAPACITY_CONSUMPTION",
      capacitySemantics: "NOT_CAPACITY",
      rationale: "Anti-duplication / consumption sequencing constrains counting; does not grant permission.",
      suppliesPermissionAuthority: false,
      isCeilingOrThreshold: false,
    };
  }

  if (SHARED_RE.test(span) && CEILING_RE.test(span) && !MAY_RE.test(span)) {
    return {
      role: "SHARED_CAPACITY_LIMITATION",
      capacitySemantics: "NOT_CAPACITY",
      rationale: "Shared-capacity aggregate limitation; not standalone permission authority.",
      suppliesPermissionAuthority: false,
      isCeilingOrThreshold: true,
    };
  }

  // Shall-not-exceed aggregate ceiling without "may" = threshold/ceiling (PR #136 pattern).
  if (CEILING_RE.test(span) && !MAY_RE.test(span) && (PROHIBITION_RE.test(ctx) || /\bindebtedness\b/i.test(span))) {
    if (input.hasBoundPermissionAuthority) {
      return {
        role: "CAPACITY_CEILING",
        capacitySemantics: "NOT_CAPACITY",
        rationale:
          "Numeric/ratio ceiling limiting a separately granted permission; not independently executable permission.",
        suppliesPermissionAuthority: false,
        isCeilingOrThreshold: true,
      };
    }
    return {
      role: "PROHIBITION_THRESHOLD",
      capacitySemantics: "NOT_CAPACITY",
      rationale:
        "Shall-not-exceed / aggregate ceiling without affirmative permission authority in-span (Legal Core THRESHOLD pattern).",
      suppliesPermissionAuthority: false,
      isCeilingOrThreshold: true,
    };
  }

  if (MAY_RE.test(span) && (CEILING_RE.test(span) || SUBJECT_TO_RE.test(span) || /unlimited/i.test(span))) {
    const conditional = SUBJECT_TO_RE.test(span);
    return {
      role: conditional ? "CONDITIONAL_EXCEPTION" : "PERMISSION_AUTHORITY",
      capacitySemantics: thin ? "INCOMPLETE_SEMANTICS" : "AFFIRMATIVE_CAPACITY",
      rationale: conditional
        ? "Affirmative permission framed as conditional exception; authority present when span is operative."
        : "Operative permission authority with capacity framing.",
      suppliesPermissionAuthority: !thin,
      isCeilingOrThreshold: CEILING_RE.test(span),
    };
  }

  // Exception basket: "other Indebtedness ... not to exceed" without explicit may.
  if (
    /\b(other )?(indebtedness|liens?|investments?|restricted payments?)\b/i.test(span) &&
    CEILING_RE.test(span) &&
    !thin
  ) {
    return {
      role: "CONDITIONAL_EXCEPTION",
      capacitySemantics: "AFFIRMATIVE_CAPACITY",
      rationale: "Exception-to-prohibition basket with operative ceiling language.",
      suppliesPermissionAuthority: true,
      isCeilingOrThreshold: true,
    };
  }

  if (thin && /(\$\d|greater of|\d%\s+of)/i.test(span)) {
    return {
      role: "FINANCIAL_FORMULA",
      capacitySemantics: "INCOMPLETE_SEMANTICS",
      rationale: "Numerical/greater-of fragment without bound governing permission — incomplete.",
      suppliesPermissionAuthority: false,
      isCeilingOrThreshold: true,
    };
  }

  return {
    role: "INCOMPLETE_OR_AMBIGUOUS",
    capacitySemantics: "INCOMPLETE_SEMANTICS",
    rationale: "Insufficient operative language to classify as permission authority or ceiling.",
    suppliesPermissionAuthority: false,
    isCeilingOrThreshold: false,
  };
}

/**
 * Mandatory A/B relationship: Section A ceiling + Section B permission subject to A.
 * No duplicate capacity; A is not independently executable permission.
 */
export interface CeilingPermissionLink {
  permissionAuthorityId: string;
  ceilingId: string;
  relationship: "PERMISSION_SUBJECT_TO_CEILING";
  duplicateCapacityCreated: false;
  ceilingIndependentlyExecutable: false;
  failsClosedWhenAuthorityOrInputsMissing: true;
  note: string;
}

export function linkPermissionToCeiling(input: {
  permissionAuthorityId: string;
  ceilingId: string;
  permissionRole: SemanticRole;
  ceilingRole: SemanticRole;
}): CeilingPermissionLink {
  if (input.permissionRole !== "PERMISSION_AUTHORITY" && input.permissionRole !== "CONDITIONAL_EXCEPTION") {
    throw new Error("permissionAuthorityId must classify as permission authority or conditional exception");
  }
  if (input.ceilingRole !== "CAPACITY_CEILING" && input.ceilingRole !== "PROHIBITION_THRESHOLD") {
    throw new Error("ceilingId must classify as capacity ceiling or prohibition threshold");
  }
  return {
    permissionAuthorityId: input.permissionAuthorityId,
    ceilingId: input.ceilingId,
    relationship: "PERMISSION_SUBJECT_TO_CEILING",
    duplicateCapacityCreated: false,
    ceilingIndependentlyExecutable: false,
    failsClosedWhenAuthorityOrInputsMissing: true,
    note: "Section B supplies affirmative permission; Section A supplies the limitation only.",
  };
}
