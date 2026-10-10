/**
 * Utilization-completeness adapter — reuses lib/capacity authority; no new arithmetic.
 */

import {
  evaluateCompletenessForRemainingClaim,
  resolveUtilization,
  type TrustedIssuerAuthorizationContext,
  type UtilizationCompletenessCertificate,
  type UtilizationEvidenceRecord,
  type UtilizationResolution,
} from "@/lib/capacity";

export interface UtilizationAuthorityGate {
  supportsRemainingClaim: boolean;
  productionAuthoritative: boolean;
  knowledge: string | null;
  blockers: string[];
  resolution: UtilizationResolution | null;
  /** True when UNKNOWN usage was presented and must not be treated as zero. */
  unknownTreatedAsZeroAttempted: boolean;
}

export function evaluateUtilizationAuthorityGate(args: {
  capacityRuleId: string;
  asOf: string;
  currency: string;
  records: readonly UtilizationEvidenceRecord[];
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  sharedCapacityId?: string | null;
  trustedIssuerAuth?: TrustedIssuerAuthorizationContext | null;
  allowSyntheticRemaining?: boolean;
}): UtilizationAuthorityGate {
  const cert = args.completenessCertificate ?? null;

  // Missing completeness → UNKNOWN utilization; never default to zero.
  if (cert == null) {
    const resolution = resolveUtilization({
      capacityRuleId: args.capacityRuleId,
      asOf: args.asOf,
      currency: args.currency,
      records: args.records,
      completenessCertificate: null,
      sharedCapacityId: args.sharedCapacityId,
      trustedIssuerAuth: args.trustedIssuerAuth,
      allowSyntheticRemaining: args.allowSyntheticRemaining,
    });
    return {
      supportsRemainingClaim: false,
      productionAuthoritative: false,
      knowledge: resolution.knowledge,
      blockers: [
        "utilization completeness missing — UNKNOWN usage must not be treated as zero",
        ...resolution.blockers,
      ],
      resolution,
      unknownTreatedAsZeroAttempted: false,
    };
  }

  // APPROVED without authenticity refuses production (and remaining unless demo hatch).
  const completeness = evaluateCompletenessForRemainingClaim({
    cert: {
      approvalState: cert.approvalState,
      authenticity: cert.authenticity,
      issuer: cert.issuer,
      kind: cert.kind,
    },
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSyntheticRemaining: args.allowSyntheticRemaining,
  });

  const resolution = resolveUtilization({
    capacityRuleId: args.capacityRuleId,
    asOf: args.asOf,
    currency: args.currency,
    records: args.records,
    completenessCertificate: cert,
    sharedCapacityId: args.sharedCapacityId,
    trustedIssuerAuth: args.trustedIssuerAuth,
    allowSyntheticRemaining: args.allowSyntheticRemaining,
  });

  const blockers = [...new Set([...completeness.blockers, ...resolution.blockers])];

  return {
    supportsRemainingClaim: resolution.supportsRemainingClaim && completeness.supportsRemainingClaim,
    productionAuthoritative:
      completeness.productionAuthoritative && Boolean(resolution.productionAuthoritative),
    knowledge: resolution.knowledge,
    blockers,
    resolution,
    unknownTreatedAsZeroAttempted: false,
  };
}
