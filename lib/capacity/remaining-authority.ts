/**
 * Joint remaining-capacity contract marker (reconciled onto #237).
 *
 * Authority implementation lives in `utilization-authority.ts` (#237).
 * This module does not invent a second rule — it re-exports the canonical
 * publish gate and pins the joint contract version for integration evidence.
 *
 * Rules (identical to #237 UTILIZATION-AUTHORITY-CONTRACT):
 * - Attributed / approved usage ⇒ known attributed amounts only.
 * - Remaining requires APPROVED completeness (VERIFIED_EMPTY | VERIFIED_COMPLETE).
 * - Synthetic production evidence never publishes authoritative remaining.
 * - Position / Simulate / Ask share one verified-remaining projection.
 * - Solver election SHARED_CAP requires currentUsageAuthoritative === true.
 */

export {
  assertMayPublishRemaining,
  authorityFromUtilizationResolution,
  decideSolverUtilizationAuthority,
  type UtilizationAuthorityDecision,
  type UtilizationAuthorityKind,
  type SolverUsageObservation,
} from "./utilization-authority";

/** Integration marker — joint #232/#234 contract preserved on #237 authority. */
export const REMAINING_AUTHORITY_CONTRACT_VERSION = "joint-232-234.on-237.v1";

/** Alias of assertMayPublishRemaining for boolean supportsRemainingClaim flags. */
export function mayPublishRemainingCapacity(supportsRemainingClaim: boolean | undefined | null): boolean {
  return supportsRemainingClaim === true;
}

export type RemainingRefusalReason =
  | "MISSING_ATTRIBUTION"
  | "PARTIAL_ATTRIBUTION"
  | "APPROVED_BUT_INCOMPLETE"
  | "STALE_CERTIFICATE"
  | "MISMATCHED_CERTIFICATE"
  | "CONTRADICTORY_CERTIFICATE"
  | "SYNTHETIC_IN_PRODUCTION"
  | "EXTERNAL_USAGE_UNKNOWN"
  | "GATE_FAILED"
  | "NOT_MODELED";
