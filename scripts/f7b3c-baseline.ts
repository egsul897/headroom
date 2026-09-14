/**
 * F-7B.3C §1/§2/§3/§7 - ZERO-COST baseline, frozen-15 verification, Wave-B manifest and cost precheck.
 * Makes no provider call. Its only job is to decide whether Wave B may start at all.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { F7A_BASELINE, F7B_BUDGET, MODEL, PROVIDER, freezeAndPlan, gatewayCredits, gitSha, loadGatewayKey, readJson, renderFirstTurns, writeJson } from "./f7b-lib";
import { loadFrozenStage1, loadStage2, stitchAll } from "./f7b3-lib";

const STARTING_SHA = "aef7a00b5f48697239863df1712f6290e1df6bc6";
const MANIFEST = "docs/phase-3-remediation-f7b3/00-baseline-and-remaining-manifest.json";
const F7B3C_DIR = "docs/phase-3-remediation-f7b3c";
const CAP_USD = 10.5;
const SAFETY = 1.25;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

interface ManifestRow { ordinal: number; shardId: string; shardHash: string; wave: string; estimatedFirstTurnInputTokens: number; sourceChars: number; ownedUnits: number; ownedItems: number; ownedMaterialItems: number; quantitativeItems: number; contextEntries: number; contextChars: number; unresolvedContext: number; oversized: boolean; estimatedOutputTokens: number }

(async () => {
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const manifest = readJson<{ baselineValid: boolean; manifest: ManifestRow[] }>(MANIFEST);
  const stage1 = loadFrozenStage1(); const stage2 = loadStage2();

  // ---- §1 baseline identity
  const checks = {
    startingSha: { expected: STARTING_SHA, actual: gitSha(), pass: gitSha() === STARTING_SHA },
    planHash: { expected: F7A_BASELINE.planHash, actual: plan.planHash, pass: plan.planHash === F7A_BASELINE.planHash },
    shardCount: { actual: plan.shards.length, pass: plan.shards.length === 36 },
    ownership: { actual: plan.ownershipProof, pass: plan.ownershipProof.materialItems === 108 && plan.ownershipProof.ownedOnce === 108 && plan.ownershipProof.unowned === 0 && plan.ownershipProof.multiplyOwned === 0 },
    frozenInventory: { actual: frozen.identity.frozenInventory, pass: (frozen.identity.frozenInventory as { material: number }).material === 108 },
    sourceContext: { actual: frozen.identity.sourceContextIdentity, pass: frozen.callerInput.sourceContext!.state === "COMPLETE_LOCAL_SOURCE" },
    budget: { actual: F7B_BUDGET, pass: F7B_BUDGET.targetPrimaryChars === 12_000 && F7B_BUDGET.maxUnitsPerShard === 16 },
    modelProvider: { model: MODEL, provider: PROVIDER, pass: true },
    generation: { planner: frozen.identity.shardPlannerAlgorithmVersion, prompt: frozen.identity.compilerPromptVersion, algorithm: frozen.identity.compilerAlgorithmVersion, toolPolicy: frozen.identity.toolPolicyVersion, pass: true },
    manifestShardHashesUnchanged: { pass: manifest.manifest.every((m) => plan.shards.find((s) => s.shardId === m.shardId)?.shardHash === m.shardHash) },
  };
  const baselineValid = Object.values(checks).every((c) => c.pass);

  // ---- §2 the fifteen frozen paid results
  const reused = [...stage1.values(), ...stage2.values()]
    .map((e) => ({ shardId: e.result.shardId, shardHash: e.result.shardHash, ordinal: e.record.ordinal, stage: e.record.stage, source: stage1.has(e.result.shardId) ? "STAGE_1" : "WAVE_A", status: e.result.status, definitions: e.result.composition?.definitions.length ?? 0, compositionHash: sha256(JSON.stringify(e.result.composition)), hashMatchesPlan: plan.shards.find((s) => s.shardId === e.result.shardId)?.shardHash === e.result.shardHash }))
    .sort((a, b) => a.ordinal - b.ordinal);
  const frozenOk = reused.length === 15 && reused.every((r) => r.hashMatchesPlan);
  // cross-check the composition hashes against the F-7B.3B certified evidence
  const b3b = readJson<{ frozenShards: { shardId: string; shardHash: string; compositionHash: string }[] }>("docs/phase-3-remediation-f7b3b/03-offline-restitch-after.json");
  const compositionHashesMatch = b3b.frozenShards.every((f) => reused.find((r) => r.shardId === f.shardId)?.compositionHash === f.compositionHash) && b3b.frozenShards.length === 15;
  // the current stitcher must still preserve conflict evidence exactly as certified
  const stitched = stitchAll(frozen, plan.shards.flatMap((s) => { const e = stage1.get(s.shardId) ?? stage2.get(s.shardId); return e ? [e.result] : []; }));
  const conflictEvidenceOk = Array.isArray(stitched.definitionConflicts) && stitched.definitionConflicts.length === 2 && stitched.definitionConflicts.every((c) => c.variants.length >= 2 && c.requiresReview);

  // ---- §3 Wave B membership, read from the ORIGINAL committed manifest
  const waveB = manifest.manifest.filter((m) => m.wave === "B").sort((a, b) => a.ordinal - b.ordinal);
  const crossCheck = manifest.manifest.filter((m) => !stage1.has(m.shardId)).sort((a, b) => a.ordinal - b.ordinal).slice(10, 20).map((m) => m.shardId);
  const membershipConsistent = waveB.length === 10 && JSON.stringify(waveB.map((m) => m.shardId)) === JSON.stringify(crossCheck);

  // ---- §7 cost precheck from Stage-1 AND Wave-A actuals
  const rendered = await renderFirstTurns(frozen);
  const paid = [...stage1.values(), ...stage2.values()].map((e) => ({ shardId: e.record.shardId, source: stage1.has(e.result.shardId) ? "STAGE_1" : "WAVE_A", costUsd: e.record.actual.costUsd, renderedTokens: e.record.estimatedFirstTurnInputTokens, rate: e.record.actual.costUsd / Math.max(1, e.record.estimatedFirstTurnInputTokens) }));
  const rates = paid.map((p) => p.rate).sort((a, b) => a - b);
  const meanRate = paid.reduce((a, p) => a + p.costUsd, 0) / paid.reduce((a, p) => a + p.renderedTokens, 0);
  const medianRate = rates[Math.floor(rates.length / 2)]!;
  const worstRate = rates[rates.length - 1]!;
  const waveBRendered = waveB.reduce((a, m) => a + (rendered.get(m.shardId)?.tokens ?? m.estimatedFirstTurnInputTokens), 0);
  const est = (rate: number) => +(waveBRendered * rate).toFixed(4);
  const conservative = +(waveBRendered * worstRate * SAFETY).toFixed(4);
  const credits = loadGatewayKey() ? await gatewayCredits() : null;
  const balance = credits ? Number(credits.balance) : null;
  const fitsCap = conservative <= CAP_USD;
  const fitsBalance = balance === null ? false : conservative <= balance;

  const verdict = !baselineValid ? "F7B_3C_BASELINE_INVALID" : !(frozenOk && compositionHashesMatch && conflictEvidenceOk && membershipConsistent) ? "F7B_3C_FROZEN_RESULT_MISMATCH" : !(fitsCap && fitsBalance) ? "F7B_3C_COST_BOUND_BEFORE_START" : "PROCEED";
  writeJson(`${F7B3C_DIR}/00-baseline-frozen15-and-waveb-manifest.json`, {
    artifact: "F-7B.3C §1/§2/§3/§7 - baseline, frozen-15 verification, Wave-B manifest and pre-run cost estimate (zero paid calls)",
    at: new Date().toISOString(), startingSha: STARTING_SHA, gitSha: gitSha(),
    checks, baselineValid, identity: frozen.identity,
    frozenFifteen: { count: reused.length, allHashesMatchPlan: frozenOk, compositionHashesMatchF7B3B: compositionHashesMatch, conflictEvidencePreservedByCurrentStitcher: conflictEvidenceOk, definitionConflicts: stitched.definitionConflicts.map((c) => ({ termName: c.termName, variants: c.variants.length, requiresReview: c.requiresReview })), shards: reused },
    waveB: { count: waveB.length, membershipConsistentWithPlanOrder: membershipConsistent, renderedFirstTurnTotal: waveBRendered, shards: waveB.map((m) => ({ ...m, renderedNow: rendered.get(m.shardId)?.tokens ?? null })) },
    costPrecheck: { basis: "dollars per rendered first-turn token from all 15 paid shards (5 Stage-1 + 10 Wave A)", paidSamples: paid.length, perShardRates: paid, meanRate, medianRate, worstRate, safetyFactor: SAFETY, meanRateEstimateUsd: est(meanRate), medianRateEstimateUsd: est(medianRate), worstRateEstimateUsd: est(worstRate), conservativeEstimateUsd: conservative, capUsd: CAP_USD, fitsCap, gatewayBalanceUsd: balance, fitsBalance },
    verdict,
  });
  console.log(JSON.stringify({ baselineValid, frozenOk, compositionHashesMatch, conflictEvidenceOk, membershipConsistent, waveBShards: waveB.length, waveBRendered, meanRateEstimateUsd: est(meanRate), medianRateEstimateUsd: est(medianRate), worstRateEstimateUsd: est(worstRate), conservativeEstimateUsd: conservative, capUsd: CAP_USD, balance, verdict }, null, 1));
})();
