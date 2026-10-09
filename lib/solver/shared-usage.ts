/**
 * Shared-constraint pre-transaction usage helpers.
 *
 * Aligned with PR #234 utilization completeness contract:
 * - Approved / attributed basketUsage records establish *known attributed usage only*.
 * - They do NOT establish completeness of historical usage.
 * - Remaining = cap − usage requires an affirmative completeness certificate
 *   (VERIFIED_EMPTY or VERIFIED_COMPLETE). Approved records alone never suffice.
 * - Missing attribution is ZERO_NO_ATTRIBUTED_USAGE / UNKNOWN — never invent zero.
 * - Partial attribution, external, entity-class, synthetic-without-cert, and
 *   mismatched certificates never support a remaining claim.
 */

import type {
  AggregationRule,
  BasketUsageRecord,
  MeasurementBasis,
  SharedConstraintMember,
} from "./types";

export type SharedUsageComputationStatus =
  | "COMPUTED"
  | "VERIFIED_ZERO"
  | "ZERO_NO_ATTRIBUTED_USAGE"
  | "PARTIAL_ATTRIBUTED_USAGE"
  | "EXTERNAL_INPUT_REQUIRED"
  | "ENTITY_CLASS_USAGE_UNAVAILABLE"
  | "COMPLETENESS_CERTIFICATE_INVALID";

/** Completeness certificate — required for any remaining-capacity claim (#234). */
export type UtilizationCompletenessKind = "VERIFIED_EMPTY" | "VERIFIED_COMPLETE";

export interface UtilizationCompletenessCertificate {
  kind: UtilizationCompletenessKind;
  approvalState: "APPROVED";
  /** ISO date; must be >= evaluation asOf when provided. */
  asOf: string;
  sourceLabel: string;
  /**
   * When set, certificate applies only to this constraint id.
   * Mismatched ids invalidate the certificate for the current constraint.
   */
  constraintId?: string;
  /** AUTHENTIC historical cert vs SYNTHETIC labeled fixture. */
  authenticity?: "AUTHENTIC" | "SYNTHETIC_LABELED";
}

export function measureBasketUsageAmount(
  record: BasketUsageRecord | undefined,
  basis: MeasurementBasis,
): number {
  if (!record) return 0;
  switch (basis) {
    case "CUMULATIVE_INCURRED":
      return Math.max(0, record.cumulativeIncurred);
    case "CURRENTLY_OUTSTANDING":
    case "NET_OF_REPAYMENT":
      return Math.max(0, record.currentlyOutstanding);
    case "PREPAYMENT_CREDIT":
      return Math.max(0, record.prepaymentCredit);
    default:
      return 0;
  }
}

export function basketUsageFromAttributedEvents(
  events: Array<{
    eventType: string;
    amount: number;
    relatedPermissionIds?: string[] | null;
  }>,
  permissionIds: Iterable<string>,
): BasketUsageRecord[] {
  const idSet = new Set(permissionIds);
  const out: BasketUsageRecord[] = [];
  for (const permissionId of idSet) {
    const relevant = events.filter((e) => (e.relatedPermissionIds ?? []).includes(permissionId));
    if (!relevant.length) continue;
    const cumulativeIncurred = relevant
      .filter((e) => e.eventType === "ISSUANCE")
      .reduce((s, e) => s + e.amount, 0);
    const repaid = relevant
      .filter((e) => e.eventType === "REPAYMENT")
      .reduce((s, e) => s + e.amount, 0);
    out.push({
      permissionId,
      cumulativeIncurred,
      currentlyOutstanding: Math.max(0, cumulativeIncurred - repaid),
      prepaymentCredit: 0,
    });
  }
  return out.sort((a, b) => (a.permissionId ?? "").localeCompare(b.permissionId ?? ""));
}

function asOfDay(iso: string): string {
  return iso.slice(0, 10);
}

function certificateApplies(
  cert: UtilizationCompletenessCertificate | null | undefined,
  constraintId: string | undefined,
  asOf: string | undefined,
): boolean {
  if (!cert) return false;
  if (cert.approvalState !== "APPROVED") return false;
  if (cert.constraintId && constraintId && cert.constraintId !== constraintId) return false;
  if (asOf && asOfDay(cert.asOf) < asOfDay(asOf)) return false;
  return true;
}

export interface SharedUsageComputationResult {
  usage: number;
  status: SharedUsageComputationStatus;
  /** True when attributed records for all named members are present (amount may be known). */
  attributedKnown: boolean;
  /**
   * True only when remaining = cap − usage may be claimed.
   * Requires a valid completeness certificate. Attributed/approved records alone never set this.
   * Aligns with #234 `supportsRemainingClaim`.
   */
  supportsRemainingClaim: boolean;
  /**
   * @deprecated Prefer `supportsRemainingClaim`. Kept for call-site migration;
   * equal to supportsRemainingClaim (NOT merely attributedKnown).
   */
  authoritative: boolean;
  completenessCertified: boolean;
}

export function computeSharedConstraintCurrentUsage(params: {
  aggregationRule: AggregationRule;
  measurementBasis: MeasurementBasis;
  members: SharedConstraintMember[];
  basketUsage: BasketUsageRecord[];
  /** Affirmative completeness certificate (#234). Required for remaining claims. */
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  constraintId?: string;
  asOf?: string;
}): SharedUsageComputationResult {
  const fail = (
    status: SharedUsageComputationStatus,
    usage = 0,
    attributedKnown = false,
  ): SharedUsageComputationResult => ({
    usage,
    status,
    attributedKnown,
    supportsRemainingClaim: false,
    authoritative: false,
    completenessCertified: false,
  });

  if (params.aggregationRule === "EXTERNAL_INSTRUMENT_BALANCE") {
    return fail("EXTERNAL_INPUT_REQUIRED");
  }
  if (params.aggregationRule === "ENTITY_CLASS_FILTER") {
    return fail("ENTITY_CLASS_USAGE_UNAVAILABLE");
  }

  const byPermission = new Map<string, BasketUsageRecord>();
  for (const row of params.basketUsage) {
    if (row.permissionId) byPermission.set(row.permissionId, row);
  }

  const namedMembers = params.members.filter((m) => m.permissionId);
  if (namedMembers.length === 0) {
    return fail("ZERO_NO_ATTRIBUTED_USAGE");
  }

  let usage = 0;
  let attributedMembers = 0;
  for (const member of namedMembers) {
    const record = byPermission.get(member.permissionId!);
    if (record) {
      attributedMembers++;
      usage += measureBasketUsageAmount(record, params.measurementBasis);
    }
  }
  usage = Math.max(0, usage);

  if (attributedMembers === 0) {
    // Completeness VERIFIED_EMPTY may certify remaining with zero usage and no rows.
    const certOk = certificateApplies(
      params.completenessCertificate,
      params.constraintId,
      params.asOf,
    );
    if (certOk && params.completenessCertificate!.kind === "VERIFIED_EMPTY") {
      return {
        usage: 0,
        status: "VERIFIED_ZERO",
        attributedKnown: false,
        supportsRemainingClaim: true,
        authoritative: true,
        completenessCertified: true,
      };
    }
    return fail("ZERO_NO_ATTRIBUTED_USAGE");
  }

  if (attributedMembers < namedMembers.length) {
    return fail("PARTIAL_ATTRIBUTED_USAGE", usage, true);
  }

  // All named members attributed — amount known, but NOT complete without certificate.
  const attributedStatus: SharedUsageComputationStatus = usage === 0 ? "COMPUTED" : "COMPUTED";
  const cert = params.completenessCertificate ?? null;
  const certOk = certificateApplies(cert, params.constraintId, params.asOf);

  if (!certOk) {
    // Stale / mismatched / missing / unapproved cert → no remaining claim.
    if (cert && !certOk) {
      return {
        usage,
        status: "COMPLETENESS_CERTIFICATE_INVALID",
        attributedKnown: true,
        supportsRemainingClaim: false,
        authoritative: false,
        completenessCertified: false,
      };
    }
    return {
      usage,
      status: attributedStatus,
      attributedKnown: true,
      supportsRemainingClaim: false,
      authoritative: false,
      completenessCertified: false,
    };
  }

  if (cert!.kind === "VERIFIED_EMPTY") {
    if (usage !== 0) {
      // Certificate claims empty but attributed usage is non-zero — refuse remaining.
      return {
        usage,
        status: "COMPLETENESS_CERTIFICATE_INVALID",
        attributedKnown: true,
        supportsRemainingClaim: false,
        authoritative: false,
        completenessCertified: false,
      };
    }
    return {
      usage: 0,
      status: "VERIFIED_ZERO",
      attributedKnown: true,
      supportsRemainingClaim: true,
      authoritative: true,
      completenessCertified: true,
    };
  }

  // VERIFIED_COMPLETE — attributed set is the full usage; remaining may be claimed.
  return {
    usage,
    status: "COMPUTED",
    attributedKnown: true,
    supportsRemainingClaim: true,
    authoritative: true,
    completenessCertified: true,
  };
}

/** @deprecated Use supportsRemainingClaim on the computation result. */
export function isAuthoritativeUsageStatus(status: SharedUsageComputationStatus): boolean {
  return status === "VERIFIED_ZERO" || status === "COMPUTED";
}

/**
 * Remaining-capacity publication gate (#234 alignment).
 * Attributed-known COMPUTED without completeness must NOT pass.
 */
export function canPublishRemainingFromUsage(result: SharedUsageComputationResult): boolean {
  return result.supportsRemainingClaim === true;
}
