/**
 * Idempotent original-byte importer into Neon via durable-store.
 *
 * Default mode is dry-run. Live writes require:
 *   params.live === true AND process.env.KF_CONSOLIDATION_LIVE_WRITE === "I_AUTHORIZE_NEON_BULK_WRITE"
 *
 * Never silently overwrites. Never promotes representation levels.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { KnowledgeSourceRecord } from "../types";
import {
  DurableContentConflictError,
  persistDurableKnowledgeSource,
  type DurableSourcePersistResult,
} from "../preservation/durable-store";
import { scanOriginalByteCandidates } from "./scan-original-bytes";
import type { ImportAction, OriginalByteCandidate } from "./types";

export const LIVE_WRITE_ENV = "KF_CONSOLIDATION_LIVE_WRITE" as const;
export const LIVE_WRITE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE" as const;

export interface ImportBatchResult {
  mode: "dry-run" | "live";
  processed: number;
  inserted: number;
  reused: number;
  aliased: number;
  conflicts: number;
  skipped: number;
  errors: Array<{ sourceId: string; error: string }>;
  results: Array<{
    sourceId: string;
    action: ImportAction;
    storageRef?: string;
    knowledgeSourceRowId?: string;
  }>;
}

function assertLiveAuthorized(live: boolean): void {
  if (!live) return;
  if (process.env[LIVE_WRITE_ENV] !== LIVE_WRITE_TOKEN) {
    throw new Error(
      `Live consolidation write refused: set ${LIVE_WRITE_ENV}=${LIVE_WRITE_TOKEN} ` +
        "only after explicit owner approval. Prefer dry-run.",
    );
  }
}

function toSourceRecord(c: OriginalByteCandidate): KnowledgeSourceRecord {
  return {
    sourceId: c.sourceId,
    issuerCik: c.issuerCik,
    issuerTicker: c.issuerTicker,
    issuerName: c.issuerName,
    accessionNumber: c.accessionNumber,
    exhibitFilename: c.exhibitFilename,
    sourceUrl: c.sourceUrl,
    filingDate: c.filingDate,
    formType: c.formType,
    documentTitle: c.documentTitle,
    documentClass: c.documentClass as KnowledgeSourceRecord["documentClass"],
    originalBytesHash: c.originalBytesHash,
    acquisitionTimestamp: new Date().toISOString(),
    parserVersion: "consolidation-import.v1",
    extractionStatus: "ACQUIRED",
    representationLevel: c.representationLevel,
    provenance: c.provenance,
    usageRightsReviewStatus: c.usageRightsReviewStatus,
  };
}

export async function importOriginalByteCandidates(params: {
  live?: boolean;
  repoRoot?: string;
  /** Limit to specific sourceIds (e.g. Gibraltar only for first proof). */
  onlySourceIds?: string[];
  /** Max inserts in one batch (safety). */
  limit?: number;
}): Promise<ImportBatchResult> {
  const live = Boolean(params.live);
  assertLiveAuthorized(live);
  const repoRoot = params.repoRoot ?? process.cwd();
  let candidates = scanOriginalByteCandidates(repoRoot);
  if (params.onlySourceIds?.length) {
    const allow = new Set(params.onlySourceIds);
    candidates = candidates.filter((c) => allow.has(c.sourceId));
  }
  if (params.limit != null) {
    candidates = candidates.slice(0, params.limit);
  }

  const out: ImportBatchResult = {
    mode: live ? "live" : "dry-run",
    processed: 0,
    inserted: 0,
    reused: 0,
    aliased: 0,
    conflicts: 0,
    skipped: 0,
    errors: [],
    results: [],
  };

  for (const c of candidates) {
    out.processed += 1;
    if (!live) {
      out.results.push({ sourceId: c.sourceId, action: "INSERT_BYTES_AND_REGISTRY" });
      out.inserted += 1;
      continue;
    }

    try {
      const bytes = readFileSync(path.join(repoRoot, c.localPath));
      const persisted: DurableSourcePersistResult = await persistDurableKnowledgeSource({
        source: toSourceRecord(c),
        bytes,
        contentType: c.contentType,
      });
      if (persisted.reusedExisting) {
        if (persisted.sourceId === c.sourceId) {
          out.reused += 1;
          out.results.push({
            sourceId: c.sourceId,
            action: "REUSE_IDENTICAL",
            storageRef: persisted.storageRef,
            knowledgeSourceRowId: persisted.knowledgeSourceRowId,
          });
        } else {
          out.aliased += 1;
          out.results.push({
            sourceId: c.sourceId,
            action: "ALIAS_IDENTICAL_BYTES",
            storageRef: persisted.storageRef,
            knowledgeSourceRowId: persisted.knowledgeSourceRowId,
          });
        }
      } else {
        out.inserted += 1;
        out.results.push({
          sourceId: c.sourceId,
          action: "INSERT_BYTES_AND_REGISTRY",
          storageRef: persisted.storageRef,
          knowledgeSourceRowId: persisted.knowledgeSourceRowId,
        });
      }
    } catch (err) {
      if (err instanceof DurableContentConflictError) {
        out.conflicts += 1;
        out.results.push({ sourceId: c.sourceId, action: "CONFLICT_SOURCE_ID" });
      } else {
        out.errors.push({
          sourceId: c.sourceId,
          error: err instanceof Error ? err.message : String(err),
        });
        out.skipped += 1;
      }
    }
  }

  return out;
}
