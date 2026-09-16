/**
 * PHASE 3 FINAL-BRIDGE / 6.01 - HD-4 RESUMABLE ORCHESTRATION (harness-level; the ONE implementation the paid run and
 * its zero-cost crash certification both import - the same single-implementation rule as HD-1/HD-2/HD-3).
 *
 * Hierarchy (mission §15):
 *   per-call durable replay (DurableReplayStageCaller)
 *     -> per-pass computation (production runDualPassSemanticInventory, unchanged)
 *       -> ensemble (production, unchanged)
 *         -> IMMEDIATE frozen-inventory + pass persistence (HD-3, unchanged: persistAndReload)
 *           -> reload -> resume proof -> Pass B (terminal shard results durable on the priorShardResults contract)
 *             -> verifier (same durable-call primitive).
 *
 * Restart semantics, pre-registered:
 *   - frozen-inventory.json + pass-a-passes.json present AND the persisted ensemble satisfies the §4 prerequisite
 *     -> RESUMED_FROM_ENSEMBLE_PERSISTENCE: no Pass-A caller is invoked at all (not even for replay).
 *   - otherwise Pass A runs through the durable callers: every exact call with a valid record replays ($0, 0 provider
 *     calls); the interrupted call and everything after it execute live. An ensemble that fails the §4 prerequisite
 *     is written as evidence (frozen-inventory.unusable.<ts>.json), never as the resumable artifact.
 */
import { existsSync, readFileSync } from "node:fs";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { runDualPassSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/dual-pass";
import { computeSourceContextHash } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION, type FrozenSemanticInventory, type SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-verification/types";
import type { StructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { passAPrerequisiteSatisfied, persistAndReload, type PersistProof } from "./phase-3-601-guard";
import { DurableCallStore, DurableReplayStageCaller, PASS_A_SCHEMA_IDS, VERIFIER_SCHEMA_IDS, summarize, type DurableCallLogEntry, type DurableCallSummary, type DurableReplayHooks } from "./phase-3-601-durable-replay";

export const PASS_IDS: [string, string] = ["pass-1", "pass-2"];
export type PassASource = "RESUMED_FROM_ENSEMBLE_PERSISTENCE" | "EXECUTED";

export interface DurablePassAInput {
  evidenceDir: string;
  missionId: string;
  candidateRef: string;
  documentId: string;
  sourceContext: SourceContextResult;
  structuralIndex: StructuralIndex;
  batchChars?: number;
  /** The LIVE caller for a pass (in the paid run: GuardedStageCaller over the real provider; in tests: scripted). Built lazily so a resumed run never constructs one. */
  liveCallerFor: (passId: string) => StageCaller;
  hooksFor?: (passId: string) => DurableReplayHooks;
}
export interface DurablePassAExecution {
  dual: Awaited<ReturnType<typeof runDualPassSemanticInventory>>;
  callers: [DurableReplayStageCaller, DurableReplayStageCaller];
  accounting: { perPass: Record<string, DurableCallSummary>; total: DurableCallSummary; log: DurableCallLogEntry[] };
}
export interface DurablePassAOutput {
  source: PassASource;
  usable: boolean;
  inventory: FrozenSemanticInventory;
  passes: { passId: string; inventory: FrozenSemanticInventory }[];
  proofs: { inventory: PersistProof<FrozenSemanticInventory>; passes: PersistProof<{ passId: string; inventory: FrozenSemanticInventory }[]> } | null;
  execution: DurablePassAExecution | null;
  paths: { inventory: string; passes: string; calls: string };
}

export function passAScope(input: Pick<DurablePassAInput, "missionId" | "candidateRef" | "documentId" | "sourceContext">, passId: string) {
  return { missionId: input.missionId, passId, sourceDocumentId: input.documentId, candidateRef: input.candidateRef, sourceContextHash: computeSourceContextHash(input.sourceContext), algorithmVersion: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, promptVersion: SEMANTIC_INVENTORY_PROMPT_VERSION };
}
export function passAPaths(evidenceDir: string) { return { inventory: `${evidenceDir}/frozen-inventory.json`, passes: `${evidenceDir}/pass-a-passes.json`, calls: `${evidenceDir}/durable-calls` }; }

/** Pass A through durable callers, WITHOUT ensemble persistence (exposed so the crash matrix can model a kill between the two). */
export async function runDurablePassA(input: DurablePassAInput): Promise<DurablePassAExecution> {
  const store = new DurableCallStore(passAPaths(input.evidenceDir).calls);
  const callers = PASS_IDS.map((passId) => new DurableReplayStageCaller(input.liveCallerFor(passId), store, passAScope(input, passId), PASS_A_SCHEMA_IDS, input.hooksFor?.(passId) ?? {})) as [DurableReplayStageCaller, DurableReplayStageCaller];
  const dual = await runDualPassSemanticInventory({ candidateRef: input.candidateRef, documentId: input.documentId, sourceContext: input.sourceContext, structuralIndex: input.structuralIndex, passCallers: callers, passIds: PASS_IDS, batchChars: input.batchChars });
  const log = [...callers[0].log, ...callers[1].log];
  return { dual, callers, accounting: { perPass: { [PASS_IDS[0]]: callers[0].summary(), [PASS_IDS[1]]: callers[1].summary() }, total: summarize(log), log } };
}

/** HD-3 (unchanged): the instant the ensemble exists it is persisted and reloaded; downstream consumes ONLY the reloaded object. */
export function persistEnsemble(evidenceDir: string, exec: DurablePassAExecution): DurablePassAOutput {
  const paths = passAPaths(evidenceDir);
  const { dual } = exec;
  const usable = passAPrerequisiteSatisfied({ pass1: dual.passes[0]?.inventory, pass2: dual.passes[1]?.inventory, ensembleBuilt: dual.ensembleBuilt, authoritativeItemCount: dual.inventory.items.length });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const invPath = usable ? paths.inventory : `${evidenceDir}/frozen-inventory.unusable.${stamp}.json`;
  const passPath = usable ? paths.passes : `${evidenceDir}/pass-a-passes.unusable.${stamp}.json`;
  const inventory = persistAndReload<FrozenSemanticInventory>(invPath, dual.inventory);
  const passes = persistAndReload(passPath, dual.passes);
  return { source: "EXECUTED", usable, inventory: inventory.reloaded, passes: passes.reloaded, proofs: { inventory, passes }, execution: exec, paths };
}

/** Restart-safe Pass A: resume the persisted ensemble if usable, else run (durable replays make completed calls free). */
export async function resumablePassA(input: DurablePassAInput): Promise<DurablePassAOutput> {
  const paths = passAPaths(input.evidenceDir);
  if (existsSync(paths.inventory) && existsSync(paths.passes)) {
    const inventory = JSON.parse(readFileSync(paths.inventory, "utf8")) as FrozenSemanticInventory;
    const passes = JSON.parse(readFileSync(paths.passes, "utf8")) as { passId: string; inventory: FrozenSemanticInventory }[];
    const usable = inventory.candidateRef === input.candidateRef && passAPrerequisiteSatisfied({ pass1: passes[0]?.inventory, pass2: passes[1]?.inventory, ensembleBuilt: Boolean(inventory.ensemble), authoritativeItemCount: inventory.items.length });
    if (usable) return { source: "RESUMED_FROM_ENSEMBLE_PERSISTENCE", usable: true, inventory, passes, proofs: null, execution: null, paths };
  }
  return persistEnsemble(input.evidenceDir, await runDurablePassA(input));
}

// ---------------------------------------------------------------------------
// Verifier: the same durable-call primitive (mission §17)
// ---------------------------------------------------------------------------
export function verifierScope(missionId: string, candidateRef: string, documentId: string, sourceContext: SourceContextResult) {
  return { missionId, passId: "verifier", sourceDocumentId: documentId, candidateRef, sourceContextHash: computeSourceContextHash(sourceContext), algorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION, promptVersion: SEMANTIC_VERIFIER_PROMPT_VERSION };
}
export function durableVerifierCallers(evidenceDir: string, scope: ReturnType<typeof verifierScope>, live: { review: StageCaller; suspicion: StageCaller }, hooks: { review?: DurableReplayHooks; suspicion?: DurableReplayHooks } = {}) {
  const store = new DurableCallStore(`${evidenceDir}/durable-verifier-calls`);
  return { store, review: new DurableReplayStageCaller(live.review, store, scope, VERIFIER_SCHEMA_IDS, hooks.review ?? {}), suspicion: new DurableReplayStageCaller(live.suspicion, store, scope, VERIFIER_SCHEMA_IDS, hooks.suspicion ?? {}) };
}
