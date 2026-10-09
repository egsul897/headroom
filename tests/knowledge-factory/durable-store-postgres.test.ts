import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../../lib/document-storage/postgres-bytea-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/document-storage/postgres-bytea-provider")>();
  return {
    ...actual,
    PostgresDocumentStorageProvider: class {
      store = mocks.store;
      retrieve = mocks.retrieve;
      delete = mocks.del;
    },
  };
});

import {
  DurableContentConflictError,
  persistDurableKnowledgeSource,
  retrieveDurableKnowledgeSource,
} from "../../lib/knowledge-factory/preservation/durable-store";

const envPg = {
  DATABASE_URL: "postgresql://example.invalid/headroom",
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

describe("durable-store Postgres BYTEA path", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.findFirst.mockReset();
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.store.mockReset();
    mocks.retrieve.mockReset();
    mocks.del.mockReset();
  });

  it("persists via postgres-bytea without requiring Blob token", async () => {
    const bytes = Buffer.from("new-pg-doc");
    const hash = sha(bytes);
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
    mocks.store.mockResolvedValue({
      storageRef: `pgbytea:v1:${hash}`,
      provider: "postgres-bytea",
    });
    mocks.create.mockResolvedValue({
      id: "row-pg",
      sourceId: sampleSource().sourceId,
      originalBytesHash: hash,
      byteSize: bytes.length,
      storageRef: `pgbytea:v1:${hash}`,
      representationLevel: "DISCOVERED_CANDIDATE",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      metadata: { storageProvider: "postgres-bytea" },
    });

    const result = await persistDurableKnowledgeSource({
      source: sampleSource({ originalBytesHash: hash }),
      bytes,
      env: envPg,
    });

    expect(result.storageProvider).toBe("postgres-bytea");
    expect(result.storageRef.startsWith("pgbytea:v1:")).toBe(true);
    expect(mocks.store).toHaveBeenCalledOnce();
  });

  it("rejects content conflict on Postgres path", async () => {
    const bytes = Buffer.from("x");
    mocks.findUnique.mockResolvedValue({
      id: "row1",
      sourceId: sampleSource().sourceId,
      originalBytesHash: "bb".repeat(32),
      byteSize: 1,
      storageRef: `pgbytea:v1:${"bb".repeat(32)}`,
      representationLevel: "DISCOVERED_CANDIDATE",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });

    await expect(
      persistDurableKnowledgeSource({
        source: sampleSource({ originalBytesHash: sha(bytes) }),
        bytes,
        env: envPg,
      }),
    ).rejects.toBeInstanceOf(DurableContentConflictError);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("deletes orphan postgres object when KnowledgeSource create fails", async () => {
    const bytes = Buffer.from("orphan-pg");
    const hash = sha(bytes);
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
    mocks.store.mockResolvedValue({
      storageRef: `pgbytea:v1:${hash}`,
      provider: "postgres-bytea",
    });
    mocks.create.mockRejectedValue(new Error("db down"));
    mocks.del.mockResolvedValue(undefined);

    await expect(
      persistDurableKnowledgeSource({
        source: sampleSource({ originalBytesHash: hash }),
        bytes,
        env: envPg,
      }),
    ).rejects.toThrow(/db down/);
    expect(mocks.del).toHaveBeenCalledWith(`pgbytea:v1:${hash}`);
  });

  it("retrieves and verifies hash on postgres storageRef", async () => {
    const bytes = Buffer.from("ok");
    const hash = sha(bytes);
    mocks.findUnique.mockResolvedValue({
      id: "row1",
      sourceId: sampleSource().sourceId,
      originalBytesHash: hash,
      byteSize: bytes.length,
      storageRef: `pgbytea:v1:${hash}`,
      representationLevel: "DISCOVERED_CANDIDATE",
      provenance: "sec-edgar",
      metadata: { storageProvider: "postgres-bytea" },
    });
    mocks.retrieve.mockResolvedValue(bytes);

    const result = await retrieveDurableKnowledgeSource({
      sourceId: sampleSource().sourceId,
      env: envPg,
    });
    expect(result.hashEqual).toBe(true);
    expect(result.byteEqual).toBe(true);
    expect(result.storageProvider).toBe("postgres-bytea");
  });

  it("idempotently reuses existing postgres-backed sourceId without re-store", async () => {
    const bytes = Buffer.from("again");
    const hash = sha(bytes);
    mocks.findUnique.mockResolvedValue({
      id: "row1",
      sourceId: sampleSource().sourceId,
      originalBytesHash: hash,
      byteSize: bytes.length,
      storageRef: `pgbytea:v1:${hash}`,
      representationLevel: "DISCOVERED_CANDIDATE",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      metadata: { storageProvider: "postgres-bytea" },
    });

    const result = await persistDurableKnowledgeSource({
      source: sampleSource({ originalBytesHash: hash }),
      bytes,
      env: envPg,
    });
    expect(result.reusedExisting).toBe(true);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
