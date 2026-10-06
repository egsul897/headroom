/**
 * HD-4 DURABLE PASS-A CALL REPLAY - zero-cost resilience certification (mission §18-§21).
 *
 * Every test drives the REAL production layers (runDualPassSemanticInventory, compileCovenantToIR's sharded path,
 * verifyCompiledCandidate) through the harness's durable-replay primitives with scripted callers and a shared
 * kill switch that models a process death: once tripped, every later "provider" call throws before responding, so
 * nothing after the kill point is ever persisted - exactly what a SIGKILL leaves behind. No model call anywhere.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { calculateCostUsd, type AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";
import { compileCovenantToIR, type CompileOptions } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { planCompilationShards } from "../../lib/contract-model/compiler/semantic/shard-planner";
import type { ShardExecutor } from "../../lib/contract-model/compiler/semantic/shard-execution";
import type { SemanticCaller } from "../../lib/contract-model/compiler/semantic/caller";
import type { ShardBudget, ShardPlan } from "../../lib/contract-model/compiler/semantic/shard-types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, type SemanticCompilationResult, type SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { SubmitSemanticInventorySchema } from "../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { CORPUS } from "./semantic-accountability/corpus";
import { buildScenario, scriptedWireItems, DOC_ID, type BuiltScenario } from "./semantic-accountability/harness";
import { testCompilerInput, emptyContextBundle } from "./semantic-compiler/test-helpers";
import { buildDefinitionsCorpus, emitDefinitionsForShard, CO, INST, DOC, type SyntheticCorpus } from "./f7a-synthetic-corpus";
import { DurableCallStore, DurableReplayStageCaller, DurableShardStore, durableShardExecutor, DurablePersistenceError, DurableReplayRecordInvalidError, PASS_A_SCHEMA_IDS, computeRequestHash, recordHash, canonicalJson, sha256, schemaFingerprint, DURABLE_CALL_RECORD_VERSION, type DurableCallRecord } from "../../scripts/phase-3-601-durable-replay";
import { resumablePassA, runDurablePassA, persistEnsemble, passAScope, passAPaths, durableVerifierCallers, verifierScope, PASS_IDS } from "../../scripts/phase-3-601-hd4-resume";
import { Guard, GuardedStageCaller } from "../../scripts/phase-3-601-guard";

const MISSION = "hd4-cert";
const BATCH_CHARS = 600; // I35 -> exactly 6 ordinary batches + 1 gap call per pass: the Section 6.01 shape
const tmp = () => mkdtempSync(join(tmpdir(), "hd4-"));

// ---------------------------------------------------------------------------
// Scripted Pass A with a process-kill switch
// ---------------------------------------------------------------------------
class KillSwitch { successes = 0; dead = false; constructor(public killAfter: number) {} }
class SimulatedProcessKill extends Error { constructor() { super("SIMULATED_PROCESS_KILL: the process is dead; no provider response ever arrives"); } }
const scenario = CORPUS.find((s) => s.id === "I35")!;
const OMIT = new Set([scenario.items[5]!.ref, scenario.items[12]!.ref]); // omitted on ordinary batches -> deterministic coverage gap -> gap call
let built: BuiltScenario;
beforeAll(async () => { built = await buildScenario(scenario); });

function scriptedPassA(kill: KillSwitch, live: { calls: number }, opts: { model?: string; costPerCall?: number } = {}): StageCaller {
  const all = scriptedWireItems(scenario.items);
  const norm = (t: string) => t.replace(/\s+/g, " ");
  let last: AnalyzerCallTelemetry | null = null;
  return { providerName: "scripted", model: opts.model ?? "scripted-inventory", isSynthetic: false,
    async call<T>(_s: unknown, stage: string, _sys: string, user: string): Promise<T> {
      if (kill.dead || kill.successes >= kill.killAfter) { kill.dead = true; throw new SimulatedProcessKill(); }
      live.calls++; kill.successes++;
      const items = all.filter((i) => norm(user).includes(norm(i.excerpt)) && (stage === "semantic_inventory_gap" || !OMIT.has(i.localRef)));
      last = { provider: "scripted", model: opts.model ?? "scripted-inventory", promptVersion: "p", schemaVersion: "s", stage, timestamp: new Date().toISOString(), inputTokens: 1000 + kill.successes, outputTokens: 500, cachedInputTokens: 0, cacheCreationInputTokens: 0, attemptCount: 1, retryCount: 0, rateLimitFailures: 0, latencyMs: 1, providerCost: undefined, calculatedCostUsd: opts.costPerCall ?? 0.001 * ((user.length % 100) + 1) /* deterministic per request, like a real per-token bill */ };
      return { items, overallNotes: [] } as unknown as T;
    }, lastTelemetry: () => last };
}
const passAInput = (dir: string, kill: KillSwitch, live: { calls: number }, factoryCalls?: { n: number }) => ({ evidenceDir: dir, missionId: MISSION, candidateRef: scenario.id, documentId: DOC_ID, sourceContext: built.sourceContext, structuralIndex: built.index, batchChars: BATCH_CHARS, liveCallerFor: () => { if (factoryCalls) factoryCalls.n++; return scriptedPassA(kill, live); } });
// `calls` (P3-E14 per-call execution records: latency, live-vs-replay token counters) is execution telemetry, not frozen content - stripped like frozenAt.
const stripVolatile = (v: unknown): unknown => Array.isArray(v) ? v.map(stripVolatile) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !["frozenAt", "verifiedAt", "at", "timestamp", "createdAt", "compiledAt", "exprId" /* f7a corpus's synthetic global expression counter */, "calls"].includes(k)).map(([k, x]) => [k, stripVolatile(x)])) : v;
const recordFiles = (dir: string) => readdirSync(passAPaths(dir).calls).filter((f) => f.endsWith(".json"));

let control: { inventory: unknown; hash: string; logical: number; costUsd: number | null; passCost: (number | null)[] };
async function controlRun() {
  if (control) return control;
  const dir = tmp(); const live = { calls: 0 };
  const r = await resumablePassA(passAInput(dir, new KillSwitch(Infinity), live));
  expect(r.usable).toBe(true); expect(r.source).toBe("EXECUTED");
  expect(r.execution!.accounting.total).toMatchObject({ logicalCalls: 14, liveCalls: 14, replayedCalls: 0 });
  expect(r.passes[0]!.inventory.partition).toMatchObject({ batches: 6, gapCalls: 1 });
  control = { inventory: stripVolatile(r.inventory), hash: r.inventory.frozenContentHash, logical: 14, costUsd: r.inventory.telemetryCostUsd, passCost: r.passes.map((p) => p.inventory.telemetryCostUsd) };
  return control;
}

/** One crash-matrix row: run until the kill, restart on the same evidence dir, prove replay/live/equality. */
async function crashAndRestart(label: string, killAfter: number) {
  const c = await controlRun();
  const dir = tmp();
  const live1 = { calls: 0 };
  const first = await resumablePassA(passAInput(dir, new KillSwitch(killAfter), live1));
  expect(first.usable, `${label}: the interrupted run must not produce a resumable ensemble`).toBe(false);
  expect(existsSync(passAPaths(dir).inventory), `${label}: no frozen-inventory.json after the kill`).toBe(false);
  expect(live1.calls).toBe(killAfter);
  expect(recordFiles(dir).length, `${label}: exactly the completed calls are persisted`).toBe(killAfter);
  const persisted = new Set(first.execution!.accounting.log.filter((e) => e.origin === "LIVE_PROVIDER").map((e) => `${e.requestHash}-${e.occurrence}`));
  // ---- restart: a fresh process (new callers, new store handle, same directory), no kill
  const live2 = { calls: 0 };
  const second = await resumablePassA(passAInput(dir, new KillSwitch(Infinity), live2));
  expect(second.source).toBe("EXECUTED"); expect(second.usable).toBe(true);
  const log = second.execution!.accounting.log;
  expect(second.execution!.accounting.total).toEqual(expect.objectContaining({ logicalCalls: 14, replayedCalls: killAfter, liveCalls: 14 - killAfter, providerCallsAvoided: killAfter }));
  expect(live2.calls, `${label}: only the interrupted call and later ones execute`).toBe(14 - killAfter);
  // deterministic ordering: the first killAfter logical calls are replays, in the persisted order; the (killAfter+1)-th is live
  expect(log.slice(0, killAfter).every((e) => e.origin === "DURABLE_REPLAY")).toBe(true);
  expect(log.slice(0, killAfter).map((e) => `${e.requestHash}-${e.occurrence}`)).toEqual([...persisted]);
  if (killAfter < 14) expect(log[killAfter]!.origin).toBe("LIVE_PROVIDER");
  // no earlier completed exact call is re-executed; every replay cost $0
  expect(log.filter((e) => e.origin === "LIVE_PROVIDER").some((e) => persisted.has(`${e.requestHash}-${e.occurrence}`))).toBe(false);
  expect(log.filter((e) => e.origin === "DURABLE_REPLAY").every((e) => e.newCostUsd === 0 && e.providerCallsAvoided === 1)).toBe(true);
  // final semantic result equals the uninterrupted control (content hash AND full projection, including the original telemetry cost)
  expect(second.inventory.frozenContentHash).toBe(c.hash);
  expect(stripVolatile(second.inventory)).toEqual(c.inventory);
  expect(second.inventory.telemetryCostUsd).toBe(c.costUsd);
  expect(recordFiles(dir).length).toBe(14);
  return { first, second, log };
}

describe("HD-4 §18 Pass-A crash matrix (production runDualPassSemanticInventory, scripted provider, kill switch)", () => {
  it("control: uninterrupted dual pass = 14 logical calls (6 batches + 1 gap per pass), all live", async () => { await controlRun(); });
  it("A - kill after Pass 1 batch 1", async () => { await crashAndRestart("A", 1); });
  it("B - kill after Pass 1's six ordinary batches, before its gap call", async () => {
    const { log } = await crashAndRestart("B", 6);
    expect(log[6]!.stage).toBe("semantic_inventory_gap"); expect(log[6]!.origin).toBe("LIVE_PROVIDER");
  });
  it("C - kill after complete Pass 1: pass 2's byte-identical prompts are NOT served from pass-1 records (§14)", async () => {
    const { log } = await crashAndRestart("C", 7);
    expect(log[6]!.stage).toBe("semantic_inventory_gap"); expect(log[6]!.origin).toBe("DURABLE_REPLAY"); // §13 gap call replays
    const p1 = log.filter((e) => e.passId === PASS_IDS[0]), p2 = log.filter((e) => e.passId === PASS_IDS[1]);
    expect(p1.every((e) => e.origin === "DURABLE_REPLAY")).toBe(true);
    expect(p2.every((e) => e.origin === "LIVE_PROVIDER")).toBe(true);
    // same system prompt + user content, different pass -> different request hash
    for (const e of p2) expect(p1.some((x) => x.requestHash === e.requestHash)).toBe(false);
  });
  it("D - kill during Pass 2 batch 3 (two pass-2 batches persisted, the third in flight)", async () => {
    const { log } = await crashAndRestart("D", 9);
    expect(log[9]!).toMatchObject({ passId: PASS_IDS[1], stage: "semantic_inventory", origin: "LIVE_PROVIDER" });
  });
  it("E - kill after complete Pass 2 but before ensemble persistence: restart replays all 14, executes 0, persists the ensemble", async () => {
    const c = await controlRun(); const dir = tmp(); const live1 = { calls: 0 };
    const exec = await runDurablePassA(passAInput(dir, new KillSwitch(Infinity), live1)); // returns; the "process dies" before persistEnsemble
    expect(exec.dual.ensembleBuilt).toBe(true); expect(live1.calls).toBe(14); expect(existsSync(passAPaths(dir).inventory)).toBe(false);
    const live2 = { calls: 0 };
    const second = await resumablePassA(passAInput(dir, new KillSwitch(Infinity), live2));
    expect(second.source).toBe("EXECUTED"); expect(second.usable).toBe(true); expect(live2.calls).toBe(0);
    expect(second.execution!.accounting.total).toMatchObject({ logicalCalls: 14, replayedCalls: 14, liveCalls: 0, liveCostUsd: 0 });
    expect(second.inventory.frozenContentHash).toBe(c.hash); expect(stripVolatile(second.inventory)).toEqual(c.inventory);
    expect(existsSync(passAPaths(dir).inventory)).toBe(true); expect(second.proofs!.inventory.hashEqual && second.proofs!.inventory.structurallyEqual).toBe(true);
  });
  it("F - kill after ensemble persistence, before Pass B: restart resumes the persisted ensemble and never constructs a Pass-A caller (HD-3 remains)", async () => {
    const c = await controlRun(); const dir = tmp();
    const first = await resumablePassA(passAInput(dir, new KillSwitch(Infinity), { calls: 0 }));
    expect(first.usable).toBe(true);
    const factory = { n: 0 }; const live2 = { calls: 0 };
    const second = await resumablePassA(passAInput(dir, new KillSwitch(Infinity), live2, factory));
    expect(second.source).toBe("RESUMED_FROM_ENSEMBLE_PERSISTENCE"); expect(factory.n).toBe(0); expect(live2.calls).toBe(0); expect(second.execution).toBeNull();
    expect(second.inventory.frozenContentHash).toBe(c.hash); expect(stripVolatile(second.inventory)).toEqual(c.inventory);
  });
  it("an unusable persisted ensemble (a failed pass) is never resumed; Pass A re-runs with replays", async () => {
    const dir = tmp();
    await resumablePassA(passAInput(dir, new KillSwitch(3), { calls: 0 }));
    expect(readdirSync(dir).some((f) => f.startsWith("frozen-inventory.unusable."))).toBe(true);
    const second = await resumablePassA(passAInput(dir, new KillSwitch(Infinity), { calls: 0 }));
    expect(second.source).toBe("EXECUTED"); expect(second.execution!.accounting.total.replayedCalls).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// §5/§6 ordering + persistence failure, §7-§9 identity + validation, §20 corruption, §21 cost accounting
// ---------------------------------------------------------------------------
const SYS = "system prompt v1", USER = (i: number) => `user content ${i}`;
function simpleInner(live: { calls: number }, model = "m1", cost = 0.25): StageCaller {
  let last: AnalyzerCallTelemetry | null = null;
  return { providerName: "scripted", model, isSynthetic: false, async call<T>(_s: unknown, stage: string, _sys: string, user: string): Promise<T> {
    live.calls++;
    last = { provider: "scripted", model, promptVersion: "p", schemaVersion: "s", stage, timestamp: "t", inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, cacheCreationInputTokens: 0, attemptCount: 1, retryCount: 0, rateLimitFailures: 0, latencyMs: 1, providerCost: undefined, calculatedCostUsd: cost };
    return { items: [], overallNotes: [user] } as unknown as T; }, lastTelemetry: () => last };
}
const PRICED_MODEL = "anthropic/claude-sonnet-5";
const scope = (over: Partial<ReturnType<typeof passAScope>> = {}) => ({ missionId: MISSION, passId: "pass-1", sourceDocumentId: "doc-a", candidateRef: "cand:6.01", sourceContextHash: "ctx-hash-1", algorithmVersion: "alg.v5", promptVersion: "prompt.v5", ...over });
const caller = (dir: string, live: { calls: number }, over: Partial<ReturnType<typeof passAScope>> = {}, opts: { model?: string; schemaIds?: Record<string, string> } = {}) => new DurableReplayStageCaller(simpleInner(live, opts.model), new DurableCallStore(dir), scope(over), opts.schemaIds ?? PASS_A_SCHEMA_IDS);

describe("HD-4 §5-§9 durable ordering, exact identity, replay validation", () => {
  it("§5/§6: provider success + persistence failure = STOP (nothing returned, no further call)", async () => {
    const dir = tmp(); const live = { calls: 0 };
    const c = caller(dir, live);
    (c.store as unknown as { write: () => never }).write = () => { throw new DurablePersistenceError("disk full (simulated)"); };
    await expect(c.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1))).rejects.toBeInstanceOf(DurablePersistenceError);
    expect(live.calls).toBe(1); expect(c.log.length).toBe(0); expect(readdirSync(dir).filter((f) => f.endsWith(".json")).length).toBe(0);
  });
  it("§6: writes are atomic - a record file exists only complete, read-back hash verified, no temp files left", async () => {
    const dir = tmp(); const c = caller(dir, { calls: 0 });
    await c.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1));
    const files = readdirSync(dir); expect(files.filter((f) => f.endsWith(".tmp"))).toEqual([]);
    const rec = JSON.parse(readFileSync(join(dir, files.find((f) => f.endsWith(".json") && f !== "origin-log.ndjson")!), "utf8")) as DurableCallRecord;
    const { recordSha256, ...body } = rec; expect(recordHash(body)).toBe(recordSha256); expect(sha256(canonicalJson(rec.payload))).toBe(rec.payloadSha256);
    expect(rec.identity.recordVersion).toBe(DURABLE_CALL_RECORD_VERSION); expect(rec.telemetry.originalCostUsd).toBe(0.25);
  });
  it("§7: replay only on exact identity; two byte-identical logical calls are two records (occurrence), replayed in order", async () => {
    const dir = tmp(); const live = { calls: 0 };
    const c1 = caller(dir, live);
    await c1.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1)); await c1.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1));
    expect(live.calls).toBe(2); expect(c1.log.map((e) => e.occurrence)).toEqual([0, 1]);
    const c2 = caller(dir, live);
    await c2.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1)); await c2.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1)); await c2.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1));
    expect(c2.log.map((e) => e.origin)).toEqual(["DURABLE_REPLAY", "DURABLE_REPLAY", "LIVE_PROVIDER"]); expect(live.calls).toBe(3);
  });
  it("§8: schema identity = explicit id + structural fingerprint (JSON-Schema projection), never object identity; unmapped stage refused", async () => {
    const a = z.object({ items: z.array(z.string()).default([]) }), b = z.object({ items: z.array(z.string()).default([]) }), c = z.object({ items: z.array(z.number()).default([]) });
    expect(schemaFingerprint(a)).toBe(schemaFingerprint(b)); expect(schemaFingerprint(a)).not.toBe(schemaFingerprint(c));
    expect(schemaFingerprint(SubmitSemanticInventorySchema)).toMatch(/^[0-9a-f]{64}$/);
    const d = caller(tmp(), { calls: 0 });
    await expect(d.call(SubmitSemanticInventorySchema, "some_new_stage", SYS, USER(1))).rejects.toThrow(/no explicit schema id/);
  });
  it("§10: every attempt records exactly one origin with the required replay report fields", async () => {
    const dir = tmp(); const live = { calls: 0 };
    await caller(dir, live).call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1));
    const c2 = caller(dir, live); await c2.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1));
    const e = c2.log[0]!;
    expect(e).toMatchObject({ origin: "DURABLE_REPLAY", newCostUsd: 0, providerCallsAvoided: 1, originalCostUsd: 0.25 });
    expect(typeof e.originalCompletedAt).toBe("string"); expect(typeof e.at).toBe("string"); expect(e.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(c2.summary()).toEqual({ logicalCalls: 1, liveCalls: 0, replayedCalls: 1, liveCostUsd: 0, historicalReplayedCostUsd: 0.25, providerCallsAvoided: 1 });
    expect(readFileSync(join(dir, "origin-log.ndjson"), "utf8").trim().split("\n").length).toBe(2);
  });
  it("replay returns the same lastTelemetry() the live call produced (production cost bookkeeping unchanged)", async () => {
    const dir = tmp(); const live = { calls: 0 };
    const c1 = caller(dir, live); await c1.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1)); const t1 = c1.lastTelemetry();
    const c2 = caller(dir, live); await c2.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1));
    expect(c2.lastTelemetry()).toEqual(t1); expect(live.calls).toBe(1);
  });
});

describe("HD-4 §20 corruption + invalidation (fail closed on the exact key; MISS on any identity change)", () => {
  async function seeded() { const dir = tmp(); const live = { calls: 0 }; const c = caller(dir, live); await c.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1)); const path = c.log[0]!.recordPath; return { dir, live, path, hash: c.log[0]!.requestHash }; }
  const expectFailClosed = async (dir: string, live: { calls: number }, re: RegExp) => { const c = caller(dir, live); await expect(c.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1))).rejects.toThrow(re); expect(live.calls).toBe(1); };
  const rewrite = (path: string, mutate: (r: DurableCallRecord) => void, rehash: boolean) => { const r = JSON.parse(readFileSync(path, "utf8")) as DurableCallRecord; mutate(r); if (rehash) { r.payloadSha256 = sha256(canonicalJson(r.payload)); const { recordSha256: _x, ...body } = r; void _x; r.recordSha256 = recordHash(body); } writeFileSync(path, JSON.stringify(r)); };
  it("truncated replay file -> fail closed", async () => { const s = await seeded(); const raw = readFileSync(s.path, "utf8"); writeFileSync(s.path, raw.slice(0, Math.floor(raw.length / 2))); await expectFailClosed(s.dir, s.live, /unparseable/); });
  it("payload hash mismatch -> fail closed", async () => { const s = await seeded(); rewrite(s.path, (r) => { (r.payload as { overallNotes: string[] }).overallNotes = ["tampered"]; }, false); await expectFailClosed(s.dir, s.live, /payload hash mismatch|record hash mismatch/); });
  it("record hash mismatch (any field edited) -> fail closed", async () => { const s = await seeded(); rewrite(s.path, (r) => { r.telemetry.originalCostUsd = 0; }, false); await expectFailClosed(s.dir, s.live, /record hash mismatch/); });
  it("stored payload rejected by the CURRENT schema -> fail closed (hashes consistent, content incompatible)", async () => { const s = await seeded(); rewrite(s.path, (r) => { (r.payload as { items: unknown }).items = "not-an-array"; }, true); await expectFailClosed(s.dir, s.live, /rejected by the current schema/); });
  it("record version mismatch -> fail closed", async () => { const s = await seeded(); rewrite(s.path, (r) => { r.identity.recordVersion = "hd4-durable-call-record.v0"; }, true); await expectFailClosed(s.dir, s.live, /record version/); });
  it("a record planted at the exact key with a different identity inside -> fail closed", async () => {
    const s = await seeded(); const other = tmp(); const olive = { calls: 0 }; const oc = caller(other, olive, { passId: "pass-2" }); await oc.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1));
    writeFileSync(s.path, readFileSync(oc.log[0]!.recordPath, "utf8")); await expectFailClosed(s.dir, s.live, /identity mismatch on passId|request hash mismatch/);
  });
  const missCases: [string, () => Parameters<typeof caller>[2], Parameters<typeof caller>[3] | undefined, string | undefined][] = [
    ["changed system prompt", () => ({}), undefined, "system prompt v2"],
    ["changed source context", () => ({ sourceContextHash: "ctx-hash-2" }), undefined, undefined],
    ["changed model", () => ({}), { model: "m2" }, undefined],
    ["changed schema identity", () => ({}), { schemaIds: { semantic_inventory: "other#Schema" } }, undefined],
    ["changed Pass-A prompt version", () => ({ promptVersion: "prompt.v6" }), undefined, undefined],
    ["changed Pass-A algorithm version", () => ({ algorithmVersion: "alg.v6" }), undefined, undefined],
    ["wrong pass id", () => ({ passId: "pass-2" }), undefined, undefined],
    ["wrong candidate", () => ({ candidateRef: "cand:6.02" }), undefined, undefined],
    ["wrong document", () => ({ sourceDocumentId: "doc-b" }), undefined, undefined],
    ["wrong mission", () => ({ missionId: "other-mission" }), undefined, undefined],
  ];
  for (const [label, over, opts, sys] of missCases) it(`${label} -> MISS, executes live, original record untouched`, async () => {
    const s = await seeded(); const before = readFileSync(s.path, "utf8");
    const c = caller(s.dir, s.live, over(), opts); await c.call(SubmitSemanticInventorySchema, "semantic_inventory", sys ?? SYS, USER(1));
    expect(c.log[0]!.origin).toBe("LIVE_PROVIDER"); expect(c.log[0]!.requestHash).not.toBe(s.hash); expect(s.live.calls).toBe(2); expect(readFileSync(s.path, "utf8")).toBe(before);
  });
  it("changed user content (a different batch) -> MISS", async () => { const s = await seeded(); const c = caller(s.dir, s.live); await c.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(2)); expect(c.log[0]!.origin).toBe("LIVE_PROVIDER"); expect(s.live.calls).toBe(2); });
  it("changed schema STRUCTURE with the same explicit id -> MISS (fingerprint is structural)", async () => {
    const s = await seeded(); const c = caller(s.dir, s.live);
    await c.call(z.object({ items: z.array(z.string()).default([]), overallNotes: z.array(z.string()).default([]) }), "semantic_inventory", SYS, USER(1));
    expect(c.log[0]!.origin).toBe("LIVE_PROVIDER"); expect(s.live.calls).toBe(2);
  });
});

describe("HD-4 §11/§21 cost accounting: replayed work is logical, not paid", () => {
  const rates = { passABatchMean: 0.4, passABatchWorst: 0.55, passABatchCalls: 1, passAGapMean: 0.3, passAGapWorst: 0.35, passAGapCalls: 1, passBMean: 0.00004, passBWorst: 0.00004, passBShards: 1, verifierSemanticReview: 0.33, verifierCalls: 1 };
  it("10 logical calls: 6 durable replays + 4 live -> new spend prices only the 4 live calls; historical reported separately; guard counters decremented for all 10", async () => {
    const dir = tmp(); const live = { calls: 0 };
    const first = caller(dir, live, {}, { model: PRICED_MODEL }); for (let i = 1; i <= 6; i++) await first.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(i));
    const guard = new Guard({ rates, passABatchesPerPass: 10, passAGapCallsPerPass: 0, passes: 1, passBPlannerTokens: 0, verifierReviews: 0, conditionSuspicionCalls: 0, capUsd: 100, balanceUsd: 100 });
    const dec = () => { guard.passABatchesRemaining = Math.max(0, guard.passABatchesRemaining - 1); };
    const guarded = new GuardedStageCaller(simpleInner(live, PRICED_MODEL, 0.25), "passA-1", guard, dec);
    const durable = new DurableReplayStageCaller(guarded, new DurableCallStore(dir), scope(), PASS_A_SCHEMA_IDS, { onReplay: (e) => { dec(); guard.recordReplay(`passA-1:${e.stage}`, PRICED_MODEL, e.originalCostUsd); } });
    for (let i = 1; i <= 10; i++) await durable.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(i));
    expect(durable.summary()).toEqual({ logicalCalls: 10, replayedCalls: 6, liveCalls: 4, liveCostUsd: 1, historicalReplayedCostUsd: 1.5, providerCallsAvoided: 6 });
    expect(live.calls).toBe(10); // 6 from the first process, 4 from the restart
    expect(guard.liveCount()).toBe(4); expect(guard.replayCount()).toBe(6);
    const perLive = calculateCostUsd(10, 5, PRICED_MODEL)!; expect(perLive).toBeGreaterThan(0);
    expect(guard.spent).toBeCloseTo(4 * perLive, 12); // the guard prices ONLY the 4 live calls with its own rate card
    expect(guard.historicalReplayedUsd).toBeCloseTo(1.5, 9);
    expect(guard.passABatchesRemaining).toBe(0); expect(guard.conservativeRemaining()).toBe(0);
    expect(guard.calls.filter((c) => c.origin === "DURABLE_REPLAY").every((c) => c.costUsd === 0)).toBe(true);
  });
  it("the guard admits by PAID remaining work: with 9 of 10 calls replayable, a cap that only fits one live call admits", async () => {
    const dir = tmp(); const live = { calls: 0 };
    const first = caller(dir, live, {}, { model: PRICED_MODEL }); for (let i = 1; i <= 9; i++) await first.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(i));
    const guard = new Guard({ rates, passABatchesPerPass: 10, passAGapCallsPerPass: 0, passes: 1, passBPlannerTokens: 0, verifierReviews: 0, conditionSuspicionCalls: 0, capUsd: 0.7, balanceUsd: 100 });
    expect(guard.wouldAdmit().admitted).toBe(false); // 10 x 0.55 x 1.25 = 6.875 > 0.7 before any replay is credited
    const dec = () => { guard.passABatchesRemaining = Math.max(0, guard.passABatchesRemaining - 1); };
    const durable = new DurableReplayStageCaller(new GuardedStageCaller(simpleInner(live, PRICED_MODEL, 0.25), "passA-1", guard, dec), new DurableCallStore(dir), scope(), PASS_A_SCHEMA_IDS, { onReplay: (e) => { dec(); guard.recordReplay(`passA-1:${e.stage}`, PRICED_MODEL, e.originalCostUsd); } });
    for (let i = 1; i <= 10; i++) await durable.call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(i)); // the 10th is live: 1 x 0.55 x 1.25 = 0.6875 <= 0.7 admitted
    expect(durable.summary()).toMatchObject({ replayedCalls: 9, liveCalls: 1 }); expect(guard.refusals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §16 Pass B: terminal shard durability on the priorShardResults / shardHash contract; §17 verifier
// ---------------------------------------------------------------------------
const SMALL: Partial<ShardBudget> = { targetPrimaryChars: 1_200, maxPrimaryChars: 2_400, maxContextChars: 4_000, maxContextEntryChars: 600, maxUnitsPerShard: 16 };
function throwingCaller(): SemanticCaller { return { providerName: "scripted", model: "scripted-model", isSynthetic: false, compile: async () => { throw new Error("semantic caller must not be invoked"); } }; }
function throwingInventory(): StageCaller { return { providerName: "scripted", model: "scripted", isSynthetic: false, call: async () => { throw new Error("Pass A must not run"); }, lastTelemetry: () => null }; }
function inputFor(corpus: SyntheticCorpus): SemanticCompilerInput {
  const region = corpus.sourceContext.regions[0]!; const contextBundle = emptyContextBundle();
  return testCompilerInput({ companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, candidateRef: corpus.frozenInventory.candidateRef, sourceSectionRef: "1.01", operativeSourceText: region.text, operativeCharStart: region.charStart, contextBundle, toolAccess: { structuralIndex: corpus.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle } });
}
function planFor(corpus: SyntheticCorpus): ShardPlan { return planCompilationShards({ candidateRef: corpus.frozenInventory.candidateRef, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext: corpus.sourceContext, frozenInventory: corpus.frozenInventory, structuralIndex: corpus.index, budget: SMALL, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } }); }
const faithful = (corpus: SyntheticCorpus, plan: ShardPlan, kill: KillSwitch, executed: string[]): ShardExecutor => async (shard) => {
  if (kill.dead || kill.successes >= kill.killAfter) { kill.dead = true; throw new SimulatedProcessKill(); }
  executed.push(shard.shardId); kill.successes++;
  return { status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: { inputTokens: 100, outputTokens: 50, costUsd: 0.02 } };
};
const opts = (corpus: SyntheticCorpus, extra: Partial<CompileOptions>): CompileOptions => ({ caller: throwingCaller(), inventoryCaller: throwingInventory(), inventoryMode: "SINGLE_PASS", frozenInventory: corpus.frozenInventory, cache: new InMemorySemanticCompilationCache(), shardBudget: SMALL, shardMaxAttempts: 1, ...extra });
const projection = (r: SemanticCompilationResult) => stripVolatile({ status: r.status, rules: r.rules, definitions: r.definitions, caps: r.sharedCapacities, failureReasons: r.failureReasons, complete: r.accountability?.semanticallyComplete });

describe("HD-4 §16 Pass B: kill after / during a terminal shard, restart reuses exact-hash shards only", () => {
  const corpus = buildDefinitionsCorpus({ count: 40 });
  const plan = planFor(corpus);
  it("plan is sharded (>= 3 shards) and the control run completes", async () => {
    expect(plan.shards.length).toBeGreaterThanOrEqual(3);
    const r = await compileCovenantToIR(inputFor(corpus), opts(corpus, { shardExecutor: faithful(corpus, plan, new KillSwitch(Infinity), []) }));
    expect(r.execution!.mode).toBe("SHARDED"); expect(r.execution!.planHash).toBe(plan.planHash); expect(r.status).toBe("COMPLETED");
  });
  for (const [label, killAfter] of [["G - kill after one terminal shard", 1], ["H - kill during a shard (two persisted, the third in flight)", 2]] as const) it(label, async () => {
    const control = await compileCovenantToIR(inputFor(corpus), opts(corpus, { shardExecutor: faithful(corpus, plan, new KillSwitch(Infinity), []) }));
    const dir = tmp(); const store1 = new DurableShardStore(join(dir, "shards")); const ex1: string[] = [];
    const first = await compileCovenantToIR(inputFor(corpus), opts(corpus, { shardExecutor: durableShardExecutor(faithful(corpus, plan, new KillSwitch(killAfter), ex1), store1, plan, MISSION) }));
    expect(ex1.length).toBe(killAfter); expect(first.status).not.toBe("COMPLETED");
    expect(readdirSync(join(dir, "shards")).filter((f) => f.endsWith(".json")).length, "only terminal results are persisted; provider failures never are").toBe(killAfter);
    // restart
    const store2 = new DurableShardStore(join(dir, "shards")); const { prior, rejected } = store2.loadPriorResults(plan, MISSION);
    expect(rejected).toEqual([]); expect(prior.size).toBe(killAfter);
    const ex2: string[] = [];
    const second = await compileCovenantToIR(inputFor(corpus), opts(corpus, { priorShardResults: prior, shardExecutor: durableShardExecutor(faithful(corpus, plan, new KillSwitch(Infinity), ex2), store2, plan, MISSION) }));
    expect(ex2.sort()).toEqual(plan.shards.map((s) => s.shardId).filter((id) => !ex1.includes(id)).sort());
    expect(second.execution!.sharded!.reused).toBe(killAfter); expect(second.execution!.sharded!.executed).toBe(plan.shards.length - killAfter);
    expect(projection(second)).toEqual(projection(control));
    expect(readdirSync(join(dir, "shards")).filter((f) => f.endsWith(".json")).length).toBe(plan.shards.length);
  });
  it("shard records are bound to mission + plan + shard hash and reject corruption", async () => {
    const dir = tmp(); const store = new DurableShardStore(join(dir, "shards"));
    await compileCovenantToIR(inputFor(corpus), opts(corpus, { shardExecutor: durableShardExecutor(faithful(corpus, plan, new KillSwitch(Infinity), []), store, plan, MISSION) }));
    expect(store.loadPriorResults(plan, "other-mission").prior.size).toBe(0);
    const otherPlan = planFor(buildDefinitionsCorpus({ count: 41 })); expect(store.loadPriorResults(otherPlan, MISSION).prior.size).toBe(0);
    const f = join(dir, "shards", `${plan.shards[0]!.shardHash}.json`); const raw = readFileSync(f, "utf8"); writeFileSync(f, raw.slice(0, raw.length / 2));
    const { prior, rejected } = store.loadPriorResults(plan, MISSION); expect(prior.size).toBe(plan.shards.length - 1); expect(rejected.length).toBe(1);
  });
});

describe("HD-4 §17 verifier: durable replay of semantic review / condition suspicion", () => {
  const corpus = buildDefinitionsCorpus({ count: 40 });
  function verifierLive(kill: KillSwitch, live: { calls: number }): { review: StageCaller; suspicion: StageCaller } {
    const mk = (payload: unknown): StageCaller => { let last: AnalyzerCallTelemetry | null = null; return { providerName: "scripted", model: "scripted-verifier", isSynthetic: false, async call<T>(_s: unknown, stage: string): Promise<T> { if (kill.dead || kill.successes >= kill.killAfter) { kill.dead = true; throw new SimulatedProcessKill(); } live.calls++; kill.successes++; last = { provider: "scripted", model: "scripted-verifier", promptVersion: "p", schemaVersion: "s", stage, timestamp: "t", inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, cacheCreationInputTokens: 0, attemptCount: 1, retryCount: 0, rateLimitFailures: 0, latencyMs: 1, providerCost: undefined, calculatedCostUsd: 0.1 }; return payload as T; }, lastTelemetry: () => last }; };
    return { review: mk({ findings: [], overallNotes: ["scripted review"] }), suspicion: mk({ status: "MATERIAL_CONDITION_POSSIBLE", evidence: [] }) };
  }
  it("I - kill after the semantic review (all verifier calls persisted): restart replays every call, 0 live, identical verdict", async () => {
    const plan = planFor(corpus);
    const compiled = await compileCovenantToIR(inputFor(corpus), opts(corpus, { shardExecutor: faithful(corpus, plan, new KillSwitch(Infinity), []) }));
    const vIn = { ...inputFor(corpus), sourceContext: undefined, frozenInventory: undefined };
    const sc = verifierScope(MISSION, corpus.frozenInventory.candidateRef, DOC, corpus.sourceContext);
    const dir = tmp(); const live1 = { calls: 0 };
    const d1 = durableVerifierCallers(dir, sc, verifierLive(new KillSwitch(Infinity), live1));
    const v1 = await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compiled }, { reviewCaller: d1.review, conditionSuspicionCaller: d1.suspicion, forceSemanticReview: true });
    expect(v1.semanticReviewInvoked).toBe(true); expect(live1.calls).toBeGreaterThanOrEqual(1);
    const n = d1.review.log.length + d1.suspicion.log.length; expect(n).toBe(live1.calls);
    // "process dies" before final artifacts are written -> restart
    const live2 = { calls: 0 }; const d2 = durableVerifierCallers(dir, sc, verifierLive(new KillSwitch(Infinity), live2));
    const v2 = await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compiled }, { reviewCaller: d2.review, conditionSuspicionCaller: d2.suspicion, forceSemanticReview: true });
    expect(live2.calls).toBe(0); expect(d2.review.summary().replayedCalls + d2.suspicion.summary().replayedCalls).toBe(n);
    expect(stripVolatile({ status: v2.status, findings: v2.findings, invoked: v2.semanticReviewInvoked })).toEqual(stripVolatile({ status: v1.status, findings: v1.findings, invoked: v1.semanticReviewInvoked }));
  });
  it("I' - kill DURING the semantic review (nothing persisted for it): restart executes exactly that call live", async () => {
    const plan = planFor(corpus);
    const compiled = await compileCovenantToIR(inputFor(corpus), opts(corpus, { shardExecutor: faithful(corpus, plan, new KillSwitch(Infinity), []) }));
    const vIn = { ...inputFor(corpus), sourceContext: undefined, frozenInventory: undefined };
    const sc = verifierScope(MISSION, corpus.frozenInventory.candidateRef, DOC, corpus.sourceContext);
    const dir = tmp(); const live1 = { calls: 0 };
    const d1 = durableVerifierCallers(dir, sc, verifierLive(new KillSwitch(0), live1)); // the review call dies in flight
    const v1 = await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compiled }, { reviewCaller: d1.review, conditionSuspicionCaller: d1.suspicion, forceSemanticReview: true });
    expect(live1.calls).toBe(0); expect(d1.review.log.length).toBe(0); void v1;
    const live2 = { calls: 0 }; const d2 = durableVerifierCallers(dir, sc, verifierLive(new KillSwitch(Infinity), live2));
    await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compiled }, { reviewCaller: d2.review, conditionSuspicionCaller: d2.suspicion, forceSemanticReview: true });
    expect(live2.calls).toBe(1); expect(d2.review.summary()).toMatchObject({ liveCalls: 1, replayedCalls: 0 });
    const live3 = { calls: 0 }; const d3 = durableVerifierCallers(dir, sc, verifierLive(new KillSwitch(Infinity), live3));
    await verifyCompiledCandidate({ compilerInput: vIn, compilationResult: compiled }, { reviewCaller: d3.review, conditionSuspicionCaller: d3.suspicion, forceSemanticReview: true });
    expect(live3.calls).toBe(0); expect(d3.review.summary()).toMatchObject({ liveCalls: 0, replayedCalls: 1 });
  });
});

describe("HD-4 §22: historical 5bd15c2 traces are not replay records", () => {
  it("the interrupted run's evidence directory holds no durable call records; guard-state/run.log cannot be loaded as records", () => {
    const dir = "tests/fixtures/unseen-packages/phase-3-final-601-final-clean";
    expect(existsSync(`${dir}/durable-calls`)).toBe(false); expect(existsSync(`${dir}/frozen-inventory.json`)).toBe(false);
    const probe = tmp(); mkdirSync(join(probe, "durable-calls"), { recursive: true });
    const id = caller(probe + "/durable-calls", { calls: 0 }).identityFor(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1));
    writeFileSync(join(probe, "durable-calls", `${computeRequestHash(id)}-0.json`), readFileSync(`${dir}/guard-state.ndjson`, "utf8"));
    const live = { calls: 0 };
    return expect(caller(probe + "/durable-calls", live).call(SubmitSemanticInventorySchema, "semantic_inventory", SYS, USER(1))).rejects.toBeInstanceOf(DurableReplayRecordInvalidError);
  });
});
