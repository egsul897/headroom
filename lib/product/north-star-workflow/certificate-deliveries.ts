/**
 * Product-facing delivery helpers for historical cutoff binding.
 *
 * Canonical reconstruction lives in
 * `lib/contract-model/runtime/input/delivery-evidence.ts` (persisted-delivery-only).
 * This module re-exports that helper and keeps `bindSnapshotForDeliveredCutoff`
 * for callers that resolve a selector then bind by delivery.snapshotId.
 *
 * Do not invent delivery from period asOf or attributable approval reviewedAt.
 */
import {
  deliveriesFromApprovedSnapshots as bridgeDeliveriesFromApprovedSnapshots,
  type FinancialSnapshot,
  type DeliveryRecord,
  type SelectorResolutionResult,
} from "@/lib/contract-model/north-star-bridge";

function isoCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @deprecated Prefer importing from north-star-bridge; kept as a thin re-export. */
export function deliveriesFromApprovedSnapshots(
  companyId: string,
  snapshots: readonly FinancialSnapshot[],
): DeliveryRecord[] {
  return bridgeDeliveriesFromApprovedSnapshots(companyId, snapshots);
}

/**
 * Bind resolved cutoff period/asOf to the snapshot identity that was delivered
 * for that period on or before evaluationDate — not merely any current APPROVED
 * row sharing the period key (which would jump to a later restatement).
 */
export function bindSnapshotForDeliveredCutoff(args: {
  companyId: string;
  evaluationDate: string;
  resolved: Extract<SelectorResolutionResult, { state: "RESOLVED" }>;
  snapshots: readonly FinancialSnapshot[];
}):
  | { state: "RESOLVED"; snapshotId: string }
  | { state: "NEEDS_INPUT"; reason: string; missing: string[] }
  | { state: "AMBIGUOUS"; reason: string; snapshotIds: string[] } {
  const deliveries = deliveriesFromApprovedSnapshots(args.companyId, args.snapshots).filter((d) => {
    const periodOk =
      args.resolved.reportingPeriodKey == null ||
      d.reportingPeriodKey === args.resolved.reportingPeriodKey;
    const asOfOk =
      args.resolved.asOf.kind !== "EXACT_DATE" || d.asOfIsoDate === args.resolved.asOf.isoDate;
    const deliveredOk = isoCompare(d.deliveredAtIsoDate, args.evaluationDate) <= 0;
    return periodOk && asOfOk && deliveredOk && Boolean(d.snapshotId);
  });

  if (deliveries.length === 0) {
    return {
      state: "NEEDS_INPUT",
      reason: `no delivered certificate snapshot for period=${args.resolved.reportingPeriodKey ?? "-"} on or before ${args.evaluationDate}`,
      missing: ["deliveredSnapshot"],
    };
  }

  const maxDate = deliveries.reduce(
    (m, d) => (isoCompare(d.deliveredAtIsoDate, m) > 0 ? d.deliveredAtIsoDate : m),
    deliveries[0]!.deliveredAtIsoDate,
  );
  const top = deliveries.filter((d) => d.deliveredAtIsoDate === maxDate);
  const snapIds = [...new Set(top.map((d) => d.snapshotId!).filter(Boolean))].sort();
  if (snapIds.length === 0) {
    return {
      state: "NEEDS_INPUT",
      reason: "delivery records lack snapshotId — cannot bind historically",
      missing: ["delivery.snapshotId"],
    };
  }
  if (snapIds.length > 1) {
    return {
      state: "AMBIGUOUS",
      reason: "multiple delivered snapshots share the most-recent delivery date for this period",
      snapshotIds: snapIds,
    };
  }
  return { state: "RESOLVED", snapshotId: snapIds[0]! };
}
