/**
 * Unified verified transaction execution — public product surface.
 *
 * Consumable by Position / Ask / Simulate via `toProductExecutionHandoff`.
 * Engines remain in verified-execution + capacity; this package only orchestrates.
 */

export {
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
  type ExecutableRuleLifecycle,
  type TransactionType,
  type ExecutionMode,
  type ExecutionStatus,
  type ProductionAuthorityClassification,
  type VerifiedExecutableRuleIdentity,
  type SelectedLegalPath,
  type ReviewerAuthorization,
  type UtilizationCompletenessInput,
  type UnifiedTransactionExecutionRequest,
  type UnifiedTransactionExecutionResult,
  type BindingConstraint,
  type CapacityEffectsSummary,
  type ExecutionTraceStep,
  type ProductExecutionHandoff,
} from "./types";

export { executeUnifiedVerifiedTransaction } from "./execute";

export {
  toProductExecutionHandoff,
  toAllProductExecutionHandoffs,
} from "./product-handoff";

export {
  validateFinancialEvidenceBundle,
  type FinancialEvidenceBundle,
  type FinancialMetricEvidence,
  type FinancialMetricKey,
  type FinancialEvidenceValidationResult,
  type FinancialEvidenceAuthenticity,
  type FinancialVerificationStatus,
  type AmendmentRestatementStatus,
} from "./adapters/financial-evidence";

export {
  evaluateOperativeSourceAuthority,
  operativeAuthorityFromProvision,
  operativeAuthorityFromGoverningProvision,
  type OperativeSourceAuthority,
  type OperativeAuthorityClassification,
  type OperativeAuthorityEvaluation,
  type DocumentOperativeStatus,
} from "./adapters/operative-authority";

export {
  evaluateUtilizationAuthorityGate,
  type UtilizationAuthorityGate,
} from "./adapters/utilization";

export {
  PRODUCT_EXECUTION_PERSISTENCE_VERSION,
  persistUnifiedTransactionExecution,
  executeAndPersistUnifiedVerifiedTransaction,
  loadPersistedUnifiedExecution,
  type PersistUnifiedExecutionInput,
  type UnifiedExecutionPersistenceRecord,
  type ExecuteAndPersistOptions,
} from "./persist-execution";
