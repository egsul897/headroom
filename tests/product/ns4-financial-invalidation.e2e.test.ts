/**
 * Persisted NS-4 financial change invalidates Dashboard / Position / Simulate
 * shared snapshot identity and dependent capacity conclusions.
 *
 * DB-gated (DATABASE_URL). SYNTHETIC certificates only.
 * IMPLEMENTED ≠ CERTIFIED. Never publishes gross as verified remaining.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  proposeSyntheticCertificateForCompany,
  approveWorkspaceCertificate,
  proposeCertificateRestatement,
  loadAuthoritativeCapacity,
  loadNs4DashboardFinancialState,
} from "@/lib/product/north-star-workflow";
import { loadSharedNs4FinancialIdentity } from "@/lib/product/ns4-shared-financial-identity";
import {
  coherentDebtFundedAcquisition,
  evaluateCoherentScenario,
} from "@/lib/product/cross-domain-scenarios";

const CO = "ns4-fin-invalidate-co";
const EVAL = "2026-08-01";

async function neonReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

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

describeDb("NS-4 persisted financial invalidation → Position/Simulate identity", () => {
  const prisma = new PrismaClient();
  let suiteActive = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      console.warn("[ns4-financial-invalidation] Neon unreachable — skipping persisted suite");
      return;
    }
    await teardown(prisma, CO);
    await prisma.company.create({
      data: { id: CO, name: "NS-4 Financial Invalidation Co", tenantKind: "EVALUATION" },
    });
    suiteActive = true;
  }, 60_000);

  afterAll(async () => {
    if (suiteActive) await teardown(prisma, CO);
    await prisma.$disconnect().catch(() => undefined);
  }, 60_000);

  it("approve → shared bound identity; restatement invalidates prior bound conclusions", async ({ skip }) => {
    if (!suiteActive) {
      skip();
      return;
    }

    const empty = await loadNs4DashboardFinancialState({ companyId: CO, evaluationDate: EVAL });
    expect(empty.status).toBe("NEEDS_INPUT");
    expect(empty.boundSnapshot).toBeNull();

    const proposed = await proposeSyntheticCertificateForCompany(CO, {
      snapshotId: `snap-${CO}-q2`,
      reportingPeriod: "FY2026-Q2",
      asOf: "2026-06-30",
    });
    expect(proposed.ok).toBe(true);

    const approved = await approveWorkspaceCertificate({
      companyId: CO,
      snapshotId: proposed.snapshotId,
      reviewedBy: "invalidate-counsel",
      approvalRef: "apr-invalidate-1",
      reviewedAt: "2026-07-20T18:00:00Z",
    });
    expect(approved.ok).toBe(true);

    const auth1 = await loadAuthoritativeCapacity({ companyId: CO, evaluationDate: EVAL });
    const dash1 = await loadNs4DashboardFinancialState({ companyId: CO, evaluationDate: EVAL });
    const shared1 = await loadSharedNs4FinancialIdentity({
      companyId: CO,
      evaluationDate: EVAL,
      authoritative: auth1,
    });

    expect(dash1.status).toBe("APPROVED_BOUND");
    expect(shared1.boundSnapshotId).toBe(proposed.snapshotId);
    expect(auth1.cutoff.approvedSnapshotId).toBe(proposed.snapshotId);
    expect(shared1.identityConsistentWithAuthoritative).toBe(true);
    expect(auth1.approvedSnapshotCount).toBeGreaterThanOrEqual(1);

    // Acquisition composition remains non-authoritative for remaining (no VEP / completeness).
    const acq = evaluateCoherentScenario(coherentDebtFundedAcquisition(150));
    expect(acq.domains.every((d) => d.verifiedRemainingMillions == null)).toBe(true);

    // Restatement DRAFT names predecessor; approving it SUPERSEDES prior bound identity.
    const restated = await proposeCertificateRestatement({
      companyId: CO,
      predecessorSnapshotId: proposed.snapshotId!,
      reviewedByNote: "material financial correction invalidating prior capacity conclusions",
    });
    expect(restated.ok).toBe(true);
    expect(restated.status).toBe("DRAFT");

    const approved2 = await approveWorkspaceCertificate({
      companyId: CO,
      snapshotId: restated.snapshotId,
      reviewedBy: "invalidate-counsel",
      approvalRef: "apr-invalidate-2",
      reviewedAt: "2026-07-25T18:00:00Z",
    });
    expect(approved2.ok).toBe(true);

    const auth2 = await loadAuthoritativeCapacity({ companyId: CO, evaluationDate: EVAL });
    const shared2 = await loadSharedNs4FinancialIdentity({
      companyId: CO,
      evaluationDate: EVAL,
      authoritative: auth2,
    });

    // Dependent identity moved — prior Q2 bound is no longer the cutoff-bound snapshot.
    expect(shared2.boundSnapshotId).not.toBe(proposed.snapshotId);
    expect(shared2.boundSnapshotId).toBe(restated.snapshotId);
    expect(auth2.cutoff.approvedSnapshotId).toBe(restated.snapshotId);
    expect(shared2.identityConsistentWithAuthoritative).toBe(true);

    // Capacity surface still refuses certified remaining without VEP.
    expect(auth2.certified.packagePresent).toBe(false);
    expect(auth2.missingInputs).toContain("VerifiedExecutionPackage");
    expect(["NEEDS_INPUT", "REVIEW_REQUIRED", "UNSUPPORTED"]).toContain(auth2.status);
  });
});
