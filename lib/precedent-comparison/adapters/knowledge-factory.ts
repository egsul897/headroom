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
      const issuers = new Set(records.map((r) => r.issuerId).filter(Boolean));
      return {
        peer: "WS-CKF",
        availability: "AVAILABLE",
        pathTried: tried,
        data: {
          schemaVersion: String(raw.schemaVersion ?? raw.kfSchemaVersion ?? "unknown"),
          recordCount: records.length,
          distinctIssuers: issuers.size,
          records: records.slice(0, 5000),
        },
        note: `KF export visible (${records.length} records) at ${rel}`,
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
  return {
    peer: "WS-CKF",
    availability: "UNAVAILABLE",
    pathTried: tried,
    data: null,
    note: "Knowledge Factory corpus export not present — PCI expands from local authentic fixtures only",
  };
}
