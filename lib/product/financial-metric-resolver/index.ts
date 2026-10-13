/**
 * Canonical financial-metric resolver — shared inputs for Phase 4C capacity
 * and Phase 4D simulation. Package/instrument-driven; fail-closed on authority.
 *
 * Production exports never include forceEvidenceAuthority or synthetic approval
 * override helpers. Test-only NS-4 fixtures live under tests/.
 */

export type {
  FinancialEvidenceAuthority,
  CapacityPublicationAuthority,
  FinancialMetricIdentity,
  TypedFinancialFact,
  CanonicalFinancialInputBundle,
  TransactionScenarioRequest,
  BasketEvaluationRow,
  TransactionScenarioResult,
} from "./types";

export {
  resolveRegisteredPackage,
  listRegisteredPackageKeys,
  MATTHEWS_PKG,
  COHERENT_PKG,
  SYNTHETIC_PKG,
  type RegisteredFinancialPackage,
} from "./registry";

export {
  resolveCanonicalFinancialInputs,
  mayEvaluateGrossCapacity,
  mayClaimVerifiedRemaining,
  type ResolveCanonicalFinancialInputsArgs,
} from "./resolve";

export {
  validateApprovedNs4SnapshotForPackage,
  deriveEvidenceAuthority,
  type Ns4ApprovalValidation,
} from "./ns4-approval";

export {
  runCanonicalTransactionScenario,
  demonstrateDependencyPropagation,
} from "./scenarios";
