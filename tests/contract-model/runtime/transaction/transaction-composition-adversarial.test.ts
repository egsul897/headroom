/**
 * PHASE 4D REMEDIATION - the adversarial composition suite.
 *
 * Every test here attacks the COMPOSITION of effects rather than any single effect. The governing
 * invariant, stated once:
 *
 *   A transaction may never be reported SATISFIED and committable if the COMBINED effects produce
 *   a post-state that violates the selected capacity constraints, contains conflicting ledger or
 *   event transitions, or rests on a malformed effect graph.
 *
 * Each effect viewed in isolation is not evidence. The combined resulting state is.
 */
import { describe, expect, it } from "vitest";
import {
  FIGURE, MONEY, MUL, PCT, adjustFigure, amountOf, cash, codes, consume, election, figure,
  nodeOf, onProvision, pool, proposal, provision, reclassify, resetIds, restore, route, setEvent,
  simulate, supersede, usage, world,
} from "./helpers";
import type { CapacityState } from "@/lib/contract-model/runtime/capacity/types";
import type { TransactionSimulationResult } from "@/lib/contract-model/runtime/transaction/types";

// ---------------------------------------------------------------------------
// Invariant helpers - these express the safety property, not one field.
// ---------------------------------------------------------------------------

/** Exact-rational sign test on a Phase-4C capacity amount. No float ever enters this. */
const negative = (a: { kind: string; value?: { type: string; amount?: string } }): boolean => {
  const v = amountOf(a as never);
  return v !== null && v.trim().startsWith("-");
};

/**
 * Every capacity or shared constraint the post-state reports as drawn beyond its limit.
 *
 * Phase 4C is the authority here and is consulted two ways, because it expresses over-consumption
 * two ways: it raises an OVER_CONSUMPTION limitation, and where the entry stays authoritative it
 * leaves a negative remaining. Where the over-draw makes the entry non-authoritative Phase 4C
 * withholds the remaining figure entirely, so a sign test alone would miss it. Nothing here
 * re-derives Phase-4C arithmetic.
 */
function overConsumed(state: CapacityState): string[] {
  const out: string[] = [];
  const flagged = (ls: readonly { code: string }[]) => ls.some((l) => l.code === "OVER_CONSUMPTION");
  for (const c of state.capacities) {
    if (flagged(c.limitations)) out.push(`capacity ${c.capacityNodeId} OVER_CONSUMPTION`);
    else if (negative(c.remaining)) out.push(`capacity ${c.capacityNodeId} remaining ${amountOf(c.remaining as never)}`);
  }
  for (const s of state.sharedConstraints) {
    if (flagged(s.limitations)) out.push(`shared ${s.sharedCapacityId} OVER_CONSUMPTION`);
    else if (negative(s.remaining)) out.push(`shared ${s.sharedCapacityId} remaining ${amountOf(s.remaining as never)}`);
  }
  return out;
}

/**
 * THE governing assertion. A committable, satisfied transaction must leave a post-state that is
 * itself safe. Asserting only `selectedPathResult` would let an over-consumed post-state through,
 * which is exactly the defect this suite exists to catch.
 */
function expectCoherent(r: TransactionSimulationResult): void {
  if (r.commitPlan.committable) {
    expect(r.simulationStatus).toBe("SIMULATED");
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.postState).not.toBeNull();
    expect(overConsumed(r.postState!)).toEqual([]);
  }
  if (r.selectedPathResult === "SATISFIED" && r.postState) {
    expect(overConsumed(r.postState)).toEqual([]);
  }
}

/** A transaction that must fail closed: not satisfied, not committable, and no valid successor. */
function expectFailsClosed(r: TransactionSimulationResult): void {
  expect(r.selectedPathResult).not.toBe("SATISFIED");
  expect(r.commitPlan.committable).toBe(false);
  expectCoherent(r);
}

const base = (cap: number, ledger: Parameters<typeof world>[0]["ledger"] = []) =>
  world({ rules: [provision("prov-a", MONEY(cap))], ledger });

// ---------------------------------------------------------------------------
// 1. Aggregate consumption against ONE capacity
// ---------------------------------------------------------------------------
describe("1. aggregate consumption against a single capacity", () => {
  it("1A. two draws that individually fit but jointly exceed the capacity fail closed", () => {
    resetIds();
    const w = base(100);
    const r = simulate(w, proposal("tx-1a", [
      consume("e1", nodeOf("prov-a"), cash("60")),
      consume("e2", nodeOf("prov-a"), cash("60")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    // 120 against 100 may never be published as a satisfied, committable transition.
    expectFailsClosed(r);
    // Under sequential semantics the second draw is measured against the 40 the first one left,
    // so the over-draw is reported at the draw itself. INSUFFICIENT_AGGREGATE_CAPACITY is the
    // post-state backstop for anything that reaches the end undetected; either is a refusal.
    expect(codes(r.limitations).some((c) => c === "INSUFFICIENT_CAPACITY" || c === "INSUFFICIENT_AGGREGATE_CAPACITY")).toBe(true);
    expect(r.capacityEffects[1]!.outcome).toBe("INSUFFICIENT_CAPACITY");
    expect(amountOf(r.capacityEffects[1]!.availableAmount as never)).toBe("40");
  });

  it("1B. two draws that exactly exhaust the capacity are permitted and leave zero remaining", () => {
    resetIds();
    const w = base(100);
    const r = simulate(w, proposal("tx-1b", [
      consume("e1", nodeOf("prov-a"), cash("60")),
      consume("e2", nodeOf("prov-a"), cash("40")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(r.simulationStatus).toBe("SIMULATED");
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.commitPlan.committable).toBe(true);
    expect(r.postState).not.toBeNull();
    const entry = r.postState!.capacities.find((c) => c.capacityNodeId === nodeOf("prov-a"))!;
    expect(amountOf(entry.usage as never)).toBe("100");
    expect(amountOf(entry.remaining as never)).toBe("0");
    expectCoherent(r);
  });

  it("1C. existing usage plus several new draws is measured on the aggregate, not per effect", () => {
    resetIds();
    const w = base(100, [usage("u1", "30", onProvision("prov-a"))]);
    const r = simulate(w, proposal("tx-1c", [
      consume("e1", nodeOf("prov-a"), cash("40")),
      consume("e2", nodeOf("prov-a"), cash("40")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    // 30 historical + 40 + 40 = 110 against 100.
    expectFailsClosed(r);
  });

  it("1D. three or more draws are not special-cased for the two-effect shape", () => {
    resetIds();
    const w = base(100);
    const r = simulate(w, proposal("tx-1d", [
      consume("e1", nodeOf("prov-a"), cash("40")),
      consume("e2", nodeOf("prov-a"), cash("40")),
      consume("e3", nodeOf("prov-a"), cash("40")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expectFailsClosed(r);
  });

  it("1E. three draws that exactly exhaust the capacity succeed", () => {
    resetIds();
    const w = base(90);
    const r = simulate(w, proposal("tx-1e", [
      consume("e1", nodeOf("prov-a"), cash("30")),
      consume("e2", nodeOf("prov-a"), cash("30")),
      consume("e3", nodeOf("prov-a"), cash("30")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.commitPlan.committable).toBe(true);
    expect(amountOf(r.postState!.capacities.find((c) => c.capacityNodeId === nodeOf("prov-a"))!.remaining as never)).toBe("0");
    expectCoherent(r);
  });

  it("1F. a single over-draw still reports the per-effect shortfall it always did", () => {
    resetIds();
    const w = base(100);
    const r = simulate(w, proposal("tx-1f", [consume("e1", nodeOf("prov-a"), cash("140"))]),
      route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(r.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(r.capacityEffects[0]!.outcome).toBe("INSUFFICIENT_CAPACITY");
    expect((r.capacityEffects[0]!.shortfallAmount as unknown as { amount: string }).amount).toBe("40");
    expectFailsClosed(r);
  });
});

// ---------------------------------------------------------------------------
// 2. Aggregate consumption across members of a SHARED pool
// ---------------------------------------------------------------------------
const shared = (poolCap: number, memberCap: number, ledger: Parameters<typeof world>[0]["ledger"] = []) =>
  world({
    rules: [provision("prov-a", MONEY(memberCap)), provision("prov-b", MONEY(memberCap))],
    pools: [pool("res-1", MONEY(poolCap), ["prov-a", "prov-b"])],
    ledger,
  });

const sharedRoute = route({
  capacityNodeIds: [nodeOf("prov-a"), nodeOf("prov-b")],
  ruleIds: ["prov-a", "prov-b"],
  sharedCapacityIds: ["res-1"],
});

describe("2. aggregate consumption across a quantified shared pool", () => {
  it("2A. draws that each fit their member but jointly exceed the pool fail closed", () => {
    resetIds();
    const w = shared(100, 500);
    const r = simulate(w, proposal("tx-2a", [
      consume("e1", nodeOf("prov-a"), cash("60")),
      consume("e2", nodeOf("prov-b"), cash("60")),
    ], { intendedAmount: cash("120") }), sharedRoute);

    expectFailsClosed(r);
    expect(codes(r.limitations).some((c) => c === "INSUFFICIENT_CAPACITY" || c === "INSUFFICIENT_AGGREGATE_CAPACITY")).toBe(true);
    // The second member draw sees what the first left in the shared pool, not the untouched pool.
    expect(r.capacityEffects[1]!.outcome).toBe("INSUFFICIENT_CAPACITY");
    expect(amountOf(r.capacityEffects[1]!.availableAmount as never)).toBe("40");
  });

  it("2B. draws that exactly exhaust the shared pool succeed", () => {
    resetIds();
    const w = shared(100, 500);
    const r = simulate(w, proposal("tx-2b", [
      consume("e1", nodeOf("prov-a"), cash("60")),
      consume("e2", nodeOf("prov-b"), cash("40")),
    ], { intendedAmount: cash("100") }), sharedRoute);

    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.commitPlan.committable).toBe(true);
    const sc = r.postState!.sharedConstraints.find((s) => s.sharedCapacityId === "res-1")!;
    expect(amountOf(sc.usage as never)).toBe("100");
    expect(amountOf(sc.remaining as never)).toBe("0");
    expectCoherent(r);
  });

  it("2C. existing pool usage is counted with the new member draws", () => {
    resetIds();
    const w = shared(100, 500, [usage("u1", "50", onProvision("prov-a"))]);
    const r = simulate(w, proposal("tx-2c", [
      consume("e1", nodeOf("prov-a"), cash("30")),
      consume("e2", nodeOf("prov-b"), cash("30")),
    ], { intendedAmount: cash("60") }), sharedRoute);

    // 50 historical + 30 + 30 = 110 against a 100 pool.
    expectFailsClosed(r);
  });

  it("2D. three members drawing on one pool are aggregated", () => {
    resetIds();
    const w = world({
      rules: [provision("prov-a", MONEY(500)), provision("prov-b", MONEY(500)), provision("prov-c", MONEY(500))],
      pools: [pool("res-1", MONEY(100), ["prov-a", "prov-b", "prov-c"])],
    });
    const r = simulate(w, proposal("tx-2d", [
      consume("e1", nodeOf("prov-a"), cash("40")),
      consume("e2", nodeOf("prov-b"), cash("40")),
      consume("e3", nodeOf("prov-c"), cash("40")),
    ], { intendedAmount: cash("120") }), route({
      capacityNodeIds: [nodeOf("prov-a"), nodeOf("prov-b"), nodeOf("prov-c")],
      ruleIds: ["prov-a", "prov-b", "prov-c"], sharedCapacityIds: ["res-1"],
    }));

    expectFailsClosed(r);
  });

  it("2E. a member bounded by two pools is bounded by the tighter of them", () => {
    resetIds();
    const w = world({
      rules: [provision("prov-a", MONEY(500)), provision("prov-b", MONEY(500))],
      pools: [pool("res-1", MONEY(100), ["prov-a", "prov-b"]), pool("res-2", MONEY(70), ["prov-a"])],
    });
    const r = simulate(w, proposal("tx-2e", [
      consume("e1", nodeOf("prov-a"), cash("50")),
      consume("e2", nodeOf("prov-a"), cash("40")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"], sharedCapacityIds: ["res-1", "res-2"] }));

    // 90 fits res-1 (100) but not res-2 (70).
    expectFailsClosed(r);
  });

  it("2F. the member's own limit still binds when the pool is ample", () => {
    resetIds();
    const w = shared(1000, 100);
    const r = simulate(w, proposal("tx-2f", [
      consume("e1", nodeOf("prov-a"), cash("60")),
      consume("e2", nodeOf("prov-a"), cash("60")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"], sharedCapacityIds: ["res-1"] }));

    expectFailsClosed(r);
  });
});

// ---------------------------------------------------------------------------
// 4. Intra-transaction ordering
// ---------------------------------------------------------------------------
describe("4. effect ordering within one transaction", () => {
  it("4A. restore then consume sees the released capacity; the reverse order does not", () => {
    resetIds();
    const led = [usage("u1", "40", onProvision("prov-a"))];
    const forward = simulate(base(100, led), proposal("tx-4a-f", [
      restore("e1", "u1"),
      consume("e2", nodeOf("prov-a"), cash("100")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    resetIds();
    const reverse = simulate(base(100, led), proposal("tx-4a-r", [
      consume("e1", nodeOf("prov-a"), cash("100")),
      restore("e2", "u1"),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    // Release-then-draw frees 40 before the draw, so 100 fits exactly.
    expect(forward.selectedPathResult).toBe("SATISFIED");
    expect(forward.commitPlan.committable).toBe(true);
    // Draw-then-release meets 60 of remaining headroom at the moment of the draw.
    expect(reverse.selectedPathResult).not.toBe("SATISFIED");
    // The two orderings are genuinely different transactions.
    expect(forward.selectedPathResult).not.toBe(reverse.selectedPathResult);
    expectCoherent(forward);
    expectCoherent(reverse);
  });

  it("4B. supersede then consume sees the released amount; the reverse order does not", () => {
    resetIds();
    const led = [usage("u1", "60", onProvision("prov-a"))];
    const forward = simulate(base(100, led), proposal("tx-4b-f", [
      supersede("e1", "u1", cash("20")),
      consume("e2", nodeOf("prov-a"), cash("80")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    resetIds();
    const reverse = simulate(base(100, led), proposal("tx-4b-r", [
      consume("e1", nodeOf("prov-a"), cash("80")),
      supersede("e2", "u1", cash("20")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    // Restating 60 down to 20 frees 40, giving 80 of headroom exactly.
    expect(forward.selectedPathResult).toBe("SATISFIED");
    expect(reverse.selectedPathResult).not.toBe("SATISFIED");
    expectCoherent(forward);
    expectCoherent(reverse);
  });

  it("4C. a later draw accounts for an earlier draw on the same resource", () => {
    resetIds();
    const w = base(100);
    const r = simulate(w, proposal("tx-4c", [
      consume("e1", nodeOf("prov-a"), cash("70")),
      consume("e2", nodeOf("prov-a"), cash("40")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expectFailsClosed(r);
  });

  it("4D. effects against different members of one pool observe the evolving shared state", () => {
    resetIds();
    const w = shared(100, 500);
    const r = simulate(w, proposal("tx-4d", [
      consume("e1", nodeOf("prov-a"), cash("70")),
      consume("e2", nodeOf("prov-b"), cash("40")),
    ], { intendedAmount: cash("110") }), sharedRoute);

    expectFailsClosed(r);
  });

  it("4E. a metric adjustment relative to a draw is order-significant and identity records it", () => {
    resetIds();
    const mk = () => world({
      rules: [provision("prov-g", MUL(PCT(0.2), FIGURE("figure-base")))],
      facts: [figure("figure-base", "1000")],
    });
    const rt = route({ capacityNodeIds: [nodeOf("prov-g")], ruleIds: ["prov-g"] });

    resetIds();
    const before = simulate(mk(), proposal("tx-4e", [
      adjustFigure("e1", "figure-base", "DELTA", cash("1000")),
      consume("e2", nodeOf("prov-g"), cash("350")),
    ]), rt);

    resetIds();
    const after = simulate(mk(), proposal("tx-4e", [
      consume("e1", nodeOf("prov-g"), cash("350")),
      adjustFigure("e2", "figure-base", "DELTA", cash("1000")),
    ]), rt);

    // Base capacity is 20% of 1000 = 200. Adjusting the metric first lifts it to 400, so 350 fits.
    expect(before.selectedPathResult).toBe("SATISFIED");
    // Drawing first meets the unadjusted 200.
    expect(after.selectedPathResult).not.toBe("SATISFIED");
    expect(before.transactionIdentity.transactionHash).not.toBe(after.transactionIdentity.transactionHash);
    expectCoherent(before);
    expectCoherent(after);
  });

  it("4F. reclassification composed with a draw on the destination is coherent", () => {
    resetIds();
    const w = world({
      rules: [
        provision("prov-src", MONEY(100)),
        provision("prov-dst", MONEY(100), { dependsOn: [] }),
      ],
      ledger: [usage("u1", "40", onProvision("prov-src"))],
    });
    const r = simulate(w, proposal("tx-4f", [
      reclassify("e1", election("el-1", "prov-src", "prov-dst", "25")),
      consume("e2", nodeOf("prov-dst"), cash("90")),
    ]), route({ capacityNodeIds: [nodeOf("prov-dst")], ruleIds: ["prov-src", "prov-dst"], reclassificationElectionIds: ["el-1"] }));

    // Whatever the engine concludes, it must not publish an over-consumed successor state.
    expectCoherent(r);
  });
});

// ---------------------------------------------------------------------------
// 5. Ledger successor / supersession conflicts
// ---------------------------------------------------------------------------
describe("5. conflicting ledger successors", () => {
  const led = [usage("u1", "40", onProvision("prov-a"))];

  it("5A. two supersessions of the same usage are a conflict, not a race", () => {
    resetIds();
    const r = simulate(base(100, led), proposal("tx-5a", [
      supersede("e1", "u1", cash("10")),
      supersede("e2", "u1", cash("20")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(codes(r.limitations)).toContain("CONFLICTING_LEDGER_SUCCESSOR");
    expectFailsClosed(r);
    // No arbitrary winner may be published.
    expect(r.ledgerEffects.superseded.filter((s) => s.originalUsageId === "u1").length).toBeLessThanOrEqual(1);
  });

  it("5B. restoring and superseding the same usage is a conflict", () => {
    resetIds();
    const r = simulate(base(100, led), proposal("tx-5b", [
      restore("e1", "u1"),
      supersede("e2", "u1", cash("20")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(codes(r.limitations)).toContain("CONFLICTING_LEDGER_SUCCESSOR");
    expectFailsClosed(r);
  });

  it("5C. two restores of the same usage are a conflict", () => {
    resetIds();
    const r = simulate(base(100, led), proposal("tx-5c", [
      restore("e1", "u1"),
      restore("e2", "u1"),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(codes(r.limitations)).toContain("CONFLICTING_LEDGER_SUCCESSOR");
    expectFailsClosed(r);
  });

  it("5D. reclassification moving usage another effect supersedes is a conflict", () => {
    resetIds();
    const w = world({
      rules: [provision("prov-src", MONEY(100)), provision("prov-dst", MONEY(100))],
      ledger: [usage("u1", "40", onProvision("prov-src"))],
    });
    const r = simulate(w, proposal("tx-5d", [
      reclassify("e1", { ...election("el-1", "prov-src", "prov-dst", "40"), movesUsageIds: ["u1"] } as never),
      supersede("e2", "u1", cash("10")),
    ]), route({ capacityNodeIds: [nodeOf("prov-src")], ruleIds: ["prov-src", "prov-dst"], reclassificationElectionIds: ["el-1"] }));

    expectCoherent(r);
    expect(r.commitPlan.committable).toBe(false);
  });

  it("5E. a single supersession of one usage still works and stays traceable", () => {
    resetIds();
    const r = simulate(base(100, led), proposal("tx-5e", [supersede("e1", "u1", cash("10"))]),
      route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(r.selectedPathResult).toBe("SATISFIED");
    const s = r.ledgerEffects.superseded.find((x) => x.originalUsageId === "u1")!;
    expect(s.original.amount.amount).toBe("40");
    expect(s.proposed.status).toBe("SUPERSEDED");
    expect(s.supersededByUsageId).toBe("tx-5e::e1");
    expectCoherent(r);
  });

  it("5F. superseding a row this same transaction proposes is refused, not chained", () => {
    resetIds();
    const r = simulate(base(100, led), proposal("tx-5f", [
      consume("e1", nodeOf("prov-a"), cash("10")),
      supersede("e2", "tx-5f::e1", cash("5")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    // The identity does not exist in the supplied ledger; it is never conjured.
    expect(codes(r.limitations)).toContain("LEDGER_USAGE_NOT_FOUND");
    expectFailsClosed(r);
  });
});

// ---------------------------------------------------------------------------
// 6. Conflicting event state
// ---------------------------------------------------------------------------
describe("6. conflicting event assignments", () => {
  const evWorld = () => world({ rules: [provision("prov-a", MONEY(100))] });

  it("6A. activate and deactivate the same event is a conflict, not last-writer-wins", () => {
    resetIds();
    const r = simulate(evWorld(), proposal("tx-6a", [
      setEvent("e1", "a default has occurred", true),
      setEvent("e2", "a default has occurred", false),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(codes(r.limitations)).toContain("CONFLICTING_EVENT_STATE");
    expect(r.commitPlan.committable).toBe(false);
  });

  it("6B. the reverse declaration order is the same conflict", () => {
    resetIds();
    const r = simulate(evWorld(), proposal("tx-6b", [
      setEvent("e1", "a default has occurred", false),
      setEvent("e2", "a default has occurred", true),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(codes(r.limitations)).toContain("CONFLICTING_EVENT_STATE");
    expect(r.commitPlan.committable).toBe(false);
  });

  it("6C. two identical activations agree and are not a conflict", () => {
    resetIds();
    const r = simulate(evWorld(), proposal("tx-6c", [
      setEvent("e1", "a default has occurred", true),
      setEvent("e2", "a default has occurred", true),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(codes(r.limitations)).not.toContain("CONFLICTING_EVENT_STATE");
  });

  it("6D. two identical deactivations agree and are not a conflict", () => {
    resetIds();
    const r = simulate(evWorld(), proposal("tx-6d", [
      setEvent("e1", "a default has occurred", false),
      setEvent("e2", "a default has occurred", false),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(codes(r.limitations)).not.toContain("CONFLICTING_EVENT_STATE");
  });

  it("6E. the same description at genuinely different as-of dates is not a conflict", () => {
    resetIds();
    const r = simulate(evWorld(), proposal("tx-6e", [
      { effectId: "e1", kind: "ACTIVATE_EVENT", eventDescription: "a default has occurred", asOf: "2026-06-30" } as never,
      { effectId: "e2", kind: "DEACTIVATE_EVENT", eventDescription: "a default has occurred", asOf: "2026-03-31" } as never,
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(codes(r.limitations)).not.toContain("CONFLICTING_EVENT_STATE");
  });
});

// ---------------------------------------------------------------------------
// 7. Dependency graph integrity
// ---------------------------------------------------------------------------
describe("7. dependency graph integrity", () => {
  const w = () => base(100);
  const r1 = route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] });

  it("7A. a dependency on an effect that does not exist is refused, never ignored", () => {
    resetIds();
    const r = simulate(w(), proposal("tx-7a", [
      consume("e1", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["does-not-exist"] } as never),
    ]), r1);

    expect(codes(r.limitations)).toContain("INVALID_EFFECT_DEPENDENCY");
    expectFailsClosed(r);
  });

  it("7B. an effect depending on itself is refused", () => {
    resetIds();
    const r = simulate(w(), proposal("tx-7b", [
      consume("e1", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["e1"] } as never),
    ]), r1);

    expect(r.commitPlan.committable).toBe(false);
    expect(codes(r.limitations).some((c) => c === "TRANSACTION_EFFECT_DEPENDENCY_CYCLE" || c === "INVALID_EFFECT_DEPENDENCY")).toBe(true);
  });

  it("7C. a two-node dependency cycle is refused", () => {
    resetIds();
    const r = simulate(w(), proposal("tx-7c", [
      consume("e1", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["e2"] } as never),
      consume("e2", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["e1"] } as never),
    ]), r1);

    expect(codes(r.limitations)).toContain("TRANSACTION_EFFECT_DEPENDENCY_CYCLE");
    expectFailsClosed(r);
  });

  it("7D. a longer dependency cycle is refused", () => {
    resetIds();
    const r = simulate(w(), proposal("tx-7d", [
      consume("e1", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["e3"] } as never),
      consume("e2", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["e1"] } as never),
      consume("e3", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["e2"] } as never),
    ]), r1);

    expect(codes(r.limitations)).toContain("TRANSACTION_EFFECT_DEPENDENCY_CYCLE");
    expectFailsClosed(r);
  });

  it("7E. a valid acyclic dependency is accepted", () => {
    resetIds();
    const r = simulate(w(), proposal("tx-7e", [
      consume("e1", nodeOf("prov-a"), cash("10")),
      consume("e2", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["e1"] } as never),
    ]), r1);

    expect(codes(r.limitations)).not.toContain("INVALID_EFFECT_DEPENDENCY");
    expect(codes(r.limitations)).not.toContain("TRANSACTION_EFFECT_DEPENDENCY_CYCLE");
    expect(r.selectedPathResult).toBe("SATISFIED");
    expectCoherent(r);
  });

  it("7F. a dependency that contradicts the stated effect order is refused", () => {
    resetIds();
    // e1 is stated first but declares that it depends on e2, which is stated after it.
    const r = simulate(w(), proposal("tx-7f", [
      consume("e1", nodeOf("prov-a"), cash("10"), { dependsOnEffectIds: ["e2"] } as never),
      consume("e2", nodeOf("prov-a"), cash("10")),
    ]), r1);

    expect(codes(r.limitations)).toContain("EFFECT_DEPENDENCY_CONTRADICTS_ORDER");
    expectFailsClosed(r);
  });

  it("7G. duplicate effect ids are refused deterministically", () => {
    resetIds();
    const r = simulate(w(), proposal("tx-7g", [
      consume("e1", nodeOf("prov-a"), cash("10")),
      consume("e1", nodeOf("prov-a"), cash("20")),
    ]), r1);

    expect(codes(r.limitations)).toContain("DUPLICATE_EFFECT_IDENTITY");
    expectFailsClosed(r);
  });
});

// ---------------------------------------------------------------------------
// 9. Committability implies a safe final state
// ---------------------------------------------------------------------------
describe("9. committable implies the final post-state is safe", () => {
  it("9A. no committable result anywhere in this suite leaves an over-consumed post-state", () => {
    resetIds();
    const cases: TransactionSimulationResult[] = [
      simulate(base(100), proposal("c1", [consume("e1", nodeOf("prov-a"), cash("60")), consume("e2", nodeOf("prov-a"), cash("60"))]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] })),
      simulate(base(100), proposal("c2", [consume("e1", nodeOf("prov-a"), cash("60")), consume("e2", nodeOf("prov-a"), cash("40"))]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] })),
      simulate(shared(100, 500), proposal("c3", [consume("e1", nodeOf("prov-a"), cash("60")), consume("e2", nodeOf("prov-b"), cash("60"))], { intendedAmount: cash("120") }), sharedRoute),
    ];
    for (const r of cases) {
      expectCoherent(r);
      if (r.commitPlan.committable) expect(overConsumed(r.postState!)).toEqual([]);
    }
  });

  it("9B. a published post-state never contradicts a SATISFIED verdict", () => {
    resetIds();
    const r = simulate(base(100), proposal("tx-9b", [
      consume("e1", nodeOf("prov-a"), cash("50")),
      consume("e2", nodeOf("prov-a"), cash("50")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(overConsumed(r.postState!)).toEqual([]);
    expect(amountOf(r.postState!.capacities.find((c) => c.capacityNodeId === nodeOf("prov-a"))!.remaining as never)).toBe("0");
  });

  it("9C. a refused composition mutates neither the caller's state nor the caller's ledger", () => {
    resetIds();
    const led = [usage("u1", "30", onProvision("prov-a"))];
    const w = base(100, led);
    const beforeState = JSON.stringify(w.state);
    const beforeLedger = JSON.stringify(led);

    const r = simulate(w, proposal("tx-9c", [
      consume("e1", nodeOf("prov-a"), cash("60")),
      consume("e2", nodeOf("prov-a"), cash("60")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expectFailsClosed(r);
    expect(JSON.stringify(w.state)).toBe(beforeState);
    expect(JSON.stringify(led)).toBe(beforeLedger);
  });
});

// ---------------------------------------------------------------------------
// 14. Property / metamorphic invariants
// ---------------------------------------------------------------------------
describe("14. property invariants over generated compositions", () => {
  // Deterministic generator. No randomness without a fixed seed, no network, no model call.
  let seed = 20260920;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const draws = (n: number, max: number) => Array.from({ length: n }, () => String(1 + Math.floor(rnd() * max)));

  it("14A. aggregate capacity: sum within the limit succeeds, beyond it fails closed", () => {
    for (let trial = 0; trial < 40; trial++) {
      resetIds();
      const cap = 100;
      const existing = Math.floor(rnd() * 30);
      const xs = draws(1 + Math.floor(rnd() * 4), 45);
      const total = existing + xs.reduce((a, b) => a + Number(b), 0);
      const led = existing > 0 ? [usage("u1", String(existing), onProvision("prov-a"))] : [];
      const r = simulate(base(cap, led), proposal(`p${trial}`, xs.map((x, i) => consume(`e${i + 1}`, nodeOf("prov-a"), cash(x)))),
        route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

      expectCoherent(r);
      if (total <= cap) {
        expect(r.selectedPathResult).toBe("SATISFIED");
        expect(amountOf(r.postState!.capacities.find((c) => c.capacityNodeId === nodeOf("prov-a"))!.usage as never)).toBe(String(total));
      } else {
        expect(r.selectedPathResult).not.toBe("SATISFIED");
        expect(r.commitPlan.committable).toBe(false);
      }
    }
  });

  it("14B. shared capacity: the pool bounds the sum of member draws", () => {
    for (let trial = 0; trial < 25; trial++) {
      resetIds();
      const poolCap = 100;
      const xs = draws(2, 45);
      const total = xs.reduce((a, b) => a + Number(b), 0);
      const r = simulate(shared(poolCap, 500), proposal(`q${trial}`, [
        consume("e1", nodeOf("prov-a"), cash(xs[0]!)),
        consume("e2", nodeOf("prov-b"), cash(xs[1]!)),
      ], { intendedAmount: cash(String(total)) }), sharedRoute);

      expectCoherent(r);
      if (total > poolCap) expect(r.commitPlan.committable).toBe(false);
    }
  });

  it("14C. determinism: identical semantic input replays byte-identically", () => {
    const run = () => {
      resetIds();
      return simulate(base(100), proposal("tx-14c", [
        consume("e1", nodeOf("prov-a"), cash("30")),
        consume("e2", nodeOf("prov-a"), cash("30")),
      ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));
    };
    const a = run(); const b = run(); const c = run();
    expect(a.transactionIdentity.transactionHash).toBe(b.transactionIdentity.transactionHash);
    expect(b.transactionIdentity.transactionHash).toBe(c.transactionIdentity.transactionHash);
    expect(a.postStateIdentity?.postStateHash).toBe(b.postStateIdentity?.postStateHash);
    expect(JSON.stringify(a.capacityEffects)).toBe(JSON.stringify(b.capacityEffects));
  });

  it("14D. atomicity: a fatal composition conflict publishes no successor state at all", () => {
    resetIds();
    const r = simulate(base(100, [usage("u1", "40", onProvision("prov-a"))]), proposal("tx-14d", [
      supersede("e1", "u1", cash("10")),
      supersede("e2", "u1", cash("20")),
    ]), route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(r.postState).toBeNull();
    expect(r.postStateIdentity).toBeNull();
    expect(r.commitPlan.committable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Identity metamorphic properties under the corrected ordering contract
// ---------------------------------------------------------------------------
describe("11. identity under composition", () => {
  it("11A. reordering effects that genuinely change the transition changes identity", () => {
    resetIds();
    const led = [usage("u1", "40", onProvision("prov-a"))];
    const a = simulate(base(100, led), proposal("tx-11a", [restore("e1", "u1"), consume("e2", nodeOf("prov-a"), cash("50"))]),
      route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));
    resetIds();
    const b = simulate(base(100, led), proposal("tx-11a", [consume("e2", nodeOf("prov-a"), cash("50")), restore("e1", "u1")]),
      route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(a.transactionIdentity.transactionHash).not.toBe(b.transactionIdentity.transactionHash);
  });

  it("11B. a display-only change leaves every identity untouched", () => {
    resetIds();
    const a = simulate(base(100), proposal("tx-11b", [consume("e1", nodeOf("prov-a"), cash("10"))]),
      route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));
    resetIds();
    const b = simulate(base(100), proposal("tx-11b", [consume("e1", nodeOf("prov-a"), cash("10"))], { label: "a completely different display name" }),
      route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(a.transactionIdentity.transactionHash).toBe(b.transactionIdentity.transactionHash);
    expect(a.postStateIdentity?.postStateHash).toBe(b.postStateIdentity?.postStateHash);
  });

  it("11C. a changed amount changes identity", () => {
    resetIds();
    const a = simulate(base(100), proposal("tx-11c", [consume("e1", nodeOf("prov-a"), cash("10"))]),
      route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));
    resetIds();
    const b = simulate(base(100), proposal("tx-11c", [consume("e1", nodeOf("prov-a"), cash("11"))]),
      route({ capacityNodeIds: [nodeOf("prov-a")], ruleIds: ["prov-a"] }));

    expect(a.transactionIdentity.transactionHash).not.toBe(b.transactionIdentity.transactionHash);
  });
});
