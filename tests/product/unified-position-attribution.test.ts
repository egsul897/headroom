import { describe, expect, it } from "vitest";
import {
  applyAttributedUsageToCapacity,
  deserializeAttributedUtilization,
  indexAttributedUsages,
  resolveRowAttribution,
  serializeAttributedUtilization,
} from "@/lib/product/unified-position/attributed-utilization";
import type { LedgerUsageRecord } from "@/lib/contract-model/north-star-bridge";

function usage(args: {
  usageId: string;
  ruleId?: string;
  amountUsd?: string;
  status?: LedgerUsageRecord["status"];
}): LedgerUsageRecord {
  return {
    usageId: args.usageId,
    companyId: "co",
    instrumentKey: "ca",
    effectiveAsOf: "2026-06-30",
    amount: { amount: args.amountUsd ?? "25000000", currency: "USD" },
    capacityPath: { kind: "RULE", ruleId: args.ruleId ?? "§7.02(b)" },
    transactionRef: null,
    status: args.status ?? "RECORDED",
    supersededByUsageId: null,
    provenance: {
      source: "test",
      sourceVersion: "1",
      approvalRef: "apr",
      approvalState: "APPROVED",
    },
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

  it("converts ledger dollars to overview $M and keeps NOT_TRACKED honest", () => {
    const index = indexAttributedUsages("co", [usage({ usageId: "u1", ruleId: "GEN", amountUsd: "50000000" })]);
    const hit = resolveRowAttribution(index, ["GEN"]);
    const tracked = applyAttributedUsageToCapacity({
      currentCapacity: 200,
      capacityUnlimited: false,
      attributed: hit,
    });
    expect(tracked.usageState).toBe("TRACKED");
    expect(tracked.used).toBe(50);
    expect(tracked.remaining).toBe(150);
    expect(tracked.utilizationPct).toBeCloseTo(25);

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

  it("round-trips serialization for client reflow", () => {
    const index = indexAttributedUsages("co", [usage({ usageId: "u1", ruleId: "X", amountUsd: "1000000" })]);
    const again = deserializeAttributedUtilization(serializeAttributedUtilization(index));
    expect(again?.byKey.get("X")?.used).toBe(1_000_000);
  });
});
