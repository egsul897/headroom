"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { COMPANY_ID } from "@/lib/coherent";
import type { FeedQueueLedgerPayload, FeedQueueSnapshotPayload } from "@/prisma/seed-data";

/**
 * Approving a queue item is the "database write" half of the Feeds tab: it
 * creates a real FinancialSnapshot or LedgerEntry row, which is why Position/
 * Simulate change afterward rather than just marking a checkbox.
 */
export async function approveFeedItem(id: string) {
  const item = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id } });
  if (item.status !== "PENDING") throw new Error(`Feed item ${id} is already ${item.status.toLowerCase()}`);
  if (item.companyId !== COMPANY_ID) throw new Error(`Feed item ${id} does not belong to this company`);

  if (item.kind === "SNAPSHOT_UPDATE") {
    const payload = item.payload as unknown as FeedQueueSnapshotPayload;
    const latest = await prisma.financialSnapshot.findFirstOrThrow({
      where: { companyId: COMPANY_ID },
      orderBy: { asOfDate: "desc" },
    });

    const snapshot = await prisma.financialSnapshot.create({
      data: {
        companyId: COMPANY_ID,
        asOfDate: new Date(payload.asOfDate),
        ebitda: payload.ebitda ?? latest.ebitda,
        cash: payload.cash ?? latest.cash,
        interestExpense: payload.interestExpense ?? latest.interestExpense,
        cumulativeNetIncome: payload.cumulativeNetIncome ?? latest.cumulativeNetIncome,
        equityProceedsSinceIssue: payload.equityProceedsSinceIssue ?? latest.equityProceedsSinceIssue,
        assumedNewDebtRatePct: payload.assumedNewDebtRatePct ?? latest.assumedNewDebtRatePct,
        totalDebt: payload.totalDebt ?? latest.totalDebt,
        securedDebt: payload.securedDebt ?? latest.securedDebt,
        notes: payload.notes ?? latest.notes,
      },
    });

    // Tranche-level detail isn't modeled in the payload - carry the prior
    // snapshot's capital structure forward unchanged. (If a future payload
    // needs to change totalDebt/securedDebt, it should also specify matching
    // tranche deltas, or the Position capital-structure table will drift
    // from the aggregate figures.)
    const priorTranches = await prisma.debtTranche.findMany({ where: { financialSnapshotId: latest.id } });
    if (priorTranches.length > 0) {
      await prisma.debtTranche.createMany({
        data: priorTranches.map((t) => ({
          companyId: COMPANY_ID,
          financialSnapshotId: snapshot.id,
          name: t.name,
          amount: t.amount,
          secured: t.secured,
          documentName: t.documentName,
        })),
      });
    }
  } else if (item.kind === "LEDGER_ENTRY") {
    const payload = item.payload as unknown as FeedQueueLedgerPayload;
    await prisma.ledgerEntry.create({
      data: {
        companyId: COMPANY_ID,
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
  revalidatePath("/", "layout");
}

export async function dismissFeedItem(id: string) {
  const item = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id } });
  if (item.status !== "PENDING") throw new Error(`Feed item ${id} is already ${item.status.toLowerCase()}`);
  await prisma.feedQueueItem.update({ where: { id }, data: { status: "DISMISSED", resolvedAt: new Date() } });
  revalidatePath("/", "layout");
}
