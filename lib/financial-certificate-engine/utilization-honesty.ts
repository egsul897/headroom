/**
 * Utilization honesty for remaining-capacity claims (coord Agent 3 / PR #234).
 *
 * Approved financial metrics alone never establish authoritative remaining
 * capacity. Remaining = gross − usage requires:
 *   1. attributed utilization evidence bound to the capacity path, AND
 *   2. a completeness certificate (VERIFIED_COMPLETE or VERIFIED_EMPTY).
 *
 * Empty / unattributed ledgers are UNKNOWN — never silent zero.
 * This module mirrors the #234 contract without vendoring that exclusive tree.
 */

export type UtilizationCompletenessKind = "VERIFIED_COMPLETE" | "VERIFIED_EMPTY";

export interface UtilizationCompletenessCertificate {
  capacityRuleId: string;
  asOf: string;
  kind: UtilizationCompletenessKind;
  approvalState: "APPROVED";
  sourceLabel: string;
}

export interface AttributedUtilizationRecord {
  usageId: string;
  capacityRuleId: string;
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
        "Unlimited gross gate does not publish numeric remaining without utilization completeness (coord #234).",
    };
  }

  const active = args.records.filter(
    (r) =>
      r.capacityRuleId === args.capacityRuleId &&
      (r.status === "ACTIVE" || r.status === "RECORDED") &&
      r.effectiveAsOf.slice(0, 10) <= args.asOf.slice(0, 10),
  );
  const cert = args.completenessCertificate;
  const certOk =
    cert != null &&
    cert.capacityRuleId === args.capacityRuleId &&
    cert.approvalState === "APPROVED" &&
    (cert.kind === "VERIFIED_COMPLETE" || cert.kind === "VERIFIED_EMPTY") &&
    cert.asOf.slice(0, 10) >= args.asOf.slice(0, 10);

  if (!certOk) {
    return {
      status: "GROSS_ONLY",
      grossCapacityMillions: args.grossCapacityMillions,
      remainingCapacityMillions: null,
      supportsRemainingClaim: false,
      reason: args.unattributedLegacyBasketPresent
        ? "Approved financials present and legacy basket rows exist, but utilization is not attributed to this provision and no completeness certificate — remaining refused (UNKNOWN ≠ zero)."
        : "Approved financial metrics alone cannot establish remaining capacity without attributed utilization + completeness certificate.",
    };
  }

  if (cert!.kind === "VERIFIED_EMPTY" && active.length > 0) {
    return {
      status: "GROSS_ONLY",
      grossCapacityMillions: args.grossCapacityMillions,
      remainingCapacityMillions: null,
      supportsRemainingClaim: false,
      reason: "VERIFIED_EMPTY certificate conflicts with attributed active records — remaining refused.",
    };
  }

  const known = active.reduce((s, r) => s + r.amountMillions, 0);
  const remaining = Math.max(0, args.grossCapacityMillions! - known);
  return {
    status: "REMAINING_SUPPORTED",
    grossCapacityMillions: args.grossCapacityMillions!,
    remainingCapacityMillions: remaining,
    supportsRemainingClaim: true,
    knownUtilizationMillions: known,
    reason: `Remaining supported by attributed utilization (${known}) and ${cert!.kind} completeness certificate.`,
  };
}
