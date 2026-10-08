/**
 * Adapter for WS-CKF Covenant Knowledge Factory corpus exports.
 *
 * Consumes published KF dataset envelopes when present. Does not invent a
 * second acquisition or knowledge-store schema.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PeerLoadResult } from "./types";

export interface KnowledgeFactoryRecordView {
  recordId: string;
  issuerId?: string;
  documentId?: string;
  covenantFamily?: string;
  sourceSectionRef?: string;
  sourceText?: string;
  agreementType?: string;
}

export interface KnowledgeFactoryView {
  schemaVersion: string;
  recordCount: number;
  distinctIssuers: number;
  records: KnowledgeFactoryRecordView[];
}

const DEFAULT_PATHS = [
  "tests/fixtures/covenant-dependency-atlas/export/knowledge-factory-dataset.json",
  "docs/knowledge-factory/export/corpus.json",
  "lib/knowledge-factory/export/corpus.json",
  "lib/precedent-comparison/adapters/fixtures/knowledge-factory.sample.json",
];

/** Peer coordination manifests (stats only — not provision text). */
const MANIFEST_PATHS = [
  "docs/knowledge-factory/manifests/corpus-stats.json",
  "docs/knowledge-factory/manifests/fixture-ingest-report.json",
];

export function loadKnowledgeFactoryCorpus(baseDir: string = process.cwd(), extraPaths: string[] = []): PeerLoadResult<KnowledgeFactoryView> {
  const tried: string[] = [];
  for (const rel of [...extraPaths, ...DEFAULT_PATHS]) {
    const abs = join(baseDir, rel);
    tried.push(abs);
    if (!existsSync(abs)) continue;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      const records =
        (raw.records as KnowledgeFactoryRecordView[] | undefined) ??
        (raw.provisions as KnowledgeFactoryRecordView[] | undefined) ??
        (raw.edges as KnowledgeFactoryRecordView[] | undefined) ??
        [];
      if (!Array.isArray(records)) {
        return {
          peer: "WS-CKF",
          availability: "SCHEMA_MISMATCH",
          pathTried: tried,
          data: null,
          note: `unexpected shape at ${rel}`,
        };
      }
      // Portable atlas dependency datasets are edge graphs, not provision corpora.
      if (records.length > 0 && records.every((r) => !r.sourceText && !r.recordId && !(r as { candidateId?: string }).candidateId)) {
        continue;
      }
      const issuers = new Set(records.map((r) => r.issuerId).filter(Boolean));
      const isSample = rel.includes("adapters/fixtures/");
      if (isSample && records.length === 0) continue;
      return {
        peer: "WS-CKF",
        availability: isSample ? "UNAVAILABLE" : "AVAILABLE",
        pathTried: tried,
        data: isSample
          ? null
          : {
              schemaVersion: String(raw.schemaVersion ?? raw.kfSchemaVersion ?? "unknown"),
              recordCount: records.length,
              distinctIssuers: issuers.size,
              records: records.slice(0, 5000),
            },
        note: isSample
          ? `KF sample fixture only at ${rel} — published corpus export not delivered`
          : `KF export visible (${records.length} records) at ${rel}`,
      };
    } catch (err) {
      return {
        peer: "WS-CKF",
        availability: "SCHEMA_MISMATCH",
        pathTried: tried,
        data: null,
        note: `failed to parse ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Surface peer manifest stats for coordination without claiming corpus availability.
  for (const rel of MANIFEST_PATHS) {
    const abs = join(baseDir, rel);
    tried.push(abs);
    if (!existsSync(abs)) continue;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      const stats = (raw.stats as Record<string, unknown> | undefined) ?? raw;
      const agreements = Number(stats.distinctAgreements ?? 0);
      const issuers = Number(stats.issuersDiscovered ?? 0);
      return {
        peer: "WS-CKF",
        availability: "UNAVAILABLE",
        pathTried: tried,
        data: null,
        note: `KF manifest at ${rel} reports ~${agreements} agreements / ~${issuers} issuers discovered — provision export not mounted in this worktree; PCI does not duplicate acquisition`,
      };
    } catch {
      /* continue */
    }
  }

  return {
    peer: "WS-CKF",
    availability: "UNAVAILABLE",
    pathTried: tried,
    data: null,
    note: "Knowledge Factory corpus export not present — PCI expands from local authentic fixtures only",
  };
}
