/**
 * Durable NS-4 financial sync outbox.
 *
 * Legacy FINANCIAL_FACT promotion commits FinancialSnapshot/FinancialState and
 * marks candidates promoted inside one transaction. NS-4 approved-snapshot
 * persistence runs after that commit. This module records PENDING sync rows in
 * the same transaction so a crash or NS-4 failure cannot silently strand NS-4
 * behind legacy state — failures stay discoverable and retryable.
 *
 * Retries call persistPromotedFinancialFactsToNs4, which is idempotent for an
 * already-APPROVED snapshotId (no duplicate approvals / facts).
 */

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  persistPromotedFinancialFactsToNs4,
  type Ns4FactInput,
  type Ns4PersistResult,
} from "./ns4-financial-persist";
import { VALUE_SCHEMA_BY_KIND } from "./review";

export type Ns4SyncStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface Ns4SyncAttemptResult {
  syncId: string;
  companyId: string;
  cohortKey: string;
  status: Ns4SyncStatus;
  snapshotId?: string;
  reason?: string;
}

export type Ns4PersistFn = (
  companyId: string,
  facts: Ns4FactInput[],
) => Promise<Ns4PersistResult>;

type TxClient = Prisma.TransactionClient;

function asOfIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ns4FinancialCohortKey(facts: Ns4FactInput[]): string {
  if (facts.length === 0) throw new Error("ns4FinancialCohortKey requires at least one fact");
  const asOf = asOfIso(facts[0]!.asOfDate);
  const ids = [...new Set(facts.map((f) => f.candidateId))].sort().join(",");
  const digest = createHash("sha256").update(`${asOf}|${ids}`).digest("hex").slice(0, 16);
  return `${asOf}:${digest}`;
}

function serializeFacts(facts: Ns4FactInput[]): Prisma.InputJsonValue {
  return facts.map((f) => ({
    metricName: f.metricName,
    value: f.value,
    asOfDate: f.asOfDate.toISOString(),
    candidateId: f.candidateId,
    sourceDocumentId: f.sourceDocumentId,
    reviewedBy: f.reviewedBy,
  })) as unknown as Prisma.InputJsonValue;
}

function deserializeFacts(json: unknown): Ns4FactInput[] {
  if (!Array.isArray(json)) return [];
  return json.map((raw) => {
    const f = raw as Record<string, unknown>;
    return {
      metricName: String(f.metricName ?? ""),
      value: Number(f.value),
      asOfDate: new Date(String(f.asOfDate)),
      candidateId: String(f.candidateId ?? ""),
      sourceDocumentId: (f.sourceDocumentId as string | null) ?? null,
      reviewedBy: (f.reviewedBy as string | null) ?? null,
    };
  });
}

/**
 * Enqueue PENDING sync rows inside the legacy promotion transaction.
 * Idempotent on (companyId, cohortKey): re-queues FAILED → PENDING; leaves
 * SUCCEEDED untouched.
 */
export async function enqueueNs4FinancialSyncs(
  tx: TxClient,
  companyId: string,
  facts: Ns4FactInput[],
): Promise<string[]> {
  if (facts.length === 0) return [];

  const byDate = new Map<string, Ns4FactInput[]>();
  for (const f of facts) {
    const k = f.asOfDate.toISOString();
    const list = byDate.get(k) ?? [];
    list.push(f);
    byDate.set(k, list);
  }

  const syncIds: string[] = [];
  for (const group of byDate.values()) {
    const cohortKey = ns4FinancialCohortKey(group);
    const asOfDate = group[0]!.asOfDate;
    const candidateIds = [...new Set(group.map((f) => f.candidateId))].sort();
    const existing = await tx.ns4FinancialSync.findUnique({
      where: { companyId_cohortKey: { companyId, cohortKey } },
      select: { id: true, status: true },
    });
    if (existing?.status === "SUCCEEDED") {
      syncIds.push(existing.id);
      continue;
    }
    if (existing) {
      const updated = await tx.ns4FinancialSync.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          factsJson: serializeFacts(group),
          candidateIds,
          asOfDate,
          lastError: null,
          snapshotId: null,
        },
        select: { id: true },
      });
      syncIds.push(updated.id);
      continue;
    }
    const created = await tx.ns4FinancialSync.create({
      data: {
        companyId,
        cohortKey,
        asOfDate,
        status: "PENDING",
        candidateIds,
        factsJson: serializeFacts(group),
      },
      select: { id: true },
    });
    syncIds.push(created.id);
  }
  return syncIds;
}

export async function attemptNs4FinancialSync(
  syncId: string,
  persist: Ns4PersistFn = persistPromotedFinancialFactsToNs4,
): Promise<Ns4SyncAttemptResult> {
  const row = await prisma.ns4FinancialSync.findUnique({ where: { id: syncId } });
  if (!row) {
    return {
      syncId,
      companyId: "",
      cohortKey: "",
      status: "FAILED",
      reason: `Ns4FinancialSync ${syncId} not found`,
    };
  }
  if (row.status === "SUCCEEDED" && row.snapshotId) {
    return {
      syncId: row.id,
      companyId: row.companyId,
      cohortKey: row.cohortKey,
      status: "SUCCEEDED",
      snapshotId: row.snapshotId,
      reason: "Already SUCCEEDED",
    };
  }

  const facts = deserializeFacts(row.factsJson);
  await prisma.ns4FinancialSync.update({
    where: { id: syncId },
    data: { attemptCount: { increment: 1 } },
  });

  const result = await persist(row.companyId, facts);
  if (result.ok) {
    const updated = await prisma.ns4FinancialSync.update({
      where: { id: syncId },
      data: {
        status: "SUCCEEDED",
        snapshotId: result.snapshotId ?? null,
        lastError: null,
      },
    });
    return {
      syncId: updated.id,
      companyId: updated.companyId,
      cohortKey: updated.cohortKey,
      status: "SUCCEEDED",
      snapshotId: updated.snapshotId ?? result.snapshotId,
    };
  }

  const updated = await prisma.ns4FinancialSync.update({
    where: { id: syncId },
    data: {
      status: "FAILED",
      lastError: result.reason ?? "NS-4 persist failed",
    },
  });
  return {
    syncId: updated.id,
    companyId: updated.companyId,
    cohortKey: updated.cohortKey,
    status: "FAILED",
    reason: updated.lastError ?? result.reason,
  };
}

export async function runNs4FinancialSyncs(
  syncIds: string[],
  persist: Ns4PersistFn = persistPromotedFinancialFactsToNs4,
): Promise<Ns4SyncAttemptResult[]> {
  const out: Ns4SyncAttemptResult[] = [];
  for (const id of syncIds) {
    out.push(await attemptNs4FinancialSync(id, persist));
  }
  return out;
}

/**
 * Retry all PENDING/FAILED syncs for a company (or all companies when omitted).
 * Does not re-run legal/covenant promotion and does not clear promotedAt.
 */
export async function retryPendingNs4FinancialSyncs(
  companyId?: string,
  persist: Ns4PersistFn = persistPromotedFinancialFactsToNs4,
): Promise<Ns4SyncAttemptResult[]> {
  const rows = await prisma.ns4FinancialSync.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      ...(companyId ? { companyId } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return runNs4FinancialSyncs(
    rows.map((r) => r.id),
    persist,
  );
}

/**
 * Recover stranded promotions: promoted FINANCIAL_FACT candidates with no
 * SUCCEEDED outbox row (e.g. process killed before enqueue on older builds,
 * or outbox missing). Rebuilds facts from candidates and enqueues + attempts.
 */
export async function reconcilePromotedFinancialFactsToNs4(
  companyId: string,
  persist: Ns4PersistFn = persistPromotedFinancialFactsToNs4,
): Promise<Ns4SyncAttemptResult[]> {
  const candidates = await prisma.extractionCandidate.findMany({
    where: {
      companyId,
      kind: "FINANCIAL_FACT",
      promotedAt: { not: null },
      reviewStatus: { in: ["APPROVED", "EDITED"] },
    },
  });

  const schema = VALUE_SCHEMA_BY_KIND.FINANCIAL_FACT;
  const facts: Ns4FactInput[] = [];
  for (const c of candidates) {
    const raw = c.reviewerEditedValue ?? c.proposedValue;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) continue;
    const value = parsed.data as {
      metricName: string;
      value: number;
      asOfDate: string;
    };
    const asOfDate = new Date(value.asOfDate);
    if (Number.isNaN(asOfDate.getTime())) continue;
    facts.push({
      metricName: value.metricName,
      value: value.value,
      asOfDate,
      candidateId: c.id,
      sourceDocumentId: c.sourceDocumentId,
      reviewedBy: c.reviewedBy,
    });
  }

  if (facts.length === 0) return [];

  const syncIds = await prisma.$transaction((tx) => enqueueNs4FinancialSyncs(tx, companyId, facts));
  // Skip already-SUCCEEDED cohorts (enqueue returns their ids); attempt is a no-op for them.
  return runNs4FinancialSyncs(syncIds, persist);
}

export async function listIncompleteNs4FinancialSyncs(companyId: string) {
  return prisma.ns4FinancialSync.findMany({
    where: { companyId, status: { in: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "asc" },
  });
}
