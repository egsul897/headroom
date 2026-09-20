/**
 * PHASE 4C REMEDIATION MATRICES (R4 - R13).
 *
 * The generic invariants behind the audit findings, each proved over the full matrix the mission
 * lists rather than the single fixture the audit observed. Reclassification batches, identity
 * uniqueness, legal-state dominance, unquantified sharing, allocation completeness, snapshot
 * ambiguity, cycle semantics and complexity counters.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { IRRule, IRSharedCapacity, RepresentationSufficiency } from "@/lib/contract-model/ir/types";
import { applyCapacityStateTransition, buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { SUFFICIENCY_DOMINANCE } from "@/lib/contract-model/runtime/capacity/state";
import type { CapacityStatus, ReclassificationElection } from "@/lib/contract-model/runtime/capacity/types";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { AS_OF, CO, INST, METRIC, MONEY, MUL, PCT, RULE_REF, amountString, fact, onRule, resetIds, resolver, rule, sharedCap, snapshot, unresolved, usage } from "./helpers";

beforeEach(resetIds);

const run = (rules: IRRule[], caps: IRSharedCapacity[] = [], ledger: ReturnType<typeof usage>[] = [], inputs = EMPTY_RESOLVER) => {
  const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs, ledger, asOf: AS_OF });
  return { graph, state };
};
const cap = (state: ReturnType<typeof run>["state"], ruleId: string) => state.capacities.find((c) => c.ruleId === ruleId)!;
const el = (electionId: string, sourceRuleId: string, destinationRuleId: string, amount: string): ReclassificationElection =>
  ({ electionId, sourceRuleId, destinationRuleId, amount: { amount, currency: "USD" }, effectiveAsOf: "2026-03-31", provenance: { source: "matrix election", sourceVersion: "v1", approvalRef: "approval-m" } });
const reclass = (from: string, to: string[]) => ({ dependsOn: to.map((t) => ({ relationshipType: "RECLASSIFIABLE_TO" as const, targetRuleId: t, description: `${from} may reclassify into ${t}` })) });
const transition = (rules: IRRule[], ledger: ReturnType<typeof usage>[], elections: ReclassificationElection[]) => {
  const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const before = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
  return { graph, before, result: applyCapacityStateTransition({ graph, rules, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF, before, elections }) };
};
/** Total usage across every capacity: the economic quantity conservation preserves. */
const totalUsage = (state: ReturnType<typeof run>["state"]) => state.capacities.reduce((sum, c) => sum + Number(amountString(c.usage) ?? "0"), 0);

// ---------------------------------------------------------------------------
// R4 - batch conservation
// ---------------------------------------------------------------------------
describe("R4 - reclassification conservation over the whole batch", () => {
  const rules = () => [rule("src", MONEY(100), reclass("src", ["dst"])), rule("dst", MONEY(100))];
  const ledger = () => [usage("u1", "40", onRule("src"))];
  const codes = (r: ReturnType<typeof transition>["result"]) => r.outcomes.map((o) => [o.electionId, o.state, o.blockedBy.map((b) => b.code)]);

  it("A. one election below source usage executes and total usage is preserved", () => {
    const { before, result } = transition(rules(), ledger(), [el("e1", "src", "dst", "25")]);
    expect(result.allExecuted).toBe(true);
    expect(amountString(cap(result.after!, "src").usage)).toBe("15");
    expect(amountString(cap(result.after!, "dst").usage)).toBe("25");
    expect(amountString(cap(result.after!, "src").remaining)).toBe("85");
    expect(totalUsage(result.after!)).toBe(totalUsage(before));
    expect(result.batchConservation).toEqual([{ sourceRuleId: "src", sourceUsage: "40", requested: "25", holds: true }]);
  });

  it("B. one election exactly equal to source usage executes and leaves the source at zero usage, never negative", () => {
    const { result } = transition(rules(), ledger(), [el("e1", "src", "dst", "40")]);
    expect(result.allExecuted).toBe(true);
    expect(amountString(cap(result.after!, "src").usage)).toBe("0");
    expect(amountString(cap(result.after!, "src").remaining)).toBe("100");
    expect(amountString(cap(result.after!, "dst").usage)).toBe("40");
  });

  it("C. one election greater than source usage is refused; after is null; the before-state is untouched", () => {
    const { before, result } = transition(rules(), ledger(), [el("e1", "src", "dst", "50")]);
    expect(result.allExecuted).toBe(false);
    expect(result.after).toBeNull();
    expect(codes(result)[0]![2]).toContain("SOURCE_USAGE_INSUFFICIENT");
    expect(codes(result)[0]![2]).toContain("AGGREGATE_SOURCE_USAGE_EXCEEDED");
    expect(amountString(cap(before, "src").remaining)).toBe("60");
  });

  it("D. two elections whose sum is below source usage both execute", () => {
    const { before, result } = transition(rules(), ledger(), [el("e1", "src", "dst", "10"), el("e2", "src", "dst", "20")]);
    expect(result.allExecuted).toBe(true);
    expect(amountString(cap(result.after!, "src").usage)).toBe("10");
    expect(amountString(cap(result.after!, "dst").usage)).toBe("30");
    expect(totalUsage(result.after!)).toBe(totalUsage(before));
    expect(result.batchConservation).toEqual([{ sourceRuleId: "src", sourceUsage: "40", requested: "30", holds: true }]);
  });

  it("E. two elections whose sum equals source usage both execute", () => {
    const { result } = transition(rules(), ledger(), [el("e1", "src", "dst", "15"), el("e2", "src", "dst", "25")]);
    expect(result.allExecuted).toBe(true);
    expect(amountString(cap(result.after!, "src").usage)).toBe("0");
    expect(amountString(cap(result.after!, "dst").usage)).toBe("40");
  });

  it("F. two elections individually valid but jointly over the source are both refused atomically", () => {
    const { result } = transition(rules(), ledger(), [el("e1", "src", "dst", "25"), el("e2", "src", "dst", "25")]);
    expect(result.allExecuted).toBe(false);
    expect(result.after).toBeNull();
    for (const [, state, c] of codes(result)) { expect(state).toBe("RECLASSIFICATION_NOT_EXECUTABLE"); expect(c).toContain("AGGREGATE_SOURCE_USAGE_EXCEEDED"); expect(c).not.toContain("SOURCE_USAGE_INSUFFICIENT"); }
    expect(result.batchConservation).toEqual([{ sourceRuleId: "src", sourceUsage: "40", requested: "50", holds: false }]);
  });

  it("G. a three-plus batch is validated as a whole in both directions", () => {
    const ok = transition(rules(), ledger(), [el("e1", "src", "dst", "10"), el("e2", "src", "dst", "10"), el("e3", "src", "dst", "10"), el("e4", "src", "dst", "10")]).result;
    expect(ok.allExecuted).toBe(true);
    expect(amountString(cap(ok.after!, "src").usage)).toBe("0");
    expect(amountString(cap(ok.after!, "dst").usage)).toBe("40");
    resetIds();
    const over = transition(rules(), ledger(), [el("e1", "src", "dst", "15"), el("e2", "src", "dst", "15"), el("e3", "src", "dst", "15")]).result;
    expect(over.allExecuted).toBe(false);
    expect(over.after).toBeNull();
    expect(over.outcomes.every((o) => o.blockedBy.some((b) => b.code === "AGGREGATE_SOURCE_USAGE_EXCEEDED"))).toBe(true);
    expect(over.batchConservation).toEqual([{ sourceRuleId: "src", sourceUsage: "40", requested: "45", holds: false }]);
  });

  it("H. duplicate election identity fails closed for every bearer and blocks the batch", () => {
    const { result } = transition(rules(), ledger(), [el("dup", "src", "dst", "5"), el("dup", "src", "dst", "5"), el("other", "src", "dst", "5")]);
    expect(result.allExecuted).toBe(false);
    expect(result.after).toBeNull();
    const byId = Object.fromEntries(result.outcomes.map((o) => [o.electionId + ":" + o.blockedBy.map((b) => b.code).join(","), o.state]));
    expect(Object.keys(byId).filter((k) => k.startsWith("dup:")).every((k) => k.includes("DUPLICATE_ELECTION_IDENTITY"))).toBe(true);
    expect(result.outcomes.find((o) => o.electionId === "other")!.blockedBy.map((b) => b.code)).toEqual(["BLOCKED_BY_BATCH_ATOMICITY"]);
  });

  it("I. the same source reclassified toward multiple targets is aggregated across the targets", () => {
    const multi = () => [rule("src", MONEY(100), reclass("src", ["dst1", "dst2"])), rule("dst1", MONEY(100)), rule("dst2", MONEY(100))];
    const ok = transition(multi(), ledger(), [el("e1", "src", "dst1", "20"), el("e2", "src", "dst2", "20")]).result;
    expect(ok.allExecuted).toBe(true);
    expect([amountString(cap(ok.after!, "src").usage), amountString(cap(ok.after!, "dst1").usage), amountString(cap(ok.after!, "dst2").usage)]).toEqual(["0", "20", "20"]);
    resetIds();
    const over = transition(multi(), ledger(), [el("e1", "src", "dst1", "25"), el("e2", "src", "dst2", "20")]).result;
    expect(over.allExecuted).toBe(false);
    expect(over.after).toBeNull();
    expect(over.batchConservation).toEqual([{ sourceRuleId: "src", sourceUsage: "40", requested: "45", holds: false }]);
  });

  it("J. multiple independent sources in one batch are each conserved, and one failure blocks the whole batch", () => {
    const two = () => [rule("srcA", MONEY(100), reclass("srcA", ["dst"])), rule("srcB", MONEY(100), reclass("srcB", ["dst"])), rule("dst", MONEY(100))];
    const l = () => [usage("uA", "40", onRule("srcA")), usage("uB", "30", onRule("srcB"))];
    const ok = transition(two(), l(), [el("a1", "srcA", "dst", "40"), el("b1", "srcB", "dst", "10"), el("b2", "srcB", "dst", "20")]).result;
    expect(ok.allExecuted).toBe(true);
    expect(ok.batchConservation).toEqual([{ sourceRuleId: "srcA", sourceUsage: "40", requested: "40", holds: true }, { sourceRuleId: "srcB", sourceUsage: "30", requested: "30", holds: true }]);
    expect(amountString(cap(ok.after!, "dst").usage)).toBe("70");
    resetIds();
    const over = transition(two(), l(), [el("a1", "srcA", "dst", "10"), el("b1", "srcB", "dst", "35")]).result;
    expect(over.allExecuted).toBe(false);
    expect(over.after).toBeNull();
    expect(over.outcomes.find((o) => o.electionId === "a1")!.blockedBy.map((b) => b.code)).toEqual(["BLOCKED_BY_BATCH_ATOMICITY"]);
    expect(over.outcomes.find((o) => o.electionId === "b1")!.blockedBy.map((b) => b.code)).toContain("AGGREGATE_SOURCE_USAGE_EXCEEDED");
    expect(over.batchConservation).toEqual([{ sourceRuleId: "srcA", sourceUsage: "40", requested: "10", holds: true }, { sourceRuleId: "srcB", sourceUsage: "30", requested: "35", holds: false }]);
  });

  it("election order never changes a batch result, executed or refused", () => {
    for (const amounts of [["10", "20"], ["25", "25"]]) {
      const a = transition(rules(), ledger(), [el("e1", "src", "dst", amounts[0]!), el("e2", "src", "dst", amounts[1]!)]).result;
      resetIds();
      const b = transition(rules(), ledger(), [el("e2", "src", "dst", amounts[1]!), el("e1", "src", "dst", amounts[0]!)]).result;
      expect(a.transitionHash).toBe(b.transitionHash);
      expect(a.after?.stateHash ?? null).toBe(b.after?.stateHash ?? null);
      resetIds();
    }
  });

  it("every election draws on the before-state: no election may spend usage another one moves in", () => {
    const chain = [rule("a", MONEY(100), reclass("a", ["b"])), rule("b", MONEY(100), reclass("b", ["c"])), rule("c", MONEY(100))];
    const { result } = transition(chain, [usage("u1", "40", onRule("a"))], [el("e1", "a", "b", "30"), el("e2", "b", "c", "30")]);
    expect(result.allExecuted).toBe(false);
    expect(result.after).toBeNull();
    expect(result.outcomes.find((o) => o.electionId === "e2")!.blockedBy.map((b) => b.code)).toContain("SOURCE_USAGE_INSUFFICIENT");
  });

  it("a zero or negative election amount is a missing semantic field, never a reverse move", () => {
    for (const amount of ["0", "-10"]) {
      const { result } = transition(rules(), ledger(), [el("e1", "src", "dst", amount)]);
      expect(result.after).toBeNull();
      expect(result.outcomes[0]!.blockedBy.find((b) => b.code === "MISSING_SEMANTIC_FIELDS")!.missingSemanticFields).toContain("amount.amount");
      resetIds();
    }
  });
});

// ---------------------------------------------------------------------------
// R5 - election identity
// ---------------------------------------------------------------------------
describe("R5 - reclassification identity", () => {
  const rules = () => [rule("src", MONEY(100), reclass("src", ["dst"])), rule("dst", MONEY(100))];

  it("an election whose generated usage is already in the ledger is not applied again", () => {
    const first = transition(rules(), [usage("u1", "40", onRule("src"))], [el("e1", "src", "dst", "10")]);
    expect(first.result.allExecuted).toBe(true);
    const ledger2 = [usage("u1", "40", onRule("src")), ...first.result.outcomes[0]!.generatedUsage];
    resetIds();
    const again = transition(rules(), ledger2, [el("e1", "src", "dst", "10")]);
    expect(amountString(cap(again.before, "src").usage)).toBe("30");
    expect(again.result.allExecuted).toBe(false);
    expect(again.result.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("ELECTION_ALREADY_APPLIED");
    expect(again.result.after).toBeNull();
  });

  it("the generated usage carries the election identity and provenance, and the pair nets to zero", () => {
    const { result } = transition(rules(), [usage("u1", "40", onRule("src"))], [el("e1", "src", "dst", "10")]);
    const o = result.outcomes[0]!;
    expect(o.generatedUsage.map((u) => [u.usageId, u.transactionRef, u.provenance.approvalState, u.provenance.source, u.provenance.approvalRef])).toEqual([
      ["e1:source", "e1", "RECLASSIFICATION_ELECTION", "matrix election", "approval-m"],
      ["e1:destination", "e1", "RECLASSIFICATION_ELECTION", "matrix election", "approval-m"],
    ]);
    expect(o.conservation).toEqual({ sourceDelta: "-10", destinationDelta: "10", net: "0", holds: true });
    expect(o.authorizingEdge!.sourceRelationship).toBe("RECLASSIFIABLE_TO");
  });
});

// ---------------------------------------------------------------------------
// R7 - duplicate capacity / shared-resource identity, under permutation
// ---------------------------------------------------------------------------
describe("R7 - duplicate rule and pool identity never resolve by array order", () => {
  it("two rules claiming one id yield no capacity node, an explicit refusal, and the same hash in either order", () => {
    const dup = () => [rule("r", MONEY(100)), rule("r", MONEY(500)), rule("other", MONEY(10))];
    const a = run(dup());
    resetIds();
    const b = run(dup().reverse());
    for (const g of [a, b]) {
      expect(g.graph.nodes.map((n) => n.ruleId)).toEqual(["other"]);
      expect(g.graph.limitations.map((l) => l.code)).toContain("DUPLICATE_RULE_IDENTITY");
      expect(g.state.capacities.map((c) => [c.ruleId, amountString(c.grossCapacity)])).toEqual([["other", "10"]]);
      expect(JSON.stringify(g.state.capacities)).not.toContain('"500"');
    }
    expect(a.graph.graphHash).toBe(b.graph.graphHash);
    expect(a.state.stateHash).toBe(b.state.stateHash);
  });

  it("a rule id duplicated among the resources handed to the state, but not the graph, is refused at the entry", () => {
    const one = [rule("r", MONEY(100))];
    const graph = buildCapacityGraph({ rules: one, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules: [rule("r", MONEY(100)), rule("r", MONEY(500))], inputs: EMPTY_RESOLVER, asOf: AS_OF });
    expect(state.capacities[0]!.status).toBe("UNSUPPORTED");
    expect(state.capacities[0]!.limitations.map((l) => l.code)).toEqual(["DUPLICATE_RULE_IDENTITY"]);
    expect(state.capacities[0]!.grossCapacity.kind).toBe("NOT_DETERMINED");
  });

  it("two pools claiming one id: refused as a set, members non-authoritative, order-invariant (also covered by forensic P3)", () => {
    const rules = () => [rule("a", MONEY(100)), rule("b", MONEY(100))];
    const pools = () => [sharedCap("p", MONEY(150), ["a", "b"]), sharedCap("p", MONEY(150), ["a", "b"])];
    const x = run(rules(), pools());
    resetIds();
    const y = run(rules(), pools().reverse());
    expect(x.graph.graphHash).toBe(y.graph.graphHash);
    expect(x.state.stateHash).toBe(y.state.stateHash);
    // Semantically identical duplicates are refused too: the invariant is uniqueness, not agreement.
    expect(x.state.sharedConstraints).toEqual([]);
    expect(x.state.capacities.every((c) => c.status === "REVIEW_REQUIRED" && c.effectiveRemaining.kind === "NOT_DETERMINED")).toBe(true);
  });

  it("a Phase-3 relationship stated twice with different wording is one edge carrying both wordings, in canonical order", () => {
    const stated = (d1: string, d2: string) => [rule("src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "dst", description: d1 }, { relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "dst", description: d2 }] }), rule("dst", MONEY(100))];
    const a = run(stated("edge one", "edge two"));
    resetIds();
    const b = run(stated("edge two", "edge one"));
    expect(a.graph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO").map((e) => e.description)).toEqual(["edge one | edge two"]);
    expect(a.graph.graphHash).toBe(b.graph.graphHash);
  });
});

// ---------------------------------------------------------------------------
// R8 - legal-state dominance, table-driven over every sufficiency value
// ---------------------------------------------------------------------------
describe("R8 - legal-state dominance over every Phase-3 sufficiency value and unsafe scope", () => {
  // Independent expectation, not read from production: what each Phase-3 value must do to a capacity
  // whose arithmetic would otherwise be AVAILABLE with gross 100, usage 30, remaining 70.
  const EVERY_SUFFICIENCY: RepresentationSufficiency[] = ["COMPLETE", "PARTIAL", "AMBIGUOUS", "UNSUPPORTED", "MISSING_CONTEXT", "CONFLICTED"];
  const EXPECT: Record<RepresentationSufficiency, { status: CapacityStatus; limitation: string | null; authoritative: boolean }> = {
    COMPLETE: { status: "AVAILABLE", limitation: null, authoritative: true },
    PARTIAL: { status: "REVIEW_REQUIRED", limitation: "PHASE3_RULE_NOT_SAFE_TO_RELY_ON", authoritative: false },
    AMBIGUOUS: { status: "AMBIGUOUS", limitation: "PHASE3_RULE_AMBIGUOUS", authoritative: false },
    MISSING_CONTEXT: { status: "AMBIGUOUS", limitation: "PHASE3_RULE_AMBIGUOUS", authoritative: false },
    CONFLICTED: { status: "AMBIGUOUS", limitation: "PHASE3_RULE_AMBIGUOUS", authoritative: false },
    UNSUPPORTED: { status: "UNSUPPORTED", limitation: "PHASE3_RULE_UNSUPPORTED", authoritative: false },
  };

  it("the production table covers exactly the Phase-3 enumeration, nothing more and nothing less", () => {
    expect(Object.keys(SUFFICIENCY_DOMINANCE).sort()).toEqual([...EVERY_SUFFICIENCY].sort());
  });

  it.each(EVERY_SUFFICIENCY)("sufficiency %s", (sufficiency) => {
    const { state } = run([rule("r", MONEY(100), { sufficiency, sufficiencyReasons: [`reason for ${sufficiency}`] })], [], [usage("u1", "30", onRule("r"))]);
    const c = cap(state, "r");
    const e = EXPECT[sufficiency];
    expect(c.status).toBe(e.status);
    if (e.limitation) expect(c.limitations.find((l) => l.code === e.limitation)!.message).toContain(`reason for ${sufficiency}`);
    if (e.authoritative) {
      expect(amountString(c.grossCapacity)).toBe("100");
      expect(amountString(c.remaining)).toBe("70");
      expect(c.provisional).toBeNull();
    } else {
      expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
      expect(c.remaining.kind).toBe("NOT_DETERMINED");
      expect(c.effectiveRemaining.kind).toBe("NOT_DETERMINED");
      expect(amountString(c.provisional!.grossCapacity)).toBe("100");
      expect(amountString(c.provisional!.remaining)).toBe("70");
    }
    expect(c.phase3.sufficiency).toBe(sufficiency);
  });

  it("a sufficiency value outside the Phase-3 enumeration fails closed as UNSUPPORTED", () => {
    const { state } = run([rule("r", MONEY(100), { sufficiency: "SOMETHING_NEW" as RepresentationSufficiency })]);
    expect(cap(state, "r").status).toBe("UNSUPPORTED");
    expect(cap(state, "r").grossCapacity.kind).toBe("NOT_DETERMINED");
  });

  const scopeAudit = (status: string, safeToRely: boolean) => ({ entityScopeAudit: { guardVersion: "t", status, safeToRely, reasonCodes: [], rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "EMPTY" }, tagNormalization: [], before: { entityScope: [], entityScopeExcluded: [], sufficiency: "COMPLETE" }, witness: { ownExcerpt: null, citedUnitLeadIn: null, decidedBy: "NONE", signals: [] } } as never });

  it.each(["UNDERINCLUSIVE_VS_SOURCE", "AMBIGUOUS_VS_SOURCE", "UNRECOGNIZED_TAG", "UNWITNESSED"])("an entity scope the guard marked %s and not safe to rely on is REVIEW_REQUIRED with the arithmetic provisional", (status) => {
    const { state } = run([rule("r", MONEY(100), scopeAudit(status, false))], [], [usage("u1", "30", onRule("r"))]);
    const c = cap(state, "r");
    expect(c.status).toBe("REVIEW_REQUIRED");
    expect(c.entityScope!.applicability).toBe("SCOPE_NOT_SAFE_TO_RELY_ON");
    expect(c.limitations.some((l) => l.code === "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON")).toBe(true);
    expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(amountString(c.provisional!.remaining)).toBe("70");
  });

  it("safeToRely false dominates even when the audit status alone would be confirmed", () => {
    const { state } = run([rule("r", MONEY(100), scopeAudit("SOURCE_MATCH_CONFIRMED", false))]);
    expect(cap(state, "r").status).toBe("REVIEW_REQUIRED");
    expect(cap(state, "r").grossCapacity.kind).toBe("NOT_DETERMINED");
  });

  it("a confirmed, safe scope with a COMPLETE rule is the only combination that publishes an authoritative amount", () => {
    const { state } = run([rule("r", MONEY(100), scopeAudit("SOURCE_MATCH_CONFIRMED", true))]);
    expect(cap(state, "r").status).toBe("AVAILABLE");
    expect(amountString(cap(state, "r").grossCapacity)).toBe("100");
  });

  it("legal and arithmetic causes compose: the worse of the two wins and both limitations are carried", () => {
    const { state } = run([rule("r", MUL(PCT(0.1), METRIC("m-absent")), { sufficiency: "PARTIAL" })]);
    const c = cap(state, "r");
    expect(c.status).toBe("REVIEW_REQUIRED");
    expect(c.limitations.map((l) => l.code).sort()).toEqual(["MISSING_FINANCIAL_INPUT", "PHASE3_RULE_NOT_SAFE_TO_RELY_ON"]);
  });
});

// ---------------------------------------------------------------------------
// R9 - unquantified shared capacity
// ---------------------------------------------------------------------------
describe("R9 - an unquantified SHARES_CAPACITY_WITH relationship is never authoritative availability", () => {
  const stated = () => [rule("a", MONEY(100), { dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "b", description: "a shares with b" }] }), rule("b", MONEY(200))];

  it("relationship exists, no resource exists, no pool is invented, local arithmetic is provisional, effective availability is not AVAILABLE", () => {
    const { graph, state } = run(stated(), [], [usage("u1", "30", onRule("a"))]);
    expect(graph.edges.filter((e) => e.sourceRelationship === "SHARES_CAPACITY_WITH").map((e) => e.kind)).toEqual(["LEGAL_RELATIONSHIP"]);
    expect(graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")).toEqual([]);
    expect(graph.edges.filter((e) => e.kind === "MEMBER_OF_SHARED_CAP")).toEqual([]);
    expect(state.sharedConstraints).toEqual([]);
    expect(graph.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED")).toBe(true);
    for (const [id, gross, remaining] of [["a", "100", "70"], ["b", "200", "200"]] as const) {
      const c = cap(state, id);
      expect(c.status).toBe("REVIEW_REQUIRED");
      expect(c.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED")).toBe(true);
      expect(c.effectiveRemaining.kind).toBe("NOT_DETERMINED");
      expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
      expect(amountString(c.provisional!.grossCapacity)).toBe(gross);
      expect(amountString(c.provisional!.remaining)).toBe(remaining);
      expect(amountString(c.provisional!.effectiveRemaining)).toBe(remaining);
    }
    expect(JSON.stringify(state)).not.toContain("invented");
  });

  it("the same relationship backed by a quantified pool both belong to is authoritative and bounded by the pool", () => {
    const { state } = run(stated(), [sharedCap("p", MONEY(150), ["a", "b"])], [usage("u1", "30", onRule("a"))]);
    expect(cap(state, "a").status).toBe("AVAILABLE");
    expect(amountString(cap(state, "a").effectiveRemaining)).toBe("70");
    expect(cap(state, "b").status).toBe("AVAILABLE");
    expect(amountString(cap(state, "b").effectiveRemaining)).toBe("120");
  });

  it("a pool that only one side belongs to does not quantify the relationship", () => {
    const { state } = run(stated(), [sharedCap("p", MONEY(150), ["a"])], [usage("u1", "30", onRule("a"))]);
    expect(cap(state, "a").status).toBe("REVIEW_REQUIRED");
    expect(cap(state, "a").effectiveRemaining.kind).toBe("NOT_DETERMINED");
    expect(cap(state, "b").status).toBe("REVIEW_REQUIRED");
  });

  it("a share relationship Phase 3 could not resolve to a rule is carried as unresolved and still non-authoritative", () => {
    const { state } = run([rule("a", MONEY(100), { unresolvedDependencies: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRef: "some other basket", reason: "not in unit" }] } as never)]);
    expect(cap(state, "a").status).toBe("REVIEW_REQUIRED");
    expect(cap(state, "a").limitations.find((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED")!.refs).toContain("unresolved:some other basket");
  });
});

// ---------------------------------------------------------------------------
// R10 - allocation input completeness
// ---------------------------------------------------------------------------
describe("R10 - allocation completeness: 'no usage applies' is never confused with 'attribution unknown'", () => {
  const two = () => [rule("a", MONEY(100)), rule("b", MONEY(100))];

  it("1. no candidates because none are legally applicable: usage on another capacity leaves this one at a determined zero consumption", () => {
    const { state } = run(two(), [], [usage("u1", "40", onRule("b"))]);
    expect(cap(state, "a").status).toBe("AVAILABLE");
    expect(amountString(cap(state, "a").remaining)).toBe("100");
    expect(cap(state, "a").usage.kind).toBe("NOT_DETERMINED");
    expect(cap(state, "a").usageSelection).toEqual([]);
    expect(amountString(cap(state, "b").remaining)).toBe("60");
  });

  it("2. no candidates because information is missing: every capacity in scope fails closed", () => {
    const { state } = run(two(), [], [usage("u1", "40", unresolved([], "unknown"))]);
    for (const id of ["a", "b"]) { expect(cap(state, id).status).toBe("AMBIGUOUS"); expect(cap(state, id).limitations.map((l) => l.code)).toContain("ALLOCATION_INFORMATION_MISSING"); expect(cap(state, id).remaining.kind).toBe("NOT_DETERMINED"); }
  });

  it("3. one candidate: an unresolved record is still a statement that attribution was not established; the runtime never promotes it", () => {
    const { state } = run(two(), [], [usage("u1", "40", unresolved(["a"]))]);
    expect(cap(state, "a").status).toBe("AMBIGUOUS");
    expect(cap(state, "a").limitations.map((l) => l.code)).toContain("AMBIGUOUS_CONSUMPTION_ALLOCATION");
    expect(cap(state, "a").remaining.kind).toBe("NOT_DETERMINED");
    expect(cap(state, "b").status).toBe("AVAILABLE");
    expect(amountString(cap(state, "b").remaining)).toBe("100");
  });

  it("4. multiple candidates: each named capacity fails closed, none is chosen", () => {
    const { state } = run(two(), [], [usage("u1", "40", unresolved(["a", "b"]))]);
    for (const id of ["a", "b"]) { expect(cap(state, id).status).toBe("AMBIGUOUS"); expect(cap(state, id).appliedUsageIds).toEqual([]); }
    expect(state.ledgerIssues.map((i) => i.code)).toContain("UNRESOLVED_CAPACITY_PATH");
  });

  it("5. explicit selection: a record naming its capacity is applied there and nowhere else", () => {
    const { state } = run(two(), [], [usage("u1", "40", onRule("a"))]);
    expect(cap(state, "a").appliedUsageIds).toEqual(["u1"]);
    expect(amountString(cap(state, "a").remaining)).toBe("60");
    expect(cap(state, "b").appliedUsageIds).toEqual([]);
  });

  it("6. ambiguous attribution across the graph boundary: an in-graph candidate fails closed; candidates entirely outside the graph are reported, never dropped", () => {
    const mixed = run(two(), [], [usage("u1", "40", unresolved(["a", "elsewhere-1"]))]);
    expect(cap(mixed.state, "a").status).toBe("AMBIGUOUS");
    expect(cap(mixed.state, "b").status).toBe("AVAILABLE");
    resetIds();
    const outside = run(two(), [], [usage("u1", "40", unresolved(["elsewhere-1", "elsewhere-2"]))]);
    expect(outside.state.capacities.every((c) => c.status === "AVAILABLE" && amountString(c.remaining) === "100")).toBe(true);
    expect(outside.state.limitations.map((l) => l.code)).toContain("USAGE_NOT_ATTRIBUTABLE_IN_GRAPH");
    expect(outside.state.ledgerIssues.map((i) => i.code)).toContain("UNRESOLVED_CANDIDATES_NOT_IN_GRAPH");
  });
});

// ---------------------------------------------------------------------------
// R11 - snapshot ambiguity semantics
// ---------------------------------------------------------------------------
describe("R11 - snapshot binding is ambiguous only on an actual conflict", () => {
  const r1 = () => [rule("a", MUL(PCT(0.1), METRIC("m1")))];
  const r2 = () => [rule("a", MUL(PCT(0.1), METRIC("m1"))), rule("b", MUL(PCT(0.1), METRIC("m2")))];
  const snaps = (...s: { id: string; version?: string; inputs: ReturnType<typeof fact>[] }[]) =>
    snapshotInputResolver({ snapshots: s.map((x) => snapshot(x.inputs, { snapshotId: x.id, version: x.version ?? "1" })), companyId: CO, instrumentKey: INST });

  it("identical fact identity in two snapshots is a conflict", () => {
    const { state } = run(r1(), [], [], snaps({ id: "s1", inputs: [fact("m1", "1000")] }, { id: "s2", inputs: [fact("m1", "1000")] }));
    expect(state.snapshotBinding.ambiguous).toBe(true);
    expect(state.snapshotBinding.conflictingInputKeys).toEqual(["m1"]);
    expect(cap(state, "a").status).toBe("AMBIGUOUS");
  });

  it("compatible snapshot data (different facts from different snapshots) is not a conflict", () => {
    const { state } = run(r2(), [], [], snaps({ id: "s1", inputs: [fact("m1", "1000")] }, { id: "s2", inputs: [fact("m2", "2000")] }));
    expect(state.snapshotBinding).toMatchObject({ ambiguous: false, multiSnapshot: true, snapshotIds: ["s1", "s2"], conflictingInputKeys: [] });
    expect(state.snapshotBinding.snapshotSetHash).not.toBeNull();
    expect(state.capacities.map((c) => c.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
  });

  it("a missing snapshot binding is reported as absent, never as ambiguous", () => {
    const { state } = run(r1());
    expect(state.snapshotBinding).toEqual({ snapshotIds: [], snapshotVersions: [], snapshotSetHash: null, inputContractVersion: null, ambiguous: false, multiSnapshot: false, conflictingInputKeys: [] });
    expect(cap(state, "a").status).toBe("NEEDS_INPUT");
  });

  it("conflicting snapshot identities (same fact, different versions) remain a conflict; versions are opaque and never ordered", () => {
    const { state } = run(r1(), [], [], snaps({ id: "s1", version: "1", inputs: [fact("m1", "1000")] }, { id: "s1-revised", version: "2", inputs: [fact("m1", "1000")] }));
    expect(state.snapshotBinding.ambiguous).toBe(true);
    expect(cap(state, "a").grossCapacity.kind).toBe("NOT_DETERMINED");
  });

  it("conflicting financial values name the conflicting key and fail the capacity closed", () => {
    const { state } = run(r1(), [], [], snaps({ id: "s1", inputs: [fact("m1", "1000")] }, { id: "s2", inputs: [fact("m1", "5000")] }));
    expect(state.snapshotBinding.ambiguous).toBe(true);
    expect(state.snapshotBinding.conflictingInputKeys).toEqual(["m1"]);
    expect(state.limitations.find((l) => l.code === "SNAPSHOT_BINDING_AMBIGUOUS")!.refs).toEqual(["m1"]);
    expect(amountString(cap(state, "a").grossCapacity)).toBeNull();
  });

  it("permuting snapshot order changes nothing in either the benign or the conflicting case", () => {
    const benignA = run(r2(), [], [], snaps({ id: "s1", inputs: [fact("m1", "1000")] }, { id: "s2", inputs: [fact("m2", "2000")] }));
    resetIds();
    const benignB = run(r2(), [], [], snaps({ id: "s2", inputs: [fact("m2", "2000")] }, { id: "s1", inputs: [fact("m1", "1000")] }));
    expect(benignA.state.stateHash).toBe(benignB.state.stateHash);
    resetIds();
    const conflictA = run(r1(), [], [], snaps({ id: "s1", inputs: [fact("m1", "1000")] }, { id: "s2", inputs: [fact("m1", "5000")] }));
    resetIds();
    const conflictB = run(r1(), [], [], snaps({ id: "s2", inputs: [fact("m1", "5000")] }, { id: "s1", inputs: [fact("m1", "1000")] }));
    expect(conflictA.state.stateHash).toBe(conflictB.state.stateHash);
    expect(conflictA.state.snapshotBinding).toEqual(conflictB.state.snapshotBinding);
  });
});

// ---------------------------------------------------------------------------
// R12 - real cycles vs symmetric relationships
// ---------------------------------------------------------------------------
describe("R12 - cycle protection runs over evaluation dependencies only", () => {
  const legal = (type: string, target: string) => ({ relationshipType: type as never, targetRuleId: target, description: `${type} ${target}` });

  /** A resolver that knows the rules, so a RULE_REFERENCE can actually be followed by the Phase-4A evaluator. */
  const withRules = (rules: IRRule[]) => run(rules, [], [], resolver([], [], rules));

  it("A. a true directed dependency cycle is detected, reported with its path, and fails closed", () => {
    const { graph, state } = withRules([rule("a", RULE_REF("b")), rule("b", RULE_REF("a"))]);
    expect(graph.cycles.length).toBe(1);
    expect(graph.cycles[0]!.nodePath).toEqual(["capacity:rule:a", "capacity:rule:b", "capacity:rule:a"]);
    expect(graph.cycles[0]!.edgePath.map((e) => e.kind)).toEqual(["DEPENDS_ON", "DEPENDS_ON"]);
    expect(state.limitations.some((l) => l.code === "CAPACITY_GRAPH_CYCLE")).toBe(true);
    expect(state.capacities.every((c) => c.status !== "AVAILABLE" && c.grossCapacity.kind === "NOT_DETERMINED")).toBe(true);
  });

  it("B. a symmetric shared-capacity relationship is not a cycle, quantified or not", () => {
    const pair = () => [rule("a", MONEY(100), { dependsOn: [legal("SHARES_CAPACITY_WITH", "b")] }), rule("b", MONEY(100), { dependsOn: [legal("SHARES_CAPACITY_WITH", "a")] })];
    const unq = run(pair());
    expect(unq.graph.cycles).toEqual([]);
    expect(unq.state.capacities.every((c) => c.status === "REVIEW_REQUIRED")).toBe(true);
    resetIds();
    const q = run(pair(), [sharedCap("p", MONEY(150), ["a", "b"])]);
    expect(q.graph.cycles).toEqual([]);
    expect(q.state.capacities.map((c) => [c.status, amountString(c.effectiveRemaining)])).toEqual([["AVAILABLE", "100"], ["AVAILABLE", "100"]]);
  });

  it.each(["REQUIRES", "LIMITED_BY", "ALTERNATIVE_TO"])("C. a symmetric %s relationship is carried as legal structure and is not a cycle", (type) => {
    const { graph, state } = run([rule("a", MONEY(10), { dependsOn: [legal(type, "b")] }), rule("b", MONEY(20), { dependsOn: [legal(type, "a")] })]);
    expect(graph.cycles).toEqual([]);
    expect(graph.edges.filter((e) => e.sourceRelationship === type).map((e) => [e.kind, e.from, e.to])).toEqual([["LEGAL_RELATIONSHIP", "capacity:rule:a", "capacity:rule:b"], ["LEGAL_RELATIONSHIP", "capacity:rule:b", "capacity:rule:a"]]);
    expect(state.capacities.map((c) => [c.status, amountString(c.remaining)])).toEqual([["AVAILABLE", "10"], ["AVAILABLE", "20"]]);
  });

  it("D. a dependency DAG with bidirectional non-dependency metadata is a DAG", () => {
    const { graph, state } = withRules([rule("a", RULE_REF("b"), { dependsOn: [legal("REQUIRES", "b")] }), rule("b", MONEY(50), { dependsOn: [legal("REQUIRES", "a"), legal("LIMITED_BY", "a")] })]);
    expect(graph.cycles).toEqual([]);
    expect(graph.edges.filter((e) => e.kind === "DEPENDS_ON").map((e) => [e.from, e.to])).toEqual([["capacity:rule:a", "capacity:rule:b"]]);
    expect(graph.nodes.find((n) => n.ruleId === "a")!.dependsOnNodeIds).toEqual(["capacity:rule:b"]);
    expect(graph.nodes.find((n) => n.ruleId === "b")!.dependsOnNodeIds).toEqual([]);
    expect(amountString(cap(state, "a").grossCapacity)).toBe("50");
    expect(cap(state, "a").status).toBe("AVAILABLE");
  });

  it("E. a three-node real cycle is reported once with the full path and every member fails closed", () => {
    const { graph, state } = withRules([rule("a", RULE_REF("b")), rule("b", RULE_REF("c")), rule("c", RULE_REF("a"))]);
    expect(graph.cycles.length).toBe(1);
    expect(graph.cycles[0]!.nodePath.length).toBe(4);
    expect(new Set(graph.cycles[0]!.nodePath).size).toBe(3);
    expect(state.capacities.every((c) => c.status !== "AVAILABLE")).toBe(true);
    expect(state.capacities.every((c) => c.evaluation!.diagnostics.length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R13 - complexity counters
// ---------------------------------------------------------------------------
describe("R13 - operation counters are the complexity proof", () => {
  const sized = (n: number, pools: number) => {
    resetIds();
    const pad = (i: number) => String(i).padStart(4, "0");
    const rules = Array.from({ length: n }, (_, i) => rule(`r-${pad(i)}`, MONEY(100)));
    const caps = Array.from({ length: pools }, (_, p) => sharedCap(`p-${pad(p)}`, MONEY(100000), rules.filter((_, i) => i % pools === p).map((r) => r.ruleId)));
    const ledger = rules.flatMap((r, i) => [usage(`u-${pad(i)}-a`, "1", onRule(r.ruleId)), usage(`u-${pad(i)}-b`, "2", onRule(r.ruleId))]);
    const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    return state.complexity;
  };

  it("every counter is linear in the inputs across materially increasing n, with several pools", () => {
    for (const [n, pools] of [[40, 4], [80, 8], [160, 16], [320, 32]] as const) {
      const c = sized(n, pools);
      expect(c.nodesVisited).toBe(n + pools);
      expect(c.expressionsEvaluated).toBe(n + pools);
      expect(c.ledgerEntriesConsidered).toBe(2 * n);
      expect(c.ledgerEntriesExamined).toBe(2 * n);
      expect(c.ledgerEntriesApplied).toBe(2 * n);
      expect(c.edgesVisited).toBe(n);
      expect(c.sharedResourceLookups).toBe(n);
      expect(c.sharedConstraintsEvaluated).toBe(pools);
      expect(c.dependencyLookups).toBe(n + pools);
      expect(c.indexLookups).toBeLessThanOrEqual(6 * (n + pools));
      expect(c.maxDepth).toBeLessThanOrEqual(2);
    }
  });

  it("the ratio of examined ledger entries to ledger size is 1 regardless of graph size: no per-capacity rescan", () => {
    const a = sized(40, 4), b = sized(320, 32);
    expect(a.ledgerEntriesExamined / a.ledgerEntriesConsidered).toBe(1);
    expect(b.ledgerEntriesExamined / b.ledgerEntriesConsidered).toBe(1);
  });
});
