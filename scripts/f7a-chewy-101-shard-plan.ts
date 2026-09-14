/**
 * F-7A §16/§17 - the deterministic shard plan for frozen Chewy 1.01 (and 6.08 / 9.04 for comparison), with a budget
 * sensitivity study. Every shard's FIRST TURN is rendered byte-exactly through the real caller (capturing fake
 * client) so the per-shard input estimate is measured, not guessed. Zero model calls.
 *   npx tsx scripts/f7a-chewy-101-shard-plan.ts <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { RealSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { buildShardCompilerInput, planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { CALIBRATED_TOKENS_PER_CHAR, estimateTokensFromChars, type ShardBudget } from "../lib/contract-model/compiler/semantic/shard-types";
import { buildChewy, buildChewyCallerInput, capturingClient, type Captured } from "./f7a-lib";

const out = process.argv[2] ?? "docs/phase-3-remediation-f7a";
mkdirSync(out, { recursive: true });
const chewy = buildChewy();
const CURRENT_SINGLE_CALL_TOKENS: Record<string, number> = { "1.01": 312143, "6.08": 95786, "9.04": 81608 };

const budgets: { label: string; budget: Partial<ShardBudget> }[] = [
  { label: "T6k/U16", budget: { targetPrimaryChars: 6_000, maxPrimaryChars: 12_000, maxUnitsPerShard: 16 } },
  { label: "T9k/U16", budget: { targetPrimaryChars: 9_000, maxPrimaryChars: 18_000, maxUnitsPerShard: 16 } },
  { label: "T12k/U16 (default)", budget: { targetPrimaryChars: 12_000, maxPrimaryChars: 24_000, maxUnitsPerShard: 16 } },
  { label: "T12k/U32", budget: { targetPrimaryChars: 12_000, maxPrimaryChars: 24_000, maxUnitsPerShard: 32 } },
  { label: "T16k/U16", budget: { targetPrimaryChars: 16_000, maxPrimaryChars: 32_000, maxUnitsPerShard: 16 } },
  { label: "T24k/U24", budget: { targetPrimaryChars: 24_000, maxPrimaryChars: 48_000, maxUnitsPerShard: 24 } },
  { label: "T24k/U64", budget: { targetPrimaryChars: 24_000, maxPrimaryChars: 48_000, maxUnitsPerShard: 64 } },
];

async function renderShardTurns(callerInput: ReturnType<typeof buildChewyCallerInput>["callerInput"], plan: ReturnType<typeof planCompilationShards>) {
  const rows = [];
  for (const shard of plan.shards) {
    const shardInput = buildShardCompilerInput(callerInput, plan, shard);
    const sink: Captured[] = [];
    await new RealSemanticCaller("capture", "capture-model", capturingClient(sink)).compile(shardInput);
    const c = sink[0]!;
    const rendered = c.system.length + c.user.length + c.toolsJson.length;
    rows.push({ shardId: shard.shardId, renderedFirstTurnChars: rendered, renderedInputTokens: estimateTokensFromChars(rendered), plannerEstimateTokens: shard.estimate.inputTokens, shardOperativeChars: shardInput.operativeSourceText.length, shardInventoryItems: shardInput.frozenInventory!.items.length, shardBundleItems: shardInput.contextBundle.items.length, shardUnresolvedDeps: shardInput.contextBundle.unresolvedDependencies.length });
  }
  return rows;
}

(async () => {
  const report: Record<string, unknown> = { artifact: "F-7A §17 deterministic shard plan for frozen Chewy units + §16 budget sensitivity (0 model calls)", gitSha: execSync("git rev-parse HEAD").toString().trim(), at: new Date().toISOString(), tokenEstimator: { tokensPerChar: CALIBRATED_TOKENS_PER_CHAR, source: "00-current-large-unit-shape.json calibration (conservative max)" } };
  for (const ref of ["1.01", "6.08", "9.04"]) {
    const { callerInput } = buildChewyCallerInput(ref, chewy);
    const sensitivity = [];
    let chosen: ReturnType<typeof planCompilationShards> | null = null;
    for (const b of budgets) {
      const plan = planCompilationShards({ candidateRef: callerInput.candidateRef, companyId: callerInput.companyId, instrumentKey: callerInput.instrumentKey, documentId: "doc-a", sourceContext: callerInput.sourceContext!, frozenInventory: callerInput.frozenInventory!, structuralIndex: chewy.index, budget: b.budget, generation: { algorithmVersion: callerInput.compilerAlgorithmVersion, promptVersion: callerInput.compilerPromptVersion } });
      const t = plan.totals;
      sensitivity.push({ label: b.label, budget: plan.budget, shardCount: t.shardCount, maxInputTokens: t.maxShardInputTokens, medianInputTokens: t.medianShardInputTokens, p95InputTokens: t.p95ShardInputTokens, maxOutputTokens: t.maxShardOutputTokens, largestShardUnits: t.largestShardUnits, shardsWithoutOwnedItems: plan.shards.filter((s) => s.ownedItemIds.length === 0).length, totalInputTokens: t.estimatedInputTokens, ratioVsCurrentSingleCall: +(t.estimatedInputTokens / CURRENT_SINGLE_CALL_TOKENS[ref]!).toFixed(3), largestShardPrimaryChars: t.largestShardPrimaryChars, largestShardOwnedItems: t.largestShardOwnedItems, oversizedShards: t.oversizedShards, contextDuplicationChars: t.contextDuplicationChars, contextDuplicationRatio: +(t.contextDuplicationChars / Math.max(1, t.primaryChars)).toFixed(3), ownership: plan.ownershipProof, unplaced: plan.unplacedItemIds.length, mustLinkGroups: plan.mustLinkGroups.length, derivation: plan.derivation });
      if (b.label.startsWith("T12k/U16")) chosen = plan;
    }
    const plan = chosen!;
    const rendered = await renderShardTurns(callerInput, plan);
    const renderedTokens = rendered.map((r) => r.renderedInputTokens).sort((a, b) => a - b);
    const pct = (q: number) => renderedTokens[Math.min(renderedTokens.length - 1, Math.floor(q * renderedTokens.length))]!;
    const unitsByKey = new Map(plan.units.map((u) => [u.unitKey, u]));
    report[ref] = {
      candidateRef: callerInput.candidateRef,
      operativeChars: callerInput.operativeSourceText.length,
      frozenInventoryItems: callerInput.frozenInventory!.items.length,
      derivation: plan.derivation,
      units: plan.units.length,
      unitKinds: Object.fromEntries([...new Set(plan.units.map((u) => u.kind))].map((k) => [k, plan.units.filter((u) => u.kind === k).length])),
      mustLinkGroups: plan.mustLinkGroups.map((g) => ({ units: g.unitKeys.length, links: g.links.map((l) => `${l.kind}:${l.fromUnitKey}->${l.toUnitKey}`) })),
      ownershipProof: plan.ownershipProof,
      unplacedItemIds: plan.unplacedItemIds,
      sensitivity,
      chosenBudget: plan.budget,
      shards: plan.shards.map((s, i) => ({ shardId: s.shardId, shardHash: s.shardHash.slice(0, 16), primaryUnits: s.ownedUnitKeys.map((k) => { const u = unitsByKey.get(k)!; return u.termName ?? u.sectionRef ?? u.kind; }), primaryUnitCount: s.ownedUnitKeys.length, sourceChars: s.primaryChars, ownedItems: s.ownedItemIds.length, materialItems: s.ownedMaterialItemIds.length, contextEntries: s.context.length, contextKinds: Object.fromEntries([...new Set(s.context.map((c) => c.kind))].map((k) => [k, s.context.filter((c) => c.kind === k).length])), contextChars: s.contextChars, unresolvedContext: s.unresolvedContext.length, oversized: s.oversized, plannerEstimateTokens: s.estimate.inputTokens, outputTokensEstimate: s.estimate.outputTokens, renderedFirstTurnChars: rendered[i]!.renderedFirstTurnChars, renderedInputTokens: rendered[i]!.renderedInputTokens })),
      aggregate: { shardCount: plan.shards.length, maxRenderedInputTokens: renderedTokens[renderedTokens.length - 1], medianRenderedInputTokens: pct(0.5), p95RenderedInputTokens: pct(0.95), largestSourceShardChars: plan.totals.largestShardPrimaryChars, largestInventoryCount: plan.totals.largestShardOwnedItems, contextDuplicationChars: plan.totals.contextDuplicationChars, totalRenderedInputTokens: renderedTokens.reduce((a, b) => a + b, 0), currentSingleCallInputTokens: CURRENT_SINGLE_CALL_TOKENS[ref], ratioVsCurrentSingleCall: +(renderedTokens.reduce((a, b) => a + b, 0) / CURRENT_SINGLE_CALL_TOKENS[ref]!).toFixed(3), plannerVsRenderedMaxAbsError: Math.max(...rendered.map((r) => Math.abs(r.renderedInputTokens - r.plannerEstimateTokens))), oversizedShards: plan.totals.oversizedShards, planHash: plan.planHash },
    };
    console.log(ref, JSON.stringify({ units: plan.units.length, derivation: plan.derivation, ownership: plan.ownershipProof, mustLink: plan.mustLinkGroups.length, aggregate: (report[ref] as { aggregate: unknown }).aggregate, sensitivity: sensitivity.map((s) => [s.label, s.shardCount, s.maxInputTokens, s.medianInputTokens, s.p95InputTokens, s.maxOutputTokens, s.largestShardUnits, s.totalInputTokens, s.ratioVsCurrentSingleCall, s.oversizedShards]) }, null, 1));
  }
  writeFileSync(`${out}/02-chewy-101-shard-plan.json`, JSON.stringify(report, null, 1));
})();
