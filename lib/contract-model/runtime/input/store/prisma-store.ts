/**
 * NS-4 durable store — Prisma-backed append-only event log + materialization tables.
 *
 * Write path: validate via existing sealed write.ts against an in-memory log, then
 * rematerialize ContractInputSnapshot / Fact / Locator rows and persist new events.
 * APPROVED still requires attributable approveSnapshot — never raw-appended.
 *
 * Does not modify Phase 4B resolve-only runtime.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { rationalFromString } from "../../decimal";
import type { RuntimeValue, SerializedRuntimeValue } from "../../types";
import { serializeValue } from "../../values";
import type { FinancialInput, FinancialSnapshot } from "../types";
import type { AppendSnapshotRequest, ApprovalTransition, StoreEvent, WriteResult } from "./types";
import { InMemoryApprovedSnapshotStore } from "./memory-store";
import { cloneStoreEvent, materializeFromEvents } from "./write";

type Ns4Db = {
  contractInputSnapshot: PrismaClient["contractInputSnapshot"];
  contractInputFact: PrismaClient["contractInputFact"];
  contractInputFactLocator: PrismaClient["contractInputFactLocator"];
  contractInputSnapshotEvent: PrismaClient["contractInputSnapshotEvent"];
};

type PrismaLike = Ns4Db & Pick<PrismaClient, "$transaction">;

function companyIdFromEvent(e: StoreEvent): string {
  if (e.type === "SNAPSHOT_APPENDED") return e.snapshot.companyId;
  return e.companyId;
}

function snapshotIdFromEvent(e: StoreEvent): string | null {
  if (e.type === "SNAPSHOT_APPENDED") return e.snapshot.snapshotId;
  return e.snapshotId;
}

function deserializeRuntimeValue(v: SerializedRuntimeValue): RuntimeValue {
  switch (v.type) {
    case "MONEY":
      return { type: "MONEY", amount: rationalFromString(v.amount), currency: v.currency, lineage: v.lineage };
    case "NUMBER":
      return { type: "NUMBER", value: rationalFromString(v.value), lineage: v.lineage };
    case "PERCENT":
      return { type: "PERCENT", fraction: rationalFromString(v.fraction), lineage: v.lineage };
    case "RATIO":
      return { type: "RATIO", value: rationalFromString(v.value), lineage: v.lineage };
    case "BOOLEAN":
      return { type: "BOOLEAN", value: v.value, lineage: v.lineage };
    case "DATE":
      return { type: "DATE", isoDate: v.isoDate, lineage: v.lineage };
    case "ENTITY_SET":
      return { type: "ENTITY_SET", include: v.include, exclude: v.exclude, lineage: v.lineage };
    case "CAPACITY":
      return {
        type: "CAPACITY",
        capacity:
          v.capacity.kind === "AMOUNT"
            ? { kind: "AMOUNT", amount: rationalFromString(v.capacity.amount), currency: v.capacity.currency }
            : v.capacity,
        lineage: v.lineage,
      };
  }
}

/** Persist snapshot with BigInt-safe serialized values (never raw bigint JSON). */
function serializeSnapshotForJson(s: FinancialSnapshot): Prisma.InputJsonValue {
  return {
    snapshotId: s.snapshotId,
    version: s.version,
    companyId: s.companyId,
    asOf: s.asOf,
    reportingPeriod: s.reportingPeriod,
    status: s.status,
    supersedesSnapshotId: s.supersedesSnapshotId,
    inputs: s.inputs.map((inp) => ({
      identity: inp.identity,
      value: serializeValue(inp.value),
      displayName: inp.displayName ?? null,
      sourceVersion: inp.sourceVersion ?? null,
      overridesDefinitionId: inp.overridesDefinitionId ?? null,
      note: inp.note ?? null,
    })),
    provenance: s.provenance,
    review: s.review,
  } as unknown as Prisma.InputJsonValue;
}

function deserializeSnapshotFromJson(raw: unknown): FinancialSnapshot {
  const s = raw as {
    snapshotId: string;
    version: string;
    companyId: string;
    asOf: string | null;
    reportingPeriod: string | null;
    status: FinancialSnapshot["status"];
    supersedesSnapshotId: string | null;
    inputs: Array<{
      identity: FinancialInput["identity"];
      value: SerializedRuntimeValue;
      displayName?: string | null;
      sourceVersion?: string | null;
      overridesDefinitionId?: string | null;
      note?: string | null;
    }>;
    provenance: FinancialSnapshot["provenance"];
    review: FinancialSnapshot["review"];
  };
  return {
    snapshotId: s.snapshotId,
    version: s.version,
    companyId: s.companyId,
    asOf: s.asOf,
    reportingPeriod: s.reportingPeriod,
    status: s.status,
    supersedesSnapshotId: s.supersedesSnapshotId,
    inputs: s.inputs.map((inp): FinancialInput => ({
      identity: inp.identity,
      value: deserializeRuntimeValue(inp.value),
      displayName: inp.displayName ?? undefined,
      sourceVersion: inp.sourceVersion ?? null,
      overridesDefinitionId: inp.overridesDefinitionId ?? undefined,
      note: inp.note ?? undefined,
    })),
    provenance: s.provenance,
    review: s.review,
  };
}

function serializeEvent(e: StoreEvent): Prisma.InputJsonValue {
  if (e.type === "SNAPSHOT_APPENDED") {
    return {
      type: e.type,
      eventId: e.eventId,
      at: e.at,
      snapshot: serializeSnapshotForJson(e.snapshot),
    } as unknown as Prisma.InputJsonValue;
  }
  return JSON.parse(JSON.stringify(e)) as Prisma.InputJsonValue;
}

function deserializeEvent(payload: unknown): StoreEvent {
  const e = payload as StoreEvent;
  if (e.type === "SNAPSHOT_APPENDED") {
    return {
      type: "SNAPSHOT_APPENDED",
      eventId: e.eventId,
      at: e.at,
      snapshot: deserializeSnapshotFromJson((payload as { snapshot: unknown }).snapshot),
    };
  }
  return e;
}

async function rematerializeCompany(db: Ns4Db, companyId: string, events: readonly StoreEvent[]): Promise<void> {
  const materialized = materializeFromEvents(events);
  const companySnaps = [...materialized.values()].filter((s) => s.companyId === companyId);

  // Replace materialization for this company (events remain append-only source of truth).
  await db.contractInputFactLocator.deleteMany({
    where: { fact: { snapshot: { companyId } } },
  });
  await db.contractInputFact.deleteMany({
    where: { snapshot: { companyId } },
  });
  await db.contractInputSnapshot.deleteMany({ where: { companyId } });

  for (const snap of companySnaps) {
    await db.contractInputSnapshot.create({
      data: {
        snapshotId: snap.snapshotId,
        companyId: snap.companyId,
        version: snap.version,
        asOf: snap.asOf,
        reportingPeriod: snap.reportingPeriod,
        status: snap.status,
        supersedesSnapshotId: snap.supersedesSnapshotId,
        provenanceJson: snap.provenance as Prisma.InputJsonValue,
        reviewedBy: snap.review.reviewedBy,
        reviewedAt: snap.review.reviewedAt,
        approvalRef: snap.review.approvalRef,
        facts: {
          create: snap.inputs.map((inp) => ({
            identityJson: inp.identity as unknown as Prisma.InputJsonValue,
            valueJson: serializeValue(inp.value) as unknown as Prisma.InputJsonValue,
            displayName: inp.displayName ?? null,
            sourceVersion: inp.sourceVersion ?? null,
            overridesDefinitionId: inp.overridesDefinitionId ?? null,
            note: inp.note ?? null,
            locators: {
              create: [
                {
                  sourceDocumentId: snap.provenance.source || null,
                  sourceVersionHash: snap.provenance.sourceVersion,
                  locatorJson: {
                    note: snap.provenance.note ?? null,
                    inputKey: inp.identity.key,
                  } as Prisma.InputJsonValue,
                },
              ],
            },
          })),
        },
      },
    });
  }
}

async function persistNewEvents(db: Ns4Db, events: readonly StoreEvent[]): Promise<void> {
  for (const e of events) {
    await db.contractInputSnapshotEvent.create({
      data: {
        eventId: e.eventId,
        snapshotId: snapshotIdFromEvent(e),
        companyId: companyIdFromEvent(e),
        type: e.type,
        at: new Date(e.at),
        payloadJson: serializeEvent(e),
      },
    });
  }
}

export class PrismaApprovedSnapshotStore {
  private mem: InMemoryApprovedSnapshotStore;
  private readonly prisma: PrismaLike;
  readonly companyId: string;

  private constructor(prisma: PrismaLike, companyId: string, mem: InMemoryApprovedSnapshotStore) {
    this.prisma = prisma;
    this.companyId = companyId;
    this.mem = mem;
  }

  /** Load append-only events for a company and hydrate the sealed in-memory store. */
  static async open(prisma: PrismaLike, companyId: string): Promise<PrismaApprovedSnapshotStore> {
    const rows = await prisma.contractInputSnapshotEvent.findMany({
      where: { companyId },
      orderBy: [{ at: "asc" }, { eventId: "asc" }],
    });
    const events = rows.map((r) => cloneStoreEvent(deserializeEvent(r.payloadJson)));
    return new PrismaApprovedSnapshotStore(prisma, companyId, InMemoryApprovedSnapshotStore.fromPersistedEvents(events));
  }

  get events(): readonly StoreEvent[] {
    return this.mem.events;
  }

  eventCount(): number {
    return this.mem.eventCount();
  }

  getSnapshot(snapshotId: string): FinancialSnapshot | null {
    return this.mem.getSnapshot(snapshotId);
  }

  getSnapshots(companyId: string = this.companyId): FinancialSnapshot[] {
    return this.mem.getSnapshots(companyId);
  }

  /** APPROVED-only materialization for Phase 4B resolver (strict policy). */
  getApprovedSnapshots(): FinancialSnapshot[] {
    return this.mem.getSnapshots(this.companyId).filter((s) => s.status === "APPROVED");
  }

  private async flush(before: number): Promise<void> {
    const newEvents = this.mem.events.slice(before);
    const allEvents = this.mem.events;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Materialize first so event.snapshotId FK targets exist.
        await rematerializeCompany(tx, this.companyId, allEvents);
        await persistNewEvents(tx, newEvents);
      });
    } catch (err) {
      // Keep memory consistent with durable log after a failed flush.
      const rows = await this.prisma.contractInputSnapshotEvent.findMany({
        where: { companyId: this.companyId },
        orderBy: [{ at: "asc" }, { eventId: "asc" }],
      });
      this.mem = InMemoryApprovedSnapshotStore.fromPersistedEvents(rows.map((r) => cloneStoreEvent(deserializeEvent(r.payloadJson))));
      throw err;
    }
  }

  async appendSnapshot(request: AppendSnapshotRequest): Promise<WriteResult> {
    if (request.snapshot.companyId !== this.companyId) {
      return {
        ok: false,
        issues: [
          {
            code: "COMPANY_MISMATCH_ON_SUPERSESSION",
            message: `PrismaApprovedSnapshotStore is scoped to ${this.companyId}; got ${request.snapshot.companyId}`,
            snapshotIds: [request.snapshot.snapshotId],
          },
        ],
      };
    }
    const before = this.mem.eventCount();
    const result = this.mem.appendSnapshot(request);
    if (!result.ok) return result;
    await this.flush(before);
    return result;
  }

  async approveSnapshot(approval: ApprovalTransition): Promise<WriteResult> {
    const before = this.mem.eventCount();
    const result = this.mem.approveSnapshot(approval);
    if (!result.ok) return result;
    await this.flush(before);
    return result;
  }
}

/** Load APPROVED snapshots for a company directly from materialization tables (4B resolver feed). */
export async function loadApprovedSnapshotsFromPrisma(
  prisma: Ns4Db,
  companyId: string,
): Promise<FinancialSnapshot[]> {
  const rows = await prisma.contractInputSnapshot.findMany({
    where: { companyId, status: "APPROVED" },
    include: { facts: { include: { locators: true } } },
    orderBy: { snapshotId: "asc" },
  });
  return rows.map((row): FinancialSnapshot => ({
    snapshotId: row.snapshotId,
    version: row.version,
    companyId: row.companyId,
    asOf: row.asOf,
    reportingPeriod: row.reportingPeriod,
    status: "APPROVED",
    supersedesSnapshotId: row.supersedesSnapshotId,
    inputs: row.facts.map((f): FinancialInput => ({
      identity: f.identityJson as unknown as FinancialInput["identity"],
      value: deserializeRuntimeValue(f.valueJson as unknown as SerializedRuntimeValue),
      displayName: f.displayName ?? undefined,
      sourceVersion: f.sourceVersion ?? null,
      overridesDefinitionId: f.overridesDefinitionId ?? undefined,
      note: f.note ?? undefined,
    })),
    provenance: row.provenanceJson as unknown as FinancialSnapshot["provenance"],
    review: {
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      approvalRef: row.approvalRef,
    },
  }));
}
