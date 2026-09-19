/**
 * PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION - THE PAID RUN (mission §10, §13-§21).
 *
 * Resume-first and resume-ONLY: the exact persisted Pass-A ensemble of the valid final paid run is copied (byte-
 * verified) into this mission's own evidence directory and resumed through the certified HD-4 path. The live Pass-A
 * caller this run hands that path THROWS, so a fresh Pass A is not merely "not chosen" - it is impossible; any attempt
 * aborts the mission instead of spending. Pass B is production compileCovenantToIR over the corrected topology, each
 * terminal shard persisted durably; the verifier uses the same durable-call primitive. The cost guard is the single
 * certified implementation with Pass-A remaining work pinned at zero and this mission's own incremental cap.
 *
 * Restart: re-run the SAME command. Completed shards and verifier calls replay for $0; the mission-level cap is
 * charged the gateway-authoritative spend of every earlier launch before a single new call is admitted.
 *
 * Run: REVALIDATION_PAID_RUN_AUTHORIZED=1 PRE_REMEDIATION_WORKTREE=<worktree> npx tsx scripts/phase-3-601-revalidation-run.ts
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) { try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch { /* no key file */ } }
import Anthropic from "@anthropic-ai/sdk";
import { BudgetExhaustedError, GuardedStageCaller, guardedCompileClient, writeJsonDurable, type Guard } from "./phase-3-601-guard";
import { gatewayCredits, writeJson } from "./f7b-lib";
import { durableVerifierCallers, resumablePassA, verifierScope } from "./phase-3-601-hd4-resume";
import { DurableShardStore, durableShardExecutor, DurablePersistenceError, DurableReplayRecordInvalidError } from "./phase-3-601-durable-replay";
import { buildRealPlan, frozenObservedRates, identityChecks, loadFrozenInventoryCandidate, MISSION_ID, OLD_RAW, planShape, RAW, resumedCost, resumedGuard, resumeProof, sectionChecks, sha256 } from "./phase-3-601-revalidation-lib";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { RealSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { createBoundedShardExecutor } from "../lib/contract-model/compiler/semantic/shard-executor";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller, type StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { AI_GATEWAY_BASE_URL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { selectCompilationExecutionMode } from "../lib/contract-model/compiler/semantic/execution-mode";
import type { SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";

const SUMMARY = `${RAW}/summary`;
const STATE = `${RAW}/guard-state.ndjson`;
const DOC = "doc-a";
class StopError extends Error { constructor(public verdict: string, msg: string) { super(msg); this.name = "StopError"; } }
const log = (s: string) => { mkdirSync(RAW, { recursive: true }); appendFileSync(`${RAW}/run.log`, s + "\n"); console.log(s); };

void (async () => {
  if (process.env.REVALIDATION_PAID_RUN_AUTHORIZED !== "1") throw new Error("REFUSED: this is the paid Section 6.01 post-remediation revalidation; set REVALIDATION_PAID_RUN_AUTHORIZED=1 only inside an authorized paid mission");
  log(`======= PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION (mission ${MISSION_ID}, evidence ${RAW}) =======`);

  // ---------------- §1 identities must still hold at the moment of spend
  const id = identityChecks();
  const candidate = loadFrozenInventoryCandidate();
  const proof = resumeProof(candidate);
  const sec = sectionChecks(proof.built);
  const idOk = Object.values({ ...id, ...sec }).every((c) => c.match);
  if (!idOk) throw new StopError("PHASE3_601_ENVIRONMENT_BLOCKED", `identity checks failed at spend time: ${Object.entries({ ...id, ...sec }).filter(([, v]) => !v.match).map(([k]) => k).join(", ")}`);
  if (!candidate.allFactsMatch) throw new StopError("PHASE3_601_HARNESS_DEFECT", "persisted inventory facts differ from the expected historical facts");
  if (!proof.decision.ok) throw new StopError("PHASE3_601_REMEDIATION_REQUIRES_FRESH_PASS_A", proof.decision.failures.map((f) => `${f.check}: ${f.detail}`).join("; "));

  // ---------------- §10 the resume candidate becomes THIS mission's own durable Pass-A evidence (byte-verified copy)
  mkdirSync(RAW, { recursive: true });
  for (const f of ["frozen-inventory.json", "pass-a-passes.json"]) {
    if (!existsSync(`${RAW}/${f}`)) copyFileSync(`${OLD_RAW}/${f}`, `${RAW}/${f}`);
    const a = sha256(readFileSync(`${OLD_RAW}/${f}`)), b = sha256(readFileSync(`${RAW}/${f}`));
    if (a !== b) throw new StopError("PHASE3_601_HARNESS_DEFECT", `${f} copied into this mission's evidence does not match the source object (${a} != ${b})`);
  }

  // ---------------- mission-level cap across launches
  const creditsBefore = await gatewayCredits();
  const balanceNow = creditsBefore ? Number(creditsBefore.balance) : 0;
  const plan = buildRealPlan(proof);
  const shape = planShape(plan, proof.ctx.regions[0]!.text);
  if (shape.oldPathologicalPlanReappeared) throw new StopError("PHASE3_601_REMEDIATION_PLAN_REGRESSION", "the pre-remediation plan identity or an oversized shard reappeared");
  const rates = frozenObservedRates();
  const cost = resumedCost(plan, rates.rates);
  const CAP_USD = cost.capUsd;
  const missionStartPath = `${RAW}/mission-start.json`;
  const restart = existsSync(missionStartPath);
  if (!restart) writeJsonDurable(missionStartPath, { missionId: MISSION_ID, evidenceDir: RAW, startedAt: new Date().toISOString(), gatewayBalanceAtMissionStart: balanceNow, capUsd: CAP_USD, conservativeResumedEstimateUsd: cost.conservativeTotalUsd, planHash: plan.planHash });
  const missionStart = JSON.parse(readFileSync(missionStartPath, "utf8")) as { missionId: string; gatewayBalanceAtMissionStart: number; startedAt: string; capUsd: number; planHash: string };
  if (missionStart.missionId !== MISSION_ID) throw new StopError("PHASE3_601_HARNESS_DEFECT", `evidence dir belongs to mission ${missionStart.missionId}`);
  if (missionStart.planHash !== plan.planHash) throw new StopError("PHASE3_601_HARNESS_DEFECT", `this launch plans ${plan.planHash}, the mission started on ${missionStart.planHash}`);
  const balanceBefore = missionStart.gatewayBalanceAtMissionStart;
  const priorLaunchSpend = restart ? Math.max(0, +(balanceBefore - balanceNow).toFixed(6)) : 0;
  const launches = existsSync(`${RAW}/launches.ndjson`) ? readFileSync(`${RAW}/launches.ndjson`, "utf8").trim().split("\n").filter(Boolean).length : 0;
  appendFileSync(`${RAW}/launches.ndjson`, JSON.stringify({ launch: launches + 1, restart, at: new Date().toISOString(), pid: process.pid, gatewayBalanceNow: balanceNow, priorLaunchSpendUsd: priorLaunchSpend }) + "\n");

  const guard = resumedGuard(rates.rates, plan.totals.estimatedInputTokens, missionStart.capUsd, balanceBefore, STATE);
  guard.spent = priorLaunchSpend;
  const probe = getStageCaller();
  if (probe.isSynthetic) throw new StopError("PHASE3_601_ENVIRONMENT_BLOCKED", "no real credential");
  const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
  log(`  cap $${missionStart.capUsd}  conservative resumed estimate $${cost.conservativeTotalUsd}  mission-start balance $${balanceBefore}  balance now $${balanceNow}  launch #${launches + 1} restart=${restart} priorLaunchSpend=$${priorLaunchSpend}`);

  const startedAt = new Date().toISOString();
  const counts = { compileTurns: 0, shardsExecuted: 0, shardsReused: 0 };
  const ledger = (extra: Record<string, unknown>) => writeJson(`${SUMMARY}/ledger.json`, { artifact: "6.01 post-remediation revalidation - paid ledger", at: new Date().toISOString(), startedAt, missionStartedAt: missionStart.startedAt, missionId: MISSION_ID, launch: launches + 1, restart, priorLaunchSpendUsd: priorLaunchSpend, thisLaunchSpendUsd: +(guard.spent - priorLaunchSpend).toFixed(6), capUsd: missionStart.capUsd, conservativeResumedEstimateUsd: cost.conservativeTotalUsd, liveCalls: guard.liveCount(), replayedCalls: guard.replayCount(), logicalCalls: guard.calls.length, spendUsd: +guard.spent.toFixed(6), historicalReplayedUsd: +guard.historicalReplayedUsd.toFixed(6), costBreakdown: { passAUsd: 0, passBUsd: +guard.costByPrefix("compile:").toFixed(6), semanticReviewUsd: +guard.costByPrefix("verify-review").toFixed(6), conditionSuspicionUsd: +guard.costByPrefix("verify-suspicion").toFixed(6), totalUsd: +guard.spent.toFixed(6) }, callCounts: counts, newPassACalls: 0, gatewayBalanceBefore: balanceBefore, guardRefusals: guard.refusals, guardStateLog: STATE, calls: guard.calls, ...extra });
  const stop = async (verdict: string, msg: string) => { const c = await gatewayCredits(); ledger({ stoppedEarly: true, stopVerdict: verdict, stopReason: msg, gatewayBalanceAfter: c ? Number(c.balance) : null }); log(`\n======= STOPPED: ${verdict} - ${msg} (spent $${guard.spent.toFixed(4)}) =======`); throw new StopError(verdict, msg); };
  const classify = (e: unknown) => e instanceof BudgetExhaustedError ? "PHASE3_601_COST_BOUND_DURING_RUN" : e instanceof DurablePersistenceError ? "PHASE3_601_DURABLE_PERSISTENCE_FAILED" : e instanceof DurableReplayRecordInvalidError ? "PHASE3_601_REPLAY_RECORD_INVALID" : "PHASE3_601_ENVIRONMENT_BLOCKED";

  // ---------------- §10 Pass A: RESUMED ONLY. The live caller throws, so a fresh Pass A cannot happen.
  const refusingPassA: StageCaller = { providerName: probe.providerName, model: probe.model, isSynthetic: false, call: async () => { throw new Error("PHASE3_601_REMEDIATION_REQUIRES_FRESH_PASS_A: this mission refuses to run Pass A; the persisted ensemble was expected to resume"); }, lastTelemetry: () => null };
  let passA: Awaited<ReturnType<typeof resumablePassA>>;
  try { passA = await resumablePassA({ evidenceDir: RAW, missionId: MISSION_ID, candidateRef: proof.built.candidateRef, documentId: DOC, sourceContext: proof.ctx, structuralIndex: proof.built.chewy.index, liveCallerFor: () => refusingPassA }); }
  catch (e) { return stop("PHASE3_601_REMEDIATION_REQUIRES_FRESH_PASS_A", `Pass-A resume failed: ${e instanceof Error ? e.message : String(e)}`); }
  if (passA.source !== "RESUMED_FROM_ENSEMBLE_PERSISTENCE" || !passA.usable) return stop("PHASE3_601_REMEDIATION_REQUIRES_FRESH_PASS_A", `Pass A did not resume (source ${passA.source}, usable ${passA.usable})`);
  const RELOADED = passA.inventory;
  if (RELOADED.frozenContentHash !== candidate.inventory.frozenContentHash) return stop("PHASE3_601_HARNESS_DEFECT", "the reloaded inventory is not the persisted candidate");
  writeJson(`${SUMMARY}/pass-a.json`, { artifact: "6.01 post-remediation revalidation §10 - Pass A (RESUMED; zero new provider calls)", at: new Date().toISOString(), source: passA.source, usable: passA.usable, newProviderCalls: 0, resumedFrom: { mission: "phase-3-final-601-final-paid", path: `${OLD_RAW}/frozen-inventory.json`, copiedInto: `${RAW}/frozen-inventory.json`, fileSha256: candidate.fileSha256 }, authoritative: { inventoryStatus: RELOADED.inventoryStatus, canonicalItems: RELOADED.items.length, frozenContentHash: RELOADED.frozenContentHash, sourceContextState: RELOADED.sourceContextState, unaccountedSource: RELOADED.unaccountedSource.length, uninventoriedValues: RELOADED.uninventoriedValues.length, ensemble: RELOADED.ensemble ?? null }, passes: passA.passes.map((p) => ({ passId: p.passId, inventoryStatus: p.inventory.inventoryStatus, items: p.inventory.items.length })), paths: passA.paths });
  log(`  Pass A ${passA.source}: ${RELOADED.items.length} items, hash ${RELOADED.frozenContentHash.slice(0, 16)}..., 0 new provider calls`);

  // ---------------- §5 resume proof on the RELOADED object against the freshly resolved context
  writeJson(`${SUMMARY}/resume-proof.json`, { artifact: "6.01 post-remediation revalidation §5 - source-bound resume proof on the RELOADED inventory", at: new Date().toISOString(), freshSourceContext: { state: proof.ctx.state, hash: proof.currentSourceContextHash, regions: proof.ctx.regions.length }, decision: { ok: true, record: proof.decision.ok ? proof.decision.record : null }, partitionHash: { recorded: proof.recordedPartitionHash, current: proof.currentPartitionHash, match: proof.recordedPartitionHash === proof.currentPartitionHash } });

  // ---------------- §8/§9 plan + durable store; only THIS mission's own records can be reused
  const shardStore = new DurableShardStore(`${RAW}/durable-shards`);
  const { prior, rejected } = shardStore.loadPriorResults(plan, MISSION_ID);
  const oldStoreAttempt = new DurableShardStore(`${OLD_RAW}/durable-shards`).loadPriorResults(plan, MISSION_ID);
  const priorTokens = plan.shards.filter((s) => prior.has(s.shardHash)).reduce((a, s) => a + s.estimate.inputTokens, 0);
  guard.passBTokensRemaining = Math.max(0, plan.totals.estimatedInputTokens - priorTokens);
  const mode = selectCompilationExecutionMode(plan);
  const recheck = guard.wouldAdmit();
  writeJson(`${SUMMARY}/plan.json`, { artifact: "6.01 post-remediation revalidation §13 - real plan, durable shard store, affordability", at: new Date().toISOString(), mode: mode.mode, reason: mode.reason, planHash: plan.planHash, shards: plan.shards.length, oversizedShards: plan.totals.oversizedShards, plannerEstimatedInputTokens: plan.totals.estimatedInputTokens, shape, priorShardsFromStore: prior.size, priorShardTokensExcludedFromPaidWork: priorTokens, rejectedStoreRecords: rejected, oldPaidRunStore: { accepted: oldStoreAttempt.prior.size, rejected: oldStoreAttempt.rejected }, guardState: guard.state(), recheck, fits: recheck.admitted });
  if (!recheck.admitted) return stop("PHASE3_601_COST_BOUND_BEFORE_START", `conservative remaining $${recheck.conservativeRemaining.toFixed(4)} exceeds cap remaining $${recheck.capRemaining.toFixed(4)} or balance`);
  log(`  plan: ${mode.mode} ${plan.shards.length} shards (${plan.totals.oversizedShards} oversized), ${prior.size} already in this mission's store; paid remaining $${recheck.conservativeRemaining.toFixed(4)} of $${recheck.capRemaining.toFixed(4)}`);

  // Zero-cost rehearsal of everything above (identities, byte-verified resume copy, certified Pass-A resume, durable
  // store, guard admission) so the first paid call is only ever made from a state already proven good.
  if (process.env.REVALIDATION_DRY_RUN === "1") { log(`\n======= DRY RUN COMPLETE - every pre-spend step passed; 0 paid calls. Unset REVALIDATION_DRY_RUN to execute. =======`); return; }

  // ---------------- §14 Pass B: production compileCovenantToIR, durable per shard
  const throwingPassA: StageCaller = { providerName: probe.providerName, model: probe.model, isSynthetic: false, call: async () => { throw new Error("PHASE3_601_IMPLEMENTATION_DEFECT: production attempted to rerun Pass A despite a validated frozenInventory"); }, lastTelemetry: () => null };
  const semanticCaller = new RealSemanticCaller("vercel-ai-gateway", process.env.SEMANTIC_COMPILER_MODEL ?? model, guardedCompileClient(new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }), guard, () => { counts.compileTurns++; }));
  const region0 = proof.ctx.regions[0]!;
  const baseInput: SemanticCompilerInput = { ...(proof.built.input as SemanticCompilerInput), operativeSourceText: region0.text, operativeCharStart: region0.charStart >= 0 ? region0.charStart : proof.built.input.operativeCharStart, sourceContext: proof.ctx, frozenInventory: proof.decision.ok ? proof.decision.inventory : RELOADED };
  const production = createBoundedShardExecutor({ baseInput, plan, caller: semanticCaller });
  const persistedShards: { shardId: string; shardHash: string; status: string; at: string }[] = [];
  const executor = durableShardExecutor(async (shard, attempt) => { guard.passBTokensRemaining = Math.max(0, guard.passBTokensRemaining - shard.estimate.inputTokens); counts.shardsExecuted++; return production(shard, attempt); }, shardStore, plan, MISSION_ID, (rec) => { persistedShards.push({ shardId: rec.shardId, shardHash: rec.shardHash, status: rec.result.status, at: rec.completedAt }); log(`  [shard ${rec.shardId}] ${rec.result.status} persisted durably`); });
  let compileResult: Awaited<ReturnType<typeof compileCovenantToIR>> | null = null; let compileError: string | null = null;
  const spentBeforeCompile = guard.spent;
  try { compileResult = await compileCovenantToIR(proof.built.input as SemanticCompilerInput, { caller: semanticCaller, inventoryMode: "DUAL_PASS_ENSEMBLE", inventoryPassCallers: [throwingPassA, throwingPassA], frozenInventory: RELOADED, cache: new InMemorySemanticCompilationCache(), shardExecutor: executor, priorShardResults: prior }); }
  catch (e) { compileError = e instanceof Error ? e.message : String(e); log(`  COMPILE THREW: ${compileError}`); if (e instanceof BudgetExhaustedError || e instanceof DurablePersistenceError) return stop(classify(e), compileError); }
  const ex = compileResult?.execution ?? null;
  counts.shardsReused = ex?.sharded?.reused ?? 0;
  if (compileResult) writeJsonDurable(`${RAW}/compile-result.json`, compileResult);
  writeJson(`${SUMMARY}/compile.json`, { artifact: "6.01 post-remediation revalidation §14/§15 - production compileCovenantToIR", at: new Date().toISOString(), entryPoint: "compileCovenantToIR", frozenInventorySource: "RESUMED_PERSISTED_ENSEMBLE", priorShardResultsSupplied: prior.size, status: compileResult?.status ?? null, failureReasons: compileResult?.failureReasons ?? null, compileError, costUsd: +(guard.spent - spentBeforeCompile).toFixed(6), execution: ex, planComparison: { harnessPlanHash: plan.planHash, productionPlanHash: ex?.planHash ?? null, identical: ex?.planHash === plan.planHash }, persistedShards, output: compileResult ? { rules: compileResult.rules.length, definitions: compileResult.definitions.length, sharedCapacities: compileResult.sharedCapacities.length } : null, passC: compileResult?.accountability ? { semanticallyComplete: compileResult.accountability.semanticallyComplete, counts: compileResult.accountability.counts } : null });
  log(`  compile ${compileResult?.status ?? "n/a"} executed=${ex?.sharded?.executed ?? 0} reused=${ex?.sharded?.reused ?? 0} statuses=${JSON.stringify(ex?.sharded?.statusCounts ?? {})}`);

  // ---------------- §20 independent verifier on untouched production output
  let verifyResult: Awaited<ReturnType<typeof verifyCompiledCandidate>> | null = null; let verifyError: string | null = null;
  const spentBeforeVerify = guard.spent;
  if (compileResult && compileResult.status !== "FAILED") {
    const reviewLive = new GuardedStageCaller(getStageCaller(), "verify-review", guard, () => { guard.verifierReviewRemaining = 0; });
    const suspicionLive = new GuardedStageCaller(getStageCaller(), "verify-suspicion", guard, () => { guard.conditionSuspicionRemaining = Math.max(0, guard.conditionSuspicionRemaining - 1); });
    const v = durableVerifierCallers(RAW, verifierScope(MISSION_ID, proof.built.candidateRef, DOC, proof.ctx), { review: reviewLive, suspicion: suspicionLive }, {
      review: { onReplay: (e) => { guard.verifierReviewRemaining = 0; guard.recordReplay(`verify-review:${e.stage}`, reviewLive.model, e.originalCostUsd); } },
      suspicion: { onReplay: (e) => { guard.conditionSuspicionRemaining = Math.max(0, guard.conditionSuspicionRemaining - 1); guard.recordReplay(`verify-suspicion:${e.stage}`, suspicionLive.model, e.originalCostUsd); } } });
    const compilerInput = proof.built.input as SemanticCompilerInput;
    const vIn: SemanticCompilerInput = region0.text !== compilerInput.operativeSourceText ? { ...compilerInput, operativeSourceText: region0.text, operativeCharStart: region0.charStart, sourceContext: undefined, frozenInventory: undefined } : { ...compilerInput, sourceContext: undefined, frozenInventory: undefined };
    try { verifyResult = await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compileResult }, { reviewCaller: v.review, conditionSuspicionCaller: v.suspicion }); }
    catch (e) { verifyError = e instanceof Error ? e.message : String(e); if (e instanceof BudgetExhaustedError || e instanceof DurablePersistenceError) return stop(classify(e), verifyError); }
    writeJsonDurable(`${RAW}/verify-result.json`, verifyResult);
    writeJson(`${SUMMARY}/verifier.json`, { artifact: "6.01 post-remediation revalidation §20 - independent verifier", at: new Date().toISOString(), status: verifyResult?.status ?? null, verifyError, semanticReviewInvoked: verifyResult?.semanticReviewInvoked ?? null, findings: verifyResult?.findings ?? null, accounting: { review: v.review.summary(), suspicion: v.suspicion.summary() }, costUsd: +(guard.spent - spentBeforeVerify).toFixed(6) });
    log(`  verifier ${verifyResult?.status ?? "n/a"} findings=${verifyResult?.findings?.length ?? 0}`);
  }
  const creditsAfter = await gatewayCredits();
  ledger({ stoppedEarly: false, gatewayBalanceAfter: creditsAfter ? Number(creditsAfter.balance) : null, gatewayReportedSpendUsd: creditsBefore && creditsAfter ? +(Number(creditsBefore.balance) - Number(creditsAfter.balance)).toFixed(6) : null });
  log(`\n======= DONE spent $${guard.spent.toFixed(4)} / cap $${missionStart.capUsd} live=${guard.liveCount()} replayed=${guard.replayCount()} newPassACalls=0 =======`);
})().catch((e) => { if (e instanceof StopError) { console.error(`STOP ${e.verdict}: ${e.message}`); process.exit(0); } console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
