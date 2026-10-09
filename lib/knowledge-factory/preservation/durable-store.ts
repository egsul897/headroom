/**
 * Durable Knowledge Factory source-byte + registry persistence.
 *
 * Reuses existing infrastructure only:
 * - Object bytes: `lib/document-storage` Vercel Blob provider (BLOB_READ_WRITE_TOKEN)
 * - Registry: Prisma `KnowledgeSource` (DATABASE_URL)
 *
 * NEVER treats LocalFilesystemStorageProvider / .local-knowledge-corpus as durable.
 * Both Postgres and object storage are required for a durability claim.
 *
 * Safety invariants:
 * - Identical bytes re-ingest → reuse existing canonical row (no conflicting identity).
 * - Same sourceId with different bytes → reject (no silent overwrite).
 * - Blob upload without successful DB bind → best-effort orphan delete; never claim durable.
 */

import { createHash } from "node:crypto";
import { VercelBlobStorageProvider } from "../../document-storage/vercel-blob-provider";
import { prisma } from "../../prisma";
import type { KnowledgeSourceRecord } from "../types";
import { probeDurability, type DurabilityProbeResult } from "./durability";

/** Reserved storage namespace for fleet corpus bytes (not a second registry). */
export const KF_CORPUS_STORAGE_NAMESPACE = "kf-corpus";

export const DURABILITY_BLOCKED_CREDENTIALS = "DURABILITY_BLOCKED_CREDENTIALS" as const;

export interface DurableCredentialGate {
  ok: boolean;
  status: typeof DURABILITY_BLOCKED_CREDENTIALS | "DURABLE_CREDENTIALS_PRESENT";
  probe: DurabilityProbeResult;
  missing: string[];
}

export interface DurableSourcePersistResult {
  sourceId: string;
  originalBytesHash: string;
  byteLength: number;
  storageRef: string;
  storageProvider: "vercel-blob";
  knowledgeSourceRowId: string;
  representationLevel: KnowledgeSourceRecord["representationLevel"];
  usageRightsReviewStatus: KnowledgeSourceRecord["usageRightsReviewStatus"];
  /** True when an existing durable row was reused (same bytes / same sourceId). */
  reusedExisting: boolean;
}

export interface DurableSourceRetrieveResult {
  sourceId: string;
  knowledgeSourceRowId: string;
  storageRef: string;
  originalBytesHash: string;
  retrievedBytesHash: string;
  byteLength: number;
  byteEqual: boolean;
  hashEqual: boolean;
  representationLevel: string;
  provenance: string;
}

export class DurableCredentialsError extends Error {
  readonly status = DURABILITY_BLOCKED_CREDENTIALS;
  readonly missing: string[];
  readonly probe: DurabilityProbeResult;

  constructor(gate: DurableCredentialGate) {
    super(
      `${DURABILITY_BLOCKED_CREDENTIALS}: missing ${gate.missing.join("; ")}. ` +
        "Refusing local-disk / mocked / metadata-only substitutes.",
    );
    this.name = "DurableCredentialsError";
    this.missing = gate.missing;
    this.probe = gate.probe;
  }
}

/** Same sourceId already bound to different originalBytesHash. */
export class DurableContentConflictError extends Error {
  readonly sourceId: string;
  readonly existingHash: string;
  readonly attemptedHash: string;

  constructor(sourceId: string, existingHash: string, attemptedHash: string) {
    super(
      `DURABLE_CONTENT_CONFLICT: sourceId=${sourceId} already bound to hash ${existingHash}; ` +
        `refusing silent overwrite with ${attemptedHash}`,
    );
    this.name = "DurableContentConflictError";
    this.sourceId = sourceId;
    this.existingHash = existingHash;
    this.attemptedHash = attemptedHash;
  }
}

export class DurableRetrieveError extends Error {
  readonly code:
    | "SOURCE_NOT_FOUND"
    | "MISSING_STORAGE_REF"
    | "OBJECT_MISSING_OR_UNAUTHORIZED"
    | "HASH_MISMATCH"
    | "METADATA_INCONSISTENT";

  constructor(
    code: DurableRetrieveError["code"],
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "DurableRetrieveError";
    this.code = code;
  }
}

export function requireDurableCredentials(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): DurableCredentialGate {
  const probe = probeDurability(env as NodeJS.ProcessEnv);
  const missing = [...probe.missingPrerequisites];
  if (!probe.objectStorageTokenPresent) {
    if (!missing.some((m) => m.includes("BLOB_READ_WRITE_TOKEN"))) {
      missing.push("BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN");
    }
  }
  if (!probe.databaseUrlPresent) {
    if (!missing.some((m) => m.includes("DATABASE_URL"))) {
      missing.push("DATABASE_URL pointing at shared Postgres with KnowledgeSource migrations");
    }
  }
  const ok = probe.durable && missing.length === 0;
  return {
    ok,
    status: ok ? "DURABLE_CREDENTIALS_PRESENT" : DURABILITY_BLOCKED_CREDENTIALS,
    probe,
    missing,
  };
}

function assertDurableCredentials(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  const gate = requireDurableCredentials(env);
  if (!gate.ok) throw new DurableCredentialsError(gate);
}

function durableBlobProvider(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): VercelBlobStorageProvider {
  assertDurableCredentials(env);
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    const alt = env.BLOB_READ_WRITE_TOKEN?.trim() || env.VERCEL_BLOB_READ_WRITE_TOKEN?.trim();
    if (alt) process.env.BLOB_READ_WRITE_TOKEN = alt;
  }
  return new VercelBlobStorageProvider();
}

export function hashBytesSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toPersistResult(
  row: {
    id: string;
    sourceId: string;
    originalBytesHash: string;
    byteSize: number | null;
    storageRef: string | null;
    representationLevel: KnowledgeSourceRecord["representationLevel"];
    usageRightsReviewStatus: KnowledgeSourceRecord["usageRightsReviewStatus"];
  },
  byteLength: number,
  reusedExisting: boolean,
): DurableSourcePersistResult {
  if (!row.storageRef) {
    throw new Error(`KnowledgeSource ${row.sourceId} missing storageRef after persist`);
  }
  return {
    sourceId: row.sourceId,
    originalBytesHash: row.originalBytesHash,
    byteLength: row.byteSize ?? byteLength,
    storageRef: row.storageRef,
    storageProvider: "vercel-blob",
    knowledgeSourceRowId: row.id,
    representationLevel: row.representationLevel,
    usageRightsReviewStatus: row.usageRightsReviewStatus,
    reusedExisting,
  };
}

/**
 * Persist original source bytes to durable object storage and bind the
 * canonical KnowledgeSource registry row. Does not invent a parallel registry.
 */
export async function persistDurableKnowledgeSource(params: {
  source: KnowledgeSourceRecord;
  bytes: Buffer;
  contentType?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<DurableSourcePersistResult> {
  const env = params.env ?? process.env;
  assertDurableCredentials(env);
  const provider = durableBlobProvider(env);

  const expectedHash = params.source.originalBytesHash || hashBytesSha256(params.bytes);
  const actualHash = hashBytesSha256(params.bytes);
  if (actualHash !== expectedHash) {
    throw new Error(`content hash mismatch: expected ${expectedHash}, got ${actualHash}`);
  }

  // 1) Existing sourceId — idempotent reuse or hard conflict (no silent overwrite).
  const bySourceId = await prisma.knowledgeSource.findUnique({
    where: { sourceId: params.source.sourceId },
  });
  if (bySourceId) {
    if (bySourceId.originalBytesHash !== actualHash) {
      throw new DurableContentConflictError(
        params.source.sourceId,
        bySourceId.originalBytesHash,
        actualHash,
      );
    }
    if (!bySourceId.storageRef) {
      throw new DurableRetrieveError(
        "MISSING_STORAGE_REF",
        `sourceId=${params.source.sourceId} exists without storageRef; refusing false durability`,
      );
    }
    return toPersistResult(bySourceId, params.bytes.length, true);
  }

  // 2) Identical bytes under another sourceId — reuse canonical row (no conflicting identity).
  const byHash = await prisma.knowledgeSource.findFirst({
    where: { originalBytesHash: actualHash },
  });
  if (byHash) {
    if (!byHash.storageRef) {
      throw new DurableRetrieveError(
        "MISSING_STORAGE_REF",
        `hash=${actualHash} exists without storageRef; refusing false durability`,
      );
    }
    // Record alias in metadata of the canonical row; do not create a second durable identity.
    const prevMeta =
      byHash.metadata && typeof byHash.metadata === "object" && !Array.isArray(byHash.metadata)
        ? (byHash.metadata as Record<string, unknown>)
        : {};
    const aliases = Array.isArray(prevMeta.aliasSourceIds)
      ? (prevMeta.aliasSourceIds as string[])
      : [];
    if (!aliases.includes(params.source.sourceId) && byHash.sourceId !== params.source.sourceId) {
      aliases.push(params.source.sourceId);
      await prisma.knowledgeSource.update({
        where: { id: byHash.id },
        data: {
          metadata: {
            ...prevMeta,
            aliasSourceIds: aliases,
            durablePersistence: true,
            storageProvider: "vercel-blob",
            corpusNamespace: KF_CORPUS_STORAGE_NAMESPACE,
          },
        },
      });
    }
    return toPersistResult(byHash, params.bytes.length, true);
  }

  const filingDate = new Date(params.source.filingDate);
  if (Number.isNaN(filingDate.getTime())) {
    throw new Error(`invalid filingDate: ${params.source.filingDate}`);
  }

  // 3) Upload bytes, then bind DB. On DB failure, delete orphan blob — never claim durable.
  let stored: { storageRef: string; provider: string } | null = null;
  try {
    stored = await provider.store({
      companyId: KF_CORPUS_STORAGE_NAMESPACE,
      filename: `${sanitizeFilename(params.source.sourceId)}.bin`,
      contentType: params.contentType ?? "application/octet-stream",
      data: params.bytes,
    });

    const row = await prisma.knowledgeSource.create({
      data: {
        sourceId: params.source.sourceId,
        companyId: params.source.companyId ?? null,
        documentId: params.source.documentId ?? null,
        sourceArtifactId: params.source.sourceArtifactId ?? null,
        issuerCik: params.source.issuerCik,
        issuerTicker: params.source.issuerTicker ?? null,
        issuerName: params.source.issuerName ?? null,
        accessionNumber: params.source.accessionNumber,
        exhibitFilename: params.source.exhibitFilename,
        sourceUrl: params.source.sourceUrl,
        filingDate,
        formType: params.source.formType,
        documentTitle: params.source.documentTitle,
        documentClass: params.source.documentClass,
        instrumentIdentity: params.source.instrumentIdentity ?? null,
        originalBytesHash: actualHash,
        normalizedTextHash: params.source.normalizedTextHash ?? null,
        acquisitionTimestamp: new Date(params.source.acquisitionTimestamp),
        parserVersion: params.source.parserVersion,
        extractionStatus: params.source.extractionStatus,
        representationLevel: params.source.representationLevel,
        provenance: params.source.provenance,
        usageRightsReviewStatus: params.source.usageRightsReviewStatus,
        discoveryScore: params.source.discoveryScore ?? null,
        byteSize: params.bytes.length,
        storageRef: stored.storageRef,
        metadata: {
          storageProvider: stored.provider,
          durablePersistence: true,
          corpusNamespace: KF_CORPUS_STORAGE_NAMESPACE,
        },
      },
    });

    return toPersistResult(row, params.bytes.length, false);
  } catch (err) {
    if (stored?.storageRef) {
      try {
        await provider.delete(stored.storageRef);
      } catch {
        // Best-effort orphan cleanup; must not mask the original error.
      }
    }
    throw err;
  }
}

/**
 * Independent retrieval using only durable identifiers (sourceId)
 * plus configured credentials — no local corpus path.
 */
export async function retrieveDurableKnowledgeSource(params: {
  sourceId: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<DurableSourceRetrieveResult> {
  const env = params.env ?? process.env;
  assertDurableCredentials(env);
  const provider = durableBlobProvider(env);

  const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: params.sourceId } });
  if (!row) {
    throw new DurableRetrieveError("SOURCE_NOT_FOUND", `sourceId=${params.sourceId}`);
  }
  if (!row.storageRef) {
    throw new DurableRetrieveError(
      "MISSING_STORAGE_REF",
      `sourceId=${params.sourceId} has no storageRef (bytes not durably persisted)`,
    );
  }

  let bytes: Buffer;
  try {
    bytes = await provider.retrieve(row.storageRef);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DurableRetrieveError(
      "OBJECT_MISSING_OR_UNAUTHORIZED",
      `sourceId=${params.sourceId} storageRef retrieve failed: ${msg}`,
    );
  }

  const retrievedBytesHash = hashBytesSha256(bytes);
  const hashEqual = retrievedBytesHash === row.originalBytesHash;
  const sizeEqual = row.byteSize == null || bytes.length === row.byteSize;
  if (!hashEqual || !sizeEqual) {
    throw new DurableRetrieveError(
      hashEqual ? "METADATA_INCONSISTENT" : "HASH_MISMATCH",
      `sourceId=${params.sourceId} registryHash=${row.originalBytesHash} ` +
        `retrievedHash=${retrievedBytesHash} registryBytes=${row.byteSize ?? "null"} ` +
        `retrievedBytes=${bytes.length}`,
    );
  }

  return {
    sourceId: row.sourceId,
    knowledgeSourceRowId: row.id,
    storageRef: row.storageRef,
    originalBytesHash: row.originalBytesHash,
    retrievedBytesHash,
    byteLength: bytes.length,
    byteEqual: true,
    hashEqual: true,
    representationLevel: row.representationLevel,
    provenance: row.provenance,
  };
}

export async function loadDurableSourceBytes(params: {
  sourceId: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<{ bytes: Buffer; row: Awaited<ReturnType<typeof prisma.knowledgeSource.findUniqueOrThrow>> }> {
  const env = params.env ?? process.env;
  assertDurableCredentials(env);
  const provider = durableBlobProvider(env);
  let row;
  try {
    row = await prisma.knowledgeSource.findUniqueOrThrow({ where: { sourceId: params.sourceId } });
  } catch {
    throw new DurableRetrieveError("SOURCE_NOT_FOUND", `sourceId=${params.sourceId}`);
  }
  if (!row.storageRef) {
    throw new DurableRetrieveError("MISSING_STORAGE_REF", `sourceId=${params.sourceId}`);
  }
  let bytes: Buffer;
  try {
    bytes = await provider.retrieve(row.storageRef);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DurableRetrieveError("OBJECT_MISSING_OR_UNAUTHORIZED", msg);
  }
  const hash = hashBytesSha256(bytes);
  if (hash !== row.originalBytesHash) {
    throw new DurableRetrieveError(
      "HASH_MISMATCH",
      `retrieved bytes hash ${hash} ≠ registry ${row.originalBytesHash}`,
    );
  }
  return { bytes, row };
}

function sanitizeFilename(sourceId: string): string {
  return sourceId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}
