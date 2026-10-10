/**
 * Regression: NS-4 persistence failures after legacy FINANCIAL_FACT promotion
 * must be surfaced, durably recorded, retryable, and idempotent.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persistImpl: null as null | ((companyId: string, facts: unknown[]) => Promise<{ ok: boolean; reason?: string; snapshotId?: string }>),
}));

vi.mock("../../lib/onboarding/ns4-financial-persist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/onboarding/ns4-financial-persist")>();
  return {
    ...actual,
    persistPromotedFinancialFactsToNs4: async (companyId: string, facts: Parameters<typeof actual.persistPromotedFinancialFactsToNs4>[1]) => {
      if (mocks.persistImpl) return mocks.persistImpl(companyId, facts);
      return actual.persistPromotedFinancialFactsToNs4(companyId, facts);
    },
  };
});

import { prisma } from "../../lib/prisma";
import { connectSource } from "../../lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages } from "../../lib/connectors/ingestion";
import { reviewCandidate } from "../../lib/onboarding/review";
import { promoteCompanyCandidates } from "../../lib/onboarding/promotion";
import {
  attemptNs4FinancialSync,
  listIncompleteNs4FinancialSyncs,
  reconcilePromotedFinancialFactsToNs4,
  retryPendingNs4FinancialSyncs,
} from "../../lib/onboarding/ns4-financial-sync";
import { persistPromotedFinancialFactsToNs4 } from "../../lib/onboarding/ns4-financial-persist";

const COMPANY_ID = "fixture-ns4-sync-reliability-co";
const AS_OF = "2026-06-30";

const CSV = [
  "metricName,value,asOfDate,unit",
  `cash,4200000,${AS_OF},USD`,
  `total_debt,52000000,${AS_OF},USD`,
  `secured_debt,30000000,${AS_OF},USD`,
  `covenant_ebitda,18000000,${AS_OF},USD`,
  `interest_expense,2100000,${AS_OF},USD`,
  `cumulative_net_income,9000000,${AS_OF},USD`,
  `equity_proceeds,5000000,${AS_OF},USD`,
  `assumed_new_debt_rate_pct,7.5,${AS_OF},PERCENT`,
].join("\n");

async function wipeNs4AndFinancial() {
  await prisma.ns4FinancialSync.deleteMany({ where: { companyId: COMPANY_ID } });
  const snaps = await prisma.contractInputSnapshot.findMany({
    where: { companyId: COMPANY_ID },
    select: { snapshotId: true },
  });
  for (const s of snaps) {
    const facts = await prisma.contractInputFact.findMany({
      where: { snapshotId: s.snapshotId },
      select: { id: true },
    });
    if (facts.length > 0) {
      await prisma.contractInputFactLocator.deleteMany({
        where: { factId: { in: facts.map((f) => f.id) } },
      });
      await prisma.contractInputFact.deleteMany({ where: { snapshotId: s.snapshotId } });
    }
  }
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.financialSnapshot.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.financialState.deleteMany({ where: { companyId: COMPANY_ID } });
}

async function teardown() {
  await wipeNs4AndFinancial().catch(() => undefined);
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

async function seedApprovedFinancialFacts() {
  await teardown();
  await prisma.company.create({
    data: { id: COMPANY_ID, name: "Fixture NS-4 Sync Reliability Co (synthetic, test-only)" },
  });
  const connection = await connectSource({ companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" });
  const job = await createIngestionJob({
    companyId: COMPANY_ID,
    kind: "INITIALIZE",
    sourceConnectionId: connection.id,
    rawInput: Buffer.from(CSV),
  });
  const results = await runAllPendingIngestionStages(job.id);
  expect(results.every((r) => r.status === "COMPLETE")).toBe(true);
  const candidates = await prisma.extractionCandidate.findMany({
    where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" },
  });
  expect(candidates).toHaveLength(8);
  for (const c of candidates) {
    await reviewCandidate({
      candidateId: c.id,
      action: "APPROVE",
      reviewedBy: "test-reviewer@headroom.app",
    });
  }
}

describe("NS-4 financial sync reliability", () => {
  beforeAll(async () => {
    await seedApprovedFinancialFacts();
  }, 90_000);

  afterAll(async () => {
    mocks.persistImpl = null;
    await teardown();
  });

  beforeEach(async () => {
    mocks.persistImpl = null;
    await wipeNs4AndFinancial();
    await prisma.extractionCandidate.updateMany({
      where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" },
      data: { promotedAt: null, promotedToId: null },
    });
  });

  it("1. normal successful promotion and NS-4 persistence", async () => {
    const result = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(result.promotedCount).toBe(8);
    expect(result.ns4Sync).toBeDefined();
    expect(result.ns4Sync!.complete).toBe(true);
    expect(result.ns4Sync!.failures).toHaveLength(0);
    expect(result.ns4Sync!.attempts.every((a) => a.status === "SUCCEEDED")).toBe(true);

    const syncs = await prisma.ns4FinancialSync.findMany({ where: { companyId: COMPANY_ID } });
    expect(syncs).toHaveLength(1);
    expect(syncs[0]!.status).toBe("SUCCEEDED");
    expect(syncs[0]!.snapshotId).toBeTruthy();

    const approved = await prisma.contractInputSnapshot.findMany({
      where: { companyId: COMPANY_ID, status: "APPROVED" },
    });
    expect(approved.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("2–5. simulated NS-4 failure after legacy commit is surfaced, durable, retryable, idempotent", async () => {
    let calls = 0;
    mocks.persistImpl = async (_companyId, facts) => {
      calls += 1;
      if (calls === 1) return { ok: false, reason: "simulated NS-4 store unavailable" };
      mocks.persistImpl = null;
      return persistPromotedFinancialFactsToNs4(COMPANY_ID, facts as never);
    };

    const result = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(result.promotedCount).toBe(8);
    expect(result.ns4Sync).toBeDefined();
    expect(result.ns4Sync!.complete).toBe(false);
    expect(result.ns4Sync!.failures.length).toBeGreaterThan(0);
    expect(result.ns4Sync!.failures[0]!.reason).toMatch(/simulated NS-4/);

    const incomplete = await listIncompleteNs4FinancialSyncs(COMPANY_ID);
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]!.status).toBe("FAILED");
    expect(incomplete[0]!.lastError).toMatch(/simulated NS-4/);

    // Legacy financial rows exist; candidates already promoted
    expect(await prisma.financialSnapshot.count({ where: { companyId: COMPANY_ID } })).toBe(1);
    expect(
      await prisma.extractionCandidate.count({
        where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT", promotedAt: { not: null } },
      }),
    ).toBe(8);

    const retried = await retryPendingNs4FinancialSyncs(COMPANY_ID);
    expect(retried).toHaveLength(1);
    expect(retried[0]!.status).toBe("SUCCEEDED");
    expect(retried[0]!.snapshotId).toBeTruthy();

    const snapshotsBefore = await prisma.contractInputSnapshot.count({
      where: { companyId: COMPANY_ID, status: "APPROVED" },
    });
    const again = await retryPendingNs4FinancialSyncs(COMPANY_ID);
    expect(again).toHaveLength(0);
    const syncId = incomplete[0]!.id;
    const noop = await attemptNs4FinancialSync(syncId);
    expect(noop.status).toBe("SUCCEEDED");
    const snapshotsAfter = await prisma.contractInputSnapshot.count({
      where: { companyId: COMPANY_ID, status: "APPROVED" },
    });
    expect(snapshotsAfter).toBe(snapshotsBefore);
  }, 90_000);

  it("6–7. interruption between legacy commit and NS-4 write is recoverable; no re-promotion", async () => {
    const result = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(result.promotedCount).toBe(8);

    await prisma.ns4FinancialSync.updateMany({
      where: { companyId: COMPANY_ID },
      data: { status: "PENDING", snapshotId: null, lastError: "interrupted before NS-4 write" },
    });
    const snaps = await prisma.contractInputSnapshot.findMany({
      where: { companyId: COMPANY_ID },
      select: { snapshotId: true },
    });
    for (const s of snaps) {
      const facts = await prisma.contractInputFact.findMany({
        where: { snapshotId: s.snapshotId },
        select: { id: true },
      });
      if (facts.length > 0) {
        await prisma.contractInputFactLocator.deleteMany({
          where: { factId: { in: facts.map((f) => f.id) } },
        });
        await prisma.contractInputFact.deleteMany({ where: { snapshotId: s.snapshotId } });
      }
    }
    await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId: COMPANY_ID } });
    await prisma.contractInputSnapshot.deleteMany({ where: { companyId: COMPANY_ID } });

    expect((await listIncompleteNs4FinancialSyncs(COMPANY_ID)).length).toBeGreaterThanOrEqual(1);

    const again = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(again.promotedCount).toBe(0);

    const recovered = await retryPendingNs4FinancialSyncs(COMPANY_ID);
    expect(recovered.every((r) => r.status === "SUCCEEDED")).toBe(true);
    expect(await listIncompleteNs4FinancialSyncs(COMPANY_ID)).toHaveLength(0);
  }, 90_000);

  it("reconcile recovers stranded promotions without an outbox row", async () => {
    const result = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
    expect(result.promotedCount).toBe(8);
    await wipeNs4AndFinancial();
    // Keep promotedAt — stranded legacy promotion with no outbox / NS-4 rows
    await prisma.extractionCandidate.updateMany({
      where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" },
      data: { promotedAt: new Date(), promotedToId: "legacy-only" },
    });
    // wipeNs4 cleared financial snapshots too; restore a minimal legacy marker by re-promoting path is N/A —
    // reconcile only needs promoted candidates.
    await prisma.extractionCandidate.updateMany({
      where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" },
      data: { promotedAt: new Date(), promotedToId: "legacy-only" },
    });

    const reconciled = await reconcilePromotedFinancialFactsToNs4(COMPANY_ID);
    expect(reconciled.length).toBeGreaterThanOrEqual(1);
    expect(reconciled.every((r) => r.status === "SUCCEEDED")).toBe(true);

    const second = await reconcilePromotedFinancialFactsToNs4(COMPANY_ID);
    expect(second.every((r) => r.status === "SUCCEEDED")).toBe(true);
    const approved = await prisma.contractInputSnapshot.count({
      where: { companyId: COMPANY_ID, status: "APPROVED" },
    });
    expect(approved).toBe(1);
  }, 90_000);
});
