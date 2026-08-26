"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { FeedQueueLedgerPayload, FeedQueueSnapshotPayload } from "@/prisma/seed-data";

/**
 * Generalized off app/feeds/actions.ts (Coherent-only, hardcoded
 * `DEFAULT_COMPANY_ID`) - same real behavior (approving creates a real
 * FinancialSnapshot or LedgerEntry row, which is why Dashboard/Simulate
 * change afterward), now taking `companyId` explicitly so it works for any
 * company's own queue.
 */
export async function approveFeedItem(companyId: string, id: string) {
  const item = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id } });
  if (item.status !== "PENDING") throw new Error(`Feed item ${id} is already ${item.status.toLowerCase()}`);
  if (item.companyId !== companyId) throw new Error(`Feed item ${id} does not belong to this company`);

  if (item.kind === "SNAPSHOT_UPDATE") {
    const payload = item.payload as unknown as FeedQueueSnapshotPayload;
    const latest = await prisma.financialSnapshot.findFirstOrThrow({
      where: { companyId },
      orderBy: { asOfDate: "desc" },
    });

    const snapshot = await prisma.financialSnapshot.create({
      data: {
        companyId,
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
    // snapshot's capital structure forward unchanged.
    const priorTranches = await prisma.debtTranche.findMany({ where: { financialSnapshotId: latest.id } });
    if (priorTranches.length > 0) {
      await prisma.debtTranche.createMany({
        data: priorTranches.map((t) => ({
          companyId,
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
  const item = await prisma.feedQueueItem.findUniqueOrThrow({ where: { id } });
  if (item.companyId !== companyId) throw new Error(`Feed item ${id} does not belong to this company`);
  if (item.status !== "PENDING") throw new Error(`Feed item ${id} is already ${item.status.toLowerCase()}`);
  await prisma.feedQueueItem.update({ where: { id }, data: { status: "DISMISSED", resolvedAt: new Date() } });
  revalidatePath(`/${companyId}`, "layout");
}
