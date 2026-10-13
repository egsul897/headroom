/**
 * Live/dry-run import of the in-repo corpus catalog over Neon HTTPS.
 * Idempotent. Dedupe by sha256 and by accession+filename against rows already
 * in Neon and against earlier rows in the same batch. Never writes ContractRule.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";
import { iterateCorpusWork, type PlannedRelationship, type PlannedRecord, type PlannedSource } from "./corpus-catalog";
import { AUTHORITY_STATUS, BATCH_KEY } from "./constants";
import { isRealAccession } from "./document-class";

export type CorpusImportCounts = Record<string, number>;

async function saveCheckpoint(
  executor: NeonHttpsExecutor,
  stage: string,
  cursor: string | null,
  status: string,
  counts: CorpusImportCounts,
): Promise<void> {
  await executor.execute(
    `INSERT INTO kf_precedent_import_checkpoints ("batchKey", stage, cursor, status, "countsJson", "updatedAt")
     VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
     ON CONFLICT ("batchKey", stage) DO UPDATE SET
       cursor = EXCLUDED.cursor,
       status = EXCLUDED.status,
       "countsJson" = EXCLUDED."countsJson",
       "updatedAt" = NOW()`,
    [BATCH_KEY, stage, cursor, status, JSON.stringify(counts)],
  );
}

function bump(counts: CorpusImportCounts, key: string, n = 1) {
  counts[key] = (counts[key] ?? 0) + n;
}

export async function importCorpusExpansion(
  executor: NeonHttpsExecutor,
  opts: {
    repoRoot: string;
    live: boolean;
    batchSize?: number;
    counts: CorpusImportCounts;
    errors: Array<{ stage: string; id: string; error: string }>;
  },
): Promise<void> {
  const { repoRoot, live, counts, errors } = opts;
  const batchSize = opts.batchSize ?? 100;
  let sinceCheckpoint = 0;

  const note = (corpus: string, action: string) => {
    bump(counts, `corpus:${corpus}:${action}`);
    bump(counts, `corpusAction:${action}`);
  };

  for (const item of iterateCorpusWork(repoRoot)) {
    if (item.type === "source") {
      note(item.corpus, item.action);
      if (!live) continue;
      if ((item.action === "insert" || item.action === "metadata-only") && item.source) {
        try {
          const outcome = await insertSource(executor, repoRoot, item.source);
          if (outcome !== "inserted") note(item.corpus, outcome);
        } catch (err) {
          errors.push({
            stage: "corpus-expansion",
            id: item.source.sourceId,
            error: (err instanceof Error ? err.message : String(err)).slice(0, 240),
          });
          note(item.corpus, "error");
        }
      }
    } else if (item.type === "record") {
      note(item.corpus, item.action);
      if (!live || item.action !== "insert" || !item.record) continue;
      try {
        const outcome = await insertRecord(executor, item.record);
        if (outcome !== "inserted") note(item.corpus, outcome);
      } catch (err) {
        errors.push({
          stage: "corpus-expansion",
          id: item.record.recordId,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 240),
        });
        note(item.corpus, "error");
      }
    } else {
      note(item.corpus, item.action);
      if (!live || item.action !== "insert" || !item.relationship) continue;
      try {
        await insertRelationship(executor, item.relationship);
      } catch (err) {
        errors.push({
          stage: "corpus-expansion",
          id: item.relationship.id,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 240),
        });
        note(item.corpus, "error");
      }
    }
    sinceCheckpoint += 1;
    if (live && sinceCheckpoint >= batchSize) {
      await saveCheckpoint(executor, "corpus-expansion", String(sinceCheckpoint), "RUNNING", counts);
      sinceCheckpoint = 0;
    }
  }
  if (live) await saveCheckpoint(executor, "corpus-expansion", "done", "OK", counts);
}

async function insertSource(
  executor: NeonHttpsExecutor,
  repoRoot: string,
  source: PlannedSource,
): Promise<"inserted" | "deduped-sha256" | "deduped-accession" | "reused-source-id" | "durable-conflict"> {
  const rows = await executor.execute(
    `SELECT "sourceId", "originalBytesHash", "accessionNumber", "exhibitFilename"
     FROM knowledge_sources
     WHERE "sourceId" = $1
        OR "originalBytesHash" = $2
        OR ("accessionNumber" = $3 AND "exhibitFilename" = $4)
     LIMIT 8`,
    [source.sourceId, source.originalBytesHash, source.accessionNumber, source.exhibitFilename],
  );
  for (const row of rows) {
    const sameId = row.sourceId === source.sourceId;
    const sameHash = row.originalBytesHash === source.originalBytesHash;
    if (sameId && sameHash) return "reused-source-id";
    if (sameId && !sameHash) return "durable-conflict";
    if (sameHash) return "deduped-sha256";
    if (
      isRealAccession(source.accessionNumber) &&
      row.accessionNumber === source.accessionNumber &&
      String(row.exhibitFilename ?? "").toLowerCase() === source.exhibitFilename.toLowerCase()
    ) {
      return sameHash ? "deduped-accession" : "durable-conflict";
    }
  }

  let bytes: Buffer | null = null;
  if (source.localPath) {
    bytes = readFileSync(path.join(repoRoot, source.localPath));
  }
  if (bytes) {
    const byHash = await executor.execute(
      `SELECT id FROM document_byte_objects WHERE "contentHash" = $1 LIMIT 1`,
      [source.originalBytesHash],
    );
    if (!byHash[0]) {
      await executor.execute(
        `INSERT INTO document_byte_objects
          (id, "contentHash", "byteSize", "contentType", namespace, filename, bytes, "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
         ON CONFLICT ("contentHash") DO NOTHING`,
        [
          randomUUID(),
          source.originalBytesHash,
          bytes.length,
          "application/octet-stream",
          "kf-corpus",
          source.exhibitFilename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180),
          bytes,
        ],
      );
    }
  }

  const filingDate = new Date(source.filingDate);
  await executor.execute(
    `INSERT INTO knowledge_sources
      (id, "sourceId", "issuerCik", "issuerTicker", "issuerName", "accessionNumber", "exhibitFilename",
       "sourceUrl", "filingDate", "formType", "documentTitle", "documentClass", "instrumentIdentity",
       "originalBytesHash", "acquisitionTimestamp", "parserVersion", "extractionStatus",
       "representationLevel", provenance, "usageRightsReviewStatus", "byteSize", "storageRef",
       metadata, "createdAt", "updatedAt")
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::"knowledge_debt_document_class",$13,$14,$15,$16,
       'ACQUIRED'::"knowledge_extraction_status",
       'SOURCE_ONLY'::"knowledge_representation_level",$17,
       $18::"knowledge_usage_rights_status",$19,$20,$21::jsonb,NOW(),NOW()
     )
     ON CONFLICT ("sourceId") DO NOTHING`,
    [
      randomUUID(),
      source.sourceId,
      source.issuerCik,
      source.issuerTicker,
      source.issuerName,
      source.accessionNumber,
      source.exhibitFilename,
      source.sourceUrl,
      Number.isNaN(filingDate.getTime()) ? new Date(UNKNOWN_ISO) : filingDate,
      source.formType,
      source.documentTitle,
      source.documentClass,
      null,
      source.originalBytesHash,
      new Date(),
      "neon-https-precedent-import.v1",
      source.provenance,
      source.usageRights,
      source.byteSize,
      bytes ? `pgbytea:v1:${source.originalBytesHash}` : null,
      JSON.stringify({
        authorityStatus: AUTHORITY_STATUS,
        precedentOnly: true,
        durablePersistence: Boolean(bytes),
        storageProvider: bytes ? "postgres-bytea" : null,
        corpusNamespace: "kf-corpus",
        importedVia: "neon:https-precedent-import",
        corpus: source.corpus,
        ...source.metadata,
      }),
    ],
  );
  return "inserted";
}

const UNKNOWN_ISO = "1970-01-01T00:00:00.000Z";

async function insertRecord(
  executor: NeonHttpsExecutor,
  record: PlannedRecord,
): Promise<"inserted" | "deduped-content-hash"> {
  if (record.contentHash) {
    const existing = await executor.execute(
      `SELECT "recordId" FROM kf_precedent_corpus_records
       WHERE corpus = $1 AND "contentHash" = $2 AND "recordId" <> $3
       LIMIT 1`,
      [record.corpus, record.contentHash, record.recordId],
    );
    if (existing[0]) return "deduped-content-hash";
  }
  await executor.execute(
    `INSERT INTO kf_precedent_corpus_records
      ("recordId", corpus, kind, "sourceId", "contentHash", "accessionNumber", "authorityStatus", "payloadJson", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW(),NOW())
     ON CONFLICT ("recordId") DO UPDATE SET
       "payloadJson" = EXCLUDED."payloadJson",
       "contentHash" = EXCLUDED."contentHash",
       kind = EXCLUDED.kind,
       "updatedAt" = NOW()`,
    [
      record.recordId,
      record.corpus,
      record.kind,
      record.sourceId,
      record.contentHash,
      record.accessionNumber,
      AUTHORITY_STATUS,
      JSON.stringify(record.payload),
    ],
  );
  return "inserted";
}

async function insertRelationship(executor: NeonHttpsExecutor, rel: PlannedRelationship): Promise<void> {
  await executor.execute(
    `INSERT INTO kf_precedent_document_relationships
      (id,"sourceId","targetId",kind,"evidenceStatus",rationale,confidence,"authorityStatus","payloadJson","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW(),NOW())
     ON CONFLICT (id) DO UPDATE SET
       "payloadJson" = EXCLUDED."payloadJson",
       "updatedAt" = NOW()`,
    [
      rel.id,
      rel.sourceId,
      rel.targetId,
      rel.kind,
      rel.evidenceStatus,
      rel.rationale,
      rel.confidence,
      AUTHORITY_STATUS,
      JSON.stringify(rel.payload),
    ],
  );
}
