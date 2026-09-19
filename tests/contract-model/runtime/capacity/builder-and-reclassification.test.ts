/**
 * PHASE 4C §9, §37, §39 - the builder/grower matrix and the reclassification matrix.
 *
 * A builder or grower is an expression subtree, not a formula type. One engine handles every shape,
 * and changing a metric name or a percentage is data, never code.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { applyCapacityStateTransition, buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import type { ReclassificationElection } from "@/lib/contract-model/runtime/capacity/types";
import { ADD, AS_OF, CO, INST, INST2, MAX, METRIC, MIN, MONEY, MUL, PCT, UNSUPPORTED, amountString, fact, onRule, resetIds, resolver, rule, unresolved, usage } from "./helpers";

beforeEach(resetIds);

const build = (rules: ReturnType<typeof rule>[], facts: ReturnType<typeof fact>[] = [], ledger: ReturnType<typeof usage>[] = []) => {
  const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const inputs = facts.length ? resolver(facts) : EMPTY_RESOLVER;
  return { graph, rules, inputs, ledger, state: evaluateCapacityState({ graph, rules, inputs, ledger, asOf: AS_OF }) };
};
const one = (s: ReturnType<typeof build>["state"]) => s.capacities[0]!;

describe("builder and grower matrix (§9, §37)", () => {
  // Every case below is data. The engine never learns which formula it is looking at.
  const CASES: { label: string; expr: () => ReturnType<typeof MONEY>; facts: [string, string][]; expected: string }[] = [
    { label: "A. flat plus half of one metric", expr: () => ADD(MONEY(100_000_000), MUL(PCT(0.5), METRIC("metric-alpha"))), facts: [["metric-alpha", "40000000"]], expected: "120000000" },
    { label: "B. a different flat plus a quarter of a different metric", expr: () => ADD(MONEY(75_000_000), MUL(PCT(0.25), METRIC("metric-beta"))), facts: [["metric-beta", "40000000"]], expected: "85000000" },
    { label: "C. the greater of a flat amount and a tenth of a metric", expr: () => MAX(MONEY(50_000_000), MUL(PCT(0.1), METRIC("metric-alpha"))), facts: [["metric-alpha", "800000000"]], expected: "80000000" },
    { label: "D. an opening amount plus an accumulating metric", expr: () => ADD(MONEY(10_000_000), METRIC("metric-gamma")), facts: [["metric-gamma", "7500000"]], expected: "17500000" },
    { label: "E. the same shape as A with every name and number changed", expr: () => ADD(MONEY(31_000_000), MUL(PCT(0.0625), METRIC("zeta-quantity"))), facts: [["zeta-quantity", "1024000000"]], expected: "95000000" },
    { label: "F. the lesser of a flat amount and a grower", expr: () => MIN(MONEY(50_000_000), MUL(PCT(0.5), METRIC("metric-alpha"))), facts: [["metric-alpha", "40000000"]], expected: "20000000" },
    { label: "G. two metrics in one capacity", expr: () => ADD(MUL(PCT(0.1), METRIC("metric-alpha")), MUL(PCT(0.2), METRIC("metric-beta"))), facts: [["metric-alpha", "100000000"], ["metric-beta", "50000000"]], expected: "20000000" },
  ];

  it.each(CASES.map((c) => [c.label, c] as const))("%s", (_l, c) => {
    const { state } = build([rule("rule-x", c.expr())], c.facts.map(([k, v]) => fact(k, v)));
    const cap = one(state);
    expect(cap.status).toBe("AVAILABLE");
    expect(amountString(cap.grossCapacity)).toBe(c.expected);
  });

  it("components are labelled by shape: a percentage of a fact grows, a bare fact builds, a literal is base", () => {
    const { graph } = build([rule("rule-x", ADD(MONEY(10), MUL(PCT(0.5), METRIC("metric-alpha")), METRIC("metric-gamma")))]);
    const roles = graph.nodes.filter((n) => n.componentRole).map((n) => n.componentRole).sort();
    expect(roles).toEqual(["BUILDER_COMPONENT", "GROWER_COMPONENT"]);
    expect(graph.edges.filter((e) => e.kind === "BUILT_FROM").length).toBe(2);
  });

  it("renaming every metric leaves the component classification identical", () => {
    const a = build([rule("rule-x", ADD(MONEY(10), MUL(PCT(0.5), METRIC("metric-alpha"))))]).graph;
    resetIds();
    const b = build([rule("rule-x", ADD(MONEY(10), MUL(PCT(0.5), METRIC("entirely-different-name"))))]).graph;
    expect(a.nodes.map((n) => n.componentRole)).toEqual(b.nodes.map((n) => n.componentRole));
  });

  it("a missing builder input leaves the capacity NEEDS_INPUT, not zero", () => {
    const { state } = build([rule("rule-x", ADD(MONEY(10_000_000), METRIC("metric-absent")))]);
    expect(one(state).status).toBe("NEEDS_INPUT");
    expect(one(state).grossCapacity.kind).toBe("NOT_DETERMINED");
  });

  it("an ambiguous builder input blocks the capacity rather than picking one fact", () => {
    const rules = [rule("rule-x", ADD(MONEY(10), METRIC("metric-alpha")))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const mk = (id: string, amount: string) => ({ snapshotId: id, version: "1", companyId: CO, asOf: AS_OF, reportingPeriod: "p", status: "APPROVED" as const, supersedesSnapshotId: null, provenance: { source: "s", sourceVersion: null }, review: { reviewedBy: null, reviewedAt: null, approvalRef: null }, inputs: [fact("metric-alpha", amount)] });
    const inputs = snapshotInputResolver({ snapshots: [mk("s1", "5"), mk("s2", "9")], companyId: CO, instrumentKey: INST });
    const state = evaluateCapacityState({ graph, rules, inputs, asOf: AS_OF });
    expect(state.capacities[0]!.status).toBe("AMBIGUOUS");
  });

  it("an unsupported builder operand keeps the whole capacity unsupported", () => {
    const { state } = build([rule("rule-x", ADD(MONEY(10), UNSUPPORTED("a mechanic Phase 3 did not formalize")))]);
    expect(one(state).status).toBe("UNSUPPORTED");
  });
});

describe("reclassification matrix (§39)", () => {
  const withEdge = () => [
    rule("rule-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "rule-dst", description: "amounts may be reclassified into the destination basket" }] }),
    rule("rule-dst", MONEY(100)),
  ];
  const election = (over: Partial<ReclassificationElection> = {}): ReclassificationElection => ({
    electionId: "elect-1", sourceRuleId: "rule-src", destinationRuleId: "rule-dst",
    amount: { amount: "25", currency: "USD" }, effectiveAsOf: "2026-03-31",
    provenance: { source: "board election", sourceVersion: "v1", approvalRef: "approval-9" }, ...over,
  });
  const apply = (rules: ReturnType<typeof rule>[], ledger: ReturnType<typeof usage>[], elections: ReclassificationElection[]) => {
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const before = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    return applyCapacityStateTransition({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF, before, elections });
  };

  it("the graph carries an explicit RECLASSIFIABLE_TO edge read from Phase 3, never inferred", () => {
    const graph = buildCapacityGraph({ rules: withEdge(), companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const e = graph.edges.find((x) => x.kind === "RECLASSIFIABLE_TO")!;
    expect(e.sourceRelationship).toBe("RECLASSIFIABLE_TO");
    expect(e.description).toContain("reclassified");
  });

  it("an explicit move executes, conserves the amount, and produces a new state", () => {
    const r = apply(withEdge(), [usage("u1", "40", onRule("rule-src"))], [election()]);
    expect(r.outcomes[0]!.state).toBe("EXECUTED");
    expect(r.outcomes[0]!.conservation).toEqual({ sourceDelta: "-25", destinationDelta: "25", net: "0", holds: true });
    const src = r.after!.capacities.find((c) => c.ruleId === "rule-src")!;
    const dst = r.after!.capacities.find((c) => c.ruleId === "rule-dst")!;
    expect(amountString(src.usage)).toBe("15");
    expect(amountString(dst.usage)).toBe("25");
    expect(amountString(src.remaining)).toBe("85");
    expect(amountString(dst.remaining)).toBe("75");
  });

  it("the prior state is never mutated", () => {
    const rules = withEdge();
    const ledger = [usage("u1", "40", onRule("rule-src"))];
    const r = apply(rules, ledger, [election()]);
    expect(r.before.stateHash).not.toBe(r.after!.stateHash);
    expect(amountString(r.before.capacities.find((c) => c.ruleId === "rule-src")!.usage)).toBe("40");
    expect(ledger.length).toBe(1);
  });

  it("a partial move leaves the remainder where it was", () => {
    const r = apply(withEdge(), [usage("u1", "40", onRule("rule-src"))], [election({ amount: { amount: "10", currency: "USD" } })]);
    expect(amountString(r.after!.capacities.find((c) => c.ruleId === "rule-src")!.usage)).toBe("30");
  });

  it("two sequential elections both apply and the total is conserved", () => {
    const r = apply(withEdge(), [usage("u1", "40", onRule("rule-src"))], [election(), election({ electionId: "elect-2", amount: { amount: "5", currency: "USD" } })]);
    expect(r.allExecuted).toBe(true);
    expect(amountString(r.after!.capacities.find((c) => c.ruleId === "rule-src")!.usage)).toBe("10");
    expect(amountString(r.after!.capacities.find((c) => c.ruleId === "rule-dst")!.usage)).toBe("30");
  });

  it("without an explicit Phase-3 edge the move is not executable and the edge is never invented", () => {
    const rules = [rule("rule-src", MONEY(100)), rule("rule-dst", MONEY(100))];
    const r = apply(rules, [usage("u1", "40", onRule("rule-src"))], [election()]);
    expect(r.outcomes[0]!.state).toBe("RECLASSIFICATION_NOT_EXECUTABLE");
    expect(r.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("NO_EXPLICIT_RECLASSIFICATION_EDGE");
    expect(r.after).toBeNull();
  });

  it("a wrong destination id is refused rather than matched to something nearby", () => {
    const r = apply(withEdge(), [usage("u1", "40", onRule("rule-src"))], [election({ destinationRuleId: "rule-that-does-not-exist" })]);
    expect(r.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("DESTINATION_CAPACITY_NOT_IN_GRAPH");
  });

  it("an election that moves more than the recorded source usage is refused", () => {
    const r = apply(withEdge(), [usage("u1", "10", onRule("rule-src"))], [election({ amount: { amount: "25", currency: "USD" } })]);
    expect(r.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("SOURCE_USAGE_INSUFFICIENT");
  });

  it("an election with no recorded source usage has nothing to reclassify", () => {
    const r = apply(withEdge(), [], [election()]);
    expect(r.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("SOURCE_USAGE_INSUFFICIENT");
  });

  it("missing semantic fields are named exactly, never supplied", () => {
    const r = apply(withEdge(), [usage("u1", "40", onRule("rule-src"))], [election({ effectiveAsOf: "", amount: { amount: "25", currency: "" } })]);
    const blocked = r.outcomes[0]!.blockedBy.find((b) => b.code === "MISSING_SEMANTIC_FIELDS")!;
    expect(blocked.missingSemanticFields.sort()).toEqual(["amount.currency", "effectiveAsOf"]);
  });

  it("a cycle among the elections is refused before anything executes", () => {
    const rules = [
      rule("rule-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "rule-dst", description: "src to dst" }] }),
      rule("rule-dst", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "rule-src", description: "dst to src" }] }),
    ];
    const r = apply(rules, [usage("u1", "40", onRule("rule-src")), usage("u2", "40", onRule("rule-dst"))], [
      election(),
      election({ electionId: "elect-2", sourceRuleId: "rule-dst", destinationRuleId: "rule-src" }),
    ]);
    expect(r.outcomes.every((o) => o.state === "RECLASSIFICATION_NOT_EXECUTABLE")).toBe(true);
    expect(r.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("RECLASSIFICATION_CYCLE");
  });

  it("a cross-currency election is refused with no conversion", () => {
    const r = apply(withEdge(), [usage("u1", "40", onRule("rule-src"))], [election({ amount: { amount: "25", currency: "EUR" } })]);
    expect(r.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("CURRENCY_MISMATCH_NO_CONVERSION_MODELED");
  });

  it("an election effective after the evaluation as-of is refused", () => {
    const r = apply(withEdge(), [usage("u1", "40", onRule("rule-src"))], [election({ effectiveAsOf: "2026-12-31" })]);
    expect(r.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("EFFECTIVE_AFTER_AS_OF");
  });

  it("a destination in another instrument has no node in this graph and is refused", () => {
    const rules = [
      rule("rule-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "rule-dst", description: "src to dst" }] }),
      rule("rule-dst", MONEY(100), { instrumentKey: INST2 }),
    ];
    const r = apply(rules, [usage("u1", "40", onRule("rule-src"))], [election()]);
    expect(r.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("DESTINATION_CAPACITY_NOT_IN_GRAPH");
  });

  it("a reclassification right whose target is outside the graph is reported as a graph limitation", () => {
    const rules = [rule("rule-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "rule-elsewhere", description: "into a basket compiled separately" }] })];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(graph.limitations.some((l) => l.code === "RECLASSIFICATION_NOT_EXECUTABLE")).toBe(true);
    expect(graph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO")).toEqual([]);
  });

  it("the generated usage carries provenance back to the election", () => {
    const r = apply(withEdge(), [usage("u1", "40", onRule("rule-src"))], [election()]);
    const gen = r.outcomes[0]!.generatedUsage;
    expect(gen.map((g) => g.usageId)).toEqual(["elect-1:source", "elect-1:destination"]);
    expect(gen[0]!.provenance.approvalRef).toBe("approval-9");
    expect(gen[0]!.provenance.approvalState).toBe("RECLASSIFICATION_ELECTION");
  });
});

describe("no solver and no simulation leaked in (§33, §34)", () => {
  it("the state names what it deliberately does not compute", () => {
    const { state } = build([rule("rule-a", MONEY(10))]);
    expect(state.notComputed).toEqual({
      permissionSelection: "NOT_COMPUTED_IN_PHASE_4C",
      maximumTransactionAmount: "NOT_COMPUTED_IN_PHASE_4C",
      allocationAcrossCapacities: "NOT_COMPUTED_IN_PHASE_4C",
      transactionSimulation: "NOT_COMPUTED_IN_PHASE_4C",
      totalCombinedHeadroom: "NOT_COMPUTED_IN_PHASE_4C",
    });
  });

  it("an unresolved historical allocation is never resolved into a choice", () => {
    const { state } = build([rule("rule-a", MONEY(100)), rule("rule-b", MONEY(100))], [], [usage("u1", "40", unresolved(["rule-a", "rule-b"]))]);
    for (const c of state.capacities) {
      expect(c.appliedUsageIds).toEqual([]);
      expect(c.status).toBe("AMBIGUOUS");
    }
  });
});
