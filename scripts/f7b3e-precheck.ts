/**
 * F-7B.3E §1/§2/§3/§6 - ZERO-COST preflight for the final Wave-C tranche.
 * Verifies baseline identity, hash-verifies the 25 frozen paid results against the certified F-7B.3D replay,
 * reads Wave C from the ORIGINAL committed manifest, and computes the pre-registered cost bound.
 * Makes no model calls. One gateway balance read only.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { F7A_BASELINE, freezeAndPlan, gatewayCredits, gitSha, loadGatewayKey, readJson, renderFirstTurns, writeJson } from "./f7b-lib";
import { costModel, estimateShardUsd, loadFrozenStage1, loadStage2 } from "./f7b3-lib";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const STARTING_SHA = "76e76a1781f381f360950255960dc182f9d01f69";
const MANIFEST = "docs/phase-3-remediation-f7b3/00-baseline-and-remaining-manifest.json";
const CERTIFIED = "docs/phase-3-remediation-f7b3d/00-scorer-disagreement.json";
const OUT_DIR = process.env.F7B3E_OUT_DIR ?? "docs/phase-3-remediation-f7b3e";
const CAP_USD = Number(process.env.F7B3E_CAP_USD ?? "9.5");

interface ManifestRow { ordinal: number; shardId: string; shardHash: string; wave: string; estimatedFirstTurnInputTokens: number }

/** §1/§34: the starting SHA must be an ancestor of HEAD and no production path may differ between them. */
function productionScopeSinceStart(startSha: string): { startingShaIsAncestor: boolean; changedFiles: string[]; productionChanged: string[]; pass: boolean } {
  const ancestor = (() => { try { execSync(`git merge-base --is-ancestor ${startSha} HEAD`, { stdio: "ignore" }); return true; } catch { return false; } })();
  const changed = execSync(`git diff --name-only ${startSha} HEAD`, { encoding: "utf8" }).split("\n").filter(Boolean)
    .concat(execSync("git diff --name-only HEAD", { encoding: "utf8" }).split("\n").filter(Boolean));
  const production = changed.filter((f) => /^(lib|app|components|prisma)\//.test(f));
  return { startingShaIsAncestor: ancestor, changedFiles: [...new Set(changed)], productionChanged: production, pass: ancestor && production.length === 0 };
}

(async () => {
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const manifest = readJson<{ baselineValid: boolean; manifest: ManifestRow[] }>(MANIFEST);
  const certified = readJson<{ frozenShards: { ordinal: number; shardId: string; shardHash: string; status: string; compositionHash: string }[] }>(CERTIFIED);
  const stage1 = loadFrozenStage1(); const stage2 = loadStage2();

  // ---- §1 baseline identity
  const inv = frozen.callerInput.frozenInventory!;
  const baseline = {
    startingShaScope: { expected: STARTING_SHA, head: gitSha(), ...productionScopeSinceStart(STARTING_SHA) },
    planHash: { expected: F7A_BASELINE.planHash, actual: plan.planHash, pass: plan.planHash === F7A_BASELINE.planHash },
    shardCount: { actual: plan.shards.length, pass: plan.shards.length === 36 },
    shardHashesMatchManifest: { pass: manifest.manifest.every((m) => plan.shards.find((s) => s.shardId === m.shardId)?.shardHash === m.shardHash), checked: manifest.manifest.length },
    ownership: { actual: plan.ownershipProof, pass: plan.ownershipProof.materialItems === 108 && plan.ownershipProof.ownedOnce === 108 && plan.ownershipProof.unowned === 0 && plan.ownershipProof.multiplyOwned === 0 },
    frozenInventoryItems: { actual: inv.items.length, pass: inv.items.length > 0 },
    sourceContextRegions: { actual: frozen.callerInput.sourceContext!.regions.length, pass: frozen.callerInput.sourceContext!.regions.length > 0 },
    committedManifestValid: { pass: manifest.baselineValid && manifest.manifest.length === 31 },
  };

  // ---- §2 the 25 frozen paid results, hash-verified against the certified F-7B.3D replay
  const certById = new Map(certified.frozenShards.map((x) => [x.shardId, x]));
  const frozenRows = plan.shards.flatMap((s) => {
    const e = stage1.get(s.shardId) ?? stage2.get(s.shardId);
    if (!e) return [];
    const compositionHash = sha256(JSON.stringify(e.result.composition));
    const c = certById.get(s.shardId);
    return [{
      ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash,
      stage: stage1.has(s.shardId) ? "STAGE_1" : (e as { wave?: string }).wave === "B" ? "WAVE_B" : "WAVE_A",
      status: e.result.status, compositionHash,
      shardHashMatchesPlan: e.result.shardHash === s.shardHash,
      certifiedCompositionHash: c?.compositionHash ?? null,
      compositionMatchesCertified: c ? c.compositionHash === compositionHash : false,
      statusMatchesCertified: c ? c.status === e.result.status : false,
    }];
  });
  const frozen25 = {
    count: frozenRows.length, expected: 25, pass: frozenRows.length === 25,
    allShardHashesMatchPlan: frozenRows.every((r) => r.shardHashMatchesPlan),
    allCompositionsMatchCertified: frozenRows.every((r) => r.compositionMatchesCertified),
    allStatusesMatchCertified: frozenRows.every((r) => r.statusMatchesCertified),
    mismatches: frozenRows.filter((r) => !r.compositionMatchesCertified || !r.statusMatchesCertified || !r.shardHashMatchesPlan),
    rows: frozenRows,
  };

  // ---- §3 Wave C, read from the ORIGINAL committed manifest, never re-selected
  const rows = manifest.manifest.filter((m) => m.wave === "C").sort((a, b) => a.ordinal - b.ordinal);
  const rendered = await renderFirstTurns(frozen);
  const waveC = rows.map((r) => {
    const s = plan.shards.find((x) => x.shardId === r.shardId)!;
    const owned = new Set(s.ownedItemIds);
    const items = inv.items.filter((i) => owned.has(i.inventoryItemId));
    return {
      ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash,
      manifestHashMatches: s.shardHash === r.shardHash,
      primaryChars: s.primaryChars, renderedFirstTurnTokens: rendered.get(s.shardId)!.tokens,
      ownedUnits: s.ownedUnitKeys.length, ownedInventoryItems: s.ownedItemIds.length,
      ownedMaterialItems: items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").length,
      quantitativeItems: items.filter((i) => (i.quantitativeValues ?? []).length > 0).length,
      contextEntries: s.context.length, contextChars: s.context.reduce((a, c) => a + c.text.length, 0),
      truncatedContextEntries: s.context.filter((c) => c.truncated).length,
      unresolvedContext: s.unresolvedContext.length,
      oversized: s.oversized ?? false,
      estimatedOutputBurden: s.ownedUnitKeys.length * 1200,
    };
  });
  const waveCheck = { count: waveC.length, expected: 11, pass: waveC.length === 11 && waveC.every((w) => w.manifestHashMatches), alreadyExecuted: waveC.filter((w) => stage2.has(w.shardId)).length };

  // ---- §6 cost bound from ALL Stage-1 + Wave-A + Wave-B actuals
  const actuals = [...stage1.values(), ...stage2.values()];
  const model = costModel(actuals);
  const rates = actuals.map((e) => e.record.actual.costUsd / Math.max(1, e.record.estimatedFirstTurnInputTokens)).sort((a, b) => a - b);
  const medianRate = rates.length % 2 ? rates[(rates.length - 1) / 2]! : (rates[rates.length / 2 - 1]! + rates[rates.length / 2]!) / 2;
  const tokens = waveC.reduce((a, w) => a + w.renderedFirstTurnTokens, 0);
  const conservative = waveC.reduce((a, w) => a + estimateShardUsd(model, w.renderedFirstTurnTokens), 0);
  const credits = loadGatewayKey() ? await gatewayCredits() : null;
  const balance = credits ? Number(credits.balance) : null;
  const cost = {
    actualsUsed: actuals.length, renderedTokens: tokens,
    meanRateUsd: +(tokens * model.meanRate).toFixed(4),
    medianRateUsd: +(tokens * medianRate).toFixed(4),
    worstRateUsd: +(tokens * model.worstRate).toFixed(4),
    conservativeUsd: +conservative.toFixed(4), safetyFactor: model.safety,
    capUsd: CAP_USD, gatewayBalanceUsd: balance,
    fitsCap: conservative <= CAP_USD,
    fitsBalance: balance === null ? null : conservative <= balance,
  };

  const allPass = Object.values(baseline).every((b) => b.pass);
  const verdict = !allPass ? "F7B_3E_BASELINE_INVALID"
    : !frozen25.pass || frozen25.mismatches.length > 0 ? "F7B_3E_FROZEN_RESULT_MISMATCH"
    : !waveCheck.pass ? "F7B_3E_BASELINE_INVALID"
    : !cost.fitsCap || cost.fitsBalance === false ? "F7B_3E_COST_BOUND_BEFORE_START"
    : "PRECHECK_CLEAR_TO_EXECUTE";

  writeJson(`${OUT_DIR}/00-baseline-frozen25-and-wavec-precheck.json`, {
    artifact: "F-7B.3E §1/§2/§3/§6 - zero-cost preflight before the final paid tranche (0 model calls, $0)",
    at: new Date().toISOString(), gitSha: gitSha(), planHash: plan.planHash,
    baseline, frozen25, waveC, waveCheck, cost, verdict,
  });
  console.log(JSON.stringify({ baseline: Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, v.pass])), frozen25: { count: frozen25.count, compositionsMatch: frozen25.allCompositionsMatchCertified, mismatches: frozen25.mismatches.length }, waveC: waveCheck, cost, verdict }, null, 1));
})();
