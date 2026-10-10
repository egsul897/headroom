/**
 * Shared-lien aggregate conservation at PR #253 tip.
 *
 * Proves (or would fail-closed reveal) that a secured transaction drawing on
 * DEBT + LIEN capacity nodes that are members of one overlapping shared pool
 * aggregates both draws against the pool — not per-leg alone.
 *
 * A passing zero-probe or per-leg lien existence test is NOT evidence of this
 * property. This is a transaction-level dual-draw against a tight shared pool.
 */
import { describe, expect, it } from "vitest";
import {
  MONEY,
  cash,
  consume,
  nodeOf,
  pool,
  proposal,
  provision,
  resetIds,
  route,
  simulate,
  usage,
  world,
  onProvision,
  amountOf,
  codes,
} from "./helpers";

function expectFailsClosed(r: ReturnType<typeof simulate>) {
  expect(r.postState).toBeNull();
  expect(r.commitPlan.committable).toBe(false);
  expect(["INSUFFICIENT_CAPACITY", "NOT_SATISFIED", "INDETERMINATE"]).toContain(r.selectedPathResult);
}

describe("shared-lien aggregate conservation (debt ∩ lien × overlapping pool)", () => {
  it("debt+lien each fit member caps but jointly exceed shared pool → fail closed", () => {
    resetIds();
    // Member standalone rooms are large ($500); shared lien/debt pool is $100.
    // Economic secured draw: $60 debt + $60 lien stated on the dual path.
    const w = world({
      rules: [
        provision("debt-1", MONEY(500), { action: "INCUR_DEBT", covenantFamily: "INDEBTEDNESS" }),
        provision("lien-1", MONEY(500), {
          action: "CREATE_LIEN",
          covenantFamily: "LIENS",
          ruleType: "QUANTITATIVE_PERMISSION",
        }),
      ],
      pools: [pool("shared-secured-pool", MONEY(100), ["debt-1", "lien-1"])],
    });
    const r = simulate(
      w,
      proposal(
        "tx-shared-lien-over",
        [
          consume("e-debt", nodeOf("debt-1"), cash("60")),
          consume("e-lien", nodeOf("lien-1"), cash("60")),
        ],
        { intendedAmount: cash("120") },
      ),
      route({
        capacityNodeIds: [nodeOf("debt-1"), nodeOf("lien-1")],
        ruleIds: ["debt-1", "lien-1"],
        sharedCapacityIds: ["shared-secured-pool"],
      }),
    );

    expectFailsClosed(r);
    expect(
      codes(r.limitations).some(
        (c) => c === "INSUFFICIENT_CAPACITY" || c === "INSUFFICIENT_AGGREGATE_CAPACITY",
      ),
    ).toBe(true);
    // Second draw must see residual pool headroom after the first — not a fresh $100.
    expect(r.capacityEffects[1]!.outcome).toBe("INSUFFICIENT_CAPACITY");
    expect(amountOf(r.capacityEffects[1]!.availableAmount as never)).toBe("40");
  });

  it("debt+lien that exactly exhaust the shared pool are SATISFIED (aggregate, not double-count)", () => {
    resetIds();
    const w = world({
      rules: [
        provision("debt-1", MONEY(500), { action: "INCUR_DEBT" }),
        provision("lien-1", MONEY(500), { action: "CREATE_LIEN", covenantFamily: "LIENS" }),
      ],
      pools: [pool("shared-secured-pool", MONEY(100), ["debt-1", "lien-1"])],
    });
    const r = simulate(
      w,
      proposal(
        "tx-shared-lien-exact",
        [
          consume("e-debt", nodeOf("debt-1"), cash("60")),
          consume("e-lien", nodeOf("lien-1"), cash("40")),
        ],
        { intendedAmount: cash("100") },
      ),
      route({
        capacityNodeIds: [nodeOf("debt-1"), nodeOf("lien-1")],
        ruleIds: ["debt-1", "lien-1"],
        sharedCapacityIds: ["shared-secured-pool"],
      }),
    );

    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.commitPlan.committable).toBe(true);
    const sc = r.postState!.sharedConstraints.find((s) => s.sharedCapacityId === "shared-secured-pool")!;
    expect(amountOf(sc.usage as never)).toBe("100");
    expect(amountOf(sc.remaining as never)).toBe("0");
  });

  it("historical shared usage counts toward debt+lien aggregate (not reset per leg)", () => {
    resetIds();
    const w = world({
      rules: [
        provision("debt-1", MONEY(500), { action: "INCUR_DEBT" }),
        provision("lien-1", MONEY(500), { action: "CREATE_LIEN", covenantFamily: "LIENS" }),
      ],
      pools: [pool("shared-secured-pool", MONEY(100), ["debt-1", "lien-1"])],
      ledger: [usage("u-hist", "50", onProvision("debt-1"))],
    });
    // 50 historical + 30 debt + 30 lien = 110 > 100 pool
    const r = simulate(
      w,
      proposal(
        "tx-shared-lien-hist",
        [
          consume("e-debt", nodeOf("debt-1"), cash("30")),
          consume("e-lien", nodeOf("lien-1"), cash("30")),
        ],
        { intendedAmount: cash("60") },
      ),
      route({
        capacityNodeIds: [nodeOf("debt-1"), nodeOf("lien-1")],
        ruleIds: ["debt-1", "lien-1"],
        sharedCapacityIds: ["shared-secured-pool"],
      }),
    );
    expectFailsClosed(r);
  });

  it("per-leg headroom alone must not authorize dual-path when pool is binding", () => {
    resetIds();
    // Each member has $80 room; pool has $50. Dual $40+$40 fits each leg, exceeds pool.
    const w = world({
      rules: [
        provision("debt-1", MONEY(80), { action: "INCUR_DEBT" }),
        provision("lien-1", MONEY(80), { action: "CREATE_LIEN", covenantFamily: "LIENS" }),
      ],
      pools: [pool("shared-secured-pool", MONEY(50), ["debt-1", "lien-1"])],
    });
    const r = simulate(
      w,
      proposal(
        "tx-shared-lien-leg-trap",
        [
          consume("e-debt", nodeOf("debt-1"), cash("40")),
          consume("e-lien", nodeOf("lien-1"), cash("40")),
        ],
        { intendedAmount: cash("80") },
      ),
      route({
        capacityNodeIds: [nodeOf("debt-1"), nodeOf("lien-1")],
        ruleIds: ["debt-1", "lien-1"],
        sharedCapacityIds: ["shared-secured-pool"],
      }),
    );
    expectFailsClosed(r);
    // Explicitly: not SATISFIED merely because each leg ≤ 80.
    expect(r.selectedPathResult).not.toBe("SATISFIED");
  });
});
