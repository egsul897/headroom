/**
 * F-7C - PRODUCTION ACTIVATION of bounded sharded compilation behind the unchanged public entry point.
 * Every test is provider-free: scripted semantic callers, scripted Pass A callers, scripted shard executors, and
 * resumed frozen inventories built by the synthetic corpus. Zero model calls.
 *
 *   §25 activation boundary A-H     §26 Pass-A call count      §27 Pass-C authority
 *   §28 failure isolation           §29 result reuse by hash   §30 invalidation
 *   §31 outer cache-key safety      §34 operative-state        §36/§37 honest telemetry
 */
import { describe, expect, it } from "vitest";
import { compileCovenantToIR, type CompileOptions } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache, computeCacheKey } from "../../lib/contract-model/compiler/semantic/cache";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { REUSABLE_TERMINAL_SHARD_STATUSES, type ShardExecutor } from "../../lib/contract-model/compiler/semantic/shard-execution";
import { selectCompilationExecutionMode, executionPolicyIdentity } from "../../lib/contract-model/compiler/semantic/execution-mode";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import type { SemanticCaller, SemanticCallerResult } from "../../lib/contract-model/compiler/semantic/caller";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { ShardExecutionResult, ShardPlan, ShardStatus, ShardBudget } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput, emptyContextBundle } from "./semantic-compiler/test-helpers";
import { buildDefinitionsCorpus, definitionFor, emitDefinitionsForShard, money, termName, CO, INST, DOC, type SyntheticCorpus } from "./f7a-synthetic-corpus";

const SMALL: Partial<ShardBudget> = { targetPrimaryChars: 1_200, maxPrimaryChars: 2_400, maxContextChars: 4_000, maxContextEntryChars: 600, maxUnitsPerShard: 16 };

// ---- collaborators that prove what did NOT happen -------------------------------------------------------------
function throwingCaller(tag = "semantic caller"): SemanticCaller & { calls: number } {
  const c = { calls: 0 } as { calls: number };
  return { providerName: "scripted", model: "scripted-model", isSynthetic: false, get calls() { return c.calls; }, compile: async () => { c.calls++; throw new Error(`${tag} must not be invoked`); } } as SemanticCaller & { calls: number };
}
function throwingInventory(): StageCaller & { calls: number } {
  const c = { calls: 0 };
  return { providerName: "scripted", model: "scripted", isSynthetic: false, get calls() { return c.calls; }, call: async () => { c.calls++; throw new Error("Pass A must not run - the frozen inventory is resumed"); }, lastTelemetry: () => null } as StageCaller & { calls: number };
}
function countingInventory(): StageCaller & { calls: number } {
  const c = { calls: 0 };
  return { providerName: "scripted", model: "scripted", isSynthetic: false, get calls() { return c.calls; }, call: async (schema) => { c.calls++; try { return schema.parse({ items: [], uninventoriedValues: [], notes: [] }); } catch { return schema.parse({}); } }, lastTelemetry: () => null } as StageCaller & { calls: number };
}
function scriptedCaller(build: (input: SemanticCompilerInput) => unknown): SemanticCaller & { calls: number; inputs: SemanticCompilerInput[] } {
  const c = { calls: 0, inputs: [] as SemanticCompilerInput[] };
  return { providerName: "scripted", model: "scripted-model", isSynthetic: false, get calls() { return c.calls; }, get inputs() { return c.inputs; }, compile: async (input) => { c.calls++; c.inputs.push(input); const raw = build(input); return { submission: SubmitCompilationSchema.parse(raw), rawSubmission: raw, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null } as SemanticCallerResult; } } as SemanticCaller & { calls: number; inputs: SemanticCompilerInput[] };
}

// ---- the unit under test: a synthetic definitions corpus handed to the PUBLIC entry point ---------------------
function inputFor(corpus: SyntheticCorpus, overrides: Partial<SemanticCompilerInput> = {}): SemanticCompilerInput {
  const region = corpus.sourceContext.regions[0]!;
  const contextBundle = overrides.contextBundle ?? emptyContextBundle();
  return testCompilerInput({ companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, candidateRef: corpus.frozenInventory.candidateRef, sourceSectionRef: "1.01", operativeSourceText: region.text, operativeCharStart: region.charStart, contextBundle, toolAccess: { structuralIndex: corpus.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle }, ...overrides });
}
/** The plan the production path will build (deterministic, same inputs) so scripted executors can emit per owned unit. */
function planFor(corpus: SyntheticCorpus, budget: Partial<ShardBudget> | undefined): ShardPlan {
  return planCompilationShards({ candidateRef: corpus.frozenInventory.candidateRef, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext: corpus.sourceContext, frozenInventory: corpus.frozenInventory, structuralIndex: corpus.index, budget, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
}
const faithful = (corpus: SyntheticCorpus, plan: ShardPlan, log?: string[]): ShardExecutor => async (shard) => { log?.push(shard.shardId); return { status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: { inputTokens: 100, outputTokens: 50, costUsd: 0.01 } }; };
function baseOptions(corpus: SyntheticCorpus, extra: Partial<CompileOptions> = {}): CompileOptions {
  return { caller: throwingCaller(), inventoryCaller: throwingInventory(), inventoryMode: "SINGLE_PASS", frozenInventory: corpus.frozenInventory, cache: new InMemorySemanticCompilationCache(), ...extra };
}
async function compileSharded(corpus: SyntheticCorpus, budget: Partial<ShardBudget> | undefined, executor: ShardExecutor, extra: Partial<CompileOptions> = {}, inputOverrides: Partial<SemanticCompilerInput> = {}): Promise<SemanticCompilationResult> {
  return compileCovenantToIR(inputFor(corpus, inputOverrides), baseOptions(corpus, { shardBudget: budget, shardExecutor: executor, ...extra }));
}
/** Turns a scripted executor's outcomes into ShardExecutionResults keyed by hash - what a persistent shard cache would hold. */
function recordingExecutor(inner: ShardExecutor, plan: ShardPlan, store: Map<string, ShardExecutionResult>): ShardExecutor {
  return async (shard, attempt) => { const out = await inner(shard, attempt); store.set(shard.shardHash, { ...out, shardId: shard.shardId, shardHash: shard.shardHash, reusedFromHash: false, attempts: attempt }); return out; };
}

describe("F-7C §25 activation boundary", () => {
  it("A - one small bounded unit selects MONOLITHIC, runs the semantic caller once, never touches the shard executor, and completes through Pass C", async () => {
    const corpus = buildDefinitionsCorpus({ count: 3 });
    const caller = scriptedCaller(() => ({ rules: [], definitions: corpus.frozenInventory.items.map((it, i) => ({ localRef: `d${i}`, termName: termName(i + 1), covenantFamily: "DEFINITIONS_CALCULATION_RULES", sufficiency: "COMPLETE", calculationExpression: { kind: "MONEY", amount: (i + 1) * 1_000_000, inventoryItemIds: [it.inventoryItemId] }, inventoryItemIds: [it.inventoryItemId] })), sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] }));
    let executorCalls = 0;
    const r = await compileCovenantToIR(inputFor(corpus), baseOptions(corpus, { caller, shardExecutor: async () => { executorCalls++; throw new Error("no"); } }));
    expect(r.execution?.mode).toBe("MONOLITHIC");
    expect(r.execution?.reason).toBe("SINGLE_BOUNDED_SHARD");
    expect(r.execution?.plannedShards).toBe(1);
    expect(r.execution?.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.execution?.sharded).toBeNull();
    expect(caller.calls).toBe(1);
    expect(executorCalls).toBe(0);
    expect(r.definitions).toHaveLength(3);
    expect(r.accountability?.counts.represented).toBe(3);
    expect(r.accountability?.counts.materialMissingFromComposition).toBe(0);
    expect(r.frozenInventory?.frozenContentHash).toBe(corpus.frozenInventory.frozenContentHash);
  });

  it("B/C - a large definitions corpus that packs into several certified shards selects SHARDED, never invokes the monolithic caller, stitches every definition and completes global Pass C", async () => {
    const corpus = buildDefinitionsCorpus({ count: 60 });
    const plan = planFor(corpus, SMALL);
    expect(plan.shards.length).toBeGreaterThan(1);
    const executed: string[] = [];
    const caller = throwingCaller();
    const r = await compileSharded(corpus, SMALL, faithful(corpus, plan, executed), { caller });
    expect(r.execution?.mode).toBe("SHARDED");
    expect(r.execution?.reason).toBe("MULTIPLE_SHARDS_REQUIRED");
    expect(r.execution?.planHash).toBe(plan.planHash);
    expect(r.execution?.plannedShards).toBe(plan.shards.length);
    expect(caller.calls).toBe(0);
    expect(executed).toEqual(plan.shards.map((s) => s.shardId)); // frozen ordinal order, every shard exactly once
    expect(r.definitions).toHaveLength(60);
    expect(r.accountability?.counts.represented).toBe(60);
    expect(r.accountability?.counts.materialMissingFromComposition).toBe(0);
    expect(r.accountability?.semanticallyComplete).toBe(true);
    expect(r.execution?.sharded?.executed).toBe(plan.shards.length);
    expect(r.execution?.sharded?.reused).toBe(0);
    expect(r.execution?.sharded?.statusCounts).toEqual({ SHARD_COMPLETE: plan.shards.length });
    expect(r.execution?.sharded?.unresolvedOwnedItems).toBe(0);
    expect(r.failureReasons).toEqual([]);
    expect(r.status).toBe("COMPLETED");
  });

  it("D - one oversized atomic definition forms its own flagged shard, is handed to the executor whole (never token-cut), and forces SHARDED even for a tiny corpus", async () => {
    const long = `“${termName(2)}” means the greater of (a) $2,000,000 and (b) 3% of Consolidated EBITDA, ${Array.from({ length: 420 }, (_, k) => `qualifier${k % 5}`).join(" ")}.`;
    const corpus = buildDefinitionsCorpus({ count: 3, overrideText: new Map([[2, long]]) });
    const plan = planFor(corpus, SMALL);
    const oversized = plan.shards.filter((s) => s.oversized);
    expect(oversized).toHaveLength(1);
    expect(oversized[0]!.primaryChars).toBeGreaterThan(SMALL.maxPrimaryChars!);
    const seen: { id: string; chars: number; oversized: boolean }[] = [];
    const r = await compileSharded(corpus, SMALL, async (shard) => { seen.push({ id: shard.shardId, chars: shard.primaryChars, oversized: shard.oversized }); return faithful(corpus, plan)(shard, 1); });
    expect(r.execution?.mode).toBe("SHARDED");
    expect(r.execution?.reason).toBe("OVERSIZED_ATOMIC_UNIT");
    expect(r.execution?.oversizedShards).toBe(1);
    const big = seen.find((s) => s.oversized)!;
    expect(big.chars).toBeGreaterThanOrEqual(long.length); // the whole definition, intact
    expect(r.execution?.sharded?.shards.find((s) => s.shardId === big.id)?.oversized).toBe(true);
    expect(r.definitions.map((d) => d.termName).sort()).toEqual([termName(1), termName(2), termName(3)].sort());
  });

  it("E - the boundary is invariant to issuer / agreement / candidate identity: renaming everything changes hashes, never the mode or the shard count", async () => {
    const a = buildDefinitionsCorpus({ count: 40, candidateRef: "cand:1.01" });
    const b = buildDefinitionsCorpus({ count: 40, candidateRef: "cand:acme-facility-2031#definitions" });
    const ra = await compileSharded(a, SMALL, faithful(a, planFor(a, SMALL)));
    const rb = await compileCovenantToIR(inputFor(b, { companyId: "acme-holdings", instrumentKey: "acme-term-loan-b" }), { ...baseOptions(b), shardBudget: SMALL, shardExecutor: faithful(b, planCompilationShards({ candidateRef: b.frozenInventory.candidateRef, companyId: "acme-holdings", instrumentKey: "acme-term-loan-b", documentId: DOC, sourceContext: b.sourceContext, frozenInventory: b.frozenInventory, structuralIndex: b.index, budget: SMALL, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } })) });
    expect(ra.execution?.mode).toBe("SHARDED");
    expect(rb.execution?.mode).toBe("SHARDED");
    expect(rb.execution?.plannedShards).toBe(ra.execution?.plannedShards);
    expect(rb.execution?.planHash).not.toBe(ra.execution?.planHash);
  });

  it("F - only the source size / structure relative to the certified budget moves the mode, and it moves deterministically", async () => {
    // 12 definitions padded to ~4k chars: 13 units (within the 16-unit cap) and well under 12k primary chars, so ONE
    // normal shard under the certified default budget - but several shards under a 1.2k-char window.
    const corpus = buildDefinitionsCorpus({ count: 12, padWords: 30 });
    const mono = await compileCovenantToIR(inputFor(corpus), baseOptions(corpus, { caller: scriptedCaller(() => ({ rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] })) }));
    expect(mono.execution?.mode).toBe("MONOLITHIC");
    const sharded = await compileSharded(corpus, SMALL, faithful(corpus, planFor(corpus, SMALL)));
    expect(sharded.execution?.mode).toBe("SHARDED"); // the same source under a tighter window needs several shards
    expect(selectCompilationExecutionMode(planFor(corpus, undefined)).mode).toBe("MONOLITHIC");
    expect(selectCompilationExecutionMode(planFor(corpus, SMALL)).mode).toBe("SHARDED");
  });

  it("G - the same source / inventory / configuration yields the same mode and planHash every time", async () => {
    const corpus = buildDefinitionsCorpus({ count: 40 });
    const plan = planFor(corpus, SMALL);
    const r1 = await compileSharded(corpus, SMALL, faithful(corpus, plan));
    const r2 = await compileSharded(corpus, SMALL, faithful(corpus, plan));
    expect(r1.execution?.planHash).toBe(r2.execution?.planHash);
    expect(r1.execution?.mode).toBe(r2.execution?.mode);
    expect(r1.execution?.sharded?.shards.map((s) => s.shardHash)).toEqual(r2.execution?.sharded?.shards.map((s) => s.shardHash));
  });

  it("H - there is no try-monolithic-then-shard: a SHARDED unit never reaches the monolithic caller, and a MONOLITHIC unit whose caller fails is a structured failure, never a shard attempt", async () => {
    const big = buildDefinitionsCorpus({ count: 60 });
    const caller = throwingCaller();
    const r = await compileSharded(big, SMALL, faithful(big, planFor(big, SMALL)), { caller });
    expect(caller.calls).toBe(0);
    const small = buildDefinitionsCorpus({ count: 3 });
    let executorCalls = 0;
    const failing = throwingCaller();
    const m = await compileCovenantToIR(inputFor(small), baseOptions(small, { caller: failing, shardExecutor: async () => { executorCalls++; throw new Error("no"); } }));
    expect(m.execution?.mode).toBe("MONOLITHIC");
    expect(m.status).toBe("FAILED");
    expect(m.failureReasons).toEqual(["TRANSPORT_OR_INTERNAL_ERROR"]);
    expect(failing.calls).toBe(1);
    expect(executorCalls).toBe(0);
  });
});

describe("F-7C §26 Pass A runs at the whole-unit layer only", () => {
  const corpus = buildDefinitionsCorpus({ count: 12, padWords: 30 });
  const empty: ShardExecutor = async () => ({ status: "SHARD_COMPLETE", composition: { rules: [], definitions: [], sharedCapacities: [], inventoryDispositions: [] }, failureReasons: [], unresolvedIssues: [], telemetry: null });
  const monoCaller = () => scriptedCaller(() => ({ rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] }));

  it("SINGLE_PASS: the sharded unit makes exactly as many Pass A calls as the same unit run monolithically - never one per shard", async () => {
    const mono = countingInventory();
    const rm = await compileCovenantToIR(inputFor(corpus), { caller: monoCaller(), inventoryCaller: mono, inventoryMode: "SINGLE_PASS", cache: new InMemorySemanticCompilationCache() });
    expect(rm.execution?.mode).toBe("MONOLITHIC");
    const sharded = countingInventory();
    const rs = await compileCovenantToIR(inputFor(corpus), { caller: throwingCaller(), inventoryCaller: sharded, inventoryMode: "SINGLE_PASS", shardBudget: SMALL, shardExecutor: empty, cache: new InMemorySemanticCompilationCache() });
    expect(rs.execution?.mode).toBe("SHARDED");
    expect(rs.execution!.plannedShards).toBeGreaterThan(1);
    expect(mono.calls).toBeGreaterThanOrEqual(1);
    expect(sharded.calls).toBe(mono.calls);
    expect(rs.inventoryPasses).toBeNull();
  });

  it("DUAL_PASS_ENSEMBLE: exactly two independent Pass A executions for the sharded unit, each the same size as a single pass", async () => {
    const single = countingInventory();
    await compileCovenantToIR(inputFor(corpus), { caller: throwingCaller(), inventoryCaller: single, inventoryMode: "SINGLE_PASS", shardBudget: SMALL, shardExecutor: empty, cache: new InMemorySemanticCompilationCache() });
    const p1 = countingInventory(), p2 = countingInventory();
    const r = await compileCovenantToIR(inputFor(corpus), { caller: throwingCaller(), inventoryPassCallers: [p1, p2], inventoryMode: "DUAL_PASS_ENSEMBLE", shardBudget: SMALL, shardExecutor: empty, cache: new InMemorySemanticCompilationCache() });
    expect(r.execution?.mode).toBe("SHARDED");
    expect(r.execution!.plannedShards).toBeGreaterThan(1);
    expect(r.inventoryPasses).toHaveLength(2);
    expect(p1.calls).toBe(single.calls);
    expect(p2.calls).toBe(single.calls);
  });

  it("a resumed frozen inventory makes zero Pass A calls", async () => {
    const inv = throwingInventory();
    const r = await compileSharded(corpus, SMALL, faithful(corpus, planFor(corpus, SMALL)), { inventoryCaller: inv });
    expect(inv.calls).toBe(0);
    expect(r.frozenInventory?.frozenContentHash).toBe(corpus.frozenInventory.frozenContentHash);
    await expect(compileCovenantToIR(inputFor(corpus, { candidateRef: "cand:other" }), baseOptions(corpus))).rejects.toThrow(/belongs to candidate/);
  });
});

describe("F-7C §27 global Pass C is the completeness authority", () => {
  const corpus = buildDefinitionsCorpus({ count: 40 });
  const plan = planFor(corpus, SMALL);
  const ownerOf = (i: number) => plan.itemOwnerShard[`inv-item:${String(i).padStart(3, "0")}`]!;

  it("an owner shard that misses a material item leaves it MISSING even when a sibling emits the term from context - never falsely complete", async () => {
    const victim = 5; const victimShard = ownerOf(victim);
    const sibling = plan.shards.find((s) => s.shardId !== victimShard)!;
    const r = await compileSharded(corpus, SMALL, async (shard) => {
      const comp = emitDefinitionsForShard(corpus, plan, shard);
      if (shard.shardId === victimShard) comp.definitions = comp.definitions.filter((d) => d.termName !== termName(victim));
      if (shard.shardId === sibling.shardId) comp.definitions.push(definitionFor(termName(victim), money(victim * 1_000_000, [`inv-item:00${victim}`]), { lineage: [`inv-item:00${victim}`] }));
      return { status: "SHARD_COMPLETE", composition: comp, failureReasons: [], unresolvedIssues: [], telemetry: null };
    });
    expect(r.execution?.mode).toBe("SHARDED");
    const rec = r.accountability!.items.find((i) => i.inventoryItemId === `inv-item:00${victim}`)!;
    expect(rec.disposition).toBe("MISSING_FROM_COMPOSITION");
    expect(r.failureReasons).toContain("INVENTORY_ITEM_MISSING_FROM_COMPOSITION");
    expect(r.failureReasons).toContain("SHARD_CONFLICT");
    expect(r.status).not.toBe("COMPLETED");
    expect(r.accountability!.semanticallyComplete).toBe(false);
    expect(r.execution?.sharded?.contextualEmissions).toBe(1);
    expect(r.definitions.filter((d) => d.termName === termName(victim))).toHaveLength(0);
  });

  it("a conflict variant that carries an item the canonical IR does not represent is preserved as review evidence and earns NO Pass-C credit", async () => {
    const s1 = ownerOf(1), s2 = ownerOf(20);
    expect(s1).not.toBe(s2);
    const r = await compileSharded(corpus, SMALL, async (shard) => {
      const comp = emitDefinitionsForShard(corpus, plan, shard);
      if (shard.shardId === s1) comp.definitions.push(definitionFor("Consolidated EBITDA", money(111, ["inv-item:001"]), { lineage: ["inv-item:001"] }));
      if (shard.shardId === s2) { comp.definitions = comp.definitions.filter((d) => d.termName !== termName(20)); comp.definitions.push(definitionFor("Consolidated EBITDA", money(222, ["inv-item:020"]), { lineage: ["inv-item:020"] })); }
      return { status: "SHARD_COMPLETE", composition: comp, failureReasons: [], unresolvedIssues: [], telemetry: null };
    });
    const sh = r.execution!.sharded!;
    expect(sh.definitionConflicts).toBe(1);
    expect(sh.conflictVariants).toBe(2);
    const ev = sh.definitionConflictEvidence[0]!;
    expect(ev.termName).toBe("Consolidated EBITDA");
    expect(ev.requiresReview).toBe(true);
    expect(ev.quantitativeValues.sort()).toEqual(["MONEY:111", "MONEY:222"]);
    expect(ev.ownedInventoryItemIds.sort()).toEqual(["inv-item:001", "inv-item:020"]);
    expect(r.definitions.filter((d) => d.termName === "Consolidated EBITDA")).toHaveLength(1);
    expect(r.definitions.find((d) => d.termName === "Consolidated EBITDA")!.sufficiency).toBe("AMBIGUOUS");
    expect(r.failureReasons).toContain("SHARD_CONFLICT");
    expect(r.status).not.toBe("COMPLETED");
    // item 020 exists only inside the losing variant: preserved, visible, and NOT credited
    expect(r.accountability!.items.find((i) => i.inventoryItemId === "inv-item:020")!.disposition).toBe("MISSING_FROM_COMPOSITION");
    expect(r.failureReasons).toContain("INVENTORY_ITEM_MISSING_FROM_COMPOSITION");
  });
});

describe("F-7C §28 provider-failure isolation and bounded retry", () => {
  const corpus = buildDefinitionsCorpus({ count: 40 });
  const plan = planFor(corpus, SMALL);
  const B = plan.shards[1]!;

  it("A succeeds, B provider-fails, C succeeds: A and C preserved, B explicit, B-owned material unresolved, result conservative and not cached", async () => {
    expect(plan.shards.length).toBeGreaterThanOrEqual(3);
    const cache = new InMemorySemanticCompilationCache();
    const store = new Map<string, ShardExecutionResult>();
    const executor = recordingExecutor(async (shard) => { if (shard.shardId === B.shardId) throw new Error("gateway_stream_terminated"); return faithful(corpus, plan)(shard, 1); }, plan, store);
    const r = await compileSharded(corpus, SMALL, executor, { cache, shardMaxAttempts: 1 });
    const sh = r.execution!.sharded!;
    expect(sh.statusCounts).toEqual({ SHARD_COMPLETE: plan.shards.length - 1, SHARD_PROVIDER_FAILURE: 1 });
    expect(sh.shards.find((s) => s.shardId === B.shardId)?.status).toBe("SHARD_PROVIDER_FAILURE");
    expect(sh.unresolvedOwnedItemList.map((u) => u.inventoryItemId).sort()).toEqual([...B.ownedMaterialItemIds].sort());
    for (const id of B.ownedMaterialItemIds) expect(r.accountability!.items.find((i) => i.inventoryItemId === id)!.disposition).toBe("MISSING_FROM_COMPOSITION");
    expect(r.status).toBe("PARTIAL");
    expect(r.failureReasons).toEqual(expect.arrayContaining(["PROVIDER_FAILURE", "SHARD_INCOMPLETE", "INVENTORY_ITEM_MISSING_FROM_COMPOSITION"]));
    expect(r.definitions.length).toBe(40 - B.ownedMaterialItemIds.length);
    expect(cache.get(r.cacheKey)).toBeNull(); // a transient provider failure is never pinned in the cache
    // retry B ONLY: the siblings' results are supplied by hash and must not be re-executed
    const executed: string[] = [];
    const r2 = await compileSharded(corpus, SMALL, async (shard) => { executed.push(shard.shardId); return faithful(corpus, plan)(shard, 1); }, { priorShardResults: store });
    expect(executed).toEqual([B.shardId]);
    expect(r2.execution!.sharded!.reused).toBe(plan.shards.length - 1);
    expect(r2.execution!.sharded!.executed).toBe(1);
    expect(r2.execution!.sharded!.shards.filter((s) => s.reusedFromHash).map((s) => s.shardId).sort()).toEqual(plan.shards.filter((s) => s.shardId !== B.shardId).map((s) => s.shardId).sort());
    expect(r2.status).toBe("COMPLETED");
    expect(r2.accountability!.counts.represented).toBe(40);
  });

  it("in-run bounded retry: a provider failure is retried once and only that shard, with the retry counted", async () => {
    const attempts = new Map<string, number>();
    const r = await compileSharded(corpus, SMALL, async (shard, attempt) => { attempts.set(shard.shardId, attempt); if (shard.shardId === B.shardId && attempt === 1) return { status: "SHARD_PROVIDER_FAILURE", composition: null, failureReasons: ["PROVIDER_FAILURE"], unresolvedIssues: ["scripted"], telemetry: null }; return faithful(corpus, plan)(shard, attempt); }, { shardMaxAttempts: 2 });
    expect(attempts.get(B.shardId)).toBe(2);
    expect([...attempts.entries()].filter(([id]) => id !== B.shardId).every(([, a]) => a === 1)).toBe(true);
    expect(r.execution!.sharded!.retries).toBe(1);
    expect(r.execution!.sharded!.executed).toBe(plan.shards.length + 1);
    expect(r.status).toBe("COMPLETED");
  });
});

describe("F-7C §29 shard result reuse by hash - the explicit contract", () => {
  const corpus = buildDefinitionsCorpus({ count: 40 });
  const plan = planFor(corpus, SMALL);
  const A = plan.shards[0]!;
  const priorWith = (status: ShardStatus): Map<string, ShardExecutionResult> => new Map([[A.shardHash, { shardId: A.shardId, shardHash: A.shardHash, status, composition: status === "SHARD_PROVIDER_FAILURE" || status === "SHARD_SCHEMA_FAILURE" ? null : emitDefinitionsForShard(corpus, plan, A), failureReasons: status === "SHARD_COMPLETE" ? [] : [status === "SHARD_MISSING_CONTEXT" ? "MISSING_CONTEXT" : status === "SHARD_PARTIAL" ? "OUTPUT_TRUNCATED" : status === "SHARD_SCHEMA_FAILURE" ? "MODEL_SCHEMA_FAILURE" : "PROVIDER_FAILURE"], unresolvedIssues: [], reusedFromHash: false, attempts: 1, telemetry: null }]]);

  for (const status of ["SHARD_COMPLETE", "SHARD_MISSING_CONTEXT", "SHARD_PARTIAL", "SHARD_SCHEMA_FAILURE"] as const) {
    it(`${status} is terminal and reused without a call; its failure reasons travel into the stitched result`, async () => {
      const executed: string[] = [];
      const r = await compileSharded(corpus, SMALL, async (shard) => { executed.push(shard.shardId); return faithful(corpus, plan)(shard, 1); }, { priorShardResults: priorWith(status) });
      expect(executed).not.toContain(A.shardId);
      expect(executed).toHaveLength(plan.shards.length - 1);
      const sh = r.execution!.sharded!;
      expect(sh.reused).toBe(1);
      expect(sh.shards.find((s) => s.shardId === A.shardId)).toMatchObject({ status, reusedFromHash: true });
      if (status !== "SHARD_COMPLETE") { expect(r.failureReasons).toContain("SHARD_INCOMPLETE"); expect(r.status).not.toBe("COMPLETED"); }
      expect(REUSABLE_TERMINAL_SHARD_STATUSES).toContain(status);
    });
  }

  it("SHARD_PROVIDER_FAILURE is never reused as a result - the shard costs money again, nothing else does", async () => {
    const executed: string[] = [];
    const r = await compileSharded(corpus, SMALL, async (shard) => { executed.push(shard.shardId); return faithful(corpus, plan)(shard, 1); }, { priorShardResults: priorWith("SHARD_PROVIDER_FAILURE") });
    expect(executed).toContain(A.shardId);
    expect(r.execution!.sharded!.reused).toBe(0);
    expect(REUSABLE_TERMINAL_SHARD_STATUSES).not.toContain("SHARD_PROVIDER_FAILURE");
  });
});

describe("F-7C §30 invalidation through the production entry", () => {
  const base = buildDefinitionsCorpus({ count: 40, references: new Map([[30, 2]]) });
  const hashesOf = (r: SemanticCompilationResult) => new Map(r.execution!.sharded!.shards.map((s) => [s.shardId, s.shardHash]));

  it("B/C/D - one owner-source byte changes: the owner shard and the context reader invalidate; every unrelated shard keeps its hash", async () => {
    const r0 = await compileSharded(base, SMALL, faithful(base, planFor(base, SMALL)));
    const changed = buildDefinitionsCorpus({ count: 40, references: new Map([[30, 2]]), overrideText: new Map([[2, `“${termName(2)}” means the greater of (a) $2,000,001 and (b) 3% of Consolidated EBITDA.`]]) });
    const r1 = await compileSharded(changed, SMALL, faithful(changed, planFor(changed, SMALL)));
    const h0 = hashesOf(r0), h1 = hashesOf(r1);
    const p1 = planFor(changed, SMALL);
    const owner = p1.itemOwnerShard["inv-item:002"]!, reader = p1.itemOwnerShard["inv-item:030"]!;
    expect(owner).not.toBe(reader);
    expect(h1.get(owner)).not.toBe(h0.get(owner));
    expect(h1.get(reader)).not.toBe(h0.get(reader));
    for (const [id, h] of h0) if (id !== owner && id !== reader) expect(h1.get(id)).toBe(h);
    expect(r1.execution!.planHash).not.toBe(r0.execution!.planHash);
  });

  it("E - the frozen inventory hash changing invalidates every shard identity", async () => {
    const r0 = await compileSharded(base, SMALL, faithful(base, planFor(base, SMALL)));
    const altered = { ...base, frozenInventory: { ...base.frozenInventory, frozenContentHash: "0".repeat(64) } };
    const r1 = await compileSharded(altered, SMALL, faithful(altered, planFor(altered, SMALL)));
    const h0 = hashesOf(r0), h1 = hashesOf(r1);
    for (const [id, h] of h0) expect(h1.get(id)).not.toBe(h);
  });

  it("F - a planner budget change is part of the execution identity: different outer cache key, different plan, a stale sharded entry is never served", async () => {
    const cache = new InMemorySemanticCompilationCache();
    const r0 = await compileSharded(base, SMALL, faithful(base, planFor(base, SMALL)), { cache });
    const wider = { ...SMALL, targetPrimaryChars: 2_000, maxPrimaryChars: 4_000 };
    const r1 = await compileSharded(base, wider, faithful(base, planFor(base, wider)), { cache });
    expect(r1.cacheKey).not.toBe(r0.cacheKey);
    expect(r1.execution!.planHash).not.toBe(r0.execution!.planHash);
    expect(executionPolicyIdentity(SMALL)).not.toBe(executionPolicyIdentity(wider));
  });
});

describe("F-7C §31 outer cache-key safety", () => {
  const corpus = buildDefinitionsCorpus({ count: 40 });
  const plan = planFor(corpus, SMALL);

  it("a pre-activation monolithic entry (legacy two-argument key) is never served for an input the policy now routes SHARDED; the activated result is cached under its own key and served on repeat", async () => {
    const cache = new InMemorySemanticCompilationCache();
    const input = inputFor(corpus);
    const legacyKey = computeCacheKey(input, "scripted::scripted-model::inventory=SINGLE_PASS");
    const stale = { status: "COMPLETED", failureReasons: [], errorDetail: null, rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: null, provider: "scripted", model: "scripted-model", telemetry: null, cacheKey: legacyKey, compiledAt: "2000-01-01T00:00:00.000Z" } as SemanticCompilationResult;
    cache.set(legacyKey, stale);
    const executed: string[] = [];
    const r = await compileSharded(corpus, SMALL, async (shard) => { executed.push(shard.shardId); return faithful(corpus, plan)(shard, 1); }, { cache });
    expect(r).not.toBe(stale);
    expect(r.execution?.mode).toBe("SHARDED");
    expect(r.cacheKey).not.toBe(legacyKey);
    expect(executed).toHaveLength(plan.shards.length);
    const again = await compileSharded(corpus, SMALL, async (shard) => { executed.push(shard.shardId); return faithful(corpus, plan)(shard, 1); }, { cache });
    expect(again).toBe(r);
    expect(executed).toHaveLength(plan.shards.length);
  });

  it("the resumed frozen-inventory hash is part of the outer key", async () => {
    const cache = new InMemorySemanticCompilationCache();
    const r0 = await compileSharded(corpus, SMALL, faithful(corpus, plan), { cache });
    const other = { ...corpus.frozenInventory, frozenContentHash: "f".repeat(64) };
    const r1 = await compileSharded({ ...corpus, frozenInventory: other }, SMALL, faithful(corpus, plan), { cache, frozenInventory: other });
    expect(r1.cacheKey).not.toBe(r0.cacheKey);
  });
});

describe("F-7C §34 operative-state safety survives sharding", () => {
  it("a context bundle carrying unresolved operative evidence forces OPERATIVE_STATE_UNRESOLVED on the sharded unit, exactly as on a bounded unit", async () => {
    const corpus = buildDefinitionsCorpus({ count: 40 });
    const bundle = emptyContextBundle({ hasUnresolvedOperativeEvidence: true, unresolvedEvidenceItemIds: ["ctx-stale-1"] });
    const r = await compileSharded(corpus, SMALL, faithful(corpus, planFor(corpus, SMALL)), {}, { contextBundle: bundle, toolAccess: { structuralIndex: corpus.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: bundle } });
    expect(r.execution?.mode).toBe("SHARDED");
    expect(r.inputHasUnresolvedOperativeEvidence).toBe(true);
    expect(r.unresolvedEvidenceItemIds).toEqual(["ctx-stale-1"]);
    expect(r.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.execution!.sharded!.stitchedStatus).toBe("COMPLETED"); // the stitcher was clean; the whole-unit layer demoted it
  });
});

describe("F-7C §36/§37 honest sharded telemetry and shape", () => {
  it("no single transcript is faked; telemetry is the honest aggregate; the result is the ordinary SemanticCompilationResult shape", async () => {
    const corpus = buildDefinitionsCorpus({ count: 40 });
    const plan = planFor(corpus, SMALL);
    const r = await compileSharded(corpus, SMALL, faithful(corpus, plan));
    expect(r.rawModelOutput).toBeNull();
    expect(r.toolCallLog).toEqual([]);
    expect(r.telemetry?.inputTokens).toBe(100 * plan.shards.length);
    expect(r.telemetry?.outputTokens).toBe(50 * plan.shards.length);
    expect(r.telemetry?.calculatedCostUsd).toBeCloseTo(0.01 * plan.shards.length, 6);
    expect(r.telemetry?.attemptCount).toBe(plan.shards.length);
    expect(r.telemetry?.stage).toBe("semantic_compile_sharded");
    expect(r.execution!.sharded!.telemetryNote).toMatch(/bounded conversations/);
    expect(r.execution!.sharded!.attributionProofCounts.NONE).toBe(0);
    expect(r.execution!.sharded!.attributionProofCounts.PLANNER_DEFINITION_UNIT).toBe(40);
    expect(r.execution!.sharded!.budget).toEqual({ ...DEFAULT_SHARD_BUDGET, ...SMALL });
    expect(r.provider).toBe("scripted");
    expect(r.sourceContext?.state).toBe("COMPLETE_LOCAL_SOURCE");
    expect(r.accountability).not.toBeNull();
    expect(r.errorDetail).toBeNull();
  });
});
