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
});
