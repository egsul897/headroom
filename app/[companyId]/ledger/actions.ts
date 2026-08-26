"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { LedgerBasket, LedgerDirection } from "@prisma/client";

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

export async function deleteLedgerEntry(companyId: string, id: string) {
  const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id } });
  if (entry.companyId !== companyId) throw new Error(`Ledger entry ${id} does not belong to this company`);
  await prisma.ledgerEntry.delete({ where: { id } });
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
