/**
 * One complete customer setup loop against authentic package A credit-agreement
 * text + a labeled TEST compliance certificate. Mirrors the product action
 * composition (upload → extract → Phase 3 analysis → financial-fact propose →
 * review → promote) without a Next.js request context.
 *
 * Usage: npx tsx scripts/product/run-saas-setup-loop.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../lib/prisma";
import { SyntheticExtractionProvider } from "../../lib/extraction/synthetic-provider";
import { uploadAndChunkDocument, runExtractionForDocument } from "../../lib/onboarding/documents";
import { runContractAnalysis } from "../../lib/contract-model/analysis";
import { proposeFinancialFactsFromDocument } from "../../lib/onboarding/financial-facts-from-document";
import { reviewCandidate } from "../../lib/onboarding/review";
import { promoteCompanyCandidates } from "../../lib/onboarding/promotion";
import { getCompanySetupStatus, nextSetupStep } from "../../lib/onboarding/setup-status";
import { getAnalysisReadinessForCompany } from "../../lib/contract-model/analysis";
import { loadCapacityReadiness } from "../../lib/product/customer-intelligence/capacity-readiness";
import { computeLeverageMetrics } from "../../lib/covenant-engine";
import { loadCovenantOverviewInputs } from "../../lib/covenant-overview-service";
import { loadCompanyOverview } from "../../lib/home/load-overview";
import { analyzeCustomerDocument } from "../../lib/product/customer-intelligence/analyze-upload";
import { getDocumentStorageProvider } from "../../lib/document-storage";

const COMPANY_ID = `saas-setup-loop-e2e-${Date.now().toString(36)}`;
const AS_OF = "2026-06-30";
const OUT = join(process.cwd(), "docs/audits/saas-setup-loop-e2e-result.json");

const CERTIFICATE = `TEST COMPLIANCE CERTIFICATE — LABELED FIXTURE (not a live issuer filing)
Borrower: Harbor Lane Industries, Inc. (synthetic acceptance company)
As of June 30, 2026

Consolidated EBITDA: $1,700 million
Total Debt: $3,258 million
Secured Debt: $2,221 million
Unrestricted Cash: $1,162 million
Interest Expense: $190 million
Cumulative Net Income: $400 million
Equity Proceeds: $50 million
Assumed New Debt Rate: 7.5%
`;

async function processDocument(companyId: string, documentId: string) {
  await runExtractionForDocument({
    companyId,
    documentId,
    provider: new SyntheticExtractionProvider(),
    providerName: "synthetic",
    model: "synthetic-v1",
  });
  await runContractAnalysis({ companyId, triggeringDocumentId: documentId });
  try {
    const doc = await prisma.document.findFirst({ where: { id: documentId, companyId } });
    if (doc?.storageRef) {
      const bytes = await getDocumentStorageProvider().retrieve(doc.storageRef);
      await analyzeCustomerDocument({
        companyId,
        documentId,
        bytes,
        filename: doc.originalFilename || doc.name,
        declaredType: doc.type,
      });
    }
  } catch (err) {
    console.error(`[analyzeCustomerDocument] ${documentId}:`, err);
  }
  try {
    await proposeFinancialFactsFromDocument(companyId, documentId);
  } catch (err) {
    console.error(`[proposeFinancialFactsFromDocument] ${documentId}:`, err);
  }
}

async function main() {
  const agreementPath = join(
    process.cwd(),
    "tests/fixtures/product-acceptance/packages/pkg-a-basic-credit-agreement/documents/credit-agreement.txt",
  );
  const agreementText = readFileSync(agreementPath, "utf8");
  const report: Record<string, unknown> = { companyId: COMPANY_ID, asOf: AS_OF };

  await prisma.company.deleteMany({ where: { id: COMPANY_ID } }).catch(() => {});
  await prisma.company.create({
    data: { id: COMPANY_ID, name: "Harbor Lane Industries (SaaS setup E2E)", onboardingStatus: "ONBOARDING" },
  });

  const ca = await uploadAndChunkDocument({
    companyId: COMPANY_ID,
    filename: "harbor-lane-credit-agreement.txt",
    data: Buffer.from(agreementText, "utf8"),
    declaredType: "CREDIT_AGREEMENT",
  });
  const cert = await uploadAndChunkDocument({
    companyId: COMPANY_ID,
    filename: "test-compliance-certificate.txt",
    data: Buffer.from(CERTIFICATE, "utf8"),
    declaredType: "COMPLIANCE_CERTIFICATE",
  });
  report.uploaded = [
    { id: ca.document.id, type: ca.document.type, filename: "harbor-lane-credit-agreement.txt", source: "pkg-a-basic-credit-agreement" },
    { id: cert.document.id, type: cert.document.type, filename: "test-compliance-certificate.txt", source: "labeled-test-fixture" },
  ];

  await processDocument(COMPANY_ID, ca.document.id);
  await processDocument(COMPANY_ID, cert.document.id);

  const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
  report.analysisReadiness = { ready: readiness.ready, reason: readiness.reason, runStatus: readiness.run?.status ?? null };
  if (!readiness.ready) {
    throw new Error(`Expected analysis ready after extraction; got ${readiness.reason}`);
  }

  const candidates = await prisma.extractionCandidate.findMany({
    where: { companyId: COMPANY_ID, promotedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const approved: { id: string; kind: string; detail?: string }[] = [];
  const skippedReview: { id: string; kind: string; reason: string }[] = [];
  for (const c of candidates) {
    const value = c.proposedValue as { modelingStatus?: string; metricName?: string };
    if (c.kind === "PERMISSION" && value.modelingStatus === "KNOWN_NOT_MODELED") {
      try {
        await reviewCandidate({
          candidateId: c.id,
          action: "REJECT",
          reviewedBy: "saas-setup-e2e@headroom.app",
          note: "KNOWN_NOT_MODELED gap — rejected so it is not an open coverage item",
        });
        skippedReview.push({ id: c.id, kind: c.kind, reason: "KNOWN_NOT_MODELED — REJECTED (not operative)" });
      } catch (err) {
        skippedReview.push({ id: c.id, kind: c.kind, reason: err instanceof Error ? err.message : String(err) });
      }
      continue;
    }
    try {
      await reviewCandidate({
        candidateId: c.id,
        action: "APPROVE",
        reviewedBy: "saas-setup-e2e@headroom.app",
        note: "E2E approval of extracted candidate",
      });
      approved.push({
        id: c.id,
        kind: c.kind,
        detail: value.metricName ?? value.modelingStatus ?? undefined,
      });
    } catch (err) {
      skippedReview.push({ id: c.id, kind: c.kind, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  report.review = { approvedCount: approved.length, approved, skippedReview };

  const promotion = await promoteCompanyCandidates(COMPANY_ID, new Date(AS_OF));
  const ns4 = await prisma.contractInputSnapshot.findMany({
    where: { companyId: COMPANY_ID },
    select: { snapshotId: true, status: true, asOf: true, reportingPeriod: true, reviewedBy: true, approvalRef: true },
  });
  const ns4Facts = await prisma.contractInputFact.findMany({
    where: { snapshot: { companyId: COMPANY_ID, status: "APPROVED" } },
    select: { identityJson: true, valueJson: true, displayName: true, snapshotId: true },
  });
  const permissions = await prisma.permission.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, code: true, grantType: true, modelingStatus: true, reviewStatus: true, thresholdValue: true, sectionRef: true },
  });
  const financialStates = await prisma.financialState.findMany({ where: { companyId: COMPANY_ID } });
  const financialSnapshots = await prisma.financialSnapshot.findMany({ where: { companyId: COMPANY_ID } });

  report.promotion = {
    promotedCount: promotion.promotedCount,
    skipped: promotion.skipped,
    onboardingStatus: promotion.onboardingStatus,
  };
  report.provenance = {
    permissions,
    financialSnapshots: financialSnapshots.map((s) => ({
      id: s.id,
      asOfDate: s.asOfDate,
      ebitda: s.ebitda.toNumber(),
      totalDebt: s.totalDebt.toNumber(),
      securedDebt: s.securedDebt.toNumber(),
      cash: s.cash.toNumber(),
      interestExpense: s.interestExpense.toNumber(),
    })),
    financialStateCount: financialStates.length,
    ns4Snapshots: ns4,
    ns4ApprovedFacts: ns4Facts,
  };

  const setup = await getCompanySetupStatus(COMPANY_ID);
  const next = setup ? nextSetupStep(setup) : null;
  const capacity = await loadCapacityReadiness(COMPANY_ID);
  report.status = {
    setup,
    next,
    capacity: {
      status: capacity.status,
      canEvaluateExecutableCapacity: capacity.canEvaluateExecutableCapacity,
      headline: capacity.headline,
      ns4ApprovedSnapshotCount: capacity.ns4ApprovedSnapshotCount,
      blockers: capacity.blockers,
      guidance: capacity.guidance,
    },
  };

  try {
    const inputs = await loadCovenantOverviewInputs(COMPANY_ID);
    const metrics = computeLeverageMetrics(inputs.covenantData.financials);
    const overview = await loadCompanyOverview(COMPANY_ID);
    report.dashboard = {
      financials: inputs.covenantData.financials,
      contractualMetrics: {
        totalNetLeverage: metrics.totalNetLeverage,
        seniorSecuredNetLeverage: metrics.seniorSecuredNetLeverage,
        fixedChargeCoverage: metrics.fixedChargeCoverage,
        netDebt: metrics.netDebt,
        netSecured: metrics.netSecured,
        definition: "computeLeverageMetrics over approved FinancialSnapshotInput (covenant definitions)",
      },
      overviewKeys: Object.keys(overview.load),
      capacityCertified: setup?.capacityCertified ?? false,
    };
  } catch (err) {
    report.dashboard = { error: err instanceof Error ? err.message : String(err) };
  }

  report.success = Boolean(
    readiness.ready &&
      promotion.promotedCount > 0 &&
      ns4.some((s) => s.status === "APPROVED") &&
      setup?.capacityCertified === false,
  );
  report.blockers = [
    ...(capacity.blockers ?? []),
    ...(setup?.capacityCertified ? ["UI incorrectly claims capacityCertified"] : []),
    ...(!ns4.some((s) => s.status === "APPROVED") ? ["No NS-4 APPROVED snapshot after financial-fact promotion"] : []),
    ...(permissions.length === 0 ? ["No promoted Permissions — dashboard legal rulebook incomplete"] : []),
  ];

  mkdirSync(join(process.cwd(), "docs/audits"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT}`);
  if (!report.success) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
