/**
 * Shared-constraint pre-transaction usage helpers.
 *
 * Canonical remaining-capacity authority lives in `lib/capacity/*`.
 * This module is a consumer: it does NOT define a parallel certificate type.
 *
 * - Approved / attributed basketUsage records establish *known attributed usage only*.
 * - They do NOT establish completeness of historical usage.
 * - Remaining = cap − usage requires a validated UtilizationCompletenessCertificate
 *   from `@/lib/capacity` (issuer + trusted identity + bindings + method).
 * - Missing attribution is ZERO_NO_ATTRIBUTED_USAGE / UNKNOWN — never invent zero.
 * - `supportsRemainingClaim` / deprecated `authoritative` / `currentUsageAuthoritative`
 *   share identical semantics via `alignSolverUsageFlags`.
 */

import {
  alignSolverUsageFlags,
  validateCompletenessCertificate,
  type CompletenessBindingFingerprints,
  type TrustedIssuerAuthorizationContext,
  type UtilizationCompletenessCertificate,
  type UtilizationExecutionMode,
} from "@/lib/capacity";
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

/** Re-export canonical certificate — do not redefine a thin duplicate. */
export type { UtilizationCompletenessCertificate };

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

export interface SharedUsageComputationResult {
  usage: number;
  status: SharedUsageComputationStatus;
  /** True when attributed records for all named members are present (amount may be known). */
  attributedKnown: boolean;
  /**
   * True only when remaining = cap − usage may be claimed.
   * Requires a valid completeness certificate. Attributed/approved records alone never set this.
   * Identical to #234 `supportsRemainingClaim`.
   */
  supportsRemainingClaim: boolean;
  /**
   * @deprecated Prefer `supportsRemainingClaim`. Equal to supportsRemainingClaim
   * (NOT merely attributedKnown). Alias of currentUsageAuthoritative.
   */
  authoritative: boolean;
  completenessCertified: boolean;
  /** True only for production-authoritative completeness (trusted counsel/custodian). */
  productionAuthoritative: boolean;
  certificateValidationBlockers: string[];
}

export function computeSharedConstraintCurrentUsage(params: {
  aggregationRule: AggregationRule;
  measurementBasis: MeasurementBasis;
  members: SharedConstraintMember[];
  basketUsage: BasketUsageRecord[];
  /** Canonical #234 completeness certificate. Required for remaining claims. */
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  /**
   * Current operative world fingerprints — required whenever a certificate is presented.
   */
  currentBindings?: CompletenessBindingFingerprints | null;
  /**
   * Trusted identity/authorization for the certificate issuer — required with a certificate.
   * Caller-supplied issuer.role alone never authorizes remaining.
   */
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  /**
   * PRODUCTION (default) refuses synthetic/fixture certificates.
   * DEMO_SYNTHETIC allows labeled fixtures for mechanics demos only.
   */
  executionMode?: UtilizationExecutionMode;
  companyId?: string;
  constraintId?: string;
  asOf?: string;
  currency?: string | null;
}): SharedUsageComputationResult {
  const executionMode: UtilizationExecutionMode = params.executionMode ?? "PRODUCTION";
  const fail = (
    status: SharedUsageComputationStatus,
    usage = 0,
    attributedKnown = false,
    blockers: string[] = [],
  ): SharedUsageComputationResult => ({
    usage,
    status,
    attributedKnown,
    supportsRemainingClaim: false,
    authoritative: false,
    completenessCertified: false,
    productionAuthoritative: false,
    certificateValidationBlockers: blockers,
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

  const capacityRuleId = params.constraintId ?? "shared-constraint";
  const companyId = params.companyId ?? "unknown-company";
  const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);
  const currency = params.currency ?? null;

  const validateCert = (attributedRecordCount: number) => {
    const cert = params.completenessCertificate ?? null;
    if (cert == null) {
      return {
        ok: false,
        supportsRemainingClaim: false,
        productionAuthoritative: false,
        blockers: ["no completeness certificate presented"] as string[],
      };
    }
    if (params.currentBindings == null) {
      return {
        ok: false,
        supportsRemainingClaim: false,
        productionAuthoritative: false,
        blockers: [
          "completeness certificate presented without currentBindings — cannot verify staleness",
        ],
      };
    }
    if (params.trustedIssuerAuth == null) {
      return {
        ok: false,
        supportsRemainingClaim: false,
        productionAuthoritative: false,
        blockers: [
          "completeness certificate presented without trustedIssuerAuth — caller-supplied issuer.role alone cannot establish completeness authority",
        ],
      };
    }
    // Scope provisionOrBasketId must match constraint under evaluation.
    if (cert.scope.provisionOrBasketId !== capacityRuleId) {
      return {
        ok: false,
        supportsRemainingClaim: false,
        productionAuthoritative: false,
        blockers: [
          `certificate provisionOrBasketId "${cert.scope.provisionOrBasketId}" mismatched to constraintId "${capacityRuleId}"`,
        ],
      };
    }
    return validateCompletenessCertificate(cert, {
      executionMode,
      evaluationAsOf: asOf,
      companyId,
      capacityRuleId,
      currency,
      currentBindings: params.currentBindings,
      attributedRecordCount,
      trustedIssuerAuth: params.trustedIssuerAuth,
    });
  };

  if (attributedMembers === 0) {
    const validated = validateCert(0);
    if (
      validated.supportsRemainingClaim &&
      params.completenessCertificate?.kind === "VERIFIED_EMPTY"
    ) {
      return {
        usage: 0,
        status: "VERIFIED_ZERO",
        attributedKnown: false,
        supportsRemainingClaim: true,
        authoritative: true,
        completenessCertified: true,
        productionAuthoritative: validated.productionAuthoritative,
        certificateValidationBlockers: [],
      };
    }
    if (params.completenessCertificate != null && !validated.supportsRemainingClaim) {
      return fail("COMPLETENESS_CERTIFICATE_INVALID", 0, false, validated.blockers);
    }
    return fail("ZERO_NO_ATTRIBUTED_USAGE");
  }

  if (attributedMembers < namedMembers.length) {
    return fail("PARTIAL_ATTRIBUTED_USAGE", usage, true);
  }

  // All named members attributed — amount known, but NOT complete without certificate.
  const validated = validateCert(attributedMembers);
  if (!validated.supportsRemainingClaim) {
    if (params.completenessCertificate != null) {
      return {
        usage,
        status: "COMPLETENESS_CERTIFICATE_INVALID",
        attributedKnown: true,
        supportsRemainingClaim: false,
        authoritative: false,
        completenessCertified: false,
        productionAuthoritative: false,
        certificateValidationBlockers: validated.blockers,
      };
    }
    return {
      usage,
      status: "COMPUTED",
      attributedKnown: true,
      supportsRemainingClaim: false,
      authoritative: false,
      completenessCertified: false,
      productionAuthoritative: false,
      certificateValidationBlockers: validated.blockers,
    };
  }

  if (params.completenessCertificate!.kind === "VERIFIED_EMPTY") {
    if (usage !== 0) {
      return {
        usage,
        status: "COMPLETENESS_CERTIFICATE_INVALID",
        attributedKnown: true,
        supportsRemainingClaim: false,
        authoritative: false,
        completenessCertified: false,
        productionAuthoritative: false,
        certificateValidationBlockers: [
          "VERIFIED_EMPTY conflicts with non-zero attributed usage",
        ],
      };
    }
    return {
      usage: 0,
      status: "VERIFIED_ZERO",
      attributedKnown: true,
      supportsRemainingClaim: true,
      authoritative: true,
      completenessCertified: true,
      productionAuthoritative: validated.productionAuthoritative,
      certificateValidationBlockers: [],
    };
  }

  return {
    usage,
    status: "COMPUTED",
    attributedKnown: true,
    supportsRemainingClaim: true,
    authoritative: true,
    completenessCertified: true,
    productionAuthoritative: validated.productionAuthoritative,
    certificateValidationBlockers: [],
  };
}

/** @deprecated Use supportsRemainingClaim on the computation result. */
export function isAuthoritativeUsageStatus(status: SharedUsageComputationStatus): boolean {
  return status === "VERIFIED_ZERO" || status === "COMPUTED";
}

/**
 * Remaining-capacity publication gate.
 * Attributed-known COMPUTED without completeness must NOT pass.
 * For production authoritative publication, also require productionAuthoritative.
 */
export function canPublishRemainingFromUsage(
  result: SharedUsageComputationResult,
  opts?: { requireProductionAuthoritative?: boolean },
): boolean {
  if (result.supportsRemainingClaim !== true) return false;
  if (opts?.requireProductionAuthoritative && !result.productionAuthoritative) return false;
  return true;
}

/** Map computation result onto SharedConstraint flag bundle (single semantics). */
export function solverFlagsFromUsageResult(
  result: SharedUsageComputationResult,
): ReturnType<typeof alignSolverUsageFlags> {
  return alignSolverUsageFlags({
    supportsRemainingClaim: result.supportsRemainingClaim,
    productionAuthoritative: result.productionAuthoritative,
    completenessCertified: result.completenessCertified,
    attributedKnown: result.attributedKnown,
  });
}
