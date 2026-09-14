/**
 * F-7C - THE PRODUCTION SHARD EXECUTOR ADAPTER.
 *
 * The smallest bridge between the provider-free shard state machine (shard-execution.ts, which only knows an injected
 * ShardExecutor) and the existing semantic compilation primitives. For one CompilationShard it:
 *   1. builds the shard's own SemanticCompilerInput with the certified builder (buildShardCompilerInput): only the
 *      shard's owned primary source, only its bounded read-only context, only its owned inventory view;
 *   2. runs the ONE bounded composition primitive (bounded-composition.ts) over it - the existing semantic caller,
 *      transport normalization, normalizeSubmission, IR validation and failure classification, unchanged - with
 *      whole-unit accountability OFF, exactly the run shape every certified F-7B/F-7B.3E shard result was produced
 *      under (the harness called compileCovenantToIR(shardInput, { accountability: false }));
 *   3. classifies the terminal ShardStatus with the same classifyShardStatus every certified run used and returns the
 *      composition (rules / definitions / shared capacities / explicit inventory dispositions) for the stitcher.
 *
 * It never calls compileCovenantToIR, so a shard can never re-enter execution-mode selection and recursively plan.
 * It never runs Pass A (the frozen inventory is whole-unit truth) and never runs Pass C (global Pass C runs once,
 * after stitching - the only completeness authority).
 */
import type { SemanticCaller } from "./caller";
import { compileBoundedComposition, contextBundleEvidenceFlags } from "./bounded-composition";
import { buildShardCompilerInput } from "./shard-planner";
import { classifyShardStatus, type ShardExecutor } from "./shard-execution";
import type { CompilationShard, ShardExecutionResult, ShardPlan } from "./shard-types";
import type { SemanticCompilationResult, SemanticCompilerInput } from "./types";
import type { NormalizedCompilation } from "./normalize";

export interface BoundedShardExecutorInput {
  /** compile.ts's own callerInput for the whole unit (carries the resolved sourceContext and the frozen inventory). */
  baseInput: SemanticCompilerInput;
  plan: ShardPlan;
  caller: SemanticCaller;
}

/** Maps one bounded compilation's result into the executor's outcome shape - the same mapping the certified paid runs used. */
export function shardOutcomeFromBoundedResult(compile: SemanticCompilationResult, inventoryDispositions: NormalizedCompilation["inventoryDispositions"]): Omit<ShardExecutionResult, "shardId" | "shardHash" | "reusedFromHash" | "attempts"> {
  const status = classifyShardStatus(compile.status, compile.failureReasons);
  const composition = compile.status === "FAILED" && compile.rules.length === 0 && compile.definitions.length === 0
    ? null
    : { rules: compile.rules, definitions: compile.definitions, sharedCapacities: compile.sharedCapacities, inventoryDispositions };
  return {
    status,
    composition,
    failureReasons: compile.failureReasons,
    unresolvedIssues: compile.unresolvedIssues,
    telemetry: compile.telemetry ? { inputTokens: compile.telemetry.inputTokens, outputTokens: compile.telemetry.outputTokens, costUsd: compile.telemetry.calculatedCostUsd } : null,
  };
}

export function createBoundedShardExecutor(input: BoundedShardExecutorInput): ShardExecutor {
  return async (shard: CompilationShard) => {
    const shardInput = buildShardCompilerInput(input.baseInput, input.plan, shard);
    const outcome = await compileBoundedComposition(shardInput, shardInput, {
      caller: input.caller,
      cacheKey: `${input.plan.planHash}#${shard.shardHash}`,
      evidenceFlags: contextBundleEvidenceFlags(shardInput),
      accountability: { sourceContext: null, frozenInventory: null, inventoryMode: null, inventoryPasses: null },
    });
    return shardOutcomeFromBoundedResult(outcome.result, outcome.inventoryDispositions);
  };
}
