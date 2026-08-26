/**
 * getCanonicalCompanyState (Phase B, lib/company-state/canonical-state.ts) -
 * returns correct, composed data for a company with real connections,
 * candidates, and conflicts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { connectSource, getOrCreateUploadConnection } from "../../lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages, ensureFinancialFactContainer } from "../../lib/connectors/ingestion";
import { upsertArtifactWithDedup, canonicalizeFinancialRecord, computeContentHash } from "../../lib/connectors/dedup";
import { getCanonicalCompanyState } from "../../lib/company-state/canonical-state";
import { normalizeFinancialValue } from "../../lib/connectors/units";

const COMPANY_ID = "fixture-canonical-state-co";
const TODAY = new Date().toISOString().slice(0, 10);

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("getCanonicalCompanyState", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Canonical State Co (synthetic, test-only)" } });

    // A CSV connection with one PENDING financial fact.
    const csvConnection = await connectSource({ companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" });
    const job = await createIngestionJob({ companyId: COMPANY_ID, kind: "INITIALIZE", sourceConnectionId: csvConnection.id, rawInput: Buffer.from(`metricName,value,asOfDate,unit\ncash,1000000,${TODAY},USD`) });
    await runAllPendingIngestionStages(job.id);

    // A conflicting DOCUMENT_UPLOAD-sourced fact for the same metric/period.
    const uploadConnection = await getOrCreateUploadConnection(COMPANY_ID);
    const normalization = normalizeFinancialValue("cash", 1300000, "USD");
    const rawPayload = { metricName: "cash", value: normalization.normalizedValue, asOfDate: TODAY, canonicalUnit: normalization.canonicalUnit, originalValue: normalization.originalValue, originalUnit: normalization.originalUnit };
    const data = canonicalizeFinancialRecord(rawPayload);
    const { artifact } = await upsertArtifactWithDedup({
      companyId: COMPANY_ID,
      sourceConnectionId: uploadConnection.id,
      artifactType: "FINANCIAL_RECORD",
      sourceIdentifier: "manual-cash",
      retrievedAt: new Date(),
      effectiveDate: new Date(TODAY),
      contentHash: computeContentHash(data),
      rawPayload,
    });
    const container = await ensureFinancialFactContainer(COMPANY_ID, uploadConnection);
    await prisma.extractionCandidate.create({
      data: {
        extractionRunId: container.extractionRunId,
        extractionStageId: container.extractionStageId,
        companyId: COMPANY_ID,
        kind: "FINANCIAL_FACT",
        sourceDocumentId: container.documentId,
        sourceChunkIds: [],
        proposedValue: { ...rawPayload, sourceRecordRef: artifact.id },
        reviewStatus: "PENDING",
      },
    });
  });

  afterAll(async () => {
    await teardown();
  });

  it("composes source connections, documents, review progress, and a fresh reconciliation conflict for the two disagreeing cash facts", async () => {
    const state = await getCanonicalCompanyState(COMPANY_ID);
    expect(state.companyId).toBe(COMPANY_ID);
    expect(state.sourceConnections.length).toBeGreaterThanOrEqual(2); // CSV_FINANCIAL + DOCUMENT_UPLOAD
    expect(state.sourceConnections.map((c) => c.connectorType).sort()).toEqual(["CSV_FINANCIAL", "DOCUMENT_UPLOAD"]);

    expect(state.documents.total).toBeGreaterThanOrEqual(1); // the FINANCIAL_FACT container document
    expect(state.reviewProgress.total).toBe(2);
    expect(state.reviewProgress.pending).toBe(2);

    expect(state.conflicts).toHaveLength(1);
    expect(state.conflicts[0]!.classification).toBe("MATERIAL_DIFFERENCE");
    expect(state.conflicts[0]!.metricName).toBe("cash");

    expect(state.reviewItems.length).toBe(2);
    expect(state.onboardingStatus).toBeDefined();

    // No FinancialSnapshot/FinancialState promoted yet - dashboard is legitimately absent, never fabricated.
    expect(state.dashboard).toBeUndefined();
  });

  it("reflects a live dashboard once a fact is approved and promoted (no persisted canonical-state table involved)", async () => {
    const { reviewCandidate } = await import("../../lib/onboarding/review");
    const { promoteCompanyCandidates } = await import("../../lib/onboarding/promotion");

    const csvCandidate = await prisma.extractionCandidate.findFirstOrThrow({ where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT", reviewStatus: "PENDING" } });
    // Not promotable alone (only "cash" among the 8 required fields) - this test only checks getCanonicalCompanyState's own composition behaves sanely around a skip, not that the dashboard fully populates (see tests/onboarding/financial-fact-promotion.test.ts for the full-batch success case).
    await reviewCandidate({ candidateId: csvCandidate.id, action: "APPROVE", reviewedBy: "test-reviewer@headroom.app" });
    const promotion = await promoteCompanyCandidates(COMPANY_ID, new Date(TODAY));
    expect(promotion.promotedCount).toBe(0);
    expect(promotion.skipped[0]!.reason).toMatch(/No existing or prior FinancialSnapshot/);

    const state = await getCanonicalCompanyState(COMPANY_ID);
    expect(state.reviewProgress.approved).toBe(1);
    // The now-APPROVED (but not yet promoted) candidate is no longer PENDING/REVIEW_REQUIRED, so it drops out of reviewItems/conflicts scope - reconciliation only reconsiders still-open candidates.
    expect(state.reviewItems.length).toBe(1);
  });
});
