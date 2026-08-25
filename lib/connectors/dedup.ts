/**
 * Content-hash dedup (docs/autonomous-retrieval-phase-a-foundation.md, task
 * §12 - "do not create duplicates merely because source paths differ").
 *
 * `SourceArtifact`'s own `@@unique([companyId, contentHash])` constraint IS
 * the dedup mechanism - this file is a thin, well-tested wrapper around it,
 * used everywhere a SourceArtifact is created (lib/connectors/ingestion.ts's
 * FETCH stage, lib/connectors/upload-connector.ts's convergence path).
 *
 * Provenance choice for "arrived via 2 sources" (documented per the task's
 * own request for the smallest correct representation): rather than a
 * second SourceArtifact row (which the unique constraint forbids anyway) or
 * a whole new join table, a duplicate arrival APPENDS an entry to the
 * EXISTING artifact's `provenanceMetadata.duplicateSources` array - a
 * lightweight, fully-queryable audit trail of every source connection that
 * has ever produced this exact content, without a second row anywhere. See
 * `recordDuplicateArrival` below.
 */

import { createHash } from "node:crypto";
import type { Prisma, SourceArtifact } from "@prisma/client";
import { prisma } from "../prisma";

/** sha256 hex of the raw bytes - the dedup key. Used identically for a DOCUMENT's real file bytes and for a FINANCIAL_RECORD's canonicalized-JSON-row bytes (see canonicalizeFinancialRecord below), so both artifact types dedup through the exact same mechanism. */
export function computeContentHash(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Canonical, key-order-independent JSON encoding of a financial record row -
 * what CsvFinancialConnector hashes (two CSVs with the same rows in a
 * different column order, or the same row re-uploaded, must dedup to the
 * same contentHash). Deliberately simple (sorted-keys JSON.stringify), not a
 * general-purpose canonicalization library - this codebase's own established
 * "pragmatic, not infrastructure for its own sake" preference.
 */
export function canonicalizeFinancialRecord(row: Record<string, unknown>): Buffer {
  const sortedKeys = Object.keys(row).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of sortedKeys) sorted[k] = row[k];
  return Buffer.from(JSON.stringify(sorted), "utf-8");
}

/** The dedup check against the (companyId, contentHash) unique constraint. Null if this exact content has never been ingested for this company before. */
export async function findDuplicateArtifact(companyId: string, contentHash: string): Promise<SourceArtifact | null> {
  return prisma.sourceArtifact.findUnique({ where: { companyId_contentHash: { companyId, contentHash } } });
}

export interface DuplicateSourceEntry {
  sourceConnectionId: string;
  sourceIdentifier: string | null;
  sourceUri: string | null;
  retrievedAt: string;
}

/**
 * Appends a duplicate-arrival record to an existing SourceArtifact's
 * provenanceMetadata - see this file's own header comment for why this is
 * the chosen representation over a second row or a new table. Idempotent in
 * spirit (a caller may safely call this more than once for the same
 * duplicate observation; it always appends, so a caller should only invoke
 * this once per genuinely-new duplicate arrival - lib/connectors/ingestion.ts's
 * FETCH stage does exactly that).
 */
export async function recordDuplicateArrival(artifact: SourceArtifact, entry: DuplicateSourceEntry): Promise<SourceArtifact> {
  const existingMeta = (artifact.provenanceMetadata as Record<string, unknown> | null) ?? {};
  const existingDuplicates = Array.isArray(existingMeta.duplicateSources) ? (existingMeta.duplicateSources as DuplicateSourceEntry[]) : [];
  const updatedMeta = { ...existingMeta, duplicateSources: [...existingDuplicates, entry] };
  return prisma.sourceArtifact.update({
    where: { id: artifact.id },
    data: { provenanceMetadata: updatedMeta as unknown as Prisma.InputJsonValue },
  });
}

export interface UpsertArtifactParams {
  companyId: string;
  sourceConnectionId: string;
  artifactType: "DOCUMENT" | "FINANCIAL_RECORD";
  sourceIdentifier?: string | null;
  sourceUri?: string | null;
  retrievedAt: Date;
  effectiveDate?: Date | null;
  contentHash: string;
  mimeType?: string | null;
  storageRef?: string | null;
  rawPayload?: unknown;
  provenanceMetadata?: Record<string, unknown> | null;
}

export interface UpsertArtifactResult {
  artifact: SourceArtifact;
  wasDuplicate: boolean;
}

/**
 * The one function ingestion code should call to create a SourceArtifact -
 * checks the dedup constraint FIRST and, on a hit, records the duplicate
 * arrival (see recordDuplicateArrival) instead of creating a second row; on
 * a miss, creates the real new row. Never throws on a duplicate - "already
 * exists" is an expected, handled outcome, not an error.
 */
export async function upsertArtifactWithDedup(params: UpsertArtifactParams): Promise<UpsertArtifactResult> {
  const existing = await findDuplicateArtifact(params.companyId, params.contentHash);
  if (existing) {
    const updated = await recordDuplicateArrival(existing, {
      sourceConnectionId: params.sourceConnectionId,
      sourceIdentifier: params.sourceIdentifier ?? null,
      sourceUri: params.sourceUri ?? null,
      retrievedAt: params.retrievedAt.toISOString(),
    });
    return { artifact: updated, wasDuplicate: true };
  }

  const created = await prisma.sourceArtifact.create({
    data: {
      companyId: params.companyId,
      sourceConnectionId: params.sourceConnectionId,
      artifactType: params.artifactType,
      sourceIdentifier: params.sourceIdentifier ?? null,
      sourceUri: params.sourceUri ?? null,
      retrievedAt: params.retrievedAt,
      effectiveDate: params.effectiveDate ?? null,
      contentHash: params.contentHash,
      mimeType: params.mimeType ?? null,
      storageRef: params.storageRef ?? null,
      rawPayload: (params.rawPayload as Prisma.InputJsonValue) ?? undefined,
      provenanceMetadata: (params.provenanceMetadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
  return { artifact: created, wasDuplicate: false };
}
