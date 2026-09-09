/**
 * F-5.3B - DUAL-PASS SEMANTIC INVENTORY ORCHESTRATION (production mode DUAL_PASS_ENSEMBLE).
 *
 *     same source context -> independent Pass A (pass id 1) -> independent Pass A (pass id 2)
 *                         -> buildEnsembleInventory (deterministic, provider-free, STRICT compatibility)
 *                         -> frozen authoritative ensemble inventory
 *
 * The two Pass A executions are ordinary runSemanticInventory calls (bounded first pass + bounded gap pass each) over
 * the SAME resolved source context. Neither pass sees the other's output, the frozen reference, or any prior evidence:
 * independence is by construction (two separate call sequences to a stateless caller), not by prompt. The ensemble
 * module itself makes no call - the second paid call lives HERE, visibly, never inside ensemble.ts. Exactly two passes:
 * no third pass, no voting, no recursion. A pass that FAILED / was SKIPPED yields no ensemble - the result is that
 * pass's own failure status (a failed pass can neither corroborate nor be corroborated), never a one-pass "ensemble".
 *
 * Independence contract: Pass A side (imports inventory/ensemble/types only).
 */
import type { StageCaller } from "../llm-caller";
import { buildEnsembleInventory, EnsembleIncompatibleInputError, type EnsembleInventory } from "./ensemble";
import { runSemanticInventory, type SemanticInventoryInput } from "./inventory";
import { partitionSourceSlots } from "./slots";
import type { FrozenSemanticInventory } from "./types";

export type SemanticInventoryMode = "SINGLE_PASS" | "DUAL_PASS_ENSEMBLE";
export const SEMANTIC_INVENTORY_MODE_ENV_VAR = "SEMANTIC_INVENTORY_MODE";
/** Generic, order-free pass identifiers. Never semantic labels. */
export const DUAL_PASS_IDS: readonly [string, string] = ["pass-1", "pass-2"];

/** Resolves the production inventory mode: explicit option, else the SEMANTIC_INVENTORY_MODE env var, else SINGLE_PASS. An unknown value is an error, never a silent default. */
export function resolveSemanticInventoryMode(explicit?: SemanticInventoryMode | null): SemanticInventoryMode {
  const raw = explicit ?? process.env[SEMANTIC_INVENTORY_MODE_ENV_VAR] ?? "SINGLE_PASS";
  if (raw === "SINGLE_PASS" || raw === "DUAL_PASS_ENSEMBLE") return raw;
  throw new Error(`unknown semantic inventory mode "${raw}" (expected SINGLE_PASS or DUAL_PASS_ENSEMBLE)`);
}

export interface DualPassInventoryInput extends Omit<SemanticInventoryInput, "caller"> {
  /** One caller per pass. Both may be the same stateless StageCaller instance; tests inject two scripted callers. Defaults to the env-var-driven getStageCaller() for both, exactly like the single-pass path. */
  passCallers?: [StageCaller, StageCaller];
  /** Generic pass ids (default "pass-1"/"pass-2"). */
  passIds?: [string, string];
}

export interface DualPassInventoryResult {
  /** The authoritative inventory: the frozen ensemble when both passes ran, otherwise the failed/skipped pass's own status record (inventory.ensemble is then absent). */
  inventory: FrozenSemanticInventory;
  /** Both frozen passes, in execution order, exactly as they were handed to the ensemble. */
  passes: { passId: string; inventory: FrozenSemanticInventory }[];
  ensembleBuilt: boolean;
  /** Why no ensemble was built, when ensembleBuilt is false. */
  ensembleRefusal: string | null;
}

/**
 * Runs exactly two independent Pass A executions over one source context and freezes their support-aware canonical
 * union. Never throws for a provider failure (each pass already returns INVENTORY_FAILED); throws only for a programming
 * error (mismatched ids). Compatibility is STRICT: both passes were produced here over the same input under the same
 * contract, so a rejection here is a defect, surfaced as INVENTORY_FAILED with the gate's reason - never worked around.
 */
export async function runDualPassSemanticInventory(input: DualPassInventoryInput): Promise<DualPassInventoryResult> {
  const passIds = input.passIds ?? DUAL_PASS_IDS;
  if (passIds[0] === passIds[1]) throw new Error("dual-pass ensemble needs two distinct pass ids");
  const callers = input.passCallers ?? [undefined, undefined];
  const base: Omit<SemanticInventoryInput, "caller"> = { candidateRef: input.candidateRef, documentId: input.documentId, sourceContext: input.sourceContext, externalAccountability: input.externalAccountability, structuralIndex: input.structuralIndex, batchChars: input.batchChars };
  const passes: DualPassInventoryResult["passes"] = [];
  // Sequential and independent: pass 2 starts from the same frozen input as pass 1, never from pass 1's output.
  for (let i = 0; i < 2; i++) {
    const inventory = await runSemanticInventory({ ...base, caller: callers[i] });
    passes.push({ passId: passIds[i]!, inventory });
  }
  const notRun = passes.filter((p) => p.inventory.inventoryStatus !== "INVENTORY_OK" && p.inventory.inventoryStatus !== "INVENTORY_COVERAGE_GAP");
  if (notRun.length > 0) {
    const worst = notRun[0]!;
    const refusal = `dual-pass ensemble not built: ${notRun.map((p) => `${p.passId} ${p.inventory.inventoryStatus}`).join(", ")} - a pass that did not run cannot corroborate or be corroborated`;
    const inventory: FrozenSemanticInventory = { ...worst.inventory, inventoryStatusReason: `${refusal}; ${worst.inventory.inventoryStatusReason}` };
    return { inventory, passes, ensembleBuilt: false, ensembleRefusal: refusal };
  }
  const partition = partitionSourceSlots({ sourceContext: input.sourceContext, structuralIndex: input.structuralIndex ?? null });
  let ensemble: EnsembleInventory;
  try {
    ensemble = buildEnsembleInventory({ candidateRef: input.candidateRef, sourceContext: input.sourceContext, structuralIndex: input.structuralIndex ?? null, partition, passes, externalAccountability: input.externalAccountability, compatibility: { mode: "STRICT" } });
  } catch (err) {
    const reason = err instanceof EnsembleIncompatibleInputError ? err.message : `ensemble construction failed: ${err instanceof Error ? err.message : String(err)}`;
    const first = passes[0]!.inventory;
    const inventory: FrozenSemanticInventory = { ...first, items: [], inventoryStatus: "INVENTORY_FAILED", inventoryStatusReason: `dual-pass ensemble not built: ${reason}`, telemetryCostUsd: passes.reduce<number | null>((acc, p) => (acc === null && p.inventory.telemetryCostUsd === null ? null : (acc ?? 0) + (p.inventory.telemetryCostUsd ?? 0)), null) };
    return { inventory, passes, ensembleBuilt: false, ensembleRefusal: reason };
  }
  // The ensemble carries the per-pass call accounting so cost/telemetry consumers see two passes, never one.
  const partitionRecord = passes[0]!.inventory.partition;
  if (partitionRecord) {
    ensemble.partition = { ...partitionRecord, batches: passes.reduce((n, p) => n + (p.inventory.partition?.batches ?? 0), 0), gapBatches: passes.reduce((n, p) => n + (p.inventory.partition?.gapBatches ?? 0), 0), firstPassCalls: passes.reduce((n, p) => n + (p.inventory.partition?.firstPassCalls ?? 0), 0), gapCalls: passes.reduce((n, p) => n + (p.inventory.partition?.gapCalls ?? 0), 0) };
  }
  ensemble.gapReinventory = passes[0]!.inventory.gapReinventory && passes[1]!.inventory.gapReinventory ? { attempted: passes.some((p) => p.inventory.gapReinventory?.attempted), segmentsBefore: passes.reduce((n, p) => n + (p.inventory.gapReinventory?.segmentsBefore ?? 0), 0), itemsAdded: passes.reduce((n, p) => n + (p.inventory.gapReinventory?.itemsAdded ?? 0), 0), duplicatesDropped: passes.reduce((n, p) => n + (p.inventory.gapReinventory?.duplicatesDropped ?? 0), 0), unverifiableDropped: passes.reduce((n, p) => n + (p.inventory.gapReinventory?.unverifiableDropped ?? 0), 0), segmentsAfter: ensemble.unaccountedSource.length, costUsd: passes.reduce<number | null>((acc, p) => (acc === null && (p.inventory.gapReinventory?.costUsd ?? null) === null ? null : (acc ?? 0) + (p.inventory.gapReinventory?.costUsd ?? 0)), null), error: passes.map((p) => p.inventory.gapReinventory?.error).filter(Boolean).join("; ") || null } : null;
  return { inventory: ensemble, passes, ensembleBuilt: true, ensembleRefusal: null };
}
