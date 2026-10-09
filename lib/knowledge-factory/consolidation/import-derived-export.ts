/**
 * Metadata-only import of committed KF consumer-export sources into KnowledgeSource.
 *
 * Does NOT store original bytes. Rows without storageRef are NOT durable.
 * Representation levels are copied as-is and never promoted.
 * Live writes require the same authorization gate as byte import.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../prisma";
import type { KnowledgeSourceRecord } from "../types";
import { LIVE_WRITE_ENV, LIVE_WRITE_TOKEN } from "./import-original-bytes";
import { assertLiveWriteApproval } from "../live-write-approval";

export interface MetadataImportResult {
  mode: "dry-run" | "live";
  sourcesConsidered: number;
  wouldInsert: number;
  wouldReuse: number;
  wouldConflict: number;
  inserted: number;
  reused: number;
  conflicts: number;
  errors: Array<{ sourceId: string; error: string }>;
}

function assertLive(live: boolean) {
  if (!live) return;
  if (process.env[LIVE_WRITE_ENV] !== LIVE_WRITE_TOKEN) {
    throw new Error(
      `Live metadata import refused: set ${LIVE_WRITE_ENV}=${LIVE_WRITE_TOKEN} after owner approval.`,
    );
  }
  assertLiveWriteApproval({ operation: "derived-export-import" });
}

function loadExportSources(repoRoot: string): KnowledgeSourceRecord[] {
  const p = path.join(repoRoot, "docs/knowledge-factory/export/v1/sources.json");
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.sources ?? [];
  return list.map((s: Record<string, unknown>) => ({
    sourceId: String(s.sourceId),
    issuerCik: String(s.issuerCik ?? "0000000000"),
    issuerTicker: s.issuerTicker ? String(s.issuerTicker) : undefined,
    issuerName: s.issuerName ? String(s.issuerName) : undefined,
    accessionNumber: String(s.accessionNumber ?? "unknown"),
    exhibitFilename: String(s.exhibitFilename ?? "unknown"),
    sourceUrl: String(s.sourceUrl ?? ""),
    filingDate: String(s.filingDate ?? "1970-01-01"),
    formType: String(s.formType ?? "UNKNOWN"),
    documentTitle: String(s.documentTitle ?? "UNKNOWN"),
    documentClass: (s.documentClass as KnowledgeSourceRecord["documentClass"]) ?? "UNKNOWN",
    instrumentIdentity: s.instrumentIdentity ? String(s.instrumentIdentity) : undefined,
    originalBytesHash: String(s.originalBytesHash ?? ""),
    normalizedTextHash: s.normalizedTextHash ? String(s.normalizedTextHash) : undefined,
    acquisitionTimestamp: String(s.acquisitionTimestamp ?? new Date().toISOString()),
    parserVersion: String(s.parserVersion ?? "export-metadata-import.v1"),
    extractionStatus: "ACQUIRED" as const,
    representationLevel:
      (s.representationLevel as KnowledgeSourceRecord["representationLevel"]) ?? "SOURCE_ONLY",
    provenance: String(s.provenance ?? "export-metadata"),
    usageRightsReviewStatus:
      (s.usageRightsReviewStatus as KnowledgeSourceRecord["usageRightsReviewStatus"]) ??
      "UNREVIEWED",
  }));
}

/**
 * Plan/apply metadata-only registry rows.
 * Explicitly leaves storageRef null — not a durability claim.
 */
export async function importExportSourcesMetadataOnly(params: {
  live?: boolean;
  repoRoot?: string;
  limit?: number;
}): Promise<MetadataImportResult> {
  const live = Boolean(params.live);
  assertLive(live);
  const repoRoot = params.repoRoot ?? process.cwd();
  let sources = loadExportSources(repoRoot).filter((s) => s.originalBytesHash.length === 64);
  if (params.limit != null) sources = sources.slice(0, params.limit);

  const out: MetadataImportResult = {
    mode: live ? "live" : "dry-run",
    sourcesConsidered: sources.length,
    wouldInsert: 0,
    wouldReuse: 0,
    wouldConflict: 0,
    inserted: 0,
    reused: 0,
    conflicts: 0,
    errors: [],
  };

  for (const s of sources) {
    const existing = await prisma.knowledgeSource.findUnique({ where: { sourceId: s.sourceId } });
    if (existing) {
      if (existing.originalBytesHash !== s.originalBytesHash) {
        out.wouldConflict += 1;
        if (live) out.conflicts += 1;
        continue;
      }
      out.wouldReuse += 1;
      if (live) out.reused += 1;
      continue;
    }
    const byHash = await prisma.knowledgeSource.findFirst({
      where: { originalBytesHash: s.originalBytesHash },
    });
    if (byHash) {
      out.wouldReuse += 1;
      if (live) out.reused += 1;
      continue;
    }

    out.wouldInsert += 1;
    if (!live) continue;

    try {
      const filingDate = new Date(s.filingDate);
      await prisma.knowledgeSource.create({
        data: {
          sourceId: s.sourceId,
          issuerCik: s.issuerCik,
          issuerTicker: s.issuerTicker ?? null,
          issuerName: s.issuerName ?? null,
          accessionNumber: s.accessionNumber,
          exhibitFilename: s.exhibitFilename,
          sourceUrl: s.sourceUrl,
          filingDate: Number.isNaN(filingDate.getTime()) ? new Date(0) : filingDate,
          formType: s.formType,
          documentTitle: s.documentTitle,
          documentClass: s.documentClass,
          instrumentIdentity: s.instrumentIdentity ?? null,
          originalBytesHash: s.originalBytesHash,
          normalizedTextHash: s.normalizedTextHash ?? null,
          acquisitionTimestamp: new Date(s.acquisitionTimestamp),
          parserVersion: s.parserVersion,
          extractionStatus: s.extractionStatus,
          representationLevel: s.representationLevel,
          provenance: s.provenance,
          usageRightsReviewStatus: s.usageRightsReviewStatus,
          storageRef: null,
          byteSize: null,
          metadata: {
            durablePersistence: false,
            metadataOnlyImport: true,
            note: "Original bytes not present — not a durability claim",
          },
        },
      });
      out.inserted += 1;
    } catch (err) {
      out.errors.push({
        sourceId: s.sourceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}
