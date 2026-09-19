/**
 * PHASE 4C §36, §38 - the shared-capacity matrix and the ledger matrix.
 * A shared cap is an explicit constraint node. The limit is never copied onto a member.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildCapacityGraph, evaluateCapacityState, buildLedgerIndex } from "@/lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { AS_OF, CO, CO2, INST, INST2, METRIC, MONEY, MUL, PCT, amountString, fact, onRule, onShared, resetIds, resolver, rule, sharedCap, unresolved, usage } from "./helpers";

beforeEach(resetIds);

const run = (rules: ReturnType<typeof rule>[], caps: ReturnType<typeof sharedCap>[], ledger: ReturnType<typeof usage>[] = [], facts: ReturnType<typeof fact>[] = []) => {
  const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs: facts.length ? resolver(facts) : EMPTY_RESOLVER, ledger, asOf: AS_OF });
  return { graph, state };
};
const cap = (state: ReturnType<typeof run>["state"], ruleId: string) => state.capacities.find((c) => c.ruleId === ruleId)!;
const pool = (state: ReturnType<typeof run>["state"], id: string) => state.sharedConstraints.find((s) => s.sharedCapacityId === id)!;

const A = () => rule("rule-a", MONEY(100));
const B = () => rule("rule-b", MONEY(100));

describe("shared-capacity matrix (§36)", () => {
  it("A. members each keep their own capacity and the pool tracks the sum of member usage", () => {
    const { state } = run([A(), B()], [sharedCap("pool-s", MONEY(150), ["rule-a", "rule-b"])], [usage("u1", "40", onRule("rule-a")), usage("u2", "30", onRule("rule-b"))]);
    const s = pool(state, "pool-s");
    expect(amountString(s.grossCapacity)).toBe("150");
    expect(amountString(s.usage)).toBe("70");
    expect(amountString(s.remaining)).toBe("80");
    // The pool limit was never copied onto a member: each keeps its own 100 gross.
    expect(amountString(cap(state, "rule-a").grossCapacity)).toBe("100");
    expect(amountString(cap(state, "rule-b").grossCapacity)).toBe("100");
    expect(s.memberUsage.map((m) => [m.ruleId, amountString(m.usage)])).toEqual([["rule-a", "40"], ["rule-b", "30"]]);
  });

  it("B. when the member's own remaining is tighter than the pool, the member bounds the answer", () => {
    const { state } = run([A(), B()], [sharedCap("pool-s", MONEY(150), ["rule-a", "rule-b"])], [usage("u1", "40", onRule("rule-a")), usage("u2", "30", onRule("rule-b"))]);
    const a = cap(state, "rule-a");
    expect(amountString(a.remaining)).toBe("60");
    expect(amountString(pool(state, "pool-s").remaining)).toBe("80");
    expect(amountString(a.effectiveRemaining)).toBe("60");
  });

  it("C. when the pool is tighter than the member, the pool bounds the answer", () => {
    const { state } = run([rule("rule-a", MONEY(200)), B()], [sharedCap("pool-s", MONEY(150), ["rule-a", "rule-b"])], [usage("u2", "70", onRule("rule-b"))]);
    expect(amountString(cap(state, "rule-a").remaining)).toBe("200");
    expect(amountString(pool(state, "pool-s").remaining)).toBe("80");
    expect(amountString(cap(state, "rule-a").effectiveRemaining)).toBe("80");
  });

  it("D. a capacity in two pools is bounded by both, and neither pool is collapsed", () => {
    const { state } = run(
      [rule("rule-a", MONEY(500)), B()],
      [sharedCap("pool-s1", MONEY(300), ["rule-a"]), sharedCap("pool-s2", MONEY(120), ["rule-a", "rule-b"])],
      [usage("u2", "20", onRule("rule-b"))],
    );
    const a = cap(state, "rule-a");
    expect(a.sharedConstraintIds).toEqual(["pool-s1", "pool-s2"]);
    expect(amountString(pool(state, "pool-s1").remaining)).toBe("300");
    expect(amountString(pool(state, "pool-s2").remaining)).toBe("100");
    expect(amountString(a.effectiveRemaining)).toBe("100");
  });

  it("E. a usage that might have consumed this capacity fails closed rather than being allocated", () => {
    const { state } = run([A(), B()], [], [usage("u1", "40", unresolved(["rule-a", "rule-b"]))]);
    const a = cap(state, "rule-a");
    expect(a.status).toBe("AMBIGUOUS");
    expect(a.limitations.some((l) => l.code === "AMBIGUOUS_CONSUMPTION_ALLOCATION")).toBe(true);
    expect(a.remaining.kind).toBe("NOT_DETERMINED");
    expect(a.appliedUsageIds).toEqual([]);
  });

  it("F. a cycle among capacities is detected, reported with its path, and never recursed", () => {
    const a = rule("rule-a", MONEY(10), { dependsOn: [{ relationshipType: "REQUIRES", targetRuleId: "rule-b", description: "a requires b" }] });
    const b = rule("rule-b", MONEY(10), { dependsOn: [{ relationshipType: "REQUIRES", targetRuleId: "rule-a", description: "b requires a" }] });
    const { graph, state } = run([a, b], []);
    expect(graph.cycles.length).toBeGreaterThan(0);
    expect(graph.cycles[0]!.nodePath.length).toBeGreaterThan(2);
    expect(state.limitations.some((l) => l.code === "CAPACITY_GRAPH_CYCLE")).toBe(true);
  });

  it("G. a pool whose member usage is in another currency fails closed with no conversion", () => {
    const { state } = run([A(), B()], [sharedCap("pool-s", MONEY(150), ["rule-a", "rule-b"])], [usage("u1", "40", onRule("rule-a"), { amount: { amount: "40", currency: "EUR" } })]);
    const a = cap(state, "rule-a");
    expect(a.status).toBe("ERROR");
    expect(a.limitations.some((l) => l.code === "CURRENCY_MISMATCH_NO_CONVERSION_MODELED")).toBe(true);
    expect(JSON.stringify(state)).not.toContain("convertedTo");
  });

  it("H. a pool whose own capacity needs a missing metric is NEEDS_INPUT, and its members say so", () => {
    const { state } = run([A(), B()], [sharedCap("pool-s", MUL(PCT(0.1), METRIC("metric-absent")), ["rule-a", "rule-b"])]);
    const s = pool(state, "pool-s");
    expect(s.status).toBe("NEEDS_INPUT");
    expect(s.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(cap(state, "rule-a").status).toBe("NEEDS_INPUT");
  });

  it("a shared relationship with no quantified pool is a limitation, never an invented limit", () => {
    const a = rule("rule-a", MONEY(100), { dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "rule-b", description: "shares with b" }] });
    const { graph } = run([a, B()], []);
    expect(graph.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED")).toBe(true);
    expect(graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")).toEqual([]);
  });

  it("usage recorded directly against the pool counts alongside member usage", () => {
    const { state } = run([A(), B()], [sharedCap("pool-s", MONEY(150), ["rule-a", "rule-b"])], [usage("u1", "40", onRule("rule-a")), usage("u3", "10", onShared("pool-s"))]);
    const s = pool(state, "pool-s");
    expect(amountString(s.usage)).toBe("50");
    expect(s.directUsageIds).toEqual(["u3"]);
  });
});

describe("ledger matrix (§38)", () => {
  const base = () => [rule("rule-a", MONEY(100))];

  it("no usage leaves remaining at gross, which is a determined zero consumption", () => {
    const { state } = run(base(), []);
    expect(amountString(cap(state, "rule-a").remaining)).toBe("100");
  });

  it("a future-dated usage does not participate under the stated as-of", () => {
    const { state } = run(base(), [], [usage("u1", "30", onRule("rule-a"), { effectiveAsOf: "2026-12-31" })]);
    const a = cap(state, "rule-a");
    expect(amountString(a.remaining)).toBe("100");
    expect(a.usageSelection.find((u) => u.usageId === "u1")!.rejectedBecause).toBe("EFFECTIVE_AFTER_AS_OF");
  });

  it("a reversed usage is not counted", () => {
    const { state } = run(base(), [], [usage("u1", "30", onRule("rule-a"), { status: "REVERSED" })]);
    expect(cap(state, "rule-a").usageSelection[0]!.rejectedBecause).toBe("STATUS_NOT_ACCEPTABLE");
    expect(amountString(cap(state, "rule-a").remaining)).toBe("100");
  });

  it("an explicitly superseded usage yields to its successor", () => {
    const { state } = run(base(), [], [
      usage("u1", "30", onRule("rule-a"), { status: "SUPERSEDED", supersededByUsageId: "u2" }),
      usage("u2", "45", onRule("rule-a")),
    ]);
    expect(cap(state, "rule-a").appliedUsageIds).toEqual(["u2"]);
    expect(amountString(cap(state, "rule-a").remaining)).toBe("55");
  });

  it("a duplicate usage id makes the ledger unsafe rather than choosing a row", () => {
    const { state } = run(base(), [], [usage("u1", "30", onRule("rule-a")), usage("u1", "80", onRule("rule-a"))]);
    expect(state.ledgerIssues.some((i) => i.code === "DUPLICATE_USAGE_ID")).toBe(true);
    expect(state.limitations.some((l) => l.code === "LEDGER_SET_UNSAFE")).toBe(true);
  });

  it("a usage for another company is rejected with a reason and never counted", () => {
    const { state } = run(base(), [], [usage("u1", "30", onRule("rule-a"), { companyId: CO2 })]);
    expect(cap(state, "rule-a").usageSelection[0]!.rejectedBecause).toBe("COMPANY_MISMATCH");
    expect(amountString(cap(state, "rule-a").remaining)).toBe("100");
  });

  it("a usage for another instrument is rejected with a reason", () => {
    const { state } = run(base(), [], [usage("u1", "30", onRule("rule-a"), { instrumentKey: INST2 })]);
    expect(cap(state, "rule-a").usageSelection[0]!.rejectedBecause).toBe("INSTRUMENT_MISMATCH");
  });

  it("a usage against a different capacity is rejected as not this capacity's", () => {
    const { state } = run([...base(), rule("rule-b", MONEY(100))], [], [usage("u1", "30", onRule("rule-b"))]);
    expect(cap(state, "rule-a").usageSelection[0]!.rejectedBecause).toBe("PATH_NOT_THIS_CAPACITY");
    expect(amountString(cap(state, "rule-b").remaining)).toBe("70");
  });

  it("self-supersession and a supersession cycle are both detected", () => {
    expect(buildLedgerIndex([usage("u1", "1", onRule("rule-a"), { supersededByUsageId: "u1" })]).issues.map((i) => i.code)).toContain("SELF_SUPERSESSION");
    const cyc = buildLedgerIndex([
      usage("u1", "1", onRule("rule-a"), { supersededByUsageId: "u2" }),
      usage("u2", "1", onRule("rule-a"), { supersededByUsageId: "u1" }),
    ]);
    expect(cyc.issues.map((i) => i.code)).toContain("SUPERSESSION_CYCLE");
    expect(cyc.safe).toBe(false);
  });

  it("usage identity is by explicit fields, so array order cannot change the answer", () => {
    // The same rule objects both times: only the ledger order differs.
    const rules = base();
    const records = [usage("u1", "10", onRule("rule-a")), usage("u2", "20", onRule("rule-a")), usage("u3", "30", onRule("rule-a"))];
    const forward = run(rules, [], records).state;
    const backward = run(rules, [], [...records].reverse()).state;
    expect(forward.stateHash).toBe(backward.stateHash);
    expect(amountString(cap(forward, "rule-a").remaining)).toBe("40");
  });
});
