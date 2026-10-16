"use server";
import { requireTenantAction } from "@/lib/auth/guard";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { LedgerBasket, LedgerDirection } from "@prisma/client";
import {
  appendContractLedgerUsage,
  supersedeContractLedgerUsage,
} from "@/lib/product/north-star-workflow";
import { defaultManualUsageId } from "@/lib/product/north-star-workflow/usage-ids";
import { loadCovenantDataOrEmpty } from "@/lib/covenant-overview-service";
import { computeCovenantPosition, simulateRestrictedPayment } from "@/lib/covenant-engine";
import { resolveCanonicalFinancialAsOf } from "@/lib/product/canonical-financial-asof";
import { assertRuleIdResolves } from "@/lib/product/north-star-workflow/rule-id-resolves";

const VALID_BASKETS: LedgerBasket[] = ["EQUITY", "DEBT_INCUR", "DEBT_REPAY", "ASSET_SALE", "DIVIDEND", "INVESTMENT"];
const VALID_DIRECTIONS: LedgerDirection[] = ["CREDIT", "DEBIT"];

/** Generalized off app/ledger/actions.ts (Coherent-only) - same real writes, companyId-scoped. */
export async function addLedgerEntry(companyId: string, formData: FormData) {
  await requireTenantAction(companyId);
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
  await requireTenantAction(companyId);
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
export async function commitRestrictedPayment(companyId: string, kind: "DIVIDEND" | "INVESTMENT", amount: number, documentId: string) {
  await requireTenantAction(companyId);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");
  if (!documentId) throw new Error("documentId is required");
  // Rule 134: the Simulate UI only shows the commit button when the
  // CLIENT-side engine verdict is "clear" — but this action
  // previously trusted that verdict and wrote a capacity-affecting
  // ledger entry for ANY positive amount. A crafted direct call (or
  // a stale page) could commit a transaction the engine would block,
  // and legacy LedgerEntry rows feed restricted-payment capacity.
  // Re-run the same simulation server-side against the same
  // document waterfall and refuse unless it clears.
  const asOfDate = await resolveCanonicalFinancialAsOf(companyId).catch(() => new Date());
  const data = await loadCovenantDataOrEmpty(companyId, asOfDate);
  const position = computeCovenantPosition(data);
  const sim = simulateRestrictedPayment(data, position, documentId, amount, kind === "DIVIDEND" ? "dividend" : "investment");
  if (sim.status !== "clear") {
    throw new Error(
      `Commit refused: server-side simulation did not clear (status ${sim.status})${sim.reason ? `: ${sim.reason}` : ""}.`,
    );
  }
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
  await requireTenantAction(companyId);
  const usageId = String(formData.get("usageId") || "").trim() || defaultManualUsageId(companyId);
  const amount = String(formData.get("amount") || "").trim();
  const currency = String(formData.get("currency") || "USD").trim() || "USD";
  const ruleId = String(formData.get("ruleId") || "").trim();
  const effectiveAsOf = String(formData.get("effectiveAsOf") || "").trim();
  // Rule 107: never default a missing instrument key to the
  // fabricated generic "company" — require the user's real value.
  const instrumentKey = String(formData.get("instrumentKey") || "").trim();
  if (!amount || !ruleId || !effectiveAsOf || !instrumentKey) throw new Error("amount, ruleId, effectiveAsOf, and instrumentKey are required");
  // Rule 135: the manual form's ruleId is free text — refuse
  // unless it resolves (see assertRuleIdResolves). The
  // certificate-promotion path is exempt: its basketKeys are
  // system-derived from the certificate itself.
  await assertRuleIdResolves(companyId, ruleId);
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
  await requireTenantAction(companyId);
  const predecessorUsageId = String(formData.get("predecessorUsageId") || "").trim();
  const successorAmount = String(formData.get("successorAmount") || "").trim();
  const currency = String(formData.get("currency") || "USD").trim() || "USD";
  const ruleId = String(formData.get("ruleId") || "").trim();
  const effectiveAsOf = String(formData.get("effectiveAsOf") || "").trim();
  const supersessionRef = String(formData.get("supersessionRef") || "").trim() || `sup-${predecessorUsageId}`;
  // Rule 115: supersession attribution must be real — never
  // default to the generic "workspace-user".
  const supersededBy = String(formData.get("supersededBy") || "").trim();
  if (!predecessorUsageId || !successorAmount || !ruleId || !effectiveAsOf || !supersededBy) {
    throw new Error("predecessorUsageId, successorAmount, ruleId, effectiveAsOf, and supersededBy are required");
  }
  // Rule 136: same orphan-bucket hole as rule 135, worse —
  // the predecessor is marked SUPERSEDED while a mistyped
  // successor ruleId lands in a bucket no capacity query reads,
  // so counted usage silently disappears from capacity.
  await assertRuleIdResolves(companyId, ruleId);
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
