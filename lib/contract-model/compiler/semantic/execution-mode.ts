/**
 * F-7C - EXECUTION-MODE SELECTION for one compilation unit. Deterministic, architectural, and blind to identity.
 *
 * The question is not "how big is this unit" measured by any constant, and never "which agreement is this". It is:
 * after Pass A has frozen the inventory and the certified planner has derived the unit's semantic source units, can
 * the whole unit be one NORMAL bounded shard under the certified window budget? If yes, the pre-F-7 monolithic path is
 * exactly right and stays untouched. If the planner needs more than one shard, or the only way to hold the unit is an
 * OVERSIZED atomic shard (an irreducible unit larger than the budget, which must run isolated and explicitly flagged),
 * the unit is knowingly unbounded for one conversation and is executed SHARDED.
 *
 * There is deliberately no "try monolithic first, shard if it fails": F-7's whole finding is that sending a known
 * unbounded unit into one conversation is the defect, not the fallback.
 */
import { DEFAULT_SHARD_BUDGET } from "./shard-planner";
import { SHARD_PLANNER_ALGORITHM_VERSION, type ShardBudget, type ShardPlan } from "./shard-types";

export type SemanticExecutionMode = "MONOLITHIC" | "SHARDED";

export type ExecutionModeReason =
  /** accountability was disabled: no source context / frozen inventory exists to plan from, so the legacy bounded path runs as before */
  | "ACCOUNTABILITY_DISABLED"
  /** the whole unit is one normal (non-oversized) shard under the certified budget */
  | "SINGLE_BOUNDED_SHARD"
  /** the certified planner needs more than one shard to hold the unit within the window budget */
  | "MULTIPLE_SHARDS_REQUIRED"
  /** at least one irreducible unit / must-link group exceeds the budget and must run as an isolated, flagged shard */
  | "OVERSIZED_ATOMIC_UNIT";

export interface ExecutionModeDecision {
  mode: SemanticExecutionMode;
  reason: ExecutionModeReason;
  planHash: string | null;
  plannerAlgorithmVersion: string;
  shardCount: number;
  oversizedShards: number;
}

/** Version of the selection policy itself. Folded into the OUTER compile cache key (never into shard identity) so a result cached under an earlier policy can never be served for a request the current policy routes differently. */
export const SEMANTIC_EXECUTION_POLICY_VERSION = "semantic-execution-mode.v1";

export function selectCompilationExecutionMode(plan: ShardPlan | null): ExecutionModeDecision {
  if (!plan) return { mode: "MONOLITHIC", reason: "ACCOUNTABILITY_DISABLED", planHash: null, plannerAlgorithmVersion: SHARD_PLANNER_ALGORITHM_VERSION, shardCount: 0, oversizedShards: 0 };
  const oversized = plan.shards.filter((s) => s.oversized).length;
  const base = { planHash: plan.planHash, plannerAlgorithmVersion: plan.algorithmVersion, shardCount: plan.shards.length, oversizedShards: oversized };
  if (oversized > 0) return { mode: "SHARDED", reason: "OVERSIZED_ATOMIC_UNIT", ...base };
  if (plan.shards.length > 1) return { mode: "SHARDED", reason: "MULTIPLE_SHARDS_REQUIRED", ...base };
  return { mode: "MONOLITHIC", reason: "SINGLE_BOUNDED_SHARD", ...base };
}

/** The execution-policy identity that enters the outer compile cache key: policy version + planner algorithm + the effective shard budget. */
export function executionPolicyIdentity(budget: Partial<ShardBudget> | undefined): string {
  const b: ShardBudget = { ...DEFAULT_SHARD_BUDGET, ...(budget ?? {}) };
  return `${SEMANTIC_EXECUTION_POLICY_VERSION}|${SHARD_PLANNER_ALGORITHM_VERSION}|budget:${b.targetPrimaryChars}/${b.maxPrimaryChars}/${b.maxContextChars}/${b.maxContextEntryChars}/${b.maxUnitsPerShard}`;
}
