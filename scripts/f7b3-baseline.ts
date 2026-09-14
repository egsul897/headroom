/**
 * F-7B.3 §1/§2/§3/§7 - ZERO-COST baseline verification and cost precheck. Reproduces the frozen plan, verifies the five
 * paid Stage-1 results against it, enumerates the remaining 31 shards, renders every remaining first turn through the
 * real caller with a capturing client (no provider call), and decides whether the full 31 fit the $20 Stage-2 cap.
 */
import { calculateCostUsd } from "../lib/contract-model/analyzer/telemetry";
import { F7A_BASELINE, F7B_BUDGET, MODEL, PROVIDER, freezeAndPlan, gatewayCredits, gitSha, loadGatewayKey, renderFirstTurns, writeJson } from "./f7b-lib";
import { F7B3_DIR, STAGE1_EVIDENCE_DIR, STAGE2_CAP_USD, costModel, estimateShardUsd, loadFrozenStage1, remainingShards, waves } from "./f7b3-lib";

const STARTING_SHA = "1660817cef85ebe70888185b0248e56d1297616d";

(async () => {
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const stage1 = loadFrozenStage1();
  const remaining = remainingShards(plan, stage1);
  const w = waves(remaining);

  const checks = {
    startingSha: { expected: STARTING_SHA, actual: gitSha(), pass: gitSha() === STARTING_SHA },
    planHash: { expected: F7A_BASELINE.planHash, actual: plan.planHash, pass: plan.planHash === F7A_BASELINE.planHash },
    shardCount: { expected: 36, actual: plan.shards.length, pass: plan.shards.length === 36 },
    materialOwnership: { expected: { materialItems: 108, ownedOnce: 108, unowned: 0, multiplyOwned: 0 }, actual: plan.ownershipProof, pass: plan.ownershipProof.materialItems === 108 && plan.ownershipProof.ownedOnce === 108 && plan.ownershipProof.unowned === 0 && plan.ownershipProof.multiplyOwned === 0 },
    sourceContextState: { actual: frozen.identity.sourceContextIdentity, pass: (frozen.callerInput.sourceContext!.state as string) === "COMPLETE_LOCAL_SOURCE" },
    frozenInventory: { actual: frozen.identity.frozenInventory, pass: (frozen.identity.frozenInventory as { material: number }).material === 108 },
    budget: { expected: F7B_BUDGET, actual: F7B_BUDGET, pass: F7B_BUDGET.targetPrimaryChars === 12_000 && F7B_BUDGET.maxUnitsPerShard === 16 },
    modelProvider: { model: MODEL, provider: PROVIDER, pass: true },
    generation: { plannerAlgorithmVersion: frozen.identity.shardPlannerAlgorithmVersion, promptVersion: frozen.identity.compilerPromptVersion, algorithmVersion: frozen.identity.compilerAlgorithmVersion, toolPolicyVersion: frozen.identity.toolPolicyVersion, pass: true },
    stage1Frozen: { count: stage1.size, pass: stage1.size === 5 && [...stage1.values()].every((e) => { const s = plan.shards.find((x) => x.shardId === e.result.shardId); return Boolean(s) && s!.shardHash === e.result.shardHash; }) },
    remainingCount: { expected: 31, actual: remaining.length, pass: remaining.length === 31 },
  };
  const baselineValid = Object.values(checks).every((c) => c.pass);

  const rendered = await renderFirstTurns(frozen);
  const model = costModel([...stage1.values()]);
  const manifest = remaining.map((s) => {
    const r = rendered.get(s.shardId)!;
    return {
      ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, sourceChars: s.primaryChars,
      estimatedFirstTurnInputTokens: r.tokens, ownedUnits: s.ownedUnitKeys.length, ownedItems: s.ownedItemIds.length,
      ownedMaterialItems: s.ownedMaterialItemIds.length,
      quantitativeItems: s.ownedItemIds.filter((id) => (frozen.callerInput.frozenInventory!.items.find((i) => i.inventoryItemId === id)?.quantitativeValues.length ?? 0) > 0).length,
      contextEntries: s.context.length, contextChars: s.contextChars, unresolvedContext: s.unresolvedContext.length,
      oversized: s.oversized, estimatedOutputTokens: s.estimate.outputTokens,
      estimatedUsd: +estimateShardUsd(model, r.tokens).toFixed(4),
      wave: w.A.includes(s) ? "A" : w.B.includes(s) ? "B" : "C",
    };
  });
  const totalEstimate = manifest.reduce((a, m) => a + m.estimatedUsd, 0);
  const byWave = (k: string) => manifest.filter((m) => m.wave === k);
  const credits = loadGatewayKey() ? await gatewayCredits() : null;

  const verdict = !baselineValid ? "F7B_3_BASELINE_INVALID" : totalEstimate > STAGE2_CAP_USD ? "F7B_3_COST_BOUND_BEFORE_START" : "PROCEED";
  writeJson(`${F7B3_DIR}/00-baseline-and-remaining-manifest.json`, {
    artifact: "F-7B.3 §1/§2/§3/§7 - baseline verification, remaining-31 manifest and pre-run cost estimate (zero paid calls)",
    at: new Date().toISOString(), startingSha: STARTING_SHA, gitSha: gitSha(),
    checks, baselineValid,
    identity: frozen.identity,
    stage1: { evidenceDir: STAGE1_EVIDENCE_DIR, reused: true, rerun: 0, shards: [...stage1.values()].map((e) => ({ shardId: e.result.shardId, shardHash: e.result.shardHash, ordinal: e.record.ordinal, status: e.result.status, costUsd: +e.record.actual.costUsd.toFixed(4), renderedFirstTurnTokens: e.record.estimatedFirstTurnInputTokens, ownedMaterialItems: e.record.ownedMaterialItems, represented: e.record.ownedAccountability.represented, dispositioned: e.record.ownedAccountability.dispositioned, missing: e.record.ownedAccountability.missingMaterial })), totalCostUsd: +[...stage1.values()].reduce((a, e) => a + e.record.actual.costUsd, 0).toFixed(4) },
    costModel: { basis: "dollars per rendered first-turn token, from the five paid Stage-1 actuals; worst single observed shard rate, then a variance margin", meanRatePerRenderedToken: model.meanRate, worstRatePerRenderedToken: model.worstRate, safetyFactor: model.safety, appliedRatePerRenderedToken: model.perRenderedToken, perShardRatesObserved: [...stage1.values()].map((e) => ({ shardId: e.result.shardId, costUsd: +e.record.actual.costUsd.toFixed(4), renderedTokens: e.record.estimatedFirstTurnInputTokens, rate: +(e.record.actual.costUsd / e.record.estimatedFirstTurnInputTokens).toFixed(8) })) },
    capUsd: STAGE2_CAP_USD,
    conservativeEstimateUsd: +totalEstimate.toFixed(4),
    fitsCap: totalEstimate <= STAGE2_CAP_USD,
    waveEstimates: { A: +byWave("A").reduce((a, m) => a + m.estimatedUsd, 0).toFixed(4), B: +byWave("B").reduce((a, m) => a + m.estimatedUsd, 0).toFixed(4), C: +byWave("C").reduce((a, m) => a + m.estimatedUsd, 0).toFixed(4) },
    waveShardCounts: { A: w.A.length, B: w.B.length, C: w.C.length },
    gatewayBalanceBefore: credits,
    alternativeEstimates: { atMeanObservedRate: +manifest.reduce((a, m) => a + m.estimatedFirstTurnInputTokens * model.meanRate, 0).toFixed(4), atStage1MeanCostPerShard: +(remaining.length * ([...stage1.values()].reduce((a, e) => a + e.record.actual.costUsd, 0) / 5)).toFixed(4), preRegisteredF7BEstimatorUsd: +remaining.reduce((a, s) => a + (calculateCostUsd(Math.ceil(rendered.get(s.shardId)!.tokens * 3.29), s.estimate.outputTokens, MODEL) ?? 0), 0).toFixed(4) },
    verdict, manifest,
  });
  console.log(JSON.stringify({ baselineValid, planHash: plan.planHash, remaining: remaining.length, conservativeEstimateUsd: +totalEstimate.toFixed(4), capUsd: STAGE2_CAP_USD, waveEstimates: { A: +byWave("A").reduce((a, m) => a + m.estimatedUsd, 0).toFixed(4), B: +byWave("B").reduce((a, m) => a + m.estimatedUsd, 0).toFixed(4), C: +byWave("C").reduce((a, m) => a + m.estimatedUsd, 0).toFixed(4) }, alternatives: { mean: +manifest.reduce((a, m) => a + m.estimatedFirstTurnInputTokens * model.meanRate, 0).toFixed(4), meanPerShard: +(remaining.length * 0.54392).toFixed(4) }, gatewayBalance: credits?.balance ?? null, verdict }, null, 1));
})();
