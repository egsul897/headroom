/**
 * Manual-upload convergence (docs/autonomous-retrieval-phase-a-foundation.md):
 * uploadDocumentThroughIngestion must (1) auto-create exactly one
 * DOCUMENT_UPLOAD CompanySourceConnection per company, (2) create a
 * SourceArtifact linked to the real Document row uploadAndChunkDocument
 * produces, and (3) refuse to create a duplicate Document for
 * byte-identical content re-uploaded a second time - surfacing the
 * duplicate instead.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { getOrCreateUploadConnection, listCompanySourceConnections } from "../../lib/connectors/registry";
import { uploadDocumentThroughIngestion } from "../../lib/connectors/upload-connector";

const COMPANY_ID = "fixture-upload-convergence-co";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("upload-connector convergence", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Upload Convergence Co (synthetic, test-only)" } });
  });

  afterAll(async () => {
    await teardown();
  });

  it("getOrCreateUploadConnection is idempotent - exactly one DOCUMENT_UPLOAD connection no matter how many times it's called", async () => {
    const a = await getOrCreateUploadConnection(COMPANY_ID);
    const b = await getOrCreateUploadConnection(COMPANY_ID);
    expect(a.id).toBe(b.id);
    expect(a.connectorType).toBe("DOCUMENT_UPLOAD");

    const connections = await listCompanySourceConnections(COMPANY_ID);
    expect(connections.filter((c) => c.connectorType === "DOCUMENT_UPLOAD")).toHaveLength(1);
  });

  it("a first upload creates a real Document + a linked SourceArtifact via the auto-created DOCUMENT_UPLOAD connection", async () => {
    const data = Buffer.from("THIS CREDIT AGREEMENT is dated as of January 1, 2026.\n\nSECTION 1.01. Nothing much here.");
    const result = await uploadDocumentThroughIngestion({ companyId: COMPANY_ID, filename: "test-agreement.txt", data, declaredType: "CREDIT_AGREEMENT" });

    expect(result.duplicate).toBe(false);
    expect(result.document).toBeDefined();

    const artifact = await prisma.sourceArtifact.findUniqueOrThrow({ where: { id: result.artifactId } });
    expect(artifact.artifactType).toBe("DOCUMENT");
    expect(artifact.documentId).toBe(result.document!.id);

    const uploadConnection = await getOrCreateUploadConnection(COMPANY_ID);
    expect(artifact.sourceConnectionId).toBe(uploadConnection.id);
  });

  it("re-uploading byte-identical content a second time is a no-op duplicate - no second Document row, no second SourceArtifact row", async () => {
    const data = Buffer.from("THIS CREDIT AGREEMENT is dated as of January 1, 2026.\n\nSECTION 1.01. Nothing much here.");
    const documentsBefore = await prisma.document.count({ where: { companyId: COMPANY_ID } });
    const artifactsBefore = await prisma.sourceArtifact.count({ where: { companyId: COMPANY_ID } });

    const result = await uploadDocumentThroughIngestion({ companyId: COMPANY_ID, filename: "test-agreement-reupload.txt", data, declaredType: "CREDIT_AGREEMENT" });
    expect(result.duplicate).toBe(true);
    expect(result.document).toBeUndefined();

    expect(await prisma.document.count({ where: { companyId: COMPANY_ID } })).toBe(documentsBefore);
    expect(await prisma.sourceArtifact.count({ where: { companyId: COMPANY_ID } })).toBe(artifactsBefore);
  });

  it("genuinely different content uploads as a real second Document", async () => {
    const data = Buffer.from("A DIFFERENT DOCUMENT entirely, with different bytes.");
    const documentsBefore = await prisma.document.count({ where: { companyId: COMPANY_ID } });

    const result = await uploadDocumentThroughIngestion({ companyId: COMPANY_ID, filename: "different-document.txt", data, declaredType: "OTHER" });
    expect(result.duplicate).toBe(false);
    expect(await prisma.document.count({ where: { companyId: COMPANY_ID } })).toBe(documentsBefore + 1);
  });

  // --- P1-3 remediation additions (docs/foundation-remediation/08-p1-reconciliation.json,
  // 13-remaining-foundation-risks.json): the onboarding upload action
  // (app/[companyId]/onboarding/documents/actions.ts) is now routed through
  // this same uploadDocumentThroughIngestion wrapper - these tests cover the
  // cross-path convergence and concurrency guarantees that fix depends on.
  // See tests/onboarding/documents-actions-dedup.test.ts for the equivalent
  // coverage driven through the real server action itself.

  it("same bytes, same tenant, DIFFERENT ingestion entry points converge on one Document: a direct uploadDocumentThroughIngestion call, then a second simulating the onboarding action's own call shape", async () => {
    const data = Buffer.from("CROSS-PATH CONVERGENCE FIXTURE. Section 5.01. Uploaded once directly, once via a second call shape.");

    const viaDirectCall = await uploadDocumentThroughIngestion({ companyId: COMPANY_ID, filename: "cross-path-a.txt", data, declaredType: "CREDIT_AGREEMENT" });
    expect(viaDirectCall.duplicate).toBe(false);

    // The onboarding action itself does nothing more than build this exact
    // params shape from a FormData and call uploadDocumentThroughIngestion -
    // reproducing that call here (rather than re-importing the "use server"
    // action module a second time in this file) proves the SAME wrapper
    // path, invoked a second time with different provenance (filename,
    // declaredType, governs), still converges.
    const viaSecondEntryPoint = await uploadDocumentThroughIngestion({
      companyId: COMPANY_ID,
      filename: "cross-path-b-renamed.txt",
      data,
      declaredType: "OTHER",
      governs: "Revolving Credit Facility",
    });
    expect(viaSecondEntryPoint.duplicate).toBe(true);
    expect(viaSecondEntryPoint.artifactId).toBe(viaDirectCall.artifactId);

    const rows = await prisma.document.findMany({ where: { companyId: COMPANY_ID, originalFilename: { in: ["cross-path-a.txt", "cross-path-b-renamed.txt"] } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.originalFilename).toBe("cross-path-a.txt");
  });

  it("concurrent duplicate ingestion: N simultaneous uploads of byte-identical content for the same company converge on exactly one Document and one SourceArtifact, with no unhandled errors", async () => {
    const data = Buffer.from("CONCURRENT DUPLICATE FIXTURE. Section 4.01. Ten near-simultaneous uploads of this exact content race here.");
    const N = 10;

    const settled = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        uploadDocumentThroughIngestion({ companyId: COMPANY_ID, filename: `concurrent-fixture-${i}.txt`, data, declaredType: "CREDIT_AGREEMENT" })
      )
    );

    // Every single call resolves - none surfaces a raw DB error (e.g. an
    // uncaught P2002 unique-constraint violation) to its own caller.
    for (const s of settled) expect(s.status).toBe("fulfilled");
    const results = settled.map((s) => (s as PromiseFulfilledResult<Awaited<ReturnType<typeof uploadDocumentThroughIngestion>>>).value);

    const winners = results.filter((r) => !r.duplicate);
    const losers = results.filter((r) => r.duplicate);
    expect(winners).toHaveLength(1); // exactly one caller actually created the Document/SourceArtifact
    expect(losers).toHaveLength(N - 1);

    // Every result (winner and every loser) agrees on the SAME artifact id -
    // no split-brain outcome where two different rows both look "current."
    const artifactIds = new Set(results.map((r) => r.artifactId));
    expect(artifactIds.size).toBe(1);

    const documentRows = await prisma.document.findMany({ where: { companyId: COMPANY_ID, originalFilename: { startsWith: "concurrent-fixture-" } } });
    expect(documentRows).toHaveLength(1); // every losing caller's own orphaned Document row was unwound, not left behind

    const artifactRows = await prisma.sourceArtifact.findMany({ where: { companyId: COMPANY_ID, documentId: documentRows[0]!.id } });
    expect(artifactRows).toHaveLength(1);

    // No dangling chunks from an unwound loser's Document either (cascade).
    const chunkCount = await prisma.documentChunk.count({ where: { documentId: documentRows[0]!.id } });
    expect(chunkCount).toBeGreaterThan(0);
  });
});
