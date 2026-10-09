/**
 * Permanent regression for Agent 8 DEFECT-A8-01 / A8-02.
 *
 * Independent expectations: a mandatory gate failure must never yield status AVAILABLE,
 * and shared over-consumption must never publish negative remaining as usable headroom.
 * Expectations are not captured from a prior engine dump.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { simulateTransaction } from "@/lib/contract-model/runtime/transaction/simulate";
import {
  AS_OF,
  CMP,
  CO,
  INST,
  METRIC,
  MONEY,
  RATIO,
  UNLIMITED,
  amountString,
  fact,
  onRule,
  resetIds,
  resolver,
  rule,
  sharedCap,
  usage,
} from "./helpers";

beforeEach(resetIds);

const GATE_METRIC = "First Lien Net Leverage Ratio";

function gatedUnlimited(ruleId = "ratio-debt", threshold = 3.75) {
  const gatedBy = CMP(METRIC(GATE_METRIC, "RATIO"), RATIO(threshold));
  return rule(ruleId, UNLIMITED(gatedBy), {
    conditions: [
      {
        conditionId: `${ruleId}-gate`,
        conditionType: "RATIO_TEST",
        expression: gatedBy,
        referencesDefinitionId: null,
        description: `${GATE_METRIC} <= ${threshold}`,
        provenance: null,
      },
    ],
  });
}

function evalWithRatio(ratio: string | null, rules = [gatedUnlimited()], shared: ReturnType<typeof sharedCap>[] = []) {
  const graph = buildCapacityGraph({ rules, sharedCapacities: shared, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const inputs =
    ratio === null
      ? EMPTY_RESOLVER
      : resolver([fact(GATE_METRIC, ratio, { type: "RATIO", currency: null })]);
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: shared, inputs, ledger: [], asOf: AS_OF });
  return { graph, state, inputs, rules, shared };
}

describe("A8-01 gate status regression — never AVAILABLE on unsatisfied gate", () => {
  it("1. gate satisfied → AVAILABLE with UNLIMITED remaining", () => {
    const { state } = evalWithRatio("3.0");
    const c = state.capacities[0]!;
    expect(c.status).toBe("AVAILABLE");
    expect(c.grossCapacity.kind).toBe("UNLIMITED");
    expect(c.effectiveRemaining.kind).toBe("UNLIMITED");
  });

  it("2. gate exactly at threshold (LTE) → AVAILABLE", () => {
    const { state } = evalWithRatio("3.75");
    const c = state.capacities[0]!;
    expect(c.status).toBe("AVAILABLE");
    expect(c.grossCapacity.kind).toBe("UNLIMITED");
  });

  it("3. gate unsatisfied → NOT_SATISFIED, never AVAILABLE", () => {
    const { state } = evalWithRatio("4.1");
    const c = state.capacities[0]!;
    expect(c.status).toBe("NOT_SATISFIED");
    expect(c.status).not.toBe("AVAILABLE");
    expect(c.grossCapacity.kind).toBe("GATE_NOT_SATISFIED");
    expect(c.effectiveRemaining.kind).toBe("GATE_NOT_SATISFIED");
  });

  it("4. gate missing financial inputs → NEEDS_INPUT, never AVAILABLE", () => {
    const { state } = evalWithRatio(null);
    const c = state.capacities[0]!;
    expect(c.status).toBe("NEEDS_INPUT");
    expect(c.status).not.toBe("AVAILABLE");
    expect(c.effectiveRemaining.kind).toBe("NOT_DETERMINED");
  });

  it("5. gate requiring review (Phase-3 PARTIAL sufficiency) → not AVAILABLE", () => {
    const gatedBy = CMP(METRIC(GATE_METRIC, "RATIO"), RATIO(3.75));
    const rules = [
      rule("ratio-debt", UNLIMITED(gatedBy), {
        sufficiency: "PARTIAL",
        sufficiencyReasons: ["qualitative carve-out not formalized"],
        conditions: [
          {
            conditionId: "g",
            conditionType: "RATIO_TEST",
            expression: gatedBy,
            referencesDefinitionId: null,
            description: "gate",
            provenance: null,
          },
        ],
      }),
    ];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      inputs: resolver([fact(GATE_METRIC, "3.0", { type: "RATIO", currency: null })]),
      ledger: [],
      asOf: AS_OF,
    });
    expect(state.capacities[0]!.status).not.toBe("AVAILABLE");
  });

  it("6. multiple applicable gates — any failed gate yields NOT_SATISFIED", () => {
    // Two gated unlimited rules; one fails. The failing rule must not be AVAILABLE.
    // The separate grower remains AVAILABLE (alternative path).
    const rules = [gatedUnlimited("ratio-a", 3.75), gatedUnlimited("ratio-b", 2.0), rule("grower", MONEY(40_000_000))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      inputs: resolver([fact(GATE_METRIC, "3.5", { type: "RATIO", currency: null })]),
      ledger: [],
      asOf: AS_OF,
    });
    const a = state.capacities.find((c) => c.ruleId === "ratio-a")!;
    const b = state.capacities.find((c) => c.ruleId === "ratio-b")!;
    const g = state.capacities.find((c) => c.ruleId === "grower")!;
    expect(a.status).toBe("AVAILABLE");
    expect(b.status).toBe("NOT_SATISFIED");
    expect(b.status).not.toBe("AVAILABLE");
    expect(g.status).toBe("AVAILABLE");
    expect(amountString(g.effectiveRemaining)).toBe("40000000");
  });

  it("7. shared capacity — member status reflects failed gate; shared pool never AVAILABLE if gated fail", () => {
    const gatedBy = CMP(METRIC(GATE_METRIC, "RATIO"), RATIO(3.75));
    const rules = [
      rule("rp", UNLIMITED(gatedBy), {
        covenantFamily: "RESTRICTED_PAYMENTS",
        action: "PAY_DIVIDEND",
        conditions: [
          {
            conditionId: "g",
            conditionType: "RATIO_TEST",
            expression: gatedBy,
            referencesDefinitionId: null,
            description: "gate",
            provenance: null,
          },
        ],
      }),
      rule("inv", MONEY(50_000_000), { covenantFamily: "INVESTMENTS", action: "MAKE_INVESTMENT" }),
    ];
    const shared = [sharedCap("aa", MONEY(50_000_000), ["rp", "inv"])];
    const graph = buildCapacityGraph({ rules, sharedCapacities: shared, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      sharedCapacities: shared,
      inputs: resolver([fact(GATE_METRIC, "4.1", { type: "RATIO", currency: null })]),
      ledger: [],
      asOf: AS_OF,
    });
    expect(state.capacities.find((c) => c.ruleId === "rp")!.status).toBe("NOT_SATISFIED");
    expect(state.capacities.find((c) => c.ruleId === "rp")!.status).not.toBe("AVAILABLE");
    expect(state.capacities.find((c) => c.ruleId === "inv")!.status).toBe("AVAILABLE");
  });

  it("8. alternative permitted pathway remains AVAILABLE when ratio path fails", () => {
    const rules = [gatedUnlimited(), rule("general", MONEY(40_000_000))];
    const { state } = evalWithRatio("4.1", rules);
    expect(state.capacities.find((c) => c.ruleId === "ratio-debt")!.status).toBe("NOT_SATISFIED");
    expect(state.capacities.find((c) => c.ruleId === "general")!.status).toBe("AVAILABLE");
    expect(amountString(state.capacities.find((c) => c.ruleId === "general")!.effectiveRemaining)).toBe("40000000");
  });

  it("9. downstream simulation refuses consume on GATE_NOT_SATISFIED path", () => {
    const { state, graph, inputs, rules } = evalWithRatio("4.1");
    const sim = simulateTransaction({
      transaction: {
        transactionId: "tx-a8-01",
        companyId: CO,
        instrumentKey: INST,
        effectiveAsOf: AS_OF,
        category: "debt",
        label: "ratio debt",
        entities: ["BORROWER"],
        effects: [
          {
            effectId: "e1",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: "capacity:rule:ratio-debt",
            amount: { type: "MONEY", amount: "1000000", currency: "USD" },
          },
        ],
        provenance: { source: "a8-regression", sourceVersion: "1", approvalRef: null },
      } as never,
      currentState: state,
      capacityGraph: graph,
      selectedPath: {
        capacityNodeIds: ["capacity:rule:ratio-debt"],
        ruleIds: ["ratio-debt"],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
      inputs,
      context: { rules, ledger: [], asOf: AS_OF },
    });
    expect(state.capacities[0]!.status).toBe("NOT_SATISFIED");
    expect(sim.selectedPathResult).toBe("NOT_SATISFIED");
    expect(sim.capacityEffects[0]!.outcome).toBe("NOT_SATISFIED");
  });

  it("10. customer-facing serialization — JSON status is never AVAILABLE when gate fails", () => {
    const { state } = evalWithRatio("4.1");
    const serialized = JSON.parse(JSON.stringify(state.capacities[0]));
    expect(serialized.status).toBe("NOT_SATISFIED");
    expect(serialized.status).not.toBe("AVAILABLE");
    expect(serialized.grossCapacity.kind).toBe("GATE_NOT_SATISFIED");
    expect(serialized.effectiveRemaining.kind).toBe("GATE_NOT_SATISFIED");
    // No affirmative money headroom field sneaks through
    expect(serialized.effectiveRemaining.value).toBeUndefined();
  });
});

describe("A8-02 shared over-consumption publication", () => {
  it("publishes NOT_DETERMINED remaining under REVIEW_REQUIRED; deficit stays in overConsumption/provisional", () => {
    const rules = [rule("p", MONEY(20_000_000)), rule("g", MONEY(20_000_000))];
    const shared = [sharedCap("pool", MONEY(30_000_000), ["p", "g"])];
    const graph = buildCapacityGraph({ rules, sharedCapacities: shared, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      sharedCapacities: shared,
      inputs: EMPTY_RESOLVER,
      ledger: [usage("u1", "20000000", onRule("p")), usage("u2", "15000000", onRule("g"))],
      asOf: AS_OF,
    });
    const pool = state.sharedConstraints[0]!;
    expect(pool.status).toBe("REVIEW_REQUIRED");
    expect(pool.remaining.kind).toBe("NOT_DETERMINED");
    expect(amountString(pool.remaining)).toBeNull();
    expect(pool.overConsumption).not.toBeNull();
    expect(pool.overConsumption!.deficit).toMatchObject({ type: "MONEY", amount: "-5000000" });
    expect(pool.provisional).not.toBeNull();
    expect(amountString(pool.provisional!.remaining)).toBe("-5000000");
    // Members are not AVAILABLE
    expect(state.capacities.every((c) => c.status !== "AVAILABLE")).toBe(true);
  });

  it("healthy shared pool still publishes positive remaining as AVAILABLE", () => {
    const rules = [rule("p", MONEY(20_000_000)), rule("g", MONEY(20_000_000))];
    const shared = [sharedCap("pool", MONEY(30_000_000), ["p", "g"])];
    const graph = buildCapacityGraph({ rules, sharedCapacities: shared, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      sharedCapacities: shared,
      inputs: EMPTY_RESOLVER,
      ledger: [usage("u1", "10000000", onRule("p"))],
      asOf: AS_OF,
    });
    const pool = state.sharedConstraints[0]!;
    expect(pool.status).toBe("AVAILABLE");
    expect(amountString(pool.remaining)).toBe("20000000");
    expect(pool.overConsumption).toBeNull();
    expect(pool.provisional).toBeNull();
  });
});

describe("A8-01 original probe parity", () => {
  it("matches scripts/agent8-independent-adversarial/probe-gate-status.ts contract", () => {
    const { state, graph, inputs, rules } = evalWithRatio("4.1", [gatedUnlimited(), rule("general", MONEY(40_000_000))]);
    const ratio = state.capacities.find((c) => c.ruleId === "ratio-debt")!;
    expect(ratio.status).toBe("NOT_SATISFIED");
    expect(ratio.grossCapacity).toEqual({ kind: "GATE_NOT_SATISFIED" });
    expect(ratio.effectiveRemaining).toEqual({ kind: "GATE_NOT_SATISFIED" });
    expect(state.capacities.find((c) => c.ruleId === "general")!.status).toBe("AVAILABLE");

    const sim = simulateTransaction({
      transaction: {
        transactionId: "tx",
        companyId: CO,
        instrumentKey: INST,
        effectiveAsOf: AS_OF,
        category: "debt",
        label: "ratio debt",
        entities: ["BORROWER"],
        effects: [
          {
            effectId: "e1",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: "capacity:rule:ratio-debt",
            amount: { type: "MONEY", amount: "1000000", currency: "USD" },
          },
        ],
        provenance: { source: "t", sourceVersion: "1", approvalRef: null },
      } as never,
      currentState: state,
      capacityGraph: graph,
      selectedPath: {
        capacityNodeIds: ["capacity:rule:ratio-debt"],
        ruleIds: ["ratio-debt"],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
      inputs,
      context: { rules, ledger: [], asOf: AS_OF },
    });
    expect(sim.selectedPathResult).toBe("NOT_SATISFIED");
  });
});
