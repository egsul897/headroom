/**
 * F-7B.3E §7-§11 - PAID, hard-capped FINAL Wave-C runner. Executes exactly the 11 shards the ORIGINAL committed
 * remaining-31 manifest assigns to Wave C, in frozen ordinal order, through the real production path. Each result is
 * persisted the moment it exists. Evaluation is deliberately NOT done here: §13-§29 run from disk afterwards, so no
 * evaluation bug can cost a paid result.
 *
 * Harness only. No production module is modified.
 *   F7B_DIR=docs/phase-3-remediation-f7b3e npx tsx scripts/f7b3e-run-wavec.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import { AI_GATEWAY_BASE_URL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import type { ShardExecutionResult } from "../lib/contract-model/compiler/semantic/shard-types";
import { execSync } from "node:child_process";
import { F7A_BASELINE, executeShard, freezeAndPlan, gatewayCredits, gitSha, loadGatewayKey, loadLedger, readJson, renderFirstTurns, saveLedger, writeJson, type Ledger, type ShardRecord } from "./f7b-lib";
import { costModel, estimateShardUsd, loadFrozenStage1, loadStage2, stage2EvidencePath } from "./f7b3-lib";

const CAP_USD = Number(process.env.F7B3E_CAP_USD ?? "9.5"); // §6 hard incremental cap for NEW Wave-C calls only
const STARTING_SHA = "76e76a1781f381f360950255960dc182f9d01f69";
const MANIFEST = "docs/phase-3-remediation-f7b3/00-baseline-and-remaining-manifest.json";
const PRECHECK = "docs/phase-3-remediation-f7b3e/00-baseline-frozen25-and-wavec-precheck.json";
const OUT_DIR = process.env.F7B3E_OUT_DIR ?? "docs/phase-3-remediation-f7b3e";
const MAX_ATTEMPTS = 2; // §8: one retry, genuine provider failure only

interface ManifestRow { ordinal: number; shardId: string; shardHash: string; wave: string }

/** §1/§34: the starting SHA must be an ancestor of HEAD and no production path may differ between them. */
function productionScopeSinceStart(startSha: string): { startingShaIsAncestor: boolean; changedFiles: string[]; productionChanged: string[]; pass: boolean } {
  const ancestor = (() => { try { execSync(`git merge-base --is-ancestor ${startSha} HEAD`, { stdio: "ignore" }); return true; } catch { return false; } })();
  const changed = execSync(`git diff --name-only ${startSha} HEAD`, { encoding: "utf8" }).split("\n").filter(Boolean)
    .concat(execSync("git diff --name-only HEAD", { encoding: "utf8" }).split("\n").filter(Boolean));
  const production = changed.filter((f) => /^(lib|app|components|prisma)\//.test(f));
  return { startingShaIsAncestor: ancestor, changedFiles: [...new Set(changed)], productionChanged: production, pass: ancestor && production.length === 0 };
}

(async () => {
  if (!loadGatewayKey()) { console.error("F7B_3E_ENVIRONMENT_BLOCKED: no AI_GATEWAY_API_KEY"); process.exit(3); }
  const pre = readJson<{ verdict: string }>(PRECHECK);
  if (pre.verdict !== "PRECHECK_CLEAR_TO_EXECUTE") { console.error(`refusing to execute: preflight verdict ${pre.verdict}`); process.exit(4); }

  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const manifest = readJson<{ baselineValid: boolean; manifest: ManifestRow[] }>(MANIFEST);
  const stage1 = loadFrozenStage1();

  // ---- §1 baseline identity, re-verified live immediately before any call
  const baseline = {
    startingShaScope: { expected: STARTING_SHA, head: gitSha(), ...productionScopeSinceStart(STARTING_SHA) },
    planHash: { expected: F7A_BASELINE.planHash, actual: plan.planHash, pass: plan.planHash === F7A_BASELINE.planHash },
    shardCount: { actual: plan.shards.length, pass: plan.shards.length === 36 },
    ownership: { actual: plan.ownershipProof, pass: plan.ownershipProof.materialItems === 108 && plan.ownershipProof.ownedOnce === 108 && plan.ownershipProof.unowned === 0 && plan.ownershipProof.multiplyOwned === 0 },
    committedManifestValid: { pass: manifest.baselineValid && manifest.manifest.length === 31 },
    shardHashesMatchManifest: { pass: manifest.manifest.every((m) => plan.shards.find((s) => s.shardId === m.shardId)?.shardHash === m.shardHash) },
    frozen25: { count: stage1.size + loadStage2().size, pass: stage1.size + loadStage2().size === 25 },
  };
  if (!Object.values(baseline).every((b) => b.pass)) {
    writeJson(`${OUT_DIR}/10-baseline-invalid.json`, { artifact: "F-7B.3E §1 baseline check failed - zero paid calls", at: new Date().toISOString(), baseline, verdict: "F7B_3E_BASELINE_INVALID" });
    console.error("F7B_3E_BASELINE_INVALID"); process.exit(4);
  }

  // ---- §3 wave membership read from the committed manifest, never recomputed
  const rows = manifest.manifest.filter((m) => m.wave === "C").sort((a, b) => a.ordinal - b.ordinal);
  const targets = rows.map((r) => plan.shards.find((s) => s.shardId === r.shardId)!);
  if (targets.length !== 11) { console.error(`F7B_3E_BASELINE_INVALID: Wave C is ${targets.length} shards, expected 11`); process.exit(4); }
  const rendered = await renderFirstTurns(frozen);
  const model = costModel([...stage1.values(), ...loadStage2().values()]);

  const ledger: Ledger = loadLedger();
  ledger.missionCapUsd = CAP_USD; ledger.stage1CapUsd = CAP_USD;
  const already = loadStage2();
  const waveEstimate = targets.filter((s) => !already.has(s.shardId)).reduce((a, s) => a + estimateShardUsd(model, rendered.get(s.shardId)!.tokens), 0);
  const credits = await gatewayCredits();
  const balanceBefore = credits ? Number(credits.balance) : null;
  const precheck = { wave: "C", shards: targets.length, alreadyExecuted: targets.filter((s) => already.has(s.shardId)).length, waveConservativeEstimateUsd: +waveEstimate.toFixed(4), spentSoFarUsd: +ledger.spentUsd.toFixed(4), remainingCapUsd: +(CAP_USD - ledger.spentUsd).toFixed(4), gatewayBalanceUsd: balanceBefore, fitsCap: waveEstimate <= CAP_USD - ledger.spentUsd, fitsBalance: balanceBefore === null ? null : waveEstimate <= balanceBefore };
  console.log(JSON.stringify({ precheck }, null, 1));
  if (!precheck.fitsCap || precheck.fitsBalance === false) {
    writeJson(`${OUT_DIR}/11-wave-c-cost-bound.json`, { artifact: "F-7B.3E §6 Wave C could not start within the cap or balance", at: new Date().toISOString(), precheck, verdict: "F7B_3E_COST_BOUND_BEFORE_START" });
    console.error("F7B_3E_COST_BOUND_BEFORE_START"); process.exit(0);
  }

  // ---- §7/§10 execute, in frozen ordinal order, with a per-shard whole-remaining-wave guard
  const executed: { record: ShardRecord; result: ShardExecutionResult }[] = [];
  const real = new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL });
  let costBounded: Record<string, unknown> | null = null;
  const guards: Record<string, unknown>[] = [];
  for (const shard of targets) {
    if (already.has(shard.shardId)) { console.log(`[wave C] shard ${shard.ordinal} ${shard.shardId} already executed - reusing`); continue; }
    const est = estimateShardUsd(model, rendered.get(shard.shardId)!.tokens);
    const remainingWave = targets.filter((s) => !already.has(s.shardId) && s.ordinal >= shard.ordinal).reduce((a, s) => a + estimateShardUsd(model, rendered.get(s.shardId)!.tokens), 0);
    const remaining = CAP_USD - ledger.spentUsd;
    guards.push({ ordinal: shard.ordinal, shardId: shard.shardId, expectedRenderedInput: rendered.get(shard.shardId)!.tokens, conservativeShardUsd: +est.toFixed(4), cumulativeActualUsd: +ledger.spentUsd.toFixed(4), remainingCapUsd: +remaining.toFixed(4), conservativeRestOfWaveUsd: +remainingWave.toFixed(4), proceeds: remainingWave <= remaining });
    if (remainingWave > remaining) {
      ledger.refusals.push({ stage: 2, shardId: shard.shardId, kind: "PRE_SHARD", estimatedUsd: remainingWave, spentUsd: ledger.spentUsd, capUsd: CAP_USD, at: new Date().toISOString() });
      saveLedger(ledger);
      costBounded = { shardId: shard.shardId, ordinal: shard.ordinal, estimatedRestOfWaveUsd: +remainingWave.toFixed(4), remainingCapUsd: +remaining.toFixed(4), note: "completing Wave C no longer fits the remaining cap - the wave stopped before this shard and every earlier result stays frozen by shard hash" };
      console.error(`COST-BOUNDED before ordinal ${shard.ordinal}: rest-of-wave $${remainingWave.toFixed(4)} > remaining $${remaining.toFixed(4)}`);
      break;
    }
    let attempt = 0; let last: { record: ShardRecord; result: ShardExecutionResult } | null = null;
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      console.log(`\n[wave C] shard ${shard.ordinal} ${shard.shardId} attempt ${attempt} (units ${shard.ownedUnitKeys.length}, chars ${shard.primaryChars}, owned ${shard.ownedItemIds.length}, ctx ${shard.context.length}) est $${est.toFixed(4)}`);
      const out = await executeShard(frozen, shard, 2, attempt, ledger, real, rendered.get(shard.shardId)!.tokens);
      last = { record: out.record, result: out.result };
      writeJson(stage2EvidencePath(shard), { record: out.record, result: out.result, compile: { ...out.compile, sourceContext: undefined, frozenInventory: undefined }, wave: "C", attemptsSoFar: attempt });
      console.log(`  -> ${out.record.compileStatus} / ${out.record.shardStatus} rules=${out.record.rules} defs=${out.record.definitions} owned(rep/disp/miss)=${out.record.ownedAccountability.represented}/${out.record.ownedAccountability.dispositioned}/${out.record.ownedAccountability.missingMaterial} in=${out.record.actual.inputTokens} out=${out.record.actual.outputTokens} turns=${out.record.actual.turns} $${out.record.actual.costUsd.toFixed(4)} ${out.record.failureReasons.join(",")}`);
      if (out.result.status !== "SHARD_PROVIDER_FAILURE") break; // §8: retry genuine provider failure only
    }
    executed.push(last!);
  }

  const creditsAfter = await gatewayCredits();
  const waveRecords = executed.map((e) => e.record);
  writeJson(`${OUT_DIR}/01-wave-c-execution-ledger.json`, {
    artifact: "F-7B.3E §7-§11 Wave-C paid execution ledger and per-shard terminal records",
    at: new Date().toISOString(), gitSha: gitSha(), planHash: plan.planHash,
    baseline, precheck, guards,
    waveShardIds: rows.map((r) => ({ ordinal: r.ordinal, shardId: r.shardId, shardHash: r.shardHash })),
    executedCount: waveRecords.length,
    calls: ledger.calls.length,
    waveCostUsd: +waveRecords.reduce((a, r) => a + r.actual.costUsd, 0).toFixed(6),
    cumulativeLedgerUsd: +ledger.spentUsd.toFixed(6),
    capUsd: CAP_USD,
    records: waveRecords,
    retries: waveRecords.filter((r) => r.attempt > 1).length,
    providerFailures: waveRecords.filter((r) => r.shardStatus === "SHARD_PROVIDER_FAILURE").length,
    perTurnCalls: ledger.calls,
    refusals: ledger.refusals,
    costBounded,
    gatewayBalanceBefore: balanceBefore, gatewayBalanceAfter: creditsAfter ? Number(creditsAfter.balance) : null,
  });
  console.log(JSON.stringify({ executed: waveRecords.length, waveCostUsd: +waveRecords.reduce((a, r) => a + r.actual.costUsd, 0).toFixed(4), cumulativeUsd: +ledger.spentUsd.toFixed(4), retries: waveRecords.filter((r) => r.attempt > 1).length, statuses: Object.fromEntries([...new Set(waveRecords.map((r) => r.shardStatus))].map((s) => [s, waveRecords.filter((r) => r.shardStatus === s).length])), costBounded, balanceAfter: creditsAfter?.balance }, null, 1));
})();
