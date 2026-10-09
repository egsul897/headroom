/**
 * Shared-constraint pre-transaction usage helpers.
 *
 * Utilization integrity contract (Neon activation P0):
 * - VERIFIED_ZERO: attributed records establish zero outstanding (authoritative empty).
 * - ZERO_NO_ATTRIBUTED_USAGE: no attributed records — NOT an authoritative zero-usage claim.
 * - COMPUTED: known attributed usage summed for named members (authoritative).
 * - EXTERNAL_INPUT_REQUIRED / ENTITY_CLASS_USAGE_UNAVAILABLE: unknown external usage.
 * - PARTIAL_ATTRIBUTED_USAGE: some named members attributed, others not (not fully established).
 *
 * EXTERNAL_INSTRUMENT_BALANCE and ENTITY_CLASS_FILTER deliberately return usage 0 with a
 * non-authoritative status — those require external balances that must not be invented.
 */

import type {
  AggregationRule,
  BasketUsageRecord,
  MeasurementBasis,
  SharedConstraintMember,
} from "./types";

export type SharedUsageComputationStatus =
  | "COMPUTED"
  | "VERIFIED_ZERO"
  | "ZERO_NO_ATTRIBUTED_USAGE"
  | "PARTIAL_ATTRIBUTED_USAGE"
  | "EXTERNAL_INPUT_REQUIRED"
  | "ENTITY_CLASS_USAGE_UNAVAILABLE";

/** Statuses under which `usage` may be treated as an established utilization fact. */
export const AUTHORITATIVE_USAGE_STATUSES: readonly SharedUsageComputationStatus[] = [
  "COMPUTED",
  "VERIFIED_ZERO",
];

export function isAuthoritativeUsageStatus(status: SharedUsageComputationStatus): boolean {
  return AUTHORITATIVE_USAGE_STATUSES.includes(status);
}

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
}): { usage: number; status: SharedUsageComputationStatus; authoritative: boolean } {
  if (params.aggregationRule === "EXTERNAL_INSTRUMENT_BALANCE") {
    return { usage: 0, status: "EXTERNAL_INPUT_REQUIRED", authoritative: false };
  }
  if (params.aggregationRule === "ENTITY_CLASS_FILTER") {
    return { usage: 0, status: "ENTITY_CLASS_USAGE_UNAVAILABLE", authoritative: false };
  }

  const byPermission = new Map<string, BasketUsageRecord>();
  for (const row of params.basketUsage) {
    if (row.permissionId) byPermission.set(row.permissionId, row);
  }

  const namedMembers = params.members.filter((m) => m.permissionId);
  if (namedMembers.length === 0) {
    return { usage: 0, status: "ZERO_NO_ATTRIBUTED_USAGE", authoritative: false };
  }

  let usage = 0;
  let attributedMembers = 0;
  for (const member of namedMembers) {
    const record = byPermission.get(member.permissionId!);
    if (record) {
      attributedMembers++;
      usage += measureBasketUsageAmount(record, params.measurementBasis);
    }
  }

  if (attributedMembers === 0) {
    return { usage: 0, status: "ZERO_NO_ATTRIBUTED_USAGE", authoritative: false };
  }
  if (attributedMembers < namedMembers.length) {
    return {
      usage: Math.max(0, usage),
      status: "PARTIAL_ATTRIBUTED_USAGE",
      authoritative: false,
    };
  }
  const status: SharedUsageComputationStatus = usage === 0 ? "VERIFIED_ZERO" : "COMPUTED";
  return { usage: Math.max(0, usage), status, authoritative: true };
}
