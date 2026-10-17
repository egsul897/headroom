/**
 * HTTPS Neon precedent import:
 * - mass-precedent committed bytes → document_byte_objects + knowledge_sources
 * - export/v1 shards → kf_precedent_* tables
 *
 * Dry-run by default. Live requires KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE.
 * Never writes ContractRule / certification state. Marks COMPUTED_NOT_CERTIFIED.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";
import { scanOriginalByteCandidates } from "../knowledge-factory/consolidation/scan-original-bytes";
import { artifactPath } from "../platform/artifact-output";

export const MASS_LIVE_ENV = "KF_MASS_PRECEDENT_LIVE_WRITE";
export const MASS_LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";
export const AUTHORITY_STATUS = "COMPUTED_NOT_CERTIFIED" as const;
export const BATCH_KEY = "kf-https-precedent.v1";

const SAFE_REPRESENTATION_LEVELS = new Set([
  "SOURCE_ONLY",
  "STRUCTURALLY_INDEXED",
  "DISCOVERED_CANDIDATE",
  "SEMANTIC_HYPOTHESIS",
  "DETERMINISTICALLY_VALIDATED",
  "REVIEW_REQUIRED",
]);

export const VERIFY_TABLES = [
  "knowledge_sources",
  "document_byte_objects",
  "kf_precedent_structural_nodes",
  "kf_precedent_covenant_candidates",
  "kf_precedent_definitions",
  "kf_precedent_dependency_edges",
  "kf_precedent_conditions_exceptions",
  "kf_precedent_document_relationships",
  "kf_precedent_unresolved_uncertainties",
  "learning_packages",
  "learning_runs",
  "learning_artifacts",
  "learning_error_ledger_entries",
  "learning_evaluation_outcomes",
  "learning_improvement_proposals",
  "learning_rulesets",
  "learning_ruleset_partial_accepts",
  "flywheel_locks",
  "flywheel_runs",
  "flywheel_alerts",
] as const;

export function isLiveAuthorized(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean {
  return env[MASS_LIVE_ENV] === MASS_LIVE_TOKEN;
}

export function sanitizeRepresentationLevel(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "SOURCE_ONLY";
  if (s === "CERTIFIED" || s === "REVIEWER_VERIFIED") return "DISCOVERED_CANDIDATE";
  if (SAFE_REPRESENTATION_LEVELS.has(s)) return s;
  return "SOURCE_ONLY";
}

function stableDefId(sourceId: string, term: string): string {
  return createHash("sha256").update(`def|${sourceId}|${term}`).digest("hex").slice(0, 32);
}

function readJsonArray<T>(filePath: string): T[] {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error(`Expected JSON array at ${filePath}`);
  return raw as T[];
}

async function saveCheckpoint(
  executor: NeonHttpsExecutor,
  stage: string,
  cursor: string | null,
  status: string,
  counts: Record<string, number>,
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

export type PrecedentImportCounts = Record<string, number>;

export type PrecedentImportResult = {
  live: boolean;
  ok: boolean;
  dryRun: boolean;
  stages: string[];
  counts: PrecedentImportCounts;
  proposed?: Record<string, number>;
  errors: Array<{ stage: string; id: string; error: string }>;
  detail: string;
};

export async function importPrecedentsOverHttps(
  executor: NeonHttpsExecutor,
  opts?: {
    repoRoot?: string;
    live?: boolean;
    batchSize?: number;
    limitBytes?: number;
    limitExportRows?: number;
    /** Skip mass-precedent bytes stage. */
    skipBytes?: boolean;
    /** Skip export/v1 stage. */
    skipExport?: boolean;
  },
): Promise<PrecedentImportResult> {
  const repoRoot = opts?.repoRoot ?? process.cwd();
  const live = Boolean(opts?.live) && isLiveAuthorized();
  const batchSize = opts?.batchSize ?? 100;
  const counts: PrecedentImportCounts = {};
  const errors: PrecedentImportResult["errors"] = [];
  const stages: string[] = [];

  const bump = (k: string, n = 1) => {
    counts[k] = (counts[k] ?? 0) + n;
  };

  // --- Stage: mass-precedent bytes ---
  if (!opts?.skipBytes) {
    stages.push("mass-precedent-bytes");
    const candidates = scanOriginalByteCandidates(repoRoot).filter((c) => Boolean(c.localPath));
    const limited = typeof opts?.limitBytes === "number" ? candidates.slice(0, opts.limitBytes) : candidates;
    bump("massPrecedentCandidates", limited.length);

    if (!live) {
      bump("massPrecedentWouldInsertOrReuse", limited.length);
    } else {
      for (let i = 0; i < limited.length; i += batchSize) {
        const chunk = limited.slice(i, i + batchSize);
        for (const c of chunk) {
          try {
            const abs = path.join(repoRoot, c.localPath);
            if (!existsSync(abs)) {
              bump("massPrecedentSkippedMissingFile");
              continue;
            }
            const bytes = readFileSync(abs);
            const hash = createHash("sha256").update(bytes).digest("hex");
            if (c.originalBytesHash && c.originalBytesHash !== hash) {
              errors.push({
                stage: "mass-precedent-bytes",
                id: c.sourceId,
                error: `hash mismatch expected=${c.originalBytesHash} got=${hash}`,
              });
              bump("massPrecedentConflicts");
              continue;
            }

            const existing = await executor.execute(
              `SELECT id, "sourceId", "originalBytesHash", "storageRef" FROM knowledge_sources WHERE "sourceId" = $1 LIMIT 1`,
              [c.sourceId],
            );
            if (existing[0]) {
              if (existing[0].originalBytesHash !== hash) {
                errors.push({
                  stage: "mass-precedent-bytes",
                  id: c.sourceId,
                  error: "DURABLE_CONTENT_CONFLICT",
                });
                bump("massPrecedentConflicts");
                continue;
              }
              bump("massPrecedentReused");
              continue;
            }

            const byHash = await executor.execute(
              `SELECT id, "contentHash" FROM document_byte_objects WHERE "contentHash" = $1 LIMIT 1`,
              [hash],
            );
            if (!byHash[0]) {
              await executor.execute(
                `INSERT INTO document_byte_objects
                  (id, "contentHash", "byteSize", "contentType", namespace, filename, bytes, "createdAt", "updatedAt")
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
                 ON CONFLICT ("contentHash") DO NOTHING`,
                [
                  randomUUID(),
                  hash,
                  bytes.length,
                  "application/octet-stream",
                  "kf-corpus",
                  `${c.sourceId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180)}.bin`,
                  bytes,
                ],
              );
              bump("documentByteObjectsInserted");
            } else {
              bump("documentByteObjectsReused");
            }

            const storageRef = `pgbytea:v1:${hash}`;
            const filingDate = c.filingDate ? new Date(c.filingDate) : new Date("1970-01-01T00:00:00.000Z");
            const level = sanitizeRepresentationLevel(c.representationLevel ?? "SOURCE_ONLY");
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
                 $17::"knowledge_representation_level",$18,
                 $19::"knowledge_usage_rights_status",$20,$21,$22::jsonb,NOW(),NOW()
               )
               ON CONFLICT ("sourceId") DO NOTHING`,
              [
                randomUUID(),
                c.sourceId,
                c.issuerCik ?? "0000000000",
                c.issuerTicker ?? null,
                c.issuerName ?? null,
                c.accessionNumber ?? "UNKNOWN",
                c.exhibitFilename ?? path.basename(c.localPath),
                c.sourceUrl ?? "",
                filingDate,
                c.formType ?? "UNKNOWN",
                c.documentTitle ?? c.sourceId,
                c.documentClass ?? "UNKNOWN",
                null,
                hash,
                new Date(),
                "neon-https-precedent-import.v1",
                level,
                c.provenance ?? "mass-precedent",
                c.usageRightsReviewStatus ?? "PUBLIC_SEC_EDGAR",
                bytes.length,
                storageRef,
                JSON.stringify({
                  authorityStatus: AUTHORITY_STATUS,
                  precedentOnly: true,
                  durablePersistence: true,
                  storageProvider: "postgres-bytea",
                  corpusNamespace: "kf-corpus",
                  importedVia: "neon:https-precedent-import",
                }),
              ],
            );
            bump("knowledgeSourcesInserted");
          } catch (err) {
            errors.push({
              stage: "mass-precedent-bytes",
              id: c.sourceId,
              error: (err instanceof Error ? err.message : String(err)).slice(0, 240),
            });
            bump("massPrecedentErrors");
          }
        }
        await saveCheckpoint(executor, "mass-precedent-bytes", String(i + chunk.length), "RUNNING", counts);
      }
      await saveCheckpoint(executor, "mass-precedent-bytes", "done", "OK", counts);
    }
  }

  // --- Stage: export/v1 ---
  if (!opts?.skipExport) {
    stages.push("export-v1");
    const exportDir = path.join(repoRoot, "docs/knowledge-factory/export/v1");
    if (!existsSync(exportDir)) {
      return {
        live,
        ok: false,
        dryRun: !live,
        stages,
        counts,
        errors: [...errors, { stage: "export-v1", id: "exportDir", error: "missing export/v1" }],
        detail: "export/v1 missing",
      };
    }

    type SourceRow = Record<string, unknown>;
    const sources = readJsonArray<SourceRow>(path.join(exportDir, "sources.json"));
    const limitRows = opts?.limitExportRows;

    const importSources = async () => {
      const rows = typeof limitRows === "number" ? sources.slice(0, limitRows) : sources;
      bump("exportSources", rows.length);
      if (!live) {
        bump("exportSourcesWouldUpsert", rows.length);
        return;
      }
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        for (const s of chunk) {
          const sourceId = String(s.sourceId);
          const level = sanitizeRepresentationLevel(s.representationLevel);
          const filingDate = new Date(String(s.filingDate ?? "1970-01-01"));
          await executor.execute(
            `INSERT INTO knowledge_sources
              (id, "sourceId", "issuerCik", "issuerTicker", "issuerName", "accessionNumber", "exhibitFilename",
               "sourceUrl", "filingDate", "formType", "documentTitle", "documentClass", "instrumentIdentity",
               "originalBytesHash", "normalizedTextHash", "acquisitionTimestamp", "parserVersion",
               "extractionStatus", "representationLevel", provenance, "usageRightsReviewStatus", metadata,
               "createdAt", "updatedAt")
             VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::"knowledge_debt_document_class",$13,$14,$15,$16,$17,
               'ACQUIRED'::"knowledge_extraction_status",
               $18::"knowledge_representation_level",$19,
               $20::"knowledge_usage_rights_status",$21::jsonb,NOW(),NOW()
             )
             ON CONFLICT ("sourceId") DO UPDATE SET
               "issuerTicker" = EXCLUDED."issuerTicker",
               "normalizedTextHash" = COALESCE(EXCLUDED."normalizedTextHash", knowledge_sources."normalizedTextHash"),
               metadata = knowledge_sources.metadata || EXCLUDED.metadata,
               "updatedAt" = NOW()`,
            [
              randomUUID(),
              sourceId,
              String(s.issuerCik ?? "0000000000"),
              (s.issuerTicker as string | null) ?? null,
              (s.issuerName as string | null) ?? null,
              String(s.accessionNumber ?? "UNKNOWN"),
              String(s.exhibitFilename ?? "UNKNOWN"),
              String(s.sourceUrl ?? ""),
              Number.isNaN(filingDate.getTime()) ? new Date("1970-01-01") : filingDate,
              String(s.formType ?? "UNKNOWN"),
              String(s.documentTitle ?? sourceId),
              String(s.documentClass ?? "UNKNOWN"),
              (s.instrumentIdentity as string | null) ?? null,
              String(s.originalBytesHash ?? ""),
              (s.normalizedTextHash as string | null) ?? null,
              new Date(String(s.acquisitionTimestamp ?? new Date().toISOString())),
              String(s.parserVersion ?? "knowledge-factory.v1"),
              level,
              String(s.provenance ?? "sec-edgar"),
              String(s.usageRightsReviewStatus ?? "PUBLIC_SEC_EDGAR"),
              JSON.stringify({
                authorityStatus: AUTHORITY_STATUS,
                precedentOnly: true,
                corpusRole: s.corpusRole ?? null,
                aliases: s.aliases ?? [],
                importedVia: "neon:https-precedent-import",
                exportShard: "sources",
              }),
            ],
          );
          bump("exportSourcesUpserted");
        }
        await saveCheckpoint(executor, "export-sources", String(i + chunk.length), "RUNNING", counts);
      }
    };

    const upsertShard = async <T extends Record<string, unknown>>(args: {
      stage: string;
      file: string;
      idOf: (row: T) => string;
      write: (row: T) => Promise<void>;
    }) => {
      const rows = readJsonArray<T>(path.join(exportDir, args.file));
      const limited = typeof limitRows === "number" ? rows.slice(0, limitRows) : rows;
      bump(`${args.stage}Total`, limited.length);
      if (!live) {
        bump(`${args.stage}WouldUpsert`, limited.length);
        return;
      }
      for (let i = 0; i < limited.length; i += batchSize) {
        const chunk = limited.slice(i, i + batchSize);
        for (const row of chunk) {
          try {
            await args.write(row);
            bump(`${args.stage}Upserted`);
          } catch (err) {
            errors.push({
              stage: args.stage,
              id: args.idOf(row),
              error: (err instanceof Error ? err.message : String(err)).slice(0, 240),
            });
            bump(`${args.stage}Errors`);
          }
        }
        await saveCheckpoint(executor, args.stage, String(i + chunk.length), "RUNNING", counts);
      }
      await saveCheckpoint(executor, args.stage, "done", "OK", counts);
    };

    await importSources();

    await upsertShard({
      stage: "structural-nodes",
      file: "structural-nodes.json",
      idOf: (r) => String(r.nodeId),
      write: async (r) => {
        await executor.execute(
          `INSERT INTO kf_precedent_structural_nodes
            ("nodeId","sourceId","nodeType","sectionRef",heading,"charStart","charEnd",ambiguous,"authorityStatus","payloadJson","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
           ON CONFLICT ("nodeId") DO UPDATE SET
             "payloadJson" = EXCLUDED."payloadJson",
             "updatedAt" = NOW()`,
          [
            String(r.nodeId),
            String(r.sourceId),
            (r.nodeType as string | null) ?? null,
            (r.sectionRef as string | null) ?? null,
            (r.heading as string | null) ?? null,
            (r.charStart as number | null) ?? null,
            (r.charEnd as number | null) ?? null,
            typeof r.ambiguous === "boolean" ? r.ambiguous : null,
            AUTHORITY_STATUS,
            JSON.stringify(r),
          ],
        );
      },
    });

    await upsertShard({
      stage: "covenant-candidates",
      file: "covenant-candidates.json",
      idOf: (r) => String(r.candidateId),
      write: async (r) => {
        await executor.execute(
          `INSERT INTO kf_precedent_covenant_candidates
            ("candidateId","sourceId","nodeId","familiesJson","signalsJson",excerpt,"discoveryScore","representationLevel","authorityStatus","payloadJson","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
           ON CONFLICT ("candidateId") DO UPDATE SET
             "payloadJson" = EXCLUDED."payloadJson",
             "updatedAt" = NOW()`,
          [
            String(r.candidateId),
            String(r.sourceId),
            (r.nodeId as string | null) ?? null,
            JSON.stringify(r.families ?? []),
            JSON.stringify(r.signals ?? []),
            (r.excerpt as string | null) ?? null,
            typeof r.discoveryScore === "number" ? r.discoveryScore : null,
            sanitizeRepresentationLevel(r.representationLevel),
            AUTHORITY_STATUS,
            JSON.stringify(r),
          ],
        );
      },
    });

    await upsertShard({
      stage: "definitions",
      file: "definitions.json",
      idOf: (r) => stableDefId(String(r.sourceId), String(r.term)),
      write: async (r) => {
        const id = stableDefId(String(r.sourceId), String(r.term));
        await executor.execute(
          `INSERT INTO kf_precedent_definitions
            (id,"sourceId",term,"charStart","charEnd",excerpt,"authorityStatus","payloadJson","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW(),NOW())
           ON CONFLICT (id) DO UPDATE SET
             "payloadJson" = EXCLUDED."payloadJson",
             "updatedAt" = NOW()`,
          [
            id,
            String(r.sourceId),
            String(r.term),
            (r.charStart as number | null) ?? null,
            (r.charEnd as number | null) ?? null,
            (r.excerpt as string | null) ?? null,
            AUTHORITY_STATUS,
            JSON.stringify(r),
          ],
        );
      },
    });

    await upsertShard({
      stage: "dependency-edges",
      file: "dependency-edges.json",
      idOf: (r) => String(r.edgeId),
      write: async (r) => {
        await executor.execute(
          `INSERT INTO kf_precedent_dependency_edges
            ("edgeId","sourceId",kind,"rawReference",resolution,"legalTruth","charStart","charEnd","authorityStatus","payloadJson","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
           ON CONFLICT ("edgeId") DO UPDATE SET
             "payloadJson" = EXCLUDED."payloadJson",
             "updatedAt" = NOW()`,
          [
            String(r.edgeId),
            String(r.sourceId),
            String(r.kind ?? "PROVISION_CROSS_REFERENCE"),
            (r.rawReference as string | null) ?? null,
            (r.resolution as string | null) ?? null,
            (r.legalTruth as string | null) ?? null,
            (r.charStart as number | null) ?? null,
            (r.charEnd as number | null) ?? null,
            AUTHORITY_STATUS,
            JSON.stringify(r),
          ],
        );
      },
    });

    await upsertShard({
      stage: "conditions-exceptions",
      file: "conditions-exceptions.json",
      idOf: (r) => String(r.id),
      write: async (r) => {
        await executor.execute(
          `INSERT INTO kf_precedent_conditions_exceptions
            (id,"sourceId",kind,"nodeId",excerpt,"signalsJson","representationLevel","charStart","charEnd","authorityStatus","payloadJson","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,NOW(),NOW())
           ON CONFLICT (id) DO UPDATE SET
             "payloadJson" = EXCLUDED."payloadJson",
             "updatedAt" = NOW()`,
          [
            String(r.id),
            String(r.sourceId),
            String(r.kind),
            (r.nodeId as string | null) ?? null,
            (r.excerpt as string | null) ?? null,
            JSON.stringify(r.signals ?? []),
            sanitizeRepresentationLevel(r.representationLevel),
            (r.charStart as number | null) ?? null,
            (r.charEnd as number | null) ?? null,
            AUTHORITY_STATUS,
            JSON.stringify(r),
          ],
        );
      },
    });

    await upsertShard({
      stage: "document-relationships",
      file: "document-relationships.json",
      idOf: (r) => String(r.id),
      write: async (r) => {
        await executor.execute(
          `INSERT INTO kf_precedent_document_relationships
            (id,"sourceId","targetId",kind,"evidenceStatus",rationale,confidence,"authorityStatus","payloadJson","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW(),NOW())
           ON CONFLICT (id) DO UPDATE SET
             "payloadJson" = EXCLUDED."payloadJson",
             "updatedAt" = NOW()`,
          [
            String(r.id),
            String(r.sourceId),
            String(r.targetId),
            String(r.kind),
            (r.evidenceStatus as string | null) ?? null,
            (r.rationale as string | null) ?? null,
            typeof r.confidence === "number" ? r.confidence : null,
            AUTHORITY_STATUS,
            JSON.stringify(r),
          ],
        );
      },
    });

    await upsertShard({
      stage: "unresolved-uncertainties",
      file: "unresolved-uncertainties.json",
      idOf: (r) => String(r.id),
      write: async (r) => {
        await executor.execute(
          `INSERT INTO kf_precedent_unresolved_uncertainties
            (id,"sourceId","candidateId","nodeId","reasonsJson",excerpt,"reviewerTask","suggestedRegression","authorityStatus","payloadJson","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
           ON CONFLICT (id) DO UPDATE SET
             "payloadJson" = EXCLUDED."payloadJson",
             "updatedAt" = NOW()`,
          [
            String(r.id),
            String(r.sourceId),
            (r.candidateId as string | null) ?? null,
            (r.nodeId as string | null) ?? null,
            JSON.stringify(r.reasons ?? []),
            (r.excerpt as string | null) ?? null,
            (r.reviewerTask as string | null) ?? null,
            (r.suggestedRegression as string | null) ?? null,
            AUTHORITY_STATUS,
            JSON.stringify(r),
          ],
        );
      },
    });
  }

  const result: PrecedentImportResult = {
    live,
    ok: errors.length === 0 || !live,
    dryRun: !live,
    stages,
    counts,
    proposed: live ? undefined : counts,
    errors: errors.slice(0, 50),
    detail: live
      ? `live import complete; errors=${errors.length}`
      : `dry-run only; set ${MASS_LIVE_ENV}=${MASS_LIVE_TOKEN} to write`,
  };

  const outDir = artifactPath(repoRoot, "docs/knowledge-factory/mass-precedent");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "https-import-result.json"),
    `${JSON.stringify({ ...result, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  return result;
}

export async function countTablesOverHttps(
  executor: NeonHttpsExecutor,
  tables: readonly string[] = VERIFY_TABLES,
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const table of tables) {
    try {
      const rows = await executor.execute(`SELECT COUNT(*)::int AS count FROM "${table}"`);
      const n = rows[0]?.count;
      out[table] = typeof n === "number" ? n : Number(n ?? 0);
    } catch {
      out[table] = null;
    }
  }
  return out;
}
