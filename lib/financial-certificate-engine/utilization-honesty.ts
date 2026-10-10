/**
 * Utilization honesty adapter — delegates to canonical #237 `lib/capacity`.
 *
 * Do not recreate #234. Approved financial metrics alone never establish
 * authoritative remaining capacity; remaining requires #237-compliant
 * completeness certificates via `computeVerifiedRemaining`.
 */

import {
  computeVerifiedRemaining,
  evidenceFromAttributedLedger,
  type GrossCapacityInput,
  type VerifiedRemainingResult,
  type UtilizationCompletenessCertificate,
  type UtilizationEvidenceRecord,
} from "@/lib/capacity";

export type { UtilizationCompletenessCertificate, VerifiedRemainingResult, GrossCapacityInput };

/** FCE-facing attributed usage row (millions) → #237 evidence record (dollars). */
export interface AttributedUtilizationRecord {
  usageId: string;
  capacityRuleId: string;
  amountMillions: number;
  effectiveAsOf: string;
  status: "ACTIVE" | "RECORDED" | "SUPERSEDED" | "REVERSED";
  currency?: string;
  /** Defaults AUTHENTIC; synthetic fixtures must set SYNTHETIC_LABELED. */
  authenticity?: UtilizationEvidenceRecord["authenticity"];
  approvalState?: UtilizationEvidenceRecord["approvalState"];
  sourceLabel?: string;
  sharedCapacityId?: string | null;
  entityKey?: string | null;
}

export type RemainingPublication =
  | {
      status: "GROSS_ONLY";
      grossCapacityMillions: number | null;
      remainingCapacityMillions: null;
      supportsRemainingClaim: false;
      reason: string;
      verified: VerifiedRemainingResult;
    }
  | {
      status: "REMAINING_SUPPORTED";
      grossCapacityMillions: number;
      remainingCapacityMillions: number;
      supportsRemainingClaim: true;
      knownUtilizationMillions: number;
      reason: string;
      verified: VerifiedRemainingResult;
    }
  | {
      status: "REFUSED";
      grossCapacityMillions: null;
      remainingCapacityMillions: null;
      supportsRemainingClaim: false;
      reason: string;
      verified: VerifiedRemainingResult;
    };

function toEvidence(records: readonly AttributedUtilizationRecord[]): UtilizationEvidenceRecord[] {
  return records.map((r) =>
    evidenceFromAttributedLedger({
      usageId: r.usageId,
      amount: r.amountMillions * 1_000_000,
      currency: r.currency ?? "USD",
      effectiveAsOf: r.effectiveAsOf,
      capacityRuleId: r.capacityRuleId,
      sharedCapacityId: r.sharedCapacityId ?? null,
      status:
        r.status === "ACTIVE" || r.status === "RECORDED"
          ? r.status === "RECORDED"
            ? "RECORDED"
            : "ACTIVE"
          : r.status === "SUPERSEDED"
            ? "SUPERSEDED"
            : "REVERSED",
      approvalState: r.approvalState ?? "APPROVED",
      sourceLabel: r.sourceLabel ?? "fce-attributed-utilization",
      authenticity: r.authenticity ?? "AUTHENTIC",
      kind: r.sharedCapacityId ? "ATTRIBUTED_SHARED_POOL" : "ATTRIBUTED_RULE",
    }),
  );
}

/**
 * Publish remaining only through #237 `computeVerifiedRemaining`.
 * Units: FCE surfaces millions; #237 evidence uses dollars.
 */
export function publishRemainingCapacity(args: {
  capacityRuleId: string;
  asOf: string;
  grossCapacityMillions: number | null;
  unlimited?: boolean;
  records: readonly AttributedUtilizationRecord[];
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  unattributedLegacyBasketPresent?: boolean;
  currency?: string;
  gateSatisfied?: boolean;
  modeled?: boolean;
  /** Test/demo only — never set by production loaders. */
  allowSyntheticRemaining?: boolean;
}): RemainingPublication {
  const currency = args.currency ?? "USD";
  const gross: GrossCapacityInput = {
    capacityRuleId: args.capacityRuleId,
    amount:
      args.grossCapacityMillions == null ? null : args.grossCapacityMillions * 1_000_000,
    unlimited: args.unlimited,
    gateSatisfied: args.gateSatisfied ?? true,
      modeled: args.modeled ?? (args.grossCapacityMillions != null || !!args.unlimited),
    currency,
  };

  const verified = computeVerifiedRemaining({
    gross,
    utilization: {
      capacityRuleId: args.capacityRuleId,
      asOf: args.asOf,
      currency,
      records: toEvidence(args.records),
      completenessCertificate: args.completenessCertificate ?? null,
      unattributedLegacyBasketPresent: args.unattributedLegacyBasketPresent,
    },
    allowSyntheticRemaining: args.allowSyntheticRemaining,
  });

  if (verified.remainingStatus === "REFUSED" || verified.remainingStatus === "NOT_DETERMINED") {
    return {
      status: "REFUSED",
      grossCapacityMillions: null,
      remainingCapacityMillions: null,
      supportsRemainingClaim: false,
      reason: verified.note,
      verified,
    };
  }

  if (
    verified.remainingStatus === "REMAINING_SUPPORTED" &&
    verified.supportedRemaining != null &&
    verified.grossCapacity != null
  ) {
    return {
      status: "REMAINING_SUPPORTED",
      grossCapacityMillions: verified.grossCapacity / 1_000_000,
      remainingCapacityMillions: verified.supportedRemaining / 1_000_000,
      supportsRemainingClaim: true,
      knownUtilizationMillions: (verified.knownUtilization ?? 0) / 1_000_000,
      reason: verified.note,
      verified,
    };
  }

  return {
    status: "GROSS_ONLY",
    grossCapacityMillions:
      verified.grossCapacity == null ? null : verified.grossCapacity / 1_000_000,
    remainingCapacityMillions: null,
    supportsRemainingClaim: false,
    reason: args.unattributedLegacyBasketPresent
      ? `${verified.note} Unattributed legacy basket rows present — remaining refused (#237).`
      : verified.note,
    verified,
  };
}
