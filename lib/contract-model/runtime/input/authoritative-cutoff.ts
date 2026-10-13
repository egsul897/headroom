/**
 * Authoritative contractual cutoff bind for product paths.
 * Persisted-delivery-only — approval never establishes delivery.
 *
 * Prefer binding by DeliveryRecord.snapshotId when present so historical
 * SUPERSEDED certificates remain attributable after restatement (#334).
 */
import {
  authoritativeDeliveriesFromSnapshots,
} from "./delivery-evidence";
import {
  resolveContractualSelector,
  selectSnapshotForResolvedSelector,
  type FiscalCalendar,
  type NamedContractualSelector,
  type DeliveryRecord,
  type SelectorResolutionResult,
} from "./selector";
import type { FinancialSnapshot } from "./types";

export type AuthoritativeCutoffResult = {
  state: string;
  reportingPeriodKey: string | null;
  asOf: string | null;
  snapshotId: string | null;
  reason?: string;
  missing?: string[];
};

function isoCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Bind resolved cutoff to the delivered snapshot identity on or before evaluationDate.
 * Falls back to APPROVED-only period match when delivery records lack snapshotId.
 */
function bindDeliveredSnapshot(args: {
  companyId: string;
  evaluationDate: string;
  resolved: Extract<SelectorResolutionResult, { state: "RESOLVED" }>;
  snapshots: readonly FinancialSnapshot[];
  deliveries: readonly DeliveryRecord[];
}): AuthoritativeCutoffResult {
  const withIds = args.deliveries.filter((d) => {
    const periodOk =
      args.resolved.reportingPeriodKey == null ||
      d.reportingPeriodKey === args.resolved.reportingPeriodKey;
    const asOfOk =
      args.resolved.asOf.kind !== "EXACT_DATE" || d.asOfIsoDate === args.resolved.asOf.isoDate;
    const deliveredOk = isoCompare(d.deliveredAtIsoDate, args.evaluationDate) <= 0;
    return periodOk && asOfOk && deliveredOk && Boolean(d.snapshotId);
  });

  if (withIds.length > 0) {
    const maxDate = withIds.reduce(
      (m, d) => (isoCompare(d.deliveredAtIsoDate, m) > 0 ? d.deliveredAtIsoDate : m),
      withIds[0]!.deliveredAtIsoDate,
    );
    const top = withIds.filter((d) => d.deliveredAtIsoDate === maxDate);
    const snapIds = [...new Set(top.map((d) => d.snapshotId!).filter(Boolean))].sort();
    if (snapIds.length === 1) {
      const id = snapIds[0]!;
      // Snapshot must still exist in the eligible pool (APPROVED or SUPERSEDED).
      if (args.snapshots.some((s) => s.snapshotId === id && s.companyId === args.companyId)) {
        return {
          state: "RESOLVED",
          reportingPeriodKey: args.resolved.reportingPeriodKey,
          asOf: args.resolved.asOf.kind === "EXACT_DATE" ? args.resolved.asOf.isoDate : null,
          snapshotId: id,
        };
      }
    }
    if (snapIds.length > 1) {
      return {
        state: "AMBIGUOUS",
        reportingPeriodKey: args.resolved.reportingPeriodKey,
        asOf: args.resolved.asOf.kind === "EXACT_DATE" ? args.resolved.asOf.isoDate : null,
        snapshotId: null,
        reason: "multiple delivered snapshots share the most-recent delivery date for this period",
      };
    }
  }

  // Legacy bind: APPROVED-only period/asOf match (no delivery.snapshotId).
  const bound = selectSnapshotForResolvedSelector(args.resolved, args.snapshots, args.companyId);
  return {
    state: bound.state,
    reportingPeriodKey: args.resolved.reportingPeriodKey,
    asOf: args.resolved.asOf.kind === "EXACT_DATE" ? args.resolved.asOf.isoDate : null,
    snapshotId: bound.state === "RESOLVED" ? bound.snapshotId : null,
    reason: bound.state !== "RESOLVED" ? ("reason" in bound ? bound.reason : undefined) : undefined,
    missing: bound.state === "NEEDS_INPUT" ? bound.missing : undefined,
  };
}

export function resolveAuthoritativeCutoff(args: {
  companyId: string;
  evaluationDate: string;
  /** Cutoff-eligible snapshots (APPROVED and historically SUPERSEDED). */
  approved: readonly FinancialSnapshot[];
  selector?: NamedContractualSelector;
  fiscalCalendar?: FiscalCalendar;
  /** Override only for tests supplying explicit DeliveryRecords; production omits. */
  deliveries?: readonly DeliveryRecord[];
}): AuthoritativeCutoffResult {
  const fiscalCalendar = args.fiscalCalendar ?? {
    companyId: args.companyId,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
  };
  const deliveries =
    args.deliveries ??
    authoritativeDeliveriesFromSnapshots(args.companyId, args.approved);

  const resolved = resolveContractualSelector({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
    selector: args.selector ?? "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    fiscalCalendar,
    deliveries,
  });

  if (resolved.state !== "RESOLVED") {
    return {
      state: resolved.state,
      reportingPeriodKey: null,
      asOf: null,
      snapshotId: null,
      reason: resolved.reason,
      missing: resolved.state === "NEEDS_INPUT" ? resolved.missing : undefined,
    };
  }

  return bindDeliveredSnapshot({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
    resolved,
    snapshots: args.approved,
    deliveries,
  });
}
