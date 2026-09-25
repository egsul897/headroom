/**
 * Benchmark-recovery pre-flight: P-6 (gateway credit exhaustion is a terminal run condition) and
 * P-7 (reservations cover the execution shape the runner permits; hard pre-dispatch invariant).
 * Zero paid calls: the loop runs against stubbed compile/verify executions built from the exact
 * failure shapes preserved in the population evidence.
 */
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { accountForRequest, BudgetLedger, DEFAULT_CANDIDATE_TIMEOUT_MS, MEASURED_OUTPUT_TOKENS_PER_SECOND_LOWER_BOUND, OBSERVED_OUTPUT_TOKENS_PER_SECOND } from "../../scripts/p3-conmed-pilot/timeout-policy";
import { OBSERVED_INPUT_TOKENS_PER_CANDIDATE } from "../../scripts/p3-conmed-pilot/premium-lock";
import { detectCreditExhaustionInError, detectCreditExhaustionInResult, GATEWAY_CREDIT_EXHAUSTED, GatewayResponseSentinel, parseProviderIssueText } from "../../scripts/p3-conmed-pilot/gateway-credit";
import { candidateMaxReservationUsd, compileReservationUsd, compileShape, MAX_RESERVED_CONVERSATIONS, MAX_TURN_OVERHEAD_MIRROR, PASS_A_BATCH_CHARS_MIRROR, probeReservationUsd, shapeExceeded, TURNS_PER_CONVERSATION, verifyReservationUsd, verifyShape } from "../../scripts/p3-conmed-pilot/reservation-policy";
import { runCandidateLoop, type CompileExecution, type LoopDeps, type VerifyExecution } from "../../scripts/p3-conmed-pilot/population-loop";
import { p6RedBaseline, p7RedBaseline } from "../../scripts/p3-conmed-pilot/recovery-preflight-baseline";
import type { GatewayModel } from "../../scripts/p3-conmed-pilot/probe-models";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";

const DOCS = "docs/phase-3-conmed-population-verified";
const model = { id: "deepseek/deepseek-v4-flash", pricing: { input: "0.00000013", output: "0.00000026" }, max_tokens: 384000 } as unknown as GatewayModel;

// the exact 402 shape as the runner receives it from the frozen compiler (run-continuation-2, 7.9(a)(i))
const seg2 = JSON.parse(fs.readFileSync(`${DOCS}/run-continuation-2/01-statuses.json`, "utf8")) as { ref: string; discoveryId: string }[];
const refused = JSON.parse(fs.readFileSync(`${DOCS}/run-continuation-2/evidence/${seg2.find((s) => s.ref === "7.9(a)(i)")!.discoveryId}.json`, "utf8"));
const ISSUE_402: string = refused.compilation.unresolvedIssues[0];
// the SDK's APIError as the stage analyzer rethrows it
const apiError402 = Object.assign(new Error(ISSUE_402), { status: 402, error: JSON.parse(ISSUE_402.slice(4)) });
const apiError500 = Object.assign(new Error("500 {\"error\":{\"message\":\"internal error while allocating funds for the request\",\"type\":\"api_error\"}}"), { status: 500, error: { error: { message: "internal error while allocating funds for the request", type: "api_error" } } });
const apiError429 = Object.assign(new Error("429 {\"error\":{\"message\":\"rate limited\",\"type\":\"rate_limit_error\"}}"), { status: 429, error: { error: { message: "rate limited", type: "rate_limit_error" } } });

const cand = (ref: string, chars = 300) => ({ discoveryId: `discovery-candidate:${ref}`, ref, operativeChars: chars });
const compiled = (input: number, output: number, attempts = 1): CompileExecution => ({ result: { status: "COMPLETED", failureReasons: [], unresolvedIssues: [], telemetry: { attemptCount: attempts } }, rec: { status: "COMPLETED", failureReasons: [], inputTokens: input, outputTokens: output, wallClockMs: 20_000, rules: 1, definitions: 0, toolCalls: 2 }, timedOut: false, threw: false, passAUsage: null, signal: null });
const refused402 = (): CompileExecution => ({ result: { status: "FAILED", failureReasons: ["PROVIDER_FAILURE"], unresolvedIssues: [ISSUE_402], errorDetail: null, telemetry: null }, rec: { status: "FAILED", failureReasons: ["PROVIDER_FAILURE"], inputTokens: 0, outputTokens: 0, wallClockMs: 730, rules: 0, definitions: 0, toolCalls: 0 }, timedOut: false, threw: false, passAUsage: null, signal: null });
const provider500 = (): CompileExecution => ({ result: { status: "FAILED", failureReasons: ["PROVIDER_FAILURE"], unresolvedIssues: [apiError500.message], errorDetail: null, telemetry: null }, rec: { status: "FAILED", failureReasons: ["PROVIDER_FAILURE"], inputTokens: 0, outputTokens: 0, wallClockMs: 900, rules: 0, definitions: 0, toolCalls: 0 }, timedOut: false, threw: false, passAUsage: null, signal: null });
const schemaFailure = (): CompileExecution => ({ result: { status: "FAILED", failureReasons: ["MODEL_SCHEMA_FAILURE"], unresolvedIssues: ["submit_compilation input failed schema validation: funds field unexpected"], telemetry: { attemptCount: 1 } }, rec: { status: "FAILED", failureReasons: ["MODEL_SCHEMA_FAILURE"], inputTokens: 27021, outputTokens: 7148, wallClockMs: 30_309, rules: 0, definitions: 0, toolCalls: 7 }, timedOut: false, threw: false, passAUsage: null, signal: null });
const timeout = (): CompileExecution => ({ result: { status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"], telemetry: null }, rec: { status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"], inputTokens: null, outputTokens: null, wallClockMs: 480_007, rules: 0, definitions: 0, toolCalls: 0 }, timedOut: true, threw: true, thrown: Object.assign(new Error("candidate exceeded the 480000ms pilot wall-clock ceiling"), { name: "CandidateTimeoutError" }), passAUsage: null, signal: null });
const verified = (): VerifyExecution => ({ verification: { status: "VERIFICATION_INCOMPLETE", semanticReviewInvoked: true, findings: [] }, outcome: "COMPLETED", timedOut: false, usage: { inputTokens: 5000, outputTokens: 3000 }, sideCalls: [{ stage: "semantic_verification", inputTokens: 5000, outputTokens: 3000, costUsd: 0.00143 }], wallClockMs: 9000, signal: null });

function harness(executions: Record<string, () => CompileExecution>, opts: { ceiling?: number; stopAt?: number; seed?: number; verify?: (ref: string) => VerifyExecution } = {}) {
  const ledger = new BudgetLedger(opts.ceiling ?? 15, opts.stopAt ?? 14.9);
  if (opts.seed) { ledger.reserve("prior", opts.seed); ledger.settle("prior", accountForRequest({ model, elapsedWallClockMs: 0, timedOut: false, providerUsage: { inputTokens: Math.round(opts.seed / 0.00000013), outputTokens: 0 }, streamedOutputTokensObserved: null, reservationUsd: 0 })); }
  const dispatched: string[] = []; const verifiedRefs: string[] = []; const flushes: number[] = []; const persisted: string[] = [];
  const deps: LoopDeps = {
    candidates: Object.keys(executions).map((ref) => cand(ref)), ledger, model,
    compileShape: (c) => compileShape(model, c.operativeChars), verifyShape: () => verifyShape(model),
    compileReservationUsd: (c) => compileReservationUsd(model, c.operativeChars), verifyReservationUsd: () => verifyReservationUsd(model),
    compile: async (c) => { dispatched.push(c.ref); return executions[c.ref]!(); },
    verify: async (c) => { verifiedRefs.push(c.ref); return (opts.verify ?? verified)(c.ref); },
    persist: (c) => { persisted.push(c.ref); return { package: null, evidenceFile: `/evidence/${c.ref}.json` }; },
    flush: (st) => { flushes.push(st.statuses.length); },
  };
  return { ledger, deps, dispatched, verifiedRefs, flushes, persisted };
}

describe("red baselines (recorded against the pre-fix harness in 01-red-baselines.json)", () => {
  const recorded = JSON.parse(fs.readFileSync("docs/phase-3-conmed-benchmark-recovery-preflight/01-red-baselines.json", "utf8"));
  it("P-6 was red: 402 classified PROVIDER_FAILURE, nine more candidates dispatched unserved, no credit stop in the runner", () => {
    expect(recorded.p6.red).toBe(true);
    expect(recorded.p6.currentClassification.classifyOutcome).toBe("PROVIDER_FAILURE");
    expect(recorded.p6.loopContinued.candidatesDispatchedAfterFirst402).toBe(9);
    expect(recorded.p6.observedSignal.httpStatusPrefix).toBe("402");
    expect(recorded.p6.observedSignal.body.error.type).toBe("insufficient_funds");
    // the same facts are still derivable from the frozen evidence; only the runner has changed
    const now = p6RedBaseline();
    expect(now.currentClassification.classifyOutcome).toBe("PROVIDER_FAILURE");
    expect(now.loopContinued.candidatesDispatchedAfterFirst402).toBe(9);
    expect(now.runnerHasNoCreditStop).toBe(false);
    // and against the immutable pre-fix harness it is still red
    expect(p6RedBaseline(recorded.harnessSha).red).toBe(true);
  });
  it("P-7 was red: $0.019423 reserved against a $0.2094 charge (10.78x); the old guard admits that request with $0.10 left", () => {
    expect(recorded.p7.red).toBe(true);
    expect(recorded.p7.historicalReservationUsd).toBeCloseTo(0.01942304, 8);
    expect(recorded.p7.candidate78.exactUsd).toBeCloseTo(0.2094469, 7);
    expect(recorded.p7.underReservationFactor).toBeCloseTo(10.78, 2);
    expect(recorded.p7.syntheticGuard.oldGuardWouldDispatch).toBe(true);
    expect(recorded.p7.syntheticGuard.ceilingExceededByUsd).toBeCloseTo(0.109447, 6);
    expect(p7RedBaseline(model).red).toBe(true);
  });
});

describe("402 detection is structural and narrow", () => {
  it("recognises the SDK error by status and by the gateway body type, and the compiler's text only when it parses to that exact structure", () => {
    expect(detectCreditExhaustionInError(apiError402)).toMatchObject({ detected: true, source: "SDK_ERROR_STATUS", httpStatus: 402, errorType: "insufficient_funds" });
    expect(detectCreditExhaustionInError(Object.assign(new Error("x"), { error: { error: { type: "insufficient_funds", message: "m" } } }))).toMatchObject({ source: "SDK_ERROR_BODY" });
    expect(detectCreditExhaustionInResult(refused402().result)).toMatchObject({ detected: true, source: "RESULT_ISSUE_TEXT", httpStatus: 402, errorType: "insufficient_funds" });
    expect(parseProviderIssueText(ISSUE_402)!.status).toBe(402);
  });
  it("negative controls: 500, 429, a schema failure, a timeout, prose containing 'fund', and a 402-looking text without PROVIDER_FAILURE never match", () => {
    expect(detectCreditExhaustionInError(apiError500)).toBeNull();
    expect(detectCreditExhaustionInError(apiError429)).toBeNull();
    expect(detectCreditExhaustionInError(new Error("insufficient funds"))).toBeNull();
    expect(detectCreditExhaustionInError(timeout().thrown)).toBeNull();
    expect(detectCreditExhaustionInResult(provider500().result)).toBeNull();
    expect(detectCreditExhaustionInResult(schemaFailure().result)).toBeNull();
    expect(detectCreditExhaustionInResult({ failureReasons: ["PROVIDER_FAILURE"], unresolvedIssues: ["the lender's fund was insufficient (402 is not a status here)"] })).toBeNull();
    expect(detectCreditExhaustionInResult({ failureReasons: ["PROVIDER_FAILURE"], unresolvedIssues: ["402 not json"] })).toBeNull();
    expect(detectCreditExhaustionInResult({ failureReasons: ["MODEL_SCHEMA_FAILURE"], unresolvedIssues: [ISSUE_402] })).toBeNull();
    expect(parseProviderIssueText("shard executor threw: 402 {\"error\":{}}")).toBeNull();
  });
  it("the response sentinel records a 402 body before the SDK raises, and ignores a 200 and a 500", async () => {
    const responses = [new Response(JSON.stringify({ ok: true }), { status: 200 }), new Response(JSON.stringify({ error: { message: "internal", type: "api_error" } }), { status: 500 }), new Response(JSON.stringify(JSON.parse(ISSUE_402.slice(4))), { status: 402 })];
    const sentinel = new GatewayResponseSentinel(async () => responses.shift()!);
    for (let i = 0; i < 3; i++) await sentinel.fetch("https://gateway.invalid/v1/messages");
    expect(sentinel.responses.map((r) => r.status)).toEqual([500, 402]);
    expect(sentinel.creditExhaustion()).toMatchObject({ source: "RESPONSE_SENTINEL", httpStatus: 402, errorType: "insufficient_funds" });
    sentinel.reset(); expect(sentinel.creditExhaustion()).toBeNull();
  });
});

describe("P-6: gateway credit exhaustion is a terminal run condition", () => {
  it("P6-A/P6-B: 402 on candidate N records N honestly, flushes, stops the run; N+1 is never dispatched", async () => {
    const h = harness({ a: () => compiled(12000, 3000), b: refused402, c: () => compiled(12000, 3000) });
    const state = await runCandidateLoop(h.deps);
    expect(h.dispatched).toEqual(["a", "b"]);
    expect(state.statuses.map((s) => s.ref)).toEqual(["a", "b"]);
    const n = state.statuses[1]!;
    expect(n.compile.outcome).toBe("PROVIDER_FAILURE");
    expect(n.creditExhaustion).toMatchObject({ detected: true, httpStatus: 402, errorType: "insufficient_funds" });
    expect(n.compile.costStatus).toBe("PROVIDER_REFUSED_NO_COST"); expect(n.compile.costUsd).toBe(0);
    expect(h.verifiedRefs).toEqual(["a"]); expect(h.persisted).toEqual(["a", "b"]);
    expect(state.stop).toMatchObject({ reason: GATEWAY_CREDIT_EXHAUSTED, candidateAtStop: "b", remainingCandidates: ["c"] });
    expect(state.stop!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state.stop!.committedUsd).toBe(h.ledger.committedUsd);
    expect(h.ledger.outstandingReservedUsd).toBe(0);
    expect(h.flushes[h.flushes.length - 1]).toBe(2);
  });
  it("P6-A (verify stage): a structured 402 raised by the verifier's stage caller also stops the run after recording the candidate", async () => {
    const h = harness({ a: () => compiled(12000, 3000), b: () => compiled(12000, 3000) }, { verify: () => ({ verification: null, outcome: "EXECUTION_FAILURE", timedOut: false, thrown: apiError402, usage: null, sideCalls: [], wallClockMs: 500, signal: null }) });
    const state = await runCandidateLoop(h.deps);
    expect(h.dispatched).toEqual(["a"]);
    expect(state.statuses[0]!.verify.outcome).toBe("EXECUTION_FAILURE");
    expect(state.statuses[0]!.verify.costStatus).toBe("PROVIDER_REFUSED_NO_COST");
    expect(state.stop).toMatchObject({ reason: GATEWAY_CREDIT_EXHAUSTED, candidateAtStop: "a", remainingCandidates: ["b"] });
  });
  it("P6-C: an ordinary provider 500 is one candidate's outcome; the loop continues", async () => {
    const h = harness({ a: provider500, b: () => compiled(12000, 3000) });
    const state = await runCandidateLoop(h.deps);
    expect(h.dispatched).toEqual(["a", "b"]);
    expect(state.statuses[0]!.compile.outcome).toBe("PROVIDER_FAILURE");
    expect(state.statuses[0]!.creditExhaustion).toBeUndefined();
    expect(state.stop!.reason).toBe("COMPLETED");
  });
  it("P6-D: a schema failure does not stop the run", async () => {
    const h = harness({ a: schemaFailure, b: () => compiled(12000, 3000) });
    const state = await runCandidateLoop(h.deps);
    expect(h.dispatched).toEqual(["a", "b"]);
    expect(state.statuses[0]!.compile.outcome).toBe("SCHEMA_FAILURE");
    expect(state.stop!.reason).toBe("COMPLETED");
  });
  it("P6-E: a timeout retains its reservation and does not trigger credit exhaustion", async () => {
    const h = harness({ a: timeout, b: () => compiled(12000, 3000) });
    const state = await runCandidateLoop(h.deps);
    expect(h.dispatched).toEqual(["a", "b"]);
    expect(state.statuses[0]!.compile.outcome).toBe("TIMEOUT");
    expect(state.statuses[0]!.compile.costStatus).toBe("UNKNOWN_TIMEOUT_BILLED");
    expect(state.statuses[0]!.creditExhaustion).toBeUndefined();
    expect(state.stop!.reason).toBe("COMPLETED");
  });
  it("no retry, no alternate provider, no fallback model anywhere in the stop path", () => {
    const src = fs.readFileSync("scripts/p3-conmed-pilot/population-loop.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/retry|fallback|alternate|sonnet|opus/i);
  });
});

describe("P-7: reservations cover the execution shape the runner permits", () => {
  const src = (f: string) => fs.readFileSync(f, "utf8");
  it("the mirrored compiler limits match the frozen source they mirror", () => {
    expect(src("lib/contract-model/compiler/semantic/caller.ts")).toMatch(new RegExp(`const MAX_TURN_OVERHEAD = ${MAX_TURN_OVERHEAD_MIRROR};`));
    expect(src("lib/contract-model/compiler/semantic/caller.ts")).toMatch(/const maxTurns = budget\.maxToolCalls \+ MAX_TURN_OVERHEAD;/);
    expect(src("lib/contract-model/compiler/semantic-accountability/inventory.ts")).toMatch(new RegExp(`input\\.batchChars \\?\\? ${PASS_A_BATCH_CHARS_MIRROR};`));
    expect(TURNS_PER_CONVERSATION).toBe(DEFAULT_TOOL_BUDGET.maxToolCalls + 4);
    expect(src("scripts/p3-conmed-pilot/gateway-health.ts")).toMatch(/max_tokens: 32/); expect(src("scripts/p3-conmed-pilot/gateway-health.ts")).toMatch(/max_tokens: 1024/); expect(src("scripts/p3-conmed-pilot/gateway-health.ts")).toMatch(/\.repeat\(220\)/);
  });
  it("P7-A: the historical 7.8 execution shape (5 conversations, 1,510,950 in / 50,090 out) is fully reserved, and the two 667k monolithic compiles too", () => {
    const shape = compileShape(model, 4667);
    expect(shape.conversations).toBe(MAX_RESERVED_CONVERSATIONS); expect(shape.turnsPerConversation).toBe(12);
    expect(shapeExceeded({ attemptCount: 5, inputTokens: 1_510_950, outputTokens: 50_090 }, shape)).toEqual([]);
    expect(compileReservationUsd(model, 4667)).toBeGreaterThan(0.2094469);
    expect(shapeExceeded({ attemptCount: 1, inputTokens: 667_190, outputTokens: 2_996 }, compileShape(model, 208))).toEqual([]);
    // and the cap is real: a sixth conversation, or more input than the shape, is reported
    expect(shapeExceeded({ attemptCount: 6, inputTokens: 100, outputTokens: 1 }, shape)).toHaveLength(1);
    expect(shapeExceeded({ attemptCount: 1, inputTokens: shape.inputTokens + 1, outputTokens: 1 }, shape)).toHaveLength(1);
  });
  it("derived figures for the locked model at the population's largest span (output rate recalibrated to 300 tok/s after 7.16 >= 133.2 and 7.2(c) >= 243.6)", () => {
    expect(OBSERVED_OUTPUT_TOKENS_PER_SECOND).toBe(300);
    expect(MEASURED_OUTPUT_TOKENS_PER_SECOND_LOWER_BOUND).toBeCloseTo(243.569, 3);
    expect(OBSERVED_OUTPUT_TOKENS_PER_SECOND).toBeGreaterThan(MEASURED_OUTPUT_TOKENS_PER_SECOND_LOWER_BOUND * 1.2);
    // at 300 tok/s the wall-clock allowance (144,000) exceeds max_tokens, so the cap is the structural 128,000
    expect(compileShape(model, 4667).outputTokens).toBe(128_000);
    expect(shapeExceeded({ attemptCount: 1, inputTokens: 9888, outputTokens: 116_913 }, compileShape(model, 529))).toEqual([]);
    const r = compileReservationUsd(model, 4667);
    expect(r).toBeCloseTo(1.8994092, 7);
    expect(verifyReservationUsd(model)).toBeCloseTo(0.05928, 7);
    expect(candidateMaxReservationUsd(model, 4667)).toBeCloseTo(1.9586892, 7);
    // the figures the pre-flight mission derived at 125 tok/s, superseded by the recalibration
    expect(r).toBeGreaterThan(1.3513292);
    expect(probeReservationUsd(model).both).toBeCloseTo(0.00130234, 8);
    expect(probeReservationUsd(model).tierA).toBeGreaterThan(0.00001508); expect(probeReservationUsd(model).tierB).toBeGreaterThan(0.00079495);
    // superseded: the old typical-cost reservation
    expect(BudgetLedger.reservationFor(model, DEFAULT_CANDIDATE_TIMEOUT_MS, OBSERVED_INPUT_TOKENS_PER_CANDIDATE, 125)).toBeCloseTo(0.01942304, 8);
  });
  it("P7-B: an exact cheap completion releases the unused reserve", async () => {
    const h = harness({ a: () => compiled(12000, 3000) });
    await runCandidateLoop(h.deps);
    const exact = 12000 * 0.00000013 + 3000 * 0.00000026 + (5000 * 0.00000013 + 3000 * 0.00000026);
    expect(h.ledger.outstandingReservedUsd).toBe(0);
    expect(h.ledger.committedUsd).toBeCloseTo(exact, 6);
    expect(h.ledger.retainedUnknownUsd).toBe(0);
  });
  it("P7-C: a timeout retains the FULL shape reservation", async () => {
    const h = harness({ a: timeout });
    const state = await runCandidateLoop(h.deps);
    expect(state.statuses[0]!.compile.costUsd).toBeCloseTo(compileReservationUsd(model, 300), 8);
    expect(h.ledger.retainedUnknownUsd).toBeCloseTo(compileReservationUsd(model, 300), 6);
    expect(h.ledger.outstandingReservedUsd).toBe(0);
  });
  it("P7-C': a timeout with Pass A usage observed before the cut-off still retains the FULL reservation (the observed usage is a floor, not the bill)", async () => {
    const withPassA = (): CompileExecution => ({ ...timeout(), passAUsage: { inputTokens: 4914, outputTokens: 42396 } });
    const h = harness({ a: withPassA, b: () => compiled(12000, 3000) });
    const state = await runCandidateLoop(h.deps);
    expect(state.statuses[0]!.compile.costStatus).toBe("UNKNOWN_TIMEOUT_BILLED");
    expect(state.statuses[0]!.compile.costUsd).toBeCloseTo(compileReservationUsd(model, 300), 8);
    expect(h.ledger.retainedUnknownUsd).toBeCloseTo(compileReservationUsd(model, 300), 6);
    expect(state.statuses[0]!.compile.passAUsage).toEqual({ inputTokens: 4914, outputTokens: 42396 });
    // verify-stage timeout with partial side-call usage: same rule
    const h2 = harness({ a: () => compiled(12000, 3000) }, { verify: () => ({ verification: null, outcome: "TIMEOUT", timedOut: true, usage: { inputTokens: 5000, outputTokens: 100 }, sideCalls: [], wallClockMs: 480_000, signal: null }) });
    const s2 = await runCandidateLoop(h2.deps);
    expect(s2.statuses[0]!.verify.costStatus).toBe("UNKNOWN_TIMEOUT_BILLED");
    expect(s2.statuses[0]!.verify.costUsd).toBeCloseTo(verifyReservationUsd(model), 8);
  });
  it("P7-D: a zero-token 402 settles at $0 exact (nothing served), releases its reservation, and stops", async () => {
    const h = harness({ a: refused402, b: () => compiled(1, 1) });
    const state = await runCandidateLoop(h.deps);
    expect(state.statuses[0]!.compile.costStatus).toBe("PROVIDER_REFUSED_NO_COST");
    expect(h.ledger.committedUsd).toBe(0); expect(h.ledger.outstandingReservedUsd).toBe(0); expect(h.ledger.retainedUnknownUsd).toBe(0);
    expect(state.stop!.reason).toBe(GATEWAY_CREDIT_EXHAUSTED);
    expect(h.dispatched).toEqual(["a"]);
  });
  it("P7-D': a 402 after partial service (7.9(a): 29,406 tokens billed) settles EXACT and still stops", async () => {
    const partial = (): CompileExecution => ({ result: { status: "FAILED", failureReasons: ["MODEL_SCHEMA_FAILURE", "SHARD_INCOMPLETE", "PROVIDER_FAILURE"], unresolvedIssues: ["[shard-stitch] owned material item x unresolved", ISSUE_402], telemetry: { attemptCount: 2 } }, rec: { status: "FAILED", failureReasons: ["MODEL_SCHEMA_FAILURE", "SHARD_INCOMPLETE", "PROVIDER_FAILURE"], inputTokens: 29406, outputTokens: 6469, wallClockMs: 397_118, rules: 0, definitions: 0, toolCalls: 0 }, timedOut: false, threw: false, passAUsage: null, signal: null });
    const h = harness({ a: partial, b: () => compiled(1, 1) });
    const state = await runCandidateLoop(h.deps);
    expect(state.statuses[0]!.compile.costStatus).toBe("EXACT");
    expect(state.statuses[0]!.compile.costUsd).toBeCloseTo(29406 * 0.00000013 + 6469 * 0.00000026, 8);
    expect(state.stop!.reason).toBe(GATEWAY_CREDIT_EXHAUSTED);
    expect(h.dispatched).toEqual(["a"]);
  });
  it("P7-E: with $0.10 of ceiling left and a larger next reservation, nothing is dispatched (BUDGET_STOP before the request)", async () => {
    const h = harness({ a: () => compiled(1, 1) }, { ceiling: 1.0, stopAt: 1.0, seed: 0.90 });
    const state = await runCandidateLoop(h.deps);
    expect(h.dispatched).toEqual([]);
    expect(state.statuses).toEqual([]);
    expect(state.stop).toMatchObject({ reason: "BUDGET_STOP", candidateAtStop: null, remainingCandidates: ["a"] });
    expect(state.stop!.detail).toMatch(/HARD_CEILING/);
    expect(h.ledger.outstandingReservedUsd).toBe(0);
  });
  it("P7-F: reservation arithmetic can never exceed the hard ceiling - every path through the ledger", () => {
    const exact = new BudgetLedger(1.0, 1.0);
    expect(exact.dispatchDecision(1.0)).toMatchObject({ allowed: false, reason: "STOP_AT" });
    expect(exact.dispatchDecision(0.999999)).toMatchObject({ allowed: true, reason: "OK" });
    expect(exact.dispatchDecision(1.0000001)).toMatchObject({ allowed: false, reason: "HARD_CEILING" });
    const ledger = new BudgetLedger(1.0, 0.95);
    expect(ledger.reserveOrRefuse("x", 0.96)).toMatchObject({ allowed: false, reason: "STOP_AT" });
    expect(ledger.outstandingReservedUsd).toBe(0);
    ledger.reserveOrRefuse("a", 0.5);
    expect(ledger.dispatchDecision(0.6)).toMatchObject({ allowed: false, reason: "HARD_CEILING", wouldCommitUsd: 1.1 });
    for (let i = 0; i < 1000; i++) { const next = Math.random() * 2; const d = ledger.dispatchDecision(next); if (d.allowed) expect(ledger.committedUsd + next).toBeLessThanOrEqual(ledger.ceilingUsd + 1e-9); else expect(ledger.committedUsd + next > ledger.ceilingUsd || ledger.mustStop(next)).toBe(true); }
  });
  it("P7-G: a compile that exceeds the reserved shape settles exactly and then stops the run before another dispatch", async () => {
    const h = harness({ a: () => compiled(2_000_000, 1000, 6), b: () => compiled(1, 1) });
    const state = await runCandidateLoop(h.deps);
    expect(h.dispatched).toEqual(["a"]);
    expect(state.statuses[0]!.compile.shapeExceeded).toHaveLength(1);
    expect(state.stop).toMatchObject({ reason: "RESERVATION_SHAPE_EXCEEDED", candidateAtStop: "a", remainingCandidates: ["b"] });
  });
});

describe("population immutability", () => {
  it("the population manifest, dispositions, statuses, costs and evidence are byte-identical to the preserved record", () => {
    const inventory = JSON.parse(fs.readFileSync("docs/phase-3-conmed-benchmark-recovery-preflight/00-starting-state.json", "utf8"));
    expect(inventory.populationManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    expect(createHash("sha256").update(fs.readFileSync(`${DOCS}/04-population-manifest.json`)).digest("hex")).toBe(inventory.populationManifestSha256);
    for (const f of inventory.populationFiles as { file: string; sha256: string }[]) expect(createHash("sha256").update(fs.readFileSync(`${DOCS}/${f.file}`)).digest("hex")).toBe(f.sha256);
  });
});
