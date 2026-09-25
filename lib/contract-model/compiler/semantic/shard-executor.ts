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
import type { CompilationShard, ShardExecutionResult, ShardPlan, ShardToolUsage } from "./shard-types";
import { auditShardMissingContext, reportedMissingDependencies } from "./missing-context-contract";
import { DEFAULT_TOOL_BUDGET } from "./types";
import type { ToolCallLogEntry } from "./types";
import type { SemanticCompilationResult, SemanticCompilerInput } from "./types";
import type { NormalizedCompilation } from "./normalize";
import type { SemanticCompileCallOptions } from "./caller";

export interface BoundedShardExecutorInput {
  /** compile.ts's own callerInput for the whole unit (carries the resolved sourceContext and the frozen inventory). */
  baseInput: SemanticCompilerInput;
  plan: ShardPlan;
  caller: SemanticCaller;
  /** Certified path: abort signal + dispatch budget for every shard call. */
  callOptions?: SemanticCompileCallOptions;
}

/**
 * §23 - summarises one shard conversation's tool-call log into bounded counters that travel with the durable result.
 * A refusal is identified by the tool layer's own marker: no chars returned and a summary that names the refusal.
 */
export function summariseToolUsage(log: readonly ToolCallLogEntry[], budget = DEFAULT_TOOL_BUDGET): ShardToolUsage {
  const byTool: Record<string, number> = {};
  let sourceReadingCalls = 0, refusals = 0, charsReturned = 0;
  for (const e of log) {
    byTool[e.toolName] = (byTool[e.toolName] ?? 0) + 1;
    charsReturned += e.charsReturned;
    if (e.charsReturned > 0) sourceReadingCalls++;
    else refusals++;
  }
  return {
    calls: log.length,
    sourceReadingCalls,
    refusals,
    charsReturned,
    maxToolCalls: budget.maxToolCalls,
    maxAdditionalSourceChars: budget.maxAdditionalSourceChars,
    remainingCallSlots: Math.max(0, budget.maxToolCalls - log.length),
    remainingSourceChars: Math.max(0, budget.maxAdditionalSourceChars - charsReturned),
    byTool,
    requestedTargets: log.slice(0, 64).map((e) => {
      const i = e.input as Record<string, unknown> | null;
      const target = i && typeof i === "object" ? (i.term ?? i.sectionRef ?? i.reference ?? i.targetRef ?? i.query) : null;
      return typeof target === "string" ? target : JSON.stringify(e.input).slice(0, 120);
    }),
    anyEvidenceUnresolved: log.some((e) => e.evidenceUnresolved === true),
    anyEvidenceTruncated: log.some((e) => e.evidenceTruncated === true),
  };
}

/** Maps one bounded compilation's result into the executor's outcome shape - the same mapping the certified paid runs used. */
export function shardOutcomeFromBoundedResult(compile: SemanticCompilationResult, inventoryDispositions: NormalizedCompilation["inventoryDispositions"], shard?: CompilationShard): Omit<ShardExecutionResult, "shardId" | "shardHash" | "reusedFromHash" | "attempts"> {
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
    toolUsage: summariseToolUsage(compile.toolCallLog ?? []),
    // §22: the MISSING_CONTEXT claim is audited against what this shard was actually handed, never taken at face value.
    ...(shard && composition ? { missingContextAudit: auditShardMissingContext({ shard, reported: reportedMissingDependencies(composition) }) } : {}),
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
      callOptions: input.callOptions,
    });
    return shardOutcomeFromBoundedResult(outcome.result, outcome.inventoryDispositions, shard);
  };
}
