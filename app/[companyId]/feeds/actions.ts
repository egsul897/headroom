"use server";

import { requireCompanyAccess } from "@/lib/auth/tenant-boundary";

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

export async function approveFeedItem(companyId: string, id: string) {
  await requireCompanyAccess(companyId);
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
    await prisma.financialSnapshot.create({
      data: {
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
      },
    });
  } else if (item.kind === "LEDGER_ENTRY") {
    const payload = item.payload as unknown as FeedQueueLedgerPayload;
    await prisma.ledgerEntry.create({
      data: {
        companyId,
        date: new Date(payload.date),
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

  await prisma.feedQueueItem.update({ where: { id }, data: { status: "APPLIED", resolvedAt: new Date() } });
  revalidatePath(`/${companyId}`, "layout");
}

export async function dismissFeedItem(companyId: string, id: string) {
  await requireCompanyAccess(companyId);
  const item = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id } });
  if (item.companyId !== companyId) throw new Error(`Feed item ${id} does not belong to this company`);
  if (item.status !== "PENDING") throw new Error(`Feed item ${id} is already ${item.status.toLowerCase()}`);
  await prisma.feedQueueItem.update({ where: { id }, data: { status: "DISMISSED", resolvedAt: new Date() } });
  revalidatePath(`/${companyId}`, "layout");
}
