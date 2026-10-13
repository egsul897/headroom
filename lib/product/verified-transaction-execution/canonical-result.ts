/**
 * Module-controlled authenticity for UnifiedTransactionExecutionResult.
 *
 * Only executeUnifiedVerifiedTransaction may brand a result. Seal / permission
 * paths read mint-time snapshots from the WeakMap — mutable field copies and
 * structural Pick fabrications never authorize.
 */

import {
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
  type ExecutionStatus,
  type ProductionAuthorityClassification,
  type UnifiedTransactionExecutionResult,
} from "./types";

export type CanonicalExecutionPermissionSnapshot = {
  executionStatus: ExecutionStatus;
  productionAuthority: ProductionAuthorityClassification;
  contractVersion: typeof UNIFIED_TRANSACTION_EXECUTION_VERSION;
};

const canonicalExecutionSnapshots = new WeakMap<
  object,
  CanonicalExecutionPermissionSnapshot
>();

/**
 * Brand a result minted by executeUnifiedVerifiedTransaction.
 * Not exported from the package public surface — callers cannot brand fabrications.
 */
export function brandCanonicalUnifiedTransactionExecutionResult(
  result: UnifiedTransactionExecutionResult,
): UnifiedTransactionExecutionResult {
  canonicalExecutionSnapshots.set(result, {
    executionStatus: result.executionStatus,
    productionAuthority: result.productionAuthority,
    contractVersion: result.contractVersion,
  });
  return result;
}

/** Mint-time permission fields — ignores post-brand field mutation. */
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
