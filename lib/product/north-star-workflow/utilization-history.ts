/**
 * Re-export utilization honesty from the sequential-execution boundary.
 * Product code must not import Phase-4 runtime primitives directly.
 */
export {
  classifyUtilizationHistory,
  honestRemaining,
  UTILIZATION_UNKNOWN_REASON,
  type UtilizationHistoryStatus,
} from "@/lib/contract-model/sequential-execution";
