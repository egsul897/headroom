/**
 * uploadAndChunkDocument when the storage write itself fails (e.g. Vercel
 * Blob rejects the request, or - the actual production bug this fixes - a
 * misconfigured storage provider throws before ever writing anything).
 * Isolated into its own file because mocking lib/document-storage's
 * getDocumentStorageProvider() (module-level, hoisted by vi.mock) would
 * otherwise also affect documents.test.ts's real-storage tests in the same
 * file (docs/live-document-upload-bugfix.md).
 */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/prisma";

const storeMock = vi.fn();

vi.mock("../../lib/document-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/document-storage")>();
  return {
    ...actual,
    getDocumentStorageProvider: () => ({
      store: storeMock,
      retrieve: vi.fn(),
      delete: vi.fn(),
    }),
  };
});

// Imported AFTER the mock so it picks up the mocked module.
const { uploadAndChunkDocument } = await import("../../lib/onboarding/documents");

const COMPANY_ID = "upload-bugfix-storage-failure-test";

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Upload storage-failure test company", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

describe("uploadAndChunkDocument - the storage write itself fails", () => {
  it("propagates the storage error and creates no Document row at all (never a half-uploaded document)", async () => {
    storeMock.mockRejectedValueOnce(new Error("simulated blob store failure"));

    await expect(
      uploadAndChunkDocument({
        companyId: COMPANY_ID,
        filename: "storage-failure-check.txt",
        data: Buffer.from("bytes that never get persisted", "utf-8"),
        declaredType: "OTHER",
      })
    ).rejects.toThrow(/simulated blob store failure/);

    const rows = await prisma.document.count({ where: { name: "storage-failure-check.txt" } });
    expect(rows).toBe(0);
  });
});
