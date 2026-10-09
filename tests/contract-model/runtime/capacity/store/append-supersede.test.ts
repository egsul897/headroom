/**
 * Phase 4C contract ledger store — append + supersession (never hard-delete).
 */
import { describe, expect, it } from "vitest";
import { InMemoryContractLedgerStore, buildLedgerIndex } from "@/lib/contract-model/runtime/capacity";
import type { LedgerUsageRecord } from "@/lib/contract-model/runtime/capacity";

const CO = "ns-ledger-co";
const INST = "term-loan-a";

function usage(over: Partial<LedgerUsageRecord> & Pick<LedgerUsageRecord, "usageId" | "amount">): LedgerUsageRecord {
  const { usageId, amount, ...rest } = over;
  return {
    usageId,
    companyId: CO,
    instrumentKey: INST,
    effectiveAsOf: "2026-03-15",
    amount,
    capacityPath: { kind: "RULE", ruleId: "rule-general-debt" },
    transactionRef: `txn-${usageId}`,
    status: "RECORDED",
    supersededByUsageId: null,
    provenance: {
      source: "synthetic-certificate-schedule",
      sourceVersion: "v1",
      approvalRef: "apr-ledger-1",
      approvalState: "APPROVED",
    },
    ...rest,
  };
}

describe("InMemoryContractLedgerStore", () => {
  it("appends attributed usage and feeds buildLedgerIndex", () => {
    const store = new InMemoryContractLedgerStore();
    const r = store.appendUsage({
      usage: usage({ usageId: "u-1", amount: { amount: "25000000", currency: "USD" } }),
    });
    expect(r.ok).toBe(true);
    expect(store.getActiveUsages(CO)).toHaveLength(1);
    const idx = buildLedgerIndex(store.getUsages(CO));
    expect(idx.issues.filter((i) => i.code === "DUPLICATE_USAGE_ID")).toHaveLength(0);
  });

  it("refuses unattributed UNRESOLVED usage with empty candidates", () => {
    const store = new InMemoryContractLedgerStore();
    const r = store.appendUsage({
      usage: usage({
        usageId: "u-bad",
        amount: { amount: "1", currency: "USD" },
        capacityPath: { kind: "UNRESOLVED", candidateRuleIds: [], reason: "unknown" },
      }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.code).toBe("MISSING_ATTRIBUTION");
  });

  it("supersedes without deleting predecessor; predecessor stays queryable as SUPERSEDED", () => {
    const store = new InMemoryContractLedgerStore();
    expect(store.appendUsage({
      usage: usage({ usageId: "u-old", amount: { amount: "10000000", currency: "USD" } }),
    }).ok).toBe(true);

    const sup = store.supersedeUsage({
      predecessorUsageId: "u-old",
      successor: usage({ usageId: "u-new", amount: { amount: "12000000", currency: "USD" } }),
      supersessionRef: "corr-1",
      supersededAt: "2026-04-01T00:00:00Z",
      supersededBy: "controller",
    });
    expect(sup.ok).toBe(true);

    const old = store.getUsage("u-old")!;
    expect(old.status).toBe("SUPERSEDED");
    expect(old.supersededByUsageId).toBe("u-new");
    expect(store.getUsage("u-new")!.status).toBe("RECORDED");
    expect(store.getUsages(CO)).toHaveLength(2);
    expect(store.getActiveUsages(CO).map((u) => u.usageId)).toEqual(["u-new"]);
  });

  it("refuses duplicate usageId overwrite", () => {
    const store = new InMemoryContractLedgerStore();
    store.appendUsage({ usage: usage({ usageId: "u-dup", amount: { amount: "1", currency: "USD" } }) });
    const r = store.appendUsage({ usage: usage({ usageId: "u-dup", amount: { amount: "2", currency: "USD" } }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.code).toBe("DUPLICATE_USAGE_ID");
  });
});
