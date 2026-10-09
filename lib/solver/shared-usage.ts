/**
 * Shared-constraint pre-transaction usage helpers.
 *
 * NAMED_MEMBER_CLAUSES usage is derived only from permission-attributed
 * basketUsage records. EXTERNAL_INSTRUMENT_BALANCE and ENTITY_CLASS_FILTER
 * deliberately return 0 here — those require external instrument balances or
 * entity-class outstanding debt that must not be invented from empty inputs.
 */

import type {
  AggregationRule,
  BasketUsageRecord,
  MeasurementBasis,
  SharedConstraintMember,
} from "./types";

export type SharedUsageComputationStatus =
  | "COMPUTED"
  | "ZERO_NO_ATTRIBUTED_USAGE"
  | "EXTERNAL_INPUT_REQUIRED"
  | "ENTITY_CLASS_USAGE_UNAVAILABLE";

export function measureBasketUsageAmount(
  record: BasketUsageRecord | undefined,
  basis: MeasurementBasis,
): number {
  if (!record) return 0;
  switch (basis) {
    case "CUMULATIVE_INCURRED":
      return Math.max(0, record.cumulativeIncurred);
    case "CURRENTLY_OUTSTANDING":
    case "NET_OF_REPAYMENT":
      return Math.max(0, record.currentlyOutstanding);
    case "PREPAYMENT_CREDIT":
      return Math.max(0, record.prepaymentCredit);
    default:
      return 0;
  }
}

export function basketUsageFromAttributedEvents(
  events: Array<{
    eventType: string;
    amount: number;
    relatedPermissionIds?: string[] | null;
  }>,
  permissionIds: Iterable<string>,
): BasketUsageRecord[] {
  const idSet = new Set(permissionIds);
  const out: BasketUsageRecord[] = [];
  for (const permissionId of idSet) {
    const relevant = events.filter((e) => (e.relatedPermissionIds ?? []).includes(permissionId));
    if (!relevant.length) continue;
    const cumulativeIncurred = relevant
      .filter((e) => e.eventType === "ISSUANCE")
      .reduce((s, e) => s + e.amount, 0);
    const repaid = relevant
      .filter((e) => e.eventType === "REPAYMENT")
      .reduce((s, e) => s + e.amount, 0);
    out.push({
      permissionId,
      cumulativeIncurred,
      currentlyOutstanding: Math.max(0, cumulativeIncurred - repaid),
      prepaymentCredit: 0,
    });
  }
  return out.sort((a, b) => (a.permissionId ?? "").localeCompare(b.permissionId ?? ""));
}

export function computeSharedConstraintCurrentUsage(params: {
  aggregationRule: AggregationRule;
  measurementBasis: MeasurementBasis;
  members: SharedConstraintMember[];
  basketUsage: BasketUsageRecord[];
}): { usage: number; status: SharedUsageComputationStatus } {
  if (params.aggregationRule === "EXTERNAL_INSTRUMENT_BALANCE") {
    return { usage: 0, status: "EXTERNAL_INPUT_REQUIRED" };
  }
  if (params.aggregationRule === "ENTITY_CLASS_FILTER") {
    return { usage: 0, status: "ENTITY_CLASS_USAGE_UNAVAILABLE" };
  }

  const byPermission = new Map<string, BasketUsageRecord>();
  for (const row of params.basketUsage) {
    if (row.permissionId) byPermission.set(row.permissionId, row);
  }

  let usage = 0;
  let sawAttributed = false;
  for (const member of params.members) {
    if (!member.permissionId) continue;
    const record = byPermission.get(member.permissionId);
    if (record) sawAttributed = true;
    usage += measureBasketUsageAmount(record, params.measurementBasis);
  }

  return {
    usage: Math.max(0, usage),
    status: sawAttributed ? "COMPUTED" : "ZERO_NO_ATTRIBUTED_USAGE",
  };
}
