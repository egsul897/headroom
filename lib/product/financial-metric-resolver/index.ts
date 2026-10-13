/**
 * Canonical financial-metric resolver — shared inputs for Phase 4C capacity
 * and Phase 4D simulation. Package/instrument-driven; fail-closed on authority.
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
} from "./resolve";

export {
  runCanonicalTransactionScenario,
  demonstrateDependencyPropagation,
} from "./scenarios";
