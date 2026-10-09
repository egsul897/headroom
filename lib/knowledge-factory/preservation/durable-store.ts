/**
 * Durable Knowledge Factory source-byte + registry persistence.
 *
 * Reuses existing infrastructure only:
 * - Object bytes: `lib/document-storage` Vercel Blob provider (BLOB_READ_WRITE_TOKEN)
 * - Registry: Prisma `KnowledgeSource` (DATABASE_URL)
 *
 * NEVER treats LocalFilesystemStorageProvider / .local-knowledge-corpus as durable.
 * Both Postgres and object storage are required for a durability claim.
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

export function requireDurableCredentials(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): DurableCredentialGate {
  const probe = probeDurability(env as NodeJS.ProcessEnv);
  const missing = [...probe.missingPrerequisites];
  // Explicitly reject local-fs fallback even if somehow probe were weakened.
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
  // Prefer canonical token name; @vercel/blob reads BLOB_READ_WRITE_TOKEN from process.env.
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    const alt = env.BLOB_READ_WRITE_TOKEN?.trim() || env.VERCEL_BLOB_READ_WRITE_TOKEN?.trim();
    if (alt) process.env.BLOB_READ_WRITE_TOKEN = alt;
  }
  return new VercelBlobStorageProvider();
}

export function hashBytesSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Persist original source bytes to durable object storage and upsert the
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

  const stored = await provider.store({
    companyId: KF_CORPUS_STORAGE_NAMESPACE,
    filename: `${sanitizeFilename(params.source.sourceId)}.bin`,
    contentType: params.contentType ?? "application/octet-stream",
    data: params.bytes,
  });

  const filingDate = new Date(params.source.filingDate);
  if (Number.isNaN(filingDate.getTime())) {
    throw new Error(`invalid filingDate: ${params.source.filingDate}`);
  }

  const row = await prisma.knowledgeSource.upsert({
    where: { sourceId: params.source.sourceId },
    create: {
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
    update: {
      originalBytesHash: actualHash,
      byteSize: params.bytes.length,
      storageRef: stored.storageRef,
      representationLevel: params.source.representationLevel,
      extractionStatus: params.source.extractionStatus,
      normalizedTextHash: params.source.normalizedTextHash ?? null,
      instrumentIdentity: params.source.instrumentIdentity ?? null,
      metadata: {
        storageProvider: stored.provider,
        durablePersistence: true,
        corpusNamespace: KF_CORPUS_STORAGE_NAMESPACE,
      },
    },
  });

  return {
    sourceId: row.sourceId,
    originalBytesHash: row.originalBytesHash,
    byteLength: params.bytes.length,
    storageRef: stored.storageRef,
    storageProvider: "vercel-blob",
    knowledgeSourceRowId: row.id,
    representationLevel: params.source.representationLevel,
    usageRightsReviewStatus: params.source.usageRightsReviewStatus,
  };
}

/**
 * Independent retrieval using only durable identifiers (sourceId or storageRef)
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
    throw new Error(`KnowledgeSource not found for sourceId=${params.sourceId}`);
  }
  if (!row.storageRef) {
    throw new Error(`KnowledgeSource ${params.sourceId} has no storageRef (bytes not durably persisted)`);
  }

  const bytes = await provider.retrieve(row.storageRef);
  const retrievedBytesHash = hashBytesSha256(bytes);

  return {
    sourceId: row.sourceId,
    knowledgeSourceRowId: row.id,
    storageRef: row.storageRef,
    originalBytesHash: row.originalBytesHash,
    retrievedBytesHash,
    byteLength: bytes.length,
    byteEqual: bytes.length === (row.byteSize ?? bytes.length) && retrievedBytesHash === row.originalBytesHash,
    hashEqual: retrievedBytesHash === row.originalBytesHash,
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
  const row = await prisma.knowledgeSource.findUniqueOrThrow({ where: { sourceId: params.sourceId } });
  if (!row.storageRef) throw new Error(`no storageRef for ${params.sourceId}`);
  const bytes = await provider.retrieve(row.storageRef);
  const hash = hashBytesSha256(bytes);
  if (hash !== row.originalBytesHash) {
    throw new Error(`retrieved bytes hash ${hash} ≠ registry ${row.originalBytesHash}`);
  }
  return { bytes, row };
}

function sanitizeFilename(sourceId: string): string {
  return sourceId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}
