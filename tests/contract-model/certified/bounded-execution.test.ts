/**
 * Certified LLM execution, proven with a fake provider client - zero model calls.
 *
 *   one structured call per candidate            missing context -> exactly one deterministic refinement
 *   non-convergence fails closed (no third call)  a timeout is a REAL abort the request observes
 *   429 retried once, 500 bounded, 402 stops      schema failure is never retried
 *   budget refusal happens BEFORE dispatch        token-amplification gate (no transcript replay)
 *   certified config decides inventory mode       shard attempts = 1 under the certified config
 */
import { afterEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { BoundedSemanticCaller, MAX_REFINEMENT_CONVERSATIONS, MAX_SEMANTIC_CONVERSATIONS, SUBMIT_TOOL_NAME } from "../../../lib/contract-model/compiler/semantic/bounded-caller";
import type { MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { ProviderError } from "../../../lib/contract-model/analyzer/provider-error";
import { createDeadline } from "../../../lib/contract-model/analyzer/deadline";
import { BudgetRefusedError, HardDispatchBudget } from "../../../lib/contract-model/analyzer/dispatch-budget";
import { CERTIFIED_TRANSPORT_RETRY_POLICY } from "../../../lib/contract-model/analyzer/transport-retry";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import { certifiedConfig, validateCertifiedConfig } from "../../../lib/contract-model/compiler/certified-config";
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import type { SemanticCompilerInput } from "../../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput, emptyContextBundle } from "../semantic-compiler/test-helpers";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { buildDefinitionsCorpus, CO, INST, DOC } from "../f7a-synthetic-corpus";

const MODEL = "deepseek/deepseek-v4-flash";
const FAST = { ...CERTIFIED_TRANSPORT_RETRY_POLICY, baseDelayMs: 1 };

// ---------------------------------------------------------------- fake provider
type Params = Parameters<MinimalAnthropicClient["messages"]["stream"]>[0];
interface Recorded { params: Params; signal: AbortSignal | undefined; startedAt: number; endedAt: number | null }
type Step = (req: Recorded) => Promise<Anthropic.Message> | Anthropic.Message;

function message(input: unknown, usage = { input_tokens: 1000, output_tokens: 200 }, stop: Anthropic.Message["stop_reason"] = "tool_use", withTool = true): Anthropic.Message {
  return { id: "msg_fake", type: "message", role: "assistant", model: MODEL, content: withTool ? [{ type: "tool_use", id: "tu_1", name: SUBMIT_TOOL_NAME, input }] : [{ type: "text", text: "I cannot", citations: null }], stop_reason: stop, stop_sequence: null, usage: { ...usage, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as unknown as Anthropic.Message;
}
const apiError = (status: number, type: string) => Object.assign(new Error(`${status} ${type}`), { status, error: { error: { type, message: type } } });
const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

function fakeClient(steps: Step[]): MinimalAnthropicClient & { requests: Recorded[] } {
  const requests: Recorded[] = [];
  return {
    requests,
    messages: {
      stream: (params, options) => {
        const rec: Recorded = { params, signal: options?.signal, startedAt: Date.now(), endedAt: null };
        requests.push(rec);
        const step = steps[requests.length - 1];
        return {
          finalMessage: async () => {
            if (!step) throw new Error(`fake provider: unexpected request #${requests.length}`);
            if (rec.signal?.aborted) { rec.endedAt = Date.now(); throw abortError(); }
            try { return await step(rec); } finally { rec.endedAt = Date.now(); }
          },
        };
      },
    },
  };
}
/** A request that never answers on its own: it only ends when the signal aborts (what a real fetch does). */
const hangsUntilAborted: Step = (rec) => new Promise((_, reject) => { const s = rec.signal; if (!s) return; s.addEventListener("abort", () => reject(abortError()), { once: true }); });

const OK = { rules: [{ localRef: "r1", sourceSectionRef: "7.01", covenantFamily: "INDEBTEDNESS", ruleType: "GENERAL_PROHIBITION", posture: "PROHIBITION", sufficiency: "SUFFICIENT", citation: "7.01", excerpt: "shall not incur" }], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
const MISSING = { ...OK, rules: [{ ...OK.rules[0], sufficiency: "MISSING_CONTEXT", sufficiencyReasons: ['definition "Consolidated EBITDA" not in context'] }] };

const AGREEMENT = ["SECTION 1.01. Defined Terms .", "\"Consolidated EBITDA\" means Consolidated Net Income plus interest, taxes, depreciation and amortization.", "\"Consolidated Net Income\" means net income of the Borrower on a consolidated basis.", "ARTICLE VII NEGATIVE COVENANTS", "SECTION 7.01. Indebtedness . The Borrower shall not incur any Indebtedness if Consolidated EBITDA is less than $10,000,000."].join("\n\n");
function input(overrides: Partial<SemanticCompilerInput> = {}): SemanticCompilerInput {
  const index = buildTestIndex([{ documentId: "doc-x", label: "X", text: AGREEMENT }]);
  const contextBundle = emptyContextBundle();
  return testCompilerInput({ sourceDocumentId: "doc-x", candidateRef: "cand:7.01", sourceSectionRef: "7.01", operativeSourceText: "The Borrower shall not incur any Indebtedness if Consolidated EBITDA is less than $10,000,000.", contextBundle, toolAccess: { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle }, ...overrides });
}
const caller = (client: MinimalAnthropicClient) => new BoundedSemanticCaller("fake", MODEL, client, { maxOutputTokens: 4000, transportPolicy: FAST });

describe("bounded semantic execution", () => {
  it("the certified maxima are code constants: 1 semantic conversation, at most 1 refinement", () => {
    expect(MAX_SEMANTIC_CONVERSATIONS).toBe(1); expect(MAX_REFINEMENT_CONVERSATIONS).toBe(1);
  });

  it("normal candidate: exactly ONE request, submit forced by tool_choice, one user message, telemetry priced at the model's own card", async () => {
    const client = fakeClient([() => message(OK)]);
    const r = await caller(client).compile(input());
    expect(client.requests.length).toBe(1);
    expect(client.requests[0]!.params.tool_choice).toEqual({ type: "tool", name: SUBMIT_TOOL_NAME });
    expect(client.requests[0]!.params.messages.length).toBe(1);
    expect(client.requests[0]!.params.tools.map((t) => t.name)).toEqual([SUBMIT_TOOL_NAME]); // no evidence tools: nothing for a model to loop over
    expect(r.submission?.rules[0]?.localRef).toBe("r1"); expect(r.failureReason).toBeNull();
    const t = r.telemetry as unknown as { semanticConversations: number; refinementConversations: number; transportAttempts: number; calculatedCostUsd: number | null; pricing: { pricingStatus: string } };
    expect(t).toMatchObject({ semanticConversations: 1, refinementConversations: 0, transportAttempts: 1, pricing: { pricingStatus: "PRICED" } });
    expect(t.calculatedCostUsd).toBeCloseTo(1000 * 0.13e-6 + 200 * 0.26e-6, 12);
  });

  it("missing context: the reported gap is retrieved DETERMINISTICALLY, then exactly one refinement built from canonical state (no transcript replay)", async () => {
    const client = fakeClient([() => message(MISSING), () => message(OK)]);
    const r = await caller(client).compile(input());
    expect(client.requests.length).toBe(2);
    const second = client.requests[1]!.params;
    expect(second.messages.length).toBe(1); expect(second.messages[0]!.role).toBe("user"); // a fresh single-message request, not the first conversation continued
    expect(second.system).toBe(client.requests[0]!.params.system);
    const user2 = String(second.messages[0]!.content);
    expect(user2).toContain("DETERMINISTICALLY RETRIEVED DEPENDENCY MATERIAL"); expect(user2).toContain("Consolidated Net Income plus interest"); expect(user2).toContain("YOUR PROVISIONAL SUBMISSION");
    expect(r.toolCallLog.map((e) => e.toolName)).toEqual(["getDefinition"]); expect(r.toolCallLog[0]!.outputSummary).toMatch(/deterministic pre-retrieval/);
    expect(r.submission?.rules[0]?.sufficiency).toBe("SUFFICIENT");
    expect(r.telemetry).toMatchObject({ semanticConversations: 1, refinementConversations: 1, transportAttempts: 2, deterministicRetrievals: 1 });
  });

  it("non-convergence fails closed: the refinement still reports the gap -> the honest submission stands, NO third request", async () => {
    const client = fakeClient([() => message(MISSING), () => message(MISSING), () => { throw new Error("third request must never happen"); }]);
    const r = await caller(client).compile(input());
    expect(client.requests.length).toBe(2);
    expect(r.submission?.rules[0]?.sufficiency).toBe("MISSING_CONTEXT"); expect(r.failureReason).toBeNull();
  });

  it("a refinement that fails at the provider keeps the provisional submission with PROVIDER_FAILURE and never a third request", async () => {
    const client = fakeClient([() => message(MISSING), () => { throw apiError(400, "invalid_request_error"); }]);
    const r = await caller(client).compile(input());
    expect(client.requests.length).toBe(2);
    expect(r.submission?.rules[0]?.sufficiency).toBe("MISSING_CONTEXT"); expect(r.failureReason).toBe("PROVIDER_FAILURE"); expect(r.failureDetail).toMatch(/CLIENT_ERROR 400/);
  });

  it("timeout is a REAL abort: the request observes the signal, terminates, and compile rejects ABORTED only after termination", async () => {
    const client = fakeClient([hangsUntilAborted]);
    const deadline = createDeadline(40);
    const started = Date.now();
    await expect(caller(client).compile(input(), { signal: deadline.signal })).rejects.toMatchObject({ kind: "ABORTED", retryable: false });
    const rec = client.requests[0]!;
    expect(rec.signal).toBe(deadline.signal); expect(rec.signal!.aborted).toBe(true); expect(rec.endedAt).not.toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    deadline.dispose();
    // no request is even started once the signal is already aborted
    const client2 = fakeClient([() => message(OK)]); const c = new AbortController(); c.abort(new Error("cancelled"));
    await expect(caller(client2).compile(input(), { signal: c.signal })).rejects.toThrow(/cancelled/);
    expect(client2.requests.length).toBe(0);
  });

  it("no zombies: with concurrency 2 the third candidate starts only after a timed-out one has TERMINATED; active requests never exceed 2", async () => {
    let active = 0, peak = 0;
    const events: string[] = [];
    const client = fakeClient([
      (rec) => { active++; peak = Math.max(peak, active); events.push("start-1"); return new Promise((_, rej) => rec.signal!.addEventListener("abort", () => { active--; events.push("end-1"); rej(abortError()); }, { once: true })); },
      (rec) => { active++; peak = Math.max(peak, active); events.push("start-2"); return new Promise((_, rej) => rec.signal!.addEventListener("abort", () => { active--; events.push("end-2"); rej(abortError()); }, { once: true })); },
      () => { active++; peak = Math.max(peak, active); events.push("start-3"); active--; events.push("end-3"); return message(OK); },
    ]);
    const semantic = caller(client);
    const candidates = ["a", "b", "c"];
    const outcomes: string[] = [];
    // a tiny worker pool, the shape the certified map runner uses: a worker takes the next candidate only when its previous one has settled
    const queue = [...candidates];
    const worker = async () => { for (let next = queue.shift(); next !== undefined; next = queue.shift()) { const d = createDeadline(30); try { await semantic.compile(input({ candidateRef: `cand:${next}` }), { signal: d.signal }); outcomes.push(`${next}:ok`); } catch (e) { outcomes.push(`${next}:${(e as ProviderError).kind}`); } finally { d.dispose(); } } };
    await Promise.all([worker(), worker()]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(events.indexOf("start-3")).toBeGreaterThan(Math.min(events.indexOf("end-1"), events.indexOf("end-2")));
    expect(outcomes.sort()).toEqual(["a:ABORTED", "b:ABORTED", "c:ok"]);
  });

  it("429: exactly one transport retry, still ONE semantic conversation", async () => {
    const client = fakeClient([() => { throw apiError(429, "rate_limit_error"); }, () => message(OK)]);
    const r = await caller(client).compile(input());
    expect(client.requests.length).toBe(2);
    expect(r.telemetry).toMatchObject({ semanticConversations: 1, refinementConversations: 0, transportAttempts: 2, retryCount: 1, rateLimitFailures: 1 });
  });

  it("500: bounded to the policy's attempts (2) then a ProviderError SERVER_ERROR", async () => {
    let n = 0;
    const client = fakeClient([() => { n++; throw apiError(500, "api_error"); }, () => { n++; throw apiError(503, "overloaded_error"); }, () => { n++; return message(OK); }]);
    await expect(caller(client).compile(input())).rejects.toMatchObject({ kind: "SERVER_ERROR" });
    expect(n).toBe(2); expect(client.requests.length).toBe(2);
  });

  it("402: immediate stop, one request, the reservation is released as REFUSED_NO_COST", async () => {
    const budget = new HardDispatchBudget({ ceilingUsd: 5, maxCalls: 10 });
    const client = fakeClient([() => { throw apiError(402, "insufficient_funds"); }]);
    await expect(caller(client).compile(input(), { budget })).rejects.toMatchObject({ kind: "CREDIT_EXHAUSTED", httpStatus: 402, retryable: false, billingKnown: true });
    expect(client.requests.length).toBe(1);
    const s = budget.snapshot();
    expect(s.outstandingUsd).toBe(0); expect(s.exactUsd).toBe(0); expect(s.retainedUsd).toBe(0);
  });

  it("schema failure is never retried: no submit block -> MODEL_SCHEMA_FAILURE after ONE request; invalid submit input likewise; max_tokens -> OUTPUT_TRUNCATED", async () => {
    const c1 = fakeClient([() => message(null, undefined, "end_turn", false)]);
    const r1 = await caller(c1).compile(input());
    expect(r1.failureReason).toBe("MODEL_SCHEMA_FAILURE"); expect(c1.requests.length).toBe(1);
    const c2 = fakeClient([() => message({ rules: "not-an-array" })]);
    const r2 = await caller(c2).compile(input());
    expect(r2.failureReason).toBe("MODEL_SCHEMA_FAILURE"); expect(c2.requests.length).toBe(1); expect(r2.rawSubmission).toEqual({ rules: "not-an-array" });
    const c3 = fakeClient([() => message({ rules: [{ localRef: 1 }] }, undefined, "max_tokens")]);
    const r3 = await caller(c3).compile(input());
    expect(r3.failureReason).toBe("OUTPUT_TRUNCATED"); expect(c3.requests.length).toBe(1);
  });

  it("budget refusal happens BEFORE dispatch: zero requests, and a successful call settles EXACT usage", async () => {
    const tiny = new HardDispatchBudget({ ceilingUsd: 0.0001, maxCalls: 10 });
    const client = fakeClient([() => message(OK)]);
    await expect(caller(client).compile(input(), { budget: tiny })).rejects.toBeInstanceOf(BudgetRefusedError);
    expect(client.requests.length).toBe(0);
    const ok = new HardDispatchBudget({ ceilingUsd: 1, maxCalls: 10 });
    await caller(fakeClient([() => message(OK)])).compile(input(), { budget: ok });
    const s = ok.snapshot();
    expect(s.outstandingUsd).toBe(0); expect(s.exactUsd).toBeCloseTo(1000 * 0.13e-6 + 200 * 0.26e-6, 12); expect(s.calls).toBe(1);
  });

  it("token-amplification gate: at most 2 requests per candidate, every request carries ONE message, and the refinement prompt never replays the first exchange", async () => {
    const client = fakeClient([() => message(MISSING), () => message(MISSING)]);
    const r = await caller(client).compile(input());
    expect(client.requests.length).toBeLessThanOrEqual(2);
    for (const req of client.requests) expect(req.params.messages.length).toBe(1);
    const p1 = client.requests[0]!.params, p2 = client.requests[1]!.params;
    const chars = (p: Params) => p.system.length + p.messages.reduce((n, m) => n + String(m.content).length, 0);
    const t = r.telemetry as unknown as { promptChars: { pass1: number; pass2: number } };
    expect(t.promptChars.pass1).toBe(chars(p1)); expect(t.promptChars.pass2).toBe(chars(p2));
    // growth is bounded by the retrieved material + the provisional submission, not by a transcript: well under 2x here
    expect(chars(p2) / chars(p1)).toBeLessThan(2);
    expect(String(p2.messages[0]!.content)).not.toContain("tool_result");
    // the legacy caller's loop budget (12 turns) is not reachable from this class
    const src = (await import("node:fs")).readFileSync("lib/contract-model/compiler/semantic/bounded-caller.ts", "utf8");
    expect(src).not.toMatch(/MAX_TURN_OVERHEAD|while \(turn|for \(let turn/);
  });
});

// ---------------------------------------------------------------- certified compile path
function countingInventory(): StageCaller & { calls: number } {
  const c = { calls: 0 };
  return { providerName: "scripted", model: "scripted", isSynthetic: false, get calls() { return c.calls; }, call: async (schema) => { c.calls++; try { return schema.parse({ items: [], uninventoriedValues: [], notes: [] }); } catch { return schema.parse({}); } }, lastTelemetry: () => null } as StageCaller & { calls: number };
}
const savedEnv = process.env.SEMANTIC_INVENTORY_MODE;
afterEach(() => { if (savedEnv === undefined) delete process.env.SEMANTIC_INVENTORY_MODE; else process.env.SEMANTIC_INVENTORY_MODE = savedEnv; });

describe("certified compile path", () => {
  it("the inventory mode comes from the explicit config, never from SEMANTIC_INVENTORY_MODE; the config identity enters the cache key", async () => {
    process.env.SEMANTIC_INVENTORY_MODE = "SINGLE_PASS";
    const corpus = buildDefinitionsCorpus({ count: 3 });
    const region = corpus.sourceContext.regions[0]!;
    const bundle = emptyContextBundle();
    const inp = testCompilerInput({ companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, candidateRef: corpus.frozenInventory.candidateRef, sourceSectionRef: "1.01", operativeSourceText: region.text, operativeCharStart: region.charStart, contextBundle: bundle, toolAccess: { structuralIndex: corpus.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: bundle } });
    const p1 = countingInventory(), p2 = countingInventory();
    const client = fakeClient([() => message({ rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] })]);
    const cfg = certifiedConfig({ semanticModel: MODEL, inventoryModel: MODEL, verifierModel: MODEL });
    expect(validateCertifiedConfig(cfg)).toEqual([]);
    const cache = new InMemorySemanticCompilationCache();
    const r = await compileCovenantToIR(inp, { caller: caller(client), inventoryPassCallers: [p1, p2], certified: cfg, cache });
    expect(p1.calls).toBeGreaterThanOrEqual(1); expect(p2.calls).toBeGreaterThanOrEqual(1); // DUAL_PASS_ENSEMBLE despite the env var saying SINGLE_PASS
    expect(r.inventoryMode).toBe("DUAL_PASS_ENSEMBLE"); expect(r.inventoryPasses?.length).toBe(2);
    expect(r.cacheKey).toMatch(/^[0-9a-f]{64}$/);
    // the same input under a different explicit config is a different cache identity
    const cfg2 = certifiedConfig({ semanticModel: MODEL, inventoryModel: MODEL, verifierModel: MODEL, inventoryMode: "SINGLE_PASS" });
    const r2 = await compileCovenantToIR(inp, { caller: caller(fakeClient([() => message({ rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] })])), inventoryCaller: countingInventory(), certified: cfg2, cache });
    expect(r2.cacheKey).not.toBe(r.cacheKey);
    // and the same input with NO certified config (legacy env-driven identity) is a third identity
    const r3 = await compileCovenantToIR(inp, { caller: caller(fakeClient([() => message({ rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] })])), inventoryCaller: countingInventory(), inventoryMode: "SINGLE_PASS", cache });
    expect(new Set([r.cacheKey, r2.cacheKey, r3.cacheKey]).size).toBe(3);
  });

  it("validateCertifiedConfig refuses ambiguity: unknown inventory mode, >1 conversation, >1 shard attempt, out-of-range retries", () => {
    const base = certifiedConfig({ semanticModel: MODEL, inventoryModel: MODEL, verifierModel: MODEL });
    expect(validateCertifiedConfig({ ...base, inventoryMode: "AUTO" as never })).toContain("inventoryMode must be explicit");
    expect(validateCertifiedConfig({ ...base, maxSemanticConversations: 2 as never })).toContain("maxSemanticConversations must be 1");
    expect(validateCertifiedConfig({ ...base, shardMaxAttempts: 2 as never })).toContain("shardMaxAttempts must be 1");
    expect(validateCertifiedConfig({ ...base, transportRetry: { ...base.transportRetry, maxAttempts: 5 } })).toContain("transportRetry.maxAttempts must be 1..3");
    expect(validateCertifiedConfig({ ...base, semanticModel: "" })).toContain("semanticModel must be explicit");
  });
});
