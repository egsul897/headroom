"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { LedgerBasket, LedgerDirection } from "@prisma/client";
import {
  appendContractLedgerUsage,
  supersedeContractLedgerUsage,
} from "@/lib/product/north-star-workflow";

const VALID_BASKETS: LedgerBasket[] = ["EQUITY", "DEBT_INCUR", "DEBT_REPAY", "ASSET_SALE", "DIVIDEND", "INVESTMENT"];
const VALID_DIRECTIONS: LedgerDirection[] = ["CREDIT", "DEBIT"];

/** Generalized off app/ledger/actions.ts (Coherent-only) - same real writes, companyId-scoped. */
export async function addLedgerEntry(companyId: string, formData: FormData) {
  const basket = String(formData.get("basket"));
  const direction = String(formData.get("direction"));
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") || "").trim() || "Untitled entry";

  if (!VALID_BASKETS.includes(basket as LedgerBasket)) throw new Error(`Invalid basket: ${basket}`);
  if (!VALID_DIRECTIONS.includes(direction as LedgerDirection)) throw new Error(`Invalid direction: ${direction}`);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");

  await prisma.ledgerEntry.create({
    data: { companyId, date: new Date(), description, basket: basket as LedgerBasket, amount, direction: direction as LedgerDirection, source: "manual" },
  });

  revalidatePath(`/${companyId}`, "layout");
}

/**
 * Withdraw a ledger entry from the live model without erasing it.
 * Sets status SUPERSEDED and records supersededAt. Does not delete the row,
 * does not write a reversing entry, and leaves supersededById null because
 * there is no successor fact. A second call fails closed.
 */
export async function supersedeLedgerEntry(companyId: string, id: string) {
  const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id } });
  if (entry.companyId !== companyId) throw new Error(`Ledger entry ${id} does not belong to this company`);
  if (entry.status === "SUPERSEDED") throw new Error(`Ledger entry ${id} is already superseded`);
  await prisma.ledgerEntry.update({
    where: { id },
    data: { status: "SUPERSEDED", supersededAt: new Date(), supersededById: null },
  });
  revalidatePath(`/${companyId}`, "layout");
}

/** Mirrors the "commit to ledger" buttons on the Simulate tab - a cleared dividend/Investment becomes a real DEBIT entry against the shared restricted-payment pool. */
export async function commitRestrictedPayment(companyId: string, kind: "DIVIDEND" | "INVESTMENT", amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");
  await prisma.ledgerEntry.create({
    data: {
      companyId,
      date: new Date(),
      description: `Simulated ${kind === "DIVIDEND" ? "dividend/buyback" : "Investment"} — $${Math.round(amount)}M`,
      basket: kind,
      amount,
      direction: "DEBIT",
      source: "Simulate tab",
    },
  });
  revalidatePath(`/${companyId}`, "layout");
}

/** Append attributed Phase 4C contract-ledger usage (North Star — distinct from legacy LedgerEntry). */
export async function addContractLedgerUsageAction(companyId: string, formData: FormData) {
  const usageId = String(formData.get("usageId") || "").trim() || `usage-${companyId}-${Date.now()}`;
  const amount = String(formData.get("amount") || "").trim();
  const currency = String(formData.get("currency") || "USD").trim() || "USD";
  const ruleId = String(formData.get("ruleId") || "").trim();
  const effectiveAsOf = String(formData.get("effectiveAsOf") || "").trim();
  const instrumentKey = String(formData.get("instrumentKey") || "company").trim() || "company";
  if (!amount || !ruleId || !effectiveAsOf) throw new Error("amount, ruleId, and effectiveAsOf are required");
  const result = await appendContractLedgerUsage({
    companyId,
    usageId,
    instrumentKey,
    effectiveAsOf,
    amount,
    currency,
    ruleId,
    transactionRef: usageId,
    approvalRef: `manual-ledger-${usageId}`,
  });
  if (!result.ok) throw new Error(result.issues?.join("; ") || "append failed");
  revalidatePath(`/${companyId}/ledger`);
  revalidatePath(`/${companyId}/capacity`);
  revalidatePath(`/${companyId}/certificates`);
}

/** Supersede a Phase 4C usage with an attributed successor (never delete). */
export async function supersedeContractLedgerUsageAction(companyId: string, formData: FormData) {
  const predecessorUsageId = String(formData.get("predecessorUsageId") || "").trim();
  const successorAmount = String(formData.get("successorAmount") || "").trim();
  const currency = String(formData.get("currency") || "USD").trim() || "USD";
  const ruleId = String(formData.get("ruleId") || "").trim();
  const effectiveAsOf = String(formData.get("effectiveAsOf") || "").trim();
  const supersessionRef = String(formData.get("supersessionRef") || "").trim() || `sup-${predecessorUsageId}`;
  const supersededBy = String(formData.get("supersededBy") || "").trim() || "workspace-user";
  if (!predecessorUsageId || !successorAmount || !ruleId || !effectiveAsOf) {
    throw new Error("predecessorUsageId, successorAmount, ruleId, and effectiveAsOf are required");
  }
  const result = await supersedeContractLedgerUsage({
    companyId,
    predecessorUsageId,
    successorAmount,
    currency,
    ruleId,
    effectiveAsOf,
    supersessionRef,
    supersededBy,
  });
  if (!result.ok) throw new Error(result.issues?.join("; ") || "supersede failed");
  revalidatePath(`/${companyId}/ledger`);
  revalidatePath(`/${companyId}/capacity`);
}
