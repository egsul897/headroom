/**
 * Re-export sequential runner from the contract-model boundary.
 * Product code must not import Phase-4 runtime primitives directly.
 */
export {
  SEQUENTIAL_EXECUTION_VERSION as SEQUENTIAL_TRANSACTION_RUNNER_VERSION,
  runSequentialTransactions,
  replaySequentialRun,
  assertCompletedNotDoublePosted,
  materializeBackendUsages,
  createMemoryLedgerBackend,
  advanceWorld,
  chainFinancialViewWithScope,
  type RunnerMode,
  type SequentialWorld,
  type SequentialStepSpec,
  type SequentialStepResult,
  type SequentialRunResult,
  type LedgerAppendSurface,
  type CapacitySnapshotView,
  type HypotheticalTransaction,
  type SelectedPath,
} from "@/lib/contract-model/sequential-execution";

/** @deprecated Use SequentialStepSpec — kept for call-site migration. */
export type { SequentialStepSpec as SequentialStepInput } from "@/lib/contract-model/sequential-execution";
