/**
 * Zero-cost shard-threshold simulation. Sizes Option 1 (lower targetPrimaryChars) using the
 * REAL production planner at alternative thresholds. No model call, no production change.
 *
 * Two evidence tiers, reported separately and never pooled:
 *   TIER_1_REAL_INVENTORY  — candidates with a real frozen Pass-A inventory on disk. The
 *                            planner's must-link (composite) constraints are REAL.
 *   TIER_2_STRUCTURAL_ONLY — empty inventory. Unit derivation, boundaries and sizes are the
 *                            real planner's, but must-link is EMPTY, so composite protection
 *                            is absent and composite risk here is a LOWER BOUND.
 *
 * Budget derivation (§3): maxPrimaryChars keeps production's 2x ratio to targetPrimaryChars;
 * every other budget field is left at DEFAULT_SHARD_BUDGET. Nothing is hand-tuned per case.
 */
import fs from "node:fs";
import path from "node:path";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { resolveSourceContext } from "../../lib/contract-model/compiler/semantic-accountability/source-context";
import type { FrozenSemanticInventory, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";
import type { ShardBudget, ShardPlan, CompilationShard } from "../../lib/contract-model/compiler/semantic/shard-types";
import { CALIBRATED_TOKENS_PER_CHAR, FIXED_CALL_OVERHEAD_CHARS } from "../../lib/contract-model/compiler/semantic/shard-types";
import { DEFAULT_TOOL_BUDGET, SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { operativeTextFor, COMPANY_ID, INSTRUMENT_KEY, sha256 } from "./pipeline";
import { dedupExact } from "./dedup";
import { buildInput, prepare } from "./compile-run";

const OUT = "docs/phase-3-shard-threshold-simulation";
export const THRESHOLDS = [12_000, 10_000, 9_000, 8_000, 7_000, 6_000, 5_000, 4_000] as const;
const INVENTORY_BATCH_CHARS = 6000;
const INVENTORY_PASSES = 2;
const MAX_TURN_OVERHEAD = 4;
const tok = (c: number) => Math.ceil(c * CALIBRATED_TOKENS_PER_CHAR);

export function budgetFor(target: number): ShardBudget {
  // Deterministic derivation, disclosed: production ships 12,000 / 24,000, i.e. max = 2 x target.
  return { ...DEFAULT_SHARD_BUDGET, targetPrimaryChars: target, maxPrimaryChars: target * 2 };
}

export function emptyInventory(candidateRef: string, sc: SourceContextResult): FrozenSemanticInventory {
  return {
    candidateRef, items: [], uninventoriedValues: [], unaccountedSource: [],
    sourceCoverage: { regionsConsidered: sc.regions.map((r) => r.regionId), countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 0 } as FrozenSemanticInventory["sourceCoverage"],
    gapReinventory: null, inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER", inventoryStatusReason: "structural-only simulation: no Pass A was run",
    rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: sc.state,
    frozenContentHash: sha256("structural-only:" + candidateRef), frozenAt: "1970-01-01T00:00:00.000Z",
    algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, provider: "none", model: "none", telemetryCostUsd: null,
  };
}

export type BoundaryQuality = "EXACT_STRUCTURAL_BOUNDARY" | "CLAUSE_BOUNDARY" | "SUBCLAUSE_BOUNDARY" | "SENTENCE_BOUNDARY" | "MID_SENTENCE" | "UNKNOWN";

/** Classify the text at a shard's trailing edge. Shards tile units, so the question is what a unit edge sits on. */
export function classifyBoundary(regionText: string, end: number, isLastShard: boolean): BoundaryQuality {
  if (isLastShard) return "EXACT_STRUCTURAL_BOUNDARY";
  const before = regionText.slice(Math.max(0, end - 40), end).trimEnd();
  const after = regionText.slice(end, end + 40).trimStart();
  if (!before || !after) return "UNKNOWN";
  if (/^\(([a-z]|[ivxl]+)\)/.test(after)) return /^\([ivxl]+\)/.test(after) ? "SUBCLAUSE_BOUNDARY" : "CLAUSE_BOUNDARY";
  if (/^\(\d+\)|^[A-Z][a-z]*\.\s|^Section\s+\d/.test(after) && /[.;:]$/.test(before)) return "EXACT_STRUCTURAL_BOUNDARY";
  if (/[.;:]$/.test(before)) return "SENTENCE_BOUNDARY";
  if (/;\s*(and|or)$/.test(before)) return "CLAUSE_BOUNDARY";
  return "MID_SENTENCE";
}

const COMPOSITE_MARKERS = /provided(,)? (that|however)|except (that|as|for)|notwithstanding|so long as|subject to|unless|shall not exceed|in an aggregate (principal )?amount|greater of|lesser of/i;

/** §8 — does a shard boundary separate a proviso/exception/threshold from the clause it qualifies? */
export function compositeSplitRisk(regionText: string, shards: CompilationShard[]): { risk: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const sorted = [...shards].sort((a, b) => a.primaryCharStart - b.primaryCharStart);
  for (let i = 0; i < sorted.length - 1; i++) {
    const end = sorted[i]!.primaryCharEnd;
    const tail = regionText.slice(Math.max(0, end - 200), end);
    const head = regionText.slice(end, end + 200);
    if (COMPOSITE_MARKERS.test(head) && !/[.]\s*$/.test(tail.trimEnd())) reasons.push(`proviso/exception opens shard ${i + 2} but its primary clause ends shard ${i + 1}`);
    if (/\$[\d,]{4,}|\d+(\.\d+)?%/.test(head.slice(0, 120)) && /(not|no|shall)\s*$/.test(tail.trimEnd().slice(-40))) reasons.push(`numeric threshold in shard ${i + 2} separated from operative verb in shard ${i + 1}`);
  }
  const leadIn = sorted.length > 1; // planner delivers the chapeau to non-owning shards only as truncated context (600+300 chars)
  if (leadIn) reasons.push("chapeau delivered to non-owning shards as TRUNCATED context (LEAD_IN excluded from must-link; 600/300-char head/tail), not as owned text");
  return { risk: reasons.length > 0, reasons };
}

interface CandResult { discoveryId: string; ref: string; chars: number; tier: "TIER_1_REAL_INVENTORY" | "TIER_2_STRUCTURAL_ONLY"; items: number; plans: Record<string, { shards: number; oversized: number; primaryChars: number[]; boundaries: BoundaryQuality[]; composite: { risk: boolean; reasons: string[] }; slices: { start: number; end: number }[] }> }

async function main() {
  const { stages, bundles, rehydrated } = await prepare();
  const { keep } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));

  // Tier 1: real frozen inventories from the pilot's frozen responses, keyed by discoveryId.
  const frozenPath = "/tmp/claude-0/pilot/run/06-frozen-responses.json";
  const realInv = new Map<string, FrozenSemanticInventory>();
  if (fs.existsSync(frozenPath)) {
    for (const e of JSON.parse(fs.readFileSync(frozenPath, "utf8")) as { discoveryId: string; result?: { frozenInventory?: FrozenSemanticInventory } }[]) {
      const inv = e.result?.frozenInventory;
      if (inv && inv.items.length > 0 && !realInv.has(e.discoveryId)) realInv.set(e.discoveryId, inv);
    }
  }

  const results: CandResult[] = [];
  for (const c of keep) {
    const input = buildInput(c, bundles.get(c.discoveryId), stages, undefined as never, []);
    const sc = resolveSourceContext({ index: stages.index, documentId: input.sourceDocumentId, operativeSourceText: input.operativeSourceText, anchorNodeId: input.contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: input.operativeCharStart ?? null, documentText: stages.index.getDocumentText(input.sourceDocumentId) ?? null });
    const inv = realInv.get(c.discoveryId) ?? emptyInventory(c.discoveryId, sc);
    const tier = realInv.has(c.discoveryId) ? "TIER_1_REAL_INVENTORY" : "TIER_2_STRUCTURAL_ONLY";
    const region0 = sc.regions[0];
    const r: CandResult = { discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), chars: input.operativeSourceText.length, tier, items: inv.items.length, plans: {} };
    for (const t of THRESHOLDS) {
      let plan: ShardPlan;
      try {
        plan = planCompilationShards({ candidateRef: c.discoveryId, companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, documentId: input.sourceDocumentId, sourceContext: sc, frozenInventory: inv, structuralIndex: stages.index, budget: budgetFor(t), generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
      } catch (err) {
        r.plans[String(t)] = { shards: -1, oversized: 0, primaryChars: [], boundaries: ["UNKNOWN"], composite: { risk: false, reasons: [`planner threw: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`] }, slices: [] };
        continue;
      }
      const shards = plan.shards.filter((s) => s.regionId === region0?.regionId);
      const text = region0?.text ?? "";
      const sorted = [...shards].sort((a, b) => a.primaryCharStart - b.primaryCharStart);
      r.plans[String(t)] = {
        shards: plan.shards.length, oversized: plan.shards.filter((s) => s.oversized).length,
        primaryChars: plan.shards.map((s) => s.primaryChars),
        boundaries: sorted.map((s, i) => classifyBoundary(text, s.primaryCharEnd, i === sorted.length - 1)),
        composite: sorted.length > 1 ? compositeSplitRisk(text, sorted) : { risk: false, reasons: [] },
        slices: sorted.map((s) => ({ start: s.primaryCharStart, end: s.primaryCharEnd })),
      };
    }
    results.push(r);
  }

  // ---- per-threshold aggregate (§5, §7, §8, §9)
  const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const perThreshold = THRESHOLDS.map((t) => {
    const k = String(t);
    const rows = results.filter((r) => r.plans[k]!.shards >= 0);
    const sharded = rows.filter((r) => r.plans[k]!.shards > 1);
    const shardCounts = sharded.map((r) => r.plans[k]!.shards);
    const allPrimary = rows.flatMap((r) => r.plans[k]!.primaryChars);
    const boundaries = rows.flatMap((r) => r.plans[k]!.boundaries);
    const bq: Record<string, number> = {};
    for (const b of boundaries) bq[b] = (bq[b] ?? 0) + 1;
    const compositeRisk = sharded.filter((r) => r.plans[k]!.composite.risk);
    const conversations = rows.reduce((s, r) => s + r.plans[k]!.shards, 0);
    const inventoryCalls = rows.reduce((s, r) => s + Math.max(1, Math.ceil(r.chars / INVENTORY_BATCH_CHARS)) * INVENTORY_PASSES, 0);
    const maxSeqPerConversation = INVENTORY_PASSES * Math.ceil(Math.max(...allPrimary, 1) / INVENTORY_BATCH_CHARS) + DEFAULT_TOOL_BUDGET.maxToolCalls + MAX_TURN_OVERHEAD;
    const initialPromptTokPerShard = allPrimary.map((p) => tok(p + FIXED_CALL_OVERHEAD_CHARS));
    return {
      threshold: t, maxPrimaryChars: t * 2, candidates: rows.length,
      unsharded: rows.length - sharded.length, sharded: sharded.length, shardedPct: Number(((100 * sharded.length) / Math.max(1, rows.length)).toFixed(1)),
      totalShards: conversations, meanShardsPerAffected: Number(mean(shardCounts).toFixed(2)), medianShards: q(shardCounts, 0.5), p90Shards: q(shardCounts, 0.9), maxShards: Math.max(0, ...shardCounts),
      meanPrimaryChars: Math.round(mean(allPrimary)), p90PrimaryChars: q(allPrimary, 0.9), maxPrimaryCharsObserved: Math.max(0, ...allPrimary),
      oversizedShards: rows.reduce((s, r) => s + r.plans[k]!.oversized, 0),
      estInitialPromptTokPerShardMean: Math.round(mean(initialPromptTokPerShard)), estInitialPromptTokPerShardMax: Math.max(0, ...initialPromptTokPerShard),
      estInventoryCalls: inventoryCalls, estCompileConversations: conversations, estMaxSequentialCallsPerConversation: maxSeqPerConversation,
      boundaryQuality: bq, midSentence: bq.MID_SENTENCE ?? 0, unknown: bq.UNKNOWN ?? 0,
      compositeSplitRiskCount: compositeRisk.length, compositeSplitRiskIds: compositeRisk.map((r) => `${r.ref}:${r.discoveryId.slice(-8)}`),
      tier1Sharded: sharded.filter((r) => r.tier === "TIER_1_REAL_INVENTORY").length, tier1CompositeRisk: compositeRisk.filter((r) => r.tier === "TIER_1_REAL_INVENTORY").length,
    };
  });

  const named = (ref: string, approx: number) => results.filter((r) => r.ref === ref).sort((a, b) => Math.abs(a.chars - approx) - Math.abs(b.chars - approx))[0];
  const focus = { short_7_2_e: named("7.2(e)", 200), long_7_2_e: named("7.2(e)", 9045), hard_7_2_k: named("7.2(k)", 9621), parent_7_2_k: named("7.2(k)", 776), k_i: named("7.2(k)(i)", 8899), k_ii: named("7.2(k)(ii)", 9300), medium_7_6: named("7.6", 3501) };

  fs.mkdirSync(path.join(process.cwd(), OUT), { recursive: true });
  const w = (n: string, b: unknown) => fs.writeFileSync(path.join(process.cwd(), OUT, n), JSON.stringify(b, null, 2) + "\n");
  w("01-per-threshold.json", perThreshold);
  w("02-focus-cases.json", focus);
  w("03-all-candidates.json", results.map((r) => ({ ...r, plans: Object.fromEntries(Object.entries(r.plans).map(([k, v]) => [k, { shards: v.shards, oversized: v.oversized, primaryChars: v.primaryChars, boundaries: v.boundaries, compositeRisk: v.composite.risk, slices: v.slices }])) })));
  w("04-method.json", { thresholds: THRESHOLDS, budgetDerivation: "maxPrimaryChars = 2 x targetPrimaryChars (production ratio 24,000/12,000); all other ShardBudget fields = DEFAULT_SHARD_BUDGET", tiers: { TIER_1_REAL_INVENTORY: results.filter((r) => r.tier === "TIER_1_REAL_INVENTORY").length, TIER_2_STRUCTURAL_ONLY: results.filter((r) => r.tier === "TIER_2_STRUCTURAL_ONLY").length }, caveat: "Tier 2 runs the real planner with an EMPTY inventory: boundaries and sizes are real, must-link protection is absent, so composite risk from the planner is a lower bound; the text-marker composite check is applied to both tiers.", callModel: { inventoryBatchChars: INVENTORY_BATCH_CHARS, inventoryPasses: INVENTORY_PASSES, maxToolCalls: DEFAULT_TOOL_BUDGET.maxToolCalls, maxTurnOverhead: MAX_TURN_OVERHEAD } });

  console.log("thr    unshard sharded  %   shards mean med p90 max | meanPri p90Pri maxPri ovsz | promptTok(mean/max) | invCalls convs maxSeq | MID UNK | compRisk(t1)");
  for (const p of perThreshold) console.log(`${String(p.threshold).padStart(5)}  ${String(p.unsharded).padStart(6)} ${String(p.sharded).padStart(7)} ${String(p.shardedPct).padStart(5)} ${String(p.totalShards).padStart(6)} ${String(p.meanShardsPerAffected).padStart(5)} ${String(p.medianShards).padStart(3)} ${String(p.p90Shards).padStart(3)} ${String(p.maxShards).padStart(3)} | ${String(p.meanPrimaryChars).padStart(7)} ${String(p.p90PrimaryChars).padStart(6)} ${String(p.maxPrimaryCharsObserved).padStart(6)} ${String(p.oversizedShards).padStart(4)} | ${String(p.estInitialPromptTokPerShardMean).padStart(6)}/${String(p.estInitialPromptTokPerShardMax).padStart(6)} | ${String(p.estInventoryCalls).padStart(7)} ${String(p.estCompileConversations).padStart(5)} ${String(p.estMaxSequentialCallsPerConversation).padStart(6)} | ${String(p.midSentence).padStart(3)} ${String(p.unknown).padStart(3)} | ${String(p.compositeSplitRiskCount).padStart(3)}(${p.tier1CompositeRisk})`);
  console.log("\nFOCUS (shards per threshold, [T1]=real inventory):");
  for (const [name, r] of Object.entries(focus)) if (r) console.log(`  ${name.padEnd(13)} ${r.ref.padEnd(11)} ${String(r.chars).padStart(5)}ch ${r.tier === "TIER_1_REAL_INVENTORY" ? "[T1:" + r.items + "]" : "[T2]   "}  ` + THRESHOLDS.map((t) => `${t / 1000}k:${r.plans[String(t)]!.shards}${r.plans[String(t)]!.composite.risk ? "!" : ""}`).join(" "));
  console.log(`\nwrote ${OUT}/01..04`);
}

if (process.argv[1]?.endsWith("shard-threshold-sim.ts")) void main();
