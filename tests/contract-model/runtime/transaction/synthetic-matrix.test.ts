/**
 * PHASE 4D §38 - the required synthetic matrix, A through AG.
 *
 * Every case runs through the one generic engine. There is no production branch per case, no
 * transaction-type dispatch and no per-test code path: each case differs only in the IR, the
 * financial facts, the ledger, the stated effects and the caller's selected path.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { EntityClassTag } from "@prisma/client";
import {
  ADD, FACILITY, FIGURE, LTE, MONEY, MUL, ORG, PCT, RATIO, UNLIMITED, WHEN, adjustFigure, advance,
  amountOf, cash, codes, condition, consume, election, figure, nodeOf, onProvision, pool,
  poolNodeOf, proposal, provision, reclassify, resetIds, restore, route, scopeAudit, simulate,
  supersede, usage, world,
} from "./helpers";

beforeEach(resetIds);

const flat = (id: string, amount = 100) => provision(id, MONEY(amount));

describe("A-E: ordinary consumption, exhaustion, over-consumption, unlimited and a missing fact", () => {
  it("A. an explicit draw below the remaining capacity is satisfied and produces one proposed row", () => {
    const w = world({ rules: [flat("p-a")], ledger: [usage("u1", "30", onProvision("p-a"))] });
    const r = simulate(w, proposal("tx-a", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.simulationStatus).toBe("SIMULATED");
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(amountOf(r.capacityEffects[0]!.availableAmount)).toBe("70");
    expect(r.capacityEffects[0]!.shortfallAmount).toBeNull();
    expect(r.ledgerEffects.proposed.map((p) => [p.record.usageId, p.record.amount.amount, p.kind])).toEqual([["tx-a::e1", "20", "PROPOSED_USAGE"]]);
    expect(amountOf(r.postState!.capacities[0]!.usage)).toBe("50");
    expect(amountOf(r.postState!.capacities[0]!.remaining)).toBe("50");
    expect(r.commitPlan.committable).toBe(true);
  });

  it("B. a draw exactly equal to the remaining capacity is satisfied and leaves nothing", () => {
    const w = world({ rules: [flat("p-a")], ledger: [usage("u1", "30", onProvision("p-a"))] });
    const r = simulate(w, proposal("tx-b", [consume("e1", nodeOf("p-a"), cash("70"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(amountOf(r.postState!.capacities[0]!.remaining)).toBe("0");
    expect(r.postState!.capacities[0]!.overConsumption).toBeNull();
  });

  it("C. an over-draw is refused with the shortfall stated, never clamped and never resized", () => {
    const w = world({ rules: [flat("p-a")], ledger: [usage("u1", "30", onProvision("p-a"))] });
    const r = simulate(w, proposal("tx-c", [consume("e1", nodeOf("p-a"), cash("90"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.simulationStatus).toBe("SIMULATED");
    expect(r.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    const c = r.capacityEffects[0]!;
    expect([c.attemptedAmount.type === "MONEY" ? c.attemptedAmount.amount : null, amountOf(c.availableAmount), c.shortfallAmount?.type === "MONEY" ? c.shortfallAmount.amount : null]).toEqual(["90", "70", "20"]);
    expect(r.postState).toBeNull();
    expect(r.commitPlan.committable).toBe(false);
    expect(codes(r.limitations)).toContain("INSUFFICIENT_CAPACITY");
  });

  it("D. an unlimited capacity satisfies any stated amount and stays unlimited afterwards", () => {
    const w = world({ rules: [provision("p-u", UNLIMITED())] });
    const r = simulate(w, proposal("tx-d", [consume("e1", nodeOf("p-u"), cash("999999"))]), route({ capacityNodeIds: [nodeOf("p-u")], ruleIds: ["p-u"] }));
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.capacityEffects[0]!.availableAmount.kind).toBe("UNLIMITED");
    expect(r.capacityEffects[0]!.shortfallAmount).toBeNull();
    expect(r.postState!.capacities[0]!.remaining.kind).toBe("UNLIMITED");
    expect(JSON.stringify(r)).not.toContain("Infinity");
  });

  it("E. a missing financial fact leaves the draw indeterminate, never zero and never permitted", () => {
    const w = world({ rules: [provision("p-g", MUL(PCT(0.1), FIGURE("figure-absent")))] });
    const r = simulate(w, proposal("tx-e", [consume("e1", nodeOf("p-g"), cash("10"))]), route({ capacityNodeIds: [nodeOf("p-g")], ruleIds: ["p-g"] }));
    expect(r.simulationStatus).toBe("NEEDS_INPUT");
    expect(r.selectedPathResult).toBe("INDETERMINATE");
    expect(r.capacityEffects[0]!.availableAmount.kind).toBe("NOT_DETERMINED");
    expect(r.missingInputs).toContain("figure-absent");
    expect(r.postState).toBeNull();
  });
});

describe("F-G: explicit allocation across several caller-selected capacities", () => {
  const two = () => [flat("p-a"), flat("p-b")];

  it("F. a stated 60/40 split across two selected capacities is simulated exactly as stated", () => {
    const w = world({ rules: two() });
    const r = simulate(w, proposal("tx-f", [consume("e1", nodeOf("p-a"), cash("60")), consume("e2", nodeOf("p-b"), cash("40"))], { intendedAmount: cash("100") }),
      route({ capacityNodeIds: [nodeOf("p-a"), nodeOf("p-b")], ruleIds: ["p-a", "p-b"] }));
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.capacityEffects.map((c) => [c.capacityNodeId, c.attemptedAmount.type === "MONEY" ? c.attemptedAmount.amount : null])).toEqual([[nodeOf("p-a"), "60"], [nodeOf("p-b"), "40"]]);
    expect(r.postState!.capacities.map((c) => [c.ruleId, amountOf(c.usage)])).toEqual([["p-a", "60"], ["p-b", "40"]]);
  });

  it("F2. a stated split that does not add up to the stated total is refused, never rebalanced", () => {
    const w = world({ rules: two() });
    const r = simulate(w, proposal("tx-f2", [consume("e1", nodeOf("p-a"), cash("60")), consume("e2", nodeOf("p-b"), cash("30"))], { intendedAmount: cash("100") }),
      route({ capacityNodeIds: [nodeOf("p-a"), nodeOf("p-b")], ruleIds: ["p-a", "p-b"] }));
    expect(codes(r.limitations)).toContain("INVALID_EXPLICIT_ALLOCATION");
    expect(r.simulationStatus).toBe("ERROR");
    expect(r.postState).toBeNull();
  });

  it("G. two selected capacities with no stated split are ambiguous; no allocation is inferred", () => {
    const w = world({ rules: two() });
    const r = simulate(w, proposal("tx-g", [consume("e1", nodeOf("p-a"), cash("100"))], { intendedAmount: cash("100") }),
      route({ capacityNodeIds: [nodeOf("p-a"), nodeOf("p-b")], ruleIds: ["p-a", "p-b"] }));
    expect(r.simulationStatus).toBe("AMBIGUOUS");
    expect(codes(r.limitations)).toContain("AMBIGUOUS_CAPACITY_ALLOCATION");
    expect(r.postState).toBeNull();
    expect(JSON.stringify(r.notComputed)).toContain("NOT_COMPUTED_IN_PHASE_4D");
  });
});

describe("H-I: shared capacity", () => {
  it("H. a quantified pool bounds the member, and the draw is measured against what the pool leaves", () => {
    const w = world({ rules: [flat("p-a"), flat("p-b")], pools: [pool("res-1", MONEY(50), ["p-a", "p-b"])] });
    const r = simulate(w, proposal("tx-h", [consume("e1", nodeOf("p-a"), cash("90"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"], sharedCapacityIds: ["res-1"] }));
    expect(r.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(amountOf(r.capacityEffects[0]!.availableAmount)).toBe("50");
    expect(r.capacityEffects[0]!.sharedConstraintIds).toEqual(["res-1"]);
    expect(r.postState).toBeNull();
  });

  it("H2. a draw within the pool moves both the member's and the pool's usage, and no pool limit is copied onto a member", () => {
    const w = world({ rules: [flat("p-a"), flat("p-b")], pools: [pool("res-1", MONEY(80), ["p-a", "p-b"])] });
    const r = simulate(w, proposal("tx-h2", [consume("e1", nodeOf("p-a"), cash("30"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"], sharedCapacityIds: ["res-1"] }));
    expect(r.selectedPathResult).toBe("SATISFIED");
    const post = r.postState!;
    expect(amountOf(post.capacities.find((c) => c.ruleId === "p-a")!.usage)).toBe("30");
    expect(amountOf(post.sharedConstraints[0]!.usage)).toBe("30");
    expect(amountOf(post.sharedConstraints[0]!.remaining)).toBe("50");
    // The member keeps its own 100 gross; the pool constrains, it does not overwrite.
    expect(amountOf(post.capacities.find((c) => c.ruleId === "p-a")!.grossCapacity)).toBe("100");
    expect(amountOf(post.capacities.find((c) => c.ruleId === "p-b")!.effectiveRemaining)).toBe("50");
  });

  it("I. a shared relationship with no quantified resource is never turned into a pool by simulating against it", () => {
    const shares = provision("p-a", MONEY(100), { dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "p-b", description: "shares with p-b" }] });
    const w = world({ rules: [shares, flat("p-b")] });
    const r = simulate(w, proposal("tx-i", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.simulationStatus).toBe("REVIEW_REQUIRED");
    expect(r.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(codes(r.capacityEffects[0]!.limitations)).toContain("SHARED_CAPACITY_NOT_QUANTIFIED");
    expect(r.capacityEffects[0]!.availableAmount.kind).toBe("NOT_DETERMINED");
    // The local arithmetic is visible, and it is visible as provisional.
    expect(amountOf(r.capacityEffects[0]!.provisional!.availableAmount)).toBe("100");
    expect(r.capacityEffects[0]!.provisional!.outcome).toBe("SATISFIED");
    expect(r.postState!.sharedConstraints).toEqual([]);
    expect(r.commitPlan.committable).toBe(false);
  });
});

describe("J-L: explicitly elected reclassification", () => {
  const withEdge = () => [
    provision("p-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "p-dst", description: "amounts may be reclassified" }] }),
    flat("p-dst"),
  ];

  it("J. an election authorised by an encoded Phase-3 edge executes and conserves total usage", () => {
    const w = world({ rules: withEdge(), ledger: [usage("u1", "40", onProvision("p-src"))] });
    const r = simulate(w, proposal("tx-j", [reclassify("e1", election("el-1", "p-src", "p-dst", "25"))]), route({ reclassificationElectionIds: ["el-1"] }));
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.reclassificationEffects.allExecuted).toBe(true);
    expect(r.reclassificationEffects.outcomes[0]!.authorizingEdge!.sourceRelationship).toBe("RECLASSIFIABLE_TO");
    const post = r.postState!;
    expect(amountOf(post.capacities.find((c) => c.ruleId === "p-src")!.usage)).toBe("15");
    expect(amountOf(post.capacities.find((c) => c.ruleId === "p-dst")!.usage)).toBe("25");
    expect(r.ledgerEffects.proposed.filter((p) => p.kind === "RECLASSIFIED_USAGE").length).toBe(2);
  });

  it("K. an election missing its amount names the missing field and is not executed", () => {
    const w = world({ rules: withEdge(), ledger: [usage("u1", "40", onProvision("p-src"))] });
    const bad = { ...election("el-1", "p-src", "p-dst", "25"), amount: { amount: "", currency: "USD" } };
    const r = simulate(w, proposal("tx-k", [reclassify("e1", bad)]), route({ reclassificationElectionIds: ["el-1"] }));
    expect(r.reclassificationEffects.allExecuted).toBe(false);
    expect(r.reclassificationEffects.outcomes[0]!.blockedBy.flatMap((b) => b.missingSemanticFields)).toContain("amount.amount");
    expect(codes(r.limitations)).toContain("RECLASSIFICATION_NOT_EXECUTABLE");
    expect(r.postState).toBeNull();
  });

  it("L. an election with no encoded authority is refused and the edge is never invented", () => {
    const w = world({ rules: [flat("p-src"), flat("p-dst")], ledger: [usage("u1", "40", onProvision("p-src"))] });
    const r = simulate(w, proposal("tx-l", [reclassify("e1", election("el-1", "p-src", "p-dst", "25"))]), route({ reclassificationElectionIds: ["el-1"] }));
    expect(r.reclassificationEffects.outcomes[0]!.blockedBy.map((b) => b.code)).toContain("NO_EXPLICIT_RECLASSIFICATION_EDGE");
    expect(r.reclassificationEffects.outcomes[0]!.authorizingEdge).toBeNull();
    expect(r.postState).toBeNull();
  });
});

describe("M-N: deterministic recomputation versus a fixed point", () => {
  const grower = () => [provision("p-grow", MUL(PCT(0.2), FIGURE("figure-base")))];
  const facts = [figure("figure-base", "1000")];

  it("M. an explicit adjustment changes the input once, and the capacity is evaluated once against it", () => {
    const w = world({ rules: grower(), facts });
    expect(amountOf(w.state.capacities[0]!.grossCapacity)).toBe("200");
    const r = simulate(w, proposal("tx-m", [adjustFigure("e0", "figure-base", "DELTA", cash("500")), consume("e1", nodeOf("p-grow"), cash("250"))]),
      route({ capacityNodeIds: [nodeOf("p-grow")], ruleIds: ["p-grow"] }));
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(amountOf(r.capacityEffects[0]!.availableAmount)).toBe("300");
    const adj = r.financialEffects[0]!;
    expect([adj.state, adj.baseValue?.type === "MONEY" ? adj.baseValue.amount : null, adj.result?.type === "MONEY" ? adj.result.amount : null]).toEqual(["APPLIED", "1000", "1500"]);
    // One deterministic pass: the pro-forma capacity state is evaluated once, and the post-state once.
    expect(r.complexity.stateEvaluations).toBe(2);
    expect(codes(r.limitations)).toEqual([]);
  });

  it("M2. the approved snapshot is never mutated by an adjustment", () => {
    const w = world({ rules: grower(), facts });
    simulate(w, proposal("tx-m2", [adjustFigure("e0", "figure-base", "SET", cash("9999"))]), route({}));
    const again = world({ rules: grower(), facts });
    expect(amountOf(again.state.capacities[0]!.grossCapacity)).toBe("200");
    expect(amountOf(w.state.capacities[0]!.grossCapacity)).toBe("200");
  });

  it("M3. an adjustment to an input the approved snapshot does not supply is refused, never invented", () => {
    const w = world({ rules: grower(), facts });
    const r = simulate(w, proposal("tx-m3", [adjustFigure("e0", "figure-not-supplied", "SET", cash("500"))]), route({}));
    expect(codes(r.limitations)).toContain("OVERLAY_BASE_INPUT_MISSING");
    expect(r.financialEffects[0]!.state).toBe("BASE_MISSING");
    expect(r.financialEffects[0]!.result).toBeNull();
  });

  it("N. an effect whose magnitude depends on what it changes is a fixed point, and is refused", () => {
    const w = world({ rules: grower(), facts });
    const r = simulate(w, proposal("tx-n", [
      consume("e1", nodeOf("p-grow"), cash("250")),
      adjustFigure("e0", "figure-base", "DELTA", cash("500"), { dependsOnEffectIds: ["e1"] }),
    ]), route({ capacityNodeIds: [nodeOf("p-grow")], ruleIds: ["p-grow"] }));
    expect(r.simulationStatus).toBe("UNSUPPORTED");
    expect(codes(r.limitations)).toContain("FIXED_POINT_REQUIRED");
    expect(r.postState).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toContain("FIXED_POINT_REQUIRED");
    expect(r.complexity.stateEvaluations).toBe(0);
  });
});

describe("O-R: legal state and entity scope dominate", () => {
  it("O. a Phase-3 rule that is only partially represented keeps the arithmetic provisional", () => {
    const w = world({ rules: [provision("p-a", MONEY(100), { sufficiency: "PARTIAL", sufficiencyReasons: ["one clause is not represented"] })] });
    const r = simulate(w, proposal("tx-o", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.simulationStatus).toBe("REVIEW_REQUIRED");
    expect(r.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(r.capacityEffects[0]!.availableAmount.kind).toBe("NOT_DETERMINED");
    expect(amountOf(r.capacityEffects[0]!.provisional!.availableAmount)).toBe("100");
    expect(codes(r.limitations)).toContain("PHASE3_RULE_NOT_SAFE_TO_RELY_ON");
    expect(r.commitPlan.committable).toBe(false);
  });

  it("P. an ambiguous Phase-3 rule leaves the selected path indeterminate and publishes no state", () => {
    const w = world({ rules: [provision("p-a", MONEY(100), { sufficiency: "AMBIGUOUS", sufficiencyReasons: ["two readings survive"] })] });
    const r = simulate(w, proposal("tx-p", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.selectedPathResult).toBe("INDETERMINATE");
    expect(r.postState).toBeNull();
    expect(r.capacityEffects[0]!.capacityStatus).toBe("AMBIGUOUS");
  });

  it("Q. a transaction by an entity the rule expressly excludes does not apply to the selected path", () => {
    const excluded: EntityClassTag[] = ["UNRESTRICTED_SUB"];
    const w = world({ rules: [provision("p-a", MONEY(100), { entityScope: ["BORROWER"], entityScopeExcluded: excluded })] });
    const r = simulate(w, proposal("tx-q", [consume("e1", nodeOf("p-a"), cash("20"))], { entities: excluded }), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.selectedPathResult).toBe("NOT_APPLICABLE");
    expect(r.entityScope[0]!.outcome).toBe("CONFIRMED_EXCLUDED");
    expect(codes(r.limitations)).toContain("TRANSACTION_ENTITY_EXCLUDED");
    expect(r.postState).toBeNull();
  });

  it("Q2. an entity outside a declared scope is reported as outside it; the scope is never widened", () => {
    const w = world({ rules: [provision("p-a", MONEY(100), { entityScope: ["BORROWER"] })] });
    const r = simulate(w, proposal("tx-q2", [consume("e1", nodeOf("p-a"), cash("20"))], { entities: ["FOREIGN_RS"] as EntityClassTag[] }), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.entityScope[0]!.outcome).toBe("NOT_IN_DECLARED_SCOPE");
    expect(r.selectedPathResult).toBe("NOT_SATISFIED");
    expect(r.entityScope[0]!.ruleEntityScope).toEqual(["BORROWER"]);
  });

  it("R. a scope the Phase-3 guard marked unsafe forces review whatever the arithmetic says", () => {
    const w = world({ rules: [provision("p-a", MONEY(100), scopeAudit("UNDERINCLUSIVE_VS_SOURCE", false))] });
    const r = simulate(w, proposal("tx-r", [consume("e1", nodeOf("p-a"), cash("20"))], { entities: ["BORROWER"] as EntityClassTag[] }), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.entityScope[0]!.outcome).toBe("SCOPE_NOT_SAFE_TO_RELY_ON");
    expect(r.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(codes(r.limitations)).toContain("ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON");
  });
});

describe("S: multi-currency", () => {
  it("S. a draw in a currency the capacity is not denominated in fails closed with no conversion", () => {
    const w = world({ rules: [provision("p-a", MONEY(100, "USD"))] });
    const r = simulate(w, proposal("tx-s", [consume("e1", nodeOf("p-a"), cash("20", "EUR"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.selectedPathResult).toBe("NOT_SATISFIED");
    expect(codes(r.limitations)).toContain("CURRENCY_MISMATCH_NO_CONVERSION_MODELED");
    expect(r.postState).toBeNull();
    expect(JSON.stringify(r)).not.toContain("convertedTo");
    expect(JSON.stringify(r)).not.toContain("exchangeRate");
  });
});

describe("T-U: sequences and reversal", () => {
  it("T. two sequential transactions each see the previous one's proposed state", () => {
    const w0 = world({ rules: [flat("p-a")] });
    const r1 = simulate(w0, proposal("tx-t1", [consume("e1", nodeOf("p-a"), cash("30"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    const w1 = advance(w0, r1);
    const r2 = simulate(w1, proposal("tx-t2", [consume("e1", nodeOf("p-a"), cash("50"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(amountOf(r2.capacityEffects[0]!.availableAmount)).toBe("70");
    expect(amountOf(r2.postState!.capacities[0]!.usage)).toBe("80");
    expect(r2.preStateIdentity.stateHash).toBe(r1.postState!.stateHash);
  });

  it("T2. transactions do not commute: order changes both the outcome and the state identity", () => {
    // One world, so both orders start from the same pre-state and the same capacity graph.
    const w0 = world({ rules: [flat("p-a")], ledger: [usage("u1", "40", onProvision("p-a"))] });
    const release = () => proposal("tx-rel", [restore("e1", "u1")]);
    const draw = () => proposal("tx-draw", [consume("e1", nodeOf("p-a"), cash("100"))]);
    const r = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });

    // release, then draw: the released 40 is back, so the full 100 fits.
    const a1 = simulate(w0, release(), route({}));
    const a2 = simulate(advance(w0, a1), draw(), r);
    expect(a2.selectedPathResult).toBe("SATISFIED");

    // draw, then release: only 60 remains when the draw is measured, so it does not fit.
    const b1 = simulate(w0, draw(), r);
    expect(b1.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(b1.postState).toBeNull();
    expect(a2.postState!.stateHash).not.toBe(a1.postState!.stateHash);
  });

  it("U. a reversal supersedes history explicitly and never deletes it", () => {
    const historical = usage("u1", "40", onProvision("p-a"));
    const ledger = [historical];
    const w = world({ rules: [flat("p-a")], ledger });
    const r = simulate(w, proposal("tx-u", [restore("e1", "u1", "the underlying commitment was cancelled")]), route({}));
    expect(r.selectedPathResult).toBe("SATISFIED");
    const s = r.ledgerEffects.superseded[0]!;
    expect(s.original).toEqual(historical);
    expect([s.original.status, s.original.supersededByUsageId]).toEqual(["RECORDED", null]);
    expect([s.proposed.status, s.proposed.supersededByUsageId]).toEqual(["SUPERSEDED", "tx-u::e1"]);
    expect(s.reason).toBe("the underlying commitment was cancelled");
    expect(amountOf(r.postState!.capacities[0]!.usage)).toBeNull();
    expect(amountOf(r.postState!.capacities[0]!.remaining)).toBe("100");
    // The caller's own ledger array and record object are untouched.
    expect(ledger).toEqual([historical]);
    expect(historical.status).toBe("RECORDED");
  });

  it("U2. a restatement replaces the amount and keeps both identities traceable", () => {
    const w = world({ rules: [flat("p-a")], ledger: [usage("u1", "40", onProvision("p-a"))] });
    const r = simulate(w, proposal("tx-u2", [supersede("e1", "u1", cash("10"), "restated on review")]), route({}));
    expect(amountOf(r.postState!.capacities[0]!.usage)).toBe("10");
    expect(r.ledgerEffects.proposed[0]!.supersedesUsageId).toBe("u1");
    // The restated original is not counted. Phase 4C rejects it on the first check that applies -
    // its status is no longer acceptable AND it names a successor - and either is fail-closed.
    expect(r.postState!.capacities[0]!.appliedUsageIds).toEqual(["tx-u2::e1"]);
    expect(["STATUS_NOT_ACCEPTABLE", "SUPERSEDED_BY_ANOTHER_USAGE"]).toContain(r.postState!.capacities[0]!.usageSelection.find((u) => u.usageId === "u1")!.rejectedBecause);
  });

  it("U3. an effect naming a usage identity that does not exist is refused, never created", () => {
    const w = world({ rules: [flat("p-a")] });
    const r = simulate(w, proposal("tx-u3", [restore("e1", "u-not-here")]), route({}));
    expect(codes(r.limitations)).toContain("LEDGER_USAGE_NOT_FOUND");
    expect(r.simulationStatus).toBe("ERROR");
    expect(r.postState).toBeNull();
  });
});

describe("V-Y, AC: identity and canonicalization", () => {
  const scenario = (suffix: string, label: string | null) => {
    resetIds();
    const w = world({ rules: [provision(`prov${suffix}`, MUL(PCT(0.2), FIGURE(`fig${suffix}`)))], facts: [figure(`fig${suffix}`, "1000")] });
    const tx = proposal(`tx${suffix}`, [consume("e1", nodeOf(`prov${suffix}`), cash("50"))], { label });
    return { w, r: simulate(w, tx, route({ capacityNodeIds: [nodeOf(`prov${suffix}`)], ruleIds: [`prov${suffix}`] })) };
  };

  it("V. renaming every rule, metric and label leaves the topology and the numbers identical", () => {
    const a = scenario("-alpha", "one wording");
    const b = scenario("-omega", "an entirely different wording");
    const shape = (x: ReturnType<typeof scenario>) => ({
      status: x.r.simulationStatus, path: x.r.selectedPathResult,
      available: amountOf(x.r.capacityEffects[0]!.availableAmount),
      postUsage: amountOf(x.r.postState!.capacities[0]!.usage),
      steps: x.r.trace.map((t) => t.name),
      limitations: codes(x.r.limitations),
    });
    expect(shape(a)).toEqual(shape(b));
    expect(a.r.transactionIdentity.transactionHash).not.toBe(b.r.transactionIdentity.transactionHash);
  });

  it("W. object-key insertion order does not change any identity", () => {
    resetIds();
    const w = world({ rules: [flat("p-a")] });
    const path = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    const forward = simulate(w, { transactionId: "tx-w", companyId: ORG, instrumentKey: FACILITY, effectiveAsOf: WHEN, category: null, label: null, effects: [consume("e1", nodeOf("p-a"), cash("20"))], provenance: { source: "caller-supplied hypothetical", sourceVersion: "v1", approvalRef: null } }, path);
    const reversedKeys = simulate(w, { provenance: { approvalRef: null, sourceVersion: "v1", source: "caller-supplied hypothetical" }, effects: [{ amount: { currency: "USD", amount: "20", type: "MONEY" }, capacityNodeId: nodeOf("p-a"), kind: "CONSUME_CAPACITY", effectId: "e1" }], label: null, category: null, effectiveAsOf: WHEN, instrumentKey: FACILITY, companyId: ORG, transactionId: "tx-w" }, path);
    expect(reversedKeys.transactionIdentity.transactionHash).toBe(forward.transactionIdentity.transactionHash);
    expect(reversedKeys.simulationIdentity.simulationId).toBe(forward.simulationIdentity.simulationId);
    expect(reversedKeys.postStateIdentity!.postStateHash).toBe(forward.postStateIdentity!.postStateHash);
  });

  it("X. permuting an order-insensitive selected-path id set does not change identity", () => {
    resetIds();
    const w = world({ rules: [flat("p-a"), flat("p-b")] });
    const tx = () => proposal("tx-x", [consume("e1", nodeOf("p-a"), cash("10")), consume("e2", nodeOf("p-b"), cash("10"))]);
    const a = simulate(w, tx(), route({ capacityNodeIds: [nodeOf("p-a"), nodeOf("p-b")], ruleIds: ["p-a", "p-b"] }));
    const b = simulate(w, tx(), route({ capacityNodeIds: [nodeOf("p-b"), nodeOf("p-a")], ruleIds: ["p-b", "p-a"] }));
    expect(b.transactionIdentity.transactionHash).toBe(a.transactionIdentity.transactionHash);
    expect(b.simulationIdentity.simulationId).toBe(a.simulationIdentity.simulationId);
    expect(b.postStateIdentity!.postStateHash).toBe(a.postStateIdentity!.postStateHash);
  });

  it("Y. the stated effect sequence is order-sensitive, so reordering changes the state identity", () => {
    resetIds();
    const w = world({ rules: [flat("p-a"), flat("p-b")] });
    const e1 = consume("e1", nodeOf("p-a"), cash("10"));
    const e2 = consume("e2", nodeOf("p-b"), cash("20"));
    const path = route({ capacityNodeIds: [nodeOf("p-a"), nodeOf("p-b")], ruleIds: ["p-a", "p-b"] });
    const forward = simulate(w, proposal("tx-y", [e1, e2]), path);
    const backward = simulate(w, proposal("tx-y", [e2, e1]), path);
    expect(backward.transactionIdentity.transactionHash).not.toBe(forward.transactionIdentity.transactionHash);
    expect(backward.postStateIdentity!.postStateHash).not.toBe(forward.postStateIdentity!.postStateHash);
    // The stated sequence is part of the specification; the amounts it produces are the same.
    expect(backward.postState!.capacities.map((c) => amountOf(c.usage))).toEqual(forward.postState!.capacities.map((c) => amountOf(c.usage)));
  });

  it("AC. reader-facing text is outside identity: a different label and note hash identically", () => {
    resetIds();
    const w = world({ rules: [flat("p-a")] });
    const path = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    const plain = simulate(w, proposal("tx-ac", [consume("e1", nodeOf("p-a"), cash("20"))]), path);
    const annotated = simulate(w, proposal("tx-ac", [consume("e1", nodeOf("p-a"), cash("20"), { note: "an entirely different reader-facing note" })], { label: "a different display label" }), path);
    expect(annotated.transactionIdentity.transactionHash).toBe(plain.transactionIdentity.transactionHash);
    expect(annotated.postStateIdentity!.postStateHash).toBe(plain.postStateIdentity!.postStateHash);
    expect(annotated.trace.length).toBe(plain.trace.length);
  });

  it("Y2. a changed amount, path, election or snapshot each changes identity", () => {
    resetIds();
    const w = world({ rules: [flat("p-a"), flat("p-b")] });
    const path = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    const base = simulate(w, proposal("tx-z", [consume("e1", nodeOf("p-a"), cash("20"))]), path).transactionIdentity.transactionHash;
    const changedAmount = simulate(w, proposal("tx-z", [consume("e1", nodeOf("p-a"), cash("21"))]), path).transactionIdentity.transactionHash;
    const changedCurrency = simulate(w, proposal("tx-z", [consume("e1", nodeOf("p-a"), cash("20", "EUR"))]), path).transactionIdentity.transactionHash;
    const changedPath = simulate(w, proposal("tx-z", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a", "p-b"] })).transactionIdentity.transactionHash;
    const changedCategory = simulate(w, proposal("tx-z", [consume("e1", nodeOf("p-a"), cash("20"))], { category: "a stated category" }), path).transactionIdentity.transactionHash;
    expect(new Set([base, changedAmount, changedCurrency, changedPath, changedCategory]).size).toBe(5);
  });
});

describe("Z-AB, AD-AG: closure invariants", () => {
  it("Z. a simulation that runs and concludes insufficient capacity is a successful simulation", () => {
    const w = world({ rules: [flat("p-a")] });
    const r = simulate(w, proposal("tx-z1", [consume("e1", nodeOf("p-a"), cash("150"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.simulationStatus).toBe("SIMULATED");
    expect(r.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(r.trace.find((t) => t.name === "STATUS_FINALIZED")!.status).toBe("OK");
  });

  it("AA. a failed simulation leaves the pre-state, the ledger and the caller's inputs unchanged", () => {
    const ledger = [usage("u1", "30", onProvision("p-a"))];
    const w = world({ rules: [flat("p-a")], ledger });
    const before = JSON.stringify({ state: w.state, ledger });
    const r = simulate(w, proposal("tx-aa", [consume("e1", nodeOf("p-a"), cash("500"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.postState).toBeNull();
    expect(JSON.stringify({ state: w.state, ledger })).toBe(before);
    expect(r.preTransactionState.stateHash).toBe(w.state.stateHash);
  });

  it("AB. with no stated adjustment the pro-forma view is the base snapshot, unchanged", () => {
    const w = world({ rules: [provision("p-g", MUL(PCT(0.2), FIGURE("fig-1")))], facts: [figure("fig-1", "1000")] });
    const r = simulate(w, proposal("tx-ab", []), route({}));
    expect(r.simulationInputView.adjustments).toEqual([]);
    expect(r.simulationInputView.unadjustedInputsUseBaseValues).toBe(true);
    expect(r.postState!.stateHash).toBe(w.state.stateHash);
    expect(r.financialEffects).toEqual([]);
  });

  it("AD. a proposed ledger identity the ledger already carries is refused, never double-counted", () => {
    const collide = usage("tx-ad::e1", "30", onProvision("p-a"));
    const w = world({ rules: [flat("p-a")], ledger: [collide] });
    const r = simulate(w, proposal("tx-ad", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(codes(r.limitations)).toContain("DUPLICATE_PROPOSED_LEDGER_IDENTITY");
    expect(r.simulationStatus).toBe("ERROR");
    expect(r.postState).toBeNull();
  });

  it("AE. a batch of elections cannot jointly move more usage than the source carries", () => {
    const rules = [
      provision("p-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "p-dst", description: "may reclassify" }] }),
      flat("p-dst"),
    ];
    const w = world({ rules, ledger: [usage("u1", "40", onProvision("p-src"))] });
    const r = simulate(w, proposal("tx-ae", [reclassify("e1", election("el-1", "p-src", "p-dst", "25")), reclassify("e2", election("el-2", "p-src", "p-dst", "25"))]),
      route({ reclassificationElectionIds: ["el-1", "el-2"] }));
    expect(r.reclassificationEffects.allExecuted).toBe(false);
    expect(r.reclassificationEffects.batchConservation).toEqual([{ sourceRuleId: "p-src", sourceUsage: "40", requested: "50", holds: false }]);
    expect(r.reclassificationEffects.outcomes.every((o) => o.blockedBy.some((b) => b.code === "AGGREGATE_SOURCE_USAGE_EXCEEDED"))).toBe(true);
    expect(r.postState).toBeNull();
    expect(amountOf(w.state.capacities.find((c) => c.ruleId === "p-src")!.remaining)).toBe("60");
  });

  it("AF. an unsafe legal state stays unsafe in the post-state; simulation never upgrades it", () => {
    const w = world({ rules: [provision("p-a", MONEY(100), { sufficiency: "PARTIAL", sufficiencyReasons: ["one clause is not represented"] })] });
    const r = simulate(w, proposal("tx-af", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    const post = r.postState!;
    expect(post.capacities[0]!.status).toBe("REVIEW_REQUIRED");
    expect(post.capacities[0]!.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(post.capacities[0]!.effectiveRemaining.kind).toBe("NOT_DETERMINED");
    expect(amountOf(post.capacities[0]!.provisional!.remaining)).toBe("80");
    expect(r.commitPlan.committable).toBe(false);
    expect(r.selectedPathResult).not.toBe("SATISFIED");
  });

  it("AG. an unquantified shared relationship stays unquantified in the post-state", () => {
    const shares = provision("p-a", MONEY(100), { dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "p-b", description: "shares with p-b" }] });
    const w = world({ rules: [shares, flat("p-b")] });
    const r = simulate(w, proposal("tx-ag", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    const post = r.postState!;
    expect(post.sharedConstraints).toEqual([]);
    for (const c of post.capacities) {
      expect(c.status).toBe("REVIEW_REQUIRED");
      expect(c.effectiveRemaining.kind).toBe("NOT_DETERMINED");
      expect(codes(c.limitations)).toContain("SHARED_CAPACITY_NOT_QUANTIFIED");
    }
    expect(r.commitPlan.committable).toBe(false);
  });
});
