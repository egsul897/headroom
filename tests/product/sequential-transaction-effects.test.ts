/**
 * Sequential transaction effects: multi-step capacity state, ordering,
 * idempotency, replay, reversal, supersession, atomic failure, hypothetical
 * isolation, double-post refusal, and UNKNOWN utilization honesty.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildCanonicalSequentialSteps,
  buildSequentialDemoWorld,
  runCanonicalSequentialDemo,
} from "@/lib/product/north-star-workflow/sequential-demo-scenario";
import {
  assertCompletedNotDoublePosted,
  materializeBackendUsages,
  replaySequentialRun,
  runSequentialTransactions,
  type SequentialWorld,
} from "@/lib/product/north-star-workflow/sequential-transaction-runner";
import {
  classifyUtilizationHistory,
  honestRemaining,
  UTILIZATION_UNKNOWN_REASON,
} from "@/lib/product/north-star-workflow/utilization-history";
import {
  recipeDebtIncurrence,
  recipeDebtRepayment,
} from "@/lib/product/north-star-workflow/transaction-effect-recipes";
import { InMemoryContractLedgerStore } from "@/lib/contract-model/runtime/capacity/store";
import {
  advance,
  amountOf,
  cash,
  consume,
  nodeOf,
  onProvision,
  proposal,
  provision,
  resetIds,
  restore,
  route,
  simulate,
  usage,
  world,
  MONEY,
  codes,
} from "../contract-model/runtime/transaction/helpers";

beforeEach(resetIds);

function remainingOf(views: { capacityNodeId: string; remaining: string | null }[], ruleSuffix: string) {
  const hit = views.find((v) => v.capacityNodeId.includes(ruleSuffix));
  return hit?.remaining ?? null;
}

describe("canonical sequential demo: incur → dividend → equity → invest → repay", () => {
  it("every subsequent step sees prior capacity/ledger updates; independent checks match", () => {
    const run = runCanonicalSequentialDemo({ utilizationAffirmedComplete: true });
    expect(run.abortedAtStepId).toBeNull();
    expect(run.steps).toHaveLength(5);
    expect(run.originalLedgerUntouched).toBe(true);
    expect(run.mode).toBe("HYPOTHETICAL");

    for (const step of run.steps) {
      expect(step.recipeOk).toBe(true);
      expect(step.simulation?.simulationStatus).toBe("SIMULATED");
      expect(step.postState).not.toBeNull();
      expect(step.independentPostMatchesSimulation).toBe(true);
      expect(step.ledgerMutatedInHypothetical).toBe(false);
    }

    // After incur: debt usage 100, remaining 400
    expect(remainingOf(run.steps[0]!.postState!, "debt-basket")).toBe("400");
    // After dividend: rp remaining 160
    expect(remainingOf(run.steps[1]!.postState!, "rp-basket")).toBe("160");
    // Equity does not consume baskets; invest then leaves 100
    expect(remainingOf(run.steps[3]!.postState!, "invest-basket")).toBe("100");
    // After repay: debt capacity fully restored
    expect(remainingOf(run.steps[4]!.postState!, "debt-basket")).toBe("500");

    // Chain: each step's pre hash equals prior post hash
    for (let i = 1; i < run.steps.length; i++) {
      expect(run.steps[i]!.preStateHash).toBe(run.steps[i - 1]!.postStateHash);
    }
  });

  it("exposes per-step identity, financial chaining, and provenance", () => {
    const { world: w } = buildSequentialDemoWorld({ utilizationAffirmedComplete: true });
    const steps = buildCanonicalSequentialSteps();
    const run = runSequentialTransactions({
      world: w,
      steps,
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.steps[0]!.simulation!.provenance.transactionId).toBe("tx-1-incur");
    expect(run.steps[0]!.financialViewChained).toBe(true);
    expect(run.steps[0]!.chainedMetricKeysAfter).toContain("total-debt");
    expect(run.steps[4]!.simulation!.ledgerEffects.superseded[0]!.reason).toMatch(/authority:/);
  });
});

describe("ordering, idempotency, replay, reversal, supersession, atomic failure", () => {
  it("ordering: release-then-draw ≠ draw-then-release", () => {
    const w0 = world({ rules: [provision("p-a", MONEY(100))], ledger: [usage("u1", "40", onProvision("p-a"))] });
    const r = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    const a1 = simulate(w0, proposal("tx-rel", [restore("e1", "u1")]), route({}));
    const a2 = simulate(advance(w0, a1), proposal("tx-draw", [consume("e1", nodeOf("p-a"), cash("100"))]), r);
    expect(a2.selectedPathResult).toBe("SATISFIED");
    const b1 = simulate(w0, proposal("tx-draw", [consume("e1", nodeOf("p-a"), cash("100"))]), r);
    expect(b1.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(b1.postState).toBeNull();
  });

  it("replay: identical simulation ids for identical inputs", () => {
    const { world: w, utilizationAffirmedComplete } = buildSequentialDemoWorld({
      utilizationAffirmedComplete: true,
    });
    const steps = buildCanonicalSequentialSteps();
    const { identicalSimulationIds, first, second } = replaySequentialRun({
      world: w,
      steps,
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete,
    });
    expect(identicalSimulationIds).toBe(true);
    expect(first.finalStateHash).toBe(second.finalStateHash);
  });

  it("reversal supersedes history and never deletes the original record object", () => {
    const historical = usage("u1", "40", onProvision("p-a"));
    const ledger = [historical];
    const w = world({ rules: [provision("p-a", MONEY(100))], ledger });
    const recipe = recipeDebtRepayment({
      transactionId: "tx-rev",
      companyId: "tx-org",
      instrumentKey: "tx-facility",
      effectiveAsOf: "2026-06-30",
      provenance: { source: "t", sourceVersion: "v1", approvalRef: null },
      approvalStatus: "APPROVED",
    }, {
      restores: [{
        effectId: "e1",
        usageId: "u1",
        reason: "cancelled",
        contractualAuthorityRef: "§cancel",
      }],
    });
    const r = simulate(w, recipe.transaction!, route({}));
    expect(r.ledgerEffects.superseded[0]!.original.status).toBe("RECORDED");
    expect(historical.status).toBe("RECORDED");
    expect(ledger[0]).toBe(historical);
  });

  it("atomic failure: over-draw publishes no post-state and leaves pre-state", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))], ledger: [usage("u1", "30", onProvision("p-a"))] });
    const preHash = w.state.stateHash;
    const recipe = recipeDebtIncurrence({
      transactionId: "tx-over",
      companyId: "tx-org",
      instrumentKey: "tx-facility",
      effectiveAsOf: "2026-06-30",
      provenance: { source: "t", sourceVersion: "v1", approvalRef: null },
      approvalStatus: "HYPOTHETICAL",
    }, {
      draws: [{ effectId: "e1", capacityNodeId: nodeOf("p-a"), amount: cash("90"), ruleId: "p-a" }],
    });
    const r = simulate(w, recipe.transaction!, route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(r.postState).toBeNull();
    expect(w.state.stateHash).toBe(preHash);
    expect(codes(r.limitations)).toContain("INSUFFICIENT_CAPACITY");
  });

  it("hypothetical simulation never mutates the actual ledger array", () => {
    const { world: w } = buildSequentialDemoWorld({ utilizationAffirmedComplete: true });
    const ledgerRef = w.ledger;
    const before = JSON.stringify(ledgerRef);
    runSequentialTransactions({
      world: w,
      steps: buildCanonicalSequentialSteps(),
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(JSON.stringify(ledgerRef)).toBe(before);
    expect(ledgerRef).toHaveLength(0);
  });

  it("completed transaction cannot be posted twice (DUPLICATE_USAGE_ID)", () => {
    const backend = new InMemoryContractLedgerStore();
    const record = usage("tx-once::e1", "20", onProvision("p-a"));
    const result = assertCompletedNotDoublePosted({ backend, usage: record });
    expect(result.firstOk).toBe(true);
    expect(result.secondOk).toBe(false);
    expect(result.secondCodes).toContain("DUPLICATE_USAGE_ID");
    expect(materializeBackendUsages(backend)).toHaveLength(1);
  });

  it("COMPLETED mode posts proposed rows once across a short sequence", () => {
    const { world: w } = buildSequentialDemoWorld({ utilizationAffirmedComplete: true });
    const backend = new InMemoryContractLedgerStore();
    const incurOnly = buildCanonicalSequentialSteps().slice(0, 1);
    const run = runSequentialTransactions({
      world: w as SequentialWorld,
      steps: incurOnly,
      mode: "COMPLETED",
      utilizationAffirmedComplete: true,
      ledgerBackend: backend,
    });
    expect(run.steps[0]!.commitPostedUsageIds).toEqual(["tx-1-incur::e-incur"]);
    const again = runSequentialTransactions({
      world: buildSequentialDemoWorld({ utilizationAffirmedComplete: true }).world,
      steps: incurOnly,
      mode: "COMPLETED",
      utilizationAffirmedComplete: true,
      ledgerBackend: backend,
    });
    expect(again.steps[0]!.commitRefused[0]!.codes).toContain("DUPLICATE_USAGE_ID");
  });
});

describe("utilization history honesty", () => {
  it("empty ledger without affirmation is UNKNOWN, not zero remaining", () => {
    expect(classifyUtilizationHistory({ ledgerCount: 0, utilizationAffirmedComplete: false })).toBe("UNKNOWN");
    const w = world({ rules: [provision("p-a", MONEY(100))] });
    const entry = w.state.capacities[0]!;
    // Phase 4C treats empty as determined zero remaining (= gross).
    expect(amountOf(entry.remaining)).toBe("100");
    const honest = honestRemaining(entry, "UNKNOWN");
    expect(honest.kind).toBe("NOT_DETERMINED");
    expect(honest.kind === "NOT_DETERMINED" && honest.reason).toBe(UTILIZATION_UNKNOWN_REASON);
  });

  it("confirmed-empty utilization may treat remaining as full capacity", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))] });
    const honest = honestRemaining(w.state.capacities[0]!, "CONFIRMED_EMPTY");
    expect(amountOf(honest)).toBe("100");
  });
});
