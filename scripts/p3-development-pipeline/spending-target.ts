/**
 * Development spending-target accounting.
 *
 * A spending target stops a diagnostic run. It is not a hard ceiling and it
 * does not reserve the worst case of the next call. Missing token telemetry
 * is UNKNOWN spend. It is not a known zero, and it blocks the next dispatch.
 *
 * A genuine hard ceiling remains BudgetLedger in scripts/p3-conmed-pilot/timeout-policy.ts:
 * reserve before dispatch, retain an unbilled timeout, refuse a call that
 * does not fit.
 */

export type ListedSpendStatus = "EXACT" | "UNKNOWN";

export interface ListedSpendSettlement {
  status: ListedSpendStatus;
  /** Null when tokens are missing. Never a fabricated zero. */
  knownUsd: number | null;
  countedAsKnownZero: false;
}

export function settleListedSpend(inputTokens: number | null, outputTokens: number | null, listUsd: (inputTokens: number, outputTokens: number) => number): ListedSpendSettlement {
  if (inputTokens == null || outputTokens == null) return { status: "UNKNOWN", knownUsd: null, countedAsKnownZero: false };
  return { status: "EXACT", knownUsd: listUsd(inputTokens, outputTokens), countedAsKnownZero: false };
}

export interface SpendingTargetDecision {
  allowed: boolean;
  /** This discriminator is the contract. WITHIN_TARGET is not a hard-ceiling approval. */
  authorization: "DEVELOPMENT_TARGET";
  hardCeiling: false;
  reason: "WITHIN_TARGET" | "SPENDING_TARGET_REACHED" | "UNKNOWN_BILLING_UNSETTLED";
  detail: string;
}

/** Known spend is compared with the target. Unknown billing stops the next dispatch without being booked at $0. */
export function mayDispatchUnderSpendingTarget(args: { knownSpentUsd: number; unknownDispatches: number; targetUsd: number }): SpendingTargetDecision {
  const base = { authorization: "DEVELOPMENT_TARGET" as const, hardCeiling: false as const };
  if (args.unknownDispatches > 0) {
    return { ...base, allowed: false, reason: "UNKNOWN_BILLING_UNSETTLED", detail: `${args.unknownDispatches} dispatch(es) have no token telemetry. Unknown spend is not $0, and another dispatch is not started.` };
  }
  if (args.knownSpentUsd >= args.targetUsd) {
    return { ...base, allowed: false, reason: "SPENDING_TARGET_REACHED", detail: `known spend ${args.knownSpentUsd} has reached the development spending target ${args.targetUsd}. This target is not a hard ceiling.` };
  }
  return { ...base, allowed: true, reason: "WITHIN_TARGET", detail: `known spend ${args.knownSpentUsd} is inside the development spending target ${args.targetUsd}.` };
}
