/**
 * F-7B.3 harness helpers (harness-only, never production). Adds to the F-7B harness exactly what Stage 2 completion
 * needs: loading the five FROZEN paid Stage-1 results from their own evidence directory, identifying the remaining 31
 * shards, an actuals-grounded cost estimator, and the F-7B.2 source-anchored stitch over whatever results exist.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { stitchShardResults } from "../lib/contract-model/compiler/semantic/shard-stitcher";
import type { CompilationShard, ShardExecutionResult, ShardPlan, StitchedCompilation } from "../lib/contract-model/compiler/semantic/shard-types";
import type { Frozen, ShardRecord } from "./f7b-lib";

export const STAGE1_EVIDENCE_DIR = process.env.F7B3_STAGE1_DIR ?? "tests/fixtures/unseen-packages/f7b1-chewy-101-canary-rerun";
export const STAGE2_EVIDENCE_DIR = process.env.F7B_EVIDENCE_DIR ?? "tests/fixtures/unseen-packages/f7b3-chewy-101-stage2";
export const F7B3_DIR = process.env.F7B_DIR ?? "docs/phase-3-remediation-f7b3";
export const STAGE2_CAP_USD = Number(process.env.F7B3_CAP_USD ?? "20.0");

export interface Evidence { record: ShardRecord; result: ShardExecutionResult }

/** The five frozen paid Stage-1 results, read from their own directory and never rewritten by this mission. */
export function loadFrozenStage1(): Map<string, Evidence> {
  const out = new Map<string, Evidence>();
  for (const f of readdirSync(STAGE1_EVIDENCE_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const e = JSON.parse(readFileSync(`${STAGE1_EVIDENCE_DIR}/${f}`, "utf-8")) as Evidence;
    out.set(e.result.shardId, e);
  }
  return out;
}

/** Stage-2 results produced by THIS mission (one file per shard, written the moment the shard returns). */
export function loadStage2(): Map<string, Evidence> {
  const out = new Map<string, Evidence>();
  if (!existsSync(STAGE2_EVIDENCE_DIR)) return out;
  for (const f of readdirSync(STAGE2_EVIDENCE_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const e = JSON.parse(readFileSync(`${STAGE2_EVIDENCE_DIR}/${f}`, "utf-8")) as Evidence;
    out.set(e.result.shardId, e);
  }
  return out;
}

export function stage2EvidencePath(shard: CompilationShard): string {
  return `${STAGE2_EVIDENCE_DIR}/shard-${String(shard.ordinal).padStart(2, "0")}-${shard.shardId.replace("shard:", "")}.json`;
}

/** The remaining shards, in frozen plan ordinal order: all 36 minus the five frozen Stage-1 ids. No re-selection. */
export function remainingShards(plan: ShardPlan, stage1: Map<string, Evidence>): CompilationShard[] {
  return plan.shards.filter((s) => !stage1.has(s.shardId));
}

/** Deterministic three-wave split (§6): 10 / 10 / 11 in plan ordinal order. A spend checkpoint, never a reordering. */
export function waves(remaining: CompilationShard[]): { A: CompilationShard[]; B: CompilationShard[]; C: CompilationShard[] } {
  return { A: remaining.slice(0, 10), B: remaining.slice(10, 20), C: remaining.slice(20) };
}

/**
 * Cost estimator grounded in the five paid Stage-1 actuals (§7). Stage-1 cost tracked the RENDERED first-turn burden
 * (the model reads the shard, then works it over several turns), so the rate is dollars per rendered first-turn token,
 * taken at the worst single observed shard rather than the mean, and then multiplied by a variance margin.
 */
export interface CostModel { meanRate: number; worstRate: number; safety: number; perRenderedToken: number }
export function costModel(stage1: Evidence[], safety = 1.25): CostModel {
  const rates = stage1.map((e) => e.record.actual.costUsd / Math.max(1, e.record.estimatedFirstTurnInputTokens));
  const totalCost = stage1.reduce((a, e) => a + e.record.actual.costUsd, 0);
  const totalRendered = stage1.reduce((a, e) => a + e.record.estimatedFirstTurnInputTokens, 0);
  const worstRate = Math.max(...rates);
  return { meanRate: totalCost / Math.max(1, totalRendered), worstRate, safety, perRenderedToken: worstRate * safety };
}
export const estimateShardUsd = (model: CostModel, renderedTokens: number): number => renderedTokens * model.perRenderedToken;

/** The F-7B.2 stitch: always pass the resolved region texts so the primary-source proof class is available. */
export function stitchAll(frozen: Frozen, results: ShardExecutionResult[]): StitchedCompilation {
  return stitchShardResults({
    plan: frozen.plan, results, frozenInventory: frozen.callerInput.frozenInventory!,
    sourceContextState: frozen.callerInput.sourceContext!.state, companyId: frozen.callerInput.companyId,
    instrumentKey: frozen.callerInput.instrumentKey, candidateRef: frozen.callerInput.candidateRef,
    sourceRegions: frozen.callerInput.sourceContext!.regions.map((r) => ({ regionId: r.regionId, text: r.text })),
  });
}
