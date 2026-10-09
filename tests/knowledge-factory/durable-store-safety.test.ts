import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  store: vi.fn(),
  retrieve: vi.fn(),
  del: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    knowledgeSource: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      create: mocks.create,
      update: mocks.update,
    },
  },
}));

vi.mock("../../lib/document-storage/vercel-blob-provider", () => ({
  VercelBlobStorageProvider: class {
    store = mocks.store;
    retrieve = mocks.retrieve;
    delete = mocks.del;
  },
}));

import {
  DurableContentConflictError,
  DurableRetrieveError,
  persistDurableKnowledgeSource,
  retrieveDurableKnowledgeSource,
} from "../../lib/knowledge-factory/preservation/durable-store";

/** Force Blob path so VercelBlobStorageProvider mocks exercise overwrite/orphan safety. */
const envBoth = {
  DATABASE_URL: "postgresql://example.invalid/headroom",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_test_token",
  KF_BYTE_STORE: "vercel-blob",
};

function sha(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sampleSource(overrides: Partial<KnowledgeSourceRecord> = {}): KnowledgeSourceRecord {
  return {
    sourceId: "edgar:0001140361-26-003087:ef20064499_ex10-1.htm",
    issuerCik: "0000912562",
    issuerTicker: "ROCK",
    issuerName: "GIBRALTAR INDUSTRIES, INC.",
    accessionNumber: "0001140361-26-003087",
    exhibitFilename: "ef20064499_ex10-1.htm",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm",
    filingDate: "2026-02-02",
    formType: "8-K",
    documentTitle: "CREDIT AGREEMENT",
    documentClass: "CREDIT_AGREEMENT",
    originalBytesHash: "aa".repeat(32),
    acquisitionTimestamp: "2026-10-09T00:00:00.000Z",
    parserVersion: "test",
    extractionStatus: "ACQUIRED",
    representationLevel: "DISCOVERED_CANDIDATE",
    provenance: "sec-edgar",
    usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    ...overrides,
  };
}

describe("durable-store safety invariants", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.findFirst.mockReset();
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.store.mockReset();
    mocks.retrieve.mockReset();
    mocks.del.mockReset();
  });

  it("reuses existing sourceId with identical hash without re-uploading", async () => {
    const bytes = Buffer.from("same-bytes");
    const hash = sha(bytes);
    mocks.findUnique.mockResolvedValue({
      id: "row1",
      sourceId: sampleSource().sourceId,
      originalBytesHash: hash,
      byteSize: bytes.length,
      storageRef: "https://blob.example/private/a",
      representationLevel: "DISCOVERED_CANDIDATE",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });

    const result = await persistDurableKnowledgeSource({
      source: sampleSource({ originalBytesHash: hash }),
      bytes,
      env: envBoth,
    });

    expect(result.reusedExisting).toBe(true);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects same sourceId with different bytes (no silent overwrite)", async () => {
    const bytes = Buffer.from("different");
    const attemptedHash = sha(bytes);
    mocks.findUnique.mockResolvedValue({
      id: "row1",
      sourceId: sampleSource().sourceId,
      originalBytesHash: "bb".repeat(32),
      byteSize: 10,
      storageRef: "https://blob.example/private/a",
      representationLevel: "DISCOVERED_CANDIDATE",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });

    await expect(
      persistDurableKnowledgeSource({
        source: sampleSource({ originalBytesHash: attemptedHash }),
        bytes,
        env: envBoth,
      }),
    ).rejects.toBeInstanceOf(DurableContentConflictError);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("reuses canonical row when identical bytes arrive under a new sourceId", async () => {
    const bytes = Buffer.from("dup-bytes");
    const hash = sha(bytes);
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({
      id: "canonical",
      sourceId: "edgar:canonical:first.htm",
      originalBytesHash: hash,
      byteSize: bytes.length,
      storageRef: "https://blob.example/private/c",
      representationLevel: "DISCOVERED_CANDIDATE",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      metadata: {},
    });
    mocks.update.mockResolvedValue({});

    const result = await persistDurableKnowledgeSource({
      source: sampleSource({
        sourceId: "edgar:alias:second.htm",
        originalBytesHash: hash,
      }),
      bytes,
      env: envBoth,
    });

    expect(result.reusedExisting).toBe(true);
    expect(result.sourceId).toBe("edgar:canonical:first.htm");
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalled();
  });

  it("deletes orphan blob when DB create fails after upload", async () => {
    const bytes = Buffer.from("new-doc");
    const hash = sha(bytes);
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
    mocks.store.mockResolvedValue({
      storageRef: "https://blob.example/private/orphan",
      provider: "vercel-blob",
    });
    mocks.create.mockRejectedValue(new Error("db down"));
    mocks.del.mockResolvedValue(undefined);

    await expect(
      persistDurableKnowledgeSource({
        source: sampleSource({ originalBytesHash: hash }),
        bytes,
        env: envBoth,
      }),
    ).rejects.toThrow(/db down/);

    expect(mocks.del).toHaveBeenCalledWith("https://blob.example/private/orphan");
  });

  it("retrieve fails closed on hash mismatch", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "row1",
      sourceId: sampleSource().sourceId,
      originalBytesHash: "aa".repeat(32),
      byteSize: 4,
      storageRef: "https://blob.example/private/a",
      representationLevel: "DISCOVERED_CANDIDATE",
      provenance: "sec-edgar",
    });
    mocks.retrieve.mockResolvedValue(Buffer.from("xxxx"));

    await expect(
      retrieveDurableKnowledgeSource({
        sourceId: sampleSource().sourceId,
        env: envBoth,
      }),
    ).rejects.toBeInstanceOf(DurableRetrieveError);
  });
});
