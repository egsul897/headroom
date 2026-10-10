/**
 * Authoritative utilization contract — single source of truth for remaining-capacity claims.
 *
 * Reconciles:
 * - Solver shared-usage statuses (#232 / #237)
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
 * 6. Production-authoritative remaining requires explicit authenticity AUTHENTIC
 *    and trusted-issuer authorization — APPROVED alone, missing authenticity, or
 *    a caller-supplied issuer.role without registry verification never suffice.
 *    (Selective port from #244; coordinates with #241 authenticity gate. Does not
 *    replace this #237 authority bridge with #244's shared-usage rewrite.)
 */

import {
  authorizeCompletenessIssuer,
  type TrustedIssuerAuthorizationContext,
} from "./completeness-issuer-auth";
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

/** Solver-path completeness input — authenticity required for production authority. */
export type SolverCompletenessCertInput = UtilizationCompletenessCertificate & {
  authenticity?: "AUTHENTIC" | "SYNTHETIC_LABELED";
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
  completenessCertificate?: SolverCompletenessCertInput | null;
  /**
   * Trusted identity/authorization registry for certificate issuers.
   * Required for production-authoritative remaining (not for allowSyntheticRemaining demos).
   * Host identity-provider wiring is an activation requirement until real attestations land.
   */
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  /** Test-only escape hatch — never set in production loaders. */
  allowSyntheticRemaining?: boolean;
};

/**
 * Structural cert gate: APPROVED + authenticity present.
 * Missing authenticity refuses. SYNTHETIC_LABELED only with allowSynthetic.
 * Does not alone establish production-authoritative remaining — see productionAuthorityOk.
 */
function certOk(
  cert: SolverCompletenessCertInput | null | undefined,
  allowSynthetic: boolean | undefined,
): cert is SolverCompletenessCertInput {
  if (!cert || cert.approvalState !== "APPROVED") return false;
  // Missing authenticity must not establish production (or any) remaining authority.
  if (cert.authenticity !== "AUTHENTIC" && cert.authenticity !== "SYNTHETIC_LABELED") {
    return false;
  }
  if (cert.authenticity === "SYNTHETIC_LABELED" && !allowSynthetic) return false;
  return true;
}

/**
 * Production-authoritative remaining requires AUTHENTIC authenticity and a
 * trusted-issuer authorization for the certificate's issuer.actorId.
 * Caller-supplied issuer.role alone never suffices (#244 selective port).
 */
function productionAuthorityOk(
  cert: SolverCompletenessCertInput,
  trustedIssuerAuth: TrustedIssuerAuthorizationContext | null | undefined,
): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (cert.authenticity !== "AUTHENTIC") {
    blockers.push(
      "production-authoritative remaining requires authenticity AUTHENTIC — missing or synthetic authenticity refused",
    );
  }
  if (!cert.issuer?.actorId || !cert.issuer?.role) {
    blockers.push(
      "production-authoritative remaining requires certificate issuer (actorId + role) — unverified issuer authority refused",
    );
  } else {
    const auth = authorizeCompletenessIssuer(
      { actorId: cert.issuer.actorId, role: cert.issuer.role },
      trustedIssuerAuth,
    );
    if (!auth.ok) {
      blockers.push(...auth.blockers);
    } else if (!trustedIssuerAuth?.requireNonFixtureIdentity) {
      blockers.push(
        "production-authoritative remaining requires trustedIssuerAuth.requireNonFixtureIdentity",
      );
    } else if (
      auth.matchedPrincipal &&
      auth.matchedPrincipal.identityAssurance !== "SESSION_AUTHENTICATED" &&
      auth.matchedPrincipal.identityAssurance !== "SERVICE_ACCOUNT"
    ) {
      blockers.push(
        "production-authoritative remaining requires SESSION_AUTHENTICATED or SERVICE_ACCOUNT issuer identity",
      );
    }
  }
  return { ok: blockers.length === 0, blockers };
}

function refuseAttributedIncomplete(
  usage: number | null,
  blockers: string[],
  note: string,
  solverStatus: UtilizationAuthorityDecision["solverStatus"] = "ATTRIBUTED_INCOMPLETE",
): UtilizationAuthorityDecision {
  return {
    kind: usage == null ? "UNKNOWN" : usage === 0 ? "KNOWN_ATTRIBUTED" : "KNOWN_ATTRIBUTED",
    attributedAmount: usage,
    supportsRemainingClaim: false,
    completenessCertified: false,
    authoritativeForRemaining: false,
    blockers,
    note,
    solverStatus,
  };
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
  const structuralOk = certOk(cert, obs.allowSyntheticRemaining);

  // Demo / test synthetic path — labeled SYNTHETIC_LABELED + allowSyntheticRemaining.
  // Never production-authoritative; does not require trusted issuer.
  const demoSyntheticOk =
    structuralOk &&
    obs.allowSyntheticRemaining === true &&
    cert!.authenticity === "SYNTHETIC_LABELED";

  const production = structuralOk && cert!.authenticity === "AUTHENTIC"
    ? productionAuthorityOk(cert!, obs.trustedIssuerAuth)
    : { ok: false, blockers: structuralOk ? [] as string[] : ["completeness certificate not structurally valid for remaining"] };

  const certifiedForRemaining = demoSyntheticOk || production.ok;

  if (usage === 0) {
    if (certifiedForRemaining && cert!.kind === "VERIFIED_EMPTY") {
      return {
        kind: "VERIFIED_ZERO",
        attributedAmount: 0,
        supportsRemainingClaim: true,
        completenessCertified: true,
        authoritativeForRemaining: true,
        blockers: [],
        note: demoSyntheticOk
          ? `Demo synthetic verified zero (${cert!.sourceLabel}) — not production-authoritative.`
          : `Verified zero utilization per APPROVED VERIFIED_EMPTY certificate (${cert!.sourceLabel}).`,
        solverStatus: "VERIFIED_ZERO",
      };
    }
    if (structuralOk && cert!.kind === "VERIFIED_COMPLETE") {
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
    const authBlockers = cert && cert.approvalState === "APPROVED" && !certifiedForRemaining
      ? [
          ...(cert.authenticity !== "AUTHENTIC" && cert.authenticity !== "SYNTHETIC_LABELED"
            ? ["APPROVED certificate missing authenticity — cannot establish production-authoritative remaining"]
            : []),
          ...(cert.authenticity === "AUTHENTIC" ? production.blockers : []),
          ...(cert.authenticity === "SYNTHETIC_LABELED" && !obs.allowSyntheticRemaining
            ? ["synthetic completeness evidence cannot publish authoritative remaining"]
            : []),
        ]
      : [];
    return refuseAttributedIncomplete(
      0,
      [
        "attributed zero rows do not establish completeness of historical usage — remaining requires VERIFIED_EMPTY certificate",
        ...authBlockers,
      ],
      "Attributed members report zero outstanding, but completeness is not certified — remaining not supported.",
    );
  }

  // usage > 0, all members attributed
  if (certifiedForRemaining && cert!.kind === "VERIFIED_COMPLETE") {
    return {
      kind: demoSyntheticOk ? "SYNTHETIC_ONLY" : "KNOWN_ATTRIBUTED",
      attributedAmount: usage,
      supportsRemainingClaim: true,
      completenessCertified: true,
      authoritativeForRemaining: true,
      blockers: [],
      note: demoSyntheticOk
        ? `Demo synthetic attributed utilization ${usage} (${cert!.sourceLabel}) — not production-authoritative.`
        : `Attributed utilization ${usage} with VERIFIED_COMPLETE certificate (${cert!.sourceLabel}).`,
      solverStatus: "COMPUTED",
    };
  }
  if (structuralOk && cert!.kind === "VERIFIED_EMPTY") {
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

  const authBlockers =
    cert && cert.approvalState === "APPROVED"
      ? [
          ...(cert.authenticity !== "AUTHENTIC" && cert.authenticity !== "SYNTHETIC_LABELED"
            ? ["APPROVED certificate missing authenticity — cannot establish production-authoritative remaining"]
            : []),
          ...(cert.authenticity === "AUTHENTIC" ? production.blockers : []),
          ...(cert.authenticity === "SYNTHETIC_LABELED" && !obs.allowSyntheticRemaining
            ? ["synthetic completeness evidence cannot publish authoritative remaining"]
            : []),
        ]
      : [];

  return refuseAttributedIncomplete(
    usage,
    [
      "approved attributed records do not establish completeness — remaining requires VERIFIED_COMPLETE certificate",
      ...authBlockers,
    ],
    `Known attributed utilization ${usage}, completeness not certified — remaining not supported.`,
  );
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
