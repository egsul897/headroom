/**
 * Canonical remaining-capacity authority contract (joint #232 / #234).
 *
 * Single rule for engine + product surfaces:
 * - Attributed / approved usage records establish known attributed amounts only.
 * - Remaining = gross − usage requires an affirmative completeness certificate
 *   (VERIFIED_EMPTY or VERIFIED_COMPLETE) that validates under the active
 *   execution mode.
 * - PRODUCTION: certificate must be AUTHENTIC (product path also requires
 *   allowed issuer, exhaustive/empty method, and matching binding fingerprints).
 * - DEMO_SYNTHETIC: labeled synthetic certificates may demonstrate mechanics
 *   but never set productionAuthoritative / customer-facing AVAILABLE.
 * - Missing, partial, stale, mismatched, synthetic-in-PRODUCTION, unapproved,
 *   or contradictory evidence MUST NOT yield mayPublishAvailable / CLEAR remaining.
 *
 * Product path: `resolveUtilization` → `validateCompletenessCertificate` →
 *   `supportsRemainingClaim` → `computeVerifiedRemaining` →
 *   `refuseAuthoritativeRemaining` (Position / Simulate / Ask).
 * Solver path: `computeSharedConstraintCurrentUsage` → `supportsRemainingClaim` →
 *   election `headroomAndConsume` / covenant-engine SharedConstraint flags.
 *
 * Solver certificate type is a compact adapter (constraintId binding). Product
 * certificate type is the full attestation. Do not invent a second authority rule.
 */

export const REMAINING_AUTHORITY_CONTRACT_VERSION = "joint-232-234.v1";

/** The only boolean that authorizes publishing numeric remaining capacity. */
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
  | "SYNTHETIC_WITHOUT_CERT"
  | "SYNTHETIC_IN_PRODUCTION"
  | "EXTERNAL_USAGE_UNKNOWN"
  | "GATE_FAILED"
  | "NOT_MODELED";
