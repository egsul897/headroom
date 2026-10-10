/**
 * Product-layer recipes → Phase 4D effect composition.
 * Labels are metadata only; restore requires contractual authority.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  ALL_BUSINESS_TRANSACTION_TYPES,
  recipeAmendmentAffectingCapacity,
  recipeAssetSale,
  recipeBasketReclassification,
  recipeDebtIncurrence,
  recipeDebtRepayment,
  recipeDividendPayment,
  recipeEquityContribution,
  recipeInvestmentReturn,
  recipeReinvestment,
  recipeRestrictedInvestment,
  recipeSecuredBorrowing,
  type RecipeIdentity,
} from "@/lib/product/north-star-workflow/transaction-effect-recipes";
import {
  amountOf,
  cash,
  election,
  nodeOf,
  provision,
  resetIds,
  route,
  simulate,
  usage,
  onProvision,
  world,
  MONEY,
} from "../contract-model/runtime/transaction/helpers";
import { simulateTransaction } from "@/lib/contract-model/runtime/transaction";

beforeEach(resetIds);

const identity = (id: string): RecipeIdentity => ({
  transactionId: id,
  companyId: "tx-org",
  instrumentKey: "tx-facility",
  effectiveAsOf: "2026-06-30",
  provenance: { source: "recipe-test", sourceVersion: "v1", approvalRef: null },
  approvalStatus: "HYPOTHETICAL",
});

describe("transaction-effect-recipes inventory", () => {
  it("covers all twelve business transaction types", () => {
    expect(ALL_BUSINESS_TRANSACTION_TYPES).toHaveLength(12);
    expect(new Set(ALL_BUSINESS_TRANSACTION_TYPES).size).toBe(12);
  });
});

describe("recipes compose Phase 4D effects without form engines", () => {
  it("debt incurrence consumes capacity and optionally adjusts debt metric", () => {
    const r = recipeDebtIncurrence(identity("tx-di"), {
      draws: [{ effectId: "e1", capacityNodeId: nodeOf("p-a"), amount: cash("25"), ruleId: "p-a" }],
      debtMetric: {
        effectId: "m1",
        metricKey: "total-debt",
        asOf: "2026-06-30",
        adjustment: { kind: "DELTA", value: cash("25") },
      },
    });
    expect(r.ok).toBe(true);
    expect(r.effects.map((e) => e.kind)).toEqual(["CONSUME_CAPACITY", "CHANGE_METRIC"]);
    expect(r.transaction!.category).toBe("DEBT_INCURRENCE");
  });

  it("debt repayment refuses restore without contractual authority", () => {
    const r = recipeDebtRepayment(identity("tx-rp"), {
      restores: [{ effectId: "e1", usageId: "u1", reason: "repaid", contractualAuthorityRef: "" }],
    });
    expect(r.ok).toBe(false);
    expect(r.limitations.map((l) => l.code)).toContain("MISSING_CONTRACTUAL_AUTHORITY");
    expect(r.effects).toEqual([]);
    expect(r.transaction).toBeNull();
  });

  it("debt repayment with authority emits RESTORE_CAPACITY", () => {
    const r = recipeDebtRepayment(identity("tx-rp2"), {
      restores: [{
        effectId: "e1",
        usageId: "u1",
        reason: "repaid",
        contractualAuthorityRef: "§7.2 reduction of Indebtedness",
      }],
    });
    expect(r.ok).toBe(true);
    expect(r.effects[0]!.kind).toBe("RESTORE_CAPACITY");
    expect((r.effects[0] as { reason: string }).reason).toContain("authority:§7.2");
  });

  it("secured borrowing states multi-node draws without inferring companions", () => {
    const r = recipeSecuredBorrowing(identity("tx-sb"), {
      draws: [
        { effectId: "e-debt", capacityNodeId: nodeOf("debt"), amount: cash("50"), ruleId: "debt" },
        { effectId: "e-lien", capacityNodeId: nodeOf("lien"), amount: cash("50"), ruleId: "lien" },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.selectedPath.capacityNodeIds).toEqual([nodeOf("debt"), nodeOf("lien")]);
  });

  it("dividend, investment, equity, asset sale, reinvestment, investment return, reclass recipes build", () => {
    expect(recipeDividendPayment(identity("d"), {
      draws: [{ effectId: "e", capacityNodeId: nodeOf("rp"), amount: cash("10"), ruleId: "rp" }],
    }).ok).toBe(true);
    expect(recipeRestrictedInvestment(identity("i"), {
      draws: [{ effectId: "e", capacityNodeId: nodeOf("inv"), amount: cash("10"), ruleId: "inv" }],
    }).ok).toBe(true);
    expect(recipeEquityContribution(identity("eq"), {
      metrics: [{
        effectId: "m",
        metricKey: "equity-proceeds",
        asOf: "2026-06-30",
        adjustment: { kind: "DELTA", value: cash("10") },
      }],
    }).ok).toBe(true);
    expect(recipeAssetSale(identity("as"), {
      metrics: [{
        effectId: "m",
        metricKey: "cash",
        asOf: "2026-06-30",
        adjustment: { kind: "DELTA", value: cash("10") },
      }],
      eventDescription: "Asset Sale Event",
    }).ok).toBe(true);
    expect(recipeReinvestment(identity("re"), {
      draws: [{ effectId: "e", capacityNodeId: nodeOf("inv"), amount: cash("10"), ruleId: "inv" }],
      eventDescription: "Reinvestment Period",
    }).ok).toBe(true);
    expect(recipeInvestmentReturn(identity("ir"), {
      metrics: [{
        effectId: "m",
        metricKey: "cash",
        asOf: "2026-06-30",
        adjustment: { kind: "DELTA", value: cash("5") },
      }],
      restores: [{
        effectId: "r",
        usageId: "u-inv",
        reason: "investment returned",
        contractualAuthorityRef: "§investment return / reduction",
      }],
    }).ok).toBe(true);
    expect(recipeBasketReclassification(identity("br"), {
      effectId: "e",
      election: election("el-1", "p-src", "p-dst", "10"),
    }).ok).toBe(true);
  });

  it("amendment recipe fails closed and never silently mutates capacity", () => {
    const r = recipeAmendmentAffectingCapacity(identity("am"), {
      amendmentRef: "Second Amendment §2",
      metrics: [{
        effectId: "m",
        metricKey: "ebitda",
        asOf: "2026-06-30",
        adjustment: { kind: "SET", value: cash("999") },
      }],
    });
    expect(r.ok).toBe(false);
    expect(r.transaction).toBeNull();
    expect(r.limitations.map((l) => l.code)).toContain("AMENDMENT_REQUIRES_NEW_CAPACITY_GRAPH");
  });

  it("renaming display label does not change Phase 4D identity or consequences", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))] });
    const a = recipeDebtIncurrence(identity("tx-lab"), {
      draws: [{ effectId: "e1", capacityNodeId: nodeOf("p-a"), amount: cash("20"), ruleId: "p-a" }],
      label: "wording A",
    });
    const b = recipeDebtIncurrence(identity("tx-lab"), {
      draws: [{ effectId: "e1", capacityNodeId: nodeOf("p-a"), amount: cash("20"), ruleId: "p-a" }],
      label: "entirely different wording",
    });
    const path = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    const ra = simulateTransaction({
      transaction: { ...a.transaction!, label: "wording A" },
      currentState: w.state,
      capacityGraph: w.graph,
      selectedPath: path,
      inputs: w.inputs,
      context: w.context,
    });
    const rb = simulateTransaction({
      transaction: { ...b.transaction!, label: "entirely different wording" },
      currentState: w.state,
      capacityGraph: w.graph,
      selectedPath: path,
      inputs: w.inputs,
      context: w.context,
    });
    // label is excluded from identity; category remains part of canonical form (metadata for behaviour).
    expect(ra.simulationIdentity.simulationId).toBe(rb.simulationIdentity.simulationId);
    expect(amountOf(ra.postState!.capacities[0]!.usage)).toBe("20");
    expect(amountOf(rb.postState!.capacities[0]!.usage)).toBe("20");
  });
});

describe("recipe-driven simulate smoke", () => {
  it("authorized repayment restores capacity via Phase 4D", () => {
    const w = world({
      rules: [provision("p-a", MONEY(100))],
      ledger: [usage("u1", "40", onProvision("p-a"))],
    });
    const recipe = recipeDebtRepayment(identity("tx-restore"), {
      restores: [{
        effectId: "e1",
        usageId: "u1",
        reason: "repaid",
        contractualAuthorityRef: "§facility repayment",
      }],
    });
    const r = simulate(w, recipe.transaction!, route({}));
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(amountOf(r.postState!.capacities[0]!.remaining)).toBe("100");
    expect(w.context.ledger![0]!.status).toBe("RECORDED");
  });
});
