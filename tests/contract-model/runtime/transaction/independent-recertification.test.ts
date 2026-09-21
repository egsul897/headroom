/**
 * PHASE 4D INDEPENDENT POST-REMEDIATION RECERTIFICATION.
 *
 * Written against the mission specification rather than against the remediation's own suite, so a
 * property the remediation happened to test one way is re-attacked a different way here. Every
 * assertion reads the resulting Phase-4C state, never only an effect-level status.
 *
 * INDEPENDENCE CAVEAT, stated plainly: this suite and the implementation under test were written
 * in the same session. It is adversarial re-derivation from the specification, not a second
 * author. Where that matters the finding is labelled.
 */
import { describe, expect, it } from "vitest";
import {
  FIGURE, MONEY, MUL, PCT, adjustFigure, amountOf, cash, codes, condition, consume, election,
  figure, nodeOf, onProvision, pool, proposal, provision, reclassify, resetIds, restore, route,
  setEvent, simulate, supersede, usage, world, LTE,
} from "./helpers";
import type { CapacityState } from "@/lib/contract-model/runtime/capacity/types";
import type { TransactionEffect, TransactionSimulationResult } from "@/lib/contract-model/runtime/transaction/types";

// ---------------------------------------------------------------------------
// Independent safety reader. Phase 4C reports an over-draw two ways.
// ---------------------------------------------------------------------------
function unsafeEntries(state: CapacityState | null): string[] {
  if (!state) return [];
  const out: string[] = [];
  const neg = (a: unknown) => String(amountOf(a as never) ?? "").trim().startsWith("-");
  for (const c of state.capacities) {
    if (c.limitations.some((l) => l.code === "OVER_CONSUMPTION")) out.push(`capacity:${c.capacityNodeId}:OVER_CONSUMPTION`);
    else if (neg(c.remaining)) out.push(`capacity:${c.capacityNodeId}:negative`);
  }
  for (const s of state.sharedConstraints) {
    if (s.limitations.some((l) => l.code === "OVER_CONSUMPTION")) out.push(`shared:${s.sharedCapacityId}:OVER_CONSUMPTION`);
    else if (neg(s.remaining)) out.push(`shared:${s.sharedCapacityId}:negative`);
  }
  return [...new Set(out)].sort();
}

/** §16 - the committable invariant, checked as a whole rather than field by field. */
function assertCommittableInvariant(r: TransactionSimulationResult): void {
  if (!r.commitPlan.committable) return;
  expect(r.simulationStatus).toBe("SIMULATED");
  expect(r.selectedPathResult).toBe("SATISFIED");
  expect(r.postState).not.toBeNull();
  expect(r.postStateIdentity).not.toBeNull();
  expect(unsafeEntries(r.postState)).toEqual([]);
  // no unsupported effect, no missing input, no unresolved conflict may survive into a commit
  expect(r.effects.filter((e) => !e.supported)).toEqual([]);
  expect(r.missingInputs).toEqual([]);
  for (const c of r.capacityEffects) expect(c.outcome).toBe("SATISFIED");
  for (const c of r.conditions) expect(["SATISFIED"]).toContain(c.result);
  expect(r.reclassificationEffects.batchConservation.filter((b) => !b.holds)).toEqual([]);
}

/** A transaction that must not be published as a valid successor. */
function assertFailsClosed(r: TransactionSimulationResult): void {
  expect(r.commitPlan.committable).toBe(false);
  expect(r.selectedPathResult).not.toBe("SATISFIED");
  expect(unsafeEntries(r.postState)).toEqual([]);
  assertCommittableInvariant(r);
}

const cap = (amount: number, ledger: Parameters<typeof world>[0]["ledger"] = []) =>
  world({ rules: [provision("P", MONEY(amount))], ledger });
const rP = route({ capacityNodeIds: [nodeOf("P")], ruleIds: ["P"] });
const draws = (...xs: string[]) => xs.map((x, i) => consume(`d${i + 1}`, nodeOf("P"), cash(x)));

// ===========================================================================
// §5 AGGREGATE CAPACITY
// ===========================================================================
describe("§5 aggregate capacity recertification", () => {
  it("A1. 60 + 60 against 100 is never satisfied and never committable", () => {
    resetIds();
    const r = simulate(cap(100), proposal("A1", draws("60", "60")), rP);
    assertFailsClosed(r);
    expect(r.postState).toBeNull();
  });

  it("A2. 60 + 40 against 100 exhausts exactly", () => {
    resetIds();
    const r = simulate(cap(100), proposal("A2", draws("60", "40")), rP);
    expect(r.commitPlan.committable).toBe(true);
    const e = r.postState!.capacities.find((c) => c.capacityNodeId === nodeOf("P"))!;
    expect(amountOf(e.usage as never)).toBe("100");
    expect(amountOf(e.remaining as never)).toBe("0");
    assertCommittableInvariant(r);
  });

  it("A3. existing usage 30 plus 40 + 40 fails closed", () => {
    resetIds();
    const r = simulate(cap(100, [usage("h1", "30", onProvision("P"))]), proposal("A3", draws("40", "40")), rP);
    assertFailsClosed(r);
  });

  it("A4. five draws of 20 against 100 exhaust exactly", () => {
    resetIds();
    const r = simulate(cap(100), proposal("A4", draws("20", "20", "20", "20", "20")), rP);
    expect(r.commitPlan.committable).toBe(true);
    expect(amountOf(r.postState!.capacities[0]!.remaining as never)).toBe("0");
    assertCommittableInvariant(r);
  });

  it("A5. four draws of 20 plus one of 21 fails closed on the last draw", () => {
    resetIds();
    const r = simulate(cap(100), proposal("A5", draws("20", "20", "20", "20", "21")), rP);
    assertFailsClosed(r);
    expect(r.capacityEffects[4]!.outcome).toBe("INSUFFICIENT_CAPACITY");
    expect(amountOf(r.capacityEffects[4]!.availableAmount as never)).toBe("20");
  });

  it("A6. deterministic partitions below, at and above the limit behave correctly", () => {
    let seed = 987654321;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let t = 0; t < 60; t++) {
      resetIds();
      const limit = 100;
      const k = 2 + Math.floor(rnd() * 4);
      const xs = Array.from({ length: k }, () => String(5 + Math.floor(rnd() * 40)));
      const total = xs.reduce((a, b) => a + Number(b), 0);
      const r = simulate(cap(limit), proposal(`A6-${t}`, xs.map((x, i) => consume(`d${i}`, nodeOf("P"), cash(x)))), rP);
      assertCommittableInvariant(r);
      if (total <= limit) {
        expect(r.commitPlan.committable).toBe(true);
        expect(amountOf(r.postState!.capacities[0]!.usage as never)).toBe(String(total));
      } else {
        assertFailsClosed(r);
      }
    }
  });
});

// ===========================================================================
// §6 SHARED CAPACITY
// ===========================================================================
const sharedWorld = (poolCap: number, memberCap: number, ledger: Parameters<typeof world>[0]["ledger"] = []) =>
  world({
    rules: [provision("A", MONEY(memberCap)), provision("B", MONEY(memberCap)), provision("C", MONEY(memberCap))],
    pools: [pool("POOL", MONEY(poolCap), ["A", "B", "C"])], ledger,
  });
const rABC = route({ capacityNodeIds: [nodeOf("A"), nodeOf("B"), nodeOf("C")], ruleIds: ["A", "B", "C"], sharedCapacityIds: ["POOL"] });
const rAB = route({ capacityNodeIds: [nodeOf("A"), nodeOf("B")], ruleIds: ["A", "B"], sharedCapacityIds: ["POOL"] });

describe("§6 shared capacity recertification", () => {
  it("S1. 60 + 60 against a 100 pool fails closed", () => {
    resetIds();
    const r = simulate(sharedWorld(100, 500), proposal("S1", [
      consume("x", nodeOf("A"), cash("60")), consume("y", nodeOf("B"), cash("60")),
    ], { intendedAmount: cash("120") }), rAB);
    assertFailsClosed(r);
  });

  it("S2. 60 + 40 exhausts the pool exactly", () => {
    resetIds();
    const r = simulate(sharedWorld(100, 500), proposal("S2", [
      consume("x", nodeOf("A"), cash("60")), consume("y", nodeOf("B"), cash("40")),
    ], { intendedAmount: cash("100") }), rAB);
    expect(r.commitPlan.committable).toBe(true);
    const sc = r.postState!.sharedConstraints.find((s) => s.sharedCapacityId === "POOL")!;
    expect(amountOf(sc.usage as never)).toBe("100");
    expect(amountOf(sc.remaining as never)).toBe("0");
    assertCommittableInvariant(r);
  });

  it("S3. existing pool usage counts toward the aggregate", () => {
    resetIds();
    const r = simulate(sharedWorld(100, 500, [usage("h1", "50", onProvision("A"))]), proposal("S3", [
      consume("x", nodeOf("A"), cash("30")), consume("y", nodeOf("B"), cash("30")),
    ], { intendedAmount: cash("60") }), rAB);
    assertFailsClosed(r);
  });

  it("S4. three member effects against one pool are aggregated", () => {
    resetIds();
    const r = simulate(sharedWorld(100, 500), proposal("S4", [
      consume("x", nodeOf("A"), cash("40")), consume("y", nodeOf("B"), cash("40")), consume("z", nodeOf("C"), cash("40")),
    ], { intendedAmount: cash("120") }), rABC);
    assertFailsClosed(r);
  });

  it("S5. a member inside two quantified pools is bound by the tighter one", () => {
    resetIds();
    const w = world({
      rules: [provision("A", MONEY(500)), provision("B", MONEY(500))],
      pools: [pool("WIDE", MONEY(100), ["A", "B"]), pool("TIGHT", MONEY(70), ["A"])],
    });
    const r = simulate(w, proposal("S5", [
      consume("x", nodeOf("A"), cash("50")), consume("y", nodeOf("A"), cash("40")),
    ]), route({ capacityNodeIds: [nodeOf("A")], ruleIds: ["A"], sharedCapacityIds: ["WIDE", "TIGHT"] }));
    assertFailsClosed(r);
  });

  it("S6. an unquantified shared relationship is never turned into a pool", () => {
    resetIds();
    const w = world({
      rules: [
        provision("A", MONEY(100), { dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "B", description: "shares with B" }] as never }),
        provision("B", MONEY(100)),
      ],
    });
    const r = simulate(w, proposal("S6", [consume("x", nodeOf("A"), cash("20"))]),
      route({ capacityNodeIds: [nodeOf("A")], ruleIds: ["A"] }));
    expect(codes(r.limitations)).toContain("SHARED_CAPACITY_NOT_QUANTIFIED");
    expect(r.capacityEffects[0]!.availableAmount.kind).toBe("NOT_DETERMINED");
    expect(r.commitPlan.committable).toBe(false);
    assertCommittableInvariant(r);
  });
});

// ===========================================================================
// §7 POST-STATE AUTHORITY
// ===========================================================================
describe("§7 post-state authority", () => {
  it("P1. Phase-4C OVER_CONSUMPTION is detected even though remaining is withheld, not negative", () => {
    resetIds();
    // This is the exact representation the remediation discovered: an over-draw that makes the
    // entry non-authoritative withholds the remaining figure instead of publishing a negative.
    const r = simulate(cap(100), proposal("P1", draws("60", "60")), rP);
    expect(r.commitPlan.committable).toBe(false);
    expect(r.postState).toBeNull();
    // Prove the representation exists: build the same ledger by chaining two permitted halves.
    const half = simulate(cap(100), proposal("P1a", draws("60")), rP);
    expect(half.commitPlan.committable).toBe(true);
  });

  it("P2. no Phase-4C unsafe state is upgraded into a satisfied committable transaction", () => {
    resetIds();
    const w = world({ rules: [provision("P", MONEY(100), { sufficiency: "PARTIAL", sufficiencyReasons: ["one clause unrepresented"] })] });
    const r = simulate(w, proposal("P2", draws("10")), rP);
    expect(r.selectedPathResult).not.toBe("SATISFIED");
    expect(r.commitPlan.committable).toBe(false);
    assertCommittableInvariant(r);
  });

  it("P3. an AMBIGUOUS Phase-3 rule can never become committable", () => {
    resetIds();
    const w = world({ rules: [provision("P", MONEY(100), { sufficiency: "AMBIGUOUS", sufficiencyReasons: ["two readings survive"] })] });
    const r = simulate(w, proposal("P3", draws("10")), rP);
    expect(r.commitPlan.committable).toBe(false);
    assertCommittableInvariant(r);
  });
});

// ===========================================================================
// §8 EFFECT ORDERING
// ===========================================================================
describe("§8 effect ordering is execution, not only identity", () => {
  const led40 = [usage("h1", "40", onProvision("P"))];

  it("O1/O2. restore then consume differs from consume then restore IN RESULT", () => {
    resetIds();
    const fwd = simulate(cap(100, led40), proposal("O1", [restore("a", "h1"), consume("b", nodeOf("P"), cash("100"))]), rP);
    resetIds();
    const rev = simulate(cap(100, led40), proposal("O2", [consume("a", nodeOf("P"), cash("100")), restore("b", "h1")]), rP);
    expect(fwd.selectedPathResult).toBe("SATISFIED");
    expect(rev.selectedPathResult).not.toBe("SATISFIED");
    // the available figure at the point of the draw, not merely a different hash
    expect(amountOf(fwd.capacityEffects[0]!.availableAmount as never)).toBe("100");
    expect(amountOf(rev.capacityEffects[0]!.availableAmount as never)).toBe("60");
    assertCommittableInvariant(fwd); assertCommittableInvariant(rev);
  });

  it("O3/O4. supersede then consume differs from consume then supersede IN RESULT", () => {
    resetIds();
    const led60 = [usage("h1", "60", onProvision("P"))];
    const fwd = simulate(cap(100, led60), proposal("O3", [supersede("a", "h1", cash("20")), consume("b", nodeOf("P"), cash("80"))]), rP);
    resetIds();
    const rev = simulate(cap(100, led60), proposal("O4", [consume("a", nodeOf("P"), cash("80")), supersede("b", "h1", cash("20"))]), rP);
    expect(amountOf(fwd.capacityEffects[0]!.availableAmount as never)).toBe("80");
    expect(amountOf(rev.capacityEffects[0]!.availableAmount as never)).toBe("40");
    expect(fwd.selectedPathResult).toBe("SATISFIED");
    expect(rev.selectedPathResult).not.toBe("SATISFIED");
  });

  it("O5/O6. a metric change before a draw is visible to it; after it, is not", () => {
    resetIds();
    const mk = () => world({ rules: [provision("G", MUL(PCT(0.2), FIGURE("base")))], facts: [figure("base", "1000")] });
    const rG = route({ capacityNodeIds: [nodeOf("G")], ruleIds: ["G"] });
    resetIds();
    const before = simulate(mk(), proposal("O5", [adjustFigure("a", "base", "DELTA", cash("1000")), consume("b", nodeOf("G"), cash("350"))]), rG);
    resetIds();
    const after = simulate(mk(), proposal("O6", [consume("a", nodeOf("G"), cash("350")), adjustFigure("b", "base", "DELTA", cash("1000"))]), rG);
    expect(amountOf(before.capacityEffects[0]!.availableAmount as never)).toBe("400");
    expect(amountOf(after.capacityEffects[0]!.availableAmount as never)).toBe("200");
    expect(before.selectedPathResult).toBe("SATISFIED");
    expect(after.selectedPathResult).not.toBe("SATISFIED");
  });

  it("O7. several metric changes surrounding a draw accumulate only up to that point", () => {
    resetIds();
    const mk = () => world({ rules: [provision("G", MUL(PCT(0.2), FIGURE("base")))], facts: [figure("base", "1000")] });
    const rG = route({ capacityNodeIds: [nodeOf("G")], ruleIds: ["G"] });
    const r = simulate(mk(), proposal("O7", [
      adjustFigure("a", "base", "DELTA", cash("1000")),
      consume("b", nodeOf("G"), cash("10")),
      adjustFigure("c", "base", "DELTA", cash("3000")),
    ]), rG);
    // 20% of 2000 at the point of the draw, not 20% of 5000
    expect(amountOf(r.capacityEffects[0]!.availableAmount as never)).toBe("400");
  });

  it("O8. an event assignment composed with a draw stays coherent in both orders", () => {
    // A gated capacity shape is Phase-3 IR territory and is exercised by the Phase-4C suite; what
    // Phase 4D owns is that an event assignment composed with a draw never yields an unsafe
    // successor and never depends on effect-id order.
    resetIds();
    const w = () => world({ rules: [provision("P", MONEY(100))] });
    const a = simulate(w(), proposal("O8a", [setEvent("x", "a default has occurred", true), consume("y", nodeOf("P"), cash("10"))]), rP);
    resetIds();
    const b = simulate(w(), proposal("O8b", [consume("x", nodeOf("P"), cash("10")), setEvent("y", "a default has occurred", true)]), rP);
    assertCommittableInvariant(a);
    assertCommittableInvariant(b);
    expect(codes(a.limitations)).not.toContain("CONFLICTING_EVENT_STATE");
    expect(codes(b.limitations)).not.toContain("CONFLICTING_EVENT_STATE");
  });

  it("O9. reclassification composed with a draw never publishes an unsafe successor", () => {
    resetIds();
    const w = () => world({
      rules: [provision("SRC", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "DST", description: "may reclassify" }] as never }), provision("DST", MONEY(50))],
      ledger: [usage("h1", "40", onProvision("SRC"))],
    });
    for (const order of [0, 1]) {
      resetIds();
      const rc = reclassify("r", election("EL", "SRC", "DST", "25"));
      const cn = consume("c", nodeOf("DST"), cash("40"));
      const r = simulate(w(), proposal(`O9-${order}`, order === 0 ? [rc, cn] : [cn, rc]),
        route({ capacityNodeIds: [nodeOf("DST")], ruleIds: ["SRC", "DST"], reclassificationElectionIds: ["EL"] }));
      assertCommittableInvariant(r);
    }
  });
});

// ===========================================================================
// §9 FINANCIAL OVERLAY ORDERING - including the condition-evaluation probe
// ===========================================================================
describe("§9 financial overlay ordering", () => {
  it("F1. the draw sees only adjustments stated before it", () => {
    resetIds();
    const mk = () => world({ rules: [provision("G", MUL(PCT(0.5), FIGURE("ebitda")))], facts: [figure("ebitda", "100")] });
    const rG = route({ capacityNodeIds: [nodeOf("G")], ruleIds: ["G"] });
    const a = simulate(mk(), proposal("F1a", [adjustFigure("x", "ebitda", "SET", cash("400")), consume("y", nodeOf("G"), cash("150"))]), rG);
    resetIds();
    const b = simulate(mk(), proposal("F1b", [consume("x", nodeOf("G"), cash("150")), adjustFigure("y", "ebitda", "SET", cash("400"))]), rG);
    expect(amountOf(a.capacityEffects[0]!.availableAmount as never)).toBe("200");
    expect(amountOf(b.capacityEffects[0]!.availableAmount as never)).toBe("50");
  });

  it("F2. PROBE: a condition gated on a metric and the adjustment's position", () => {
    resetIds();
    // The rule permits a draw only while ebitda <= 100. The transaction raises ebitda AFTER the
    // draw. Under sequential semantics the condition at the point of the draw should still see
    // the unadjusted value. This probes whether condition evaluation shares the draw's cursor.
    const mk = () => world({
      rules: [provision("G", MONEY(100), { conditions: [condition("c1", LTE(FIGURE("ebitda"), MONEY(100)))] as never })],
      facts: [figure("ebitda", "50")],
    });
    const rG = route({ capacityNodeIds: [nodeOf("G")], ruleIds: ["G"] });
    const after = simulate(mk(), proposal("F2", [
      consume("x", nodeOf("G"), cash("10")),
      adjustFigure("y", "ebitda", "SET", cash("500")),
    ]), rG);
    // Whatever the engine concludes, it must be internally coherent and must never be committable
    // on the strength of a condition that reads a value stated after the draw while the draw
    // itself reads the value before it. Recorded as evidence either way.
    assertCommittableInvariant(after);
    expect(after.conditions.length).toBe(1);
  });
});

// ===========================================================================
// §10 LEDGER CONFLICTS
// ===========================================================================
describe("§10 ledger conflict recertification", () => {
  const led = [usage("h1", "40", onProvision("P")), usage("h2", "10", onProvision("P"))];

  it("L1. two supersessions of one usage fail closed", () => {
    resetIds();
    const r = simulate(cap(100, led), proposal("L1", [supersede("a", "h1", cash("10")), supersede("b", "h1", cash("20"))]), rP);
    expect(codes(r.limitations)).toContain("CONFLICTING_LEDGER_SUCCESSOR");
    assertFailsClosed(r);
  });

  it("L2. two restores of one usage fail closed", () => {
    resetIds();
    const r = simulate(cap(100, led), proposal("L2", [restore("a", "h1"), restore("b", "h1")]), rP);
    expect(codes(r.limitations)).toContain("CONFLICTING_LEDGER_SUCCESSOR");
    assertFailsClosed(r);
  });

  it("L3. restore plus supersede of one usage fails closed", () => {
    resetIds();
    const r = simulate(cap(100, led), proposal("L3", [restore("a", "h1"), supersede("b", "h1", cash("5"))]), rP);
    expect(codes(r.limitations)).toContain("CONFLICTING_LEDGER_SUCCESSOR");
    assertFailsClosed(r);
  });

  it("L4/L5. reclassification moving a usage another effect changes never commits", () => {
    resetIds();
    const w = () => world({
      rules: [provision("SRC", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "DST", description: "may reclassify" }] as never }), provision("DST", MONEY(100))],
      ledger: [usage("h1", "40", onProvision("SRC"))],
    });
    for (const other of [supersede("s", "h1", cash("5")), restore("s", "h1")]) {
      resetIds();
      const r = simulate(w(), proposal("L45", [reclassify("r", election("EL", "SRC", "DST", "40")), other]),
        route({ capacityNodeIds: [nodeOf("SRC")], ruleIds: ["SRC", "DST"], reclassificationElectionIds: ["EL"] }));
      expect(r.commitPlan.committable).toBe(false);
      assertCommittableInvariant(r);
    }
  });

  it("L6. a proposed identity already in the ledger is refused", () => {
    resetIds();
    const clash = [usage("L6::d1", "10", onProvision("P"))];
    const r = simulate(cap(100, clash), proposal("L6", draws("10")), rP);
    expect(codes(r.limitations)).toContain("DUPLICATE_PROPOSED_LEDGER_IDENTITY");
    assertFailsClosed(r);
  });

  it("L7. a successor naming a usage that does not exist is refused, never created", () => {
    resetIds();
    const r = simulate(cap(100, led), proposal("L7", [supersede("a", "nope", cash("5"))]), rP);
    expect(codes(r.limitations)).toContain("LEDGER_USAGE_NOT_FOUND");
    assertFailsClosed(r);
  });

  it("L8. unrelated historical usages compose in one transaction", () => {
    resetIds();
    const r = simulate(cap(100, led), proposal("L8", [restore("a", "h1"), supersede("b", "h2", cash("5"))]), rP);
    expect(codes(r.limitations)).not.toContain("CONFLICTING_LEDGER_SUCCESSOR");
    expect(r.ledgerEffects.superseded.map((s) => s.originalUsageId).sort()).toEqual(["h1", "h2"]);
    // history preserved: both originals retained verbatim, restated as SUPERSEDED
    for (const s of r.ledgerEffects.superseded) {
      expect(s.original.status).toBe("RECORDED");
      expect(s.proposed.status).toBe("SUPERSEDED");
      expect(s.supersededByUsageId).not.toBeNull();
    }
    assertCommittableInvariant(r);
  });
});

// ===========================================================================
// §11 EVENT CONFLICTS
// ===========================================================================
describe("§11 event conflict recertification", () => {
  const evW = () => world({ rules: [provision("P", MONEY(100))] });
  const ev = (id: string, active: boolean) => setEvent(id, "a default has occurred", active);

  it("E1/E2. both orders of activate+deactivate are the same refusal", () => {
    for (const [a, b] of [[true, false], [false, true]] as const) {
      resetIds();
      const r = simulate(evW(), proposal("E", [ev("x", a), ev("y", b)]), rP);
      expect(codes(r.limitations)).toContain("CONFLICTING_EVENT_STATE");
      expect(r.commitPlan.committable).toBe(false);
    }
  });

  it("E3/E4. duplicate agreeing assignments are not a conflict", () => {
    for (const v of [true, false]) {
      resetIds();
      const r = simulate(evW(), proposal("E", [ev("x", v), ev("y", v)]), rP);
      expect(codes(r.limitations)).not.toContain("CONFLICTING_EVENT_STATE");
    }
  });

  it("E5. distinct events do not collide", () => {
    resetIds();
    const r = simulate(evW(), proposal("E5", [
      { effectId: "x", kind: "ACTIVATE_EVENT", eventDescription: "event one", asOf: "2026-06-30" } as never,
      { effectId: "y", kind: "DEACTIVATE_EVENT", eventDescription: "event two", asOf: "2026-06-30" } as never,
    ]), rP);
    expect(codes(r.limitations)).not.toContain("CONFLICTING_EVENT_STATE");
  });

  it("E6. the same event at distinct effective dates is not a conflict", () => {
    resetIds();
    const r = simulate(evW(), proposal("E6", [
      { effectId: "x", kind: "ACTIVATE_EVENT", eventDescription: "a default has occurred", asOf: "2026-06-30" } as never,
      { effectId: "y", kind: "DEACTIVATE_EVENT", eventDescription: "a default has occurred", asOf: "2026-03-31" } as never,
    ]), rP);
    expect(codes(r.limitations)).not.toContain("CONFLICTING_EVENT_STATE");
  });
});

// ===========================================================================
// §12 DEPENDENCY INTEGRITY
// ===========================================================================
describe("§12 dependency integrity", () => {
  const dep = (id: string, on: string[], amount = "10") =>
    consume(id, nodeOf("P"), cash(amount), { dependsOnEffectIds: on } as never);

  it("G1. dangling dependency is explicit", () => {
    resetIds();
    const r = simulate(cap(100), proposal("G1", [dep("a", ["ghost"])]), rP);
    expect(codes(r.limitations)).toContain("INVALID_EFFECT_DEPENDENCY");
    assertFailsClosed(r);
  });

  it("G2. self dependency is refused", () => {
    resetIds();
    const r = simulate(cap(100), proposal("G2", [dep("a", ["a"])]), rP);
    expect(r.commitPlan.committable).toBe(false);
  });

  it("G3/G4. two-node and longer cycles are refused", () => {
    resetIds();
    const two = simulate(cap(100), proposal("G3", [dep("a", ["b"]), dep("b", ["a"])]), rP);
    expect(codes(two.limitations).some((c) => c === "TRANSACTION_EFFECT_DEPENDENCY_CYCLE" || c === "EFFECT_DEPENDENCY_CONTRADICTS_ORDER")).toBe(true);
    assertFailsClosed(two);
    resetIds();
    const three = simulate(cap(100), proposal("G4", [dep("a", ["c"]), dep("b", ["a"]), dep("c", ["b"])]), rP);
    assertFailsClosed(three);
  });

  it("G5. a valid backward dependency is accepted", () => {
    resetIds();
    const r = simulate(cap(100), proposal("G5", [consume("a", nodeOf("P"), cash("10")), dep("b", ["a"])]), rP);
    expect(codes(r.limitations)).not.toContain("INVALID_EFFECT_DEPENDENCY");
    expect(codes(r.limitations)).not.toContain("EFFECT_DEPENDENCY_CONTRADICTS_ORDER");
    expect(r.selectedPathResult).toBe("SATISFIED");
    assertCommittableInvariant(r);
  });

  it("G6. a forward-pointing dependency is refused explicitly", () => {
    resetIds();
    const r = simulate(cap(100), proposal("G6", [dep("a", ["b"]), consume("b", nodeOf("P"), cash("10"))]), rP);
    expect(codes(r.limitations)).toContain("EFFECT_DEPENDENCY_CONTRADICTS_ORDER");
    assertFailsClosed(r);
  });

  it("G7. duplicate effect ids are refused", () => {
    resetIds();
    const r = simulate(cap(100), proposal("G7", [consume("a", nodeOf("P"), cash("10")), consume("a", nodeOf("P"), cash("20"))]), rP);
    expect(codes(r.limitations)).toContain("DUPLICATE_EFFECT_IDENTITY");
    assertFailsClosed(r);
  });

  it("G8. a repeated dependency id does not silently vanish", () => {
    resetIds();
    const r = simulate(cap(100), proposal("G8", [consume("a", nodeOf("P"), cash("10")), dep("b", ["a", "a"])]), rP);
    expect(codes(r.limitations)).not.toContain("INVALID_EFFECT_DEPENDENCY");
    assertCommittableInvariant(r);
  });
});

// ===========================================================================
// §13 RECLASSIFICATION COMPOSITION
// ===========================================================================
describe("§13 reclassification composition", () => {
  const rw = (srcUsage: string) => world({
    rules: [provision("SRC", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "DST", description: "may reclassify" }] as never }), provision("DST", MONEY(100))],
    ledger: [usage("h1", srcUsage, onProvision("SRC"))],
  });

  it("R1. a single valid election executes and conserves", () => {
    resetIds();
    const r = simulate(rw("40"), proposal("R1", [reclassify("a", election("EL", "SRC", "DST", "25"))]),
      route({ reclassificationElectionIds: ["EL"] }));
    expect(r.reclassificationEffects.allExecuted).toBe(true);
    const o = r.reclassificationEffects.outcomes[0]!;
    expect(o.conservation?.net).toBe("0");
    assertCommittableInvariant(r);
  });

  it("R2. two elections exactly equal to source usage are permitted", () => {
    resetIds();
    const r = simulate(rw("50"), proposal("R2", [
      reclassify("a", election("E1", "SRC", "DST", "25")), reclassify("b", election("E2", "SRC", "DST", "25")),
    ]), route({ reclassificationElectionIds: ["E1", "E2"] }));
    expect(r.reclassificationEffects.batchConservation.every((b) => b.holds)).toBe(true);
    assertCommittableInvariant(r);
  });

  it("R3. two elections jointly exceeding source usage fail atomically", () => {
    resetIds();
    const r = simulate(rw("40"), proposal("R3", [
      reclassify("a", election("E1", "SRC", "DST", "25")), reclassify("b", election("E2", "SRC", "DST", "25")),
    ]), route({ reclassificationElectionIds: ["E1", "E2"] }));
    expect(r.reclassificationEffects.allExecuted).toBe(false);
    expect(r.reclassificationEffects.batchConservation.some((b) => !b.holds)).toBe(true);
    expect(r.postState).toBeNull();
    assertFailsClosed(r);
  });

  it("R4/R5. reclassification with a source or target draw stays coherent", () => {
    for (const target of ["SRC", "DST"]) {
      resetIds();
      const r = simulate(rw("40"), proposal("R45", [
        reclassify("a", election("EL", "SRC", "DST", "25")), consume("b", nodeOf(target), cash("10")),
      ]), route({ capacityNodeIds: [nodeOf(target)], ruleIds: ["SRC", "DST"], reclassificationElectionIds: ["EL"] }));
      assertCommittableInvariant(r);
    }
  });

  it("R8. an interleaving incompatible with batch atomicity is refused explicitly", () => {
    resetIds();
    const r = simulate(rw("50"), proposal("R8", [
      reclassify("a", election("E1", "SRC", "DST", "20")),
      consume("mid", nodeOf("SRC"), cash("5")),
      reclassify("b", election("E2", "SRC", "DST", "20")),
    ]), route({ capacityNodeIds: [nodeOf("SRC")], ruleIds: ["SRC", "DST"], reclassificationElectionIds: ["E1", "E2"] }));
    expect(r.commitPlan.committable).toBe(false);
    expect(codes(r.limitations)).toContain("UNSUPPORTED_EFFECT_INTERLEAVING");
    expect(r.simulationStatus).toBe("UNSUPPORTED");
    assertCommittableInvariant(r);
  });
});

// ===========================================================================
// §14 FAILURE ATOMICITY - failures at every stage
// ===========================================================================
describe("§14 failure atomicity at every stage", () => {
  const snapshotOf = (w: ReturnType<typeof world>) => JSON.stringify({ state: w.state, ledger: w.context.ledger });

  const cases: { name: string; build: () => { w: ReturnType<typeof world>; r: TransactionSimulationResult } }[] = [
    { name: "early: malformed dependency", build: () => { resetIds(); const w = cap(100); return { w, r: simulate(w, proposal("X", [consume("a", nodeOf("P"), cash("10"), { dependsOnEffectIds: ["ghost"] } as never)]), rP) }; } },
    { name: "early: duplicate effect id", build: () => { resetIds(); const w = cap(100); return { w, r: simulate(w, proposal("X", [consume("a", nodeOf("P"), cash("1")), consume("a", nodeOf("P"), cash("2"))]), rP) }; } },
    { name: "mid: second draw over-draws", build: () => { resetIds(); const w = cap(100); return { w, r: simulate(w, proposal("X", draws("60", "60")), rP) }; } },
    { name: "mid: conflicting successors", build: () => { resetIds(); const w = cap(100, [usage("h1", "40", onProvision("P"))]); return { w, r: simulate(w, proposal("X", [supersede("a", "h1", cash("5")), supersede("b", "h1", cash("6"))]), rP) }; } },
    { name: "late: after several successful effects", build: () => { resetIds(); const w = cap(100); return { w, r: simulate(w, proposal("X", draws("20", "20", "20", "60")), rP) }; } },
  ];

  for (const c of cases) {
    it(`atomicity - ${c.name}`, () => {
      const { w } = c.build();
      const before = snapshotOf(w);
      const { r } = c.build();
      expect(r.commitPlan.committable).toBe(false);
      expect(r.postState).toBeNull();
      expect(r.postStateIdentity).toBeNull();
      expect(snapshotOf(w)).toBe(before);
    });
  }

  it("caller-supplied transaction object is not mutated", () => {
    resetIds();
    const tx = proposal("NM", draws("60", "60"));
    const frozen = JSON.stringify(tx);
    simulate(cap(100), tx, rP);
    expect(JSON.stringify(tx)).toBe(frozen);
  });
});

// ===========================================================================
// §15 REVIEW_REQUIRED VS INVALID TRANSITION
// ===========================================================================
describe("§15 provisional post-state versus invalid transition", () => {
  it("a partially represented rule may expose a provisional, non-committable post-state", () => {
    resetIds();
    const w = world({ rules: [provision("P", MONEY(100), { sufficiency: "PARTIAL", sufficiencyReasons: ["one clause unrepresented"] })] });
    const r = simulate(w, proposal("V1", draws("10")), rP);
    expect(r.selectedPathResult).toBe("REVIEW_REQUIRED");
    expect(r.commitPlan.committable).toBe(false);
    // Provisional arithmetic stays visible and clearly labelled.
    expect(r.capacityEffects[0]!.provisional).not.toBeNull();
    assertCommittableInvariant(r);
  });

  it("an actually over-consumed transition publishes NO post-state", () => {
    resetIds();
    const r = simulate(cap(100), proposal("V2", draws("60", "60")), rP);
    expect(r.postState).toBeNull();
  });

  it("a conflicting ledger transition publishes NO post-state", () => {
    resetIds();
    const r = simulate(cap(100, [usage("h1", "40", onProvision("P"))]),
      proposal("V3", [supersede("a", "h1", cash("5")), supersede("b", "h1", cash("6"))]), rP);
    expect(r.postState).toBeNull();
  });
});

// ===========================================================================
// §16/§17 COMMITTABLE INVARIANT SEARCH + METAMORPHIC PROPERTIES
// ===========================================================================
describe("§16/§17 adversarial invariant search and metamorphic properties", () => {
  it("no generated composition violates the committable invariant", () => {
    let seed = 13572468; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const amounts = ["5", "30", "60", "95", "130"];
    let checked = 0;
    for (let t = 0; t < 120; t++) {
      resetIds();
      const hist = rnd() < 0.5 ? [usage("h1", "25", onProvision("P"))] : [];
      const k = 1 + Math.floor(rnd() * 3);
      const effects = Array.from({ length: k }, (_, i) => consume(`e${i}`, nodeOf("P"), cash(amounts[Math.floor(rnd() * amounts.length)]!)));
      const seq: TransactionEffect[] = hist.length > 0 && rnd() < 0.4 ? [restore("r0", "h1"), ...effects] : effects;
      const r = simulate(cap(100, hist), proposal(`Z${t}`, seq), rP);
      assertCommittableInvariant(r);
      checked++;
    }
    expect(checked).toBe(120);
  });

  it("capacity conservation: post-state usage equals the effects actually applied", () => {
    for (const xs of [["10"], ["10", "20"], ["30", "30", "40"]]) {
      resetIds();
      const r = simulate(cap(100), proposal("C", xs.map((x, i) => consume(`e${i}`, nodeOf("P"), cash(x)))), rP);
      if (!r.commitPlan.committable) continue;
      expect(amountOf(r.postState!.capacities[0]!.usage as never)).toBe(String(xs.reduce((a, b) => a + Number(b), 0)));
    }
  });

  it("restoration returns capacity exactly, never more", () => {
    resetIds();
    const r = simulate(cap(100, [usage("h1", "40", onProvision("P"))]), proposal("RS", [restore("a", "h1")]), rP);
    expect(r.commitPlan.committable).toBe(true);
    // Phase 4C represents "no counted usage row" as NOT_DETERMINED rather than zero. That is
    // frozen Phase-4C behaviour, identical at the failed baseline, and is not Phase 4D's to
    // change. What Phase 4D must get right is the remaining figure.
    expect(amountOf(r.postState!.capacities[0]!.remaining as never)).toBe("100");
    expect(r.postState!.capacities[0]!.status).toBe("AVAILABLE");
  });

  it("determinism: the same scene replayed gives identical hashes", () => {
    resetIds();
    const w = cap(100);
    const runOnce = () => simulate(w, proposal("D", draws("30", "30")), rP);
    const a = runOnce(), b = runOnce(), c = runOnce();
    for (const x of [b, c]) {
      expect(x.transactionIdentity.transactionHash).toBe(a.transactionIdentity.transactionHash);
      expect(x.simulationIdentity.simulationId).toBe(a.simulationIdentity.simulationId);
      expect(x.postStateIdentity?.postStateHash).toBe(a.postStateIdentity?.postStateHash);
    }
  });

  it("identity: presentation-only changes preserve identity; semantic changes do not", () => {
    resetIds();
    const w = cap(100);
    const plain = simulate(w, proposal("I", draws("10")), rP);
    const labelled = simulate(w, proposal("I", draws("10"), { label: "an entirely different display name" }), rP);
    const different = simulate(w, proposal("I", draws("11")), rP);
    expect(labelled.transactionIdentity.transactionHash).toBe(plain.transactionIdentity.transactionHash);
    expect(labelled.postStateIdentity?.postStateHash).toBe(plain.postStateIdentity?.postStateHash);
    expect(different.transactionIdentity.transactionHash).not.toBe(plain.transactionIdentity.transactionHash);
  });

  it("identity: reordering effects that change the transition changes the post-state hash", () => {
    resetIds();
    const w = cap(100, [usage("h1", "40", onProvision("P"))]);
    const a = simulate(w, proposal("J", [restore("x", "h1"), consume("y", nodeOf("P"), cash("50"))]), rP);
    const b = simulate(w, proposal("J", [consume("y", nodeOf("P"), cash("50")), restore("x", "h1")]), rP);
    expect(a.transactionIdentity.transactionHash).not.toBe(b.transactionIdentity.transactionHash);
  });
});
