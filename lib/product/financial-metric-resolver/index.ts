/**
 * Canonical financial-metric resolver — shared inputs for Phase 4C capacity
 * and Phase 4D simulation. Package/instrument-driven; fail-closed on authority.
 *
 * This module is the single production financial-input resolver. It supersedes
 * earlier #335 tip variants that still exposed forceEvidenceAuthority (demote-
 * only). APPROVED_SNAPSHOT requires per-value NS-4 input binding — structural
 * snapshot presence alone never labels package/computed figures APPROVED.
 *
 * Production exports never include forceEvidenceAuthority or synthetic approval
 * override helpers. Test-only NS-4 fixtures live under tests/.
 */

export type {
  FinancialEvidenceAuthority,
  CapacityPublicationAuthority,
  FinancialMetricIdentity,
  TypedFinancialFact,
  ApprovedFactProvenance,
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
  deriveStructuralNs4Gate,
  deriveEvidenceAuthority,
  type Ns4ApprovalValidation,
} from "./ns4-approval";

export {
  bindApprovedFact,
  planPublishedFacts,
  PUBLISHED_FACT_KEYS,
  type PublishedFactKey,
  type ApprovedValueProvenance,
  type FactBindingResult,
} from "./ns4-value-binding";

export {
  runCanonicalTransactionScenario,
  demonstrateDependencyPropagation,
} from "./scenarios";

export {
  resolveCanonicalFinancialInputsViaProductBinder,
  type ProductCanonicalFinancialResolution,
} from "./product-bridge";
