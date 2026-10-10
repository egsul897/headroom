/**
 * Authoritative utilization contract — single source of truth for remaining-capacity claims.
 *
 * Reconciles:
 * - Solver shared-usage statuses (#232)
 * - Completeness-certificate model (#234 `resolveUtilization` / `computeVerifiedRemaining`)
 *
 * Rules (non-negotiable):
 * 1. Empty ledger / missing history is UNKNOWN — never silent zero.
 * 2. Approved attributed records alone never prove completeness.
 * 3. Remaining = gross − usage requires an APPROVED completeness certificate
 *    (VERIFIED_EMPTY for zero, VERIFIED_COMPLETE when attributed records are the full set).
 * 4. Synthetic evidence may not publish customer AVAILABLE / remaining unless
 *    explicitly labeled and never as AUTHENTIC completeness.
 * 5. Failed gates never publish AVAILABLE (A8-01).
 */

import type {
  UtilizationCompletenessCertificate,
  UtilizationKnowledgeKind,
  UtilizationResolution,
} from "./utilization-types";

/** Canonical authority decision for any remaining-capacity consumer. */
export type UtilizationAuthorityKind =
  | "KNOWN_ATTRIBUTED"
  | "VERIFIED_ZERO"
  | "UNKNOWN"
  | "PARTIALLY_KNOWN"
  | "EXTERNAL_UNKNOWN"
  | "SYNTHETIC_ONLY";

export type UtilizationAuthorityDecision = {
  kind: UtilizationAuthorityKind;
  /** Sum of attributed usage when well-defined; null when unknown/partial. */
  attributedAmount: number | null;
  /**
   * True only when remaining = gross − usage may be published.
   * Requires matching APPROVED completeness certificate.
   */
  supportsRemainingClaim: boolean;
  completenessCertified: boolean;
  /** True when numeric usage may be subtracted from a known gross. Alias of supportsRemainingClaim. */
  authoritativeForRemaining: boolean;
  blockers: string[];
  note: string;
  /** Solver-facing status string (compat with SharedCapacityConstraint.currentUsageStatus). */
  solverStatus:
    | "COMPUTED"
    | "VERIFIED_ZERO"
    | "ZERO_NO_ATTRIBUTED_USAGE"
    | "PARTIAL_ATTRIBUTED_USAGE"
    | "ATTRIBUTED_INCOMPLETE"
    | "EXTERNAL_INPUT_REQUIRED"
    | "ENTITY_CLASS_USAGE_UNAVAILABLE";
};

export type SolverUsageObservation = {
  /** Number of named members on the constraint. */
  namedMemberCount: number;
  /** Named members that have an attributed basketUsage row. */
  attributedMemberCount: number;
  /** Measured usage across attributed members (0 when none). */
  measuredUsage: number;
  aggregation:
    | "NAMED_MEMBER_CLAUSES"
    | "EXTERNAL_INSTRUMENT_BALANCE"
    | "ENTITY_CLASS_FILTER"
    | string;
  /**
   * Completeness certificate for this constraint/path. Required for remaining.
   * Synthetic certificates must set authenticity SYNTHETIC_LABELED and are refused
   * for authoritative remaining unless allowSyntheticRemaining is true (tests only).
   */
  completenessCertificate?: (UtilizationCompletenessCertificate & {
    authenticity?: "AUTHENTIC" | "SYNTHETIC_LABELED";
  }) | null;
  /** Test-only escape hatch — never set in production loaders. */
  allowSyntheticRemaining?: boolean;
};

function certOk(
  cert: SolverUsageObservation["completenessCertificate"],
  allowSynthetic: boolean | undefined,
): cert is UtilizationCompletenessCertificate & { authenticity?: "AUTHENTIC" | "SYNTHETIC_LABELED" } {
  if (!cert || cert.approvalState !== "APPROVED") return false;
  if (cert.authenticity === "SYNTHETIC_LABELED" && !allowSynthetic) return false;
  return true;
}

/**
 * Decide utilization authority from solver-layer observation + optional completeness cert.
 * This is the bridge used by `computeSharedConstraintCurrentUsage`.
 */
export function decideSolverUtilizationAuthority(obs: SolverUsageObservation): UtilizationAuthorityDecision {
  if (obs.aggregation === "EXTERNAL_INSTRUMENT_BALANCE") {
    return {
      kind: "EXTERNAL_UNKNOWN",
      attributedAmount: null,
      supportsRemainingClaim: false,
      completenessCertified: false,
      authoritativeForRemaining: false,
      blockers: ["EXTERNAL_INSTRUMENT_BALANCE requires external instrument balances — not invented"],
      note: "External instrument balance unknown — remaining not supported.",
      solverStatus: "EXTERNAL_INPUT_REQUIRED",
    };
  }
  if (obs.aggregation === "ENTITY_CLASS_FILTER") {
    return {
      kind: "EXTERNAL_UNKNOWN",
      attributedAmount: null,
      supportsRemainingClaim: false,
      completenessCertified: false,
      authoritativeForRemaining: false,
      blockers: ["ENTITY_CLASS_FILTER outstanding usage unavailable"],
      note: "Entity-class usage unknown — remaining not supported.",
      solverStatus: "ENTITY_CLASS_USAGE_UNAVAILABLE",
    };
  }

  if (obs.namedMemberCount === 0 || obs.attributedMemberCount === 0) {
    return {
      kind: "UNKNOWN",
      attributedAmount: null,
      supportsRemainingClaim: false,
      completenessCertified: false,
      authoritativeForRemaining: false,
      blockers: ["no attributed utilization evidence; empty ledger is not verified zero"],
      note: "Utilization UNKNOWN — missing history is never defaulted to zero.",
      solverStatus: "ZERO_NO_ATTRIBUTED_USAGE",
    };
  }

  if (obs.attributedMemberCount < obs.namedMemberCount) {
    return {
      kind: "PARTIALLY_KNOWN",
      attributedAmount: Math.max(0, obs.measuredUsage),
      supportsRemainingClaim: false,
      completenessCertified: false,
      authoritativeForRemaining: false,
      blockers: ["partial attribution — some named members lack attributed usage records"],
      note: "Partial attribution — remaining capacity claim blocked.",
      solverStatus: "PARTIAL_ATTRIBUTED_USAGE",
    };
  }

  const usage = Math.max(0, obs.measuredUsage);
  const cert = obs.completenessCertificate ?? null;
  const certified = certOk(cert, obs.allowSyntheticRemaining);

  if (usage === 0) {
    if (certified && cert!.kind === "VERIFIED_EMPTY") {
      return {
        kind: "VERIFIED_ZERO",
        attributedAmount: 0,
        supportsRemainingClaim: true,
        completenessCertified: true,
        authoritativeForRemaining: true,
        blockers: [],
        note: `Verified zero utilization per APPROVED VERIFIED_EMPTY certificate (${cert!.sourceLabel}).`,
        solverStatus: "VERIFIED_ZERO",
      };
    }
    if (certified && cert!.kind === "VERIFIED_COMPLETE") {
      return {
        kind: "PARTIALLY_KNOWN",
        attributedAmount: 0,
        supportsRemainingClaim: false,
        completenessCertified: false,
        authoritativeForRemaining: false,
        blockers: ["VERIFIED_COMPLETE requires attributed records with non-empty evidence set — use VERIFIED_EMPTY for zero"],
        note: "Completeness certificate kind mismatch for zero usage.",
        solverStatus: "ATTRIBUTED_INCOMPLETE",
      };
    }
    return {
      kind: "KNOWN_ATTRIBUTED",
      attributedAmount: 0,
      supportsRemainingClaim: false,
      completenessCertified: false,
      authoritativeForRemaining: false,
      blockers: [
        "attributed zero rows do not establish completeness of historical usage — remaining requires VERIFIED_EMPTY certificate",
      ],
      note: "Attributed members report zero outstanding, but completeness is not certified — remaining not supported.",
      solverStatus: "ATTRIBUTED_INCOMPLETE",
    };
  }

  // usage > 0, all members attributed
  if (certified && cert!.kind === "VERIFIED_COMPLETE") {
    if (cert!.authenticity === "SYNTHETIC_LABELED" && !obs.allowSyntheticRemaining) {
      return {
        kind: "SYNTHETIC_ONLY",
        attributedAmount: usage,
        supportsRemainingClaim: false,
        completenessCertified: false,
        authoritativeForRemaining: false,
        blockers: ["synthetic completeness evidence cannot publish authoritative remaining"],
        note: "Synthetic utilization evidence — remaining not published as AUTHENTIC AVAILABLE.",
        solverStatus: "ATTRIBUTED_INCOMPLETE",
      };
    }
    return {
      kind: "KNOWN_ATTRIBUTED",
      attributedAmount: usage,
      supportsRemainingClaim: true,
      completenessCertified: true,
      authoritativeForRemaining: true,
      blockers: [],
      note: `Attributed utilization ${usage} with VERIFIED_COMPLETE certificate (${cert!.sourceLabel}).`,
      solverStatus: "COMPUTED",
    };
  }
  if (certified && cert!.kind === "VERIFIED_EMPTY") {
    return {
      kind: "PARTIALLY_KNOWN",
      attributedAmount: usage,
      supportsRemainingClaim: false,
      completenessCertified: false,
      authoritativeForRemaining: false,
      blockers: ["VERIFIED_EMPTY conflicts with positive attributed usage"],
      note: "Completeness certificate kind mismatch (EMPTY vs positive usage).",
      solverStatus: "ATTRIBUTED_INCOMPLETE",
    };
  }
  return {
    kind: "KNOWN_ATTRIBUTED",
    attributedAmount: usage,
    supportsRemainingClaim: false,
    completenessCertified: false,
    authoritativeForRemaining: false,
    blockers: [
      "approved attributed records do not establish completeness — remaining requires VERIFIED_COMPLETE certificate",
    ],
    note: `Known attributed utilization ${usage}, completeness not certified — remaining not supported.`,
    solverStatus: "ATTRIBUTED_INCOMPLETE",
  };
}

/** Map a #234 UtilizationResolution onto the authority decision (product path). */
export function authorityFromUtilizationResolution(r: UtilizationResolution): UtilizationAuthorityDecision {
  const syntheticOnly = r.recordsApplied.some((x) => x.authenticity === "SYNTHETIC_LABELED")
    && r.recordsApplied.every((x) => x.authenticity === "SYNTHETIC_LABELED");
  if (syntheticOnly && r.supportsRemainingClaim) {
    // Defensive: product should never mark synthetic as remaining-supporting without allow flag.
    return {
      kind: "SYNTHETIC_ONLY",
      attributedAmount: r.attributedAmount,
      supportsRemainingClaim: false,
      completenessCertified: false,
      authoritativeForRemaining: false,
      blockers: [...r.blockers, "synthetic-only evidence cannot publish authoritative remaining"],
      note: "Synthetic utilization evidence — remaining withheld.",
      solverStatus: "ATTRIBUTED_INCOMPLETE",
    };
  }

  let kind: UtilizationAuthorityKind;
  const k = r.knowledge as UtilizationKnowledgeKind;
  if (k === "VERIFIED_ZERO") kind = "VERIFIED_ZERO";
  else if (k === "UNKNOWN") kind = "UNKNOWN";
  else if (k === "PARTIALLY_KNOWN" || k === "SUPERSEDED_EXCLUDED" || k === "UNATTRIBUTED_LEGACY_BASKET") kind = "PARTIALLY_KNOWN";
  else if (k === "KNOWN_ATTRIBUTED" || k === "SHARED_POOL" || k === "RECLASSIFIED") kind = "KNOWN_ATTRIBUTED";
  else kind = "UNKNOWN";

  let solverStatus: UtilizationAuthorityDecision["solverStatus"] = "ZERO_NO_ATTRIBUTED_USAGE";
  if (r.supportsRemainingClaim && kind === "VERIFIED_ZERO") solverStatus = "VERIFIED_ZERO";
  else if (r.supportsRemainingClaim) solverStatus = "COMPUTED";
  else if (kind === "PARTIALLY_KNOWN") solverStatus = "PARTIAL_ATTRIBUTED_USAGE";
  else if (kind === "KNOWN_ATTRIBUTED") solverStatus = "ATTRIBUTED_INCOMPLETE";
  else solverStatus = "ZERO_NO_ATTRIBUTED_USAGE";

  return {
    kind,
    attributedAmount: r.attributedAmount,
    supportsRemainingClaim: r.supportsRemainingClaim,
    completenessCertified: r.completenessCertified,
    authoritativeForRemaining: r.supportsRemainingClaim,
    blockers: r.blockers,
    note: r.note,
    solverStatus,
  };
}

/** Hard guard for any consumer about to publish AVAILABLE / numeric remaining. */
export function assertMayPublishRemaining(decision: UtilizationAuthorityDecision): boolean {
  return decision.authoritativeForRemaining === true && decision.supportsRemainingClaim === true;
}
