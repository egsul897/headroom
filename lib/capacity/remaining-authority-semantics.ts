/**
 * Single remaining-capacity authority contract across Headroom consumers.
 *
 * All surfaces (solver SharedConstraint flags, utilization resolver,
 * verified-remaining, Position/Simulate/Ask/verified-execution) must use
 * identical meanings for these flags. Do not invent parallel definitions.
 *
 * Truth table (production):
 * | Condition                                              | supportsRemainingClaim | productionAuthoritative | publish remaining |
 * |--------------------------------------------------------|------------------------|-------------------------|-------------------|
 * | No certificate                                         | false                  | false                   | no                |
 * | Attributed records only                                | false                  | false                   | no                |
 * | Thin/forged role string, no trusted identity           | false                  | false                   | no                |
 * | Valid AUTHENTIC cert + trusted counsel/custodian       | true                   | true                    | yes               |
 * | SYNTHETIC / SYSTEM_FIXTURE under PRODUCTION            | false                  | false                   | no                |
 * | DEMO_SYNTHETIC valid fixture cert                      | true                   | false                   | demo only; product surfaces strip |
 *
 * Deprecated alias:
 *   currentUsageAuthoritative === supportsRemainingClaim
 *   (never means "attributedKnown" alone)
 */
export const REMAINING_AUTHORITY_SEMANTICS = {
  supportsRemainingClaim:
    "True only when a validated completeness certificate supports subtracting usage from gross. Attributed/approved ledger rows alone never set this.",
  productionAuthoritative:
    "True only when the certificate is AUTHENTIC, issued by a trusted COUNSEL_REVIEWER or LEDGER_CUSTODIAN principal (session/service-account identity), and validated under PRODUCTION execution.",
  currentUsageAuthoritative:
    "Deprecated alias of supportsRemainingClaim. Must never mean attributedKnown-only.",
  currentUsageSupportsRemainingClaim:
    "Solver mirror of supportsRemainingClaim — identical semantics.",
  currentUsageProductionAuthoritative:
    "Solver mirror of productionAuthoritative — identical semantics. Required for solver remaining publication.",
  customerPublication:
    "Position / Simulate / Ask / verified-execution publish numeric remaining only when productionAuthoritative && supportsRemainingClaim.",
} as const;

export interface RemainingAuthorityFlags {
  supportsRemainingClaim: boolean;
  productionAuthoritative: boolean;
  completenessCertified: boolean;
  /** @deprecated Equal to supportsRemainingClaim. */
  authoritative: boolean;
}

/** Align solver SharedConstraint usage flags to the single authority contract. */
export interface SolverUsageAuthorityFlags {
  currentUsageAuthoritative: boolean;
  currentUsageSupportsRemainingClaim: boolean;
  currentUsageProductionAuthoritative: boolean;
  currentUsageCompletenessCertified: boolean;
  currentUsageAttributedKnown: boolean;
}

export function alignSolverUsageFlags(args: {
  supportsRemainingClaim: boolean;
  productionAuthoritative: boolean;
  completenessCertified: boolean;
  attributedKnown: boolean;
}): SolverUsageAuthorityFlags {
  return {
    // Deprecated alias — MUST equal supportsRemainingClaim, never attributedKnown alone.
    currentUsageAuthoritative: args.supportsRemainingClaim,
    currentUsageSupportsRemainingClaim: args.supportsRemainingClaim,
    currentUsageProductionAuthoritative: args.productionAuthoritative,
    currentUsageCompletenessCertified: args.completenessCertified,
    currentUsageAttributedKnown: args.attributedKnown,
  };
}
