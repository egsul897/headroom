/**
 * Integration test for the REAL RECONCILE stage (Phase B,
 * lib/connectors/ingestion.ts's runReconcileStage) - two FINANCIAL_FACT
 * candidates for the same metric/period from DIFFERENT connectors with
 * conflicting values -> the lower-priority one ends up REVIEW_REQUIRED with
 * a clear rationale naming the higher-priority value, the higher-priority
 * one is left completely untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { connectSource, getOrCreateUploadConnection } from "../../lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages, runIngestionJobStage, ensureFinancialFactContainer } from "../../lib/connectors/ingestion";
import { upsertArtifactWithDedup, canonicalizeFinancialRecord, computeContentHash } from "../../lib/connectors/dedup";
import { normalizeFinancialValue } from "../../lib/connectors/units";

const COMPANY_ID = "fixture-reconcile-stage-co";

// Computed relative to "today" (never a hardcoded past date) so this test
// never goes spuriously STALE_SOURCE as real time passes - "cash" has a
// tight 1-day staleness threshold (lib/connectors/reconciliation.ts's
// STALENESS_DAYS_BY_METRIC), so both facts below are dated today.
const TODAY = new Date().toISOString().slice(0, 10);

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("RECONCILE stage - real reconciliation, not the Phase A stub", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Reconcile Stage Co (synthetic, test-only)" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("flags the lower-priority (CSV) candidate REVIEW_REQUIRED with a rationale naming the higher-priority (upload) value; leaves the upload candidate untouched", async () => {
    // 1. A CSV_FINANCIAL connection reporting cash = 5,000,000 as of 2026-06-30,
    //    ingested through the real pipeline (INITIALIZE, full 6-stage run).
    const csvConnection = await connectSource({ companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" });
    const csvJob = await createIngestionJob({
      companyId: COMPANY_ID,
      kind: "INITIALIZE",
      sourceConnectionId: csvConnection.id,
      rawInput: Buffer.from(`metricName,value,asOfDate,unit\ncash,5000000,${TODAY},USD`),
    });
    // Run every stage except RECONCILE first, so we control exactly when
    // reconciliation runs (after BOTH candidates exist) - drive DISCOVER
    // through EXTRACT by hand rather than runAllPendingIngestionStages
    // (which would stop at RECONCILE before the upload-side candidate exists).
    for (const stage of ["DISCOVER", "FETCH", "CLASSIFY_DEDUPE", "EXTRACT"] as const) {
      const result = await runIngestionJobStage(csvJob.id, stage);
      expect(result.status).toBe("COMPLETE");
    }

    const csvCandidate = await prisma.extractionCandidate.findFirstOrThrow({ where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" } });
    expect((csvCandidate.proposedValue as { metricName: string }).metricName).toBe("cash");
    expect(csvCandidate.reviewStatus).toBe("PENDING");

    // 2. A DOCUMENT_UPLOAD-sourced fact for the SAME metric/period, cash =
    //    5,800,000 - beyond the 1% tolerance from the CSV value above, and
    //    DOCUMENT_UPLOAD outranks CSV_FINANCIAL per the seeded global
    //    SourcePriorityRule rows (prisma/migrations/20260825210000.../migration.sql).
    const uploadConnection = await getOrCreateUploadConnection(COMPANY_ID);
    const normalization = normalizeFinancialValue("cash", 5800000, "USD");
    const rawPayload = { metricName: "cash", value: normalization.normalizedValue, asOfDate: TODAY, canonicalUnit: normalization.canonicalUnit, originalValue: normalization.originalValue, originalUnit: normalization.originalUnit };
    const data = canonicalizeFinancialRecord(rawPayload);
    const { artifact } = await upsertArtifactWithDedup({
      companyId: COMPANY_ID,
      sourceConnectionId: uploadConnection.id,
      artifactType: "FINANCIAL_RECORD",
      sourceIdentifier: "manual-upload-cash-q2",
      retrievedAt: new Date(),
      effectiveDate: new Date(TODAY),
      contentHash: computeContentHash(data),
      rawPayload,
    });
    const container = await ensureFinancialFactContainer(COMPANY_ID, uploadConnection);
    const uploadCandidate = await prisma.extractionCandidate.create({
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

    // 3. Now run RECONCILE for the CSV job.
    const reconcileResult = await runIngestionJobStage(csvJob.id, "RECONCILE");
    expect(reconcileResult.status).toBe("COMPLETE");
    expect(reconcileResult.recordsChanged).toBe(1); // exactly the CSV candidate flagged

    const csvAfter = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: csvCandidate.id } });
    expect(csvAfter.reviewStatus).toBe("REVIEW_REQUIRED");
    expect(csvAfter.rationale).toMatch(/higher-priority/i);
    expect(csvAfter.rationale).toMatch(/DOCUMENT_UPLOAD/);
    expect(csvAfter.rationale).toContain(uploadCandidate.id);
    expect(csvAfter.rationale).toMatch(/5\.8/);

    const uploadAfter = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: uploadCandidate.id } });
    expect(uploadAfter.reviewStatus).toBe("PENDING"); // untouched - it is the WINNER
    expect(uploadAfter.rationale).toBeNull();

    // 4. The stage's own persisted output records the classification, per the brief's own requirement.
    const stageRow = await prisma.ingestionJobStage.findUniqueOrThrow({ where: { ingestionJobId_stage: { ingestionJobId: csvJob.id, stage: "RECONCILE" } } });
    const output = stageRow.output as { classificationCounts: Record<string, number>; groups: unknown[] };
    expect(output.classificationCounts.MATERIAL_DIFFERENCE).toBe(1);
    expect(output.groups).toHaveLength(1);

    // Re-running RECONCILE for the CSV job again is refused - it is already COMPLETE (same discipline as every other stage).
    await expect(runIngestionJobStage(csvJob.id, "RECONCILE")).rejects.toThrow(/already COMPLETE/);
  });

  it("MATCH: two agreeing sources leave both candidates' reviewStatus exactly as-is (no writes)", async () => {
    const csvConnection = await prisma.companySourceConnection.findUniqueOrThrow({ where: { companyId_connectorType: { companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" } } });
    const uploadConnection = await getOrCreateUploadConnection(COMPANY_ID);

    // Two agreeing total_debt facts for a NEW period (this month, distinct
    // from the "cash" facts above which used today's exact date - total_debt
    // has a 30-day staleness threshold, so any recent day works).
    const csvJob = await createIngestionJob({
      companyId: COMPANY_ID,
      kind: "SYNC",
      sourceConnectionId: csvConnection.id,
      rawInput: Buffer.from(`metricName,value,asOfDate,unit\ntotal_debt,20000000,${TODAY},USD`),
    });
    for (const stage of ["DISCOVER", "FETCH", "CLASSIFY_DEDUPE", "EXTRACT"] as const) {
      expect((await runIngestionJobStage(csvJob.id, stage)).status).toBe("COMPLETE");
    }
    const csvCandidate = await prisma.extractionCandidate.findFirstOrThrow({ where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT", proposedValue: { path: ["metricName"], equals: "total_debt" } } });

    const totalDebtNormalization = normalizeFinancialValue("total_debt", 20050000, "USD"); // within 1% tolerance
    const rawPayload = { metricName: "total_debt", value: totalDebtNormalization.normalizedValue, asOfDate: TODAY, canonicalUnit: totalDebtNormalization.canonicalUnit, originalValue: totalDebtNormalization.originalValue, originalUnit: totalDebtNormalization.originalUnit };
    const data = canonicalizeFinancialRecord(rawPayload);
    const { artifact } = await upsertArtifactWithDedup({
      companyId: COMPANY_ID,
      sourceConnectionId: uploadConnection.id,
      artifactType: "FINANCIAL_RECORD",
      sourceIdentifier: "manual-upload-total-debt-q3",
      retrievedAt: new Date(),
      effectiveDate: new Date(TODAY),
      contentHash: computeContentHash(data),
      rawPayload,
    });
    const container = await ensureFinancialFactContainer(COMPANY_ID, uploadConnection);
    const uploadCandidate = await prisma.extractionCandidate.create({
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

    const reconcileResult = await runIngestionJobStage(csvJob.id, "RECONCILE");
    expect(reconcileResult.status).toBe("COMPLETE");
    expect(reconcileResult.recordsChanged).toBe(0);

    expect((await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: csvCandidate.id } })).reviewStatus).toBe("PENDING");
    expect((await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: uploadCandidate.id } })).reviewStatus).toBe("PENDING");

    const stageRow = await prisma.ingestionJobStage.findUniqueOrThrow({ where: { ingestionJobId_stage: { ingestionJobId: csvJob.id, stage: "RECONCILE" } } });
    const output = stageRow.output as { classificationCounts: Record<string, number> };
    expect(output.classificationCounts.MATCH).toBe(1);
  });

  it("SYNC-kind jobs now include RECONCILE (Phase B changed this from Phase A's SYNC-skips-RECONCILE stub-era decision)", async () => {
    const csvConnection = await prisma.companySourceConnection.findUniqueOrThrow({ where: { companyId_connectorType: { companyId: COMPANY_ID, connectorType: "CSV_FINANCIAL" } } });
    const job = await createIngestionJob({ companyId: COMPANY_ID, kind: "SYNC", sourceConnectionId: csvConnection.id, rawInput: Buffer.from("metricName,value,asOfDate,unit\ncash,1,2026-08-01,USD") });
    expect(job.stages.map((s) => s.stage)).toContain("RECONCILE");
    const results = await runAllPendingIngestionStages(job.id);
    expect(results.every((r) => r.status === "COMPLETE")).toBe(true);
  });
});
