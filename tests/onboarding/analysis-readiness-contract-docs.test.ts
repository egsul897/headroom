/**
 * getAnalysisReadinessForCompany must scope to CONTRACT_DOCUMENT_TYPES —
 * the same set runContractAnalysis analyzes. CSV/OTHER and compliance
 * certificates must not force NEVER_ANALYZED / STALE.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { getAnalysisReadinessForCompany } from "../../lib/contract-model/analysis";
import { reviewCandidate } from "../../lib/onboarding/review";

const COMPANY_ID = "fixture-analysis-readiness-contract-docs";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("analysis readiness ignores non-contract Document rows", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Analysis readiness contract-doc scope", onboardingStatus: "ONBOARDING" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("OTHER / COMPLIANCE_CERTIFICATE alone → NO_DOCUMENTS ready", async () => {
    await prisma.document.create({
      data: { companyId: COMPANY_ID, name: "CSV upload (financial figures)", type: "OTHER" },
    });
    await prisma.document.create({
      data: { companyId: COMPANY_ID, name: "Q2 compliance certificate", type: "COMPLIANCE_CERTIFICATE" },
    });
    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(true);
    expect(readiness.reason).toBe("NO_DOCUMENTS");
  });

  it("CREDIT_AGREEMENT without AnalysisRun → NEVER_ANALYZED; blocks covenant review, not FINANCIAL_FACT", async () => {
    await prisma.document.create({
      data: { companyId: COMPANY_ID, name: "Harbor Lane Credit Agreement", type: "CREDIT_AGREEMENT" },
    });
    const readiness = await getAnalysisReadinessForCompany(COMPANY_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toBe("NEVER_ANALYZED");

    const run = await prisma.extractionRun.create({
      data: {
        companyId: COMPANY_ID,
        documentId: (await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, type: "OTHER" } })).id,
        provider: "fixture",
        model: "n/a",
        promptVersion: "n/a",
        schemaVersion: "v1",
      },
    });
    const stage = await prisma.extractionStage.create({
      data: { extractionRunId: run.id, stage: "FINANCIAL_INPUTS", status: "COMPLETE" },
    });
    const fact = await prisma.extractionCandidate.create({
      data: {
        extractionRunId: run.id,
        extractionStageId: stage.id,
        companyId: COMPANY_ID,
        kind: "FINANCIAL_FACT",
        sourceDocumentId: run.documentId,
        sourceChunkIds: [],
        proposedValue: {
          metricName: "cash",
          value: 1.1,
          asOfDate: "2026-06-30",
          canonicalUnit: "USD_MILLIONS",
          originalValue: 1.1,
          originalUnit: "USD_MILLIONS",
        },
        reviewStatus: "PENDING",
      },
    });
    const permission = await prisma.extractionCandidate.create({
      data: {
        extractionRunId: run.id,
        extractionStageId: stage.id,
        companyId: COMPANY_ID,
        kind: "PERMISSION",
        sourceDocumentId: (await prisma.document.findFirstOrThrow({ where: { companyId: COMPANY_ID, type: "CREDIT_AGREEMENT" } })).id,
        sourceChunkIds: [],
        proposedValue: {
          permissionRef: "7.01",
          sectionRef: "7.01",
          grantType: "DEBT_INCURRENCE",
          modelingStatus: "MODELED",
          formulaType: "FIXED_AMOUNT",
          thresholdValue: 30,
          description: "General debt basket",
        },
        reviewStatus: "PENDING",
      },
    });

    await expect(
      reviewCandidate({ candidateId: fact.id, action: "APPROVE", reviewedBy: "tester@headroom.app" }),
    ).resolves.toBeTruthy();
    await expect(
      reviewCandidate({ candidateId: permission.id, action: "APPROVE", reviewedBy: "tester@headroom.app" }),
    ).rejects.toThrow(/contract analysis is ready/);
  });
});
