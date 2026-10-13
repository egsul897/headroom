/**
 * Authoritative contractual cutoff bind for product paths.
 * Always uses REQUIRE_PERSISTED_DELIVERY — approval never establishes delivery.
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

export function resolveAuthoritativeCutoff(args: {
  companyId: string;
  evaluationDate: string;
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

  const bound = selectSnapshotForResolvedSelector(resolved, args.approved, args.companyId);
  return {
    state: bound.state,
    reportingPeriodKey: resolved.reportingPeriodKey,
    asOf: resolved.asOf.kind === "EXACT_DATE" ? resolved.asOf.isoDate : null,
    snapshotId: bound.state === "RESOLVED" ? bound.snapshotId : null,
    reason: bound.state !== "RESOLVED" ? ("reason" in bound ? bound.reason : undefined) : undefined,
    missing: bound.state === "NEEDS_INPUT" ? bound.missing : undefined,
  };
}
