/**
 * §10 — the nine required guarantees of the timeout policy.
 *
 * The policy exists because eleven 900s timeouts were billed by the provider and recorded
 * locally as $0.00. Each test below pins one of the properties that stops that recurring.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CANDIDATE_TIMEOUT_MS, LONG_RETRY_CEILING_MS, FORBIDDEN_LONG_CALL_MS, MIN_ALLOWED_TIMEOUT_MS,
  SLOWEST_OBSERVED_SUCCESS_MS, OBSERVED_OUTPUT_TOKENS_PER_SECOND, RECENT_ACTIVITY_WINDOW_MS,
  assertAllowedTimeout, ForbiddenTimeoutError, classifyTimeout, mayAutomaticallyRetry, mayRunLongRetryAutomatically,
  accountForRequest, BudgetLedger, NO_PROGRESS, type ProgressEvidence,
} from "../../scripts/p3-conmed-pilot/timeout-policy";
import { PER_CANDIDATE_TIMEOUT_MS } from "../../scripts/p3-conmed-pilot/compile-run";
import { assertNotPremium, PremiumModelBlockedError, PREMIUM_MODEL_BUDGET_USD, classifyFailureCategory } from "../../scripts/p3-conmed-pilot/premium-lock";
import type { GatewayModel } from "../../scripts/p3-conmed-pilot/probe-models";

const cheap = { id: "alibaba/qwen3.7-flash", pricing: { input: 0.00000003, output: 0.00000013 }, max_tokens: 64000, context_window: 991000, type: "language", tags: ["tool-use"] } as unknown as GatewayModel;

/** 1. Default paid timeout is 480s. */
describe("1. default timeout", () => {
  it("is 480 seconds", () => {
    expect(DEFAULT_CANDIDATE_TIMEOUT_MS).toBe(480_000);
  });

  it("is what the harness actually dispatches with", () => {
    expect(PER_CANDIDATE_TIMEOUT_MS).toBe(480_000);
  });

  it("still covers the entire observed success distribution", () => {
    expect(SLOWEST_OBSERVED_SUCCESS_MS).toBeLessThan(DEFAULT_CANDIDATE_TIMEOUT_MS);
  });

  it("cannot be lowered below the floor, which §1 forbids in this mission", () => {
    expect(() => assertAllowedTimeout(300_000)).toThrow(ForbiddenTimeoutError);
    expect(MIN_ALLOWED_TIMEOUT_MS).toBe(480_000);
  });
});

/** 2. A 480s timeout does not automatically retry. */
describe("2. no automatic retry", () => {
  it("never authorizes a retry, whatever the evidence", () => {
    expect(mayAutomaticallyRetry()).toBe(false);
    expect(mayRunLongRetryAutomatically()).toBe(false);
  });

  it("marks a progressing candidate ELIGIBLE, which is a report item and not a dispatch", () => {
    const progressing: ProgressEvidence = { outputTokensObserved: 5000, toolCallsCompleted: 2, structuredOutputItems: 3, lastActivityMsBeforeTermination: 1_000 };
    expect(classifyTimeout(progressing)).toBe("TIMEOUT_PROGRESSING_RETRY_ELIGIBLE");
    expect(mayRunLongRetryAutomatically()).toBe(false);
  });

  it("treats absent evidence as NONCONVERGENT rather than as possibly-progressing", () => {
    expect(classifyTimeout(NO_PROGRESS)).toBe("TIMEOUT_NONCONVERGENT");
  });

  it("does not call a long-idle candidate progressing merely because it emitted tokens earlier", () => {
    const stalled: ProgressEvidence = { outputTokensObserved: 5000, toolCallsCompleted: 0, structuredOutputItems: 0, lastActivityMsBeforeTermination: RECENT_ACTIVITY_WINDOW_MS + 1 };
    expect(classifyTimeout(stalled)).toBe("TIMEOUT_NONCONVERGENT");
  });
});

/** 3. A 480s timeout cannot reach a premium model. */
describe("3. timeouts cannot reach premium", () => {
  it("blocks a premium id outright", () => {
    expect(() => assertNotPremium("anthropic/claude-sonnet-5")).toThrow(PremiumModelBlockedError);
    expect(() => assertNotPremium("anthropic/claude-opus-5")).toThrow(PremiumModelBlockedError);
  });

  it("keeps the premium budget at zero", () => {
    expect(PREMIUM_MODEL_BUDGET_USD).toBe(0);
  });

  it("has no retry path that could carry a timeout to a premium dispatch", () => {
    const progressing: ProgressEvidence = { outputTokensObserved: 9000, toolCallsCompleted: 4, structuredOutputItems: 8, lastActivityMsBeforeTermination: 500 };
    expect(classifyTimeout(progressing)).toBe("TIMEOUT_PROGRESSING_RETRY_ELIGIBLE");
    expect(mayAutomaticallyRetry()).toBe(false);
    expect(() => assertNotPremium("anthropic/claude-sonnet-5")).toThrow();
  });
});

/** 4. The 1800s path is disabled without explicit authorization. */
describe("4. 1800s path disabled", () => {
  it("refuses 1800s outright", () => {
    expect(() => assertAllowedTimeout(FORBIDDEN_LONG_CALL_MS)).toThrow(/hard limit/);
    expect(() => assertAllowedTimeout(1_800_000, { longRetryAuthorized: true })).toThrow(/hard limit/);
  });

  it("refuses anything above 480s unless a retry batch was authorized", () => {
    expect(() => assertAllowedTimeout(900_000)).toThrow(/explicitly authorized retry batch/);
  });

  it("permits exactly the 900s long-retry ceiling when authorized, and nothing beyond it", () => {
    expect(() => assertAllowedTimeout(LONG_RETRY_CEILING_MS, { longRetryAuthorized: true })).not.toThrow();
    expect(() => assertAllowedTimeout(LONG_RETRY_CEILING_MS + 1, { longRetryAuthorized: true })).toThrow(/long-retry ceiling/);
  });
});

/** 5. A timeout with missing billing metadata is never $0.00. */
describe("5. unknown timeout cost is not zero", () => {
  const reservation = 0.05;

  it("records UNKNOWN_TIMEOUT_BILLED, not a zero cost", () => {
    const r = accountForRequest({ model: cheap, elapsedWallClockMs: 480_000, timedOut: true, providerUsage: null, streamedOutputTokensObserved: null, reservationUsd: reservation });
    expect(r.costAccountingStatus).toBe("UNKNOWN_TIMEOUT_BILLED");
    expect(r.chargedToBudgetUsd).toBeGreaterThan(0);
    expect(r.finalProviderBillingUnavailable).toBe(true);
  });

  it("charges at least the reservation even when a little streamed output was seen", () => {
    const r = accountForRequest({ model: cheap, elapsedWallClockMs: 480_000, timedOut: true, providerUsage: null, streamedOutputTokensObserved: 10, reservationUsd: reservation });
    expect(r.chargedToBudgetUsd).toBe(reservation);
    expect(r.locallyCalculatedCostUsd).toBeLessThan(reservation);
  });

  it("reports every field §6 requires", () => {
    const r = accountForRequest({ model: cheap, elapsedWallClockMs: 480_000, timedOut: true, providerUsage: null, streamedOutputTokensObserved: 42, reservationUsd: reservation });
    expect(Object.keys(r).sort()).toEqual(
      ["chargedToBudgetUsd", "costAccountingStatus", "elapsedWallClockMs", "finalProviderBillingUnavailable", "locallyCalculatedCostUsd", "model", "providerUsageObserved", "streamedOutputTokensObserved"].sort(),
    );
  });

  it("uses EXACT when the provider did return usage", () => {
    const r = accountForRequest({ model: cheap, elapsedWallClockMs: 60_000, timedOut: false, providerUsage: { inputTokens: 29408, outputTokens: 2296 }, streamedOutputTokensObserved: 2296, reservationUsd: reservation });
    expect(r.costAccountingStatus).toBe("EXACT");
    expect(r.chargedToBudgetUsd).toBeCloseTo(29408 * 0.00000003 + 2296 * 0.00000013, 10);
  });
});

/** 6. Unknown timeout cost consumes budget. */
describe("6. unknown timeout consumes budget", () => {
  it("retains the reservation instead of returning it to available budget", () => {
    const ledger = new BudgetLedger(5, 4.5);
    ledger.reserve("c1", 0.05);
    expect(ledger.committedUsd).toBe(0.05);
    ledger.settle("c1", accountForRequest({ model: cheap, elapsedWallClockMs: 480_000, timedOut: true, providerUsage: null, streamedOutputTokensObserved: null, reservationUsd: 0.05 }));
    expect(ledger.retainedUnknownUsd).toBe(0.05);
    expect(ledger.committedUsd).toBe(0.05);
    expect(ledger.exactSpendUsd).toBe(0);
    expect(ledger.remainingUsd).toBe(4.95);
  });

  it("releases the unused part of a reservation once exact billing is known", () => {
    const ledger = new BudgetLedger(5, 4.5);
    ledger.reserve("c1", 0.05);
    ledger.settle("c1", accountForRequest({ model: cheap, elapsedWallClockMs: 60_000, timedOut: false, providerUsage: { inputTokens: 29408, outputTokens: 2296 }, streamedOutputTokensObserved: 2296, reservationUsd: 0.05 }));
    expect(ledger.outstandingReservedUsd).toBe(0);
    expect(ledger.committedUsd).toBeLessThan(0.01);
  });

  it("stops the run once retained unknown timeouts alone approach the ceiling", () => {
    const ledger = new BudgetLedger(5, 4.5);
    for (let i = 0; i < 90; i++) {
      ledger.reserve(`c${i}`, 0.05);
      ledger.settle(`c${i}`, accountForRequest({ model: cheap, elapsedWallClockMs: 480_000, timedOut: true, providerUsage: null, streamedOutputTokensObserved: null, reservationUsd: 0.05 }));
    }
    expect(ledger.retainedUnknownUsd).toBeCloseTo(4.5, 6);
    expect(ledger.mustStop()).toBe(true);
  });

  it("reserves conservatively enough to cover a full-ceiling candidate", () => {
    const reservation = BudgetLedger.reservationFor(cheap, DEFAULT_CANDIDATE_TIMEOUT_MS, 29408, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
    const worstCaseActual = 29408 * 0.00000003 + 480 * 120.2 * 0.00000013;
    expect(reservation).toBeGreaterThanOrEqual(worstCaseActual);
  });
});

/** 7. A provider refusal with zero tokens still records zero cost. */
describe("7. refusal really is free", () => {
  it("records PROVIDER_REFUSED_NO_COST at zero and consumes no budget", () => {
    const ledger = new BudgetLedger(5, 4.5);
    ledger.reserve("c1", 0.05);
    const r = accountForRequest({ model: cheap, elapsedWallClockMs: 1_000, timedOut: false, providerUsage: null, streamedOutputTokensObserved: 0, reservationUsd: 0.05, providerRefused: true });
    expect(r.costAccountingStatus).toBe("PROVIDER_REFUSED_NO_COST");
    expect(r.chargedToBudgetUsd).toBe(0);
    ledger.settle("c1", r);
    expect(ledger.committedUsd).toBe(0);
  });

  it("does NOT treat a timeout as a refusal even though both lack usage", () => {
    const timeout = accountForRequest({ model: cheap, elapsedWallClockMs: 480_000, timedOut: true, providerUsage: null, streamedOutputTokensObserved: null, reservationUsd: 0.05, providerRefused: false });
    expect(timeout.costAccountingStatus).toBe("UNKNOWN_TIMEOUT_BILLED");
    expect(timeout.chargedToBudgetUsd).toBeGreaterThan(0);
  });
});

/** 8. Semantic outcomes cannot trigger a retry. */
describe("8. semantic outcomes never trigger retry", () => {
  it("classifies an unfavourable but well-formed answer as a semantic outcome", () => {
    for (const reason of ["REVIEW_REQUIRED", "NO_CREDIT", "PARTIAL", "UNSUPPORTED_BY_SOURCE", "HONEST_UNRESOLVED"]) {
      expect(classifyFailureCategory("REVIEW_REQUIRED", [reason], 30_000)).toBe("SEMANTIC_OUTCOME");
    }
  });

  it("offers no retry path at all, so a disliked answer cannot buy another attempt", () => {
    expect(mayAutomaticallyRetry()).toBe(false);
    expect(mayRunLongRetryAutomatically()).toBe(false);
  });

  it("keeps a semantic outcome out of the timeout classifier entirely", () => {
    // classifyTimeout only ever sees execution evidence; there is no answer-quality input.
    const evidence: ProgressEvidence = { outputTokensObserved: 100, toolCallsCompleted: 1, structuredOutputItems: 1, lastActivityMsBeforeTermination: 10 };
    expect(["TIMEOUT_PROGRESSING_RETRY_ELIGIBLE", "TIMEOUT_NONCONVERGENT"]).toContain(classifyTimeout(evidence));
  });
});

/** 9. Concurrency limits remain enforced. */
describe("9. concurrency", () => {
  it("the bakeoff runner still dispatches strictly sequentially", () => {
    const src = require("node:fs").readFileSync("scripts/p3-conmed-pilot/run-bakeoff.ts", "utf8") as string;
    expect(src).toContain("concurrency 1");
    // No pool, no Promise.all fan-out in the candidate loop.
    expect(src).not.toMatch(/runPool\s*\(/);
    expect(src).not.toMatch(/Promise\.all\s*\(\s*probes/);
  });

  it("never reinstates concurrency 6", () => {
    const src = require("node:fs").readFileSync("scripts/p3-conmed-pilot/run-bakeoff.ts", "utf8") as string;
    expect(src).not.toMatch(/concurrency\s*=\s*6/);
  });
});
