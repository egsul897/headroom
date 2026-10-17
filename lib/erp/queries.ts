/**
 * ERP ingestion read side - how staged/surfaced data gets SEEN.
 *
 * The foundation's promise is "unmatched/conflicting data surfaces, never
 * force-matched or dropped" - these are the queries a reviewer surface (and
 * ERP-2) uses to see exactly that: facts needing attention (conflicts,
 * refusals, unmapped keys, stale withheld sets) and a connection's sync
 * audit trail. Plain reporting functions over the ledger tables, in the
 * style of lib/connectors/metrics.ts - no new persisted state.
 */

import type { ErpFinancialFact, ErpSyncEvent, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";

/** Facts for one company that a human has not resolved: conflicts, refusals, unmapped/not-promotable keys, and still-withheld sets - oldest first (FIFO review). */
export async function listErpFactsNeedingAttention(companyId: string, client: PrismaClient = prisma): Promise<ErpFinancialFact[]> {
  return client.erpFinancialFact.findMany({
    where: { companyId, status: { in: ["CONFLICT", "REFUSED", "UNMAPPED", "NOT_PROMOTABLE", "WITHHELD_INCOMPLETE"] } },
    orderBy: { createdAt: "asc" },
  });
}

/** The append-only sync audit trail for one connection, newest first. */
export async function listErpSyncEvents(connectionId: string, limit = 50, client: PrismaClient = prisma): Promise<ErpSyncEvent[]> {
  return client.erpSyncEvent.findMany({
    where: { connectionId },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
}

/** Facts carried by one sync event (the delivery's own rows - what that delivery did). */
export async function listErpFactsForEvent(syncEventId: string, client: PrismaClient = prisma): Promise<ErpFinancialFact[]> {
  return client.erpFinancialFact.findMany({
    where: { syncEventId },
    orderBy: { createdAt: "asc" },
  });
}
