/**
 * lib/onboarding/documents.ts - the live-document-upload bugfix's own
 * regression coverage (docs/live-document-upload-bugfix.md). Runs against
 * real Postgres and real filesystem I/O (LocalFilesystemStorageProvider,
 * automatic in this sandbox since BLOB_READ_WRITE_TOKEN is unset - see
 * lib/document-storage/index.ts) - the same "no DB/fs mocks for the pipeline
 * itself" convention tests/onboarding/synthetic-acceptance.test.ts already
 * established. A dedicated throwaway company id, cleaned up in afterAll.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";
import { getDocumentStorageProvider, LocalFilesystemStorageProvider } from "../../lib/document-storage";
import { inferContentType, uploadAndChunkDocument, getDocumentsWithExtractionStatus } from "../../lib/onboarding/documents";
import { parseDocument } from "../../lib/extraction/parse";

const COMPANY_ID = "upload-bugfix-test";

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Upload bugfix test company", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

describe("inferContentType", () => {
  it("maps supported extensions to their content type", () => {
    expect(inferContentType("agreement.pdf")).toBe("application/pdf");
    expect(inferContentType("agreement.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(inferContentType("agreement.txt")).toBe("text/plain");
    expect(inferContentType("AGREEMENT.PDF")).toBe("application/pdf");
  });

  it("throws a clear error for an unsupported extension instead of guessing", () => {
    expect(() => inferContentType("agreement.doc")).toThrow(/Unsupported document file extension/);
    expect(() => inferContentType("agreement")).toThrow(/Unsupported document file extension/);
  });
});

describe("uploadAndChunkDocument - successful upload", () => {
  it("persists the Document row, stores the bytes remotely-retrievable, and chunks it", async () => {
    const text = 'CREDIT AGREEMENT\n\nARTICLE I DEFINITIONS\n\nSECTION 1.1 Certain Defined Terms.\n\n"Adjusted EBITDA" means consolidated net income plus addbacks.\n';
    const { document, chunkCount } = await uploadAndChunkDocument({
      companyId: COMPANY_ID,
      filename: "test-agreement.txt",
      data: Buffer.from(text, "utf-8"),
      declaredType: "CREDIT_AGREEMENT",
    });

    expect(document.companyId).toBe(COMPANY_ID);
    expect(document.source).toBe("user-upload");
    expect(document.typeConfirmedByUser).toBe(false);
    expect(document.storageRef).toBeTruthy();
    expect(document.storageProvider).toBe("local-fs-dev");
    expect(chunkCount).toBeGreaterThan(0);

    // "extraction can read the remotely stored document" - the stored blob,
    // fetched back through the SAME DocumentStorageProvider a later request
    // would use, parses identically to the bytes that were uploaded.
    const storage = getDocumentStorageProvider();
    const retrieved = await storage.retrieve(document.storageRef!);
    expect(retrieved.toString("utf-8")).toBe(text);
    const parsed = await parseDocument(retrieved, "text/plain");
    expect(parsed.fullText).toContain("Adjusted EBITDA");

    const dbChunks = await prisma.documentChunk.count({ where: { documentId: document.id } });
    expect(dbChunks).toBe(chunkCount);
  });

  it("survives a refresh: the document and its chunk count are still there on a fresh query", async () => {
    const { document, chunkCount } = await uploadAndChunkDocument({
      companyId: COMPANY_ID,
      filename: "refresh-check.txt",
      data: Buffer.from("SECTION 1.1 Some Term.\n", "utf-8"),
      declaredType: "OTHER",
    });

    // A fresh top-level query, exactly what a browser refresh re-triggers
    // (app/[companyId]/onboarding/documents/page.tsx calls this same
    // function on every render - it holds no in-memory state).
    const afterRefresh = await getDocumentsWithExtractionStatus(COMPANY_ID);
    const found = afterRefresh.find((d) => d.id === document.id);
    expect(found).toBeDefined();
    expect(found!.chunkCount).toBe(chunkCount);
    expect(found!.originalFilename).toBe("refresh-check.txt");
  });
});

describe("uploadAndChunkDocument - DB write fails after the blob was already stored", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cleans up the orphaned blob and rethrows the original DB error, leaving no Document row and no orphaned file", async () => {
    // Capture the exact storageRef uploadAndChunkDocument's own internal
    // getDocumentStorageProvider() call produces, without changing its
    // real behavior (spyOn wraps, it does not replace, the real method).
    const storeSpy = vi.spyOn(LocalFilesystemStorageProvider.prototype, "store");

    const nonExistentCompanyId = "company-that-does-not-exist-for-fk-violation-test";

    let thrown: unknown;
    try {
      await uploadAndChunkDocument({
        companyId: nonExistentCompanyId,
        filename: "orphan-check.txt",
        data: Buffer.from("orphan test bytes", "utf-8"),
        declaredType: "OTHER",
      });
    } catch (err) {
      thrown = err;
    }

    // A real Prisma foreign-key violation (Document.companyId has no
    // matching Company row) - proves this is a genuine DB-write failure,
    // not a swallowed/mocked one.
    expect(thrown).toBeDefined();
    expect(String(thrown)).toMatch(/Foreign key constraint|does not exist/i);

    // No Document row was left behind - the FK violation is exactly what
    // prevented the row from being created.
    const orphanRows = await prisma.document.count({ where: { name: "orphan-check.txt" } });
    expect(orphanRows).toBe(0);

    // The blob itself was cleaned up, not left as a dangling orphan with no
    // referencing Document row - retrieve() on the exact storageRef the
    // failed upload produced must now fail (file gone).
    expect(storeSpy).toHaveBeenCalledTimes(1);
    const { storageRef } = await storeSpy.mock.results[0]!.value;
    const storage = getDocumentStorageProvider();
    await expect(storage.retrieve(storageRef)).rejects.toThrow();
  });
});
