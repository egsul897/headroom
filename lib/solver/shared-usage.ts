/**
 * Shared-constraint pre-transaction usage helpers.
 *
 * Utilization authority is owned by `lib/capacity/utilization-authority.ts`
 * (reconciles #232 solver statuses with #234 completeness certificates).
 *
 * Remaining = cap − usage is allowed only when `authoritative === true`, which
 * requires an APPROVED completeness certificate matching the evidence shape.
 */

import {
  decideSolverUtilizationAuthority,
  type SolverCompletenessCertInput,
} from "../capacity/utilization-authority";
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
  | "ATTRIBUTED_INCOMPLETE"
  | "EXTERNAL_INPUT_REQUIRED"
  | "ENTITY_CLASS_USAGE_UNAVAILABLE";

/** Statuses under which `usage` may be treated as established for remaining claims. */
export const AUTHORITATIVE_USAGE_STATUSES: readonly SharedUsageComputationStatus[] = [
  "COMPUTED",
  "VERIFIED_ZERO",
];

export function isAuthoritativeUsageStatus(
  status: SharedUsageComputationStatus,
  authoritativeFlag?: boolean,
): boolean {
  if (authoritativeFlag === false) return false;
  if (authoritativeFlag === true) return AUTHORITATIVE_USAGE_STATUSES.includes(status);
  // Without the flag, only statuses that historically meant remaining-safe —
  // post-reconciliation callers must pass the authoritative boolean from computeSharedConstraintCurrentUsage.
  return false;
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
  /**
   * Completeness certificate required for authoritative remaining.
   * VERIFIED_EMPTY when usage is zero; VERIFIED_COMPLETE when attributed set is full.
   * SYNTHETIC_LABELED refused unless allowSyntheticRemaining (tests only).
   */
  completenessCertificate?: SolverCompletenessCertInput | null;
  /** Test-only — never set in production loaders. */
  allowSyntheticRemaining?: boolean;
}): {
  usage: number;
  status: SharedUsageComputationStatus;
  authoritative: boolean;
  knowledge: string;
  blockers: string[];
  note: string;
} {
  const byPermission = new Map<string, BasketUsageRecord>();
  for (const row of params.basketUsage) {
    if (row.permissionId) byPermission.set(row.permissionId, row);
  }

  const namedMembers = params.members.filter((m) => m.permissionId);
  let measuredUsage = 0;
  let attributedMembers = 0;
  for (const member of namedMembers) {
    const record = byPermission.get(member.permissionId!);
    if (record) {
      attributedMembers++;
      measuredUsage += measureBasketUsageAmount(record, params.measurementBasis);
    }
  }

  const decision = decideSolverUtilizationAuthority({
    namedMemberCount: namedMembers.length,
    attributedMemberCount: attributedMembers,
    measuredUsage,
    aggregation: params.aggregationRule,
    completenessCertificate: params.completenessCertificate ?? null,
    allowSyntheticRemaining: params.allowSyntheticRemaining,
  });

  return {
    usage: decision.attributedAmount ?? 0,
    status: decision.solverStatus,
    authoritative: decision.authoritativeForRemaining,
    knowledge: decision.kind,
    blockers: decision.blockers,
    note: decision.note,
  };
}
