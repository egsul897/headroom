/**
 * F-7B.3A §14-§18/§22 - assembles the mission's final reporting from the two committed wave artifacts and the durable
 * ledger. Deterministic and zero-cost: it reads evidence and writes JSON only, making no provider call.
 */
import { readFileSync } from "node:fs";
import { F7B3_DIR, loadFrozenStage1, loadStage2 } from "./f7b3-lib";
import { gatewayCredits, gitSha, loadGatewayKey, readJson, writeJson, type Ledger } from "./f7b-lib";

interface WaveArtifact { wave: string; waveShardIds: { ordinal: number; shardId: string; shardHash: string }[]; waveCostUsd: number; records: { shardId: string; shardStatus: string; actual: { turns: number; inputTokens: number; outputTokens: number; costUsd: number }; failureReasons: string[]; transportNormalization: { applied: boolean; decodedFields: string[] } | null; ownedMaterialItems: number; ownedAccountability: { represented: number; dispositioned: number; missingMaterial: number }; lineageClaimsOnUnownedItems: number }[]; proofCounts: Record<string, number>; accountability: Record<string, number | boolean | Record<string, number>>; trust: Record<string, number>; gate: Record<string, { pass: boolean }>; allPass: boolean; stitched: Record<string, unknown>; window: Record<string, number>; nextWaveEstimate: Record<string, unknown>; score: Record<string, unknown> }

(async () => {
  const a = readJson<WaveArtifact>(`${F7B3_DIR}/12-wave-a-ledger-and-gate.json`);
  let b: WaveArtifact | null = null;
  try { b = JSON.parse(readFileSync(`${F7B3_DIR}/16-wave-b-ledger-and-gate.json`, "utf-8")) as WaveArtifact; } catch { b = null; }
  const final = b ?? a;
  const ledger = readJson<Ledger>(`${F7B3_DIR}/06-per-shard-ledger.json`);
  const stage1 = loadFrozenStage1();
  const stage2 = loadStage2();
  const allCalls = ledger.calls;
  const perShardIn = new Map<string, number>(); const perShardOut = new Map<string, number>();
  for (const c of allCalls) { perShardIn.set(c.shardId, (perShardIn.get(c.shardId) ?? 0) + c.inputTokens); perShardOut.set(c.shardId, (perShardOut.get(c.shardId) ?? 0) + c.outputTokens); }
  const stage1Records = [...stage1.values()].map((e) => e.record);
  const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!; };
  const newIn = [...perShardIn.values()]; const newOut = [...perShardOut.values()];
  const combinedIn = [...newIn, ...stage1Records.map((r) => r.actual.inputTokens)];
  const combinedOut = [...newOut, ...stage1Records.map((r) => r.actual.outputTokens)];
  const stage1Cost = stage1Records.reduce((x, r) => x + r.actual.costUsd, 0);
  const credits = loadGatewayKey() ? await gatewayCredits() : null;
  const waves = [a, ...(b ? [b] : [])];

  writeJson(`${F7B3_DIR}/17-final-report.json`, {
    artifact: "F-7B.3A §14-§18 final reporting over the 5 frozen Stage-1 and the newly executed Stage-2 shards",
    at: new Date().toISOString(), gitSha: gitSha(),
    waves: waves.map((w) => ({ wave: w.wave, shards: w.waveShardIds.length, executed: w.records.length, costUsd: +w.waveCostUsd.toFixed(4), allPass: w.allPass, gate: Object.fromEntries(Object.entries(w.gate).map(([k, g]) => [k, g.pass])), trust: w.trust, proofCounts: w.proofCounts })),
    terminalShards: stage1.size + stage2.size, totalShards: 36, notExecuted: 36 - stage1.size - stage2.size,
    shardStatuses: final.stitched.shardStatusesPlaceholder ?? undefined,
    accountability: final.accountability,
    proofCounts: final.proofCounts,
    trust: final.trust,
    stitched: final.stitched,
    // §17 window audit
    window: {
      maxSingleTurnInputTokens: Math.max(0, ...allCalls.map((c) => c.inputTokens)),
      maxSingleTurnOutputTokens: Math.max(0, ...allCalls.map((c) => c.outputTokens)),
      newShardsMedianAggregateInput: pct(newIn, 0.5), newShardsP95AggregateInput: pct(newIn, 0.95),
      newShardsMedianOutput: pct(newOut, 0.5), newShardsP95Output: pct(newOut, 0.95),
      combinedMedianAggregateInput: pct(combinedIn, 0.5), combinedP95AggregateInput: pct(combinedIn, 0.95),
      combinedMedianOutput: pct(combinedOut, 0.5), combinedP95Output: pct(combinedOut, 0.95),
      totalNewInputTokens: newIn.reduce((x, y) => x + y, 0), totalNewOutputTokens: newOut.reduce((x, y) => x + y, 0),
      historicalMonolithicFirstTurnInput: 312_143,
      peakInputReductionVsMonolithic: +(1 - Math.max(0, ...allCalls.map((c) => c.inputTokens)) / 312_143).toFixed(4),
      outputTruncations: [...stage1.values(), ...stage2.values()].filter((e) => e.record.failureReasons.includes("OUTPUT_TRUNCATED")).length,
      partialRecoveries: [...stage2.values()].filter((e) => e.record.actual.retryCount > 0).length,
      outputCeiling: 128_000,
    },
    // §18 cost audit
    cost: {
      waveACostUsd: +a.waveCostUsd.toFixed(4), waveBCostUsd: b ? +b.waveCostUsd.toFixed(4) : null,
      totalNewCostUsd: +ledger.spentUsd.toFixed(4), capUsd: ledger.missionCapUsd, remainingCapUsd: +(ledger.missionCapUsd - ledger.spentUsd).toFixed(4),
      stage1HistoricalCostUsd: +stage1Cost.toFixed(4),
      cumulativeCanaryCostUsd: +(stage1Cost + ledger.spentUsd).toFixed(4),
      retryOrWastedCostUsd: +[...stage2.values()].filter((e) => e.record.attempt > 1).reduce((x, e) => x + e.record.actual.costUsd, 0).toFixed(4),
      meanCostPerNewShardUsd: +(ledger.spentUsd / Math.max(1, stage2.size)).toFixed(4),
      paidTurns: allCalls.length,
      gatewayBalanceAfter: credits ? Number(credits.balance) : null,
      updatedWaveCEstimate: final.nextWaveEstimate,
      refusals: ledger.refusals,
    },
    // §16 owner-shard recovery
    ownerShardRecovery: {
      executedShards: stage1.size + stage2.size,
      materialOwned: final.accountability.executedShardMaterialOwned,
      representedByOwner: final.accountability.executedRepresented,
      explicitlyDispositionedByOwner: (final.accountability.executedIntentionallyNonComputational as number) + (final.accountability.executedUnsupported as number) + (final.accountability.executedAmbiguous as number),
      missingFromOwner: final.accountability.executedMissing,
      accountabilityRate: final.accountability.executedAccountabilityRate,
      lineageClaimsOnUnownedItemsStripped: final.trust.lineageClaimsOnUnownedItemsStripped,
      contextualOwnershipCredit: final.trust.contextualOwnershipCredit,
      perShard: [...stage1.values(), ...stage2.values()].map((e) => ({ shardId: e.record.shardId, ordinal: e.record.ordinal, stage: e.record.stage, status: e.record.shardStatus, ownedMaterial: e.record.ownedMaterialItems, represented: e.record.ownedAccountability.represented, dispositioned: e.record.ownedAccountability.dispositioned, missing: e.record.ownedAccountability.missingMaterial, lineageClaimsOnUnowned: e.record.lineageClaimsOnUnownedItems })).sort((x, y) => x.ordinal - y.ordinal),
    },
    transportNormalization: { firedOnShards: [...stage2.values()].filter((e) => e.record.transportNormalization?.applied).map((e) => ({ shardId: e.record.shardId, decodedFields: e.record.transportNormalization!.decodedFields })), totalFired: [...stage2.values()].filter((e) => e.record.transportNormalization?.applied).length, shardsWithAudit: [...stage2.values()].filter((e) => e.record.transportNormalization !== null).length },
    verdict: waves.every((w) => w.allPass) && b ? "F7B_WAVES_AB_PASSED" : !b ? "WAVE_B_NOT_EXECUTED" : "SEE_WAVE_GATES",
  });
  console.log(JSON.stringify({ terminalShards: stage1.size + stage2.size, totalNewCostUsd: +ledger.spentUsd.toFixed(4), cumulative: +(stage1Cost + ledger.spentUsd).toFixed(4), proofCounts: final.proofCounts, trust: final.trust, waveAllPass: waves.map((w) => ({ wave: w.wave, allPass: w.allPass })) }, null, 1));
})();
