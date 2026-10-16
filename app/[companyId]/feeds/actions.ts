"use server";
import { requireTenantAction } from "@/lib/auth/guard";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { FeedQueueLedgerPayload, FeedQueueSnapshotPayload } from "@/prisma/seed-data";

/**
 * Generalized off app/feeds/actions.ts (Coherent-only, hardcoded
 * `DEFAULT_COMPANY_ID`) - approving a complete item creates a real
 * FinancialSnapshot or LedgerEntry row, which is why Dashboard/Simulate
 * change afterward. `companyId` is explicit so it works for any company's
 * own queue.
 *
 * P3-R0 C5: SNAPSHOT_UPDATE approval refuses an incomplete payload. It
 * writes only fields the payload itself supplies. It does not fill gaps
 * from the latest snapshot and it does not clone prior debt tranches onto
 * the new date. The queue item stays PENDING when approval is refused.
 */
const REQUIRED_SNAPSHOT_FIELDS = [
  "ebitda",
  "cash",
  "interestExpense",
  "cumulativeNetIncome",
  "equityProceedsSinceIssue",
  "assumedNewDebtRatePct",
  "totalDebt",
  "securedDebt",
] as const;

type RequiredSnapshotField = (typeof REQUIRED_SNAPSHOT_FIELDS)[number];

interface CompleteSnapshotUpdate {
  asOfDate: Date;
  ebitda: number;
  cash: number;
  interestExpense: number;
  cumulativeNetIncome: number;
  equityProceedsSinceIssue: number;
  assumedNewDebtRatePct: number;
  totalDebt: number;
  securedDebt: number;
  notes: string | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Fail closed. Missing or non-finite required facts are a refusal, not a cue to copy the prior snapshot. */
function completeSnapshotUpdate(payload: FeedQueueSnapshotPayload): { ok: true; value: CompleteSnapshotUpdate } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const asOfDate = typeof payload?.asOfDate === "string" && payload.asOfDate.trim() !== "" ? new Date(payload.asOfDate) : null;
  if (!asOfDate || Number.isNaN(asOfDate.getTime())) missing.push("asOfDate");

  const numbers: Partial<Record<RequiredSnapshotField, number>> = {};
  for (const field of REQUIRED_SNAPSHOT_FIELDS) {
    const value = payload?.[field];
    if (!isFiniteNumber(value)) missing.push(field);
    else numbers[field] = value;
  }

  if (missing.length > 0 || !asOfDate) return { ok: false, missing };
  return {
    ok: true,
    value: {
      asOfDate,
      ebitda: numbers.ebitda!,
      cash: numbers.cash!,
      interestExpense: numbers.interestExpense!,
      cumulativeNetIncome: numbers.cumulativeNetIncome!,
      equityProceedsSinceIssue: numbers.equityProceedsSinceIssue!,
      assumedNewDebtRatePct: numbers.assumedNewDebtRatePct!,
      totalDebt: numbers.totalDebt!,
      securedDebt: numbers.securedDebt!,
      notes: typeof payload.notes === "string" ? payload.notes : null,
    },
  };
}

export async function approveFeedItem(companyId: string, id: string, formData: FormData) {
  await requireTenantAction(companyId);
  // Rule 141: approving a queued item writes capacity-affecting
  // data (snapshot or ledger entry) — the approver must be named,
  // never defaulted. The resolution records who decided.
  const resolvedBy = String(formData.get("resolvedBy") || "").trim();
  if (!resolvedBy) throw new Error("resolvedBy (your name/email) is required");
  const item = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id } });
  if (item.status !== "PENDING") throw new Error(`Feed item ${id} is already ${item.status.toLowerCase()}`);
  if (item.companyId !== companyId) throw new Error(`Feed item ${id} does not belong to this company`);

  if (item.kind === "SNAPSHOT_UPDATE") {
    const payload = item.payload as unknown as FeedQueueSnapshotPayload;
    const completed = completeSnapshotUpdate(payload);
    if (!completed.ok) {
      throw new Error(
        `SNAPSHOT_UPDATE ${id} is incomplete (missing ${completed.missing.join(", ")}). Refused: omitted fields are not carried forward from a prior snapshot, and prior debt tranches are not cloned as new facts. Item left PENDING.`
      );
    }
    const supplied = completed.value;
    // Rule 116: same upsert discipline as rule 92's manual
    // financials — a blind create here would mint a duplicate
    // same-date snapshot row, and the cohort resolver treats ANY
    // same-date multiplicity as AMBIGUOUS, withholding capacity
    // everywhere. Exactly one existing row updates in place;
    // multiple refuse fail-closed.
    const existing = await prisma.financialSnapshot.findMany({
      where: { companyId, asOfDate: supplied.asOfDate },
    });
    if (existing.length > 1) {
      throw new Error(
        `SNAPSHOT_UPDATE ${id} refused: ${existing.length} FinancialSnapshot rows already exist for ${supplied.asOfDate.toISOString().slice(0, 10)} — resolve the ambiguity before approving. Item left PENDING.`,
      );
    }
    const snapshotData = {
      companyId,
      asOfDate: supplied.asOfDate,
      ebitda: supplied.ebitda,
      cash: supplied.cash,
      interestExpense: supplied.interestExpense,
      cumulativeNetIncome: supplied.cumulativeNetIncome,
      equityProceedsSinceIssue: supplied.equityProceedsSinceIssue,
      assumedNewDebtRatePct: supplied.assumedNewDebtRatePct,
      totalDebt: supplied.totalDebt,
      securedDebt: supplied.securedDebt,
      notes: supplied.notes,
    };
    if (existing.length === 1) {
      await prisma.financialSnapshot.update({ where: { id: existing[0]!.id }, data: snapshotData });
    } else {
      await prisma.financialSnapshot.create({ data: snapshotData });
    }
  } else if (item.kind === "LEDGER_ENTRY") {
    const payload = item.payload as unknown as FeedQueueLedgerPayload;
    // Rule 117: the SNAPSHOT_UPDATE branch validates its payload
    // fail-closed — the ledger branch must too, instead of
    // letting a malformed queued payload die opaquely at Prisma.
    const validBaskets = ["EQUITY", "DEBT_INCUR", "DEBT_REPAY", "ASSET_SALE", "DIVIDEND", "INVESTMENT"];
    const ledgerDate = typeof payload?.date === "string" && payload.date.trim() !== "" ? new Date(payload.date) : null;
    const ledgerProblems: string[] = [];
    if (!ledgerDate || Number.isNaN(ledgerDate.getTime())) ledgerProblems.push("date");
    if (typeof payload?.description !== "string" || payload.description.trim() === "") ledgerProblems.push("description");
    if (!validBaskets.includes(payload?.basket)) ledgerProblems.push("basket");
    if (typeof payload?.amount !== "number" || !Number.isFinite(payload.amount) || payload.amount <= 0) ledgerProblems.push("amount");
    if (payload?.direction !== "CREDIT" && payload?.direction !== "DEBIT") ledgerProblems.push("direction");
    if (typeof payload?.source !== "string" || payload.source.trim() === "") ledgerProblems.push("source");
    if (ledgerProblems.length > 0) {
      throw new Error(
        `LEDGER_ENTRY ${id} is incomplete/invalid (bad ${ledgerProblems.join(", ")}). Refused — item left PENDING.`,
      );
    }
    // Narrowing guard: the problems check above already threw on a
    // bad date, but TS cannot connect the two — make it explicit.
    if (!ledgerDate) throw new Error(`LEDGER_ENTRY ${id} has no valid date. Refused — item left PENDING.`);
    await prisma.ledgerEntry.create({
      data: {
        companyId,
        date: ledgerDate,
        description: payload.description,
        basket: payload.basket,
        amount: payload.amount,
        direction: payload.direction,
        source: payload.source,
      },
    });
  } else {
    throw new Error(`Unknown feed queue kind: ${item.kind}`);
  }

  await prisma.feedQueueItem.update({ where: { id }, data: { status: "APPLIED", resolvedAt: new Date(), resolvedBy } });
  revalidatePath(`/${companyId}`, "layout");
}

export async function dismissFeedItem(companyId: string, id: string, formData: FormData) {
  await requireTenantAction(companyId);
  // Rule 141: same attribution requirement as approval — a
  // dismissal is a decision on a queued item.
  const resolvedBy = String(formData.get("resolvedBy") || "").trim();
  if (!resolvedBy) throw new Error("resolvedBy (your name/email) is required");
  const item = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id } });
  if (item.companyId !== companyId) throw new Error(`Feed item ${id} does not belong to this company`);
  if (item.status !== "PENDING") throw new Error(`Feed item ${id} is already ${item.status.toLowerCase()}`);
  await prisma.feedQueueItem.update({ where: { id }, data: { status: "DISMISSED", resolvedAt: new Date(), resolvedBy } });
  revalidatePath(`/${companyId}`, "layout");
}
