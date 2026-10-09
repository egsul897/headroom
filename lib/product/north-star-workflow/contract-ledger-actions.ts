/**
 * Product actions for the Phase 4C contract ledger (distinct from legacy LedgerEntry).
 */
import { prisma } from "@/lib/prisma";
import { PrismaContractLedgerStore } from "@/lib/contract-model/north-star-bridge";

export async function listContractLedgerForCompany(companyId: string) {
  const usages = await PrismaContractLedgerStore.open(prisma, companyId).then((s) => s.getUsages());
  return usages;
}

export async function supersedeContractLedgerUsage(args: {
  companyId: string;
  predecessorUsageId: string;
  successorAmount: string;
  currency: string;
  ruleId: string;
  effectiveAsOf: string;
  supersessionRef: string;
  supersededBy: string;
}): Promise<{ ok: boolean; issues?: string[] }> {
  const store = await PrismaContractLedgerStore.open(prisma, args.companyId);
  const pred = store.getUsage(args.predecessorUsageId);
  if (!pred) return { ok: false, issues: ["predecessor usage not found"] };
  if (pred.companyId !== args.companyId) return { ok: false, issues: ["company mismatch"] };
  if (pred.status === "SUPERSEDED") return { ok: false, issues: ["already superseded"] };

  const successorId = `${args.predecessorUsageId}-supersede-${Date.now()}`.slice(0, 180);
  const result = await store.supersedeUsage({
    predecessorUsageId: args.predecessorUsageId,
    successor: {
      usageId: successorId,
      companyId: args.companyId,
      instrumentKey: pred.instrumentKey,
      effectiveAsOf: args.effectiveAsOf,
      amount: { amount: args.successorAmount, currency: args.currency },
      capacityPath: { kind: "RULE", ruleId: args.ruleId },
      transactionRef: `supersede:${args.predecessorUsageId}`,
      status: "RECORDED",
      supersededByUsageId: null,
      provenance: {
        source: "product-ledger-supersession",
        sourceVersion: null,
        approvalRef: args.supersessionRef,
        approvalState: "APPROVED",
      },
    },
    supersessionRef: args.supersessionRef,
    supersededAt: new Date().toISOString(),
    supersededBy: args.supersededBy,
  });
  if (!result.ok) return { ok: false, issues: result.issues.map((i) => i.message) };
  return { ok: true };
}
