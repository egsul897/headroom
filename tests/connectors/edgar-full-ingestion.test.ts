/**
 * Full, real, non-mocked end-to-end ingestion for a real EDGAR-connected
 * company (docs/autonomous-retrieval-phase-a-foundation.md): connectSource
 * -> createIngestionJob -> runAllPendingIngestionStages, all six stages,
 * against real SEC.gov data, no stubs. Proves the whole pull-based-connector
 * convergence path in one shot: real filings discovered, real exhibit bytes
 * fetched and deduped, real Document rows materialized and chunked, and the
 * EXACT SAME Phase 1/2 extraction pipeline (createExtractionRun/
 * runAllPendingStages) then runs against them - no second classification/
 * extraction path for connector-sourced documents.
 *
 * American Airlines Group (AAL) was chosen because its two most recent
 * qualifying filings (within the connector's default discovery window)
 * genuinely include real Term Loan Credit Agreement amendment exhibits -
 * confirmed via scripts/verify-edgar-connector.ts before writing this test,
 * see the phase report for the real counts. This keeps the test both REAL
 * and fast (a few seconds, not a multi-minute deep scan).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { connectSource } from "../../lib/connectors/registry";
import { createIngestionJob, runAllPendingIngestionStages } from "../../lib/connectors/ingestion";

const COMPANY_ID = "fixture-edgar-full-ingestion-co";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("full real EDGAR ingestion job (American Airlines Group, live SEC.gov)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture EDGAR Full Ingestion Co (synthetic company id, real EDGAR data)" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("runs DISCOVER through COMPLETE against real SEC.gov data and materializes real, chunked, extracted Document rows", async () => {
    const connection = await connectSource({ companyId: COMPANY_ID, connectorType: "EDGAR", config: { ticker: "AAL" } });
    expect((connection.config as { cik: string }).cik).toMatch(/^\d{10}$/);

    const job = await createIngestionJob({ companyId: COMPANY_ID, kind: "INITIALIZE", sourceConnectionId: connection.id });
    const results = await runAllPendingIngestionStages(job.id);

    expect(results.every((r) => r.status === "COMPLETE")).toBe(true);
    expect(results.length).toBe(6); // DISCOVER, FETCH, CLASSIFY_DEDUPE, EXTRACT, RECONCILE, COMPLETE

    const stages = await prisma.ingestionJobStage.findMany({ where: { ingestionJobId: job.id }, orderBy: { id: "asc" } });
    const discoverStage = stages.find((s) => s.stage === "DISCOVER")!;
    expect(discoverStage.recordsDiscovered).toBeGreaterThan(0);

    // Real SourceArtifact rows, real content hashes, real storageRefs.
    const artifacts = await prisma.sourceArtifact.findMany({ where: { companyId: COMPANY_ID } });
    expect(artifacts.length).toBeGreaterThan(0);
    for (const a of artifacts) {
      expect(a.artifactType).toBe("DOCUMENT");
      expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(a.storageRef).toBeTruthy();
      expect(a.documentId).toBeTruthy(); // materialized by CLASSIFY_DEDUPE
    }

    // Real Document rows, unconfirmed type (an AI/connector proposal, not yet human-reviewed).
    const documents = await prisma.document.findMany({ where: { companyId: COMPANY_ID } });
    expect(documents.length).toBe(artifacts.length);
    for (const d of documents) {
      expect(d.source).toBe("connector:EDGAR");
      expect(d.typeConfirmedByUser).toBe(false);
    }

    // Real DocumentChunk rows exist for each materialized document.
    for (const d of documents) {
      const chunkCount = await prisma.documentChunk.count({ where: { documentId: d.id } });
      expect(chunkCount).toBeGreaterThan(0);
    }

    // The EXACT SAME Phase 1/2 pipeline ran - real ExtractionRun/ExtractionCandidate rows, not a parallel path.
    const runs = await prisma.extractionRun.findMany({ where: { companyId: COMPANY_ID } });
    expect(runs.length).toBe(documents.length);
    for (const run of runs) {
      expect(run.provider).toBe("synthetic"); // no ANTHROPIC_API_KEY in this sandbox - getExtractionProvider()'s own documented fallback
    }
    const candidates = await prisma.extractionCandidate.findMany({ where: { companyId: COMPANY_ID } });
    expect(candidates.length).toBeGreaterThan(0);
    // At minimum, STRUCTURE always proposes a DOCUMENT_RELATIONSHIP candidate per document.
    expect(candidates.filter((c) => c.kind === "DOCUMENT_RELATIONSHIP").length).toBe(documents.length);

    // The connection's own sync bookkeeping was updated by the COMPLETE stage.
    const updatedConnection = await prisma.companySourceConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(updatedConnection.lastSuccessfulSyncAt).not.toBeNull();
    expect(updatedConnection.status).toBe("CONNECTED");
  }, 60000);
});
