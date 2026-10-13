/**
 * Secured-debt-funded acquisition scenario over shared APPROVED NS-4 binder
 * + cross-domain evaluator. Demonstrates debt, liens, investments, ratios,
 * cross-document constraints, and historical utilization honesty.
 *
 * Requires local DATABASE_URL (skips Neon/RDS). Never invents verified remaining.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  proposeAuthenticCertificateFixtureForCompany,
  approveFceProposedCertificate,
  loadApprovedFinancialInputBundle,
  loadNs4DashboardFinancialState,
  loadAuthoritativeCapacity,
} from "@/lib/product/north-star-workflow";
import {
  coherentDebtFundedAcquisition,
  coherentPackageData,
  evaluateCoherentScenario,
} from "@/lib/product/cross-domain-scenarios";
import { resolveContractualEbitdaDerivation, COHERENT_EBITDA_EVIDENCE } from "@/lib/financial-certificate-engine";
import { evaluateCrossDomainTransaction } from "@/lib/product/cross-domain-transaction";

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
  const COMPANY = "ns4-acq-scenario-co";
  const EVAL = "2026-08-01";

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

  it("APPROVED Coherent snapshot identity is shared; acquisition domains stay fail-closed on remaining", async () => {
    const proposed = await proposeAuthenticCertificateFixtureForCompany(COMPANY, "coherent_fy2026");
    expect(proposed.ok).toBe(true);
    const approved = await approveFceProposedCertificate({
      companyId: COMPANY,
      snapshotId: proposed.snapshotId!,
      reviewedBy: "counsel-acq@test.local",
      approvalRef: "apr-acq-coherent",
      reviewedAt: `${EVAL}T12:00:00Z`,
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

    // Cross-domain secured acquisition ($150M) — debt + liens + investments + ratios.
    const tx = coherentDebtFundedAcquisition(150);
    tx.assumptions.utilizationAttributed = true;
    tx.assumptions.utilizationCompletenessCertified = true; // must still not publish remaining
    const xd = evaluateCrossDomainTransaction({
      data: coherentPackageData(),
      transaction: tx,
      ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
    });

    const domains = new Set(xd.domains.map((d) => d.domain));
    expect(domains.has("DEBT_INCURRENCE_REFINANCING")).toBe(true);
    expect(domains.has("LIENS_SECURED_CAPACITY")).toBe(true);
    expect(domains.has("INVESTMENTS_ACQUISITIONS")).toBe(true);
    expect(domains.has("FINANCIAL_COVENANTS_RATIO_CAPACITY")).toBe(true);
    expect(domains.has("LEDGER_UTILIZATION_RECLASSIFICATION")).toBe(true);

    for (const d of xd.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
    }
    expect(xd.packageLimitations.some((l) => /Caller-supplied.*ignored/i.test(l))).toBe(true);

    // Unsupported / partial domains reported honestly (not invented clear).
    const unsupportedOrPartial = xd.domains.filter(
      (d) => d.support === "UNSUPPORTED" || d.support === "PARTIAL",
    );
    expect(unsupportedOrPartial.length).toBeGreaterThan(0);

    // Scenario helper path (same evaluator, no company branching).
    const viaHelper = evaluateCoherentScenario(coherentDebtFundedAcquisition(150));
    expect(viaHelper.contractualComputation.contractualEbitda).toBe(1700);
    expect(viaHelper.debtSimulation).not.toBeNull();

    // Authority categories remain distinct on binder.
    expect(binder.authority.kind).toBe("TEST_ATTRIBUTED_APPROVAL");
    expect(binder.authority.realReviewerApproval).toBe(false);
    expect(binder.leverageIr.capacitySeparationNote).toMatch(/not verified remaining/i);
  });
});
