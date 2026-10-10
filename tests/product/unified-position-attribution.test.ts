import { describe, expect, it } from "vitest";
import {
  applyAttributedUsageToCapacity,
  deserializeAttributedUtilization,
  indexAttributedUsages,
  resolveRowAttribution,
  serializeAttributedUtilization,
  type AttributedLedgerUsageInput,
} from "@/lib/product/unified-position/attributed-utilization";
import { buildSharedProductCapacityViews, assertProductCapacityConsistency } from "@/lib/capacity";

function usage(args: {
  usageId: string;
  ruleId?: string;
  amountUsd?: string;
  status?: string;
}): AttributedLedgerUsageInput {
  return {
    usageId: args.usageId,
    amount: { amount: args.amountUsd ?? "25000000", currency: "USD" },
    capacityPath: { kind: "RULE", ruleId: args.ruleId ?? "§7.02(b)" },
    status: args.status ?? "RECORDED",
  };
}

describe("attributed utilization", () => {
  it("aggregates active usages by ruleId and never treats missing as zero", () => {
    const index = indexAttributedUsages("co", [
      usage({ usageId: "u1", ruleId: "§7.02(b)", amountUsd: "25000000" }),
      usage({ usageId: "u2", ruleId: "§7.02(b)", amountUsd: "10000000" }),
      usage({ usageId: "u3", ruleId: "other", amountUsd: "5000000", status: "SUPERSEDED" }),
    ]);
    expect(index.activeUsageCount).toBe(2);
    expect(index.byKey.get("§7.02(b)")?.used).toBe(35_000_000);
    expect(resolveRowAttribution(index, ["nope"])).toBeNull();
    expect(resolveRowAttribution(index, ["§7.02(b)"])?.used).toBe(35_000_000);
  });

  it("shows known attributed used but withholds remaining without completeness cert (#237)", () => {
    const index = indexAttributedUsages("co", [usage({ usageId: "u1", ruleId: "GEN", amountUsd: "50000000" })]);
    const hit = resolveRowAttribution(index, ["GEN"]);
    const tracked = applyAttributedUsageToCapacity({
      currentCapacity: 200,
      capacityUnlimited: false,
      attributed: hit,
      supportsRemainingClaim: false,
    });
    expect(tracked.usageState).toBe("TRACKED");
    expect(tracked.used).toBe(50);
    expect(tracked.remaining).toBeNull();
    expect(tracked.utilizationPct).toBeNull();
    expect(tracked.publicationLabel).toBe("KNOWN_ATTRIBUTED_ONLY");
    expect(tracked.remainingStatus).toBe("GROSS_ONLY");

    const unknown = applyAttributedUsageToCapacity({
      currentCapacity: 200,
      capacityUnlimited: false,
      attributed: null,
    });
    expect(unknown.usageState).toBe("NOT_TRACKED");
    expect(unknown.used).toBeNull();
    expect(unknown.remaining).toBeNull();
    expect(unknown.utilizationPct).toBeNull();
  });

  it("publishes remaining only when supportsRemainingClaim is true (cert path)", () => {
    const index = indexAttributedUsages("co", [usage({ usageId: "u1", ruleId: "GEN", amountUsd: "50000000" })]);
    const hit = resolveRowAttribution(index, ["GEN"]);
    const ok = applyAttributedUsageToCapacity({
      currentCapacity: 200,
      capacityUnlimited: false,
      attributed: hit,
      supportsRemainingClaim: true,
    });
    expect(ok.remaining).toBe(150);
    expect(ok.utilizationPct).toBeCloseTo(25);
    expect(ok.publicationLabel).toBe("SUPPORTED_REMAINING");
  });

  it("never publishes remaining for synthetic evidence without allowSyntheticRemaining", () => {
    const index = indexAttributedUsages("co", [usage({ usageId: "u1", ruleId: "GEN", amountUsd: "75000000" })]);
    const hit = resolveRowAttribution(index, ["GEN"]);
    const blocked = applyAttributedUsageToCapacity({
      currentCapacity: 10153.846153846154,
      capacityUnlimited: false,
      attributed: hit,
      supportsRemainingClaim: true,
      authenticity: "SYNTHETIC_LABELED",
      allowSyntheticRemaining: false,
    });
    expect(blocked.used).toBe(75);
    expect(blocked.remaining).toBeNull();
    expect(blocked.publicationLabel).toBe("KNOWN_ATTRIBUTED_ONLY");
  });

  it("round-trips serialization for client reflow", () => {
    const index = indexAttributedUsages("co", [usage({ usageId: "u1", ruleId: "X", amountUsd: "1000000" })]);
    const again = deserializeAttributedUtilization(serializeAttributedUtilization(index));
    expect(again?.byKey.get("X")?.used).toBe(1_000_000);
  });

  it("Position / Simulate / Ask share one capacity view for identical inputs", () => {
    const views = buildSharedProductCapacityViews({
      gross: {
        amount: 200_000_000,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "GEN",
      },
      utilization: {
        capacityRuleId: "GEN",
        asOf: "2026-06-30",
        records: [
          {
            usageId: "u1",
            kind: "ATTRIBUTED_RULE",
            amount: 50_000_000,
            currency: "USD",
            effectiveAsOf: "2026-06-30",
            capacityRuleId: "GEN",
            sharedCapacityId: null,
            legacyBasketFamily: null,
            entityKey: null,
            status: "RECORDED",
            approvalState: "APPROVED",
            sourceLabel: "test",
            authenticity: "AUTHENTIC",
          },
        ],
        // no completeness cert → remaining withheld
      },
    });
    expect(assertProductCapacityConsistency(views)).toEqual({ ok: true });
    expect(views.POSITION.knownUtilization).toBe(50_000_000);
    expect(views.POSITION.supportedRemainingCapacity).toBeNull();
    expect(views.POSITION.mayPublishAvailable).toBe(false);
    expect(views.SIMULATE.supportedRemainingCapacity).toBe(views.POSITION.supportedRemainingCapacity);
    expect(views.ASK.publicationLabel).toBe(views.POSITION.publicationLabel);
  });
});
