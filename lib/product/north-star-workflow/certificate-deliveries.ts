/**
 * Build DeliveryRecord[] for MOST_RECENTLY_DELIVERED_* selectors and bind
 * the snapshot identity that was eligible as of the evaluation date.
 *
 * PAI-11 / landing gate:
 * - Never synthesize delivery from period asOf.
 * - Never substitute attributable approval reviewedAt for delivery.
 * - Require persisted provenance.deliveredAtIsoDate.
 * - Include SUPERSEDED snapshots so pre-supersession evaluation dates retain
 *   the historically eligible certificate identity.
 */
import type {
  FinancialSnapshot,
  DeliveryRecord,
  SelectorResolutionResult,
} from "@/lib/contract-model/north-star-bridge";

function isoCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function deliveriesFromApprovedSnapshots(
  companyId: string,
  snapshots: readonly FinancialSnapshot[],
): DeliveryRecord[] {
  return snapshots.flatMap((s) => {
    if (s.companyId !== companyId) return [];
    if (s.status !== "APPROVED" && s.status !== "SUPERSEDED") return [];
    if (!s.reportingPeriod || !s.asOf) return [];
    const deliveredAtIsoDate = s.provenance.deliveredAtIsoDate?.slice(0, 10);
    if (!deliveredAtIsoDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveredAtIsoDate)) {
      return [];
    }
    const d: DeliveryRecord = {
      companyId,
      kind: "COMPLIANCE_CERTIFICATE",
      reportingPeriodKey: s.reportingPeriod,
      asOfIsoDate: s.asOf,
      deliveredAtIsoDate,
      documentId: s.provenance.source ?? s.snapshotId,
      sourceVersionHash: s.provenance.sourceVersion ?? undefined,
      snapshotId: s.snapshotId,
    };
    return [d];
  });
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
