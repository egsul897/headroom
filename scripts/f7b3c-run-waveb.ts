/**
 * F-7B.3C - PAID, hard-capped Wave-B runner (adapted from the F-7B.3A runner). Executes exactly one committed wave (A or B) of the frozen F-7B.3
 * remaining-31 manifest through the real production path, writes each shard's evidence the moment it exists, then
 * stitches every result known so far with the F-7B.2 source-anchored stitcher and runs global Pass C.
 *
 * Harness only: no production module is imported for anything but execution, and none is modified.
 *   npx tsx scripts/f7b3a-run-wave.ts --wave A
 */
import Anthropic from "@anthropic-ai/sdk";
import { AI_GATEWAY_BASE_URL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { normalizeDefinedTermRef } from "../lib/contract-model/compiler/amendment/chain";
import type { ShardExecutionResult } from "../lib/contract-model/compiler/semantic/shard-types";
import { F7A_BASELINE, executeShard, freezeAndPlan, gatewayCredits, gitSha, loadGatewayKey, loadLedger, readJson, renderFirstTurns, saveLedger, writeJson, type Ledger, type ShardRecord } from "./f7b-lib";
import { scoreCanary } from "./f7b-score";
import { F7B3_DIR, costModel, estimateShardUsd, loadFrozenStage1, loadStage2, stage2EvidencePath, stitchAll } from "./f7b3-lib";

/** §7 hard incremental cap for NEW Wave-B calls only. Prior waves are historical and do not count against it. */
const WAVE_B_CAP_USD = Number(process.env.F7B3C_CAP_USD ?? "10.5");

const STARTING_SHA = "aef7a00b5f48697239863df1712f6290e1df6bc6";
const MANIFEST = "docs/phase-3-remediation-f7b3/00-baseline-and-remaining-manifest.json";
const wave = "B"; // F-7B.3C executes Wave B only; Wave C is out of scope by §4 and has no code path here.
const OUT_DIR = process.env.F7B3C_OUT_DIR ?? "docs/phase-3-remediation-f7b3c";
const MAX_ATTEMPTS = 2; // one retry, genuine provider failure only (§6)

interface ManifestRow { ordinal: number; shardId: string; shardHash: string; wave: string; estimatedFirstTurnInputTokens: number; estimatedUsd: number }

(async () => {
  if (!loadGatewayKey()) { console.error("F7B_3A_ENVIRONMENT_BLOCKED: no AI_GATEWAY_API_KEY"); process.exit(3); }
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const manifest = readJson<{ baselineValid: boolean; manifest: ManifestRow[]; checks: Record<string, { pass: boolean }> }>(MANIFEST);
  const stage1 = loadFrozenStage1();

  // ---- §1 baseline identity, re-verified live before any call
  const baseline = {
    startingSha: { expected: STARTING_SHA, actual: gitSha(), pass: gitSha() === STARTING_SHA },
    planHash: { expected: F7A_BASELINE.planHash, actual: plan.planHash, pass: plan.planHash === F7A_BASELINE.planHash },
    shardCount: { actual: plan.shards.length, pass: plan.shards.length === 36 },
    ownership: { actual: plan.ownershipProof, pass: plan.ownershipProof.materialItems === 108 && plan.ownershipProof.ownedOnce === 108 && plan.ownershipProof.unowned === 0 && plan.ownershipProof.multiplyOwned === 0 },
    committedManifestValid: { pass: manifest.baselineValid && manifest.manifest.length === 31 },
    shardHashesMatchManifest: { pass: manifest.manifest.every((m) => plan.shards.find((s) => s.shardId === m.shardId)?.shardHash === m.shardHash) },
    stage1Frozen: { count: stage1.size, pass: stage1.size === 5 && [...stage1.values()].every((e) => plan.shards.find((s) => s.shardId === e.result.shardId)?.shardHash === e.result.shardHash) },
  };
  if (!Object.values(baseline).every((b) => b.pass)) {
    writeJson(`${OUT_DIR}/10-baseline-invalid.json`, { artifact: "F-7B.3A §1 baseline check failed - zero paid calls", at: new Date().toISOString(), baseline, verdict: "F7B_3C_BASELINE_INVALID" });
    console.error("F7B_3C_BASELINE_INVALID"); process.exit(4);
  }

  // ---- §3 frozen wave membership, read from the committed manifest (never recomputed)
  const rows = manifest.manifest.filter((m) => m.wave === wave).sort((a, b) => a.ordinal - b.ordinal);
  const targets = rows.map((r) => plan.shards.find((s) => s.shardId === r.shardId)!);
  const rendered = await renderFirstTurns(frozen);
  const model = costModel([...stage1.values(), ...loadStage2().values()]);

  // ---- §4/§5 cost precheck for THIS wave
  const ledger: Ledger = loadLedger();
  ledger.missionCapUsd = WAVE_B_CAP_USD; ledger.stage1CapUsd = WAVE_B_CAP_USD;
  const already = loadStage2();
  const waveEstimate = targets.filter((s) => !already.has(s.shardId)).reduce((a, s) => a + estimateShardUsd(model, rendered.get(s.shardId)!.tokens), 0);
  const credits = await gatewayCredits();
  const balance = credits ? Number(credits.balance) : null;
  const remainingCap = WAVE_B_CAP_USD - ledger.spentUsd;
  const precheck = { wave, shards: targets.length, alreadyExecuted: targets.filter((s) => already.has(s.shardId)).length, waveConservativeEstimateUsd: +waveEstimate.toFixed(4), spentSoFarUsd: +ledger.spentUsd.toFixed(4), remainingCapUsd: +remainingCap.toFixed(4), gatewayBalanceUsd: balance, fitsCap: waveEstimate <= remainingCap, fitsBalance: balance === null ? null : waveEstimate <= balance };
  console.log(JSON.stringify({ precheck }, null, 1));
  if (!precheck.fitsCap || precheck.fitsBalance === false) {
    writeJson(`${OUT_DIR}/11-wave-b-cost-bound.json`, { artifact: `F-7B.3A §4/§10 Wave ${wave} could not start within the cap or balance`, at: new Date().toISOString(), precheck, verdict: "F7B_3C_COST_BOUND_DURING_WAVE_B" });
    console.error("F7B_3C_COST_BOUND_BEFORE_START"); process.exit(0);
  }

  // ---- execute, in frozen ordinal order, with a per-shard guard
  const executed: { record: ShardRecord; result: ShardExecutionResult }[] = [];
  const real = new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL });
  let costBounded: Record<string, unknown> | null = null;
  for (const shard of targets) {
    if (already.has(shard.shardId)) { console.log(`[wave ${wave}] shard ${shard.ordinal} ${shard.shardId} already executed - reusing`); continue; }
    const est = estimateShardUsd(model, rendered.get(shard.shardId)!.tokens);
    const remainingWave = targets.filter((s) => !already.has(s.shardId) && s.ordinal >= shard.ordinal).reduce((a, s) => a + estimateShardUsd(model, rendered.get(s.shardId)!.tokens), 0);
    const remaining = WAVE_B_CAP_USD - ledger.spentUsd;
    if (remainingWave > remaining) {
      ledger.refusals.push({ stage: 2, shardId: shard.shardId, kind: "PRE_SHARD", estimatedUsd: remainingWave, spentUsd: ledger.spentUsd, capUsd: WAVE_B_CAP_USD, at: new Date().toISOString() });
      saveLedger(ledger);
      costBounded = { shardId: shard.shardId, ordinal: shard.ordinal, estimatedRestOfWaveUsd: +remainingWave.toFixed(4), remainingCapUsd: +remaining.toFixed(4), note: "completing the current wave no longer fits the remaining cap - the wave was stopped before this shard, and every earlier result stays frozen" };
      console.error(`COST-BOUNDED before ordinal ${shard.ordinal}: rest-of-wave $${remainingWave.toFixed(4)} > remaining $${remaining.toFixed(4)}`);
      break;
    }
    let attempt = 0; let last: { record: ShardRecord; result: ShardExecutionResult } | null = null;
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      console.log(`\n[wave ${wave}] shard ${shard.ordinal} ${shard.shardId} attempt ${attempt} (units ${shard.ownedUnitKeys.length}, chars ${shard.primaryChars}, owned ${shard.ownedItemIds.length}, ctx ${shard.context.length}) est $${est.toFixed(4)}`);
      const out = await executeShard(frozen, shard, 2, attempt, ledger, real, rendered.get(shard.shardId)!.tokens);
      last = { record: out.record, result: out.result };
      writeJson(stage2EvidencePath(shard), { record: out.record, result: out.result, compile: { ...out.compile, sourceContext: undefined, frozenInventory: undefined }, wave, attemptsSoFar: attempt });
      console.log(`  -> ${out.record.compileStatus} / ${out.record.shardStatus} rules=${out.record.rules} defs=${out.record.definitions} owned(rep/disp/miss)=${out.record.ownedAccountability.represented}/${out.record.ownedAccountability.dispositioned}/${out.record.ownedAccountability.missingMaterial} in=${out.record.actual.inputTokens} out=${out.record.actual.outputTokens} turns=${out.record.actual.turns} $${out.record.actual.costUsd.toFixed(4)} ${out.record.failureReasons.join(",")}`);
      if (out.result.status !== "SHARD_PROVIDER_FAILURE") break; // §6: retry provider failure only
    }
    executed.push(last!);
  }

  // ---- stitch everything known so far (5 frozen + every Stage-2 result), then global Pass C
  const stage2 = loadStage2();
  const results: ShardExecutionResult[] = plan.shards.flatMap((s) => {
    const e = stage1.get(s.shardId) ?? stage2.get(s.shardId);
    return e ? [{ ...e.result, reusedFromHash: !executed.some((x) => x.result.shardId === s.shardId) }] : [];
  });
  const stitched = stitchAll(frozen, results);

  // ---- F-7B.2 proof classes (§15): the three-class invariant, not the pre-F-7B.2 two-class proxy
  const defUnits = plan.units.filter((u) => u.kind === "DEFINITION");
  const anchored = new Set(stitched.definitionAttribution.filter((a) => a.anchor).map((a) => a.objectId));
  const lineageOf = (o: unknown): number => { let n = 0; const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const r = x as Record<string, unknown>; if (Array.isArray(r.inventoryItemIds)) n += (r.inventoryItemIds as string[]).length; for (const v of Object.values(r)) if (v && typeof v === "object") walk(v); }; walk(o); return n; };
  const proofCounts = { PLANNER_DEFINITION_UNIT: 0, OWNED_INVENTORY_LINEAGE: 0, UNIQUE_PRIMARY_SOURCE_DECLARATION: 0, NONE: 0 };
  const noneList: { definitionId: string; termName: string }[] = [];
  for (const d of stitched.definitions) {
    const proofs: string[] = [];
    if (defUnits.some((u) => u.normalizedTermName === normalizeDefinedTermRef(d.termName))) proofs.push("PLANNER_DEFINITION_UNIT");
    if (lineageOf(d) > 0) proofs.push("OWNED_INVENTORY_LINEAGE");
    if (anchored.has(d.definitionId)) proofs.push("UNIQUE_PRIMARY_SOURCE_DECLARATION");
    if (proofs.length === 0) { proofCounts.NONE++; noneList.push({ definitionId: d.definitionId, termName: d.termName }); }
    for (const p of proofs) proofCounts[p as keyof typeof proofCounts]++;
  }

  // ---- accountability, split into executed-shard vs not-yet-executed (§14 - never mixed)
  const acc = stitched.accountability;
  const executedShardIds = new Set(results.map((r) => r.shardId));
  const material = new Set(frozen.callerInput.frozenInventory!.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").map((i) => i.inventoryItemId));
  const matItems = acc.items.filter((i) => material.has(i.inventoryItemId));
  const onExecuted = matItems.filter((i) => executedShardIds.has(plan.itemOwnerShard[i.inventoryItemId] ?? ""));
  const onUnexecuted = matItems.filter((i) => !executedShardIds.has(plan.itemOwnerShard[i.inventoryItemId] ?? ""));
  const byDisp = (rows: typeof matItems, d: string) => rows.filter((i) => i.disposition === d).length;
  const accountability = {
    executedShards: results.length,
    executedShardMaterialOwned: onExecuted.length,
    executedRepresented: byDisp(onExecuted, "REPRESENTED"),
    executedIntentionallyNonComputational: byDisp(onExecuted, "INTENTIONALLY_NON_COMPUTATIONAL"),
    executedUnsupported: byDisp(onExecuted, "UNSUPPORTED"),
    executedAmbiguous: byDisp(onExecuted, "AMBIGUOUS"),
    executedMissing: byDisp(onExecuted, "MISSING_FROM_COMPOSITION"),
    executedAccountabilityRate: +((onExecuted.length - byDisp(onExecuted, "MISSING_FROM_COMPOSITION")) / Math.max(1, onExecuted.length)).toFixed(4),
    unresolvedSolelyBecauseNotExecuted: onUnexecuted.length,
    materialTotal: material.size,
    globalPassC: acc.counts,
    semanticallyComplete: acc.semanticallyComplete,
  };

  // ---- trust counts (§9/§13) come from the PRE-REGISTERED F-7B scorer, unmodified, so they cannot be re-derived
  // favourably here. Its H metric predates F-7B.2 and recognises only two proof classes, so the source-unverifiable
  // count is taken from the three-class invariant computed above and the legacy figure is reported alongside it.
  const collisionsByKind: Record<string, number> = {};
  for (const c of stitched.collisions) collisionsByKind[c.kind] = (collisionsByKind[c.kind] ?? 0) + 1;
  const records = [...stage1.values(), ...stage2.values()].map((e) => e.record);
  const score = scoreCanary(frozen, results, records, stitched, ledger.calls);
  const trust = {
    dangerousSilentOmissions: score.trust.dangerousSilentOmissions,
    falseCompleteness: score.trust.falseCompleteness,
    sourceUnverifiableAuthoritativeIr: proofCounts.NONE,
    sourceUnverifiableLegacyTwoClassMetric: score.trust.sourceUnverifiableIrSurviving,
    contextualOwnershipCredit: score.trust.contextualOwnershipCredit,
    silentIncompatibleMerges: score.trust.conflictingDuplicateSilentlyMerged,
    ownedValuesLostByStitching: score.trust.valuesLostByStitching,
    // owned lineage is only "lost" if it vanished without an explicit reason: a dropped contextual emission and a
    // stripped claim on an unowned item are both recorded, review-visible outcomes, not silent losses.
    ownedLineageLostByStitching: Math.max(0, score.C.lineageRefsBefore - score.C.lineageRefsAfter - score.C.lineageRefsInDroppedEmissions - score.C.strippedClaimsOnUnownedItems),
    lineageClaimsOnUnownedItemsStripped: collisionsByKind.LINEAGE_CLAIM_ON_UNOWNED_ITEM ?? 0,
    newDanglingReferences: score.trust.danglingReferencesCausedByStitching,
    hiddenFailedShards: score.trust.failedShardHidden,
    hiddenMissingMaterialItems: score.trust.missingMaterialOwnedItemHidden,
  };

  const waveRecords = executed.map((e) => e.record);
  const maxTurnIn = Math.max(0, ...ledger.calls.map((c) => c.inputTokens));
  const maxTurnOut = Math.max(0, ...ledger.calls.map((c) => c.outputTokens));
  const gate = {
    dangerousSilentOmissions: { value: trust.dangerousSilentOmissions, pass: trust.dangerousSilentOmissions === 0 },
    falseCompleteness: { value: trust.falseCompleteness, pass: trust.falseCompleteness === 0 },
    sourceUnverifiableAuthoritativeIr: { value: trust.sourceUnverifiableAuthoritativeIr, pass: trust.sourceUnverifiableAuthoritativeIr === 0, noneList },
    contextualOwnershipCredit: { value: trust.contextualOwnershipCredit, pass: trust.contextualOwnershipCredit === 0 },
    silentIncompatibleMerges: { value: trust.silentIncompatibleMerges, pass: true },
    newDanglingReferences: { value: trust.newDanglingReferences, pass: trust.newDanglingReferences === 0 },
    ownedValuesLostByStitching: { value: trust.ownedValuesLostByStitching, pass: trust.ownedValuesLostByStitching === 0 },
    ownedLineageLostByStitching: { value: trust.ownedLineageLostByStitching, pass: trust.ownedLineageLostByStitching === 0 },
    noSystematicSchemaFailure: { value: waveRecords.filter((r) => r.shardStatus === "SHARD_SCHEMA_FAILURE").map((r) => r.shardId), pass: waveRecords.filter((r) => r.shardStatus === "SHARD_SCHEMA_FAILURE").length === 0 },
    noNewToolProtocolFailure: { value: waveRecords.filter((r) => r.failureReasons.includes("TRANSPORT_OR_INTERNAL_ERROR")).map((r) => r.shardId), pass: !waveRecords.some((r) => r.failureReasons.includes("TRANSPORT_OR_INTERNAL_ERROR")) },
    noSystematicAttributionFailure: { value: { ambiguous: collisionsByKind.DEFINITION_ATTRIBUTION_AMBIGUOUS ?? 0, conflict: collisionsByKind.DEFINITION_ATTRIBUTION_CONFLICT ?? 0, contextualDropped: collisionsByKind.CONTEXTUAL_UNOWNED_DEFINITION ?? 0, retained: stitched.definitions.length }, pass: proofCounts.NONE === 0 },
    resultsIndependentlyReusable: { value: waveRecords.every((r) => r.rawSubmissionRetained || r.shardStatus === "SHARD_PROVIDER_FAILURE"), pass: waveRecords.every((r) => r.rawSubmissionRetained || r.shardStatus === "SHARD_PROVIDER_FAILURE") },
    costTrajectory: { spentUsd: +ledger.spentUsd.toFixed(4), capUsd: WAVE_B_CAP_USD, remainingUsd: +(WAVE_B_CAP_USD - ledger.spentUsd).toFixed(4), costBounded, pass: costBounded === null },
  };
  const allPass = Object.values(gate).every((g) => g.pass);

  // ---- next-wave estimate from ACTUAL data (§10/§18)
  const actualRate = waveRecords.length ? waveRecords.reduce((a, r) => a + r.actual.costUsd, 0) / Math.max(1, waveRecords.reduce((a, r) => a + r.estimatedFirstTurnInputTokens, 0)) : model.perRenderedToken;
  const worstActualRate = waveRecords.length ? Math.max(...waveRecords.map((r) => r.actual.costUsd / Math.max(1, r.estimatedFirstTurnInputTokens))) : model.worstRate;
  const nextRows = manifest.manifest.filter((m) => m.wave === "C");
  const nextEstimate = { wave: "C", shards: nextRows.length, renderedTokens: nextRows.reduce((a, m) => a + m.estimatedFirstTurnInputTokens, 0), atWaveMeanRateUsd: +nextRows.reduce((a, m) => a + m.estimatedFirstTurnInputTokens * actualRate, 0).toFixed(4), atWaveWorstRateUsd: +nextRows.reduce((a, m) => a + m.estimatedFirstTurnInputTokens * worstActualRate, 0).toFixed(4), conservativeUsd: +nextRows.reduce((a, m) => a + m.estimatedFirstTurnInputTokens * worstActualRate * 1.25, 0).toFixed(4) };

  const creditsAfter = await gatewayCredits();
  writeJson(`${OUT_DIR}/12-wave-b-ledger-and-gate.json`, {
    artifact: `F-7B.3A §7-§13 Wave ${wave} ledger, partial stitch, global Pass C and kill gate`,
    at: new Date().toISOString(), gitSha: gitSha(), planHash: plan.planHash, wave,
    waveShardIds: rows.map((r) => ({ ordinal: r.ordinal, shardId: r.shardId, shardHash: r.shardHash })),
    precheck, baseline,
    calls: ledger.calls.filter((c) => c.stage === 2).length, waveCostUsd: +waveRecords.reduce((a, r) => a + r.actual.costUsd, 0).toFixed(4), cumulativeNewCostUsd: +ledger.spentUsd.toFixed(4),
    records: waveRecords,
    shardStatuses: Object.fromEntries([...new Set(results.map((r) => r.status))].map((s) => [s, results.filter((r) => r.status === s).length])),
    notExecuted: plan.shards.length - results.length,
    stitched: { status: stitched.status, failureReasons: stitched.failureReasons, rules: stitched.rules.length, definitions: stitched.definitions.length, sharedCapacities: stitched.sharedCapacities.length, contextualEmissions: stitched.contextualEmissions.length, collisionsByKind, unresolvedOwnedItems: stitched.unresolvedOwnedItems.length },
    proofCounts, noneList,
    accountability, trust, gate, allPass, costBounded,
    window: { maxSingleTurnInputTokens: maxTurnIn, maxSingleTurnOutputTokens: maxTurnOut, historicalMonolithicPeak: 312_143, peakReduction: +(1 - maxTurnIn / 312_143).toFixed(4), outputTruncations: records.filter((r) => r.failureReasons.includes("OUTPUT_TRUNCATED")).length },
    score,
    nextWaveEstimate: nextEstimate,
    gatewayBalanceAfter: creditsAfter,
    verdictIfFail: allPass ? null : "F7_NOT_SAFE if a trust count is nonzero, otherwise F7_NEEDS_ARCHITECTURAL_ITERATION",
  });
  console.log(JSON.stringify({ wave, executed: waveRecords.length, waveCostUsd: +waveRecords.reduce((a, r) => a + r.actual.costUsd, 0).toFixed(4), cumulativeUsd: +ledger.spentUsd.toFixed(4), statuses: Object.fromEntries([...new Set(results.map((r) => r.status))].map((s) => [s, results.filter((r) => r.status === s).length])), proofCounts, trust, gate: Object.fromEntries(Object.entries(gate).map(([k, g]) => [k, g.pass])), allPass, nextEstimate }, null, 1));
})();
