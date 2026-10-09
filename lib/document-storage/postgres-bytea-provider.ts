/**
 * PostgreSQL BYTEA DocumentStorageProvider — Cursor-first durable byte store.
 *
 * Content-addressed by SHA-256. storageRef format: `pgbytea:v1:<sha256-hex>`.
 * Identical bytes always resolve to the same storageRef (idempotent).
 * Conflicting write of different bytes under an existing hash is impossible
 * by construction (hash is the identity).
 *
 * Atomic: metadata + bytes are a single row insert (no orphan object store).
 * Fail-closed retrieve: missing/corrupt/hash-mismatch throws.
 *
 * Requires DATABASE_URL and migration `20261009013000_document_byte_objects`.
 * Does not replace VercelBlobStorageProvider — selected by factory / KF durable resolver.
 */

import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import type { DocumentStorageProvider } from "./types";

export const POSTGRES_BYTEA_PROVIDER_ID = "postgres-bytea" as const;
export const POSTGRES_BYTEA_REF_PREFIX = "pgbytea:v1:" as const;

export class PostgresByteaStorageError extends Error {
  readonly code:
    | "INVALID_STORAGE_REF"
    | "OBJECT_NOT_FOUND"
    | "HASH_MISMATCH"
    | "SIZE_MISMATCH"
    | "CONTENT_CONFLICT";

  constructor(code: PostgresByteaStorageError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "PostgresByteaStorageError";
    this.code = code;
  }
}

export function hashBufferSha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function buildPostgresByteaStorageRef(contentHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new PostgresByteaStorageError(
      "INVALID_STORAGE_REF",
      `contentHash must be 64 lowercase hex chars, got length=${contentHash.length}`,
    );
  }
  return `${POSTGRES_BYTEA_REF_PREFIX}${contentHash}`;
}

export function parsePostgresByteaStorageRef(storageRef: string): string {
  if (!storageRef.startsWith(POSTGRES_BYTEA_REF_PREFIX)) {
    throw new PostgresByteaStorageError(
      "INVALID_STORAGE_REF",
      `expected prefix ${POSTGRES_BYTEA_REF_PREFIX}`,
    );
  }
  const hash = storageRef.slice(POSTGRES_BYTEA_REF_PREFIX.length);
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new PostgresByteaStorageError(
      "INVALID_STORAGE_REF",
      `malformed content hash in storageRef`,
    );
  }
  return hash;
}

export function isPostgresByteaStorageRef(storageRef: string): boolean {
  return storageRef.startsWith(POSTGRES_BYTEA_REF_PREFIX);
}

export class PostgresDocumentStorageProvider implements DocumentStorageProvider {
  async store(params: {
    companyId: string;
    filename: string;
    contentType: string;
    data: Buffer;
  }): Promise<{ storageRef: string; provider: string }> {
    const contentHash = hashBufferSha256(params.data);
    const storageRef = buildPostgresByteaStorageRef(contentHash);

    const existing = await prisma.documentByteObject.findUnique({
      where: { contentHash },
    });
    if (existing) {
      // Integrity: stored bytes must still match the content-addressed hash.
      const existingBuf = Buffer.from(existing.bytes);
      const existingHash = hashBufferSha256(existingBuf);
      if (existingHash !== contentHash || existing.byteSize !== params.data.length) {
        throw new PostgresByteaStorageError(
          "CONTENT_CONFLICT",
          `document_byte_objects row for ${contentHash} is corrupt or conflicting`,
        );
      }
      return { storageRef, provider: POSTGRES_BYTEA_PROVIDER_ID };
    }

    // Atomic insert of metadata + bytes. Unique on contentHash prevents duplicates.
    try {
      await prisma.documentByteObject.create({
        data: {
          contentHash,
          byteSize: params.data.length,
          contentType: params.contentType || "application/octet-stream",
          namespace: params.companyId,
          filename: params.filename,
          bytes: params.data,
        },
      });
    } catch (err) {
      // Concurrent insert of identical hash → treat as idempotent reuse.
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code === "P2002") {
        const again = await prisma.documentByteObject.findUnique({
          where: { contentHash },
        });
        if (again && hashBufferSha256(Buffer.from(again.bytes)) === contentHash) {
          return { storageRef, provider: POSTGRES_BYTEA_PROVIDER_ID };
        }
      }
      throw err;
    }

    return { storageRef, provider: POSTGRES_BYTEA_PROVIDER_ID };
  }

  async retrieve(storageRef: string): Promise<Buffer> {
    const contentHash = parsePostgresByteaStorageRef(storageRef);
    const row = await prisma.documentByteObject.findUnique({
      where: { contentHash },
    });
    if (!row) {
      throw new PostgresByteaStorageError(
        "OBJECT_NOT_FOUND",
        `no document_byte_objects row for ${contentHash}`,
      );
    }
    const buf = Buffer.from(row.bytes);
    const actualHash = hashBufferSha256(buf);
    if (actualHash !== contentHash) {
      throw new PostgresByteaStorageError(
        "HASH_MISMATCH",
        `stored bytes hash ${actualHash} ≠ contentHash ${contentHash}`,
      );
    }
    if (buf.length !== row.byteSize) {
      throw new PostgresByteaStorageError(
        "SIZE_MISMATCH",
        `stored length ${buf.length} ≠ byteSize ${row.byteSize}`,
      );
    }
    return buf;
  }

  async delete(storageRef: string): Promise<void> {
    try {
      const contentHash = parsePostgresByteaStorageRef(storageRef);
      await prisma.documentByteObject.deleteMany({ where: { contentHash } });
    } catch {
      // Best-effort orphan cleanup — must never throw (DocumentStorageProvider contract).
    }
  }
}
