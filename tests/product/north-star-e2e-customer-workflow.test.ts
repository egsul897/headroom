/**
 * Full North-Star customer workflow (SYNTHETIC financials — not authentic certificates).
 * Covers propose → approve → restatement → cutoff → ledger → Ask transaction → isolation/durability.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  proposeSyntheticCertificateForCompany,
  approveWorkspaceCertificate,
  proposeCertificateRestatement,
  appendContractLedgerUsage,
  loadAuthoritativeCapacity,
  analyzeContemplatedTransaction,
  loadTransactionWorkflowReadiness,
  listCertificateFactsForSnapshot,
} from "@/lib/product/north-star-workflow";
import {
  loadApprovedSnapshotsFromPrisma,
  loadLedgerUsagesFromPrisma,
  PrismaApprovedSnapshotStore,
  PrismaContractLedgerStore,
} from "@/lib/contract-model/north-star-bridge";

const CO = "ns-e2e-customer-workflow-co";
const OTHER = "ns-e2e-other-tenant-co";
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function teardown(prisma: PrismaClient, companyId: string) {
  await prisma.contractLedgerUsageEvent.deleteMany({ where: { companyId } });
  await prisma.contractLedgerUsage.deleteMany({ where: { companyId } });
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId } });
  await prisma.contractInputFactLocator.deleteMany({
    where: { fact: { snapshot: { companyId } } },
  });
  await prisma.contractInputFact.deleteMany({ where: { snapshot: { companyId } } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

describeDb("North Star E2E customer workflow", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await teardown(prisma, CO);
    await teardown(prisma, OTHER);
    await prisma.company.create({
      data: { id: CO, name: "NS E2E Co (synthetic)", tenantKind: "EVALUATION" },
    });
    await prisma.company.create({
      data: { id: OTHER, name: "NS E2E Other Tenant", tenantKind: "EVALUATION" },
    });
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma, CO);
    await teardown(prisma, OTHER);
    await prisma.$disconnect();
  }, 60_000);

  it("certificate → approve → facts → restatement → ledger → cutoff → Ask → durability + isolation", async () => {
    // Missing certificate → NEEDS_INPUT
    let auth = await loadAuthoritativeCapacity({ companyId: CO, evaluationDate: "2026-08-01" });
    expect(auth.status).toBe("NEEDS_INPUT");
    expect(auth.missingInputs).toContain("APPROVED_NorthStar_snapshot");

    const proposed = await proposeSyntheticCertificateForCompany(CO, {
      snapshotId: `snap-${CO}-q2`,
      reportingPeriod: "FY2026-Q2",
      asOf: "2026-06-30",
    });
    expect(proposed.ok).toBe(true);
    expect(proposed.status).toBe("DRAFT");

    const factsDraft = await listCertificateFactsForSnapshot(CO, proposed.snapshotId);
    expect(factsDraft.length).toBeGreaterThan(0);
    expect(factsDraft.some((f) => f.key.includes("EBITDA") || (f.displayName ?? "").includes("EBITDA"))).toBe(true);

    const approved = await approveWorkspaceCertificate({
      companyId: CO,
      snapshotId: proposed.snapshotId,
      reviewedBy: "e2e-counsel",
      approvalRef: "apr-e2e-1",
      reviewedAt: "2026-07-20T18:00:00Z",
    });
    expect(approved.ok).toBe(true);

    // Durability: reopen stores in a fresh client path
    const prisma2 = new PrismaClient();
    const store2 = await PrismaApprovedSnapshotStore.open(prisma2, CO);
    expect(store2.getSnapshot(proposed.snapshotId)?.status).toBe("APPROVED");
    const snaps2 = await loadApprovedSnapshotsFromPrisma(prisma2, CO);
    expect(snaps2.some((s) => s.snapshotId === proposed.snapshotId)).toBe(true);

    // Cutoff resolved while APPROVED snapshot is live
    let readiness = await loadTransactionWorkflowReadiness(CO, {
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    });
    expect(readiness.cutoff?.state).toBe("RESOLVED");
    expect(readiness.cutoff?.reportingPeriodKey).toBe("FY2026-Q2");
    expect(readiness.cutoff?.snapshotId).toBe(proposed.snapshotId);

    // Restatement DRAFT names predecessor but must not invalidate APPROVED reporting until approved.
    const restated = await proposeCertificateRestatement({
      companyId: CO,
      predecessorSnapshotId: proposed.snapshotId,
    });
    expect(restated.ok).toBe(true);
    expect(restated.status).toBe("DRAFT");
    const store3 = await PrismaApprovedSnapshotStore.open(prisma2, CO);
    expect(store3.getSnapshot(restated.snapshotId)?.supersedesSnapshotId).toBe(proposed.snapshotId);
    expect(store3.getSnapshot(proposed.snapshotId)?.status).toBe("APPROVED");
    readiness = await loadTransactionWorkflowReadiness(CO, {
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    });
    expect(readiness.cutoff?.state).toBe("RESOLVED");
    expect(readiness.cutoff?.snapshotId).toBe(proposed.snapshotId);

    // Approve restatement → predecessor SUPERSEDED; cutoff binds to successor
    const restatedApproved = await approveWorkspaceCertificate({
      companyId: CO,
      snapshotId: restated.snapshotId,
      reviewedBy: "e2e-counsel",
      approvalRef: "apr-e2e-restatement",
      reviewedAt: "2026-07-25T18:00:00Z",
    });
    expect(restatedApproved.ok).toBe(true);
    const store3b = await PrismaApprovedSnapshotStore.open(prisma2, CO);
    expect(store3b.getSnapshot(proposed.snapshotId)?.status).toBe("SUPERSEDED");
    readiness = await loadTransactionWorkflowReadiness(CO, {
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    });
    expect(readiness.cutoff?.state).toBe("RESOLVED");
    expect(readiness.cutoff?.snapshotId).toBe(restated.snapshotId);

    // Ledger usage
    const usage = await appendContractLedgerUsage({
      companyId: CO,
      usageId: `usage-${CO}-hist`,
      instrumentKey: "synthetic-term-loan-a",
      effectiveAsOf: "2026-05-15",
      amount: "5000000",
      currency: "USD",
      ruleId: "General Investments Basket",
      transactionRef: "txn-e2e-hist",
      approvalRef: "apr-e2e-restatement",
    });
    expect(usage.ok).toBe(true);

    const ledgerStore = await PrismaContractLedgerStore.open(prisma2, CO);
    expect(ledgerStore.getUsage(`usage-${CO}-hist`)?.status).toBe("RECORDED");

    // Ambiguous / missing date fail-closed
    const noDate = await analyzeContemplatedTransaction({
      companyId: CO,
      question: "Can we incur $100 million of secured debt?",
    });
    expect(noDate.answer.kind).toBe("needs_confirmation");
    expect(noDate.draft.missingConfirmations.some((m) => /evaluationDate/i.test(m))).toBe(true);

    // Transaction analysis with date — certified package absent → REVIEW_REQUIRED / insufficient
    const txn = await analyzeContemplatedTransaction({
      companyId: CO,
      question: "Can we incur $100 million of secured debt on 2026-08-01?",
      confirmed: true,
      verifiedPackage: null,
    });
    expect(txn.draft.amountMillions).toBe(100);
    expect(txn.authoritative.cutoff.state).toBe("RESOLVED");
    expect(txn.pathEnumeration.authority).toBe("NOT_CERTIFIED_4E");
    expect(txn.certifiedAttempt.blockers).toContain("NO_VERIFIED_EXECUTION_PACKAGE");
    expect(["insufficient_evidence", "review_required"]).toContain(txn.answer.kind);

    auth = await loadAuthoritativeCapacity({ companyId: CO, evaluationDate: "2026-08-01" });
    expect(auth.authority).not.toBe("CERTIFIED_4A_4D");
    expect(auth.activeLedgerUsageCount).toBeGreaterThanOrEqual(1);

    // Tenant isolation: OTHER company cannot see CO snapshots/usages
    const otherSnaps = await loadApprovedSnapshotsFromPrisma(prisma2, OTHER);
    const otherLedger = await loadLedgerUsagesFromPrisma(prisma2, OTHER);
    expect(otherSnaps.some((s) => s.snapshotId === proposed.snapshotId)).toBe(false);
    expect(otherLedger.some((u) => u.usageId === `usage-${CO}-hist`)).toBe(false);

    await prisma2.$disconnect();
  }, 120_000);
});
