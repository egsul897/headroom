/**
 * Dedup (docs/autonomous-retrieval-phase-a-foundation.md, task §12): two
 * artifacts with identical content for the same company - arriving via two
 * DIFFERENT source connections (simulating one via DOCUMENT_UPLOAD, one via
 * a second, EDGAR-typed connection) - must produce exactly ONE SourceArtifact
 * row, never two, with the second arrival recorded as provenance on the
 * existing row rather than silently dropped.
 *
 * Real Postgres, isolated fixture company (never touches Coherent/Matthews),
 * following the exact pattern tests/extraction/run-stage.test.ts already
 * established.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeContentHash, findDuplicateArtifact, upsertArtifactWithDedup } from "../../lib/connectors/dedup";
import { getOrCreateUploadConnection } from "../../lib/connectors/registry";

const COMPANY_ID = "fixture-dedup-co";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("dedup: two source paths, identical content, one SourceArtifact row", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Dedup Co (synthetic, test-only)" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("upserts the same content twice via two different connections -> exactly one row, with the second arrival recorded as provenance", async () => {
    const uploadConnection = await getOrCreateUploadConnection(COMPANY_ID);
    // Simulate a second, distinct connector without a real network call - a
    // raw CompanySourceConnection row is all upsertArtifactWithDedup needs.
    const edgarConnection = await prisma.companySourceConnection.create({
      data: { companyId: COMPANY_ID, connectorType: "EDGAR", provider: "SEC EDGAR (fixture)", capabilities: ["DOCUMENTS"], config: { cik: "0000000001", ticker: "FIX" } },
    });

    const bytes = Buffer.from("IDENTICAL CREDIT AGREEMENT TEXT, byte-for-byte the same regardless of which source produced it.");
    const contentHash = computeContentHash(bytes);

    const first = await upsertArtifactWithDedup({
      companyId: COMPANY_ID,
      sourceConnectionId: uploadConnection.id,
      artifactType: "DOCUMENT",
      sourceIdentifier: "manual-upload.pdf",
      retrievedAt: new Date("2026-01-01"),
      contentHash,
      mimeType: "application/pdf",
      storageRef: "fixture/manual-upload.pdf",
    });
    expect(first.wasDuplicate).toBe(false);

    const second = await upsertArtifactWithDedup({
      companyId: COMPANY_ID,
      sourceConnectionId: edgarConnection.id,
      artifactType: "DOCUMENT",
      sourceIdentifier: "0000000001-26-000001",
      sourceUri: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/exhibit10.htm",
      retrievedAt: new Date("2026-01-02"),
      contentHash,
      mimeType: "text/html",
    });
    expect(second.wasDuplicate).toBe(true);
    expect(second.artifact.id).toBe(first.artifact.id); // the SAME row, not a new one

    const rows = await prisma.sourceArtifact.findMany({ where: { companyId: COMPANY_ID, contentHash } });
    expect(rows).toHaveLength(1); // exactly one SourceArtifact row for this content, full stop

    const meta = rows[0]!.provenanceMetadata as { duplicateSources?: Array<{ sourceConnectionId: string; sourceIdentifier: string | null }> };
    expect(meta.duplicateSources).toHaveLength(1);
    expect(meta.duplicateSources![0]!.sourceConnectionId).toBe(edgarConnection.id);
    expect(meta.duplicateSources![0]!.sourceIdentifier).toBe("0000000001-26-000001");

    // The original row's own fields (from the FIRST arrival) are untouched by the second arrival.
    expect(rows[0]!.sourceConnectionId).toBe(uploadConnection.id);
    expect(rows[0]!.sourceIdentifier).toBe("manual-upload.pdf");
  });

  it("findDuplicateArtifact returns null for genuinely new content, and the row for content already seen", async () => {
    const bytes = Buffer.from("some other content nobody has ingested yet");
    const hash = computeContentHash(bytes);
    expect(await findDuplicateArtifact(COMPANY_ID, hash)).toBeNull();

    const uploadConnection = await getOrCreateUploadConnection(COMPANY_ID);
    await upsertArtifactWithDedup({ companyId: COMPANY_ID, sourceConnectionId: uploadConnection.id, artifactType: "DOCUMENT", retrievedAt: new Date(), contentHash: hash });
    const found = await findDuplicateArtifact(COMPANY_ID, hash);
    expect(found).not.toBeNull();
    expect(found!.contentHash).toBe(hash);
  });

  it("the SAME content hash for a DIFFERENT company is NOT treated as a duplicate - dedup is scoped per company", async () => {
    const otherCompanyId = "fixture-dedup-co-2";
    await prisma.company.create({ data: { id: otherCompanyId, name: "Fixture Dedup Co 2 (synthetic, test-only)" } });
    try {
      const bytes = Buffer.from("cross-company content, same bytes on purpose");
      const hash = computeContentHash(bytes);
      const uploadA = await getOrCreateUploadConnection(COMPANY_ID);
      const uploadB = await getOrCreateUploadConnection(otherCompanyId);

      const a = await upsertArtifactWithDedup({ companyId: COMPANY_ID, sourceConnectionId: uploadA.id, artifactType: "DOCUMENT", retrievedAt: new Date(), contentHash: hash });
      const b = await upsertArtifactWithDedup({ companyId: otherCompanyId, sourceConnectionId: uploadB.id, artifactType: "DOCUMENT", retrievedAt: new Date(), contentHash: hash });
      expect(a.wasDuplicate).toBe(false);
      expect(b.wasDuplicate).toBe(false);
      expect(a.artifact.id).not.toBe(b.artifact.id);
    } finally {
      await prisma.company.deleteMany({ where: { id: otherCompanyId } });
    }
  });
});
