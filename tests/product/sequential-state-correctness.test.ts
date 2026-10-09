/**
 * Agent 4 next mission — TE-D2 / TE-D3 / ratio-gated sequential correctness.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  assertRestoreAuthority,
  buildRatioGatedSequentialWorld,
  buildSharedCapacitySequentialWorld,
  chainFinancialViewWithScope,
  formatRestoreReason,
  RATIO_DEMO_INDEPENDENT_EXPECTATION,
  runSequentialTransactions,
  UNAUTHORIZED_RESTORE_CODE,
} from "@/lib/contract-model/sequential-execution";
import {
  buildRatioGatedSequenceSteps,
  buildSequentialDemoWorld,
  runCanonicalSequentialDemo,
} from "@/lib/product/north-star-workflow/sequential-demo-scenario";
import {
  recipeDebtRepayment,
  recipeEquityContribution,
} from "@/lib/product/north-star-workflow/transaction-effect-recipes";
import {
  amountOf,
  cash,
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
  consume,
} from "../contract-model/runtime/transaction/helpers";

beforeEach(resetIds);

describe("TE-D3: financial overlay chaining", () => {
  it("subsequent step base resolver sees prior CHANGE_METRIC (not stale snapshot)", () => {
    const { world: sw } = buildSequentialDemoWorld({ utilizationAffirmedComplete: true });
    const equity = recipeEquityContribution({
      transactionId: "tx-eq",
      companyId: sw.companyId,
      instrumentKey: sw.instrumentKey,
      effectiveAsOf: "2026-06-30",
      provenance: { source: "t", sourceVersion: "v1", approvalRef: null },
      approvalStatus: "HYPOTHETICAL",
    }, {
      metrics: [{
        effectId: "m1",
        metricKey: "builder-available",
        asOf: "2026-06-30",
        adjustment: { kind: "DELTA", value: cash("75") },
      }],
    });
    const run = runSequentialTransactions({
      world: sw,
      steps: [{
        stepId: "equity",
        businessType: "EQUITY_CONTRIBUTION",
        transaction: equity.transaction!,
        selectedPath: equity.selectedPath,
        recipeOk: true,
        recipeNotes: [],
      }],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.abortedAtStepId).toBeNull();
    expect(run.steps[0]!.financialViewChained).toBe(true);
    expect(run.steps[0]!.chainedMetricKeysAfter).toContain("builder-available");

    const applied = run.steps[0]!.simulation!.financialEffects.find((e) => e.metricKey === "builder-available");
    expect(applied?.state).toBe("APPLIED");
    expect(applied?.baseValue?.type === "MONEY" ? applied.baseValue.amount : null).toBe("50");
    expect(applied?.result?.type === "MONEY" ? applied.result.amount : null).toBe("125");

    const chained = chainFinancialViewWithScope(sw.inputs, run.steps[0]!.simulation!, {
      companyId: sw.companyId,
      instrumentKey: sw.instrumentKey,
    });
    const after = chained.resolver.resolveMetric({
      metricName: "builder-available",
      companyId: sw.companyId,
      instrumentKey: sw.instrumentKey,
      period: null,
      asOf: "2026-06-30",
      expectedType: "MONEY",
    });
    expect(after?.value.type).toBe("MONEY");
    if (after?.value.type === "MONEY") {
      expect(after.value.amount.num).toBe(125n);
      expect(after.value.amount.den).toBe(1n);
    }
  });

  it("independent expectation: debt incurrence then dividend refused by TNL gate", () => {
    // Independent arithmetic BEFORE Headroom:
    const exp = RATIO_DEMO_INDEPENDENT_EXPECTATION;
    expect(Number(exp.initialTotalDebt) / Number(exp.initialEbitda)).toBe(3);
    expect(Number(exp.postIncurTotalDebt) / Number(exp.initialEbitda)).toBe(4);
    expect(4).toBeGreaterThan(Number(exp.leverageGate));

    const { world: rw, incur, dividend } = buildRatioGatedSequenceSteps();
    const run = runSequentialTransactions({
      world: rw,
      steps: [incur, dividend],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });

    expect(run.steps[0]!.simulation?.selectedPathResult).toBe("SATISFIED");
    expect(run.steps[0]!.financialViewChained).toBe(true);
    expect(run.steps[0]!.chainedMetricKeysAfter).toContain("total-debt");

    // Second step must NOT use stale 3.0x — gate fails at 4.0x.
    expect(run.steps[1]!.simulation?.selectedPathResult).toBe("NOT_SATISFIED");
    expect(run.steps[1]!.postState).toBeNull();
    expect(codes(run.steps[1]!.simulation!.limitations)).toContain("CONDITION_NOT_SATISFIED");
    expect(run.abortedAtStepId).toBe("2-dividend-blocked");
    // Refusal from missing evidence is distinct — here the gate evaluated and failed.
    expect(run.steps[1]!.simulation!.simulationStatus).toBe("SIMULATED");
  });
});

describe("TE-D2: restore authority at shared boundary", () => {
  it("unauthorized restore is blocked by assertRestoreAuthority", () => {
    const tx = proposal("tx-bad", [restore("e1", "u1", "repaid without authority")]);
    const r = assertRestoreAuthority(tx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.code).toBe(UNAUTHORIZED_RESTORE_CODE);
  });

  it("authorized restore passes the gate", () => {
    const tx = proposal("tx-ok", [restore("e1", "u1", formatRestoreReason("repaid", "§7.2 reduction"))]);
    expect(assertRestoreAuthority(tx).ok).toBe(true);
  });

  it("sequential runner blocks unauthorized restore before simulate", () => {
    const w0 = world({
      rules: [provision("p-a", MONEY(100))],
      ledger: [usage("u1", "40", onProvision("p-a"))],
    });
    const run = runSequentialTransactions({
      world: {
        graph: w0.graph,
        state: w0.state,
        inputs: w0.inputs,
        context: w0.context,
        companyId: "tx-org",
        instrumentKey: "tx-facility",
      },
      steps: [{
        stepId: "bad-restore",
        businessType: "DEBT_REPAYMENT",
        transaction: proposal("tx-bad", [restore("e1", "u1", "no authority marker")]),
        selectedPath: route({}),
      }],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.steps[0]!.unauthorizedRestoreBlocked).toBe(true);
    expect(run.steps[0]!.simulation).toBeNull();
    expect(run.abortedAtStepId).toBe("bad-restore");
  });

  it("authorized repayment, partial supersession, duplicate restore", () => {
    const w = world({
      rules: [provision("p-a", MONEY(100))],
      ledger: [usage("u1", "40", onProvision("p-a"))],
    });
    const auth = formatRestoreReason("repaid", "§facility repayment");
    const full = simulate(w, proposal("tx-full", [restore("e1", "u1", auth)]), route({}));
    expect(full.selectedPathResult).toBe("SATISFIED");
    expect(amountOf(full.postState!.capacities[0]!.remaining)).toBe("100");

    // Partial via supersede (restatement) — engine path, authorized at product via recipeDebtRepayment using restore only.
    const recipe = recipeDebtRepayment({
      transactionId: "tx-auth",
      companyId: "tx-org",
      instrumentKey: "tx-facility",
      effectiveAsOf: "2026-06-30",
      provenance: { source: "t", sourceVersion: "v1", approvalRef: "a1" },
      approvalStatus: "APPROVED",
    }, {
      restores: [{
        effectId: "e1",
        usageId: "u1",
        reason: "partial release",
        contractualAuthorityRef: "§facility repayment",
      }],
    });
    expect(recipe.ok).toBe(true);
    expect(assertRestoreAuthority(recipe.transaction!).ok).toBe(true);

    // Duplicate restore of same usage in one tx — composition conflict / second fails.
    const dup = simulate(
      w,
      proposal("tx-dup", [
        restore("e1", "u1", auth),
        restore("e2", "u1", auth),
      ]),
      route({}),
    );
    expect(dup.postState === null || codes(dup.limitations).length > 0).toBe(true);
  });

  it("restore does not invent capacity on a different basket", () => {
    const w = world({
      rules: [provision("p-a", MONEY(100)), provision("p-b", MONEY(100))],
      ledger: [usage("u1", "40", onProvision("p-a"))],
    });
    const r = simulate(
      w,
      proposal("tx-x", [restore("e1", "u1", formatRestoreReason("repaid", "§p-a only"))]),
      route({}),
    );
    expect(amountOf(r.postState!.capacities.find((c) => c.ruleId === "p-a")!.remaining)).toBe("100");
    expect(amountOf(r.postState!.capacities.find((c) => c.ruleId === "p-b")!.remaining)).toBe("100");
    expect(r.postState!.capacities.find((c) => c.ruleId === "p-b")!.appliedUsageIds).toEqual([]);
  });
});

describe("P1: equity builder + shared capacity", () => {
  it("eligible equity increases builder; ineligible metric does not", () => {
    const worldR = buildRatioGatedSequentialWorld({ utilizationAffirmedComplete: true });
    const before = worldR.state.capacities.find((c) => c.ruleId === "builder-basket")!;
    expect(amountOf(before.grossCapacity)).toBe("50");

    const eligible = recipeEquityContribution({
      transactionId: "tx-elig",
      companyId: worldR.companyId,
      instrumentKey: worldR.instrumentKey,
      effectiveAsOf: "2026-06-30",
      provenance: { source: "t", sourceVersion: "v1", approvalRef: null },
      approvalStatus: "HYPOTHETICAL",
    }, {
      metrics: [{
        effectId: "m-elig",
        metricKey: "eligible-equity-proceeds",
        asOf: "2026-06-30",
        adjustment: { kind: "DELTA", value: cash("80") },
      }],
    });
    const run = runSequentialTransactions({
      world: worldR,
      steps: [{
        stepId: "elig",
        businessType: "EQUITY_CONTRIBUTION",
        transaction: eligible.transaction!,
        selectedPath: eligible.selectedPath,
      }],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(amountOf(run.steps[0]!.simulation!.postState!.capacities.find((c) => c.ruleId === "builder-basket")!.grossCapacity)).toBe("130");

    // Ineligible metric key is not in the builder formula — adjusting it leaves builder at 50.
    const ineligWorld = buildRatioGatedSequentialWorld({ utilizationAffirmedComplete: true });
    const inelig = recipeEquityContribution({
      transactionId: "tx-inelig",
      companyId: ineligWorld.companyId,
      instrumentKey: ineligWorld.instrumentKey,
      effectiveAsOf: "2026-06-30",
      provenance: { source: "t", sourceVersion: "v1", approvalRef: null },
      approvalStatus: "HYPOTHETICAL",
    }, {
      metrics: [{
        effectId: "m-inelig",
        metricKey: "ineligible-equity-proceeds",
        asOf: "2026-06-30",
        adjustment: { kind: "DELTA", value: cash("80") },
      }],
    });
    const run2 = runSequentialTransactions({
      world: ineligWorld,
      steps: [{
        stepId: "inelig",
        businessType: "EQUITY_CONTRIBUTION",
        transaction: inelig.transaction!,
        selectedPath: inelig.selectedPath,
      }],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(amountOf(run2.steps[0]!.simulation!.postState!.capacities.find((c) => c.ruleId === "builder-basket")!.grossCapacity)).toBe("50");
  });

  it("shared pool bounds sequential member draws (anti-stacking)", () => {
    const sw = buildSharedCapacitySequentialWorld();
    const run = runSequentialTransactions({
      world: sw,
      steps: [
        {
          stepId: "draw-a",
          businessType: "DEBT_INCURRENCE",
          transaction: proposal("tx-a", [consume("e1", "capacity:rule:prov-a", cash("70"))], {
            companyId: sw.companyId,
            instrumentKey: sw.instrumentKey,
          }),
          selectedPath: route({
            capacityNodeIds: ["capacity:rule:prov-a"],
            ruleIds: ["prov-a"],
            sharedCapacityIds: ["pool-1"],
          }),
        },
        {
          stepId: "draw-b-over",
          businessType: "DEBT_INCURRENCE",
          transaction: proposal("tx-b", [consume("e1", "capacity:rule:prov-b", cash("70"))], {
            companyId: sw.companyId,
            instrumentKey: sw.instrumentKey,
          }),
          selectedPath: route({
            capacityNodeIds: ["capacity:rule:prov-b"],
            ruleIds: ["prov-b"],
            sharedCapacityIds: ["pool-1"],
          }),
        },
      ],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.steps[0]!.simulation?.selectedPathResult).toBe("SATISFIED");
    // Pool 120 − 70 = 50 left; second 70 does not fit.
    expect(run.steps[1]!.simulation?.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(run.steps[1]!.postState).toBeNull();
  });
});

describe("regression: prior sequential demo still green", () => {
  it("five-step flat sequence completes with independent matches", () => {
    const run = runCanonicalSequentialDemo({ utilizationAffirmedComplete: true });
    expect(run.abortedAtStepId).toBeNull();
    expect(run.steps).toHaveLength(5);
    expect(run.originalLedgerUntouched).toBe(true);
    for (const s of run.steps) {
      expect(s.independentPostMatchesSimulation).toBe(true);
      expect(s.unauthorizedRestoreBlocked).toBe(false);
    }
  });
});
