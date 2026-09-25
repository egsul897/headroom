/** Certified transport layer: provider errors, pricing, the single retry owner, deadline, pre-dispatch budget. */
import { describe, expect, it } from "vitest";
import { normalizeProviderError, ProviderError } from "../../../lib/contract-model/analyzer/provider-error";
import { priceUsage, maxCostOfRequestUsd, PRICING_TABLE_VERSION } from "../../../lib/contract-model/analyzer/pricing";
import { calculateCostUsd } from "../../../lib/contract-model/analyzer/telemetry";
import { runWithTransportRetry, CERTIFIED_TRANSPORT_RETRY_POLICY } from "../../../lib/contract-model/analyzer/transport-retry";
import { createDeadline, DeadlineExceededError, throwIfAborted } from "../../../lib/contract-model/analyzer/deadline";
import { HardDispatchBudget, BudgetRefusedError, UnlimitedDispatchBudget } from "../../../lib/contract-model/analyzer/dispatch-budget";
import fs from "node:fs";

const api = (status: number, type: string | null, message = "x") => Object.assign(new Error(`${status} ${JSON.stringify({ error: { message, type } })}`), { status, error: { error: { message, type } } });
const ctx = { provider: "vercel-ai-gateway", model: "deepseek/deepseek-v4-flash" };

describe("ProviderError normalization keeps structure", () => {
  it("402 / insufficient_funds is CREDIT_EXHAUSTED, non-retryable, billing known zero", () => {
    const e = normalizeProviderError(api(402, "insufficient_funds", "A positive credit balance is required"), ctx);
    expect(e).toBeInstanceOf(ProviderError); expect(e.kind).toBe("CREDIT_EXHAUSTED"); expect(e.httpStatus).toBe(402); expect(e.providerCode).toBe("insufficient_funds"); expect(e.retryable).toBe(false); expect(e.billingKnown).toBe(true); expect(e.usageIfKnown).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0 });
    expect(normalizeProviderError(Object.assign(new Error("no status"), { error: { error: { type: "insufficient_funds" } } }), ctx).kind).toBe("CREDIT_EXHAUSTED");
  });
  it("429 RATE_LIMITED retryable; 500 SERVER_ERROR retryable billing unknown; 400 CLIENT_ERROR not retryable; abort ABORTED; schema SCHEMA; network NETWORK; text never sets a status", () => {
    expect(normalizeProviderError(api(429, "rate_limit_error"), ctx)).toMatchObject({ kind: "RATE_LIMITED", retryable: true });
    expect(normalizeProviderError(api(503, "overloaded_error"), ctx)).toMatchObject({ kind: "SERVER_ERROR", retryable: true, billingKnown: false });
    expect(normalizeProviderError(api(400, "invalid_request_error"), ctx)).toMatchObject({ kind: "CLIENT_ERROR", retryable: false });
    expect(normalizeProviderError(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }), ctx)).toMatchObject({ kind: "ABORTED", retryable: false });
    expect(normalizeProviderError(Object.assign(new Error("did not parse"), { name: "SchemaFailure" }), ctx)).toMatchObject({ kind: "SCHEMA", retryable: false });
    expect(normalizeProviderError(new Error("fetch failed: ECONNRESET"), ctx)).toMatchObject({ kind: "NETWORK", retryable: true });
    expect(normalizeProviderError(new Error("402 insufficient funds in the lender's account"), ctx).kind).not.toBe("CREDIT_EXHAUSTED");
    expect(normalizeProviderError(api(402, "insufficient_funds"), ctx).toRecord()).toMatchObject({ provider: "vercel-ai-gateway", model: "deepseek/deepseek-v4-flash", rawCauseClass: "Error" });
  });
});

describe("pricing is provider/model-correct", () => {
  it("DeepSeek is priced at its own card, an unknown model is UNKNOWN (null), cached tokens are never folded into ordinary input", () => {
    expect(priceUsage({ inputTokens: 1_510_950, outputTokens: 50_090 }, "deepseek/deepseek-v4-flash").costUsd).toBeCloseTo(0.2094469, 7);
    expect(calculateCostUsd(1_510_950, 50_090, "deepseek/deepseek-v4-flash")).toBeCloseTo(0.2094469, 7);
    expect(calculateCostUsd(1_510_950, 50_090, "some/unknown-model")).toBeNull();
    expect(priceUsage({ inputTokens: 1, outputTokens: 1 }, "some/unknown-model")).toMatchObject({ costUsd: null, pricingStatus: "UNKNOWN_MODEL", pricingVersion: PRICING_TABLE_VERSION });
    expect(priceUsage({ inputTokens: 100, outputTokens: 10, cachedInputTokens: 1000 }, "deepseek/deepseek-v4-flash").costUsd).toBeCloseTo(100 * 0.13e-6 + 10 * 0.26e-6 + 1000 * 0.028e-6, 12);
    expect(priceUsage({ inputTokens: null, outputTokens: null }, "deepseek/deepseek-v4-flash").pricingStatus).toBe("NO_USAGE");
    expect(calculateCostUsd(1000, 100)).toBeCloseTo(1000 * 2e-6 + 100 * 10e-6, 12); // Sonnet default still priced as Sonnet
    expect(maxCostOfRequestUsd({ maxInputTokens: 1e6, maxOutputTokens: 1e5 }, "deepseek/deepseek-v4-flash")).toBeCloseTo(0.13 + 0.026, 9);
    expect(maxCostOfRequestUsd({ maxInputTokens: 1, maxOutputTokens: 1 }, "nope")).toBeNull();
  });
  it("the legacy Sonnet-for-everything rate card is no longer what calculateCostUsd uses", () => {
    const src = fs.readFileSync("lib/contract-model/analyzer/telemetry.ts", "utf8");
    expect(src).toMatch(/return priceUsage\(\{ inputTokens, outputTokens \}, model\)\.costUsd;/);
  });
});

describe("single transport retry owner", () => {
  it("retries a 429 exactly once (policy maxAttempts 2) and then succeeds; records attempts", async () => {
    let n = 0;
    const r = await runWithTransportRetry(async () => { n++; if (n === 1) throw api(429, "rate_limit_error"); return "ok"; }, { ...ctx, policy: { ...CERTIFIED_TRANSPORT_RETRY_POLICY, baseDelayMs: 1 } });
    expect(r.value).toBe("ok"); expect(r.transportAttempts).toBe(2); expect(r.retries).toBe(1); expect(r.rateLimitFailures).toBe(1); expect(r.attempts.map((a) => a.outcome)).toEqual(["RETRIED", "OK"]);
  });
  it("a 500 is retried once then fails as ProviderError; a 402, a 400, an abort and a schema failure are never retried", async () => {
    let n = 0;
    await expect(runWithTransportRetry(async () => { n++; throw api(500, "api_error"); }, { ...ctx, policy: { ...CERTIFIED_TRANSPORT_RETRY_POLICY, baseDelayMs: 1 } })).rejects.toMatchObject({ kind: "SERVER_ERROR" });
    expect(n).toBe(2);
    for (const err of [api(402, "insufficient_funds"), api(400, "invalid_request_error"), Object.assign(new Error("aborted"), { name: "AbortError" }), Object.assign(new Error("parse"), { name: "SchemaFailure" })]) {
      let m = 0;
      await expect(runWithTransportRetry(async () => { m++; throw err; }, { ...ctx, policy: { ...CERTIFIED_TRANSPORT_RETRY_POLICY, baseDelayMs: 1 } })).rejects.toBeInstanceOf(ProviderError);
      expect(m).toBe(1);
    }
  });
  it("does not start an attempt after the signal aborted, and the backoff sleep is cut by the signal", async () => {
    const c = new AbortController(); c.abort(new Error("deadline"));
    let n = 0;
    await expect(runWithTransportRetry(async () => { n++; return 1; }, { ...ctx, signal: c.signal })).rejects.toThrow(/deadline/);
    expect(n).toBe(0);
    const c2 = new AbortController(); let k = 0;
    const p = runWithTransportRetry(async () => { k++; throw api(429, "r"); }, { ...ctx, signal: c2.signal, policy: { ...CERTIFIED_TRANSPORT_RETRY_POLICY, baseDelayMs: 10_000 } });
    setTimeout(() => c2.abort(new Error("deadline")), 5);
    await expect(p).rejects.toThrow(/deadline/); expect(k).toBe(1);
  });
  it("every certified client is constructed with maxRetries: 0 and the legacy withRetry is not used by the analyzer", () => {
    const a = fs.readFileSync("lib/contract-model/analyzer/anthropic-analyzer.ts", "utf8");
    const ctors = a.split("\n").filter((l) => /new Anthropic\(/.test(l)); expect(ctors.length).toBeGreaterThanOrEqual(2); for (const l of ctors) expect(l).toMatch(/maxRetries: 0/);
    expect(a).not.toMatch(/\bwithRetry\(/);
    expect(a).toMatch(/runWithTransportRetry\(/);
  });
});

describe("deadline and budget", () => {
  it("a deadline aborts its signal with DeadlineExceededError; throwIfAborted names the stage", async () => {
    const d = createDeadline(5);
    await new Promise((r) => setTimeout(r, 15));
    expect(d.signal.aborted).toBe(true); expect(d.signal.reason).toBeInstanceOf(DeadlineExceededError);
    expect(() => throwIfAborted(d.signal, "semantic_compile")).toThrow(/during semantic_compile/);
    d.dispose();
    const parent = new AbortController(); const child = createDeadline(10_000, parent.signal); parent.abort(new Error("run stop")); expect(child.signal.aborted).toBe(true); child.dispose();
  });
  it("HardDispatchBudget refuses BEFORE dispatch when committed + outstanding + max > ceiling, and by call count; settles exact, retains unknown, releases refusals", () => {
    const b = new HardDispatchBudget({ ceilingUsd: 0.10, maxCalls: 3 });
    const t1 = b.reserve({ stage: "a", model: "deepseek/deepseek-v4-flash", maxInputTokens: 100_000, maxOutputTokens: 100_000 }); // max 0.013 + 0.026 = 0.039
    expect(b.snapshot().outstandingUsd).toBeCloseTo(0.039, 6);
    const t2 = b.reserve({ stage: "b", model: "deepseek/deepseek-v4-flash", maxInputTokens: 100_000, maxOutputTokens: 100_000 });
    expect(() => b.reserve({ stage: "c", model: "deepseek/deepseek-v4-flash", maxInputTokens: 100_000, maxOutputTokens: 100_000 })).toThrow(BudgetRefusedError); // 0.078 + 0.039 > 0.10
    b.settle(t1, { inputTokens: 1000, outputTokens: 100 }, "EXACT");
    expect(b.snapshot().exactUsd).toBeCloseTo(1000 * 0.13e-6 + 100 * 0.26e-6, 12);
    b.settle(t2, null, "UNKNOWN_RETAINED"); expect(b.snapshot().retainedUsd).toBeCloseTo(0.039, 6);
    const t3 = b.reserve({ stage: "c", model: "deepseek/deepseek-v4-flash", maxInputTokens: 1000, maxOutputTokens: 1000 });
    b.settle(t3, { inputTokens: 0, outputTokens: 0 }, "REFUSED_NO_COST"); expect(b.snapshot().outstandingUsd).toBe(0);
    expect(() => b.reserve({ stage: "d", model: "deepseek/deepseek-v4-flash", maxInputTokens: 1, maxOutputTokens: 1 })).toThrow(/MAX_CALLS/);
    expect(() => new HardDispatchBudget({ ceilingUsd: 100, maxCalls: null }).reserve({ stage: "x", model: "unknown/model", maxInputTokens: 1, maxOutputTokens: 1 })).toThrow(/UNPRICEABLE_MODEL/);
    expect(b.snapshot().refusals.length).toBe(2);
    expect(new UnlimitedDispatchBudget().reserve({ stage: "x", model: "m", maxInputTokens: 1, maxOutputTokens: 1 }).reservedUsd).toBe(0);
  });
});
