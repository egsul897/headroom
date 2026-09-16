/**
 * PHASE 3 FINAL-BRIDGE / 6.01 - THE HD-4-HARDENED, RESTART-SAFE PAID RUN (for the NEXT paid mission; NOT executed
 * by the HD-4 certification mission, which is zero-cost). Refuses to start unless HD4_PAID_RUN_AUTHORIZED=1.
 *
 * Every layer is the ONE implementation certified at zero cost:
 *   Pass A   : resumablePassA (durable per-call replay -> production dual pass -> HD-3 ensemble persistence)
 *   Pass B   : production createBoundedShardExecutor wrapped by durableShardExecutor; priorShardResults loaded from
 *              the durable shard store on restart (F-7C reuse contract, exact shardHash)
 *   Verifier : durableVerifierCallers (same durable-call primitive)
 * Cost guard: GuardedStageCaller prices LIVE calls; durable replays decrement remaining logical work and charge $0
 * (Guard.recordReplay); for Pass B the planner tokens of shards served from the store are removed from the paid
 * remaining work before admission. Run: HD4_PAID_RUN_AUTHORIZED=1 npx tsx scripts/phase-3-601-hd4-run.ts
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) { try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch { /* no key file */ } }
import Anthropic from "@anthropic-ai/sdk";
import { CAP_USD, PRIOR, buildPlanContext, newGuard } from "./phase-3-601-final-certify";
import { BudgetExhaustedError, GuardedStageCaller, guardedCompileClient, writeJsonDurable, type Guard } from "./phase-3-601-guard";
import { gatewayCredits, writeJson } from "./f7b-lib";
import { resumablePassA, durableVerifierCallers, verifierScope } from "./phase-3-601-hd4-resume";
import { DurableShardStore, durableShardExecutor, DurablePersistenceError, DurableReplayRecordInvalidError, type DurableCallLogEntry } from "./phase-3-601-durable-replay";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { computeSourceContextHash } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { validateFrozenInventoryResume } from "../lib/contract-model/compiler/semantic/frozen-inventory-resume";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { RealSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { createBoundedShardExecutor } from "../lib/contract-model/compiler/semantic/shard-executor";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller, type StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { AI_GATEWAY_BASE_URL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { selectCompilationExecutionMode } from "../lib/contract-model/compiler/semantic/execution-mode";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";

export const HD4_MISSION_ID = process.env.HD4_MISSION_ID ?? "phase-3-final-601-hd4-run";
export const HD4_RAW = process.env.HD4_RUN_EVIDENCE_DIR ?? "tests/fixtures/unseen-packages/phase-3-final-601-hd4-run";
const SUMMARY = `${HD4_RAW}/summary`;
const STATE = `${HD4_RAW}/guard-state.ndjson`;
const DOC = "doc-a";
class StopError extends Error { constructor(public verdict: string, msg: string) { super(msg); this.name = "StopError"; } }

/** Guard wiring for a durable caller: the LIVE path is a GuardedStageCaller (admission + ledger); a REPLAY decrements the same counter and charges $0. */
function passAWiring(guard: Guard, label: string, counts: { batch: number; gap: number; replayBatch: number; replayGap: number }) {
  const dec = (stage: string, replay: boolean) => { if (stage.endsWith("_gap")) { guard.passAGapRemaining = Math.max(0, guard.passAGapRemaining - 1); if (replay) counts.replayGap++; else counts.gap++; } else { guard.passABatchesRemaining = Math.max(0, guard.passABatchesRemaining - 1); if (replay) counts.replayBatch++; else counts.batch++; } };
  const live = new GuardedStageCaller(getStageCaller(), label, guard, (s) => dec(s, false));
  const hooks = { onReplay: (e: DurableCallLogEntry) => { dec(e.stage, true); guard.recordReplay(`${label}:${e.stage}`, live.model, e.originalCostUsd); } };
  return { live, hooks };
}

void (async () => {
  if (process.env.HD4_PAID_RUN_AUTHORIZED !== "1") throw new Error("REFUSED: this is the paid Section 6.01 run; set HD4_PAID_RUN_AUTHORIZED=1 only inside an authorized paid mission");
  console.log(`======= PHASE 3 FINAL-BRIDGE / 6.01 HD-4 RESTART-SAFE RUN (mission ${HD4_MISSION_ID}, evidence ${HD4_RAW}) =======`);
  const { built, prePlan, batchesPerPass, rates } = buildPlanContext();
  const creditsBefore = await gatewayCredits();
  const balanceNow = creditsBefore ? Number(creditsBefore.balance) : 0;
  // MISSION-LEVEL cap across launches: the FIRST launch pins the mission's starting balance; every later launch of the
  // same mission charges (startBalance - balanceNow) - the gateway-authoritative spend so far, including any in-flight
  // call the provider billed after a kill - against the SAME $15.84 cap before it makes a single new call.
  const missionStartPath = `${HD4_RAW}/mission-start.json`;
  const restart = existsSync(missionStartPath);
  if (!restart) writeJsonDurable(missionStartPath, { missionId: HD4_MISSION_ID, evidenceDir: HD4_RAW, startedAt: new Date().toISOString(), gatewayBalanceAtMissionStart: balanceNow, capUsd: CAP_USD });
  const missionStart = JSON.parse(readFileSync(missionStartPath, "utf8")) as { missionId: string; gatewayBalanceAtMissionStart: number; startedAt: string };
  if (missionStart.missionId !== HD4_MISSION_ID) throw new Error(`FATAL: evidence dir belongs to mission ${missionStart.missionId}, not ${HD4_MISSION_ID}`);
  const balanceBefore = missionStart.gatewayBalanceAtMissionStart;
  const priorLaunchSpend = restart ? Math.max(0, +(balanceBefore - balanceNow).toFixed(6)) : 0;
  const launches = existsSync(`${HD4_RAW}/launches.ndjson`) ? readFileSync(`${HD4_RAW}/launches.ndjson`, "utf8").trim().split("\n").filter(Boolean).length : 0;
  appendFileSync(`${HD4_RAW}/launches.ndjson`, JSON.stringify({ launch: launches + 1, restart, at: new Date().toISOString(), pid: process.pid, gatewayBalanceNow: balanceNow, priorLaunchSpendUsd: priorLaunchSpend }) + "\n");
  const guard = newGuard(rates, batchesPerPass, prePlan.totals.estimatedInputTokens, balanceBefore, STATE);
  guard.spent = priorLaunchSpend; // charged against the mission cap; the durable replays then decrement the remaining work for $0
  const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
  const probe = getStageCaller(); if (probe.isSynthetic) throw new Error("FATAL: no real credential");
  console.log(`  models: inventory=${probe.model}  cap $${CAP_USD}  mission-start balance $${balanceBefore}  balance now $${balanceNow}  launch #${launches + 1} restart=${restart} priorLaunchSpend=$${priorLaunchSpend}`);
  const startedAt = new Date().toISOString();
  const counts = { p1: { batch: 0, gap: 0, replayBatch: 0, replayGap: 0 }, p2: { batch: 0, gap: 0, replayBatch: 0, replayGap: 0 }, compileTurns: 0, shardsExecuted: 0, shardsReused: 0 };
  const ledger = (extra: Record<string, unknown>) => writeJson(`${SUMMARY}/ledger.json`, { artifact: "HD-4 restart-safe run - paid ledger", at: new Date().toISOString(), startedAt, missionStartedAt: missionStart.startedAt, launch: launches + 1, restart, priorLaunchSpendUsd: priorLaunchSpend, thisLaunchSpendUsd: +(guard.spent - priorLaunchSpend).toFixed(6), missionId: HD4_MISSION_ID, capUsd: CAP_USD, liveCalls: guard.liveCount(), replayedCalls: guard.replayCount(), logicalCalls: guard.calls.length, spendUsd: +guard.spent.toFixed(6), historicalReplayedUsd: +guard.historicalReplayedUsd.toFixed(6), costBreakdown: { passAPass1Usd: +guard.costByPrefix("passA-1").toFixed(6), passAPass2Usd: +guard.costByPrefix("passA-2").toFixed(6), passBUsd: +guard.costByPrefix("compile:").toFixed(6), conditionSuspicionUsd: +guard.costByPrefix("verify-suspicion").toFixed(6), semanticReviewUsd: +guard.costByPrefix("verify-review").toFixed(6), totalUsd: +guard.spent.toFixed(6) }, callCounts: counts, gatewayBalanceBefore: balanceBefore, guardRefusals: guard.refusals, guardStateLog: STATE, calls: guard.calls, priorSpend: PRIOR, ...extra });
  const stop = async (verdict: string, msg: string) => { const c = await gatewayCredits(); ledger({ stoppedEarly: true, stopVerdict: verdict, stopReason: msg, gatewayBalanceAfter: c ? Number(c.balance) : null }); console.log(`\n======= STOPPED: ${verdict} - ${msg} (spent $${guard.spent.toFixed(4)}) =======`); throw new StopError(verdict, msg); };
  const classify = (e: unknown) => e instanceof BudgetExhaustedError ? "PHASE3_601_COST_BOUND_DURING_RUN" : e instanceof DurablePersistenceError ? "PHASE3_601_DURABLE_PERSISTENCE_FAILED" : e instanceof DurableReplayRecordInvalidError ? "PHASE3_601_REPLAY_RECORD_INVALID" : "PHASE3_601_ENVIRONMENT_BLOCKED";

  // ---------------- Pass A: durable per-call replay -> production dual pass -> HD-3 ensemble persistence (one implementation)
  let passA: Awaited<ReturnType<typeof resumablePassA>>;
  const wiring = new Map<string, ReturnType<typeof passAWiring>>();
  const wiringFor = (passId: string) => { let w = wiring.get(passId); if (!w) { w = passAWiring(guard, passId === "pass-1" ? "passA-1" : "passA-2", passId === "pass-1" ? counts.p1 : counts.p2); wiring.set(passId, w); } return w; };
  try {
    passA = await resumablePassA({ evidenceDir: HD4_RAW, missionId: HD4_MISSION_ID, candidateRef: built.candidateRef, documentId: DOC, sourceContext: built.sourceContext, structuralIndex: built.chewy.index,
      liveCallerFor: (passId) => wiringFor(passId).live, hooksFor: (passId) => wiringFor(passId).hooks });
  } catch (e) { return stop(classify(e), `Pass A threw: ${e instanceof Error ? e.message : String(e)}`); }
  const RELOADED = passA.inventory;
  guard.passABatchesRemaining = 0; guard.passAGapRemaining = 0;
  writeJson(`${SUMMARY}/pass-a.json`, { artifact: "HD-4 restart-safe run - Pass A", at: new Date().toISOString(), source: passA.source, usable: passA.usable, accounting: passA.execution?.accounting ?? { note: "resumed from the persisted ensemble - no Pass-A caller constructed" }, passes: passA.passes.map((p) => ({ passId: p.passId, inventoryStatus: p.inventory.inventoryStatus, items: p.inventory.items.length, frozenContentHash: p.inventory.frozenContentHash, partition: p.inventory.partition ?? null, telemetryCostUsd: p.inventory.telemetryCostUsd })), authoritative: { inventoryStatus: RELOADED.inventoryStatus, canonicalItems: RELOADED.items.length, frozenContentHash: RELOADED.frozenContentHash, sourceContextState: RELOADED.sourceContextState, unaccountedSource: RELOADED.unaccountedSource.length, uninventoriedValues: RELOADED.uninventoriedValues.length, ensemble: RELOADED.ensemble ?? null }, persistence: passA.proofs ? { inventory: { ...passA.proofs.inventory, reloaded: undefined }, passes: { ...passA.proofs.passes, reloaded: undefined } } : "pre-existing", paths: passA.paths });
  if (!passA.usable) return stop("PHASE3_601_ENVIRONMENT_BLOCKED", `§4 prerequisite not met: ${passA.passes.map((p) => `${p.passId} ${p.inventory.inventoryStatus}`).join(", ")}`);
  console.log(`  Pass A ${passA.source}: ${RELOADED.items.length} items, hash ${RELOADED.frozenContentHash.slice(0, 16)}..., live ${passA.execution?.accounting.total.liveCalls ?? 0} / replayed ${passA.execution?.accounting.total.replayedCalls ?? 0}`);

  // ---------------- F-7C.1 resume proof on the RELOADED inventory against a FRESHLY resolved context
  const idx = built.chewy.index as unknown as { getDocumentText: (d: string) => string | undefined };
  const freshCtx = resolveSourceContext({ index: built.chewy.index, documentId: DOC, operativeSourceText: built.input.operativeSourceText, anchorNodeId: built.input.contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: built.input.operativeCharStart ?? null, documentText: idx.getDocumentText(DOC) ?? null });
  const decision = validateFrozenInventoryResume({ candidateRef: built.candidateRef, sourceDocumentId: DOC, frozenInventory: RELOADED, sourceContext: freshCtx, structuralIndex: built.chewy.index });
  writeJson(`${SUMMARY}/resume-proof.json`, { artifact: "HD-4 restart-safe run - F-7C.1 resume proof on the RELOADED inventory", at: new Date().toISOString(), freshSourceContext: { state: freshCtx.state, hash: computeSourceContextHash(freshCtx), regions: freshCtx.regions.length }, decision: decision.ok ? { ok: true, record: decision.record } : { ok: false, failures: decision.failures } });
  if (!decision.ok) return stop("PHASE3_601_FRESH_INVENTORY_NOT_RESUMABLE", decision.failures.map((f) => `${f.check}: ${f.detail}`).join("; "));

  // ---------------- real plan; Pass B durable store; paid remaining work = shards NOT already in the store
  const realPlan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: DOC, sourceContext: freshCtx, frozenInventory: decision.inventory, structuralIndex: built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
  const realMode = selectCompilationExecutionMode(realPlan);
  const shardStore = new DurableShardStore(`${HD4_RAW}/durable-shards`);
  const { prior, rejected } = shardStore.loadPriorResults(realPlan, HD4_MISSION_ID);
  const priorTokens = realPlan.shards.filter((s) => prior.has(s.shardHash)).reduce((a, s) => a + s.estimate.inputTokens, 0);
  guard.passBTokensRemaining = Math.max(0, realPlan.totals.estimatedInputTokens - priorTokens);
  const recheck = guard.wouldAdmit();
  writeJson(`${SUMMARY}/plan.json`, { artifact: "HD-4 restart-safe run - real plan, durable shard store, affordability recheck", at: new Date().toISOString(), mode: realMode.mode, reason: realMode.reason, planHash: realPlan.planHash, shards: realPlan.shards.length, plannerEstimatedInputTokens: realPlan.totals.estimatedInputTokens, priorShardsFromStore: prior.size, priorShardTokensExcludedFromPaidWork: priorTokens, rejectedStoreRecords: rejected, passBDurability: realMode.mode === "SHARDED" ? "PER_SHARD_DURABLE_ON_PRIOR_SHARD_RESULTS_CONTRACT" : "NOT_APPLICABLE_MONOLITHIC (a monolithic compile is one bounded conversation; it is persisted only on return)", shardTable: realPlan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, ownedItems: s.ownedItemIds.length, estimatedInputTokens: s.estimate.inputTokens, inStore: prior.has(s.shardHash) })), guardState: guard.state(), recheck, fits: recheck.admitted });
  if (!recheck.admitted) return stop("PHASE3_601_COST_BOUND_BEFORE_PASS_B", `conservative remaining $${recheck.conservativeRemaining.toFixed(4)} exceeds cap remaining $${recheck.capRemaining.toFixed(4)} or balance`);
  console.log(`  plan: ${realMode.mode} ${realPlan.shards.length} shards, ${prior.size} in store; paid remaining $${recheck.conservativeRemaining.toFixed(4)} of $${recheck.capRemaining.toFixed(4)}`);

  // ---------------- Pass B: production executor, durable per-shard, prior results by exact hash
  const throwingPassA: StageCaller = { providerName: probe.providerName, model: probe.model, isSynthetic: false, call: async () => { throw new Error("PHASE3_601_IMPLEMENTATION_DEFECT: production attempted to rerun Pass A despite a validated frozenInventory"); }, lastTelemetry: () => null };
  const semanticCaller = new RealSemanticCaller("vercel-ai-gateway", process.env.SEMANTIC_COMPILER_MODEL ?? model, guardedCompileClient(new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }), guard, () => { counts.compileTurns++; }));
  // compile.ts builds callerInput = { ...input, operativeSourceText: region0.text, operativeCharStart, sourceContext, frozenInventory: decision.inventory }; the same fields, from the same resolved facts.
  const region0 = freshCtx.regions[0]!;
  const baseInput: SemanticCompilerInput = { ...(built.input as SemanticCompilerInput), operativeSourceText: region0.text, operativeCharStart: region0.charStart >= 0 ? region0.charStart : built.input.operativeCharStart, sourceContext: freshCtx, frozenInventory: decision.inventory };
  const production = createBoundedShardExecutor({ baseInput, plan: realPlan, caller: semanticCaller });
  const persistedShards: { shardId: string; shardHash: string; status: string; at: string }[] = [];
  const executor = durableShardExecutor(async (shard, attempt) => { guard.passBTokensRemaining = Math.max(0, guard.passBTokensRemaining - shard.estimate.inputTokens); counts.shardsExecuted++; return production(shard, attempt); }, shardStore, realPlan, HD4_MISSION_ID, (rec) => { persistedShards.push({ shardId: rec.shardId, shardHash: rec.shardHash, status: rec.result.status, at: rec.completedAt }); console.log(`  [shard ${rec.shardId}] ${rec.result.status} persisted durably`); });
  let compileResult: Awaited<ReturnType<typeof compileCovenantToIR>> | null = null; let compileError: string | null = null;
  const spentBeforeCompile = guard.spent;
  try { compileResult = await compileCovenantToIR(built.input as SemanticCompilerInput, { caller: semanticCaller, inventoryMode: "DUAL_PASS_ENSEMBLE", inventoryPassCallers: [throwingPassA, throwingPassA], frozenInventory: RELOADED, cache: new InMemorySemanticCompilationCache(), shardExecutor: executor, priorShardResults: prior }); }
  catch (e) { compileError = e instanceof Error ? e.message : String(e); console.log(`  COMPILE THREW: ${compileError}`); if (e instanceof BudgetExhaustedError || e instanceof DurablePersistenceError) return stop(classify(e), compileError); }
  const ex = compileResult?.execution ?? null;
  counts.shardsReused = ex?.sharded?.reused ?? 0;
  if (compileResult) writeJsonDurable(`${HD4_RAW}/compile-result.json`, compileResult);
  writeJson(`${SUMMARY}/compile.json`, { artifact: "HD-4 restart-safe run - production compileCovenantToIR", at: new Date().toISOString(), entryPoint: "compileCovenantToIR", frozenInventorySource: "RELOADED", shardExecutor: "production createBoundedShardExecutor wrapped by durableShardExecutor (identical semantics; persists terminal outcomes)", priorShardResultsSupplied: prior.size, status: compileResult?.status ?? null, failureReasons: compileResult?.failureReasons ?? null, compileError, costUsd: +(guard.spent - spentBeforeCompile).toFixed(6), execution: ex, planComparison: { harnessPlanHash: realPlan.planHash, productionPlanHash: ex?.planHash ?? null, identical: ex?.planHash === realPlan.planHash }, persistedShards, output: compileResult ? { rules: compileResult.rules.length, definitions: compileResult.definitions.length, sharedCapacities: compileResult.sharedCapacities.length } : null, passC: compileResult?.accountability ? { semanticallyComplete: compileResult.accountability.semanticallyComplete, counts: compileResult.accountability.counts } : null });
  console.log(`  compile ${compileResult?.status ?? "n/a"} executed=${ex?.sharded?.executed ?? 0} reused=${ex?.sharded?.reused ?? 0}`);

  // ---------------- Verifier: the same durable-call primitive
  let verifyResult: Awaited<ReturnType<typeof verifyCompiledCandidate>> | null = null; let verifyError: string | null = null;
  const spentBeforeVerify = guard.spent;
  if (compileResult && compileResult.status !== "FAILED") {
    const reviewLive = new GuardedStageCaller(getStageCaller(), "verify-review", guard, () => { guard.verifierReviewRemaining = 0; });
    const suspicionLive = new GuardedStageCaller(getStageCaller(), "verify-suspicion", guard, () => { guard.conditionSuspicionRemaining = Math.max(0, guard.conditionSuspicionRemaining - 1); });
    const v = durableVerifierCallers(HD4_RAW, verifierScope(HD4_MISSION_ID, built.candidateRef, DOC, freshCtx), { review: reviewLive, suspicion: suspicionLive }, {
      review: { onReplay: (e) => { guard.verifierReviewRemaining = 0; guard.recordReplay(`verify-review:${e.stage}`, reviewLive.model, e.originalCostUsd); } },
      suspicion: { onReplay: (e) => { guard.conditionSuspicionRemaining = Math.max(0, guard.conditionSuspicionRemaining - 1); guard.recordReplay(`verify-suspicion:${e.stage}`, suspicionLive.model, e.originalCostUsd); } } });
    const compilerInput = built.input as SemanticCompilerInput;
    const vIn: SemanticCompilerInput = region0.text !== compilerInput.operativeSourceText ? { ...compilerInput, operativeSourceText: region0.text, operativeCharStart: region0.charStart, sourceContext: undefined, frozenInventory: undefined } : { ...compilerInput, sourceContext: undefined, frozenInventory: undefined };
    try { verifyResult = await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compileResult }, { reviewCaller: v.review, conditionSuspicionCaller: v.suspicion }); }
    catch (e) { verifyError = e instanceof Error ? e.message : String(e); if (e instanceof BudgetExhaustedError || e instanceof DurablePersistenceError) return stop(classify(e), verifyError); }
    writeJsonDurable(`${HD4_RAW}/verify-result.json`, verifyResult);
    writeJson(`${SUMMARY}/verifier.json`, { artifact: "HD-4 restart-safe run - independent verifier", at: new Date().toISOString(), status: verifyResult?.status ?? null, verifyError, semanticReviewInvoked: verifyResult?.semanticReviewInvoked ?? null, findings: verifyResult?.findings ?? null, accounting: { review: v.review.summary(), suspicion: v.suspicion.summary() }, costUsd: +(guard.spent - spentBeforeVerify).toFixed(6) });
  }
  const creditsAfter = await gatewayCredits();
  ledger({ stoppedEarly: false, gatewayBalanceAfter: creditsAfter ? Number(creditsAfter.balance) : null, gatewayReportedSpendUsd: creditsBefore && creditsAfter ? +(Number(creditsBefore.balance) - Number(creditsAfter.balance)).toFixed(6) : null });
  console.log(`\n======= DONE spent $${guard.spent.toFixed(4)} (historical replayed $${guard.historicalReplayedUsd.toFixed(4)}) / cap $${CAP_USD} live=${guard.liveCount()} replayed=${guard.replayCount()} =======`);
})().catch((e) => { if (e instanceof StopError) process.exit(0); console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
