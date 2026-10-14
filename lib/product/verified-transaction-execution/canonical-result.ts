/**
 * Module-controlled authenticity for UnifiedTransactionExecutionResult.
 *
 * Only executeUnifiedVerifiedTransaction may brand a result, via a one-shot
 * mint capability installed from that module. Deep-import callers without the
 * mint cannot manufacture WeakMap authenticity.
 *
 * Seal / permission paths read mint-time snapshots from the WeakMap — mutable
 * field copies and structural Pick fabrications never authorize.
 */

import {
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
  type ExecutionStatus,
  type ProductionAuthorityClassification,
  type TransactionType,
  type UnifiedTransactionExecutionResult,
} from "./types";

export type CanonicalExecutionPermissionSnapshot = {
  executionStatus: ExecutionStatus;
  productionAuthority: ProductionAuthorityClassification;
  contractVersion: typeof UNIFIED_TRANSACTION_EXECUTION_VERSION;
  /** Bound verified-transaction identity (mint-time; immutable). */
  companyId: string;
  instrumentKey: string;
  packageHash: string | null;
  transactionId: string | null;
  transactionType: TransactionType;
  transactionAmount: number;
  transactionCurrency: string;
  evaluationDate: string;
  selectedPathId: string;
  selectedRuleIds: readonly string[];
  operativeDocumentId: string | null;
  financialSnapshotProvenanceIds: readonly string[];
};

const canonicalExecutionSnapshots = new WeakMap<
  object,
  CanonicalExecutionPermissionSnapshot
>();

/** Unforgeable mint capabilities — only the execute-module install is accepted. */
const authorizedBrandMinters = new WeakSet<object>();
let executeBrandMinter: object | null = null;

/**
 * Install the sole brand minter for executeUnifiedVerifiedTransaction.
 * Idempotent for the execute module; refuses a second distinct install.
 */
export function installCanonicalExecutionBrandMinterForExecuteModule(proof: {
  module: "verified-transaction-execution/execute";
}): object {
  if (proof.module !== "verified-transaction-execution/execute") {
    throw new Error("canonical brand minter refused — invalid module proof");
  }
  if (executeBrandMinter != null) return executeBrandMinter;
  const minter = Object.freeze({ scope: "executeUnifiedVerifiedTransaction" as const });
  authorizedBrandMinters.add(minter);
  executeBrandMinter = minter;
  return minter;
}

export type CanonicalBrandIdentity = {
  companyId: string;
  instrumentKey: string;
  transactionType: TransactionType;
  transactionAmount: number;
  transactionCurrency: string;
  operativeDocumentId: string | null;
};

/**
 * Brand a result minted by executeUnifiedVerifiedTransaction with bound identity.
 * Without the execute-module minter, returns the object unbranded (no WeakMap write).
 */
export function brandCanonicalUnifiedTransactionExecutionResult(
  result: UnifiedTransactionExecutionResult,
  minter: object,
  identity: CanonicalBrandIdentity,
): UnifiedTransactionExecutionResult {
  if (!authorizedBrandMinters.has(minter) || minter !== executeBrandMinter) {
    return result;
  }
  const provenanceIds = result.financialInputs.metrics
    .map((m) => m.provenanceId)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort();
  canonicalExecutionSnapshots.set(result, {
    executionStatus: result.executionStatus,
    productionAuthority: result.productionAuthority,
    contractVersion: result.contractVersion,
    companyId: identity.companyId,
    instrumentKey: identity.instrumentKey,
    packageHash: result.postStateIdentity.packageHash,
    transactionId: result.postStateIdentity.transactionId,
    transactionType: identity.transactionType,
    transactionAmount: identity.transactionAmount,
    transactionCurrency: identity.transactionCurrency,
    evaluationDate: result.postStateIdentity.evaluationDate,
    selectedPathId: result.legalPath.pathId,
    selectedRuleIds: Object.freeze([...result.legalPath.ruleIds]),
    operativeDocumentId: identity.operativeDocumentId,
    financialSnapshotProvenanceIds: Object.freeze(provenanceIds),
  });
  return result;
}

/** Mint-time permission + identity fields — ignores post-brand field mutation. */
export function readCanonicalExecutionPermissionSnapshot(
  result: unknown,
): CanonicalExecutionPermissionSnapshot | null {
  if (typeof result !== "object" || result === null) return null;
  return canonicalExecutionSnapshots.get(result) ?? null;
}

export function isCanonicalUnifiedTransactionExecutionResult(
  value: unknown,
): boolean {
  return readCanonicalExecutionPermissionSnapshot(value) != null;
}
