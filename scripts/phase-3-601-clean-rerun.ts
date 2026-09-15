/**
 * PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN - the paid run (§4, §6-§17).
 *
 * §4 HARD PREREQUISITE: Pass A runs FIRST, standalone, through the real production module
 * (runDualPassSemanticInventory - the exact call compile.ts makes at compile.ts:260). Pass B is invoked only after
 * BOTH passes produce a valid inventory AND the ensemble is built. If either fails, this script STOPS and spends
 * nothing on Pass B. That closes the second harness failure mode exposed by the void run.
 *
 * The fresh ensemble inventory is then handed to the real public compileCovenantToIR, which re-resolves the source
 * context, validates the inventory against it through the F-7C.1 resume gate, selects execution mode automatically,
 * shards, stitches and runs global Pass C. Nothing historical is reused.
 * Run: npx tsx scripts/phase-3-601-clean-rerun.ts
 */
import { existsSync, readFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) { try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch { /* no key file */ } }
import Anthropic from "@anthropic-ai/sdk";
import { OUT, CLEAN_RAW, CAP_USD, PRIOR_VOID_SPEND_USD, buildCleanRunPlan, newGuard } from "./phase-3-601-clean-certify";
import { BudgetExhaustedError, PassAPrerequisiteError, GuardedStageCaller, guardedCompileClient, passAPrerequisiteSatisfied, CONDITION_SUSPICION_CALLS } from "./phase-3-601-guard";
import { gatewayCredits, writeJson } from "./f7b-lib";
import { runDualPassSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/dual-pass";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { RealSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { AI_GATEWAY_BASE_URL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";

const STATE = `${CLEAN_RAW}/guard-state.ndjson`;

void (async () => {
  console.log("======= PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN (POST-HD-1) =======");
  if (existsSync(`${CLEAN_RAW}/compile-result.json`)) throw new Error("FATAL: clean-rerun evidence already exists - evidence is never rewritten");
  const cert = JSON.parse(readFileSync(`${OUT}/23-clean-rerun-harness-certification.json`, "utf8"));
  if (cert.decision !== "CERTIFIED_CLEAR_TO_EXECUTE" || cert.certified !== true) throw new Error(`FATAL: §3 certification is ${cert.decision} - no paid call permitted`);
  console.log(`  §3 certification: ${cert.decision} (live guard $${cert.liveGuardInitialConservativeRemainingUsd}, delta vs frozen estimator ${cert.deltaVsUnroundedEstimatorUsd})`);

  const { built, prePlan, batchesPerPass, rates } = buildCleanRunPlan();
  const creditsBefore = await gatewayCredits();
  const balanceBefore = creditsBefore ? Number(creditsBefore.balance) : 0;
  if (balanceBefore < CAP_USD) throw new Error(`FATAL: balance $${balanceBefore} < cap $${CAP_USD}`);

  const guard = newGuard(rates, batchesPerPass, prePlan.totals.estimatedInputTokens, balanceBefore, STATE);
  const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
  let p1Batch = 0, p1Gap = 0, p2Batch = 0, p2Gap = 0, compileTurns = 0;
  const dec = (stage: string, gapHit: () => void, batchHit: () => void) => { if (stage.endsWith("_gap")) { guard.passAGapRemaining = Math.max(0, guard.passAGapRemaining - 1); gapHit(); } else { guard.passABatchesRemaining = Math.max(0, guard.passABatchesRemaining - 1); batchHit(); } };
  const inv1 = new GuardedStageCaller(getStageCaller(), "passA-1", guard, (s) => dec(s, () => p1Gap++, () => p1Batch++));
  const inv2 = new GuardedStageCaller(getStageCaller(), "passA-2", guard, (s) => dec(s, () => p2Gap++, () => p2Batch++));
  if (inv1.isSynthetic || (inv1.providerName as string) === "synthetic") throw new Error("FATAL: no real credential - PHASE3_601_ENVIRONMENT_BLOCKED");
  console.log(`  models: inventory=${inv1.model}  cap $${CAP_USD}  balance $${balanceBefore}`);

  // ---------------- §8/§9 FRESH DUAL-PASS PASS A, standalone, before any Pass B money
  const startedAt = new Date().toISOString();
  let dual: Awaited<ReturnType<typeof runDualPassSemanticInventory>> | null = null;
  let passAError: string | null = null, passABound = false;
  const spentBeforePassA = guard.spent;
  try {
    dual = await runDualPassSemanticInventory({ candidateRef: built.candidateRef, documentId: "doc-a", sourceContext: built.sourceContext, structuralIndex: built.chewy.index, passCallers: [inv1, inv2] });
  } catch (e) { passAError = e instanceof Error ? e.message : String(e); passABound = e instanceof BudgetExhaustedError; console.log(`  PASS A ${passABound ? "COST-BOUND" : "THREW"}: ${passAError}`); }
  const passACost = guard.spent - spentBeforePassA;
  const p1 = dual?.passes[0]?.inventory ?? null, p2 = dual?.passes[1]?.inventory ?? null;
  const inv = dual?.inventory ?? null;
  const ens = (inv as unknown as { ensemble?: Record<string, unknown> } | null)?.ensemble ?? null;
  // HARNESS DEFECT HD-2, fixed after the 2026-09-15 run (see docs/phase-3-final-601/README.md): this gate previously
  // demanded inventoryStatus === "INVENTORY_OK" from both passes. Both returned INVENTORY_COVERAGE_GAP - a SUCCESSFUL
  // Pass A that produced 284/290 usable items and honestly disclosed 16 unaccounted source stretches - and the ensemble
  // built with 322 canonical items, so the run was killed before Pass B for a quality disclosure rather than a failure.
  // §4's enumerated stop conditions are: refused by the cost guard, throws, INVENTORY_FAILED, or no usable inventory
  // due to harness/environment failure. The gate must test exactly those and nothing stricter: a gate that is stricter
  // than its specification destroys runs instead of protecting them, which is the same failure shape as HD-1.
  const passAOk = !!dual && passAPrerequisiteSatisfied({ pass1: p1, pass2: p2, ensembleBuilt: dual.ensembleBuilt, authoritativeItemCount: inv?.items.length ?? 0 });
  // HARNESS DEFECT HD-3, fixed after the 2026-09-15 run: the frozen inventory was previously written only inside the
  // §17 post-compile freeze block, so when HD-2 aborted before Pass B the 322-item truth layer - the most expensive and
  // least reproducible artifact in the mission ($5.29 of paid Pass A) - died with the process and could not be resumed.
  // Expensive, irreplaceable evidence is now persisted the instant it exists, BEFORE any gate that can abort.
  if (dual) { writeJson(`${CLEAN_RAW}/frozen-inventory.json`, inv); writeJson(`${CLEAN_RAW}/pass-a-passes.json`, dual.passes); }
  if (dual) console.log(`  -> pass1 ${p1?.inventoryStatus} items=${p1?.items.length} | pass2 ${p2?.inventoryStatus} items=${p2?.items.length} | ensembleBuilt=${dual.ensembleBuilt} canonical=${inv?.items.length}`);

  const writePassA = (stopped: boolean, reason: string | null) => {
    writeJson(`${OUT}/25-clean-rerun-pass-a.json`, {
      artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §8 - fresh DUAL_PASS_ENSEMBLE Pass A (standalone, before any Pass B spend)",
      at: new Date().toISOString(), mode: "DUAL_PASS_ENSEMBLE", freshExecution: true, historicalInventoryReused: false,
      passAPrerequisiteSatisfied: passAOk, stoppedBeforePassB: stopped, stopReason: reason,
      passes: [
        { passId: "pass-1", calls: p1Batch + p1Gap, batches: p1Batch, gapCalls: p1Gap, costUsd: +guard.costByPrefix("passA-1").toFixed(6), inventoryStatus: p1?.inventoryStatus ?? null, inventoryStatusReason: p1?.inventoryStatusReason ?? null, items: p1?.items.length ?? 0, frozenContentHash: p1?.frozenContentHash ?? null, sourceContextState: p1?.sourceContextState ?? null, sourceIdentity: (p1 as unknown as { sourceIdentity?: unknown })?.sourceIdentity ?? null, partition: (p1 as unknown as { partition?: unknown })?.partition ?? null, rejectedUnverifiableItems: p1?.rejectedUnverifiableItems ?? null, rejectedDuplicateItems: p1?.rejectedDuplicateItems ?? null, sourceCoverage: p1?.sourceCoverage ?? null, unaccountedSource: (p1?.unaccountedSource ?? []).length, gapReinventory: p1?.gapReinventory ?? null },
        { passId: "pass-2", calls: p2Batch + p2Gap, batches: p2Batch, gapCalls: p2Gap, costUsd: +guard.costByPrefix("passA-2").toFixed(6), inventoryStatus: p2?.inventoryStatus ?? null, inventoryStatusReason: p2?.inventoryStatusReason ?? null, items: p2?.items.length ?? 0, frozenContentHash: p2?.frozenContentHash ?? null, sourceContextState: p2?.sourceContextState ?? null, sourceIdentity: (p2 as unknown as { sourceIdentity?: unknown })?.sourceIdentity ?? null, partition: (p2 as unknown as { partition?: unknown })?.partition ?? null, rejectedUnverifiableItems: p2?.rejectedUnverifiableItems ?? null, rejectedDuplicateItems: p2?.rejectedDuplicateItems ?? null, sourceCoverage: p2?.sourceCoverage ?? null, unaccountedSource: (p2?.unaccountedSource ?? []).length, gapReinventory: p2?.gapReinventory ?? null },
      ],
      passACostUsd: +passACost.toFixed(6), passAError, passACostBound: passABound,
      batchesPredictedPerPass: batchesPerPass,
    });
    writeJson(`${OUT}/26-clean-rerun-ensemble.json`, {
      artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §9 - dual-pass ensemble",
      at: new Date().toISOString(), ensembleBuilt: dual?.ensembleBuilt ?? false, ensembleRefusal: dual?.ensembleRefusal ?? null,
      authoritativeInventory: inv ? { inventoryStatus: inv.inventoryStatus, inventoryStatusReason: inv.inventoryStatusReason, canonicalItems: inv.items.length, frozenContentHash: inv.frozenContentHash, sourceContextState: inv.sourceContextState, rejectedUnverifiableItems: inv.rejectedUnverifiableItems, rejectedDuplicateItems: inv.rejectedDuplicateItems, provider: inv.provider, model: inv.model } : null,
      ensemble: ens, sourceCoverage: inv?.sourceCoverage ?? null,
      unaccountedSource: (inv?.unaccountedSource ?? []).length, uninventoriedValues: (inv?.uninventoriedValues ?? []).length,
    });
  };

  if (!passAOk) {
    writePassA(true, `§4 hard prerequisite not met: pass1=${p1?.inventoryStatus ?? "ABSENT"} pass2=${p2?.inventoryStatus ?? "ABSENT"} ensembleBuilt=${dual?.ensembleBuilt ?? false}`);
    const creditsAfterA = await gatewayCredits();
    writeJson(`${OUT}/24-clean-rerun-cost-ledger.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §7 - cost ledger", at: new Date().toISOString(), startedAt, capUsd: CAP_USD, paidCalls: guard.calls.length, spendUsd: +guard.spent.toFixed(6), stoppedBeforePassB: true, costBreakdown: { passAPass1Usd: +guard.costByPrefix("passA-1").toFixed(6), passAPass2Usd: +guard.costByPrefix("passA-2").toFixed(6), passBUsd: 0, conditionSuspicionUsd: 0, semanticReviewUsd: 0, otherUsd: 0, totalUsd: +guard.spent.toFixed(6) }, gatewayBalanceBefore: balanceBefore, gatewayBalanceAfter: creditsAfterA ? Number(creditsAfterA.balance) : null, guardRefusals: guard.refusals, calls: guard.calls, priorVoidSpendUsd: PRIOR_VOID_SPEND_USD, priorVoidSpendConsumesThisCap: false });
    console.log(`\n======= STOPPED BEFORE PASS B (§4). spent $${guard.spent.toFixed(4)} =======`);
    throw new PassAPrerequisiteError(passABound ? "PHASE3_601_COST_BOUND_DURING_RUN" : passAError ? "PHASE3_601_ENVIRONMENT_BLOCKED" : "PHASE3_601_ENVIRONMENT_BLOCKED");
  }
  writePassA(false, null);
  guard.passABatchesRemaining = 0; guard.passAGapRemaining = 0; // Pass A complete: decrement exactly once, no phantom work

  // Re-plan with the REAL inventory so the guard's Pass B remaining work is the real remaining work.
  const realPlan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: "doc-a", sourceContext: built.sourceContext, frozenInventory: inv!, structuralIndex: built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
  guard.passBTokensRemaining = realPlan.totals.estimatedInputTokens;
  console.log(`  real plan with fresh inventory: ${realPlan.shards.length} shards, ${realPlan.totals.estimatedInputTokens} planner tokens (preflight predicted ${prePlan.shards.length}/${prePlan.totals.estimatedInputTokens})`);

  // ---------------- §10/§11 production compile over the FRESH inventory
  const perShardTokens = realPlan.shards.map((s) => s.estimate.inputTokens);
  let shardIdx = 0;
  const semanticCaller = new RealSemanticCaller("vercel-ai-gateway", process.env.SEMANTIC_COMPILER_MODEL ?? model, guardedCompileClient(new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }), guard, () => { compileTurns++; }));
  const originalCompile = semanticCaller.compile.bind(semanticCaller);
  (semanticCaller as unknown as { compile: typeof originalCompile }).compile = async (inp) => {
    if (shardIdx < perShardTokens.length) guard.passBTokensRemaining = Math.max(0, guard.passBTokensRemaining - perShardTokens[shardIdx]!);
    shardIdx++;
    return originalCompile(inp);
  };
  const verifyCaller = new GuardedStageCaller(getStageCaller(), "verify-review", guard, () => { guard.verifierReviewRemaining = 0; });
  const suspicionCaller = new GuardedStageCaller(getStageCaller(), "verify-suspicion", guard, () => { guard.conditionSuspicionRemaining = Math.max(0, guard.conditionSuspicionRemaining - 1); });

  const compilerInput = built.input as SemanticCompilerInput;
  let compileResult: Awaited<ReturnType<typeof compileCovenantToIR>> | null = null;
  let compileError: string | null = null, boundDuringRun = false;
  const spentBeforeCompile = guard.spent;
  try {
    compileResult = await compileCovenantToIR(compilerInput, {
      caller: semanticCaller,
      inventoryMode: "DUAL_PASS_ENSEMBLE",
      inventoryPassCallers: [inv1, inv2],
      frozenInventory: inv!,   // the inventory THIS mission just produced; F-7C.1's resume gate validates it against the source context
      cache: new InMemorySemanticCompilationCache(),
      // §10: no priorShardResults, no shardExecutor override - every Pass B result is produced fresh here.
    });
  } catch (e) { compileError = e instanceof Error ? e.message : String(e); boundDuringRun = e instanceof BudgetExhaustedError; console.log(`  COMPILE ${boundDuringRun ? "COST-BOUND" : "THREW"}: ${compileError}`); }
  const compileCost = guard.spent - spentBeforeCompile;
  if (compileResult) console.log(`  -> compile ${compileResult.status} mode=${compileResult.execution?.mode} shards=${compileResult.execution?.plannedShards} rules=${compileResult.rules.length} defs=${compileResult.definitions.length} caps=${compileResult.sharedCapacities.length}`);

  // ---------------- §16 independent verifier on the untouched result
  let verifyResult: Awaited<ReturnType<typeof verifyCompiledCandidate>> | null = null;
  let verifyError: string | null = null;
  const spentBeforeVerify = guard.spent;
  if (compileResult && compileResult.status !== "FAILED") {
    const op = compileResult.sourceContext?.regions[0];
    const vIn: SemanticCompilerInput = op && op.text !== compilerInput.operativeSourceText
      ? { ...compilerInput, operativeSourceText: op.text, operativeCharStart: op.charStart, sourceContext: undefined, frozenInventory: undefined }
      : { ...compilerInput, sourceContext: undefined, frozenInventory: undefined };
    try { verifyResult = await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compileResult }, { reviewCaller: verifyCaller, conditionSuspicionCaller: suspicionCaller }); console.log(`  -> verify ${verifyResult.status} findings=${verifyResult.findings.length} reviewInvoked=${verifyResult.semanticReviewInvoked}`); }
    catch (e) { verifyError = e instanceof Error ? e.message : String(e); boundDuringRun = boundDuringRun || e instanceof BudgetExhaustedError; console.log(`  VERIFY THREW: ${verifyError}`); }
  }
  const verifyCost = guard.spent - spentBeforeVerify;
  const creditsAfter = await gatewayCredits();
  const balanceAfter = creditsAfter ? Number(creditsAfter.balance) : null;

  // ---------------- §17 freeze outputs BEFORE any human-reference scoring
  writeJson(`${CLEAN_RAW}/compile-result.json`, compileResult);
  writeJson(`${CLEAN_RAW}/verify-result.json`, verifyResult);
  writeJson(`${CLEAN_RAW}/frozen-inventory.json`, inv);

  writeJson(`${OUT}/24-clean-rerun-cost-ledger.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §7 - cost ledger", at: new Date().toISOString(), startedAt,
    capUsd: CAP_USD, paidCalls: guard.calls.length, spendUsd: +guard.spent.toFixed(6), stoppedBeforePassB: false, costBoundDuringRun: boundDuringRun,
    costBreakdown: { passAPass1Usd: +guard.costByPrefix("passA-1").toFixed(6), passAPass2Usd: +guard.costByPrefix("passA-2").toFixed(6), passBUsd: +guard.costByPrefix("compile:").toFixed(6), conditionSuspicionUsd: +guard.costByPrefix("verify-suspicion").toFixed(6), semanticReviewUsd: +guard.costByPrefix("verify-review").toFixed(6), providerRetriesUsd: 0, otherUsd: 0, totalUsd: +guard.spent.toFixed(6) },
    callCounts: { passA1: p1Batch + p1Gap, passA2: p2Batch + p2Gap, compileTurns, conditionSuspicion: guard.countByPrefix("verify-suspicion"), semanticReview: guard.countByPrefix("verify-review") },
    gatewayBalanceBefore: balanceBefore, gatewayBalanceAfter: balanceAfter,
    gatewayReportedSpendUsd: creditsBefore && creditsAfter ? +(Number(creditsBefore.balance) - Number(creditsAfter.balance)).toFixed(6) : null,
    guardRefusals: guard.refusals, guardStateLog: STATE, calls: guard.calls,
    priorVoidSpendUsd: PRIOR_VOID_SPEND_USD, priorVoidSpendConsumesThisCap: false,
    cumulativePhase3SpendThisSectionUsd: +(PRIOR_VOID_SPEND_USD + guard.spent).toFixed(6),
  });

  const ex = compileResult?.execution ?? null;
  writeJson(`${OUT}/27-clean-rerun-production-compile.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §10/§11/§15 - production compileCovenantToIR", at: new Date().toISOString(),
    entryPoint: "compileCovenantToIR", passBStartedOnlyAfterValidPassA: true, historicalInventoryReused: false, priorShardResultsReused: false, shardExecutorOverridden: false,
    status: compileResult?.status ?? null, failureReasons: compileResult?.failureReasons ?? null, errorDetail: compileResult?.errorDetail ?? null,
    compileError, costBoundDuringRun: boundDuringRun, costUsd: +compileCost.toFixed(6), execution: ex,
    planComparison: { preflightEmptyInventoryPlanHash: prePlan.planHash, preflightShards: prePlan.shards.length, realInventoryPlanHash: realPlan.planHash, realShards: realPlan.shards.length, productionPlanHash: ex?.planHash ?? null, productionShards: ex?.plannedShards ?? null, productionMatchesRealPlan: ex?.planHash === realPlan.planHash },
    output: compileResult ? { rules: compileResult.rules.length, definitions: compileResult.definitions.length, sharedCapacities: compileResult.sharedCapacities.length, irExtensionCandidates: compileResult.irExtensionCandidates.length } : null,
    sourceContext: compileResult?.sourceContext ? { state: compileResult.sourceContext.state, regions: compileResult.sourceContext.regions.length, totalChars: compileResult.sourceContext.totalChars, unresolvedReferences: compileResult.sourceContext.unresolvedReferences.length } : null,
    provider: compileResult?.provider ?? null, model: compileResult?.model ?? null, rawEvidence: `${CLEAN_RAW}/compile-result.json`,
  });

  const acc = compileResult?.accountability ?? null;
  writeJson(`${OUT}/28-clean-rerun-pass-c.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §14 - global Pass C", at: new Date().toISOString(),
    present: acc !== null, semanticallyComplete: acc?.semanticallyComplete ?? null, counts: acc?.counts ?? null,
    reasons: acc?.reasons ?? null, supportSummary: (acc as unknown as { support?: unknown })?.support ?? null, items: acc?.items ?? null,
  });

  writeJson(`${OUT}/29-clean-rerun-verifier.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE / 6.01 CLEAN RERUN §16 - independent verifier", at: new Date().toISOString(),
    ranOnUntouchedProductionOutput: true, routingForced: false,
    status: verifyResult?.status ?? null, verifyError, semanticReviewInvoked: verifyResult?.semanticReviewInvoked ?? null,
    conditionSuspicion: verifyResult?.conditionSuspicion ?? null, findings: verifyResult?.findings ?? null,
    findingCounts: verifyResult ? { total: verifyResult.findings.length, MATERIAL: verifyResult.findings.filter((f) => f.severity === "MATERIAL").length, UNCERTAIN: verifyResult.findings.filter((f) => f.severity === "UNCERTAIN").length, NON_MATERIAL: verifyResult.findings.filter((f) => f.severity === "NON_MATERIAL").length } : null,
    callCounts: { semanticReview: guard.countByPrefix("verify-review"), conditionSuspicion: guard.countByPrefix("verify-suspicion") },
    costUsd: +verifyCost.toFixed(6), rawEvidence: `${CLEAN_RAW}/verify-result.json`,
  });

  console.log(`\n======= DONE spent $${guard.spent.toFixed(4)} / cap $${CAP_USD} calls=${guard.calls.length} refusals=${guard.refusals.length} balanceAfter=${balanceAfter} =======`);
})().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
