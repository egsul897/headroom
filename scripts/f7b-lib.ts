/**
 * F-7B shared harness (harness-only code, never production): freezes the F-7A Chewy 1.01 plan, reproduces it, and
 * executes shards through the REAL production planner -> RealSemanticCaller -> compileCovenantToIR post-processing ->
 * stitcher path with a per-shard, per-turn cost guard and a durable ledger. No production module is modified.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import type Anthropic from "@anthropic-ai/sdk";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../lib/contract-model/compiler/semantic/caller";
import { buildShardCompilerInput, planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { classifyShardStatus } from "../lib/contract-model/compiler/semantic/shard-execution";
import { SHARD_PLANNER_ALGORITHM_VERSION, estimateTokensFromChars, type CompilationShard, type ShardExecutionResult, type ShardPlan } from "../lib/contract-model/compiler/semantic/shard-types";
import { SubmitCompilationSchema } from "../lib/contract-model/compiler/semantic/wire-schema";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { calculateCostUsd } from "../lib/contract-model/analyzer/telemetry";
import { DEFAULT_GATEWAY_ANALYZER_MODEL } from "../lib/contract-model/analyzer/anthropic-analyzer";
import { buildChewy, buildChewyCallerInput, capturingClient, CHWY_SRC, COMPANY, INSTRUMENT, type Captured } from "./f7a-lib";

export const F7B_DIR = "docs/phase-3-remediation-f7b";
export const F7B_EVIDENCE_DIR = "tests/fixtures/unseen-packages/f7b-chewy-101-canary";
export const F7A_STARTING_SHA = "8b6bd445ae56bb6d66406706d76b45a83ac690be";
export const F7A_BASELINE = { planHash: "67d9f086341b4677ca35697fcfb6878cb88ef92b9c0418ea32be96be741cfe36", shardCount: 36, materialItems: 108, ownedOnce: 108, unowned: 0, multiplyOwned: 0, maxRenderedInputTokens: 34344, plannerMaxInputTokens: 30562, oversizedShards: 1 };
export const F7B_BUDGET = { targetPrimaryChars: 12_000, maxPrimaryChars: 24_000, maxContextChars: 10_000, maxContextEntryChars: 1_800, maxUnitsPerShard: 16 };
export const MODEL = process.env.SEMANTIC_COMPILER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
export const PROVIDER = "vercel-ai-gateway";
/** Pre-registered cost estimator (docs 00-precheck): input = TURN_FACTOR x rendered first turn (recorded Chewy 6.08: all-turn input / first-turn input = 314,844 / 95,786 = 3.29); output = the F-7A planner's per-shard estimate (1,500 + 2,500 x units), itself above the recorded 1,535 output tokens per emitted object. */
export const TURN_FACTOR = 3.29;
export const STAGE1_CAP_USD = 3.0;
export const MISSION_CAP_USD = 15.0;

export function sha256(s: string | Buffer): string { return createHash("sha256").update(s).digest("hex"); }
export function gitSha(): string { return execSync("git rev-parse HEAD").toString().trim(); }
export function writeJson(path: string, data: unknown): void { mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true }); writeFileSync(path, JSON.stringify(data, null, 1)); }
export function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf-8")) as T; }

export function loadGatewayKey(): boolean {
  if (!process.env.AI_GATEWAY_API_KEY) {
    try { const m = readFileSync(".env.local", "utf-8").match(/AI_GATEWAY_API_KEY=(.+)/); if (m) process.env.AI_GATEWAY_API_KEY = m[1]!.trim(); } catch { /* absent */ }
  }
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

export async function gatewayCredits(): Promise<{ balance: string; total_used: string } | null> {
  try { const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}` } }); return r.ok ? ((await r.json()) as { balance: string; total_used: string }) : null; } catch { return null; }
}

// ---------------------------------------------------------------------------
// Freeze + plan reproduction (zero cost)
// ---------------------------------------------------------------------------
export interface Frozen {
  chewy: ReturnType<typeof buildChewy>;
  unit: { candidateRef: string; compile: { frozenInventory: { frozenContentHash: string; items: unknown[] } } };
  callerInput: SemanticCompilerInput;
  plan: ShardPlan;
  identity: Record<string, unknown>;
}

export function freezeAndPlan(): Frozen {
  const chewy = buildChewy();
  const { unit, callerInput } = buildChewyCallerInput("1.01", chewy);
  const plan = planCompilationShards({ candidateRef: callerInput.candidateRef, companyId: callerInput.companyId, instrumentKey: callerInput.instrumentKey, documentId: "doc-a", sourceContext: callerInput.sourceContext!, frozenInventory: callerInput.frozenInventory!, structuralIndex: chewy.index, budget: F7B_BUDGET, generation: { algorithmVersion: callerInput.compilerAlgorithmVersion, promptVersion: callerInput.compilerPromptVersion } });
  const region = callerInput.sourceContext!.regions[0]!;
  const identity = {
    gitSha: gitSha(),
    documentSha256: sha256(readFileSync(CHWY_SRC)),
    unitFixtureSha256: sha256(readFileSync("tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-1.01.json")),
    candidateRef: callerInput.candidateRef,
    companyId: COMPANY,
    instrumentKey: INSTRUMENT,
    structuralIndexIdentity: { anchorNodeId: callerInput.contextBundle.originatingStructuralNodeIds?.[0] ?? null, definitionsInUnit: plan.units.filter((u) => u.kind === "DEFINITION").length, unitsSha256: sha256(JSON.stringify(plan.units.map((u) => [u.unitKey, u.charStart, u.charEnd, u.textHash]))) },
    sourceContextIdentity: { state: callerInput.sourceContext!.state, regionCharStart: region.charStart, regionCharEnd: region.charEnd, regionChars: region.text.length, regionSha256: sha256(region.text), unresolvedReferences: callerInput.sourceContext!.unresolvedReferences.length },
    frozenInventory: { frozenContentHash: callerInput.frozenInventory!.frozenContentHash, items: callerInput.frozenInventory!.items.length, material: callerInput.frozenInventory!.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").length, inventoryStatus: callerInput.frozenInventory!.inventoryStatus, algorithmVersion: callerInput.frozenInventory!.algorithmVersion },
    shardPlannerAlgorithmVersion: SHARD_PLANNER_ALGORITHM_VERSION,
    compilerPromptVersion: callerInput.compilerPromptVersion,
    compilerAlgorithmVersion: callerInput.compilerAlgorithmVersion,
    toolPolicyVersion: callerInput.toolPolicyVersion,
    irSchemaVersion: callerInput.irSchemaVersion,
    provider: PROVIDER,
    model: MODEL,
    budget: F7B_BUDGET,
  };
  return { chewy, unit, callerInput, plan, identity };
}

/** Renders every shard's first turn through the real caller with the capturing client (zero cost) - the exact input the paid call will send. */
export async function renderFirstTurns(frozen: Frozen): Promise<Map<string, { chars: number; tokens: number; system: number; user: number; tools: number }>> {
  const out = new Map<string, { chars: number; tokens: number; system: number; user: number; tools: number }>();
  for (const shard of frozen.plan.shards) {
    const shardInput = buildShardCompilerInput(frozen.callerInput, frozen.plan, shard);
    const sink: Captured[] = [];
    await new RealSemanticCaller("capture", "capture-model", capturingClient(sink)).compile(shardInput);
    const c = sink[0]!;
    const chars = c.system.length + c.user.length + c.toolsJson.length;
    out.set(shard.shardId, { chars, tokens: estimateTokensFromChars(chars), system: c.system.length, user: c.user.length, tools: c.toolsJson.length });
  }
  return out;
}

export function preCallEstimateUsd(renderedTokens: number, shard: CompilationShard): { inputTokens: number; outputTokens: number; usd: number } {
  const inputTokens = Math.ceil(renderedTokens * TURN_FACTOR);
  const outputTokens = shard.estimate.outputTokens;
  return { inputTokens, outputTokens, usd: calculateCostUsd(inputTokens, outputTokens, MODEL) ?? 0 };
}

// ---------------------------------------------------------------------------
// Durable ledger + guard
// ---------------------------------------------------------------------------
export interface LedgerCall { n: number; stage: number; shardId: string; turn: number; model: string; inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number; estimatedBeforeTurnUsd: number; at: string }
export interface Ledger { missionCapUsd: number; stage1CapUsd: number; spentUsd: number; stage1SpentUsd: number; calls: LedgerCall[]; refusals: { stage: number; shardId: string; kind: "PRE_SHARD" | "PRE_TURN"; estimatedUsd: number; spentUsd: number; capUsd: number; at: string }[] }
export const LEDGER_PATH = `${F7B_DIR}/06-per-shard-ledger.json`;
export function loadLedger(): Ledger { return existsSync(LEDGER_PATH) ? readJson<Ledger>(LEDGER_PATH) : { missionCapUsd: MISSION_CAP_USD, stage1CapUsd: STAGE1_CAP_USD, spentUsd: 0, stage1SpentUsd: 0, calls: [], refusals: [] }; }
export function saveLedger(l: Ledger): void { writeJson(LEDGER_PATH, l); }

export class BudgetExhaustedError extends Error { constructor(msg: string) { super(msg); this.name = "BudgetExhaustedError"; } }

/** Remaining cap for a call in this stage: the mission cap always binds; Stage 1 additionally binds its own cap. */
export function remainingCapUsd(ledger: Ledger, stage: number): number {
  const mission = ledger.missionCapUsd - ledger.spentUsd;
  return stage === 1 ? Math.min(mission, ledger.stage1CapUsd - ledger.stage1SpentUsd) : mission;
}

/** The guarded client: every turn is pre-checked against the remaining cap (mission and, in Stage 1, the stage cap) and every turn's real usage is ledgered immediately (durable). */
export function guardedClient(real: Anthropic, ledger: Ledger, stage: number, shardId: string, outputEstimateTokens: number): MinimalAnthropicClient {
  let turn = 0;
  return {
    messages: {
      stream: (params) => {
        turn++;
        const inputChars = params.system.length + JSON.stringify(params.messages).length + JSON.stringify(params.tools).length;
        const est = calculateCostUsd(estimateTokensFromChars(inputChars), outputEstimateTokens, params.model) ?? 0;
        const remaining = remainingCapUsd(ledger, stage);
        if (est > remaining) {
          ledger.refusals.push({ stage, shardId, kind: "PRE_TURN", estimatedUsd: est, spentUsd: ledger.spentUsd, capUsd: stage === 1 ? Math.min(ledger.missionCapUsd, ledger.stage1CapUsd) : ledger.missionCapUsd, at: new Date().toISOString() });
          saveLedger(ledger);
          throw new BudgetExhaustedError(`F7B_COST_GUARD: turn ${turn} of ${shardId} estimated $${est.toFixed(4)} > remaining $${remaining.toFixed(4)}`);
        }
        const thisTurn = turn;
        return {
          finalMessage: async () => {
            const m = await real.messages.stream(params as never).finalMessage();
            const u = m.usage as unknown as { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
            const cost = calculateCostUsd((u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), u.output_tokens ?? 0, params.model) ?? 0;
            ledger.spentUsd += cost;
            if (stage === 1) ledger.stage1SpentUsd += cost;
            ledger.calls.push({ n: ledger.calls.length + 1, stage, shardId, turn: thisTurn, model: params.model, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, costUsd: cost, estimatedBeforeTurnUsd: est, at: new Date().toISOString() });
            saveLedger(ledger);
            console.log(`  [cost] ${shardId} turn ${thisTurn}: in=${u.input_tokens} out=${u.output_tokens} +$${cost.toFixed(4)} (spent $${ledger.spentUsd.toFixed(4)} / mission cap $${ledger.missionCapUsd.toFixed(2)})`);
            return m;
          },
        };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Per-shard execution through the production path + per-shard metrics
// ---------------------------------------------------------------------------
export interface ShardRecord {
  stage: number;
  attempt: number;
  shardId: string;
  shardHash: string;
  ordinal: number;
  ownedUnits: number;
  sourceChars: number;
  contextEntries: number;
  contextChars: number;
  unresolvedContext: number;
  oversized: boolean;
  ownedItems: number;
  ownedMaterialItems: number;
  estimatedFirstTurnInputTokens: number;
  preCallEstimate: { inputTokens: number; outputTokens: number; usd: number };
  actual: { inputTokens: number; outputTokens: number; turns: number; latencyMs: number; costUsd: number; attemptCount: number; retryCount: number; rateLimitFailures: number };
  compileStatus: SemanticCompilationResult["status"];
  shardStatus: ShardExecutionResult["status"];
  failureReasons: string[];
  toolCalls: number;
  toolCallNames: string[];
  rawSubmissionRetained: boolean;
  rules: number;
  definitions: number;
  sharedCapacities: number;
  dispositionsEmitted: number;
  ownedAccountability: { represented: number; dispositioned: number; missingMaterial: number; valuesRepresented: number; valuesMissing: number; danglingLineage: number; semanticallyComplete: boolean; byDisposition: Record<string, number> };
  lineageClaimsOnUnownedItems: number;
  definitionsOutsideOwnedUnits: string[];
  unresolvedIssues: string[];
  errorSummary: string | null;
}

export function collectLineageIds(o: unknown): string[] {
  const ids: string[] = [];
  const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const r = x as Record<string, unknown>; if (Array.isArray(r.inventoryItemIds)) ids.push(...(r.inventoryItemIds as string[])); for (const v of Object.values(r)) if (v && typeof v === "object") walk(v); };
  walk(o);
  return ids;
}
const digestOf = (id: string): string => { const i = id.indexOf(":"); return (i >= 0 ? id.slice(i + 1) : id).toLowerCase(); };

export function dispositionsFromRaw(raw: unknown): { inventoryItemId: string; disposition: string; note: string }[] {
  const parsed = SubmitCompilationSchema.safeParse(raw);
  return parsed.success ? (parsed.data.inventoryDispositions ?? []) : [];
}

export async function executeShard(frozen: Frozen, shard: CompilationShard, stage: number, attempt: number, ledger: Ledger, real: Anthropic, renderedTokens: number): Promise<{ record: ShardRecord; result: ShardExecutionResult; compile: SemanticCompilationResult; shardInput: SemanticCompilerInput }> {
  const shardInput = buildShardCompilerInput(frozen.callerInput, frozen.plan, shard);
  const caller = new RealSemanticCaller(PROVIDER, MODEL, guardedClient(real, ledger, stage, shard.shardId, shard.estimate.outputTokens));
  const callsBefore = ledger.calls.length;
  const started = Date.now();
  const compile = await compileCovenantToIR(shardInput, { caller, accountability: false, cache: new InMemorySemanticCompilationCache() });
  const latencyMs = Date.now() - started;
  const turns = ledger.calls.slice(callsBefore).filter((c) => c.shardId === shard.shardId);
  const dispositions = dispositionsFromRaw(compile.rawModelOutput);
  const shardStatus = classifyShardStatus(compile.status, compile.failureReasons);
  const composition = compile.status === "FAILED" && compile.rules.length === 0 && compile.definitions.length === 0 ? null : { rules: compile.rules, definitions: compile.definitions, sharedCapacities: compile.sharedCapacities, inventoryDispositions: dispositions };
  const result: ShardExecutionResult = { shardId: shard.shardId, shardHash: shard.shardHash, status: shardStatus, composition, failureReasons: compile.failureReasons, unresolvedIssues: compile.unresolvedIssues, reusedFromHash: false, attempts: attempt, telemetry: { inputTokens: compile.telemetry?.inputTokens ?? null, outputTokens: compile.telemetry?.outputTokens ?? null, costUsd: turns.reduce((a, c) => a + c.costUsd, 0) } };
  // Per-shard accountability over the OWNED inventory only (the shard's own obligation) - the global Pass C after stitching remains the authority.
  const ownedInv = shardInput.frozenInventory!;
  const acc = reconcileInventoryWithComposition({ inventory: ownedInv, composition: { rules: compile.rules, definitions: compile.definitions, sharedCapacities: compile.sharedCapacities }, dispositions, sourceContextState: shardInput.sourceContext!.state });
  const byDisposition: Record<string, number> = {};
  for (const it of acc.items) byDisposition[it.disposition] = (byDisposition[it.disposition] ?? 0) + 1;
  const owned = new Set(shard.ownedItemIds);
  const ownedDigests = new Set(shard.ownedItemIds.map(digestOf));
  const lineage = collectLineageIds({ rules: compile.rules, definitions: compile.definitions, sharedCapacities: compile.sharedCapacities });
  const unownedClaims = lineage.filter((id) => !owned.has(id) && !ownedDigests.has(digestOf(id))).length;
  const ownedTerms = new Set(shard.ownedUnitKeys.map((k) => frozen.plan.units.find((u) => u.unitKey === k)?.normalizedTermName).filter((t): t is string => Boolean(t)));
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  const outside = compile.definitions.map((d) => d.termName).filter((t) => !ownedTerms.has(norm(t)));
  const record: ShardRecord = {
    stage, attempt, shardId: shard.shardId, shardHash: shard.shardHash, ordinal: shard.ordinal, ownedUnits: shard.ownedUnitKeys.length, sourceChars: shard.primaryChars, contextEntries: shard.context.length, contextChars: shard.contextChars, unresolvedContext: shard.unresolvedContext.length, oversized: shard.oversized,
    ownedItems: shard.ownedItemIds.length, ownedMaterialItems: shard.ownedMaterialItemIds.length, estimatedFirstTurnInputTokens: renderedTokens, preCallEstimate: preCallEstimateUsd(renderedTokens, shard),
    actual: { inputTokens: compile.telemetry?.inputTokens ?? turns.reduce((a, c) => a + c.inputTokens, 0), outputTokens: compile.telemetry?.outputTokens ?? turns.reduce((a, c) => a + c.outputTokens, 0), turns: turns.length, latencyMs, costUsd: turns.reduce((a, c) => a + c.costUsd, 0), attemptCount: compile.telemetry?.attemptCount ?? 0, retryCount: compile.telemetry?.retryCount ?? 0, rateLimitFailures: compile.telemetry?.rateLimitFailures ?? 0 },
    compileStatus: compile.status, shardStatus, failureReasons: compile.failureReasons, toolCalls: compile.toolCallLog.length, toolCallNames: compile.toolCallLog.map((t) => t.toolName), rawSubmissionRetained: compile.rawModelOutput !== null && compile.rawModelOutput !== undefined,
    rules: compile.rules.length, definitions: compile.definitions.length, sharedCapacities: compile.sharedCapacities.length, dispositionsEmitted: dispositions.length,
    ownedAccountability: { represented: acc.counts.represented, dispositioned: acc.items.filter((i) => i.disposition !== "REPRESENTED" && i.disposition !== "MISSING_FROM_COMPOSITION").length, missingMaterial: acc.counts.materialMissingFromComposition, valuesRepresented: acc.items.reduce((a, i) => a + i.quantitative.filter((q) => q.disposition === "VALUE_PRESENT_IN_IR").length, 0), valuesMissing: acc.counts.materialQuantitativeValuesMissing, danglingLineage: acc.counts.danglingLineageReferences, semanticallyComplete: acc.semanticallyComplete, byDisposition },
    lineageClaimsOnUnownedItems: unownedClaims, definitionsOutsideOwnedUnits: outside, unresolvedIssues: compile.unresolvedIssues.slice(0, 40), errorSummary: compile.errorDetail ? JSON.stringify(compile.errorDetail).slice(0, 400) : (compile.telemetry?.error ? compile.telemetry.error.slice(0, 400) : null),
  };
  return { record, result, compile, shardInput };
}

export function evidencePath(shard: CompilationShard): string { return `${F7B_EVIDENCE_DIR}/shard-${String(shard.ordinal).padStart(2, "0")}-${shard.shardId.replace("shard:", "")}.json`; }
export function loadPriorResults(plan: ShardPlan): Map<string, { result: ShardExecutionResult; record: ShardRecord }> {
  const out = new Map<string, { result: ShardExecutionResult; record: ShardRecord }>();
  for (const s of plan.shards) {
    const p = evidencePath(s);
    if (existsSync(p)) { const e = readJson<{ result: ShardExecutionResult; record: ShardRecord }>(p); out.set(e.result.shardHash, e); }
  }
  return out;
}
