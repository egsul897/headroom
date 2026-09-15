/**
 * PHASE 3 FINAL-BRIDGE / 6.01 RESUME - the FUNDED paid run (§1-§17).
 * Re-freezes identity, re-runs the deterministic preflight with the FROZEN cost methodology, applies the §6 gate
 * (balance >= cap AND conservative <= cap), then executes Section 6.01 through the real production entry point
 * compileCovenantToIR with a fresh DUAL_PASS_ENSEMBLE Pass A, automatic execution-mode selection, production
 * sharding and global Pass C, followed by the independent verifier on the untouched result.
 * NO frozenInventory. NO priorShardResults. NO shardExecutor override. Every paid call passes the §7 guard first.
 * Run: npx tsx scripts/phase-3-601-funded-run.ts
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY) { try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch { /* no key file */ } }
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { buildSection601, section601ReferenceItems, observedRates, estimate601 } from "./phase-3-601-preflight";
import { gatewayCredits, gitSha, writeJson } from "./f7b-lib";
import { CHWY_SRC } from "./f7a-lib";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../lib/contract-model/compiler/semantic/caller";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { getStageCaller, type StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { AI_GATEWAY_BASE_URL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { calculateCostUsd, type AnalyzerCallTelemetry } from "../lib/contract-model/analyzer/telemetry";
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { selectCompilationExecutionMode, SEMANTIC_EXECUTION_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/execution-mode";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic/shard-types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SOURCE_IDENTITY_MIGRATION_VERSION } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";

const OUT = "docs/phase-3-final-601";
const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-funded-run";
const STARTING_SHA = "d51e7f275f6a7ffbaa2f61c19dd823b9da143b23";
const CAP_USD = 15.84;
const EXPECT = {
  sourceSha: "f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb",
  sectionSha: "6b79685c94a08a9d27b484aaac52282ce92dbe9a7c3321bc38ff6504d12ec02a",
  refSha: "e7f863e58ee53ca499598f2a8194ff98a0f8f74d2a8ced23b6f12b96c2a64036",
  charStart: 608901, charEnd: 642524, chars: 33623, refItems: 8, refCritical: 4, refMaterial: 4,
};
const CONDITION_SUSPICION_PER_CALL = 0.0114;
const CONDITION_SUSPICION_CALLS = 5;
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const CHARS_PER_TOKEN = 3.2;
const ASSUMED_OUTPUT_TOKENS = 12_000;

class BudgetExhaustedError extends Error { constructor(msg: string) { super(msg); this.name = "BudgetExhaustedError"; } }

/** §7 full-mission affordability guard. Conservative remaining work is priced with the FROZEN tiers. */
class Guard {
  spent = 0;
  calls: { n: number; stage: string; model: string; inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number; conservativeRemainingBeforeUsd: number; at: string }[] = [];
  refusals: { stage: string; reason: string; spentUsd: number; conservativeRemainingUsd: number; capUsd: number; balanceUsd: number; at: string }[] = [];
  passABatchesRemaining: number; passAGapRemaining: number; passBTokensRemaining: number; passBShardsRemaining: number;
  verifierReviewRemaining = 1; conditionSuspicionRemaining = CONDITION_SUSPICION_CALLS;
  constructor(private r: ReturnType<typeof observedRates>, readonly worstShardUsd: number, batchesPerPass: number, plannerTokens: number, shards: number, private capUsd: number, private balanceUsd: number) {
    this.passABatchesRemaining = batchesPerPass * 2; this.passAGapRemaining = 2;
    this.passBTokensRemaining = plannerTokens; this.passBShardsRemaining = shards;
  }
  /**
   * Conservative (worst observed x 1.25) cost of ALL required remaining work.
   *
   * HARNESS DEFECT HD-1, fixed after the 2026-09-15 run (see docs/phase-3-final-601/README.md): this method
   * previously priced Pass B as Math.max(tokensRemaining * worstTokenRate, shardsRemaining * worstSingleShardUsd).
   * The per-shard term is NOT part of the cost methodology frozen by §4, which prices Pass B solely per
   * planner-estimated input token. That extra term inflated conservative-remaining to $16.6405 against the §6
   * gate's own $15.8309, so the guard refused the first Pass A call of BOTH passes and the run proceeded with no
   * inventory at all. The guard must use exactly the frozen estimator the gate uses - no stricter, no looser -
   * or the two disagree and the mission voids itself. worstShardUsd is retained only as recorded telemetry.
   */
  conservativeRemaining(): number {
    const passA = this.passABatchesRemaining * this.r.passABatchWorst + this.passAGapRemaining * this.r.passAGapWorst;
    const passB = this.passBTokensRemaining * this.r.passBWorst;
    const ver = this.verifierReviewRemaining * this.r.verifierSemanticReview + this.conditionSuspicionRemaining * CONDITION_SUSPICION_PER_CALL;
    return (passA + passB + ver) * 1.25;
  }
  check(stage: string): number {
    const remaining = this.conservativeRemaining();
    const capLeft = this.capUsd - this.spent;
    const balLeft = this.balanceUsd - this.spent;
    if (remaining > capLeft || remaining > balLeft) {
      const reason = `full remaining mission no longer fits: conservative remaining $${remaining.toFixed(4)} > ${remaining > capLeft ? `cap remaining $${capLeft.toFixed(4)}` : `balance remaining $${balLeft.toFixed(4)}`}`;
      this.refusals.push({ stage, reason, spentUsd: this.spent, conservativeRemainingUsd: remaining, capUsd: this.capUsd, balanceUsd: this.balanceUsd, at: new Date().toISOString() });
      throw new BudgetExhaustedError(`PHASE3_601_COST_BOUND_DURING_RUN before ${stage}: ${reason}`);
    }
    return remaining;
  }
  record(stage: string, model: string, inT: number, outT: number, cr: number, cw: number, remainingBefore: number): void {
    const cost = calculateCostUsd(inT + cr + cw, outT, model) ?? 0;
    this.spent += cost;
    this.calls.push({ n: this.calls.length + 1, stage, model, inputTokens: inT, outputTokens: outT, cacheRead: cr, cacheWrite: cw, costUsd: cost, conservativeRemainingBeforeUsd: +remainingBefore.toFixed(4), at: new Date().toISOString() });
    console.log(`  [cost] ${stage}: in=${inT} out=${outT} +$${cost.toFixed(4)} (spent $${this.spent.toFixed(4)} / cap $${this.capUsd.toFixed(2)}, conservative remaining before call $${remainingBefore.toFixed(2)})`);
  }
  costByPrefix(p: string): number { return this.calls.filter((c) => c.stage.startsWith(p)).reduce((a, c) => a + c.costUsd, 0); }
  countByPrefix(p: string): number { return this.calls.filter((c) => c.stage.startsWith(p)).length; }
}

class GuardedStageCaller implements StageCaller {
  providerName: string; model: string; isSynthetic = false;
  constructor(private inner: StageCaller, private label: string, private guard: Guard, private onCall: (stage: string) => void) { this.providerName = inner.providerName; this.model = inner.model; }
  async call<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string): Promise<T> {
    const tag = `${this.label}:${stage}`;
    const remaining = this.guard.check(tag);
    this.onCall(stage);
    const out = await this.inner.call(schema, stage, systemPrompt, userContent);
    const t = this.inner.lastTelemetry();
    this.guard.record(tag, this.model, t?.inputTokens ?? Math.ceil((systemPrompt.length + userContent.length) / CHARS_PER_TOKEN), t?.outputTokens ?? ASSUMED_OUTPUT_TOKENS, t?.cachedInputTokens ?? 0, t?.cacheCreationInputTokens ?? 0, remaining);
    return out;
  }
  lastTelemetry(): AnalyzerCallTelemetry | null { return this.inner.lastTelemetry(); }
}

function guardedCompileClient(real: Anthropic, guard: Guard, onTurn: () => void): MinimalAnthropicClient {
  return { messages: { stream: (params) => {
    const remaining = guard.check("compile:turn");
    onTurn();
    return { finalMessage: async () => {
      const m = await real.messages.stream(params as never).finalMessage();
      const u = m.usage as unknown as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
      guard.record("compile:turn", params.model, u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, remaining);
      return m;
    } };
  } } };
}

void (async () => {
  console.log("=========== PHASE 3 FINAL-BRIDGE / 6.01 RESUME (FUNDED) ===========");
  if (existsSync(`${OUT}/21-funded-final-verdict.json`)) throw new Error("FATAL: funded-run evidence already exists - evidence is never rewritten");

  // ---------------- §1/§2/§3 freeze and identity verification
  const actualSha = gitSha();
  const productionTree = execSync("git ls-tree -r HEAD --name-only lib/contract-model/compiler | sort | xargs sha256sum | sha256sum", { encoding: "utf8" }).split(" ")[0];
  const verifierSrc = readFileSync("lib/contract-model/compiler/semantic-verification/verify.ts", "utf8");
  const verifierVersion = verifierSrc.match(/VERIFIER_(?:ALGORITHM_)?VERSION\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const sourceSha = sha256(readFileSync(CHWY_SRC));
  const { refHash, byLabel } = section601ReferenceItems();
  const built = buildSection601();
  const { sec, operativeSourceText, sourceContext } = built;
  const sectionSha = sha256(operativeSourceText);
  const inSpan = byLabel.filter((i) => i.span[0] >= sec.charStart && i.span[1] <= sec.charEnd);
  const crit = byLabel.filter((i) => i.materiality === "CRITICAL").length;
  const mat = byLabel.filter((i) => i.materiality === "MATERIAL").length;
  const idChecks = {
    startingSha: { expected: STARTING_SHA, actual: actualSha, match: actualSha === STARTING_SHA },
    sourceSha256: { expected: EXPECT.sourceSha, actual: sourceSha, match: sourceSha === EXPECT.sourceSha },
    sectionTextSha256: { expected: EXPECT.sectionSha, actual: sectionSha, match: sectionSha === EXPECT.sectionSha },
    sectionSpan: { expected: [EXPECT.charStart, EXPECT.charEnd], actual: [sec.charStart, sec.charEnd], match: sec.charStart === EXPECT.charStart && sec.charEnd === EXPECT.charEnd },
    sectionChars: { expected: EXPECT.chars, actual: operativeSourceText.length, match: operativeSourceText.length === EXPECT.chars },
    referenceSha256: { expected: EXPECT.refSha, actual: refHash, match: refHash === EXPECT.refSha },
    referenceSlice: { expected: { total: EXPECT.refItems, critical: EXPECT.refCritical, material: EXPECT.refMaterial }, actual: { total: byLabel.length, critical: crit, material: mat }, match: byLabel.length === EXPECT.refItems && crit === EXPECT.refCritical && mat === EXPECT.refMaterial },
    labelSpanAgreement: { byLabel: byLabel.length, bySpan: inSpan.length, match: inSpan.length === byLabel.length },
  };
  const allIdOk = Object.values(idChecks).every((c) => c.match);
  console.log(`  identity checks: ${allIdOk ? "ALL MATCH" : "MISMATCH"}`);
  if (!allIdOk) { writeJson(`${OUT}/11-funded-baseline-and-cost-gate.json`, { artifact: "PHASE 3 FINAL-BRIDGE §1-§3 - identity verification FAILED", at: new Date().toISOString(), idChecks, decision: "PHASE3_601_ENVIRONMENT_BLOCKED", paidCallsMade: 0 }); throw new Error("FATAL: frozen identity mismatch - no paid call made"); }

  // ---------------- §4/§5 deterministic plan + frozen cost methodology
  const emptyInv = { candidateRef: built.candidateRef, items: [], uninventoriedValues: [], unaccountedSource: [], sourceCoverage: null, gapReinventory: null, inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER", inventoryStatusReason: "preflight estimate", rejectedUnverifiableItems: [], rejectedDuplicateItems: [], sourceContextState: sourceContext.state, frozenContentHash: "preflight", frozenAt: "", algorithmVersion: "", promptVersion: "", provider: "", model: "", telemetryCostUsd: null } as unknown as Parameters<typeof planCompilationShards>[0]["frozenInventory"];
  const prePlan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: "doc-a", sourceContext, frozenInventory: emptyInv, structuralIndex: built.chewy.index, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
  const preMode = selectCompilationExecutionMode(prePlan);
  const { partitionSourceSlots, batchSlots } = await import("../lib/contract-model/compiler/semantic-accountability/slots");
  const batchesPerPass = batchSlots(partitionSourceSlots({ sourceContext, structuralIndex: built.chewy.index }), sourceContext, 6000).length;
  const r = observedRates();
  const mean = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, r, r.passABatchMean, r.passAGapMean, r.passBMean, 1);
  const worst = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, r, r.passABatchWorst, r.passAGapWorst, r.passBWorst, 1);
  const conservative = estimate601(batchesPerPass, prePlan.totals.estimatedInputTokens, r, r.passABatchWorst, r.passAGapWorst, r.passBWorst, 1.25);
  const priorEstimates = JSON.parse(readFileSync(`${OUT}/01-cost-preflight.json`, "utf8")).estimates;

  const creditsBefore = await gatewayCredits();
  const balanceBefore = creditsBefore ? Number(creditsBefore.balance) : 0;
  const balanceOk = balanceBefore >= CAP_USD;
  const conservativeOk = conservative.totalUsd <= CAP_USD;
  const gatePassed = balanceOk && conservativeOk;
  console.log(`  mean $${mean.totalUsd} worst $${worst.totalUsd} conservative $${conservative.totalUsd} | cap $${CAP_USD} balance $${balanceBefore} -> ${gatePassed ? "CLEAR_TO_EXECUTE" : "BOUND"}`);

  const worstShardUsd = (() => { const { loadFrozenStage1, loadStage2 } = require("./f7b3-lib"); const s1 = loadFrozenStage1(), s2 = loadStage2(); const all = [...s1.values(), ...s2.values()] as { record: { actual: { costUsd: number } } }[]; return Math.max(...all.map((e) => e.record.actual.costUsd)); })();

  writeJson(`${OUT}/11-funded-baseline-and-cost-gate.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE §1-§6 - funded-run freeze, identity verification and the cost gate (0 model calls in this step; one gateway balance read)",
    at: new Date().toISOString(),
    idChecks, allIdentityChecksMatch: allIdOk,
    productionCompilerTreeSha256: productionTree,
    productionSemanticChangeSincePriorPreflight: { filesChangedUnderLibTestsAppPrisma: Number(execSync("git diff a013ffd HEAD --name-only | grep -cE '^(lib|tests|app|prisma)/' || true", { encoding: "utf8" }).trim()), note: "compared against a013ffd, the SHA at which artifacts 00-10 were produced" },
    versions: { compilerAlgorithm: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPrompt: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicy: SEMANTIC_COMPILER_TOOL_POLICY_VERSION, accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, sourceIdentityMigration: SOURCE_IDENTITY_MIGRATION_VERSION, executionPolicy: SEMANTIC_EXECUTION_POLICY_VERSION, shardPlanner: SHARD_PLANNER_ALGORITHM_VERSION, irSchema: IR_SCHEMA_VERSION, verifier: verifierVersion },
    costMethodology: { source: "docs/phase-3-final-601/01-cost-preflight.json", conservativeDefinition: "worstObservedRate x 1.25", redefined: false, ratesRecomputedFromLedgers: true },
    rates: r,
    deterministicPlan: { mode: preMode.mode, reason: preMode.reason, planHash: prePlan.planHash, shards: prePlan.shards.length, oversizedShards: prePlan.totals.oversizedShards, plannerEstimatedInputTokens: prePlan.totals.estimatedInputTokens, passABatchesPerPass: batchesPerPass, plannedWithEmptyInventory: true },
    estimates: { meanRate: mean, worstObservedRate: worst, conservative: { ...conservative, safetyFactor: 1.25 } },
    reproductionOfPriorPreflight: { prior: priorEstimates, identical: JSON.stringify(priorEstimates.conservative.totalUsd) === JSON.stringify(conservative.totalUsd), note: "same SHA family, same ledgers, same plan - the tiers reproduce exactly; no rate or assumption was altered" },
    gate: { hardCapUsd: CAP_USD, gatewayBalanceUsd: balanceBefore, balanceCoversCap: balanceOk, conservativeFitsCap: conservativeOk, passed: gatePassed },
    decision: gatePassed ? "CLEAR_TO_EXECUTE" : "PHASE3_601_COST_BOUND_BEFORE_START",
  });
  if (!gatePassed) { console.log("PHASE3_601_COST_BOUND_BEFORE_START - zero paid calls"); process.exit(0); }

  // ---------------- §8-§17 the paid run
  const guard = new Guard(r, worstShardUsd, batchesPerPass, prePlan.totals.estimatedInputTokens, prePlan.shards.length, CAP_USD, balanceBefore);
  const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
  let pass1Calls = 0, pass2Calls = 0, activePass = 1, compileTurns = 0;
  const mkInventoryCaller = (label: string, onCall: (s: string) => void) => new GuardedStageCaller(getStageCaller(), label, guard, onCall);
  const inv1 = mkInventoryCaller("passA-1", (stage) => { pass1Calls++; activePass = 1; if (stage.endsWith("_gap")) guard.passAGapRemaining = Math.max(0, guard.passAGapRemaining - 1); else guard.passABatchesRemaining = Math.max(0, guard.passABatchesRemaining - 1); });
  const inv2 = mkInventoryCaller("passA-2", (stage) => { pass2Calls++; activePass = 2; if (stage.endsWith("_gap")) guard.passAGapRemaining = Math.max(0, guard.passAGapRemaining - 1); else guard.passABatchesRemaining = Math.max(0, guard.passABatchesRemaining - 1); });
  const verifyCaller = new GuardedStageCaller(getStageCaller(), "verify-review", guard, () => { guard.verifierReviewRemaining = 0; });
  const suspicionCaller = new GuardedStageCaller(getStageCaller(), "verify-suspicion", guard, () => { guard.conditionSuspicionRemaining = Math.max(0, guard.conditionSuspicionRemaining - 1); });
  if ((inv1.providerName as string) === "synthetic" || inv1.isSynthetic) throw new Error("FATAL: no real credential - PHASE3_601_ENVIRONMENT_BLOCKED");
  const perShardTokens = prePlan.shards.map((s) => s.estimate.inputTokens);
  let shardIdx = 0;
  const semanticCaller = new RealSemanticCaller("vercel-ai-gateway", process.env.SEMANTIC_COMPILER_MODEL ?? model, guardedCompileClient(new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL }), guard, () => { compileTurns++; }));
  // Pass A is finished once Pass B's first turn arrives; each new shard consumes its planned token budget.
  const originalCompile = semanticCaller.compile.bind(semanticCaller);
  (semanticCaller as unknown as { compile: typeof originalCompile }).compile = async (inp) => {
    guard.passABatchesRemaining = 0; guard.passAGapRemaining = 0;
    if (shardIdx < perShardTokens.length) { guard.passBTokensRemaining = Math.max(0, guard.passBTokensRemaining - perShardTokens[shardIdx]!); guard.passBShardsRemaining = Math.max(0, guard.passBShardsRemaining - 1); }
    shardIdx++;
    return originalCompile(inp);
  };
  console.log(`  models: inventory=${inv1.model} compiler=${semanticCaller.model}`);

  const compilerInput: SemanticCompilerInput = built.input as SemanticCompilerInput;
  const startedAt = new Date().toISOString();
  let compileResult: Awaited<ReturnType<typeof compileCovenantToIR>> | null = null;
  let compileError: string | null = null; let boundDuringRun = false;
  const spentBeforeCompile = guard.spent;
  try {
    compileResult = await compileCovenantToIR(compilerInput, {
      caller: semanticCaller,
      inventoryMode: "DUAL_PASS_ENSEMBLE",
      inventoryPassCallers: [inv1, inv2],
      cache: new InMemorySemanticCompilationCache(),
      // §8/§11: no frozenInventory, no priorShardResults, no shardExecutor - production runs everything fresh.
    });
  } catch (e) { compileError = e instanceof Error ? e.message : String(e); boundDuringRun = e instanceof BudgetExhaustedError; console.log(`  COMPILE ${boundDuringRun ? "COST-BOUND" : "THREW"}: ${compileError}`); }
  const compileCost = guard.spent - spentBeforeCompile;
  if (compileResult) console.log(`  -> compile ${compileResult.status} mode=${compileResult.execution?.mode} shards=${compileResult.execution?.plannedShards} rules=${compileResult.rules.length} defs=${compileResult.definitions.length} caps=${compileResult.sharedCapacities.length}`);

  let verifyResult: Awaited<ReturnType<typeof verifyCompiledCandidate>> | null = null;
  let verifyError: string | null = null;
  const spentBeforeVerify = guard.spent;
  if (compileResult && compileResult.status !== "FAILED") {
    const op = compileResult.sourceContext?.regions[0];
    const verifierInput: SemanticCompilerInput = op && op.text !== compilerInput.operativeSourceText
      ? { ...compilerInput, operativeSourceText: op.text, operativeCharStart: op.charStart, sourceContext: undefined, frozenInventory: undefined }
      : { ...compilerInput, sourceContext: undefined, frozenInventory: undefined };
    try { verifyResult = await verifyCompiledCandidate({ compilerInput: verifierInput, compilationResult: compileResult }, { reviewCaller: verifyCaller, conditionSuspicionCaller: suspicionCaller }); console.log(`  -> verify ${verifyResult.status} findings=${verifyResult.findings.length} reviewInvoked=${verifyResult.semanticReviewInvoked}`); }
    catch (e) { verifyError = e instanceof Error ? e.message : String(e); boundDuringRun = boundDuringRun || e instanceof BudgetExhaustedError; console.log(`  VERIFY ${e instanceof BudgetExhaustedError ? "COST-BOUND" : "THREW"}: ${verifyError}`); }
  }
  const verifyCost = guard.spent - spentBeforeVerify;
  const creditsAfter = await gatewayCredits();
  const balanceAfter = creditsAfter ? Number(creditsAfter.balance) : null;

  // ---------------- persist raw evidence (the scorer reads ONLY these frozen files)
  writeJson(`${RAW}/compile-result.json`, compileResult);
  writeJson(`${RAW}/verify-result.json`, verifyResult);
  const inv = compileResult?.frozenInventory ?? null;
  const ens = (inv as unknown as { ensemble?: Record<string, unknown> } | null)?.ensemble ?? null;

  writeJson(`${OUT}/12-funded-paid-ledger.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE §26 - funded paid-call ledger", at: new Date().toISOString(), startedAt,
    capUsd: CAP_USD, paidCalls: guard.calls.length, spendUsd: +guard.spent.toFixed(6),
    costBreakdown: {
      passAPass1Usd: +guard.costByPrefix("passA-1").toFixed(6), passAPass2Usd: +guard.costByPrefix("passA-2").toFixed(6),
      passBUsd: +guard.costByPrefix("compile:").toFixed(6),
      conditionSuspicionUsd: +guard.costByPrefix("verify-suspicion").toFixed(6), semanticReviewUsd: +guard.costByPrefix("verify-review").toFixed(6),
      providerRetriesUsd: 0, otherUsd: 0, totalUsd: +guard.spent.toFixed(6),
    },
    callCounts: { passA1: pass1Calls, passA2: pass2Calls, compileTurns, conditionSuspicion: guard.countByPrefix("verify-suspicion"), semanticReview: guard.countByPrefix("verify-review") },
    gatewayBalanceBefore: balanceBefore, gatewayBalanceAfter: balanceAfter,
    gatewayReportedSpendUsd: creditsBefore && creditsAfter ? +(Number(creditsAfter.total_used) - Number(creditsBefore.total_used)).toFixed(6) : null,
    guardRefusals: guard.refusals, costBoundDuringRun: boundDuringRun,
    calls: guard.calls,
  });

  writeJson(`${OUT}/13-funded-pass-a.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE §9 - fresh DUAL_PASS_ENSEMBLE Pass A", at: new Date().toISOString(),
    mode: "DUAL_PASS_ENSEMBLE", freshExecution: true, frozenInventorySupplied: false,
    passes: (compileResult?.inventoryPasses ?? []).map((p, i) => ({ ...p, calls: i === 0 ? pass1Calls : pass2Calls, costUsd: +guard.costByPrefix(i === 0 ? "passA-1" : "passA-2").toFixed(6) })),
    authoritativeInventory: inv ? { inventoryStatus: inv.inventoryStatus, inventoryStatusReason: inv.inventoryStatusReason, items: inv.items.length, frozenContentHash: inv.frozenContentHash, sourceContextState: inv.sourceContextState, rejectedUnverifiableItems: inv.rejectedUnverifiableItems, rejectedDuplicateItems: inv.rejectedDuplicateItems, provider: inv.provider, model: inv.model, telemetryCostUsd: inv.telemetryCostUsd, partition: (inv as unknown as { partition?: unknown }).partition ?? null, sourceIdentity: (inv as unknown as { sourceIdentity?: unknown }).sourceIdentity ?? null } : null,
    sourceCoverage: inv?.sourceCoverage ?? null,
    unaccountedSource: inv?.unaccountedSource ?? null,
    uninventoriedValues: inv?.uninventoriedValues ?? null,
    gapReinventory: inv?.gapReinventory ?? null,
    ensemble: ens,
    batchesPredictedPerPass: batchesPerPass,
  });

  const ex = compileResult?.execution ?? null;
  writeJson(`${OUT}/14-funded-production-compile.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE §8/§10/§14/§15 - production compileCovenantToIR execution", at: new Date().toISOString(),
    entryPoint: "compileCovenantToIR", frozenInventoryReused: false, priorShardResultsReused: false, shardExecutorOverridden: false,
    status: compileResult?.status ?? null, failureReasons: compileResult?.failureReasons ?? null, errorDetail: compileResult?.errorDetail ?? null,
    compileError, costBoundDuringRun: boundDuringRun, costUsd: +compileCost.toFixed(6),
    execution: ex,
    planComparisonVsPreflight: { preflightPlanHash: prePlan.planHash, preflightShards: prePlan.shards.length, actualPlanHash: ex?.planHash ?? null, actualShards: ex?.plannedShards ?? null, identical: ex?.planHash === prePlan.planHash, note: "the preflight plan was built with an EMPTY inventory; the production plan was built with the REAL fresh Pass A inventory, so ownership assignment differs even when the shard structure matches" },
    output: compileResult ? { rules: compileResult.rules.length, definitions: compileResult.definitions.length, sharedCapacities: compileResult.sharedCapacities.length, irExtensionCandidates: compileResult.irExtensionCandidates.length } : null,
    sourceContext: compileResult?.sourceContext ? { state: compileResult.sourceContext.state, regions: compileResult.sourceContext.regions.length, totalChars: compileResult.sourceContext.totalChars, unresolvedReferences: compileResult.sourceContext.unresolvedReferences.length } : null,
    provider: compileResult?.provider ?? null, model: compileResult?.model ?? null,
    rawEvidence: `${RAW}/compile-result.json`,
  });

  const acc = compileResult?.accountability ?? null;
  writeJson(`${OUT}/15-funded-pass-c.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE §16 - global Pass C (final completeness authority)", at: new Date().toISOString(),
    present: acc !== null, semanticallyComplete: acc?.semanticallyComplete ?? null, counts: acc?.counts ?? null,
    reasons: acc?.reasons ?? null, supportReviewRequired: (acc as unknown as { supportReviewRequired?: boolean })?.supportReviewRequired ?? null,
    items: acc?.items ?? null,
  });

  writeJson(`${OUT}/16-funded-verifier.json`, {
    artifact: "PHASE 3 FINAL-BRIDGE §17 - independent verifier on the untouched production result", at: new Date().toISOString(),
    ranOnUntouchedProductionOutput: true, verifierBehaviourModified: false, routingForced: false,
    status: verifyResult?.status ?? null, verifyError,
    semanticReviewInvoked: verifyResult?.semanticReviewInvoked ?? null,
    conditionSuspicion: verifyResult?.conditionSuspicion ?? null,
    findings: verifyResult?.findings ?? null,
    findingCounts: verifyResult ? { total: verifyResult.findings.length, MATERIAL: verifyResult.findings.filter((f) => f.severity === "MATERIAL").length, UNCERTAIN: verifyResult.findings.filter((f) => f.severity === "UNCERTAIN").length, NON_MATERIAL: verifyResult.findings.filter((f) => f.severity === "NON_MATERIAL").length } : null,
    callCounts: { semanticReview: guard.countByPrefix("verify-review"), conditionSuspicion: guard.countByPrefix("verify-suspicion") },
    costUsd: +verifyCost.toFixed(6),
    rawEvidence: `${RAW}/verify-result.json`,
  });

  console.log(`\n=========== DONE spent $${guard.spent.toFixed(4)} / cap $${CAP_USD} calls=${guard.calls.length} refusals=${guard.refusals.length} balanceAfter=${balanceAfter} ===========`);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
