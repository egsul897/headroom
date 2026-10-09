import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    documentByteObject: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import {
  PostgresDocumentStorageProvider,
  PostgresByteaStorageError,
  POSTGRES_BYTEA_PROVIDER_ID,
  buildPostgresByteaStorageRef,
  hashBufferSha256,
  parsePostgresByteaStorageRef,
} from "../../lib/document-storage/postgres-bytea-provider";

describe("PostgresDocumentStorageProvider", () => {
  const provider = new PostgresDocumentStorageProvider();

  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.create.mockReset();
    mocks.deleteMany.mockReset();
  });

  it("builds and parses content-addressed storageRef", () => {
    const hash = "ab".repeat(32);
    const ref = buildPostgresByteaStorageRef(hash);
    expect(ref).toBe(`pgbytea:v1:${hash}`);
    expect(parsePostgresByteaStorageRef(ref)).toBe(hash);
  });

  it("stores new bytes atomically and returns postgres-bytea provider id", async () => {
    const data = Buffer.from("gibraltar-bytes");
    const hash = hashBufferSha256(data);
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({
      id: "obj1",
      contentHash: hash,
      bytes: data,
      byteSize: data.length,
    });

    const result = await provider.store({
      companyId: "kf-corpus",
      filename: "ex.bin",
      contentType: "application/octet-stream",
      data,
    });

    expect(result.provider).toBe(POSTGRES_BYTEA_PROVIDER_ID);
    expect(result.storageRef).toBe(`pgbytea:v1:${hash}`);
    expect(mocks.create).toHaveBeenCalledOnce();
    const created = mocks.create.mock.calls[0]![0].data;
    expect(created.contentHash).toBe(hash);
    expect(Buffer.from(created.bytes).equals(data)).toBe(true);
  });

  it("idempotently reuses existing contentHash without duplicate insert", async () => {
    const data = Buffer.from("same");
    const hash = createHash("sha256").update(data).digest("hex");
    mocks.findUnique.mockResolvedValue({
      id: "existing",
      contentHash: hash,
      bytes: data,
      byteSize: data.length,
    });

    const result = await provider.store({
      companyId: "kf-corpus",
      filename: "ex.bin",
      contentType: "application/octet-stream",
      data,
    });

    expect(result.storageRef).toBe(`pgbytea:v1:${hash}`);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("fail-closed retrieve on missing object", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(
      provider.retrieve(`pgbytea:v1:${"cd".repeat(32)}`),
    ).rejects.toBeInstanceOf(PostgresByteaStorageError);
  });

  it("fail-closed retrieve on hash corruption", async () => {
    const hash = "ab".repeat(32);
    mocks.findUnique.mockResolvedValue({
      id: "x",
      contentHash: hash,
      bytes: Buffer.from("tampered"),
      byteSize: 8,
    });
    await expect(provider.retrieve(`pgbytea:v1:${hash}`)).rejects.toMatchObject({
      code: "HASH_MISMATCH",
    });
  });

  it("fail-closed retrieve on size metadata corruption", async () => {
    const data = Buffer.from("sized");
    const hash = hashBufferSha256(data);
    mocks.findUnique.mockResolvedValue({
      id: "x",
      contentHash: hash,
      bytes: data,
      byteSize: data.length + 99,
    });
    await expect(provider.retrieve(`pgbytea:v1:${hash}`)).rejects.toMatchObject({
      code: "SIZE_MISMATCH",
    });
  });

  it("fail-closed store when existing row bytes are corrupt", async () => {
    const data = Buffer.from("honest");
    const hash = hashBufferSha256(data);
    mocks.findUnique.mockResolvedValue({
      id: "corrupt",
      contentHash: hash,
      bytes: Buffer.from("not-the-hash"),
      byteSize: 12,
    });
    await expect(
      provider.store({
        companyId: "kf-corpus",
        filename: "ex.bin",
        contentType: "application/octet-stream",
        data,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_CONFLICT" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("delete is best-effort and never throws", async () => {
    mocks.deleteMany.mockRejectedValue(new Error("db"));
    await expect(provider.delete(`pgbytea:v1:${"ab".repeat(32)}`)).resolves.toBeUndefined();
  });

  it("treats concurrent P2002 as idempotent reuse", async () => {
    const data = Buffer.from("race");
    const hash = hashBufferSha256(data);
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "winner",
        contentHash: hash,
        bytes: data,
        byteSize: data.length,
      });
    mocks.create.mockRejectedValue({ code: "P2002" });

    const result = await provider.store({
      companyId: "kf-corpus",
      filename: "ex.bin",
      contentType: "application/octet-stream",
      data,
    });
    expect(result.storageRef).toBe(`pgbytea:v1:${hash}`);
  });
});
