/**
 * Spending-target labeling and the existing hard-ceiling ledger. No provider call.
 */
import { describe, expect, it } from "vitest";
import { BudgetLedger, accountForRequest, mayAutomaticallyRetry } from "../../scripts/p3-conmed-pilot/timeout-policy";
import type { GatewayModel } from "../../scripts/p3-conmed-pilot/probe-models";
import { mayDispatchUnderSpendingTarget, settleListedSpend } from "../../scripts/p3-development-pipeline/spending-target";
import { haikuListUsd } from "../../scripts/p3-development-pipeline/compile-gibraltar-article-vii";

const cheap = { id: "test/cheap", pricing: { input: "0.000001", output: "0.000005" }, max_tokens: 1000, context_window: 8000, type: "language" } as unknown as GatewayModel;

describe("development spending target", () => {
  it("does not book missing telemetry as a known zero and does not dispatch again", () => {
    const missing = settleListedSpend(null, null, haikuListUsd);
    expect(missing.knownUsd).toBeNull();
    expect(missing.status).toBe("UNKNOWN");
    expect(missing.countedAsKnownZero).toBe(false);
    const next = mayDispatchUnderSpendingTarget({ knownSpentUsd: 0, unknownDispatches: 1, targetUsd: 12 });
    expect(next.allowed).toBe(false);
    expect(next.reason).toBe("UNKNOWN_BILLING_UNSETTLED");
    expect(next.hardCeiling).toBe(false);
    expect(next.authorization).toBe("DEVELOPMENT_TARGET");
    expect(mayAutomaticallyRetry()).toBe(false);
  });

  it("stops at the spending target without calling that target a hard ceiling", () => {
    const exact = settleListedSpend(1_000_000, 0, haikuListUsd);
    expect(exact.status).toBe("EXACT");
    expect(exact.knownUsd).toBe(1);
    const near = mayDispatchUnderSpendingTarget({ knownSpentUsd: 11.99, unknownDispatches: 0, targetUsd: 12 });
    expect(near.allowed).toBe(true);
    const reached = mayDispatchUnderSpendingTarget({ knownSpentUsd: 12, unknownDispatches: 0, targetUsd: 12 });
    expect(reached.allowed).toBe(false);
    expect(reached.reason).toBe("SPENDING_TARGET_REACHED");
    expect(reached.hardCeiling).toBe(false);
  });

  it("sums sequential exact settlements and leaves an unknown settlement out of the known total", () => {
    const first = settleListedSpend(100, 20, haikuListUsd);
    const second = settleListedSpend(50, 10, haikuListUsd);
    const unknown = settleListedSpend(null, 10, haikuListUsd);
    const known = (first.knownUsd ?? 0) + (second.knownUsd ?? 0);
    expect(known).toBeCloseTo(haikuListUsd(150, 30), 6);
    expect(unknown.knownUsd).toBeNull();
  });
});

describe("hard dispatch ceiling", () => {
  it("refuses a reservation that would overrun the remaining ceiling", () => {
    const ledger = new BudgetLedger(5, 5);
    expect(ledger.reserveOrRefuse("near", 4.5).allowed).toBe(true);
    ledger.settle("near", accountForRequest({ model: cheap, elapsedWallClockMs: 10, timedOut: false, providerUsage: { inputTokens: 4_500_000, outputTokens: 0 }, streamedOutputTokensObserved: 0, reservationUsd: 4.5 }));
    const overrun = ledger.reserveOrRefuse("overrun", 1);
    expect(overrun.allowed).toBe(false);
    expect(overrun.reason).toBe("HARD_CEILING");
    expect(ledger.outstandingReservedUsd).toBe(0);
  });

  it("retains an outstanding reservation after a crash before settlement", () => {
    const ledger = new BudgetLedger(5, 5);
    ledger.reserve("inflight", 3);
    expect(ledger.outstandingReservedUsd).toBe(3);
    expect(ledger.committedUsd).toBe(3);
    expect(ledger.reserveOrRefuse("another", 3).allowed).toBe(false);
  });

  it("holds two reservations at once and refuses the one that no longer fits", () => {
    const ledger = new BudgetLedger(5, 5);
    expect(ledger.reserveOrRefuse("a", 2).allowed).toBe(true);
    expect(ledger.reserveOrRefuse("b", 2).allowed).toBe(true);
    expect(ledger.outstandingReservedUsd).toBe(4);
    expect(ledger.reserveOrRefuse("c", 2).allowed).toBe(false);
  });

  it("charges a timeout with no telemetry at the reservation, not at zero", () => {
    const ledger = new BudgetLedger(5, 5);
    ledger.reserve("timeout", 1.25);
    const record = accountForRequest({ model: cheap, elapsedWallClockMs: 480_000, timedOut: true, providerUsage: null, streamedOutputTokensObserved: null, reservationUsd: 1.25 });
    expect(record.costAccountingStatus).toBe("UNKNOWN_TIMEOUT_BILLED");
    expect(record.chargedToBudgetUsd).toBe(1.25);
    ledger.settle("timeout", record);
    expect(ledger.exactSpendUsd).toBe(0);
    expect(ledger.retainedUnknownUsd).toBe(1.25);
    expect(ledger.dispatchDecision(4).allowed).toBe(false);
  });

  it("does not dispatch once the hard ceiling is exhausted", () => {
    const ledger = new BudgetLedger(1, 1);
    expect(ledger.reserveOrRefuse("fill", 0.4).allowed).toBe(true);
    ledger.settle("fill", accountForRequest({ model: cheap, elapsedWallClockMs: 5, timedOut: false, providerUsage: { inputTokens: 1_000_000, outputTokens: 0 }, streamedOutputTokensObserved: 0, reservationUsd: 0.4 }));
    expect(ledger.reserveOrRefuse("next", 0.01).allowed).toBe(false);
  });
});
