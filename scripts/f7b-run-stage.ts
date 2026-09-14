/**
 * F-7B §8/§12 stage runner - PAID, hard-capped, durable. Executes the frozen 36-shard Chewy 1.01 plan through the real
 * production path (planner -> buildShardCompilerInput -> RealSemanticCaller -> compileCovenantToIR post-processing ->
 * stitcher -> global Pass C). Stage 1 = the pre-registered representative subset (03-stage1-selection.json); Stage 2 =
 * every remaining shard exactly once, reusing Stage 1 results by shardHash, retrying only SHARD_PROVIDER_FAILURE at
 * most once. Every turn is guarded against the remaining stage/mission cap BEFORE it is sent; every result is written
 * to disk the moment it exists.
 *   npx tsx scripts/f7b-run-stage.ts --stage 1
 *   npx tsx scripts/f7b-run-stage.ts --stage 2
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { AI_GATEWAY_BASE_URL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { stitchShardResults } from "../lib/contract-model/compiler/semantic/shard-stitcher";
import type { CompilationShard, ShardExecutionResult } from "../lib/contract-model/compiler/semantic/shard-types";
import { F7B_DIR, MISSION_CAP_USD, STAGE1_CAP_USD, evidencePath, executeShard, freezeAndPlan, gatewayCredits, gitSha, loadGatewayKey, loadLedger, loadPriorResults, preCallEstimateUsd, readJson, remainingCapUsd, renderFirstTurns, saveLedger, writeJson, type ShardRecord } from "./f7b-lib";
import { scoreCanary } from "./f7b-score";

const stage = Number(process.argv[process.argv.indexOf("--stage") + 1] ?? "0");
if (stage !== 1 && stage !== 2) { console.error("usage: --stage 1|2"); process.exit(2); }
/** Pre-registered Stage 2 estimator (§10): per remaining shard = its pre-call estimate x the WORST observed Stage 1 actual/estimate ratio x 1.25 safety. */
const STAGE2_SAFETY = 1.25;
const MAX_ATTEMPTS = 2; // one retry, provider failure only (§12)

(async () => {
  if (!loadGatewayKey()) { console.error("no AI_GATEWAY_API_KEY"); process.exit(3); }
  const frozen = freezeAndPlan();
  const { plan } = frozen;
  const frozenPlan = readJson<{ planHash: string }>(`${F7B_DIR}/01-frozen-plan.json`);
  if (frozenPlan.planHash !== plan.planHash) { console.error(`plan hash drift: ${plan.planHash} != frozen ${frozenPlan.planHash}`); process.exit(4); }
  const selection = readJson<{ selectedShardIds: string[]; trancheEstimateUsd: number }>(`${F7B_DIR}/03-stage1-selection.json`);
  const rendered = await renderFirstTurns(frozen);
  const ledger = loadLedger();
  const prior = loadPriorResults(plan);
  const real = new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL });

  const stage1Set = new Set(selection.selectedShardIds);
  const targets: CompilationShard[] = stage === 1 ? plan.shards.filter((s) => stage1Set.has(s.shardId)) : plan.shards.filter((s) => !(prior.get(s.shardHash)?.result.status === "SHARD_COMPLETE"));

  // ---- Stage 2 cost precheck (§10/§11) from ACTUAL Stage 1 data
  let stage2Precheck: Record<string, unknown> | null = null;
  if (stage === 2) {
    const s1 = [...prior.values()].map((p) => p.record).filter((r) => r.stage === 1);
    if (s1.length === 0) { console.error("Stage 2 requires Stage 1 records"); process.exit(5); }
    const ratios = s1.map((r) => r.actual.costUsd / Math.max(1e-9, r.preCallEstimate.usd));
    const worstRatio = Math.max(...ratios);
    const perShard = targets.map((s) => { const pre = preCallEstimateUsd(rendered.get(s.shardId)!.tokens, s).usd; return { shardId: s.shardId, preRegisteredUsd: +pre.toFixed(4), stage2EstimateUsd: +(pre * worstRatio * STAGE2_SAFETY).toFixed(4) }; });
    const estRemaining = perShard.reduce((a, p) => a + p.stage2EstimateUsd, 0);
    const credits = await gatewayCredits();
    const remainingCap = MISSION_CAP_USD - ledger.spentUsd;
    stage2Precheck = { artifact: "F-7B §10 Stage 2 cost precheck from actual Stage 1 data", at: new Date().toISOString(), stage1ActualCostUsd: +ledger.stage1SpentUsd.toFixed(4), stage1Shards: s1.length, stage1ActualVsEstimateRatios: s1.map((r) => ({ shardId: r.shardId, preRegisteredUsd: +r.preCallEstimate.usd.toFixed(4), actualUsd: +r.actual.costUsd.toFixed(4), ratio: +(r.actual.costUsd / Math.max(1e-9, r.preCallEstimate.usd)).toFixed(3), turns: r.actual.turns, inputTokens: r.actual.inputTokens, outputTokens: r.actual.outputTokens })), worstObservedRatio: +worstRatio.toFixed(3), safetyFactor: STAGE2_SAFETY, remainingShards: targets.length, estimatedRemainingCostUsd: +estRemaining.toFixed(4), estimatedFullCanaryCostUsd: +(ledger.spentUsd + estRemaining).toFixed(4), gatewayBalanceUsd: credits ? Number(credits.balance) : null, missionCapUsd: MISSION_CAP_USD, spentUsd: +ledger.spentUsd.toFixed(4), hardCapRemainingUsd: +remainingCap.toFixed(4), fitsRemainingCap: estRemaining <= remainingCap, perShard };
    writeJson(`${F7B_DIR}/05-stage2-cost-precheck.json`, stage2Precheck);
    console.log(JSON.stringify({ stage2Precheck: { ...stage2Precheck, perShard: undefined } }, null, 1));
    if (estRemaining > remainingCap) { writeJson(`${F7B_DIR}/05-stage2-cost-precheck.json`, { ...stage2Precheck, verdict: "F7B_COST_BOUND_BEFORE_COMPLETION", stage2Executed: false }); console.error("F7B_COST_BOUND_BEFORE_COMPLETION - no Stage 2 call made"); process.exit(0); }
  } else {
    // Stage 1 tranche precheck (§7): the whole selected tranche must fit the Stage 1 cap before the first call.
    const tranche = targets.reduce((a, s) => a + preCallEstimateUsd(rendered.get(s.shardId)!.tokens, s).usd, 0);
    if (tranche > STAGE1_CAP_USD) { console.error(`F7B_ENVIRONMENT_BLOCKED: Stage 1 tranche $${tranche.toFixed(4)} > cap $${STAGE1_CAP_USD}`); process.exit(0); }
  }

  // ---- Execute (ordinal order), per-shard guard before every shard, one retry on provider failure only
  const worstRatio = stage2Precheck ? (stage2Precheck.worstObservedRatio as number) : 1;
  const executed: { record: ShardRecord; result: ShardExecutionResult }[] = [];
  let costBounded: Record<string, unknown> | null = null;
  for (const shard of targets) {
    const pre = preCallEstimateUsd(rendered.get(shard.shardId)!.tokens, shard).usd * (stage === 2 ? worstRatio * STAGE2_SAFETY : 1);
    const remaining = remainingCapUsd(ledger, stage);
    if (pre > remaining) {
      ledger.refusals.push({ stage, shardId: shard.shardId, kind: "PRE_SHARD", estimatedUsd: pre, spentUsd: ledger.spentUsd, capUsd: stage === 1 ? Math.min(MISSION_CAP_USD, STAGE1_CAP_USD) : MISSION_CAP_USD, at: new Date().toISOString() });
      saveLedger(ledger);
      costBounded = { shardId: shard.shardId, estimatedUsd: pre, remainingUsd: remaining, note: "next shard could not fit the remaining cap conservatively - not started; previously completed shards stay frozen" };
      console.error(`COST-BOUNDED before ${shard.shardId}: est $${pre.toFixed(4)} > remaining $${remaining.toFixed(4)}`);
      break;
    }
    let attempt = 0; let last: { record: ShardRecord; result: ShardExecutionResult } | null = null;
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      console.log(`\n[stage ${stage}] shard ${shard.ordinal} ${shard.shardId} attempt ${attempt} (units ${shard.ownedUnitKeys.length}, chars ${shard.primaryChars}, owned ${shard.ownedItemIds.length}, ctx ${shard.context.length}${shard.oversized ? ", OVERSIZED" : ""}) est $${pre.toFixed(4)}`);
      const out = await executeShard(frozen, shard, stage, attempt, ledger, real, rendered.get(shard.shardId)!.tokens);
      last = { record: out.record, result: out.result };
      writeJson(evidencePath(shard), { record: out.record, result: out.result, compile: { ...out.compile, sourceContext: undefined, frozenInventory: undefined }, shardInputSummary: { candidateRef: out.shardInput.candidateRef, operativeChars: out.shardInput.operativeSourceText.length, ownedInventoryItems: out.shardInput.frozenInventory!.items.length, contextRegions: out.shardInput.sourceContext!.regions.length - 1, bundleItems: out.shardInput.contextBundle.items.length, unresolvedDependencies: out.shardInput.contextBundle.unresolvedDependencies.length }, attemptsSoFar: attempt });
      console.log(`  -> ${out.record.compileStatus} / ${out.record.shardStatus} rules=${out.record.rules} defs=${out.record.definitions} owned(rep/disp/miss)=${out.record.ownedAccountability.represented}/${out.record.ownedAccountability.dispositioned}/${out.record.ownedAccountability.missingMaterial} in=${out.record.actual.inputTokens} out=${out.record.actual.outputTokens} turns=${out.record.actual.turns} $${out.record.actual.costUsd.toFixed(4)} ${out.record.failureReasons.join(",")}`);
      if (out.result.status !== "SHARD_PROVIDER_FAILURE") break;
      if (attempt < MAX_ATTEMPTS && preCallEstimateUsd(rendered.get(shard.shardId)!.tokens, shard).usd > remainingCapUsd(ledger, stage)) { console.error("retry refused by cost guard"); break; }
    }
    executed.push(last!);
  }

  // ---- Assemble every result known so far (executed now + prior by hash), stitch, global Pass C, score
  const all = loadPriorResults(plan);
  const results: ShardExecutionResult[] = plan.shards.flatMap((s) => { const e = all.get(s.shardHash); return e ? [{ ...e.result, reusedFromHash: !executed.some((x) => x.result.shardId === s.shardId) }] : []; });
  const records: ShardRecord[] = plan.shards.flatMap((s) => { const e = all.get(s.shardHash); return e ? [e.record] : []; });
  const stitched = stitchShardResults({ plan, results, frozenInventory: frozen.callerInput.frozenInventory!, sourceContextState: frozen.callerInput.sourceContext!.state, companyId: frozen.callerInput.companyId, instrumentKey: frozen.callerInput.instrumentKey, candidateRef: frozen.callerInput.candidateRef });
  const score = scoreCanary(frozen, results, records, stitched, ledger.calls);
  const credits = await gatewayCredits();

  if (stage === 1) {
    const s1 = records.filter((r) => r.stage === 1);
    const inS1 = new Set(s1.map((r) => r.shardId));
    const s1Material = s1.reduce((a, r) => a + r.ownedMaterialItems, 0);
    const s1Rep = s1.reduce((a, r) => a + r.ownedAccountability.represented, 0);
    const s1Disp = s1.reduce((a, r) => a + r.ownedAccountability.dispositioned, 0);
    const s1Miss = s1.reduce((a, r) => a + r.ownedAccountability.missingMaterial, 0);
    const s1RepMaterial = s1.reduce((a, r) => a + (r.ownedMaterialItems - r.ownedAccountability.missingMaterial), 0);
    const oversized = s1.find((r) => r.oversized) ?? null;
    const normal = s1.filter((r) => !r.oversized);
    const maxTurnIn = (id: string) => Math.max(0, ...ledger.calls.filter((c) => c.shardId === id).map((c) => c.inputTokens));
    const gate = {
      1: { name: "no dangerous silent omission", value: score.trust.dangerousSilentOmissions, pass: score.trust.dangerousSilentOmissions === 0 },
      2: { name: "no false completeness", value: score.trust.falseCompleteness, pass: score.trust.falseCompleteness === 0 },
      3: { name: "zero shard-harness/protocol defect (no schema failure, no transport/internal error, every shard returned a classified result)", value: s1.filter((r) => r.shardStatus === "SHARD_SCHEMA_FAILURE" || r.failureReasons.includes("TRANSPORT_OR_INTERNAL_ERROR") || r.failureReasons.includes("MODEL_SCHEMA_FAILURE")).map((r) => r.shardId), pass: !s1.some((r) => r.shardStatus === "SHARD_SCHEMA_FAILURE" || r.failureReasons.includes("TRANSPORT_OR_INTERNAL_ERROR") || r.failureReasons.includes("MODEL_SCHEMA_FAILURE")) },
      4: { name: "successful shards retain their output (evidence file present with composition, raw submission retained)", value: s1.filter((r) => r.shardStatus === "SHARD_COMPLETE").map((r) => ({ shardId: r.shardId, retained: r.rawSubmissionRetained && existsSync(evidencePath(plan.shards.find((s) => s.shardId === r.shardId)!)) })), pass: s1.filter((r) => r.shardStatus === "SHARD_COMPLETE").every((r) => r.rawSubmissionRetained) },
      5: { name: "no contextual source earns ownership credit", value: score.trust.contextualOwnershipCredit, pass: score.trust.contextualOwnershipCredit === 0 },
      6: { name: "no production invariant violated (every material item still owned once; stitched status conservative; lineage claims on unowned items stripped, not credited)", value: { ownership: plan.ownershipProof, stitchedStatus: stitched.status, strippedClaims: score.C.strippedClaimsOnUnownedItems }, pass: plan.ownershipProof.unowned === 0 && plan.ownershipProof.multiplyOwned === 0 && stitched.status !== "COMPLETED" },
      7: { name: "ordinary shards within the bounded envelope (largest single turn < 60,000 input tokens; no output truncation)", value: normal.map((r) => ({ shardId: r.shardId, maxTurnInputTokens: maxTurnIn(r.shardId), outputTokens: r.actual.outputTokens, truncated: r.failureReasons.includes("OUTPUT_TRUNCATED") })), pass: normal.every((r) => maxTurnIn(r.shardId) < 60_000 && !r.failureReasons.includes("OUTPUT_TRUNCATED")) },
      8: { name: "oversized shard succeeds safely OR fails explicitly without poisoning unrelated shards", value: oversized ? { shardId: oversized.shardId, status: oversized.shardStatus, failureReasons: oversized.failureReasons, maxTurnInputTokens: maxTurnIn(oversized.shardId), outputTokens: oversized.actual.outputTokens, missingMaterial: oversized.ownedAccountability.missingMaterial } : null, pass: oversized ? (oversized.shardStatus === "SHARD_COMPLETE" || oversized.shardStatus === "SHARD_PARTIAL" || stitched.shards.some((s) => s.shardId === oversized.shardId && s.status !== "SHARD_COMPLETE")) : false },
      9: { name: "no evidence the planner systematically deprives owner shards of context (MISSING_CONTEXT dispositions/sufficiency on owned items)", value: { missingContextDispositions: score.E.missingContextDispositions, missingContextObjects: score.E.missingContextSufficiencyObjects, shardsMissingContext: s1.filter((r) => r.shardStatus === "SHARD_MISSING_CONTEXT").length, unresolvedContextEntriesInStage1: s1.reduce((a, r) => a + r.unresolvedContext, 0) }, pass: s1.filter((r) => r.shardStatus === "SHARD_MISSING_CONTEXT").length === 0 && score.E.missingContextSufficiencyObjects === 0 },
      10: { name: "owned material semantics show real recovery (exact fraction; no post-hoc threshold - judged as architecture breakage vs disclosed model incompleteness)", value: { stage1OwnedMaterialItems: s1Material, accounted: s1RepMaterial, missing: s1Miss, fraction: +(s1RepMaterial / Math.max(1, s1Material)).toFixed(4), representedAllItems: s1Rep, dispositionedAllItems: s1Disp, perShard: s1.map((r) => ({ shardId: r.shardId, material: r.ownedMaterialItems, missing: r.ownedAccountability.missingMaterial, represented: r.ownedAccountability.represented, dispositioned: r.ownedAccountability.dispositioned, byDisposition: r.ownedAccountability.byDisposition })) }, pass: s1RepMaterial > 0 && s1Miss < s1Material },
    };
    const allPass = Object.values(gate).every((g) => g.pass);
    writeJson(`${F7B_DIR}/04-stage1-results-and-gate.json`, { artifact: "F-7B §8/§9 Stage 1 results + gate", at: new Date().toISOString(), gitSha: gitSha(), planHash: plan.planHash, selectedShardIds: selection.selectedShardIds, trancheEstimateUsd: selection.trancheEstimateUsd, stage1Calls: ledger.calls.filter((c) => c.stage === 1).length, stage1CostUsd: +ledger.stage1SpentUsd.toFixed(4), stage1CapUsd: STAGE1_CAP_USD, maxActualInputTokensPerShard: Math.max(0, ...s1.map((r) => r.actual.inputTokens)), maxSingleTurnInputTokens: Math.max(0, ...s1.map((r) => maxTurnIn(r.shardId))), maxActualOutputTokensPerShard: Math.max(0, ...s1.map((r) => r.actual.outputTokens)), records: s1, partialStitchDiagnostics: { status: stitched.status, collisions: score.G, contextualEmissions: stitched.contextualEmissions, unresolvedOwnedItems: stitched.unresolvedOwnedItems.length, strippedLineage: stitched.collisions.filter((c) => c.kind === "LINEAGE_CLAIM_ON_UNOWNED_ITEM").map((c) => ({ shard: c.shardId, owner: c.ownerShardId, item: c.itemId, object: c.objectId })) }, scoreSnapshot: { A: score.A, B: score.B, C: score.C, E: score.E, H: score.H, I: score.I, J: score.J, W: score.W, trust: score.trust, Ksummary: score.Ksummary, K: score.K.filter((k) => k.ownerShard && inS1.has(k.ownerShard)) }, gate, allPass, costBounded, gateway: credits, verdictIfFail: allPass ? null : "F7_NEEDS_ARCHITECTURAL_ITERATION (or F7_NOT_SAFE if a trust gate failed)" });
    console.log(JSON.stringify({ stage1CostUsd: +ledger.stage1SpentUsd.toFixed(4), gate: Object.fromEntries(Object.entries(gate).map(([k, g]) => [k, g.pass])), allPass, fraction: gate[10].value.fraction }, null, 1));
  } else {
    const executedNow = executed.map((e) => e.record);
    writeJson(`${F7B_DIR}/07-stitched-result.json`, { artifact: "F-7B §14 stitched Chewy 1.01 result (F-7A stitcher over all 36 shard results)", at: new Date().toISOString(), gitSha: gitSha(), planHash: plan.planHash, candidateRef: stitched.candidateRef, status: stitched.status, failureReasons: stitched.failureReasons, shards: stitched.shards, unresolvedOwnedItems: stitched.unresolvedOwnedItems, collisions: stitched.collisions, contextualEmissions: stitched.contextualEmissions, idMap: stitched.idMap, canonicalizedLineageReferences: stitched.canonicalizedLineageReferences, rules: stitched.rules, definitions: stitched.definitions, sharedCapacities: stitched.sharedCapacities, inventoryDispositions: stitched.inventoryDispositions, unresolvedIssues: stitched.unresolvedIssues.slice(0, 200) });
    writeJson(`${F7B_DIR}/08-global-pass-c.json`, { artifact: "F-7B §14 global Pass C over the FULL frozen 1.01 inventory against the stitched IR (the only completeness authority)", at: new Date().toISOString(), candidateRef: stitched.accountability.candidateRef, inventoryStatus: stitched.accountability.inventoryStatus, sourceContextState: stitched.accountability.sourceContextState, counts: stitched.accountability.counts, semanticallyComplete: stitched.accountability.semanticallyComplete, reasons: stitched.accountability.reasons.slice(0, 200), items: stitched.accountability.items.map((i) => ({ inventoryItemId: i.inventoryItemId, materiality: i.materiality, semanticRole: i.semanticRole, disposition: i.disposition, modelDisposition: i.modelDisposition, ownerShard: plan.itemOwnerShard[i.inventoryItemId] ?? null, ownerShardStatus: results.find((r) => r.shardId === plan.itemOwnerShard[i.inventoryItemId])?.status ?? "NOT_EXECUTED", lineagePaths: i.lineageIrPaths.length, quantitative: i.quantitative.map((q) => q.disposition) })) });
    writeJson(`${F7B_DIR}/09-canary-score-and-trust-audit.json`, { artifact: "F-7B §3 pre-registered scorer output + §24 trust audit", at: new Date().toISOString(), gitSha: gitSha(), score, stage2Precheck, costBounded, executedInStage2: executedNow.map((r) => ({ shardId: r.shardId, attempt: r.attempt, status: r.shardStatus, costUsd: +r.actual.costUsd.toFixed(4) })), gateway: credits, ledger: { spentUsd: +ledger.spentUsd.toFixed(4), stage1SpentUsd: +ledger.stage1SpentUsd.toFixed(4), calls: ledger.calls.length, refusals: ledger.refusals } });
    console.log(JSON.stringify({ spentUsd: +ledger.spentUsd.toFixed(4), stitchedStatus: stitched.status, shardStatuses: score.F.shardStatuses, A: score.A, trust: score.trust, W: { max: score.W.singleTurnInput.max, out: score.W.output }, costBounded }, null, 1));
  }
})();
