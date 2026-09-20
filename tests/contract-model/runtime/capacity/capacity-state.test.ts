/**
 * PHASE 4C - gross capacity, usage, remaining, bounds, unlimited, review-required and entity scope.
 * One engine over compositional expressions. No formula branching anywhere.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { AS_OF, CO, INST, MAX, METRIC, MONEY, MUL, PCT, RATIO, CMP, UNLIMITED, UNSUPPORTED, amountString, fact, onRule, resetIds, resolver, rule, usage } from "./helpers";

beforeEach(resetIds);

const stateFor = (rules: ReturnType<typeof rule>[], opts: { facts?: ReturnType<typeof fact>[]; ledger?: ReturnType<typeof usage>[]; inputs?: unknown } = {}) => {
  const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const inputs = (opts.inputs as never) ?? (opts.facts ? resolver(opts.facts) : EMPTY_RESOLVER);
  return { graph, state: evaluateCapacityState({ graph, rules, inputs, ledger: opts.ledger ?? [], asOf: AS_OF }) };
};
const one = (s: ReturnType<typeof stateFor>["state"]) => s.capacities[0]!;

describe("gross capacity comes from the Phase-4A evaluator, never a second implementation", () => {
  it("a flat basket is available at its contractual amount with no usage recorded", () => {
    const { state } = stateFor([rule("rule-flat", MONEY(100_000_000))]);
    const c = one(state);
    expect(c.status).toBe("AVAILABLE");
    expect(amountString(c.grossCapacity)).toBe("100000000");
    expect(c.usage.kind).toBe("NOT_DETERMINED");
    expect(amountString(c.remaining)).toBe("100000000");
    expect(amountString(c.effectiveRemaining)).toBe("100000000");
  });

  it("a percentage of a supplied metric evaluates exactly", () => {
    const { state } = stateFor([rule("rule-pct", MUL(PCT(0.125), METRIC("metric-a")))], { facts: [fact("metric-a", "800000000")] });
    expect(amountString(one(state).grossCapacity)).toBe("100000000");
  });

  it("the runtime evaluates the rule's own expression and reports its trace and citation", () => {
    const { state } = stateFor([rule("rule-flat", MONEY(5_000_000))]);
    const e = state.explanations[0]!;
    expect(e.calculationTrace).not.toBeNull();
    expect(e.sourceRules[0]!.sourceCitation).toBe("citation-rule-flat");
    expect(e.sourceRules[0]!.sourceSectionRef).toBe("section-for-rule-flat");
  });
});

describe("missing input never becomes zero, and a bound stays a bound", () => {
  it("a missing metric leaves the capacity NEEDS_INPUT with no amount", () => {
    const { state } = stateFor([rule("rule-pct", MUL(PCT(0.25), METRIC("metric-absent")))]);
    const c = one(state);
    expect(c.status).toBe("NEEDS_INPUT");
    expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(c.remaining.kind).toBe("NOT_DETERMINED");
    expect(c.missingInputKeys).toEqual(["metric-absent"]);
    expect(c.limitations.some((l) => l.code === "MISSING_FINANCIAL_INPUT")).toBe(true);
  });

  it("MAX of a flat amount and a missing grower carries a lower bound without claiming it is available", () => {
    const { state } = stateFor([rule("rule-max", MAX(MONEY(100_000_000), MUL(PCT(0.25), METRIC("metric-absent"))))]);
    const c = one(state);
    expect(c.status).toBe("NEEDS_INPUT");
    expect(c.bounds?.knownLowerBound).toMatchObject({ type: "MONEY", amount: "100000000" });
    expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(amountString(c.grossCapacity)).toBeNull();
  });
});

describe("unlimited is its own state, never a very large number", () => {
  it("an ungated unlimited capacity reports UNLIMITED", () => {
    const { state } = stateFor([rule("rule-unl", UNLIMITED(null))]);
    const c = one(state);
    expect(c.grossCapacity).toEqual({ kind: "UNLIMITED", gate: "NONE" });
    expect(JSON.stringify(c)).not.toContain("Infinity");
    expect(JSON.stringify(c)).not.toContain("1.7976931348623157e+308");
  });

  it("an unlimited capacity gated by a satisfied ratio test stays unlimited and says the gate was met", () => {
    const { state } = stateFor([rule("rule-gated", UNLIMITED(CMP(METRIC("metric-r", "RATIO"), RATIO(5))))], { facts: [fact("metric-r", "3", { type: "RATIO", currency: null, valueType: "RATIO" })] });
    expect(one(state).grossCapacity).toEqual({ kind: "UNLIMITED", gate: "SATISFIED" });
  });

  it("an unlimited capacity whose gate fails is GATE_NOT_SATISFIED, distinct from zero and from missing", () => {
    const { state } = stateFor([rule("rule-gated", UNLIMITED(CMP(METRIC("metric-r", "RATIO"), RATIO(2))))], { facts: [fact("metric-r", "4", { type: "RATIO", currency: null, valueType: "RATIO" })] });
    const c = one(state);
    expect(c.grossCapacity).toEqual({ kind: "GATE_NOT_SATISFIED" });
    expect(c.remaining).toEqual({ kind: "GATE_NOT_SATISFIED" });
  });

  it("unlimited minus recorded usage is still unlimited", () => {
    const { state } = stateFor([rule("rule-unl", UNLIMITED(null))], { ledger: [usage("u1", "40000000", onRule("rule-unl"))] });
    const c = one(state);
    expect(c.remaining).toEqual({ kind: "UNLIMITED", gate: "NONE" });
    expect(amountString(c.usage)).toBe("40000000");
  });
});

describe("usage and remaining", () => {
  it("one recorded usage reduces remaining through the Phase-4A unit algebra", () => {
    const { state } = stateFor([rule("rule-a", MONEY(100_000_000))], { ledger: [usage("u1", "30000000", onRule("rule-a"))] });
    const c = one(state);
    expect(amountString(c.usage)).toBe("30000000");
    expect(amountString(c.remaining)).toBe("70000000");
    expect(c.appliedUsageIds).toEqual(["u1"]);
  });

  it("several usages sum, and the explanation lists exactly the entries applied", () => {
    const { state } = stateFor([rule("rule-a", MONEY(100_000_000))], { ledger: [usage("u1", "30000000", onRule("rule-a")), usage("u2", "25000000", onRule("rule-a"))] });
    expect(amountString(one(state).remaining)).toBe("45000000");
    expect(state.explanations[0]!.ledgerEntries.map((e) => e.usageId)).toEqual(["u1", "u2"]);
  });

  it("over-consumption is explicit, signed and never clamped to zero", () => {
    const { state } = stateFor([rule("rule-a", MONEY(50_000_000))], { ledger: [usage("u1", "70000000", onRule("rule-a"))] });
    const c = one(state);
    expect(c.overConsumption).not.toBeNull();
    expect(c.overConsumption!.deficit).toMatchObject({ type: "MONEY", amount: "-20000000" });
    expect(c.limitations.some((l) => l.code === "OVER_CONSUMPTION")).toBe(true);
    expect(c.status).toBe("REVIEW_REQUIRED");
    expect(amountString(c.provisional!.remaining)).toBe("-20000000");
  });
});

describe("legal state dominates numeric executability", () => {
  it("a PARTIAL Phase-3 rule is REVIEW_REQUIRED even though its arithmetic executes", () => {
    const { state } = stateFor([rule("rule-p", MONEY(80_000_000), { sufficiency: "PARTIAL", sufficiencyReasons: ["one clause is not represented"] })]);
    const c = one(state);
    expect(c.status).toBe("REVIEW_REQUIRED");
    expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(amountString(c.provisional!.grossCapacity)).toBe("80000000");
    expect(c.limitations.some((l) => l.code === "PHASE3_RULE_NOT_SAFE_TO_RELY_ON")).toBe(true);
  });

  it("an AMBIGUOUS Phase-3 rule is never turned into authoritative headroom", () => {
    const { state } = stateFor([rule("rule-x", MONEY(10_000_000), { sufficiency: "AMBIGUOUS", sufficiencyReasons: ["two readings survive"] })]);
    const c = one(state);
    expect(c.status).toBe("AMBIGUOUS");
    expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(c.limitations.some((l) => l.code === "PHASE3_RULE_AMBIGUOUS")).toBe(true);
  });

  it("a Phase-3 UNSUPPORTED operand stays unsupported no matter how complete the financial input is", () => {
    const { state } = stateFor([rule("rule-u", MAX(MONEY(1), UNSUPPORTED("a mechanic Phase 3 did not formalize")))], { facts: [fact("metric-a", "1")] });
    const c = one(state);
    expect(c.status).toBe("UNSUPPORTED");
    expect(c.limitations.some((l) => l.code === "UNSUPPORTED_EXPRESSION")).toBe(true);
  });
});

describe("entity scope is reported as Phase 3 left it, never widened", () => {
  it("a scope the guard marked not safe to rely on becomes a limitation and forces review", () => {
    const r = rule("rule-s", MONEY(1_000_000), { entityScopeAudit: { status: "UNDERINCLUSIVE_VS_SOURCE", safeToRely: false, tagOutcomes: [], preGuardEntityScope: [], preGuardEntityScopeExcluded: [], sourceWitness: null, reasonCodes: ["narrower than source"] } as never });
    const { state } = stateFor([r]);
    const c = one(state);
    expect(c.entityScope!.applicability).toBe("SCOPE_NOT_SAFE_TO_RELY_ON");
    expect(c.limitations.some((l) => l.code === "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON")).toBe(true);
    expect(c.status).toBe("REVIEW_REQUIRED");
  });

  it("an unaudited scope is reported as unaudited and is not asserted to be anything", () => {
    const { state } = stateFor([rule("rule-s", MONEY(1_000_000))]);
    expect(one(state).entityScope!.applicability).toBe("SCOPE_UNAUDITED");
  });
});

describe("independent capacities are never summed", () => {
  it("three rules produce three separate remaining figures and no total", () => {
    const { state } = stateFor([rule("rule-a", MONEY(10)), rule("rule-b", MONEY(20)), rule("rule-c", MONEY(30))]);
    expect(state.capacities.map((c) => amountString(c.remaining))).toEqual(["10", "20", "30"]);
    expect(state.notComputed.totalCombinedHeadroom).toBe("NOT_COMPUTED_IN_PHASE_4C");
    expect(Object.keys(state)).not.toContain("totalHeadroom");
  });
});

describe("the dependency manifest is available before evaluation", () => {
  it("the graph states every fact the capacity state will need, before anything is evaluated", () => {
    const graph = buildCapacityGraph({ rules: [rule("rule-a", MUL(PCT(0.1), METRIC("metric-a"))), rule("rule-b", MUL(PCT(0.2), METRIC("metric-b")))], companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(graph.dependencyManifest.dependencies.map((d) => d.key).sort()).toEqual(["metric-a", "metric-b"]);
    expect(graph.dependencyManifest.counts.required).toBe(2);
  });
});
