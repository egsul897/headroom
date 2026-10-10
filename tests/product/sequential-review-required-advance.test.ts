/**
 * Correctness challenge: REVIEW_REQUIRED must not authoritatively advance sequential world
 * or complete into the ledger. Counterexample + regressions for SATISFIED / NOT_SATISFIED /
 * NEEDS_INPUT / REVIEW_REQUIRED chaining.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildVerifiedSequentialWorldForRules,
  createMemoryLedgerBackend,
  mayAdvanceSequentialWorld,
  runSequentialTransactions,
  type SequentialStepSpec,
} from "@/lib/contract-model/sequential-execution";
import {
  cash,
  consume,
  nodeOf,
  proposal,
  provision,
  resetIds,
  route,
  MONEY,
  FIGURE,
  MUL,
  PCT,
} from "../contract-model/runtime/transaction/helpers";
import type { TransactionSimulationResult } from "@/lib/contract-model/sequential-execution";

beforeEach(resetIds);

function codesHasNeeds(sim: TransactionSimulationResult): boolean {
  return sim.limitations.some(
    (l) =>
      l.code === "MISSING_FINANCIAL_INPUT" ||
      l.code === "CAPACITY_NOT_DETERMINED" ||
      l.code === "OVERLAY_BASE_INPUT_MISSING",
  ) || sim.simulationStatus === "NEEDS_INPUT";
}

function worldPartialAndClean() {
  return buildVerifiedSequentialWorldForRules({
    rules: [
      provision("p-a", MONEY(100), {
        sufficiency: "PARTIAL",
        sufficiencyReasons: ["one clause unrepresented"],
      }),
      provision("p-b", MONEY(100)),
    ],
    companyId: "tx-org",
    instrumentKey: "tx-facility",
  });
}

function draw(stepId: string, txId: string, ruleId: string, amount: string): SequentialStepSpec {
  return {
    stepId,
    businessType: "DEBT_INCURRENCE",
    transaction: proposal(txId, [consume("e1", nodeOf(ruleId), cash(amount))], {
      companyId: "tx-org",
      instrumentKey: "tx-facility",
    }),
    selectedPath: route({ capacityNodeIds: [nodeOf(ruleId)], ruleIds: [ruleId] }),
  };
}

describe("counterexample: REVIEW_REQUIRED must not contaminate subsequent steps", () => {
  it("reproduces REVIEW_REQUIRED + non-null postState under verified REQUIRE", () => {
    const world = worldPartialAndClean();
    const run = runSequentialTransactions({
      world,
      steps: [draw("rr", "tx-rr", "p-a", "40")],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    const s = run.steps[0]!;
    expect(s.simulation?.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(s.simulation?.postState).not.toBeNull();
    expect(s.simulation?.commitPlan.committable).toBe(false);
    expect(mayAdvanceSequentialWorld(s.simulation!)).toBe(false);
  });

  it("does NOT advance world — second step never sees REVIEW_REQUIRED usage", () => {
    const world = worldPartialAndClean();
    const preHash = world.state.stateHash;
    const run = runSequentialTransactions({
      world,
      steps: [draw("rr", "tx-rr", "p-a", "40"), draw("follow", "tx-2", "p-a", "40")],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.steps[0]!.worldAdvanced).toBe(false);
    expect(run.steps[0]!.postState).toBeNull();
    expect(run.steps[0]!.provisionalPostState).not.toBeNull();
    expect(run.steps[0]!.provisionalPostState!.find((c) => c.ruleId === "p-a")!.appliedUsageIds).toContain(
      "tx-rr::e1",
    );
    expect(run.abortedAtStepId).toBe("rr");
    expect(run.steps).toHaveLength(1); // follow-on not executed against contaminated world
    expect(run.finalStateHash).toBe(preHash);
    expect(run.steps[0]!.notes.some((n) => /provisional post-state|not affirmative/i.test(n))).toBe(true);
  });

  it("COMPLETED mode posts zero ledger rows for REVIEW_REQUIRED", () => {
    const backend = createMemoryLedgerBackend();
    const run = runSequentialTransactions({
      world: worldPartialAndClean(),
      steps: [draw("rr", "tx-rr", "p-a", "40")],
      mode: "COMPLETED",
      utilizationAffirmedComplete: true,
      ledgerBackend: backend,
    });
    expect(run.steps[0]!.simulation?.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(run.steps[0]!.worldAdvanced).toBe(false);
    expect(run.steps[0]!.commitPostedUsageIds).toEqual([]);
    expect(backend.eventCount()).toBe(0);
    expect(run.steps[0]!.notes.some((n) => /COMPLETED mode refused ledger post for REVIEW_REQUIRED/.test(n))).toBe(
      true,
    );
  });
});

describe("chaining regressions: SATISFIED / NOT_SATISFIED / NEEDS_INPUT / REVIEW_REQUIRED", () => {
  it("SATISFIED authoritatively advances and chains a second draw", () => {
    const world = buildVerifiedSequentialWorldForRules({
      rules: [provision("p-a", MONEY(100))],
      companyId: "tx-org",
      instrumentKey: "tx-facility",
    });
    const run = runSequentialTransactions({
      world,
      steps: [draw("a", "tx-a", "p-a", "30"), draw("b", "tx-b", "p-a", "30")],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.steps[0]!.simulation?.selectedPathResult).toBe("SATISFIED");
    expect(run.steps[0]!.worldAdvanced).toBe(true);
    expect(run.steps[0]!.provisionalPostState).toBeNull();
    expect(run.steps[1]!.preState.find((c) => c.ruleId === "p-a")!.appliedUsageIds).toContain("tx-a::e1");
    expect(run.steps[1]!.simulation?.selectedPathResult).toBe("SATISFIED");
    expect(run.abortedAtStepId).toBeNull();
  });

  it("NOT_SATISFIED (over-draw) does not advance; no postState; follow-on aborted", () => {
    const world = buildVerifiedSequentialWorldForRules({
      rules: [provision("p-a", MONEY(50))],
      companyId: "tx-org",
      instrumentKey: "tx-facility",
    });
    const preHash = world.state.stateHash;
    const run = runSequentialTransactions({
      world,
      steps: [draw("over", "tx-over", "p-a", "90"), draw("follow", "tx-f", "p-a", "10")],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.steps[0]!.simulation?.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(run.steps[0]!.simulation?.postState).toBeNull();
    expect(run.steps[0]!.worldAdvanced).toBe(false);
    expect(run.steps[0]!.provisionalPostState).toBeNull();
    expect(run.abortedAtStepId).toBe("over");
    expect(run.steps).toHaveLength(1);
    expect(run.finalStateHash).toBe(preHash);
  });

  it("NEEDS_INPUT (capacity depends on missing metric) does not advance", () => {
    // 20% of missing figure → NEEDS_INPUT remaining; a draw cannot be satisfied authoritatively.
    const world = buildVerifiedSequentialWorldForRules({
      rules: [provision("p-need", MUL(PCT(0.2), FIGURE("absent-ebitda")))],
      companyId: "tx-org",
      instrumentKey: "tx-facility",
    });
    const preHash = world.state.stateHash;
    const run = runSequentialTransactions({
      world,
      steps: [draw("needs", "tx-needs", "p-need", "10"), draw("follow", "tx-f", "p-need", "10")],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    const sim = run.steps[0]!.simulation!;
    expect(sim.selectedPathResult === "INDETERMINATE" || sim.simulationStatus === "NEEDS_INPUT" || codesHasNeeds(sim)).toBe(
      true,
    );
    expect(run.steps[0]!.worldAdvanced).toBe(false);
    expect(mayAdvanceSequentialWorld(sim)).toBe(false);
    expect(run.abortedAtStepId).toBe("needs");
    expect(run.steps).toHaveLength(1);
    expect(run.finalStateHash).toBe(preHash);
  });

  it("REVIEW_REQUIRED is never mayAdvanceSequentialWorld / never worldAdvanced", () => {
    const world = worldPartialAndClean();
    const run = runSequentialTransactions({
      world,
      steps: [draw("rr", "tx-rr", "p-a", "10")],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    const sim = run.steps[0]!.simulation!;
    expect(sim.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(mayAdvanceSequentialWorld(sim)).toBe(false);
    expect(run.steps[0]!.worldAdvanced).toBe(false);
    expect(run.steps[0]!.postState).toBeNull();
    expect(run.steps[0]!.provisionalPostState).not.toBeNull();
  });

  it("COMPLETED + SATISFIED still posts; COMPLETED + REVIEW_REQUIRED never posts", () => {
    const okBackend = createMemoryLedgerBackend();
    const ok = runSequentialTransactions({
      world: buildVerifiedSequentialWorldForRules({
        rules: [provision("p-a", MONEY(100))],
        companyId: "tx-org",
        instrumentKey: "tx-facility",
      }),
      steps: [draw("ok", "tx-ok", "p-a", "20")],
      mode: "COMPLETED",
      utilizationAffirmedComplete: true,
      ledgerBackend: okBackend,
    });
    expect(ok.steps[0]!.worldAdvanced).toBe(true);
    expect(ok.steps[0]!.commitPostedUsageIds).toEqual(["tx-ok::e1"]);
    expect(okBackend.eventCount()).toBe(1);

    const rrBackend = createMemoryLedgerBackend();
    const rr = runSequentialTransactions({
      world: worldPartialAndClean(),
      steps: [draw("rr", "tx-rr2", "p-a", "20")],
      mode: "COMPLETED",
      utilizationAffirmedComplete: true,
      ledgerBackend: rrBackend,
    });
    expect(rr.steps[0]!.worldAdvanced).toBe(false);
    expect(rr.steps[0]!.commitPostedUsageIds).toEqual([]);
    expect(rrBackend.eventCount()).toBe(0);
  });
});
