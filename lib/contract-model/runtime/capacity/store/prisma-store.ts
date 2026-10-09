/**
 * Prisma-backed append-only 4C contract ledger (distinct from legacy ledger_entries).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CapacityPathRef, LedgerUsageRecord } from "../types";
import type { AppendUsageRequest, LedgerStoreEvent, LedgerWriteResult, SupersedeUsageRequest } from "./types";
import { InMemoryContractLedgerStore } from "./memory-store";
import { cloneUsage } from "./write";

type Ns4cDb = {
  contractLedgerUsage: PrismaClient["contractLedgerUsage"];
  contractLedgerUsageEvent: PrismaClient["contractLedgerUsageEvent"];
};

type PrismaLike = Ns4cDb & Pick<PrismaClient, "$transaction">;

function serializeEvent(e: LedgerStoreEvent): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(e)) as Prisma.InputJsonValue;
}

function deserializeEvent(payload: unknown): LedgerStoreEvent {
  return payload as LedgerStoreEvent;
}

async function rematerialize(db: Ns4cDb, companyId: string, store: InMemoryContractLedgerStore): Promise<void> {
  await db.contractLedgerUsage.deleteMany({ where: { companyId } });
  for (const u of store.getUsages(companyId)) {
    await db.contractLedgerUsage.create({
      data: {
        usageId: u.usageId,
        companyId: u.companyId,
        instrumentKey: u.instrumentKey,
        effectiveAsOf: u.effectiveAsOf,
        amount: u.amount.amount,
        currency: u.amount.currency,
        capacityPathJson: u.capacityPath as unknown as Prisma.InputJsonValue,
        transactionRef: u.transactionRef,
        status: u.status,
        supersededByUsageId: u.supersededByUsageId,
        provenanceJson: u.provenance as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

async function persistEvents(db: Ns4cDb, events: readonly LedgerStoreEvent[]): Promise<void> {
  for (const e of events) {
    const companyId = e.type === "USAGE_APPENDED" ? e.usage.companyId : e.companyId;
    const usageId = e.type === "USAGE_APPENDED" ? e.usage.usageId : e.usageId;
    await db.contractLedgerUsageEvent.create({
      data: {
        eventId: e.eventId,
        companyId,
        usageId,
        type: e.type,
        at: new Date(e.at),
        payloadJson: serializeEvent(e),
      },
    });
  }
}

export class PrismaContractLedgerStore {
  private mem: InMemoryContractLedgerStore;
  private readonly prisma: PrismaLike;
  readonly companyId: string;

  private constructor(prisma: PrismaLike, companyId: string, mem: InMemoryContractLedgerStore) {
    this.prisma = prisma;
    this.companyId = companyId;
    this.mem = mem;
  }

  static async open(prisma: PrismaLike, companyId: string): Promise<PrismaContractLedgerStore> {
    const rows = await prisma.contractLedgerUsageEvent.findMany({
      where: { companyId },
      orderBy: [{ at: "asc" }, { eventId: "asc" }],
    });
    const events = rows.map((r) => deserializeEvent(r.payloadJson));
    return new PrismaContractLedgerStore(prisma, companyId, InMemoryContractLedgerStore.fromPersistedEvents(events));
  }

  get events(): readonly LedgerStoreEvent[] {
    return this.mem.events;
  }

  eventCount(): number {
    return this.mem.eventCount();
  }

  getUsages(): LedgerUsageRecord[] {
    return this.mem.getUsages(this.companyId);
  }

  getActiveUsages(): LedgerUsageRecord[] {
    return this.mem.getActiveUsages(this.companyId);
  }

  getUsage(usageId: string): LedgerUsageRecord | null {
    return this.mem.getUsage(usageId);
  }

  private async flush(before: number): Promise<void> {
    const newEvents = this.mem.events.slice(before);
    try {
      await this.prisma.$transaction(async (tx) => {
        await rematerialize(tx, this.companyId, this.mem);
        await persistEvents(tx, newEvents);
      });
    } catch (err) {
      const rows = await this.prisma.contractLedgerUsageEvent.findMany({
        where: { companyId: this.companyId },
        orderBy: [{ at: "asc" }, { eventId: "asc" }],
      });
      this.mem = InMemoryContractLedgerStore.fromPersistedEvents(rows.map((r) => deserializeEvent(r.payloadJson)));
      throw err;
    }
  }

  async appendUsage(request: AppendUsageRequest): Promise<LedgerWriteResult> {
    if (request.usage.companyId !== this.companyId) {
      return {
        ok: false,
        issues: [{
          code: "COMPANY_MISMATCH",
          message: `store scoped to ${this.companyId}; got ${request.usage.companyId}`,
          usageIds: [request.usage.usageId],
        }],
      };
    }
    const before = this.mem.eventCount();
    const result = this.mem.appendUsage(request);
    if (!result.ok) return result;
    await this.flush(before);
    return result;
  }

  async supersedeUsage(request: SupersedeUsageRequest): Promise<LedgerWriteResult> {
    const before = this.mem.eventCount();
    const result = this.mem.supersedeUsage(request);
    if (!result.ok) return result;
    await this.flush(before);
    return result;
  }
}

/** Load materialized 4C usages for capacity evaluation (includes SUPERSEDED for graph checks). */
export async function loadLedgerUsagesFromPrisma(
  prisma: Ns4cDb,
  companyId: string,
): Promise<LedgerUsageRecord[]> {
  const rows = await prisma.contractLedgerUsage.findMany({
    where: { companyId },
    orderBy: { usageId: "asc" },
  });
  return rows.map((row): LedgerUsageRecord => ({
    usageId: row.usageId,
    companyId: row.companyId,
    instrumentKey: row.instrumentKey,
    effectiveAsOf: row.effectiveAsOf,
    amount: { amount: row.amount, currency: row.currency },
    capacityPath: row.capacityPathJson as unknown as CapacityPathRef,
    transactionRef: row.transactionRef,
    status: row.status as LedgerUsageRecord["status"],
    supersededByUsageId: row.supersededByUsageId,
    provenance: row.provenanceJson as unknown as LedgerUsageRecord["provenance"],
  }));
}

export { cloneUsage };
