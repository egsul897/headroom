/**
 * FCE remaining-capacity publication — thin adapter over canonical #237
 * `lib/capacity` utilization authority.
 *
 * Do not maintain a parallel completeness / remaining decision here.
 * Remaining = gross − usage requires approved attributed evidence AND an
 * APPROVED completeness certificate (VERIFIED_COMPLETE or VERIFIED_EMPTY).
 * Empty / unattributed ledgers are UNKNOWN — never silent zero.
 */

import { resolveUtilization } from "@/lib/capacity/utilization-resolver";
import type {
  UtilizationCompletenessCertificate as CanonicalCompletenessCertificate,
  UtilizationEvidenceRecord,
} from "@/lib/capacity/utilization-types";

/** Re-export canonical certificate shape for FCE callers. */
export type UtilizationCompletenessCertificate = CanonicalCompletenessCertificate;

export interface AttributedUtilizationRecord {
  usageId: string;
  capacityRuleId: string;
  /** Amount in millions (FCE convention); converted to absolute units for #237. */
  amountMillions: number;
  effectiveAsOf: string;
  status: "ACTIVE" | "RECORDED" | "SUPERSEDED" | "REVERSED";
}

export type RemainingPublication =
  | {
      status: "GROSS_ONLY";
      grossCapacityMillions: number | null;
      remainingCapacityMillions: null;
      supportsRemainingClaim: false;
      reason: string;
    }
  | {
      status: "REMAINING_SUPPORTED";
      grossCapacityMillions: number;
      remainingCapacityMillions: number;
      supportsRemainingClaim: true;
      knownUtilizationMillions: number;
      reason: string;
    }
  | {
      status: "REFUSED";
      grossCapacityMillions: null;
      remainingCapacityMillions: null;
      supportsRemainingClaim: false;
      reason: string;
    };

function toEvidence(records: readonly AttributedUtilizationRecord[]): UtilizationEvidenceRecord[] {
  return records.map((r) => ({
    usageId: r.usageId,
    kind: "ATTRIBUTED_RULE" as const,
    // Keep millions as the shared unit for FCE gross + utilization.
    amount: r.amountMillions,
    currency: "USD_MILLIONS",
    effectiveAsOf: r.effectiveAsOf,
    capacityRuleId: r.capacityRuleId,
    sharedCapacityId: null,
    legacyBasketFamily: null,
    entityKey: null,
    status: r.status === "REVERSED" ? "REVERSED" : r.status === "SUPERSEDED" ? "SUPERSEDED" : "ACTIVE",
    approvalState: "APPROVED" as const,
    sourceLabel: "fce-attributed-utilization",
    authenticity: "AUTHENTIC" as const,
  }));
}

/**
 * Publish remaining capacity via #237 `resolveUtilization`.
 * Never invents remaining without completeness; never labels AVAILABLE.
 */
export function publishRemainingCapacity(args: {
  capacityRuleId: string;
  asOf: string;
  grossCapacityMillions: number | null;
  unlimited?: boolean;
  records: readonly AttributedUtilizationRecord[];
  completenessCertificate?: UtilizationCompletenessCertificate | null;
  /** Family-level ledger rows exist but none attribute to this rule. */
  unattributedLegacyBasketPresent?: boolean;
}): RemainingPublication {
  if (args.grossCapacityMillions == null && !args.unlimited) {
    return {
      status: "REFUSED",
      grossCapacityMillions: null,
      remainingCapacityMillions: null,
      supportsRemainingClaim: false,
      reason: "Gross capacity not determined — remaining not claimed.",
    };
  }

  if (args.unlimited) {
    return {
      status: "GROSS_ONLY",
      grossCapacityMillions: null,
      remainingCapacityMillions: null,
      supportsRemainingClaim: false,
      reason:
        "Unlimited gross gate does not publish numeric remaining without utilization completeness (#237).",
    };
  }

  const resolution = resolveUtilization({
    capacityRuleId: args.capacityRuleId,
    asOf: args.asOf,
    currency: "USD_MILLIONS",
    records: toEvidence(args.records),
    completenessCertificate: args.completenessCertificate ?? null,
    unattributedLegacyBasketPresent: args.unattributedLegacyBasketPresent,
  });

  if (!resolution.supportsRemainingClaim || resolution.attributedAmount == null) {
    return {
      status: "GROSS_ONLY",
      grossCapacityMillions: args.grossCapacityMillions,
      remainingCapacityMillions: null,
      supportsRemainingClaim: false,
      reason: resolution.note || resolution.blockers.join("; ") || "Remaining not supported by #237 utilization authority.",
    };
  }

  const known = resolution.attributedAmount;
  const remaining = Math.max(0, args.grossCapacityMillions! - known);
  return {
    status: "REMAINING_SUPPORTED",
    grossCapacityMillions: args.grossCapacityMillions!,
    remainingCapacityMillions: remaining,
    supportsRemainingClaim: true,
    knownUtilizationMillions: known,
    reason: resolution.note,
  };
}
