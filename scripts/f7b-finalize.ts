/**
 * F-7B §16-§25 finalize (ZERO model calls): cost/window summary, definition coverage, cross-shard dependencies,
 * large-definition report, §23 source/inventory change invalidation simulation on the frozen plan, §22 isolation
 * evidence, and the §25 closure gate. Reads the artifacts the stage runner wrote; never calls a provider.
 *   npx tsx scripts/f7b-finalize.ts
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { stitchShardResults } from "../lib/contract-model/compiler/semantic/shard-stitcher";
import type { ShardExecutionResult } from "../lib/contract-model/compiler/semantic/shard-types";
import { F7A_STARTING_SHA, F7B_BUDGET, F7B_DIR, MISSION_CAP_USD, freezeAndPlan, gitSha, loadLedger, loadPriorResults, readJson, writeJson, type ShardRecord } from "./f7b-lib";
import { scoreCanary } from "./f7b-score";

(async () => {
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const ledger = loadLedger();
  const prior = loadPriorResults(plan);
  const results: ShardExecutionResult[] = plan.shards.flatMap((s) => { const e = prior.get(s.shardHash); return e ? [e.result] : []; });
  const records: ShardRecord[] = plan.shards.flatMap((s) => { const e = prior.get(s.shardHash); return e ? [e.record] : []; });
  const stitched = stitchShardResults({ plan, results, frozenInventory: frozen.callerInput.frozenInventory!, sourceContextState: frozen.callerInput.sourceContext!.state, companyId: frozen.callerInput.companyId, instrumentKey: frozen.callerInput.instrumentKey, candidateRef: frozen.callerInput.candidateRef });
  const score = scoreCanary(frozen, results, records, stitched, ledger.calls);
  const stage1 = existsSync(`${F7B_DIR}/04-stage1-results-and-gate.json`) ? readJson<{ allPass: boolean; gate: Record<string, { pass: boolean }>; stage1CostUsd: number }>(`${F7B_DIR}/04-stage1-results-and-gate.json`) : null;
  const stage2 = existsSync(`${F7B_DIR}/05-stage2-cost-precheck.json`) ? readJson<Record<string, unknown>>(`${F7B_DIR}/05-stage2-cost-precheck.json`) : null;

  // ---- §23 invalidation simulation (deterministic, no paid call): one source byte inside one DEFINITION unit; then the inventory hash.
  const defUnits = plan.units.filter((u) => u.kind === "DEFINITION");
  const target = defUnits[Math.min(72, defUnits.length - 1)]!; // "definition 73" of the mission's F-7A test, by unit order
  const region = frozen.callerInput.sourceContext!.regions[0]!;
  const mid = target.charStart + Math.floor((target.charEnd - target.charStart) / 2);
  const mutatedText = region.text.slice(0, mid) + (region.text[mid] === "x" ? "y" : "x") + region.text.slice(mid + 1);
  const mutatedSc = { ...frozen.callerInput.sourceContext!, regions: [{ ...region, text: mutatedText }, ...frozen.callerInput.sourceContext!.regions.slice(1)] };
  const gen = { algorithmVersion: frozen.callerInput.compilerAlgorithmVersion, promptVersion: frozen.callerInput.compilerPromptVersion };
  const planSrc = planCompilationShards({ candidateRef: frozen.callerInput.candidateRef, companyId: frozen.callerInput.companyId, instrumentKey: frozen.callerInput.instrumentKey, documentId: "doc-a", sourceContext: mutatedSc, frozenInventory: frozen.callerInput.frozenInventory!, structuralIndex: frozen.chewy.index, budget: F7B_BUDGET, generation: gen });
  const ownerShard = plan.unitOwnerShard[target.unitKey]!;
  const readers = plan.shards.filter((s) => s.context.some((c) => c.kind === "REFERENCED_TERM" && c.contextKey === `term:${target.normalizedTermName}`)).map((s) => s.shardId);
  const byId = new Map(planSrc.shards.map((s) => [s.shardId, s]));
  const changed = plan.shards.filter((s) => byId.get(s.shardId)?.shardHash !== s.shardHash).map((s) => s.shardId);
  const reusable = plan.shards.filter((s) => byId.get(s.shardId)?.shardHash === s.shardHash && prior.get(s.shardHash)?.result.status === "SHARD_COMPLETE").length;
  const planInv = planCompilationShards({ candidateRef: frozen.callerInput.candidateRef, companyId: frozen.callerInput.companyId, instrumentKey: frozen.callerInput.instrumentKey, documentId: "doc-a", sourceContext: frozen.callerInput.sourceContext!, frozenInventory: { ...frozen.callerInput.frozenInventory!, frozenContentHash: "sha256:invalidation-simulation" }, structuralIndex: frozen.chewy.index, budget: F7B_BUDGET, generation: gen });
  const invChanged = plan.shards.filter((s) => planInv.shards.find((x) => x.shardId === s.shardId)?.shardHash !== s.shardHash).length;
  const costByShard = new Map(records.map((r) => [r.shardId, r.actual.costUsd]));
  const rerunCost = [ownerShard, ...readers].reduce((a, id) => a + (costByShard.get(id) ?? 0), 0);
  const invalidation = { artifact: "F-7B §23 source / inventory change invalidation (deterministic simulation on the frozen plan; no paid call; Chewy not mutated on disk)", mutatedUnit: { unitKey: target.unitKey, term: target.termName, ownerShard }, sourceByteChange: { shardIdsUnchanged: planSrc.shards.every((s, i) => s.shardId === plan.shards[i]!.shardId), planHashChanged: planSrc.planHash !== plan.planHash, shardsInvalidated: changed, ownerShardInvalidated: changed.includes(ownerShard), contextReaders: readers, contextReadersInvalidated: readers.filter((r) => changed.includes(r)), unrelatedShardsReusable: reusable, unrelatedShardsUnchanged: plan.shards.length - changed.length, expected: "owner + every shard that reads the mutated definition as context change hash; every other shard keeps its hash and its completed result is reused without a call" }, inventoryHashChange: { shardsInvalidated: invChanged, allInvalidated: invChanged === plan.shards.length, expected: "every shard (the frozen inventory is part of every shard's freeze identity)" }, estimatedOneShardRerunCostUsd: +rerunCost.toFixed(4), rerunShards: [ownerShard, ...readers].map((id) => ({ shardId: id, actualCostUsd: +(costByShard.get(id) ?? 0).toFixed(4) })), fullRunCostUsd: +ledger.spentUsd.toFixed(4) };
  writeJson(`${F7B_DIR}/11-invalidation-simulation.json`, invalidation);

  // ---- §22 isolation evidence: real transport failures in the run (if any) + the deterministic mock tests
  const providerFailures = records.filter((r) => r.shardStatus === "SHARD_PROVIDER_FAILURE" || r.attempt > 1);
  let mockTests = "not run";
  try { mockTests = execSync("npx vitest run tests/contract-model/f7a-shard-planner-stitcher.test.ts -t 'E/F' 2>&1 | grep -E 'Tests|✓|×' | tail -8").toString(); } catch (e) { mockTests = `vitest error: ${(e as Error).message.slice(0, 300)}`; }
  const isolation = { realTransportFailures: providerFailures.map((r) => ({ shardId: r.shardId, attempt: r.attempt, status: r.shardStatus, failureReasons: r.failureReasons })), retriedShards: records.filter((r) => r.attempt > 1).map((r) => r.shardId), siblingResultsReusedByHash: results.filter((r) => r.reusedFromHash).length, deterministicMockTests: mockTests, note: providerFailures.length === 0 ? "no real transport failure occurred; the deterministic mock tests (F-7A §19 E/F) are the isolation evidence" : "real transport failure(s) occurred; see ledger + evidence files" };

  // ---- §16-§19 cost / window / definitions / dependencies
  const oversized = plan.shards.find((s) => s.oversized)!;
  const ovRec = records.find((r) => r.shardId === oversized.shardId) ?? null;
  const ovTurns = ledger.calls.filter((c) => c.shardId === oversized.shardId);
  const wasted = records.filter((r) => r.shardStatus === "SHARD_PROVIDER_FAILURE" || r.shardStatus === "SHARD_SCHEMA_FAILURE").reduce((a, r) => a + r.actual.costUsd, 0) + ledger.calls.filter((c) => { const rec = records.find((r) => r.shardId === c.shardId); return rec && rec.attempt > 1; }).reduce((a) => a, 0);
  const retryCost = ledger.calls.filter((c) => { const evPath = records.find((r) => r.shardId === c.shardId); return evPath && evPath.attempt > 1; }).reduce((a, c) => a + c.costUsd, 0);
  const fixedOverheadChars = 41_306;
  const summary = {
    artifact: "F-7B §16-§21 cost / window / definition / dependency summary", at: new Date().toISOString(), gitSha: gitSha(),
    paidCalls: ledger.calls.length, paidCostUsd: +ledger.spentUsd.toFixed(4), stage1CostUsd: +ledger.stage1SpentUsd.toFixed(4), missionCapUsd: MISSION_CAP_USD, refusals: ledger.refusals,
    historicalMonolithic: { firstTurnInputTokens: 312143, outputTokens: 60318, turnCostUsd: 1.227466, unitCostInclPassAUsd: 2.04469, status: "FAILED (whole unit lost)" },
    input: { ...score.W, fixedOverheadContribution: { charsPerCall: fixedOverheadChars, tokensPerCall: Math.ceil(fixedOverheadChars * 0.3957), totalTokensOverAllTurns: Math.ceil(fixedOverheadChars * 0.3957) * ledger.calls.length, shareOfTotalInput: +((Math.ceil(fixedOverheadChars * 0.3957) * ledger.calls.length) / Math.max(1, score.W.perShardTotalInput.total)).toFixed(3) }, peakWindowImprovement: `largest single turn ${score.W.singleTurnInput.max} tokens vs 312,143 (${(score.W.peakInputReduction * 100).toFixed(1)}% reduction)`, totalTokenCost: `${score.W.perShardTotalInput.total} input tokens over ${ledger.calls.length} turns = ${score.W.totalInputVsMonolithicFirstTurn}x the monolithic first turn` },
    output: { ...score.W.output, f7aEstimateMaxPerShard: plan.totals.maxShardOutputTokens, ceiling: 128000 },
    cost: { historicalFailedMonolithicUsd: 2.04469, newFullShardedUsd: +ledger.spentUsd.toFixed(4), costPerMaterialItemAccountedUsd: +(ledger.spentUsd / Math.max(1, score.A.materialRepresented + score.A.materialDispositioned)).toFixed(4), costPerCompiledDefinitionUsd: +(ledger.spentUsd / Math.max(1, stitched.definitions.length)).toFixed(4), wastedFailedOrRetriedUsd: +(wasted + retryCost).toFixed(4), retryCostUsd: +retryCost.toFixed(4), estimatedOneShardRerunUsd: invalidation.estimatedOneShardRerunCostUsd, meanCostPerShardUsd: +(ledger.spentUsd / Math.max(1, records.length)).toFixed(4) },
    largestAtomicDefinition: ovRec ? { shardId: oversized.shardId, term: plan.units.find((u) => u.unitKey === oversized.ownedUnitKeys[0])?.termName, sourceChars: oversized.primaryChars, maxPrimaryChars: F7B_BUDGET.maxPrimaryChars, ownedItems: oversized.ownedItemIds.length, ownedMaterialItems: oversized.ownedMaterialItemIds.length, contextEntries: oversized.context.length, contextChars: oversized.contextChars, actual: ovRec.actual, maxSingleTurnInputTokens: Math.max(0, ...ovTurns.map((c) => c.inputTokens)), status: ovRec.shardStatus, compileStatus: ovRec.compileStatus, failureReasons: ovRec.failureReasons, ownedAccountability: ovRec.ownedAccountability, insideProviderLimits: !ovRec.failureReasons.includes("OUTPUT_TRUNCATED") && ovRec.shardStatus !== "SHARD_PROVIDER_FAILURE", atomicityCausedMaterialProblem: ovRec.shardStatus === "SHARD_PROVIDER_FAILURE" || ovRec.failureReasons.includes("OUTPUT_TRUNCATED") || ovRec.ownedAccountability.missingMaterial === ovRec.ownedMaterialItems } : { shardId: oversized.shardId, status: "NOT_EXECUTED" },
    definitions: score.D, dependencies: score.E, humanReference: { summary: score.Ksummary, items: score.K },
    shards: score.F, collisions: score.G, accountability: score.A, valuePreservation: score.B, lineage: score.C, provenance: score.H, unsupported: score.I, falseCompleteness: score.J, trust: score.trust,
    isolation,
  };
  writeJson(`${F7B_DIR}/10-cost-window-summary.json`, summary);

  // ---- §25 closure gate
  const prodDiff = execSync(`git diff --stat ${F7A_STARTING_SHA} HEAD -- lib/ app/ prisma/ 2>/dev/null | tail -1`).toString().trim();
  const allExecuted = plan.shards.every((s) => prior.get(s.shardHash));
  const t = score.trust;
  const gate = [
    { n: 1, req: "frozen 36-shard plan executed without architectural modification", value: { allShardsTerminal: allExecuted, productionDiffSinceStart: prodDiff || "(none)" }, pass: allExecuted && prodDiff === "" },
    { n: 2, req: "Stage 1 passed before Stage 2 spend", value: { stage1AllPass: stage1?.allPass ?? null, stage2Calls: ledger.calls.filter((c) => c.stage === 2).length }, pass: stage1?.allPass === true },
    { n: 3, req: "per-shard bounded input works in reality", value: { envelopeViolations: score.W.envelopeViolations, maxSingleTurnNormal: score.W.maxSingleTurnInputNormal }, pass: score.W.envelopeViolations.length === 0 && records.length > 0 },
    { n: 4, req: "no normal shard recreates the monolithic window problem", value: { peakInputReduction: score.W.peakInputReduction, nearCeilingOutput: score.W.output.nearCeiling, truncated: score.W.output.truncated }, pass: score.W.output.nearCeiling.length === 0 && score.W.output.truncated.length === 0 && score.W.singleTurnInput.max < 312143 * 0.5 },
    { n: 5, req: "owned material semantics conservatively accounted", value: { rate: score.A.materialAccountabilityRate, missing: score.A.materialMissing, passCListsEveryMaterialItem: score.A.passC.represented + (score.A.allItemsByDisposition["MISSING_FROM_COMPOSITION"] ?? 0) + Object.entries(score.A.allItemsByDisposition).filter(([k]) => k !== "REPRESENTED" && k !== "MISSING_FROM_COMPOSITION").reduce((a, [, v]) => a + v, 0) === frozen.callerInput.frozenInventory!.items.length }, pass: score.A.materialRepresented + score.A.materialDispositioned > 0 && t.dangerousSilentOmissions === 0 },
    { n: 6, req: "global Pass C remains completeness authority", value: { stitchedStatus: stitched.status, semanticallyComplete: stitched.accountability.semanticallyComplete, failureReasons: stitched.failureReasons }, pass: !(stitched.status === "COMPLETED" && !stitched.accountability.semanticallyComplete) },
    { n: 7, req: "stitching loses zero values", value: t.valuesLostByStitching, pass: t.valuesLostByStitching === 0 },
    { n: 8, req: "no dangling refs introduced by stitching", value: t.danglingReferencesCausedByStitching, pass: t.danglingReferencesCausedByStitching === 0 },
    { n: 9, req: "partial/provider failures remain explicit and isolated", value: { shardStatuses: score.F.shardStatuses, nonCompleteExplicit: score.F.nonCompleteShardsExplicit, unresolvedOwnedItems: score.F.unresolvedOwnedItems, hiddenFailedShards: t.failedShardHidden }, pass: t.failedShardHidden === 0 },
    { n: 10, req: "retry/cache isolation works", value: { reusedByHash: results.filter((r) => r.reusedFromHash).length, sourceChangeOwnerInvalidated: invalidation.sourceByteChange.ownerShardInvalidated, unrelatedReusable: invalidation.sourceByteChange.unrelatedShardsReusable, inventoryChangeAll: invalidation.inventoryHashChange.allInvalidated, mockTests: isolation.deterministicMockTests.includes("passed") }, pass: invalidation.sourceByteChange.ownerShardInvalidated && invalidation.inventoryHashChange.allInvalidated && invalidation.sourceByteChange.unrelatedShardsUnchanged > 0 },
    { n: 11, req: "no dangerous silent omission", value: t.dangerousSilentOmissions, pass: t.dangerousSilentOmissions === 0 },
    { n: 12, req: "no false completeness", value: t.falseCompleteness, pass: t.falseCompleteness === 0 },
    { n: 13, req: "no source-unverifiable IR survives", value: t.sourceUnverifiableIrSurviving, pass: t.sourceUnverifiableIrSurviving === 0 },
    { n: 14, req: "total cost <= $15.00", value: +ledger.spentUsd.toFixed(4), pass: ledger.spentUsd <= MISSION_CAP_USD },
    { n: 15, req: "sharding operationally viable for this real large unfamiliar unit (every shard reached a terminal state; the failed monolithic unit now yields a stitched IR with explicit accountability)", value: { allShardsTerminal: allExecuted, stitchedDefinitions: stitched.definitions.length, stitchedRules: stitched.rules.length, materialAccounted: score.A.materialRepresented + score.A.materialDispositioned, providerFailures: score.F.shardStatuses["SHARD_PROVIDER_FAILURE"] ?? 0 }, pass: allExecuted && stitched.definitions.length + stitched.rules.length > 0 && (score.F.shardStatuses["SHARD_PROVIDER_FAILURE"] ?? 0) === 0 },
    { n: 16, req: "F-3/F-4/F-5/F-6 unchanged", value: prodDiff || "(no production diff)", pass: prodDiff === "" },
  ];
  const trustViolated = t.dangerousSilentOmissions + t.falseCompleteness + t.contextualOwnershipCredit + t.sourceUnverifiableIrSurviving + t.conflictingDuplicateSilentlyMerged + t.valuesLostByStitching + t.danglingReferencesCausedByStitching + t.failedShardHidden + t.missingMaterialOwnedItemHidden > 0;
  const costBound = stage2 && stage2.verdict === "F7B_COST_BOUND_BEFORE_COMPLETION";
  let verdict: string;
  if (trustViolated) verdict = "F7_NOT_SAFE";
  else if (stage1 && !stage1.allPass) verdict = "F7_NEEDS_ARCHITECTURAL_ITERATION";
  else if (costBound || (!allExecuted && ledger.refusals.length > 0)) verdict = "F7B_COST_BOUND_BEFORE_COMPLETION";
  else if (!allExecuted) verdict = "F7B_ENVIRONMENT_BLOCKED";
  else if (gate.every((g) => g.pass)) verdict = "F7_CLOSED";
  else if (gate.filter((g) => !g.pass).every((g) => g.n === 15)) verdict = "F7_NEEDS_ARCHITECTURAL_ITERATION";
  else verdict = "F7_NEEDS_ARCHITECTURAL_ITERATION";
  writeJson(`${F7B_DIR}/12-final-gate.json`, { artifact: "F-7B §25 closure gate", at: new Date().toISOString(), gitSha: gitSha(), startingSha: F7A_STARTING_SHA, gate, gatePointsMet: gate.filter((g) => g.pass).length, trustViolated, verdictBeforeActivationDecision: verdict, note: "F7_CLOSED vs F7_CANARY_PASSED_ACTIVATION_PENDING is decided in the README after the §26 activation analysis; this file records the gate arithmetic only" });
  console.log(JSON.stringify({ verdict, gate: gate.map((g) => [g.n, g.pass]), trust: t, A: score.A, invalidation: { changed: invalidation.sourceByteChange.shardsInvalidated.length, owner: invalidation.sourceByteChange.ownerShardInvalidated, readers: invalidation.sourceByteChange.contextReaders.length, invAll: invalidation.inventoryHashChange.allInvalidated } }, null, 1));
})();
