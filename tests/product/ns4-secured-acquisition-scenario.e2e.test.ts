/**
 * Secured-debt-funded acquisition scenario over shared APPROVED NS-4 binder
 * + cross-domain evaluator. Demonstrates debt, liens, investments, ratios,
 * cross-document constraints, historical utilization honesty, supersession
 * invalidation, and pre-supersession evaluation-date retention.
 *
 * Requires local DATABASE_URL (skips Neon/RDS). Never invents verified remaining.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  proposeAuthenticCertificateFixtureForCompany,
  approveFceProposedCertificate,
  proposeCertificateRestatement,
  approveWorkspaceCertificate,
  loadApprovedFinancialInputBundle,
  loadNs4DashboardFinancialState,
  loadAuthoritativeCapacity,
} from "@/lib/product/north-star-workflow";
import {
  coherentDebtFundedAcquisition,
  coherentPackageData,
  evaluateCoherentScenario,
} from "@/lib/product/cross-domain-scenarios";
import {
  resolveContractualEbitdaDerivation,
  COHERENT_EBITDA_EVIDENCE,
} from "@/lib/financial-certificate-engine";
import { evaluateCrossDomainTransaction } from "@/lib/product/cross-domain-transaction";
import { deliveriesFromApprovedSnapshots } from "@/lib/product/north-star-workflow/certificate-deliveries";
import type { FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";

const BASE_URL = process.env.DATABASE_URL ?? "";
const canRun = Boolean(BASE_URL) && !/neon\.tech|amazonaws\.com|supabase\.co/i.test(BASE_URL);
const describeIso = canRun ? describe : describe.skip;

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

describeIso("NS-4 secured-debt acquisition — Dashboard/Position/Simulate identity", () => {
  const prisma = new PrismaClient();
  const COMPANY = `ns4-acq-scenario-${randomBytes(4).toString("hex")}`;
  const EVAL = "2026-08-01";
  const EVAL_BEFORE_COHERENT_DELIVERY = "2026-07-01"; // Coherent deliveredAt=2026-07-20

  beforeAll(async () => {
    await teardown(prisma, COMPANY);
    await prisma.company.create({
      data: { id: COMPANY, name: "NS4 Acquisition Scenario", tenantKind: "EVALUATION" },
    });
  }, 60_000);

  afterAll(async () => {
    await teardown(prisma, COMPANY);
    await prisma.$disconnect();
  }, 60_000);

  it("shared identity + independent domain statuses + supersession / historical cutoff", async () => {
    const proposed = await proposeAuthenticCertificateFixtureForCompany(COMPANY, "coherent_fy2026");
    expect(proposed.ok).toBe(true);

    // Persisted delivery evidence on DRAFT — not approval timestamp.
    const draftRow = await prisma.contractInputSnapshot.findFirst({
      where: { companyId: COMPANY, snapshotId: proposed.snapshotId! },
    });
    const draftProv = draftRow?.provenanceJson as { deliveredAtIsoDate?: string } | null;
    expect(draftProv?.deliveredAtIsoDate).toBe("2026-07-20");

    const approved = await approveFceProposedCertificate({
      companyId: COMPANY,
      snapshotId: proposed.snapshotId!,
      reviewedBy: "counsel-acq@test.local",
      approvalRef: "apr-acq-coherent",
      reviewedAt: `${EVAL}T12:00:00Z`,
      deliveredAsOfDate: EVAL,
    });
    expect(approved.ok).toBe(true);

    const binder = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL,
    });
    expect(binder.status).toBe("APPROVED_BOUND");
    expect(binder.boundSnapshotId).toBe(proposed.snapshotId);
    expect(binder.leverageIr.status).toBe("EXECUTABLE");
    expect(binder.verifiedCapacity?.capacitySnapshot?.ebitda).toBeCloseTo(1700, 3);
    expect(binder.authority.kind).toBe("TEST_ATTRIBUTED_APPROVAL");
    expect(binder.authority.realReviewerApproval).toBe(false);

    const dash = await loadNs4DashboardFinancialState({
      companyId: COMPANY,
      evaluationDate: EVAL,
    });
    expect(dash.boundSnapshot?.snapshotId).toBe(binder.boundSnapshotId);

    const auth = await loadAuthoritativeCapacity({
      companyId: COMPANY,
      evaluationDate: EVAL,
    });
    expect(auth.cutoff.approvedSnapshotId).toBe(binder.boundSnapshotId);

    // Same financial identity across Dashboard / capacity / binder (Position+Simulate share binder).
    expect(dash.boundSnapshot?.snapshotId).toBe(auth.cutoff.approvedSnapshotId);

    // Evaluation before certificate delivery → fail closed (no asOf / reviewedAt substitute).
    const beforeDelivery = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL_BEFORE_COHERENT_DELIVERY,
    });
    expect(beforeDelivery.status).not.toBe("APPROVED_BOUND");
    expect(beforeDelivery.boundSnapshotId).toBeNull();

    // Cross-domain secured acquisition ($150M) — debt + liens + investments + ratios.
    const tx = coherentDebtFundedAcquisition(150);
    tx.assumptions.utilizationAttributed = true;
    tx.assumptions.utilizationCompletenessCertified = true; // must still not publish remaining
    const xd = evaluateCrossDomainTransaction({
      data: coherentPackageData(),
      transaction: tx,
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });

    const byDomain = Object.fromEntries(xd.domains.map((d) => [d.domain, d]));
    // Honest package-wide classifications (audit): PARTIAL / UNSUPPORTED — never false EXECUTABLE.
    expect(byDomain.DEBT_INCURRENCE_REFINANCING?.support).toBe("PARTIAL");
    expect(byDomain.LIENS_SECURED_CAPACITY?.support).toBe("PARTIAL");
    expect(byDomain.INVESTMENTS_ACQUISITIONS?.support).toBe("PARTIAL");
    expect(byDomain.FINANCIAL_COVENANTS_RATIO_CAPACITY?.support).toBe("PARTIAL");
    expect(byDomain.LEDGER_UTILIZATION_RECLASSIFICATION?.support).toBe("PARTIAL");
    expect(byDomain.AFFILIATE_TRANSACTIONS?.support).toBe("UNSUPPORTED");
    expect(byDomain.GUARANTEES?.support).toBe("PARTIAL");
    expect(byDomain.SUBSIDIARY_DESIGNATION_STRUCTURAL?.support).toBe("UNSUPPORTED");

    // Independent condition statuses (not a single package-wide clear).
    const statuses = new Set(xd.domains.map((d) => `${d.domain}:${d.support}:${d.status}`));
    expect(statuses.size).toBeGreaterThan(3);

    for (const d of xd.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
    }
    expect(
      xd.packageLimitations.some(
        (l) =>
          /Caller-supplied utilizationAttributed|never authorize verified remaining|ignored for verified remaining/i.test(
            l,
          ),
      ),
    ).toBe(true);
    expect(xd.packageLimitations.some((l) => /Gross capacity is never described as verified/i.test(l))).toBe(
      true,
    );

    const unsupportedOrPartial = xd.domains.filter(
      (d) => d.support === "UNSUPPORTED" || d.support === "PARTIAL",
    );
    expect(unsupportedOrPartial.length).toBeGreaterThan(0);

    const viaHelper = evaluateCoherentScenario(coherentDebtFundedAcquisition(150));
    expect(viaHelper.contractualComputation.contractualEbitda).toBe(1700);
    expect(viaHelper.debtSimulation).not.toBeNull();
    expect(binder.leverageIr.capacitySeparationNote).toMatch(/not verified remaining/i);

    // DRAFT restatement must not alter currently approved binding.
    const restatement = await proposeCertificateRestatement({
      companyId: COMPANY,
      predecessorSnapshotId: proposed.snapshotId!,
      reviewedByNote: "draft correction — must not invalidate until approved",
      deliveredAtIsoDate: "2026-07-28",
    });
    expect(restatement.ok).toBe(true);
    expect(restatement.status).toBe("DRAFT");
    const whileDraft = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL,
    });
    expect(whileDraft.boundSnapshotId).toBe(proposed.snapshotId);
    expect(whileDraft.financialInputFingerprint).toBe(binder.financialInputFingerprint);

    // Approve restatement → supersedes; dependents rebind to new snapshot identity.
    const restatementApprove = await approveWorkspaceCertificate({
      companyId: COMPANY,
      snapshotId: restatement.snapshotId,
      reviewedBy: "counsel-restatement@test.local",
      approvalRef: "apr-acq-restatement",
      reviewedAt: `${EVAL}T18:00:00Z`,
    });
    expect(restatementApprove.ok).toBe(true);

    const after = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: EVAL,
    });
    expect(after.boundSnapshotId).toBe(restatement.snapshotId);
    expect(after.boundSnapshotId).not.toBe(proposed.snapshotId);
    expect(after.financialInputFingerprint).not.toBe(binder.financialInputFingerprint);

    const dashAfter = await loadNs4DashboardFinancialState({
      companyId: COMPANY,
      evaluationDate: EVAL,
    });
    expect(dashAfter.boundSnapshot?.snapshotId).toBe(restatement.snapshotId);

    // Evaluation date before restatement delivery retains prior eligible Coherent snapshot.
    const retained = await loadApprovedFinancialInputBundle({
      companyId: COMPANY,
      evaluationDate: "2026-07-25", // after Coherent delivery (07-20), before restatement (07-28)
    });
    expect(retained.boundSnapshotId).toBe(proposed.snapshotId);

    // Delivery helper: approval/asOf alone never manufactures a DeliveryRecord.
    const approvedOnly: FinancialSnapshot = {
      snapshotId: "snap-approved-no-delivery",
      version: "1",
      companyId: COMPANY,
      asOf: "2026-06-30",
      reportingPeriod: "FY2026",
      status: "APPROVED",
      supersedesSnapshotId: null,
      inputs: [],
      provenance: { source: "test", sourceVersion: null },
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-08-01T12:00:00Z",
        approvalRef: "apr",
      },
    };
    expect(deliveriesFromApprovedSnapshots(COMPANY, [approvedOnly])).toEqual([]);

    // Missing evaluationDate → fail closed.
    const noEval = await loadApprovedFinancialInputBundle({ companyId: COMPANY });
    expect(noEval.boundSnapshotId).toBeNull();
    expect(noEval.missingInputs).toContain("evaluationDate");
  });
});

describe("NS-4 acquisition e2e production-host / skip guard", () => {
  it("skips write suite when DATABASE_URL unset or points at Neon/RDS", () => {
    if (!BASE_URL) {
      expect(canRun).toBe(false);
      return;
    }
    if (/neon\.tech|amazonaws\.com|supabase\.co/i.test(BASE_URL)) {
      expect(canRun).toBe(false);
    } else {
      expect(canRun).toBe(true);
    }
  });
});
