/**
 * F-7A - SHARD EXECUTION STATE MACHINE (provider-free).
 *
 * Runs a ShardPlan through an injected per-shard executor and stitches the results. The executor is the ONLY place a
 * model is ever involved (in production it will wrap the existing bounded RealSemanticCaller + normalizeSubmission per
 * shard - F-7B; here every test injects a scripted executor). This module never imports a provider.
 *
 * Partial-failure isolation (mission §13): every shard ends in exactly one ShardStatus; a provider failure on one
 * shard never touches another shard's result, and the stitched candidate stays PARTIAL / REVIEW_REQUIRED with the
 * failed shard's owned material items explicitly unresolved.
 *
 * Bounded retry + reuse (mission §14/§15): a prior result whose shardHash equals the plan's shard hash is reused
 * without a call (frozen source / inventory / context / generation unchanged); a shard is re-executed at most
 * `maxAttemptsPerShard` times, and only on SHARD_PROVIDER_FAILURE. Nothing here raises a global retry count.
 *
 * F-7C REUSE CONTRACT (what costs money again): a shardHash covers the shard's primary source, its owned items, every
 * context entry's full-text hash, the frozen inventory hash and the compiler generation. Re-running the identical
 * shard therefore changes nothing the model is shown. So every TERMINAL, NON-TRANSIENT status is reusable by hash -
 * SHARD_COMPLETE, SHARD_MISSING_CONTEXT, SHARD_PARTIAL and SHARD_SCHEMA_FAILURE - and its failure reasons travel with
 * it into the stitched result (the candidate stays PARTIAL / REVIEW_REQUIRED exactly as the first run left it). Only
 * SHARD_PROVIDER_FAILURE (a transport/provider condition, not a judgment about this input) is re-executed. Re-running
 * a safe terminal review result to fish for a better draw is a paid favourable-draw retry, which nothing here does;
 * the way to change such a result is to change its input, which changes its hash.
 */
import { stitchShardResults } from "./shard-stitcher";
import type { CompilationShard, ShardExecutionResult, ShardPlan, ShardStatus, StitchedCompilation } from "./shard-types";
import type { FrozenSemanticInventory, SourceContextState } from "../semantic-accountability/types";

export type ShardExecutor = (shard: CompilationShard, attempt: number) => Promise<Omit<ShardExecutionResult, "shardId" | "shardHash" | "reusedFromHash" | "attempts">>;

/** F-7C: the statuses a prior same-hash result may be served under without a new call. Everything terminal except a provider failure. */
export const REUSABLE_TERMINAL_SHARD_STATUSES: readonly ShardStatus[] = ["SHARD_COMPLETE", "SHARD_MISSING_CONTEXT", "SHARD_PARTIAL", "SHARD_SCHEMA_FAILURE"];

export interface ExecuteShardPlanInput {
  plan: ShardPlan;
  executor: ShardExecutor;
  frozenInventory: FrozenSemanticInventory;
  sourceContextState: SourceContextState;
  companyId: string;
  instrumentKey: string;
  candidateRef: string;
  /** Results of an earlier execution, keyed by shardHash - reused when the hash still matches (never re-run). */
  priorResults?: Map<string, ShardExecutionResult>;
  /** Total attempts allowed per shard (default 1 = no retry). Retries happen only after SHARD_PROVIDER_FAILURE. */
  maxAttemptsPerShard?: number;
  /** Which prior terminal statuses may be reused by hash (default REUSABLE_TERMINAL_SHARD_STATUSES). SHARD_PROVIDER_FAILURE is never reusable regardless of this list. */
  reusableStatuses?: readonly ShardStatus[];
  /** F-7B.2: the resolved source-context regions, forwarded to the stitcher so the UNIQUE_PRIMARY_SOURCE_DECLARATION proof class is available. Omitted: that proof class is unavailable (definitions without a planner unit or owned lineage are dropped as unattributed). */
  sourceRegions?: { regionId: string; text: string }[];
}

export interface ExecuteShardPlanOutput {
  results: ShardExecutionResult[];
  stitched: StitchedCompilation;
  stats: { shards: number; executed: number; reused: number; retries: number; complete: number; failed: number; reusedByStatus: Partial<Record<ShardStatus, number>> };
}

export async function executeShardPlan(input: ExecuteShardPlanInput): Promise<ExecuteShardPlanOutput> {
  const maxAttempts = Math.max(1, input.maxAttemptsPerShard ?? 1);
  const reusable = new Set<ShardStatus>((input.reusableStatuses ?? REUSABLE_TERMINAL_SHARD_STATUSES).filter((s) => s !== "SHARD_PROVIDER_FAILURE"));
  const results: ShardExecutionResult[] = [];
  const reusedByStatus: Partial<Record<ShardStatus, number>> = {};
  let executed = 0, reused = 0, retries = 0;
  for (const shard of input.plan.shards) {
    const prior = input.priorResults?.get(shard.shardHash);
    if (prior && reusable.has(prior.status)) {
      results.push({ ...prior, shardId: shard.shardId, shardHash: shard.shardHash, reusedFromHash: true });
      reused++;
      reusedByStatus[prior.status] = (reusedByStatus[prior.status] ?? 0) + 1;
      continue;
    }
    let attempt = 0;
    let last: ShardExecutionResult | null = null;
    while (attempt < maxAttempts) {
      attempt++;
      executed++;
      if (attempt > 1) retries++;
      let outcome: Awaited<ReturnType<ShardExecutor>>;
      try {
        outcome = await input.executor(shard, attempt);
      } catch (err) {
        outcome = { status: "SHARD_PROVIDER_FAILURE", composition: null, failureReasons: ["PROVIDER_FAILURE", "TRANSPORT_OR_INTERNAL_ERROR"], unresolvedIssues: [`shard executor threw: ${err instanceof Error ? err.message : String(err)}`], telemetry: null };
      }
      last = { ...outcome, shardId: shard.shardId, shardHash: shard.shardHash, reusedFromHash: false, attempts: attempt };
      if (outcome.status !== "SHARD_PROVIDER_FAILURE") break;
    }
    results.push(last!);
  }
  const stitched = stitchShardResults({ plan: input.plan, results, frozenInventory: input.frozenInventory, sourceContextState: input.sourceContextState, companyId: input.companyId, instrumentKey: input.instrumentKey, candidateRef: input.candidateRef, sourceRegions: input.sourceRegions });
  return { results, stitched, stats: { shards: input.plan.shards.length, executed, reused, retries, complete: results.filter((r) => r.status === "SHARD_COMPLETE").length, failed: results.filter((r) => r.status !== "SHARD_COMPLETE").length, reusedByStatus } };
}

/** Classifies one bounded compilation's own outcome into a ShardStatus - the same failure vocabulary compile.ts already uses. */
export function classifyShardStatus(status: "COMPLETED" | "REVIEW_REQUIRED" | "PARTIAL" | "FAILED", failureReasons: readonly string[]): ShardExecutionResult["status"] {
  if (status === "FAILED") {
    if (failureReasons.includes("PROVIDER_FAILURE") || failureReasons.includes("TRANSPORT_OR_INTERNAL_ERROR") || failureReasons.includes("TOOL_BUDGET_EXHAUSTED")) return "SHARD_PROVIDER_FAILURE";
    if (failureReasons.includes("MODEL_SCHEMA_FAILURE") || failureReasons.includes("IR_VALIDATION_FAILURE") || failureReasons.includes("OUTPUT_TRUNCATED")) return "SHARD_SCHEMA_FAILURE";
    return "SHARD_PROVIDER_FAILURE";
  }
  if (status === "PARTIAL") return "SHARD_PARTIAL";
  if (failureReasons.includes("MISSING_CONTEXT")) return "SHARD_MISSING_CONTEXT";
  return "SHARD_COMPLETE";
}
