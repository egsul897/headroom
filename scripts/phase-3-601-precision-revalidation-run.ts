/**
 * PHASE 3 FINAL / 6.01 FINAL FUNDED POST-PRECISION PAID REVALIDATION - THE PAID RUN (mission §1-§18, §25).
 *
 * The certified revalidation runner, re-pinned to this mission: resume-ONLY Pass A (the live caller THROWS), production
 * compileCovenantToIR over planner v4 / required-dependency v2 / prompt v5 with each terminal shard persisted durably
 * (HD-4), the independent verifier through the same durable primitive, the single certified cost guard with this
 * mission's $12.20 hard cap. ONE gateway balance read before execution. Restart: re-run the SAME command - completed
 * shards and verifier calls replay for $0 and every earlier launch's gateway-authoritative spend is charged first.
 *
 * Run: PRECISION_REVALIDATION_PAID_RUN_AUTHORIZED=1 npx tsx scripts/phase-3-601-precision-revalidation-run.ts
 * Zero-cost rehearsal (no balance read, no call): REVALIDATION_DRY_RUN=1 npx tsx scripts/phase-3-601-precision-revalidation-run.ts
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) { try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch { /* no key file */ } }
import Anthropic from "@anthropic-ai/sdk";
import { BudgetExhaustedError, GuardedStageCaller, guardedCompileClient, writeJsonDurable } from "./phase-3-601-guard";
import { gatewayCredits, writeJson } from "./f7b-lib";
import { durableVerifierCallers, resumablePassA, verifierScope } from "./phase-3-601-hd4-resume";
import { DurableShardStore, durableShardExecutor, DurablePersistenceError, DurableReplayRecordInvalidError } from "./phase-3-601-durable-replay";
import { buildRealPlan, frozenObservedRates, loadFrozenInventoryCandidate, OLD_RAW, planShape, resumedCost, resumedGuard, resumeProof, sectionChecks, sha256 } from "./phase-3-601-revalidation-lib";
import { CONSERVATIVE_ESTIMATE_USD, EXPECTED_CENSUS, EXPECTED_PLAN_HASH, EXPECTED_PLANNER_TOKENS, EXPECTED_RESUME, FROZEN_INVENTORY, HARD_CAP_USD, MISSION_ID, missionIdentity, PREVIOUS_RAW, RAW, THIN_SHARD, WITNESS_KEYS } from "./phase-3-601-precision-revalidation-lib";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { RealSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { createBoundedShardExecutor } from "../lib/contract-model/compiler/semantic/shard-executor";
import { DEFAULT_SHARD_BUDGET, MAX_FIRST_TURN_INPUT_TOKENS } from "../lib/contract-model/compiler/semantic/shard-planner";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller, type StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { AI_GATEWAY_BASE_URL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { selectCompilationExecutionMode } from "../lib/contract-model/compiler/semantic/execution-mode";
import type { SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";

const SUMMARY = `${RAW}/summary`;
const STATE = `${RAW}/guard-state.ndjson`;
const DOC = "doc-a";
const DRY = process.env.REVALIDATION_DRY_RUN === "1";
class StopError extends Error { constructor(public verdict: string, msg: string) { super(msg); this.name = "StopError"; } }
const log = (s: string) => { mkdirSync(RAW, { recursive: true }); appendFileSync(`${RAW}/run.log`, s + "\n"); console.log(s); };

void (async () => {
  if (!DRY && process.env.PRECISION_REVALIDATION_PAID_RUN_AUTHORIZED !== "1") throw new Error("REFUSED: this is the paid Section 6.01 final post-precision revalidation; set PRECISION_REVALIDATION_PAID_RUN_AUTHORIZED=1 only inside the authorized paid mission");
  log(`======= PHASE 3 FINAL / 6.01 FINAL FUNDED POST-PRECISION PAID REVALIDATION (mission ${MISSION_ID}, evidence ${RAW})${DRY ? " [DRY RUN]" : ""} =======`);

  // ---------------- §1/§2 identities at the moment of spend
  const id = missionIdentity();
  if (!id.allMatch) throw new StopError("PHASE3_601_COMMITTED_TREE_RECERTIFICATION_FAILED", `identity checks failed: ${Object.entries(id).filter(([k, v]) => k !== "allMatch" && !(v as { match: boolean }).match).map(([k]) => k).join(", ")}`);
  // ---------------- §5/§6 frozen inventory + source-bound resume (production validator, no new stamping)
  const candidate = loadFrozenInventoryCandidate();
  if (candidate.fileSha256 !== FROZEN_INVENTORY.fileSha256 || candidate.inventory.frozenContentHash !== FROZEN_INVENTORY.frozenContentHash || candidate.inventory.items.length !== FROZEN_INVENTORY.items || !candidate.allFactsMatch) throw new StopError("PHASE3_601_HARNESS_DEFECT", `frozen inventory identity differs: file ${candidate.fileSha256} content ${candidate.inventory.frozenContentHash} items ${candidate.inventory.items.length}`);
  const proof = resumeProof(candidate);
  const sec = sectionChecks(proof.built);
  if (!Object.values(sec).every((c) => c.match)) throw new StopError("PHASE3_601_ENVIRONMENT_BLOCKED", "section identity checks failed");
  if (!proof.decision.ok) throw new StopError("PHASE3_601_REQUIRES_FRESH_PASS_A", proof.decision.failures.map((f) => `${f.check}: ${f.detail}`).join("; "));
  const rec = proof.decision.record;
  if (rec.method !== EXPECTED_RESUME.method || rec.sourceContextHash !== EXPECTED_RESUME.sourceContextHash || rec.partitionHash !== EXPECTED_RESUME.partitionHash) throw new StopError("PHASE3_601_REQUIRES_FRESH_PASS_A", `resume identity differs: ${rec.method} ${rec.sourceContextHash} ${rec.partitionHash}`);

  // ---------------- the resume candidate becomes THIS mission's own durable Pass-A evidence (byte-verified copy)
  mkdirSync(RAW, { recursive: true });
  for (const f of ["frozen-inventory.json", "pass-a-passes.json"]) {
    if (!existsSync(`${RAW}/${f}`)) copyFileSync(`${OLD_RAW}/${f}`, `${RAW}/${f}`);
    const a = sha256(readFileSync(`${OLD_RAW}/${f}`)), b = sha256(readFileSync(`${RAW}/${f}`));
    if (a !== b) throw new StopError("PHASE3_601_HARNESS_DEFECT", `${f} copied into this mission's evidence does not match the source object (${a} != ${b})`);
  }

  // ---------------- §8/§9 the exact current plan, frozen per shard
  const plan = buildRealPlan(proof);
  const shape = planShape(plan, proof.ctx.regions[0]!.text);
  const statuses = plan.shards.reduce((m: Record<string, number>, s) => { m[s.dependencyCertificate.certificateStatus] = (m[s.dependencyCertificate.certificateStatus] ?? 0) + 1; return m; }, {});
  const census = { shards: plan.shards.length, oversized: plan.totals.oversizedShards, CERTIFIED_CONTEXT_COMPLETE: statuses.CERTIFIED_CONTEXT_COMPLETE ?? 0, CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION: statuses.CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION ?? 0, CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION: statuses.CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION ?? 0, PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE: statuses.PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE ?? 0 };
  const reqChars = (s: (typeof plan.shards)[number]) => s.context.filter((e) => e.tier === "REQUIRED").reduce((x, e) => x + e.chars, 0);
  const thin = plan.shards.find((s) => s.shardId === THIN_SHARD.shardId) ?? null;
  const planFrozen = {
    planHash: plan.planHash, expectedPlanHash: EXPECTED_PLAN_HASH, mode: selectCompilationExecutionMode(plan).mode, plannerEstimatedInputTokens: plan.totals.estimatedInputTokens, maxShardInputTokens: plan.totals.maxShardInputTokens, firstTurnBoundTokens: MAX_FIRST_TURN_INPUT_TOKENS,
    census, expectedCensus: EXPECTED_CENSUS, certification: plan.dependencyCertification, resharding: plan.requiredContextResharding,
    thinShard: thin ? { shardId: thin.shardId, requiredContextChars: reqChars(thin), ceiling: DEFAULT_SHARD_BUDGET.maxRequiredContextChars, turn1Tokens: thin.estimate.inputTokens, certificate: thin.dependencyCertificate.certificateStatus, allocation: thin.dependencyCertificate.requiredTierAllocation, expected: THIN_SHARD } : null,
    perShard: plan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, ownedItems: s.ownedItemIds.length, ownedMaterialItems: s.ownedMaterialItemIds.length, primaryChars: s.primaryChars, requiredContextChars: reqChars(s), optionalContextChars: s.context.filter((e) => e.tier !== "REQUIRED").reduce((x, e) => x + e.chars, 0), turn1EstimatedTokens: s.estimate.inputTokens, certificateStatus: s.dependencyCertificate.certificateStatus, requiredDependencies: s.dependencyCertificate.requiredDependenciesTotal, deliveredFull: s.dependencyCertificate.deliveredFull, boundedExcerpts: s.dependencyCertificate.deliveredBoundedExcerpt, ownedPrimarySource: s.dependencyCertificate.ownedPrimarySource, external: s.dependencyCertificate.external, internalUnresolved: s.dependencyCertificate.internalUnresolved, ambiguous: s.dependencyCertificate.ambiguous, limitations: s.dependencyCertificate.limitations, witnessesInTurn1: WITNESS_KEYS.filter((k) => s.context.some((e) => e.tier === "REQUIRED" && e.contextKey === k)).map((k) => ({ key: k, deliveredInFull: s.context.some((e) => e.tier === "REQUIRED" && e.contextKey === k && !e.truncated) })) })),
  };
  const planStable = plan.planHash === EXPECTED_PLAN_HASH && plan.totals.estimatedInputTokens === EXPECTED_PLANNER_TOKENS && JSON.stringify(census) === JSON.stringify(EXPECTED_CENSUS) && shape.mode === "SHARDED" && !shape.oldPathologicalPlanReappeared;
  const thinOk = !!thin && reqChars(thin) === THIN_SHARD.requiredContextChars && thin.estimate.inputTokens === THIN_SHARD.turn1Tokens && thin.dependencyCertificate.certificateStatus === "CERTIFIED_CONTEXT_COMPLETE" && plan.totals.maxShardInputTokens < MAX_FIRST_TURN_INPUT_TOKENS;
  if (!planStable) throw new StopError("PHASE3_601_PLAN_NOT_STABLE", `plan ${plan.planHash} tokens ${plan.totals.estimatedInputTokens} census ${JSON.stringify(census)}`);
  if (!thinOk) throw new StopError("PHASE3_601_CONTEXT_CEILING_FRAGILE", `thin-cap shard differs from the certified state: ${JSON.stringify(planFrozen.thinShard)}`);

  // ---------------- §4 frozen cost methodology must reproduce the certified estimate exactly
  const rates = frozenObservedRates();
  const cost = resumedCost(plan, rates.rates);
  if (Math.abs(cost.conservativeTotalUsd - CONSERVATIVE_ESTIMATE_USD) > 1e-6) throw new StopError("PHASE3_601_HARNESS_DEFECT", `estimator no longer reproduces the frozen estimate: ${cost.conservativeTotalUsd} != ${CONSERVATIVE_ESTIMATE_USD}`);
  if (CONSERVATIVE_ESTIMATE_USD > HARD_CAP_USD) throw new StopError("PHASE3_601_COST_BOUND_BEFORE_REVALIDATION", "estimate exceeds the hard cap");

  // ---------------- §11 historical stores: identity validation only
  const oldStores = [{ dir: `${OLD_RAW}/durable-shards`, label: "final-paid 3-shard plan" }, { dir: `${PREVIOUS_RAW}/durable-shards`, label: "prior 6-shard revalidation plan" }].map((st) => { const r = new DurableShardStore(st.dir).loadPriorResults(plan, MISSION_ID); return { ...st, accepted: r.prior.size, rejected: r.rejected.length }; });
  if (oldStores.some((s) => s.accepted > 0)) throw new StopError("PHASE3_601_HARNESS_DEFECT", "a historical shard record was accepted for the current plan");

  // ---------------- §3 ONE live balance read; §12 mission id / evidence dir frozen across launches
  const missionStartPath = `${RAW}/mission-start.json`;
  const restart = existsSync(missionStartPath);
  const creditsBefore = DRY ? null : await gatewayCredits();
  const balanceNow = creditsBefore ? Number(creditsBefore.balance) : null;
  if (!DRY && balanceNow === null) throw new StopError("PHASE3_601_ENVIRONMENT_BLOCKED", "gateway balance could not be read");
  if (!DRY && !restart && balanceNow! < CONSERVATIVE_ESTIMATE_USD) { writeJson(`${SUMMARY}/balance-gate.json`, { artifact: "§3 live balance gate", at: new Date().toISOString(), balanceUsd: balanceNow, conservativeEstimateUsd: CONSERVATIVE_ESTIMATE_USD, hardCapUsd: HARD_CAP_USD, sufficient: false, paidCalls: 0 }); throw new StopError("PHASE3_601_COST_BOUND_BEFORE_REVALIDATION", `live balance $${balanceNow} < conservative estimate $${CONSERVATIVE_ESTIMATE_USD}; 0 paid calls`); }
  if (!DRY && !restart) writeJsonDurable(missionStartPath, { missionId: MISSION_ID, evidenceDir: RAW, startedAt: new Date().toISOString(), gatewayBalanceAtMissionStart: balanceNow, capUsd: HARD_CAP_USD, conservativeResumedEstimateUsd: CONSERVATIVE_ESTIMATE_USD, planHash: plan.planHash });
  const missionStart = DRY && !restart ? { missionId: MISSION_ID, gatewayBalanceAtMissionStart: 0, startedAt: "DRY", capUsd: HARD_CAP_USD, planHash: plan.planHash } : JSON.parse(readFileSync(missionStartPath, "utf8")) as { missionId: string; gatewayBalanceAtMissionStart: number; startedAt: string; capUsd: number; planHash: string };
  if (missionStart.missionId !== MISSION_ID) throw new StopError("PHASE3_601_HARNESS_DEFECT", `evidence dir belongs to mission ${missionStart.missionId}`);
  if (missionStart.planHash !== plan.planHash) throw new StopError("PHASE3_601_PLAN_NOT_STABLE", `this launch plans ${plan.planHash}, the mission started on ${missionStart.planHash}`);
  if (missionStart.capUsd !== HARD_CAP_USD) throw new StopError("PHASE3_601_HARNESS_DEFECT", `cap drift ${missionStart.capUsd}`);
  const balanceBefore = missionStart.gatewayBalanceAtMissionStart;
  const priorLaunchSpend = restart && balanceNow !== null ? Math.max(0, +(balanceBefore - balanceNow).toFixed(6)) : 0;
  const launches = existsSync(`${RAW}/launches.ndjson`) ? readFileSync(`${RAW}/launches.ndjson`, "utf8").trim().split("\n").filter(Boolean).length : 0;
  if (!DRY) appendFileSync(`${RAW}/launches.ndjson`, JSON.stringify({ launch: launches + 1, restart, at: new Date().toISOString(), pid: process.pid, gatewayBalanceNow: balanceNow, priorLaunchSpendUsd: priorLaunchSpend }) + "\n");
  writeJson(`${SUMMARY}/balance-gate.json`, { artifact: "§3 live balance gate (read once before execution)", at: new Date().toISOString(), dryRun: DRY, restart, balanceUsd: balanceNow, missionStartBalanceUsd: balanceBefore, conservativeEstimateUsd: CONSERVATIVE_ESTIMATE_USD, hardCapUsd: HARD_CAP_USD, estimateWithinCap: CONSERVATIVE_ESTIMATE_USD <= HARD_CAP_USD, sufficient: DRY ? null : balanceBefore >= CONSERVATIVE_ESTIMATE_USD });

  const guard = resumedGuard(rates.rates, plan.totals.estimatedInputTokens, HARD_CAP_USD, DRY ? HARD_CAP_USD : balanceBefore, DRY ? null : STATE);
  guard.spent = priorLaunchSpend;
  const probe = getStageCaller();
  if (!DRY && probe.isSynthetic) throw new StopError("PHASE3_601_ENVIRONMENT_BLOCKED", "no real credential");
  const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
  log(`  cap $${HARD_CAP_USD}  conservative estimate $${CONSERVATIVE_ESTIMATE_USD}  mission-start balance $${balanceBefore}  balance now $${balanceNow}  launch #${launches + 1} restart=${restart} priorLaunchSpend=$${priorLaunchSpend}`);

  const startedAt = new Date().toISOString();
  const counts = { compileTurns: 0, shardsExecuted: 0, shardsReused: 0 };
  const ledger = (extra: Record<string, unknown>) => writeJson(`${SUMMARY}/ledger.json`, { artifact: "6.01 final post-precision revalidation - paid ledger", at: new Date().toISOString(), startedAt, missionStartedAt: missionStart.startedAt, missionId: MISSION_ID, launch: launches + 1, restart, priorLaunchSpendUsd: priorLaunchSpend, thisLaunchSpendUsd: +(guard.spent - priorLaunchSpend).toFixed(6), capUsd: HARD_CAP_USD, conservativeResumedEstimateUsd: CONSERVATIVE_ESTIMATE_USD, liveCalls: guard.liveCount(), replayedCalls: guard.replayCount(), logicalCalls: guard.calls.length, spendUsd: +guard.spent.toFixed(6), historicalReplayedUsd: +guard.historicalReplayedUsd.toFixed(6), calls: guard.calls, refusals: guard.refusals, counts, newPassACalls: 0, gatewayBalanceBefore: balanceBefore, model, ...extra });
  const stop = async (verdict: string, msg: string) => { const c = await gatewayCredits(); ledger({ stoppedEarly: true, stopVerdict: verdict, stopReason: msg, gatewayBalanceAfter: c ? Number(c.balance) : null }); log(`\n======= STOPPED: ${verdict} - ${msg} (spent $${guard.spent.toFixed(4)}) =======`); throw new StopError(verdict, msg); };
  const classify = (e: unknown) => e instanceof BudgetExhaustedError ? "PHASE3_601_COST_BOUND_DURING_REVALIDATION" : e instanceof DurablePersistenceError ? "PHASE3_601_HARNESS_DEFECT (durable persistence failed)" : e instanceof DurableReplayRecordInvalidError ? "PHASE3_601_HARNESS_DEFECT (replay record invalid)" : "PHASE3_601_ENVIRONMENT_BLOCKED";

  // ---------------- §7 Pass A: RESUMED ONLY. The live caller throws, so a fresh Pass A cannot happen.
  const refusingPassA: StageCaller = { providerName: probe.providerName, model: probe.model, isSynthetic: false, call: async () => { throw new Error("PHASE3_601_REQUIRES_FRESH_PASS_A: this mission refuses to run Pass A; the persisted ensemble was expected to resume"); }, lastTelemetry: () => null };
  let passA: Awaited<ReturnType<typeof resumablePassA>>;
  try { passA = await resumablePassA({ evidenceDir: RAW, missionId: MISSION_ID, candidateRef: proof.built.candidateRef, documentId: DOC, sourceContext: proof.ctx, structuralIndex: proof.built.chewy.index, liveCallerFor: () => refusingPassA }); }
  catch (e) { return stop("PHASE3_601_REQUIRES_FRESH_PASS_A", `Pass-A resume failed: ${e instanceof Error ? e.message : String(e)}`); }
  if (passA.source !== "RESUMED_FROM_ENSEMBLE_PERSISTENCE" || !passA.usable) return stop("PHASE3_601_REQUIRES_FRESH_PASS_A", `Pass A did not resume (source ${passA.source}, usable ${passA.usable})`);
  const RELOADED = passA.inventory;
  if (RELOADED.frozenContentHash !== candidate.inventory.frozenContentHash) return stop("PHASE3_601_HARNESS_DEFECT", "the reloaded inventory is not the persisted candidate");
  writeJson(`${SUMMARY}/pass-a.json`, { artifact: "6.01 final post-precision revalidation §5-§7 - Pass A (RESUMED; zero new provider calls)", at: new Date().toISOString(), source: passA.source, usable: passA.usable, newProviderCalls: 0, resumedFrom: { mission: "phase-3-final-601-final-paid", path: `${OLD_RAW}/frozen-inventory.json`, copiedInto: `${RAW}/frozen-inventory.json`, fileSha256: candidate.fileSha256 }, authoritative: { inventoryStatus: RELOADED.inventoryStatus, canonicalItems: RELOADED.items.length, frozenContentHash: RELOADED.frozenContentHash, sourceContextState: RELOADED.sourceContextState }, resume: { method: rec.method, sourceContextHash: rec.sourceContextHash, partitionHash: rec.partitionHash, candidateRef: rec.candidateRef, documentId: rec.documentId } });
  log(`  Pass A ${passA.source}: ${RELOADED.items.length} items, hash ${RELOADED.frozenContentHash.slice(0, 16)}..., 0 new provider calls; resume ${rec.method}`);

  // ---------------- §8/§11 plan + durable store; only THIS mission's own records can be reused
  const shardStore = new DurableShardStore(`${RAW}/durable-shards`);
  const { prior, rejected } = shardStore.loadPriorResults(plan, MISSION_ID);
  const priorTokens = plan.shards.filter((s) => prior.has(s.shardHash)).reduce((a, s) => a + s.estimate.inputTokens, 0);
  guard.passBTokensRemaining = Math.max(0, plan.totals.estimatedInputTokens - priorTokens);
  const recheck = guard.wouldAdmit();
  writeJson(`${SUMMARY}/plan.json`, { artifact: "6.01 final post-precision revalidation §8-§11 - exact current plan (frozen per shard), historical stores, affordability", at: new Date().toISOString(), identity: id, ...planFrozen, shape, historicalStores: oldStores, thisMissionStore: { priorShardsFromStore: prior.size, priorShardTokensExcludedFromPaidWork: priorTokens, rejectedStoreRecords: rejected }, guardState: guard.state(), admission: recheck, estimate: cost, rateSource: rates.source });
  if (!recheck.admitted) return stop("PHASE3_601_COST_BOUND_BEFORE_REVALIDATION", `conservative remaining $${recheck.conservativeRemaining.toFixed(4)} exceeds cap remaining $${recheck.capRemaining.toFixed(4)} or balance remaining $${recheck.balanceRemaining.toFixed(4)}`);
  log(`  plan: ${shape.mode} ${plan.shards.length} shards (${plan.totals.oversizedShards} oversized) hash ${plan.planHash.slice(0, 12)} census ${JSON.stringify(census)}; ${prior.size} already in this mission's store; paid remaining $${recheck.conservativeRemaining.toFixed(4)} of $${recheck.capRemaining.toFixed(4)}`);
  if (DRY) { log(`\n======= DRY RUN COMPLETE - every pre-spend step passed; 0 paid calls, 0 balance reads. =======`); return; }

  // ---------------- §14/§15 Pass B: production compileCovenantToIR, durable per shard
  const throwingPassA: StageCaller = { providerName: probe.providerName, model: probe.model, isSynthetic: false, call: async () => { throw new Error("PHASE3_601_IMPLEMENTATION_DEFECT: production attempted to rerun Pass A despite a validated frozenInventory"); }, lastTelemetry: () => null };
  const semanticCaller = new RealSemanticCaller("vercel-ai-gateway", process.env.SEMANTIC_COMPILER_MODEL ?? model, guardedCompileClient(new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }), guard, () => { counts.compileTurns++; }));
  const region0 = proof.ctx.regions[0]!;
  const baseInput: SemanticCompilerInput = { ...(proof.built.input as SemanticCompilerInput), operativeSourceText: region0.text, operativeCharStart: region0.charStart >= 0 ? region0.charStart : proof.built.input.operativeCharStart, sourceContext: proof.ctx, frozenInventory: proof.decision.inventory };
  const production = createBoundedShardExecutor({ baseInput, plan, caller: semanticCaller });
  const persistedShards: { shardId: string; shardHash: string; status: string; at: string }[] = [];
  const executor = durableShardExecutor(async (shard, attempt) => { guard.passBTokensRemaining = Math.max(0, guard.passBTokensRemaining - shard.estimate.inputTokens); counts.shardsExecuted++; return production(shard, attempt); }, shardStore, plan, MISSION_ID, (rec2) => { persistedShards.push({ shardId: rec2.shardId, shardHash: rec2.shardHash, status: rec2.result.status, at: rec2.completedAt }); log(`  [shard ${rec2.shardId}] ${rec2.result.status} persisted durably`); });
  let compileResult: Awaited<ReturnType<typeof compileCovenantToIR>> | null = null; let compileError: string | null = null;
  const spentBeforeCompile = guard.spent;
  try { compileResult = await compileCovenantToIR(proof.built.input as SemanticCompilerInput, { caller: semanticCaller, inventoryMode: "DUAL_PASS_ENSEMBLE", inventoryPassCallers: [throwingPassA, throwingPassA], frozenInventory: RELOADED, cache: new InMemorySemanticCompilationCache(), shardExecutor: executor, priorShardResults: prior }); }
  catch (e) { compileError = e instanceof Error ? e.message : String(e); log(`  COMPILE THREW: ${compileError}`); if (e instanceof BudgetExhaustedError || e instanceof DurablePersistenceError || e instanceof DurableReplayRecordInvalidError) return stop(classify(e), compileError); }
  const ex = compileResult?.execution ?? null;
  counts.shardsReused = ex?.sharded?.reused ?? 0;
  if (compileResult) writeJsonDurable(`${RAW}/compile-result.json`, compileResult);
  writeJson(`${SUMMARY}/compile.json`, { artifact: "6.01 final post-precision revalidation §15 - production compileCovenantToIR", at: new Date().toISOString(), entryPoint: "compileCovenantToIR", frozenInventorySource: "RESUMED_PERSISTED_ENSEMBLE", priorShardResultsSupplied: prior.size, status: compileResult?.status ?? null, failureReasons: compileResult?.failureReasons ?? null, compileError, costUsd: +(guard.spent - spentBeforeCompile).toFixed(6), execution: ex, planComparison: { harnessPlanHash: plan.planHash, productionPlanHash: ex?.planHash ?? null, identical: ex?.planHash === plan.planHash }, persistedShards, output: compileResult ? { rules: compileResult.rules?.length ?? 0, definitions: compileResult.definitions?.length ?? 0, sharedCapacities: compileResult.sharedCapacities?.length ?? 0, unresolvedIssues: compileResult.unresolvedIssues?.length ?? 0 } : null });
  log(`  compile ${compileResult?.status ?? "n/a"} executed=${ex?.sharded?.executed ?? 0} reused=${ex?.sharded?.reused ?? 0} statuses=${JSON.stringify(ex?.sharded?.statusCounts ?? {})}`);

  // ---------------- §21 independent verifier on untouched production output
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
    writeJson(`${SUMMARY}/verifier.json`, { artifact: "6.01 final post-precision revalidation §21 - independent verifier", at: new Date().toISOString(), status: verifyResult?.status ?? null, verifyError, semanticReviewInvoked: verifyResult?.semanticReviewInvoked ?? null, findings: verifyResult?.findings ?? null, accounting: { review: v.review.summary(), suspicion: v.suspicion.summary() }, costUsd: +(guard.spent - spentBeforeVerify).toFixed(6) });
    log(`  verifier ${verifyResult?.status ?? "n/a"} findings=${verifyResult?.findings?.length ?? 0}`);
  }
  const creditsAfter = await gatewayCredits();
  ledger({ stoppedEarly: false, gatewayBalanceAfter: creditsAfter ? Number(creditsAfter.balance) : null, gatewayReportedSpendUsd: creditsBefore && creditsAfter ? +(Number(creditsBefore.balance) - Number(creditsAfter.balance)).toFixed(6) : null });
  log(`\n======= DONE spent $${guard.spent.toFixed(4)} / cap $${HARD_CAP_USD} live=${guard.liveCount()} replayed=${guard.replayCount()} newPassACalls=0 =======`);
})().catch((e) => { if (e instanceof StopError) { console.error(`STOP ${e.verdict}: ${e.message}`); process.exit(0); } console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
