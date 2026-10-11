/**
 * Additive product handoff for Position / Ask / Simulate.
 *
 * Does not redesign those pages — exposes a stable projection of
 * UnifiedTransactionExecutionResult that each surface can consume.
 */

import { createHash } from "node:crypto";
import type {
  ProductExecutionHandoff,
  UnifiedTransactionExecutionResult,
} from "./types";

function traceIdOf(result: UnifiedTransactionExecutionResult): string {
  const payload = JSON.stringify({
    v: result.contractVersion,
    status: result.executionStatus,
    path: result.legalPath.pathId,
    pkg: result.postStateIdentity.packageHash,
    tx: result.postStateIdentity.transactionId,
    date: result.postStateIdentity.evaluationDate,
    production: result.productionAuthority,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

/**
 * Project orchestration result for a single product surface.
 * EXECUTABLE is affirmative only when simulation SATISFIED under hypothetical
 * or production-active classification — never when REFUSED / incomplete.
 */
export function toProductExecutionHandoff(
  result: UnifiedTransactionExecutionResult,
  surface: ProductExecutionHandoff["surface"],
): ProductExecutionHandoff {
  const executable =
    (result.executionStatus === "EXECUTED_HYPOTHETICAL" ||
      result.executionStatus === "EXECUTED_SATISFIED") &&
    result.verified.simulation?.outcome === "EXECUTED" &&
    result.verified.simulation.simulation.selectedPathResult === "SATISFIED" &&
    result.verified.simulation.simulation.simulationStatus === "SIMULATED";

  const authorityNote =
    result.productionAuthority === "PRODUCTION_AUTHORITY_ACTIVE"
      ? "Production-authoritative verified transaction result."
      : result.productionAuthority === "PRODUCTION_AUTHORITY_BLOCKED"
        ? "Production authority BLOCKED — host trusted-issuer activation not live; do not present as PRODUCTION_AUTHORITY."
        : "Hypothetical verified simulation only — HYPOTHETICAL must not promote to PRODUCTION_AUTHORITY.";

  return {
    contractVersion: result.contractVersion,
    surface,
    executionStatus: result.executionStatus,
    productionAuthority: result.productionAuthority,
    executable,
    blockers: [...result.blockers],
    authorityNote,
    selectedPathId: result.legalPath.pathId,
    sourceCitations: [...result.sourceCitations],
    utilizationSupportsRemaining: result.utilizationAuthority.supportsRemainingClaim,
    remainingPublicationAllowed: result.capacityEffects.remainingPublicationAllowed,
    traceId: traceIdOf(result),
  };
}

/** Convenience: build handoffs for all three product surfaces from one result. */
export function toAllProductExecutionHandoffs(
  result: UnifiedTransactionExecutionResult,
): Record<ProductExecutionHandoff["surface"], ProductExecutionHandoff> {
  return {
    POSITION: toProductExecutionHandoff(result, "POSITION"),
    ASK: toProductExecutionHandoff(result, "ASK"),
    SIMULATE: toProductExecutionHandoff(result, "SIMULATE"),
  };
}
