/**
 * PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN - the paid run (§7-§23).
 * fresh Pass A -> IMMEDIATE durable persistence + reload proof (§10) -> §9 gate on the RELOADED object -> F-7C.1
 * resume proof on the RELOADED object (§12) -> real plan + cost recheck (§13) -> compileCovenantToIR with
 * frozenInventory = RELOADED (§11/§14), Pass A callers that THROW if production ever tries to rerun Pass A, and
 * per-shard results persisted the instant each returns (§17) -> verifier (§22) -> freeze (§23).
 * Run: npx tsx scripts/phase-3-601-final-run.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) { try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch { /* no key file */ } }
import Anthropic from "@anthropic-ai/sdk";
import { OUT, RAW, CAP_USD, PRIOR, buildPlanContext, newGuard } from "./phase-3-601-final-certify";
import { BudgetExhaustedError, GuardedStageCaller, guardedCompileClient, passAPrerequisiteSatisfied, persistAndReload, writeJsonDurable } from "./phase-3-601-guard";
import { gatewayCredits, writeJson } from "./f7b-lib";
import { runDualPassSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/dual-pass";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { computeSourceContextHash } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { validateFrozenInventoryResume } from "../lib/contract-model/compiler/semantic/frozen-inventory-resume";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { RealSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller, type StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { AI_GATEWAY_BASE_URL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { selectCompilationExecutionMode } from "../lib/contract-model/compiler/semantic/execution-mode";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import type { FrozenSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/types";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const STATE = `${RAW}/guard-state.ndjson`;
class StopError extends Error { constructor(public verdict: string, msg: string) { super(msg); this.name = "StopError"; } }

void (async () => {
  console.log("======= PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN =======");
  if (existsSync(`${RAW}/frozen-inventory.json`)) throw new Error("FATAL: evidence already exists - never rewritten");
  const cert = JSON.parse(readFileSync(`${OUT}/48-final-clean-harness-certification.json`, "utf8"));
  if (cert.decision !== "CERTIFIED_CLEAR_TO_EXECUTE") throw new Error(`FATAL: certification is ${cert.decision}`);
  console.log(`  §4 certification: ${cert.decision} (HD-1 ${cert.hd1.certified}, HD-2 ${cert.hd2.certified}, HD-3 ${cert.hd3.certified})`);

  const { built, prePlan, batchesPerPass, rates } = buildPlanContext();
  const creditsBefore = await gatewayCredits();
  const balanceBefore = creditsBefore ? Number(creditsBefore.balance) : 0;
  const guard = newGuard(rates, batchesPerPass, prePlan.totals.estimatedInputTokens, balanceBefore, STATE);
  const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
  let p1Batch = 0, p1Gap = 0, p2Batch = 0, p2Gap = 0, compileTurns = 0;
  const dec = (stage: string, g: () => void, b: () => void) => { if (stage.endsWith("_gap")) { guard.passAGapRemaining = Math.max(0, guard.passAGapRemaining - 1); g(); } else { guard.passABatchesRemaining = Math.max(0, guard.passABatchesRemaining - 1); b(); } };
  const inv1 = new GuardedStageCaller(getStageCaller(), "passA-1", guard, (s) => dec(s, () => p1Gap++, () => p1Batch++));
  const inv2 = new GuardedStageCaller(getStageCaller(), "passA-2", guard, (s) => dec(s, () => p2Gap++, () => p2Batch++));
  if (inv1.isSynthetic) throw new Error("FATAL: no real credential");
  console.log(`  models: inventory=${inv1.model}  cap $${CAP_USD}  balance $${balanceBefore}`);
  const startedAt = new Date().toISOString();
  const ledger = (extra: Record<string, unknown>) => writeJson(`${OUT}/54-final-clean-paid-ledger.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §7 - paid ledger", at: new Date().toISOString(), startedAt, capUsd: CAP_USD, paidCalls: guard.calls.length, spendUsd: +guard.spent.toFixed(6), costBreakdown: { passAPass1Usd: +guard.costByPrefix("passA-1").toFixed(6), passAPass2Usd: +guard.costByPrefix("passA-2").toFixed(6), passBUsd: +guard.costByPrefix("compile:").toFixed(6), conditionSuspicionUsd: +guard.costByPrefix("verify-suspicion").toFixed(6), semanticReviewUsd: +guard.costByPrefix("verify-review").toFixed(6), providerRetriesUsd: 0, totalUsd: +guard.spent.toFixed(6) }, callCounts: { passA1: p1Batch + p1Gap, passA2: p2Batch + p2Gap, compileTurns, conditionSuspicion: guard.countByPrefix("verify-suspicion"), semanticReview: guard.countByPrefix("verify-review") }, gatewayBalanceBefore: balanceBefore, guardRefusals: guard.refusals, guardStateLog: STATE, calls: guard.calls, priorSpend: PRIOR, cumulativeSection601SpendUsd: +(PRIOR.cumulativeUsd + guard.spent).toFixed(6), ...extra });
  const stop = async (verdict: string, msg: string) => { const c = await gatewayCredits(); ledger({ stoppedEarly: true, stopVerdict: verdict, stopReason: msg, gatewayBalanceAfter: c ? Number(c.balance) : null }); console.log(`\n======= STOPPED: ${verdict} - ${msg} (spent $${guard.spent.toFixed(4)}) =======`); throw new StopError(verdict, msg); };

  // ---------------- §8 fresh Pass A
  let dual: Awaited<ReturnType<typeof runDualPassSemanticInventory>>;
  try { dual = await runDualPassSemanticInventory({ candidateRef: built.candidateRef, documentId: "doc-a", sourceContext: built.sourceContext, structuralIndex: built.chewy.index, passCallers: [inv1, inv2] }); }
  catch (e) { return stop(e instanceof BudgetExhaustedError ? "PHASE3_601_COST_BOUND_DURING_RUN" : "PHASE3_601_ENVIRONMENT_BLOCKED", `Pass A threw: ${e instanceof Error ? e.message : String(e)}`); }
  const p1 = dual.passes[0]!.inventory, p2 = dual.passes[1]!.inventory, memInv = dual.inventory;
  const ens = (memInv as unknown as { ensemble?: Record<string, unknown> }).ensemble ?? null;
  console.log(`  -> pass1 ${p1.inventoryStatus} items=${p1.items.length} | pass2 ${p2.inventoryStatus} items=${p2.items.length} | ensembleBuilt=${dual.ensembleBuilt} canonical=${memInv.items.length}`);
  const passRec = (p: FrozenSemanticInventory, batches: number, gaps: number, prefix: string) => ({ calls: batches + gaps, batches, gapCalls: gaps, costUsd: +guard.costByPrefix(prefix).toFixed(6), items: p.items.length, inventoryStatus: p.inventoryStatus, inventoryStatusReason: p.inventoryStatusReason, sourceCoverage: p.sourceCoverage, unaccountedSource: p.unaccountedSource.length, uninventoriedValues: p.uninventoriedValues.length, rejectedUnverifiable: p.rejectedUnverifiableItems, rejectedDuplicates: p.rejectedDuplicateItems, frozenContentHash: p.frozenContentHash, sourceIdentity: (p as unknown as { sourceIdentity?: unknown }).sourceIdentity ?? null, partition: (p as unknown as { partition?: unknown }).partition ?? null });
  writeJson(`${OUT}/50-final-clean-pass-a-ledger.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §8/§9 - fresh DUAL_PASS_ENSEMBLE Pass A and ensemble", at: new Date().toISOString(), freshExecution: true, historicalInventoryReused: false, pass1: passRec(p1, p1Batch, p1Gap, "passA-1"), pass2: passRec(p2, p2Batch, p2Gap, "passA-2"), ensembleBuilt: dual.ensembleBuilt, ensembleRefusal: dual.ensembleRefusal, authoritative: { inventoryStatus: memInv.inventoryStatus, canonicalItems: memInv.items.length, frozenContentHash: memInv.frozenContentHash, sourceContextState: memInv.sourceContextState, unaccountedSource: memInv.unaccountedSource.length, uninventoriedValues: memInv.uninventoriedValues.length, rejectedUnverifiable: memInv.rejectedUnverifiableItems }, ensemble: ens });

  // ---------------- §10 IMMEDIATE durable persistence + reload proof (HD-3). Nothing downstream sees the in-memory copy.
  const invProof = persistAndReload<FrozenSemanticInventory>(`${RAW}/frozen-inventory.json`, memInv);
  const passesProof = persistAndReload(`${RAW}/pass-a-passes.json`, dual.passes);
  const RELOADED = invProof.reloaded;
  const reloadedPasses = passesProof.reloaded as { passId: string; inventory: FrozenSemanticInventory }[];
  const persistOk = invProof.existsAfterWrite && invProof.hashEqual && invProof.structurallyEqual && passesProof.existsAfterWrite && passesProof.hashEqual && passesProof.structurallyEqual && RELOADED.items.length === memInv.items.length && RELOADED.frozenContentHash === memInv.frozenContentHash;
  writeJson(`${OUT}/51-final-clean-persistence-proof.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §10 - durable persistence and reload proof, performed BEFORE any gate", at: new Date().toISOString(), orderingProof: "persistAndReload ran immediately after runDualPassSemanticInventory returned; the §9 gate, the resume proof, the plan, the compile and the verifier all run below and all consume the RELOADED object", frozenInventory: { path: invProof.path, existsAfterWrite: invProof.existsAfterWrite, writtenSha256: invProof.writtenSha256, readSha256: invProof.readSha256, hashEqual: invProof.hashEqual, structurallyEqual: invProof.structurallyEqual, reloadedItemCount: RELOADED.items.length, inMemoryItemCount: memInv.items.length, reloadedFrozenContentHash: RELOADED.frozenContentHash, inMemoryFrozenContentHash: memInv.frozenContentHash, reloadedCandidateRef: RELOADED.candidateRef, reloadedDocumentId: (RELOADED as unknown as { documentId?: string }).documentId ?? null, reloadedSourceContextState: RELOADED.sourceContextState, reloadedSourceIdentity: (RELOADED as unknown as { sourceIdentity?: unknown }).sourceIdentity ?? null }, passAPasses: { path: passesProof.path, existsAfterWrite: passesProof.existsAfterWrite, hashEqual: passesProof.hashEqual, structurallyEqual: passesProof.structurallyEqual, reloadedPassCount: reloadedPasses.length }, persistenceOk: persistOk });
  if (!persistOk) return stop("PHASE3_601_HARNESS_DEFECT", "durable persistence / reload proof failed");
  console.log(`  §10 persisted + reloaded: ${RELOADED.items.length} items, hash ${RELOADED.frozenContentHash.slice(0, 16)}...`);

  // ---------------- §9 gate on the RELOADED objects
  const gateOk = passAPrerequisiteSatisfied({ pass1: reloadedPasses[0]?.inventory, pass2: reloadedPasses[1]?.inventory, ensembleBuilt: dual.ensembleBuilt, authoritativeItemCount: RELOADED.items.length });
  if (!gateOk) return stop("PHASE3_601_ENVIRONMENT_BLOCKED", `§9 prerequisite not met on reloaded objects: ${p1.inventoryStatus}/${p2.inventoryStatus} ensembleBuilt=${dual.ensembleBuilt}`);

  // ---------------- §12 F-7C.1 source-bound resume proof on the RELOADED inventory against a FRESHLY resolved context
  const idx = built.chewy.index as unknown as { getDocumentText: (d: string) => string | undefined };
  const freshCtx = resolveSourceContext({ index: built.chewy.index, documentId: "doc-a", operativeSourceText: built.input.operativeSourceText, anchorNodeId: built.input.contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: built.input.operativeCharStart ?? null, documentText: idx.getDocumentText("doc-a") ?? null });
  const decision = validateFrozenInventoryResume({ candidateRef: built.candidateRef, sourceDocumentId: "doc-a", frozenInventory: RELOADED, sourceContext: freshCtx, structuralIndex: built.chewy.index });
  writeJson(`${OUT}/52-final-clean-resume-proof.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §12 - F-7C.1 source-bound resume proof on the RELOADED inventory", at: new Date().toISOString(), inputWasReloadedFromDisk: true, freshSourceContext: { state: freshCtx.state, hash: computeSourceContextHash(freshCtx), regions: freshCtx.regions.length, totalChars: freshCtx.totalChars }, reloadedInventorySourceIdentity: (RELOADED as unknown as { sourceIdentity?: unknown }).sourceIdentity ?? null, decision: decision.ok ? { ok: true, record: decision.record } : { ok: false, failures: decision.failures } });
  if (!decision.ok) return stop("PHASE3_601_FRESH_INVENTORY_NOT_RESUMABLE", `resume validation failed: ${decision.failures.map((f) => `${f.check}: ${f.detail}`).join("; ")}`);
  console.log(`  §12 resume proof: ${decision.record.method} sourceContextHash ${decision.record.sourceContextHash.slice(0, 16)}...`);

  // ---------------- §13 real plan with the RELOADED inventory + cost recheck
  guard.passABatchesRemaining = 0; guard.passAGapRemaining = 0;
  const realPlan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: "doc-a", sourceContext: freshCtx, frozenInventory: RELOADED, structuralIndex: built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
  const realMode = selectCompilationExecutionMode(realPlan);
  guard.passBTokensRemaining = realPlan.totals.estimatedInputTokens;
  const recheck = guard.wouldAdmit();
  writeJson(`${OUT}/53-final-clean-real-plan.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §13 - real plan over the reloaded inventory and affordability recheck", at: new Date().toISOString(), plannedWith: "RELOADED inventory", mode: realMode.mode, reason: realMode.reason, planHash: realPlan.planHash, shards: realPlan.shards.length, oversizedShards: realPlan.totals.oversizedShards, plannerEstimatedInputTokens: realPlan.totals.estimatedInputTokens, maxShardInputTokens: realPlan.totals.maxShardInputTokens, preflightEmptyInventoryPlan: { planHash: prePlan.planHash, shards: prePlan.shards.length, tokens: prePlan.totals.estimatedInputTokens }, shardTable: realPlan.shards.map((s) => ({ ordinal: s.ordinal, shardId: s.shardId, shardHash: s.shardHash, ownedItems: s.ownedItemIds.length, estimatedInputTokens: s.estimate.inputTokens, oversized: s.oversized })), guardStateAfterPassA: guard.state(), recheck, fits: recheck.admitted });
  if (!recheck.admitted) return stop("PHASE3_601_COST_BOUND_BEFORE_PASS_B", `real-plan conservative remaining $${recheck.conservativeRemaining.toFixed(4)} exceeds cap remaining $${recheck.capRemaining.toFixed(4)} or balance`);
  console.log(`  §13 real plan: ${realMode.mode} ${realPlan.shards.length} shards ${realPlan.totals.estimatedInputTokens} tokens; conservative remaining $${recheck.conservativeRemaining.toFixed(4)} of $${recheck.capRemaining.toFixed(4)}`);

  // ---------------- §14 production compile over the RELOADED inventory, Pass A callers that THROW if invoked, §17 per-shard persistence
  const throwingPassA: StageCaller = { providerName: inv1.providerName, model: inv1.model, isSynthetic: false, call: async () => { throw new Error("PHASE3_601_IMPLEMENTATION_DEFECT: production attempted to rerun Pass A despite a validated frozenInventory"); }, lastTelemetry: () => null };
  const shardResults: { ordinal: number | null; shardId: string | null; shardHash: string | null; inputSha256: string; ownedItemIds: string[]; operativeCharStart: number | null; result: unknown; costUsd: number; persistedAt: string }[] = [];
  let compileIdx = 0;
  const semanticCaller = new RealSemanticCaller("vercel-ai-gateway", process.env.SEMANTIC_COMPILER_MODEL ?? model, guardedCompileClient(new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }), guard, () => { compileTurns++; }));
  const originalCompile = semanticCaller.compile.bind(semanticCaller);
  (semanticCaller as unknown as { compile: typeof originalCompile }).compile = async (inp: SemanticCompilerInput) => {
    const ownedIds = (inp.frozenInventory?.items ?? []).map((i) => i.inventoryItemId).sort();
    const key = ownedIds.join("|");
    const matched = realPlan.shards.find((s) => [...s.ownedItemIds].sort().join("|") === key) ?? realPlan.shards[compileIdx] ?? null;
    if (matched) guard.passBTokensRemaining = Math.max(0, guard.passBTokensRemaining - matched.estimate.inputTokens);
    const ordinal = compileIdx++;
    const spentBefore = guard.spent;
    const result = await originalCompile(inp);
    const rec = { ordinal: matched?.ordinal ?? ordinal, shardId: matched?.shardId ?? null, shardHash: matched?.shardHash ?? null, inputSha256: sha256(JSON.stringify({ text: inp.operativeSourceText, start: inp.operativeCharStart, owned: ownedIds })), ownedItemIds: ownedIds, operativeCharStart: inp.operativeCharStart ?? null, result, costUsd: +(guard.spent - spentBefore).toFixed(6), persistedAt: new Date().toISOString() };
    writeJsonDurable(`${RAW}/shards/${String(rec.ordinal).padStart(2, "0")}-${rec.shardId ?? "unmatched"}.json`, rec); // §17: immediately, before the next shard
    shardResults.push(rec);
    console.log(`  [shard ${rec.ordinal}] ${rec.shardId ?? "unmatched"} persisted (${result.failureReason ?? "submitted"}, $${rec.costUsd})`);
    return result;
  };
  const verifyCaller = new GuardedStageCaller(getStageCaller(), "verify-review", guard, () => { guard.verifierReviewRemaining = 0; });
  const suspicionCaller = new GuardedStageCaller(getStageCaller(), "verify-suspicion", guard, () => { guard.conditionSuspicionRemaining = Math.max(0, guard.conditionSuspicionRemaining - 1); });

  const compilerInput = built.input as SemanticCompilerInput;
  let compileResult: Awaited<ReturnType<typeof compileCovenantToIR>> | null = null;
  let compileError: string | null = null, boundDuringRun = false;
  const spentBeforeCompile = guard.spent;
  try { compileResult = await compileCovenantToIR(compilerInput, { caller: semanticCaller, inventoryMode: "DUAL_PASS_ENSEMBLE", inventoryPassCallers: [throwingPassA, throwingPassA], frozenInventory: RELOADED, cache: new InMemorySemanticCompilationCache() }); }
  catch (e) { compileError = e instanceof Error ? e.message : String(e); boundDuringRun = e instanceof BudgetExhaustedError; console.log(`  COMPILE ${boundDuringRun ? "COST-BOUND" : "THREW"}: ${compileError}`); }
  const compileCost = guard.spent - spentBeforeCompile;
  if (compileResult) console.log(`  -> compile ${compileResult.status} mode=${compileResult.execution?.mode} shards=${compileResult.execution?.plannedShards} rules=${compileResult.rules.length} defs=${compileResult.definitions.length} caps=${compileResult.sharedCapacities.length} resume=${compileResult.execution?.frozenInventoryResume?.method ?? null}`);
  if (compileResult) writeJsonDurable(`${RAW}/compile-result.json`, compileResult);

  // ---------------- §22 verifier
  let verifyResult: Awaited<ReturnType<typeof verifyCompiledCandidate>> | null = null; let verifyError: string | null = null;
  const spentBeforeVerify = guard.spent;
  if (compileResult && compileResult.status !== "FAILED") {
    const op = compileResult.sourceContext?.regions[0];
    const vIn: SemanticCompilerInput = op && op.text !== compilerInput.operativeSourceText ? { ...compilerInput, operativeSourceText: op.text, operativeCharStart: op.charStart, sourceContext: undefined, frozenInventory: undefined } : { ...compilerInput, sourceContext: undefined, frozenInventory: undefined };
    try { verifyResult = await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compileResult }, { reviewCaller: verifyCaller, conditionSuspicionCaller: suspicionCaller }); console.log(`  -> verify ${verifyResult.status} findings=${verifyResult.findings.length} reviewInvoked=${verifyResult.semanticReviewInvoked}`); }
    catch (e) { verifyError = e instanceof Error ? e.message : String(e); boundDuringRun = boundDuringRun || e instanceof BudgetExhaustedError; console.log(`  VERIFY THREW: ${verifyError}`); }
  }
  const verifyCost = guard.spent - spentBeforeVerify;
  writeJsonDurable(`${RAW}/verify-result.json`, verifyResult);
  const creditsAfter = await gatewayCredits();
  const balanceAfter = creditsAfter ? Number(creditsAfter.balance) : null;

  // ---------------- §23 freeze artifacts
  ledger({ stoppedEarly: false, costBoundDuringRun: boundDuringRun, gatewayBalanceAfter: balanceAfter, gatewayReportedSpendUsd: creditsBefore && creditsAfter ? +(Number(creditsBefore.balance) - Number(creditsAfter.balance)).toFixed(6) : null });
  const ex = compileResult?.execution ?? null;
  writeJson(`${OUT}/55-final-clean-production-compile.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §14/§15/§17/§20 - production compileCovenantToIR over the RELOADED inventory", at: new Date().toISOString(), entryPoint: "compileCovenantToIR", frozenInventorySource: "RELOADED from frozen-inventory.json (not the in-memory object)", passARerunAttemptedByProduction: compileError?.includes("attempted to rerun Pass A") ?? false, priorShardResultsSupplied: false, shardExecutorOverridden: false, status: compileResult?.status ?? null, failureReasons: compileResult?.failureReasons ?? null, errorDetail: compileResult?.errorDetail ?? null, compileError, costBoundDuringRun: boundDuringRun, costUsd: +compileCost.toFixed(6), execution: ex, resumeMetadata: ex?.frozenInventoryResume ?? null, planComparison: { harnessRealPlanHash: realPlan.planHash, productionPlanHash: ex?.planHash ?? null, identical: ex?.planHash === realPlan.planHash, harnessShards: realPlan.shards.length, productionShards: ex?.plannedShards ?? null }, perShardPersistence: shardResults.map((r) => ({ ordinal: r.ordinal, shardId: r.shardId, shardHash: r.shardHash, ownedItems: r.ownedItemIds.length, costUsd: r.costUsd, persistedAt: r.persistedAt, file: `${RAW}/shards/${String(r.ordinal).padStart(2, "0")}-${r.shardId ?? "unmatched"}.json` })), output: compileResult ? { rules: compileResult.rules.length, definitions: compileResult.definitions.length, sharedCapacities: compileResult.sharedCapacities.length, irExtensionCandidates: compileResult.irExtensionCandidates.length } : null, provider: compileResult?.provider ?? null, model: compileResult?.model ?? null, rawEvidence: `${RAW}/compile-result.json` });
  const acc = compileResult?.accountability ?? null;
  writeJson(`${OUT}/56-final-clean-pass-c.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §19 - global Pass C", at: new Date().toISOString(), present: acc !== null, semanticallyComplete: acc?.semanticallyComplete ?? null, inventoryStatusCarried: compileResult?.frozenInventory?.inventoryStatus ?? null, counts: acc?.counts ?? null, reasons: acc?.reasons ?? null, supportSummary: (acc as unknown as { support?: unknown })?.support ?? null, items: acc?.items ?? null });
  writeJson(`${OUT}/57-final-clean-verifier.json`, { artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §22 - independent verifier", at: new Date().toISOString(), ranOnUntouchedProductionOutput: true, routingForced: false, status: verifyResult?.status ?? null, verifyError, semanticReviewInvoked: verifyResult?.semanticReviewInvoked ?? null, conditionSuspicion: verifyResult?.conditionSuspicion ?? null, findings: verifyResult?.findings ?? null, findingCounts: verifyResult ? { total: verifyResult.findings.length, MATERIAL: verifyResult.findings.filter((f) => f.severity === "MATERIAL").length, UNCERTAIN: verifyResult.findings.filter((f) => f.severity === "UNCERTAIN").length, NON_MATERIAL: verifyResult.findings.filter((f) => f.severity === "NON_MATERIAL").length } : null, callCounts: { semanticReview: guard.countByPrefix("verify-review"), conditionSuspicion: guard.countByPrefix("verify-suspicion") }, costUsd: +verifyCost.toFixed(6), rawEvidence: `${RAW}/verify-result.json` });
  console.log(`\n======= DONE spent $${guard.spent.toFixed(4)} / cap $${CAP_USD} calls=${guard.calls.length} refusals=${guard.refusals.length} balanceAfter=${balanceAfter} =======`);
})().catch((e) => { if (e instanceof StopError) process.exit(0); console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
