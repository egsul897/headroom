/**
 * Product-layer honesty for utilization history.
 *
 * Phase 4C treats an empty applicable ledger as determined zero consumption
 * ("nothing was consumed"). That is correct when utilization is *confirmed*
 * empty. When utilization history is *missing* / unknown, remaining capacity
 * must stay UNKNOWN (NOT_DETERMINED), not silently full.
 */
import type { CapacityAmount, CapacityStateEntry } from "@/lib/contract-model/runtime/capacity/types";

export type UtilizationHistoryStatus =
  /** Caller affirms no usage exists for the evaluation window. */
  | "CONFIRMED_EMPTY"
  /** At least one usage record is present and attributable. */
  | "RECORDED"
  /** Utilization history is missing; do not treat empty as zero. */
  | "UNKNOWN";

export const UTILIZATION_UNKNOWN_REASON =
  "utilization history is UNKNOWN; an empty ledger is not treated as zero consumption";

/**
 * Re-interpret a capacity entry's remaining figure under an explicit utilization status.
 * Does not mutate Phase 4C state objects.
 */
export function honestRemaining(
  entry: Pick<CapacityStateEntry, "remaining" | "usage" | "appliedUsageIds" | "limitations">,
  utilizationStatus: UtilizationHistoryStatus,
): CapacityAmount {
  if (utilizationStatus !== "UNKNOWN") return entry.remaining;

  const hasApplied = entry.appliedUsageIds.length > 0;
  const usageBlocked = entry.limitations.some((l) =>
    l.code === "ALLOCATION_INFORMATION_MISSING" ||
    l.code === "AMBIGUOUS_CONSUMPTION_ALLOCATION" ||
    l.code === "DUPLICATE_LEDGER_USAGE_IDENTITY" ||
    l.code === "LEDGER_SET_UNSAFE",
  );

  if (hasApplied || usageBlocked) return entry.remaining;

  // Empty + UNKNOWN → refuse to publish remaining as full capacity.
  if (entry.usage.kind === "NOT_DETERMINED" || entry.usage.kind === "AMOUNT") {
    return { kind: "NOT_DETERMINED", reason: UTILIZATION_UNKNOWN_REASON };
  }
  return entry.remaining;
}

export function classifyUtilizationHistory(args: {
  ledgerCount: number;
  utilizationAffirmedComplete: boolean;
}): UtilizationHistoryStatus {
  if (args.ledgerCount > 0) return "RECORDED";
  if (args.utilizationAffirmedComplete) return "CONFIRMED_EMPTY";
  return "UNKNOWN";
}
