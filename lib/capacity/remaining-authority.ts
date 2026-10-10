/**
 * Joint #239 contract marker — NOT a parallel authority path.
 *
 * Canonical implementation (post-#237 / #250):
 * - `utilization-authority.ts` — remaining / completeness / synthetic refusal
 * - `completeness-issuer-auth.ts` — trusted issuer for production-authoritative remaining
 *
 * This module only re-exports the publish gate and pins an integration version
 * string for human-review handoff. Do not restore obsolete completeness-certificate
 * modules here.
 */

export {
  assertMayPublishRemaining,
  authorityFromUtilizationResolution,
  decideSolverUtilizationAuthority,
  type UtilizationAuthorityDecision,
  type UtilizationAuthorityKind,
  type SolverUsageObservation,
} from "./utilization-authority";

/** Integration marker: joint #232/#234 contract on #237/#250 canonical authority. */
export const REMAINING_AUTHORITY_CONTRACT_VERSION = "joint-232-234.on-250.v1";

/** Alias of supportsRemainingClaim boolean gate. */
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
  | "UNTRUSTED_ISSUER"
  | "EXTERNAL_USAGE_UNKNOWN"
  | "GATE_FAILED"
  | "NOT_MODELED";
