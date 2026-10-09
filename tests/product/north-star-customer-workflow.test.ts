/**
 * Product workflow proof (synthetic financials — NOT authentic customer certificate):
 * seed cert → approve → cutoff → transaction readiness → Ask gating.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  approveWorkspaceCertificate,
  appendContractLedgerUsage,
  loadTransactionWorkflowReadiness,
  proposeSyntheticCertificateForCompany,
} from "@/lib/product/north-star-workflow";
import { answerAsk } from "@/lib/ask/shell-runner";

const CO = "ns-product-workflow-co";
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

async function teardown(prisma: PrismaClient) {
  await prisma.contractLedgerUsageEvent.deleteMany({ where: { companyId: CO } });
  await prisma.contractLedgerUsage.deleteMany({ where: { companyId: CO } });
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId: CO } });
  await prisma.contractInputFactLocator.deleteMany({
    where: { fact: { snapshot: { companyId: CO } } },
  });
  await prisma.contractInputFact.deleteMany({ where: { snapshot: { companyId: CO } } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId: CO } });
  await prisma.company.deleteMany({ where: { id: CO } });
}

describeDb("North Star customer workflow (product)", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await teardown(prisma);
    await prisma.company.create({
      data: { id: CO, name: "NS Product Workflow Co (synthetic)", tenantKind: "EVALUATION" },
    });
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma);
    await prisma.$disconnect();
  }, 60_000);

  it("propose → approve → ledger → cutoff readiness → Ask surfaces TRANSACTION_READINESS", async () => {
    const proposed = await proposeSyntheticCertificateForCompany(CO, {
      snapshotId: `snap-${CO}-q2`,
      reportingPeriod: "FY2026-Q2",
      asOf: "2026-06-30",
    });
    expect(proposed.ok).toBe(true);
    expect(proposed.status).toBe("DRAFT");

    let readiness = await loadTransactionWorkflowReadiness(CO, {
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    });
    expect(readiness.canRunTransactionWorkflow).toBe(false);
    expect(readiness.steps.approvedFinancialSnapshot).toBe("MISSING");

    const approved = await approveWorkspaceCertificate({
      companyId: CO,
      snapshotId: proposed.snapshotId,
      reviewedBy: "product-e2e-reviewer",
      approvalRef: "apr-product-e2e-1",
      // Certificate delivered 2026-07-20 — evaluation after delivery can resolve Q2.
      reviewedAt: "2026-07-20T18:00:00Z",
    });
    expect(approved.ok).toBe(true);
    expect(approved.status).toBe("APPROVED");
    // Basket schedule lines from the certificate must land in 4C under the same approval.
    expect(approved.issues ?? []).toEqual([]);

    readiness = await loadTransactionWorkflowReadiness(CO, {
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    });
    // Permissions may be absent → canRun false, but APPROVED snapshot + cutoff should resolve.
    expect(readiness.northStar.approvedSnapshotCount).toBeGreaterThanOrEqual(1);
    // Certificate basket promotion and/or manual append — at least one attributed usage.
    expect(readiness.northStar.activeLedgerUsageCount).toBeGreaterThanOrEqual(1);

    const usage = await appendContractLedgerUsage({
      companyId: CO,
      usageId: `usage-${CO}-1`,
      instrumentKey: "synthetic-term-loan-a",
      effectiveAsOf: "2026-05-01",
      amount: "5000000",
      currency: "USD",
      ruleId: "rule-general-investments-basket",
      transactionRef: "txn-e2e-1",
      approvalRef: "apr-product-e2e-1",
    });
    expect(usage.ok).toBe(true);

    readiness = await loadTransactionWorkflowReadiness(CO, {
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    });
    expect(readiness.northStar.activeLedgerUsageCount).toBeGreaterThanOrEqual(2);
    expect(readiness.cutoff?.state).toBe("RESOLVED");
    expect(readiness.cutoff?.reportingPeriodKey).toBe("FY2026-Q2");
    expect(readiness.cutoff?.snapshotId).toBe(proposed.snapshotId);

    // Without transaction date → Ask refuses to assume today / latest quarter.
    const askNeedsDate = await answerAsk({
      companyId: CO,
      question: "Can we incur $100 million of secured debt?",
    });
    expect(askNeedsDate.caseId).toBe("TRANSACTION_READINESS");
    expect(askNeedsDate.kind).toBe("insufficient_evidence");
    expect(askNeedsDate.detail).toMatch(/will not invent|explicit transaction date/i);

    // With explicit date + APPROVED Q2 cert, cutoff resolves; Permissions still missing → no invented capacity.
    const askDated = await answerAsk({
      companyId: CO,
      question: "Can we incur $100 million of secured debt on 2026-08-01?",
    });
    expect(askDated.caseId).toBe("TRANSACTION_READINESS");
    expect(askDated.transactionWorkflow?.reportingPeriodKey === "FY2026-Q2" || askDated.kind === "insufficient_evidence").toBe(true);
    expect(askDated.detail + (askDated.limitations ?? []).join(" ")).toMatch(/NOT_CERTIFIED_4E|LEGACY|will not invent|Permissions|cutoff/i);
  }, 60_000);
});
