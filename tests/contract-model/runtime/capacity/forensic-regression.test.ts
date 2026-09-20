/**
 * PHASE 4C FORENSIC REGRESSION (remediation R15).
 *
 * Every probe the independent closure audit used to falsify the first Phase-4C closure, kept as a
 * permanent suite. Each probe asserts the governing invariant - status, limitation code, numeric
 * result, usage, remaining, provenance, hash and array-order invariance - not merely the output the
 * audit happened to observe. Identifiers are deliberately unlike the rest of the suite.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { IRDefinition, IRRule, IRSharedCapacity } from "@/lib/contract-model/ir/types";
import { applyCapacityStateTransition, buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import type { ReclassificationElection } from "@/lib/contract-model/runtime/capacity/types";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { AS_OF, CO, INST, METRIC, MONEY, MUL, PCT, amountString, fact, onRule, resetIds, rule, sharedCap, snapshot, unresolved, usage } from "./helpers";

beforeEach(resetIds);

const run = (rules: IRRule[], caps: IRSharedCapacity[] = [], ledger: ReturnType<typeof usage>[] = [], inputs = EMPTY_RESOLVER) => {
  const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs, ledger, asOf: AS_OF });
  return { graph, state };
};
const cap = (state: ReturnType<typeof run>["state"], ruleId: string) => state.capacities.find((c) => c.ruleId === ruleId)!;
const election = (electionId: string, sourceRuleId: string, destinationRuleId: string, amount: string): ReclassificationElection =>
  ({ electionId, sourceRuleId, destinationRuleId, amount: { amount, currency: "USD" }, effectiveAsOf: "2026-03-31", provenance: { source: "forensic election", sourceVersion: null, approvalRef: null } });
const reclassRules = () => [
  rule("zq-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "zq-dst", description: "may reclassify" }] }),
  rule("zq-dst", MONEY(100)),
];
const transition = (rules: IRRule[], ledger: ReturnType<typeof usage>[], elections: ReclassificationElection[]) => {
  const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const before = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
  return applyCapacityStateTransition({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF, before, elections });
};

describe("P3 - duplicate shared-capacity identity (audit F3, remediation R7)", () => {
  const rules = () => [rule("zq-a", MONEY(100))];
  const pools = () => [sharedCap("zq-pool", MONEY(150), ["zq-a"]), sharedCap("zq-pool", MONEY(50), ["zq-a"])];

  it("neither claimant becomes the pool; the member is not authoritative; no amount from either claimant appears", () => {
    const { graph, state } = run(rules(), pools());
    expect(graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")).toEqual([]);
    expect(graph.limitations.map((l) => l.code)).toContain("DUPLICATE_SHARED_CAPACITY_IDENTITY");
    expect(state.sharedConstraints).toEqual([]);
    const a = cap(state, "zq-a");
    expect(a.status).toBe("REVIEW_REQUIRED");
    expect(a.effectiveRemaining.kind).toBe("NOT_DETERMINED");
    expect(amountString(a.effectiveRemaining)).not.toBe("150");
    expect(amountString(a.effectiveRemaining)).not.toBe("50");
    expect(a.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED")).toBe(true);
    // The local arithmetic survives, separately, as provisional.
    expect(amountString(a.provisional!.remaining)).toBe("100");
  });

  it("array order cannot decide: the reversed duplicate set gives byte-identical graph and state hashes", () => {
    const x = run(rules(), pools());
    resetIds();
    const y = run(rules(), [...pools()].reverse());
    expect(x.graph.graphHash).toBe(y.graph.graphHash);
    expect(x.state.stateHash).toBe(y.state.stateHash);
  });

  it("a state handed duplicate resources for a pool the graph does know refuses the pool rather than picking the last", () => {
    const rules0 = rules();
    const graph = buildCapacityGraph({ rules: rules0, sharedCapacities: [sharedCap("zq-pool", MONEY(150), ["zq-a"])], companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules: rules0, sharedCapacities: pools(), inputs: EMPTY_RESOLVER, asOf: AS_OF });
    const s = state.sharedConstraints[0]!;
    expect(s.status).toBe("UNSUPPORTED");
    expect(s.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(s.limitations.map((l) => l.code)).toEqual(["DUPLICATE_SHARED_CAPACITY_IDENTITY"]);
    expect(cap(state, "zq-a").status).not.toBe("AVAILABLE");
  });
});

describe("P7 - batch reclassification conservation (audit F1, remediation R4)", () => {
  it("two elections of 25 + 25 against 40 of source usage are both refused; nothing is applied; no capacity is created", () => {
    const r = transition(reclassRules(), [usage("zq-u1", "40", onRule("zq-src"))], [election("e1", "zq-src", "zq-dst", "25"), election("e2", "zq-src", "zq-dst", "25")]);
    expect(r.allExecuted).toBe(false);
    expect(r.after).toBeNull();
    expect(r.outcomes.map((o) => [o.electionId, o.state])).toEqual([["e1", "RECLASSIFICATION_NOT_EXECUTABLE"], ["e2", "RECLASSIFICATION_NOT_EXECUTABLE"]]);
    for (const o of r.outcomes) expect(o.blockedBy.map((b) => b.code)).toContain("AGGREGATE_SOURCE_USAGE_EXCEEDED");
    expect(r.batchConservation).toEqual([{ sourceRuleId: "zq-src", sourceUsage: "40", requested: "50", holds: false }]);
    // The before-state is untouched: source usage 40, remaining 60, never 110.
    expect(amountString(cap(r.before, "zq-src").usage)).toBe("40");
    expect(amountString(cap(r.before, "zq-src").remaining)).toBe("60");
  });

  it("the same batch in the other order is byte-identical", () => {
    const a = transition(reclassRules(), [usage("zq-u1", "40", onRule("zq-src"))], [election("e1", "zq-src", "zq-dst", "25"), election("e2", "zq-src", "zq-dst", "25")]);
    resetIds();
    const b = transition(reclassRules(), [usage("zq-u1", "40", onRule("zq-src"))], [election("e2", "zq-src", "zq-dst", "25"), election("e1", "zq-src", "zq-dst", "25")]);
    expect(a.transitionHash).toBe(b.transitionHash);
  });
});

describe("P8 - duplicate reclassification election identity (audit U10, remediation R5)", () => {
  it("two elections bearing one id are both refused, nothing executes, and the source is untouched", () => {
    const r = transition(reclassRules(), [usage("zq-u1", "40", onRule("zq-src"))], [election("same-id", "zq-src", "zq-dst", "10"), election("same-id", "zq-src", "zq-dst", "10")]);
    expect(r.allExecuted).toBe(false);
    expect(r.after).toBeNull();
    expect(r.outcomes.length).toBe(2);
    for (const o of r.outcomes) {
      expect(o.state).toBe("RECLASSIFICATION_NOT_EXECUTABLE");
      expect(o.blockedBy.map((b) => b.code)).toContain("DUPLICATE_ELECTION_IDENTITY");
      expect(o.generatedUsage).toEqual([]);
    }
    expect(amountString(cap(r.before, "zq-src").usage)).toBe("40");
  });
});

describe("P12 / P13 - snapshot ambiguity semantics (audit F7, remediation R11)", () => {
  const rulesTwoFacts = () => [rule("zq-a", MUL(PCT(0.1), METRIC("zq-m1"))), rule("zq-b", MUL(PCT(0.1), METRIC("zq-m2")))];
  const snaps = (...s: { id: string; inputs: ReturnType<typeof fact>[] }[]) => snapshotInputResolver({ snapshots: s.map((x) => snapshot(x.inputs, { snapshotId: x.id })), companyId: CO, instrumentKey: INST });

  it("P12: two different facts from two approved snapshots is a multi-snapshot binding, not an ambiguous one", () => {
    const { state } = run(rulesTwoFacts(), [], [], snaps({ id: "snap-1", inputs: [fact("zq-m1", "1000")] }, { id: "snap-2", inputs: [fact("zq-m2", "2000")] }));
    expect(state.capacities.map((c) => [c.status, amountString(c.grossCapacity)])).toEqual([["AVAILABLE", "100"], ["AVAILABLE", "200"]]);
    expect(state.snapshotBinding.ambiguous).toBe(false);
    expect(state.snapshotBinding.multiSnapshot).toBe(true);
    expect(state.snapshotBinding.snapshotIds).toEqual(["snap-1", "snap-2"]);
    expect(state.snapshotBinding.conflictingInputKeys).toEqual([]);
    expect(state.limitations.some((l) => l.code === "SNAPSHOT_BINDING_AMBIGUOUS")).toBe(false);
  });

  it("P13: the same fact in two approved snapshots is an actual conflict: ambiguous, named, and the capacity fails closed", () => {
    const { state } = run([rule("zq-a", MUL(PCT(0.1), METRIC("zq-m1")))], [], [], snaps({ id: "snap-1", inputs: [fact("zq-m1", "1000")] }, { id: "snap-2", inputs: [fact("zq-m1", "2000")] }));
    const a = state.capacities[0]!;
    expect(a.status).toBe("AMBIGUOUS");
    expect(a.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(a.limitations.some((l) => l.code === "AMBIGUOUS_FINANCIAL_INPUT")).toBe(true);
    expect(state.snapshotBinding.ambiguous).toBe(true);
    expect(state.snapshotBinding.conflictingInputKeys).toEqual(["zq-m1"]);
    expect(state.limitations.some((l) => l.code === "SNAPSHOT_BINDING_AMBIGUOUS")).toBe(true);
  });

  it("snapshot order does not change either answer", () => {
    const a = run([rule("zq-a", MUL(PCT(0.1), METRIC("zq-m1")))], [], [], snaps({ id: "snap-1", inputs: [fact("zq-m1", "1000")] }, { id: "snap-2", inputs: [fact("zq-m1", "2000")] }));
    resetIds();
    const b = run([rule("zq-a", MUL(PCT(0.1), METRIC("zq-m1")))], [], [], snaps({ id: "snap-2", inputs: [fact("zq-m1", "2000")] }, { id: "snap-1", inputs: [fact("zq-m1", "1000")] }));
    expect(a.state.stateHash).toBe(b.state.stateHash);
    expect(a.state.snapshotBinding).toEqual(b.state.snapshotBinding);
  });
});

describe("P15 - usage whose attribution is missing entirely (audit F6, remediation R10)", () => {
  it("an UNRESOLVED record with no candidates blocks every capacity in scope rather than vanishing", () => {
    const { state } = run([rule("zq-a", MONEY(100)), rule("zq-b", MONEY(100))], [], [usage("zq-u1", "40", unresolved([], "no attribution recorded"))]);
    for (const id of ["zq-a", "zq-b"]) {
      const c = cap(state, id);
      expect(c.status).toBe("AMBIGUOUS");
      expect(c.limitations.some((l) => l.code === "ALLOCATION_INFORMATION_MISSING")).toBe(true);
      expect(c.remaining.kind).toBe("NOT_DETERMINED");
      expect(amountString(c.remaining)).not.toBe("100");
      expect(c.usageSelection).toEqual([{ usageId: "zq-u1", rejectedBecause: "PATH_UNRESOLVED" }]);
    }
    expect(state.ledgerIssues.map((i) => i.code)).toContain("ALLOCATION_INFORMATION_MISSING");
    expect(state.limitations.map((l) => l.code)).toContain("ALLOCATION_INFORMATION_MISSING");
  });
});

describe("P16 - Phase-3 UNSUPPORTED sufficiency with an evaluable expression (audit F5, remediation R8)", () => {
  it("never publishes AVAILABLE; the arithmetic is provisional and the legal reason is carried", () => {
    const { state } = run([rule("zq-a", MONEY(100), { sufficiency: "UNSUPPORTED", sufficiencyReasons: ["marked unsupported by phase 3"] })], [], [usage("zq-u1", "30", onRule("zq-a"))]);
    const a = cap(state, "zq-a");
    expect(a.status).toBe("UNSUPPORTED");
    expect(a.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(a.remaining.kind).toBe("NOT_DETERMINED");
    expect(a.effectiveRemaining.kind).toBe("NOT_DETERMINED");
    expect(a.limitations.find((l) => l.code === "PHASE3_RULE_UNSUPPORTED")!.message).toContain("marked unsupported by phase 3");
    expect(a.phase3).toEqual({ sufficiency: "UNSUPPORTED", sufficiencyReasons: ["marked unsupported by phase 3"] });
    expect(amountString(a.provisional!.grossCapacity)).toBe("100");
    expect(amountString(a.provisional!.remaining)).toBe("70");
  });
});

describe("P18 - a negative usage supplied directly (audit U8)", () => {
  it("is neither counted nor discarded: the capacity fails closed and remaining never exceeds gross", () => {
    const { state } = run([rule("zq-a", MONEY(100))], [], [usage("zq-u1", "-30", onRule("zq-a"))]);
    const a = cap(state, "zq-a");
    expect(a.status).toBe("REVIEW_REQUIRED");
    expect(a.limitations.some((l) => l.code === "USAGE_AMOUNT_NOT_REPRESENTABLE")).toBe(true);
    expect(a.usage.kind).toBe("NOT_DETERMINED");
    expect(a.remaining.kind).toBe("NOT_DETERMINED");
    expect(amountString(a.remaining)).not.toBe("130");
    expect(a.usageSelection).toEqual([{ usageId: "zq-u1", rejectedBecause: "AMOUNT_NOT_REPRESENTABLE" }]);
    expect(state.ledgerIssues.map((i) => i.code)).toContain("USAGE_AMOUNT_NOT_REPRESENTABLE");
  });

  it("the source half of a conserved reclassification pair remains representable, and only with its destination half present", () => {
    const r = transition(reclassRules(), [usage("zq-u1", "40", onRule("zq-src"))], [election("e1", "zq-src", "zq-dst", "25")]);
    expect(r.allExecuted).toBe(true);
    expect(amountString(cap(r.after!, "zq-src").usage)).toBe("15");
    // Strip the destination half: the negative source half alone would create capacity, so it is refused.
    const orphan = r.outcomes[0]!.generatedUsage.find((u) => u.usageId.endsWith(":source"))!;
    const { state } = run(reclassRules(), [], [usage("zq-u1", "40", onRule("zq-src")), orphan]);
    expect(cap(state, "zq-src").status).toBe("REVIEW_REQUIRED");
    expect(cap(state, "zq-src").limitations.some((l) => l.code === "USAGE_AMOUNT_NOT_REPRESENTABLE")).toBe(true);
    expect(cap(state, "zq-src").usage.kind).toBe("NOT_DETERMINED");
  });
});

describe("P19 / P19b - duplicate ledger usage identity (audit F2, F10; remediation R6)", () => {
  const cases: [string, string, string][] = [["P19 differing claimants", "30", "80"], ["P19b identical claimants", "30", "30"]];
  it.each(cases)("%s: neither row is counted, the capacity fails closed with DUPLICATE_LEDGER_USAGE_IDENTITY, and no arithmetic leaks", (_l, x, y) => {
    const { state } = run([rule("zq-a", MONEY(200))], [], [usage("dup", x, onRule("zq-a")), usage("dup", y, onRule("zq-a"))]);
    const a = cap(state, "zq-a");
    expect(a.status).toBe("AMBIGUOUS");
    expect(a.limitations.some((l) => l.code === "DUPLICATE_LEDGER_USAGE_IDENTITY")).toBe(true);
    expect(a.appliedUsageIds).toEqual([]);
    expect(a.usage.kind).toBe("NOT_DETERMINED");
    expect(a.remaining.kind).toBe("NOT_DETERMINED");
    expect(a.effectiveRemaining.kind).toBe("NOT_DETERMINED");
    for (const forbidden of ["200", "170", "140", "120", String(200 - Number(x)), String(200 - Number(x) - Number(y))]) expect(amountString(a.remaining)).not.toBe(forbidden);
    expect(state.ledgerScope.quarantinedUsageIds).toEqual(["dup"]);
    expect(state.ledgerIssues.map((i) => i.code)).toContain("DUPLICATE_USAGE_ID");
    expect(state.limitations.map((l) => l.code)).toContain("DUPLICATE_LEDGER_USAGE_IDENTITY");
    expect(state.explanations[0]!.ledgerEntries).toEqual([]);
  });

  it("the invariant is a refusal, never a deduplication: identical claimants are not collapsed to one", () => {
    const { state } = run([rule("zq-a", MONEY(200))], [], [usage("dup", "30", onRule("zq-a")), usage("dup", "30", onRule("zq-a"))]);
    expect(amountString(cap(state, "zq-a").usage)).toBeNull();
    expect(amountString(cap(state, "zq-a").remaining)).not.toBe("170");
  });

  it("two legitimately independent records with distinct ids both count, so the refusal is about identity, not amount", () => {
    const { state } = run([rule("zq-a", MONEY(200))], [], [usage("zq-u1", "30", onRule("zq-a")), usage("zq-u2", "80", onRule("zq-a"))]);
    expect(amountString(cap(state, "zq-a").usage)).toBe("110");
    expect(amountString(cap(state, "zq-a").remaining)).toBe("90");
  });

  it("record order does not change the refusal", () => {
    const a = run([rule("zq-a", MONEY(200))], [], [usage("dup", "30", onRule("zq-a")), usage("dup", "80", onRule("zq-a"))]);
    resetIds();
    const b = run([rule("zq-a", MONEY(200))], [], [usage("dup", "80", onRule("zq-a")), usage("dup", "30", onRule("zq-a"))]);
    expect(a.state.stateHash).toBe(b.state.stateHash);
  });
});

describe("P20 - symmetric relationships on the frozen real corpus are not cycles (audit F8, remediation R12)", () => {
  const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";
  const frozen = JSON.parse(readFileSync(FROZEN, "utf8")) as { rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities?: IRSharedCapacity[] };
  const PC = "pf-co", PI = "pf-in";
  const retarget = <T extends { companyId: string; instrumentKey: string }>(o: T): T =>
    JSON.parse(JSON.stringify(o).replace(new RegExp(`"${o.companyId}"`, "g"), `"${PC}"`).replace(new RegExp(`"${o.instrumentKey}"`, "g"), `"${PI}"`)) as T;

  it("reports zero evaluation cycles, carries every SHARES_CAPACITY_WITH edge as a legal relationship, and keeps the unquantified-pool gap explicit", () => {
    const rules = frozen.rules.filter((r) => r.capacityExpression).map(retarget);
    const graph = buildCapacityGraph({ rules, definitions: frozen.definitions.map(retarget), sharedCapacities: (frozen.sharedCapacities ?? []).map(retarget), companyId: PC, instrumentKey: PI, asOf: AS_OF });
    expect(graph.cycles).toEqual([]);
    expect(graph.limitations.some((l) => l.code === "CAPACITY_GRAPH_CYCLE" || l.code === "SHARED_CAPACITY_CYCLE")).toBe(false);
    const shares = graph.edges.filter((e) => e.sourceRelationship === "SHARES_CAPACITY_WITH");
    expect(shares.length).toBeGreaterThan(0);
    expect(shares.every((e) => e.kind === "LEGAL_RELATIONSHIP")).toBe(true);
    expect(graph.edges.some((e) => e.kind === "DEPENDS_ON" && e.sourceRelationship !== "RULE_REFERENCE")).toBe(false);
    // Real-corpus gap, unchanged by remediation: no quantified shared resource, no executable reclassification edge.
    expect((frozen.sharedCapacities ?? []).length).toBe(0);
    expect(graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")).toEqual([]);
    expect(graph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO")).toEqual([]);
    expect(graph.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED")).toBe(true);
    // Members of an unquantified share are not authoritative.
    const state = evaluateCapacityState({ graph, rules, definitions: frozen.definitions.map(retarget), inputs: EMPTY_RESOLVER, asOf: AS_OF });
    const shareMembers = new Set(shares.flatMap((e) => [e.from, e.to]));
    for (const c of state.capacities) if (shareMembers.has(c.capacityNodeId)) { expect(c.status).not.toBe("AVAILABLE"); expect(c.effectiveRemaining.kind).toBe("NOT_DETERMINED"); }
  });
});

describe("P21 - state-evaluation complexity (audit F4, remediation R13)", () => {
  // The audit's own construction: a chain of SHARES_CAPACITY_WITH, one pool over every rule, one usage per rule.
  const construct = (size: number) => {
    resetIds();
    const pad = (i: number) => String(i).padStart(5, "0");
    const rules = Array.from({ length: size }, (_, i) => rule(`zr-${pad(i)}`, MONEY(100), { dependsOn: i > 0 ? [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: `zr-${pad(i - 1)}`, description: "shares" }] : [] }));
    const caps = [sharedCap("zr-pool", MONEY(1_000_000), rules.map((r) => r.ruleId))];
    const ledger = rules.map((r, i) => usage(`zu-${pad(i)}`, "1", onRule(r.ruleId)));
    return { rules, caps, ledger };
  };
  const measure = (size: number) => {
    const { rules, caps, ledger } = construct(size);
    const t0 = process.hrtime.bigint();
    const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const t1 = process.hrtime.bigint();
    const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    const t2 = process.hrtime.bigint();
    return { size, buildMs: Number(t1 - t0) / 1e6, evalMs: Number(t2 - t1) / 1e6, c: state.complexity, edges: graph.edges.length };
  };

  it("operation counters are exactly linear in n: the proof is the counts, not the clock", () => {
    for (const n of [50, 100, 200, 400]) {
      const m = measure(n);
      expect(m.c.nodesVisited).toBe(n + 1);
      expect(m.c.expressionsEvaluated).toBe(n + 1);
      expect(m.c.ledgerEntriesConsidered).toBe(n);
      expect(m.c.ledgerEntriesExamined).toBe(n);
      expect(m.c.ledgerEntriesApplied).toBe(n);
      expect(m.c.edgesVisited).toBe(n);
      expect(m.c.sharedResourceLookups).toBe(n);
      expect(m.c.dependencyLookups).toBe(n + 1);
      expect(m.c.sharedConstraintsEvaluated).toBe(1);
      expect(m.c.indexLookups).toBeLessThanOrEqual(6 * n + 6);
      expect(m.c.cacheHits).toBeGreaterThanOrEqual(n);
    }
  });

  it("supplemental: wall-clock log-log slope over materially increasing n is far below the audited 1.81", () => {
    measure(100);
    const rows = [200, 400, 800, 1600].map((n) => { let best = Infinity; for (let k = 0; k < 3; k++) best = Math.min(best, measure(n).buildMs + measure(n).evalMs); return { n, ms: Math.max(best, 0.5) }; });
    const xs = rows.map((r) => Math.log(r.n)), ys = rows.map((r) => Math.log(r.ms));
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    expect(slope).toBeLessThan(1.5);
  });
});

describe("P22 - generality under unseen identifiers, a non-USD currency and renamed everything", () => {
  const twin = (co: string, inst: string, ccy: string, tag: string) => {
    resetIds();
    const rules = [rule(`${tag}-alpha`, MONEY(300, ccy), { companyId: co, instrumentKey: inst }), rule(`${tag}-beta`, MONEY(200, ccy), { companyId: co, instrumentKey: inst })];
    const caps = [sharedCap(`${tag}-pool`, MONEY(400, ccy), [`${tag}-alpha`, `${tag}-beta`], { companyId: co, instrumentKey: inst })];
    const ledger = [usage(`${tag}-u1`, "50", onRule(`${tag}-alpha`), { companyId: co, instrumentKey: inst, amount: { amount: "50", currency: ccy } })];
    const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: co, instrumentKey: inst, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    return { kinds: graph.nodes.map((n) => n.kind), edges: graph.edges.map((e) => e.kind), caps: state.capacities.map((c) => [c.status, amountString(c.effectiveRemaining)]), pool: amountString(state.sharedConstraints[0]!.remaining), hash: state.stateHash };
  };
  it("topology, statuses and amounts are identical to a plain USD twin, and only the hashes differ", () => {
    const a = twin("Ørsted-Holdings-ÆØÅ", "facility-Ω-2031", "NOK", "vx");
    const b = twin("plain-co", "plain-in", "USD", "wy");
    expect({ ...a, hash: undefined }).toEqual({ ...b, hash: undefined });
    expect(a.caps).toEqual([["AVAILABLE", "250"], ["AVAILABLE", "200"]]);
    expect(a.pool).toBe("350");
    expect(a.hash).not.toBe(b.hash);
  });
});
