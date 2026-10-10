/**
 * Aggregate actual database effects from committed batch artifacts + live read-only counts.
 * Does not mutate Neon.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../prisma";

export interface BatchEffectSummary {
  batchKey: string;
  persisted: number;
  reused: number;
  skippedExisting: number;
  skippedNonFinancing: number;
  fetched: number;
  analyzed: number;
  failed: number;
  relationshipEdgesPersisted: number;
  byClassDelta: Record<string, number>;
  neonAfter?: Record<string, unknown>;
}

export async function reportDatabaseEffects(params?: {
  repoRoot?: string;
}): Promise<{
  schema: "kf-database-effects.v1";
  generatedAt: string;
  readOnly: true;
  liveCounts: Record<string, number>;
  representationLevels: Record<string, number>;
  batchArtifacts: BatchEffectSummary[];
  totalsFromBatches: {
    persisted: number;
    reused: number;
    skippedExisting: number;
    skippedNonFinancing: number;
    fetched: number;
    failed: number;
    relationshipEdgesPersistedClaimed: number;
  };
  storage: {
    databaseSizePretty: string | null;
    documentByteObjects: number;
    knowledgeSources: number;
  };
  rollbackReplay: {
    idempotentOnSourceIdAndHash: true;
    knowledgeImportBatches: number;
    note: string;
  };
  neonMutationsThisGate: false;
}> {
  const repoRoot = params?.repoRoot ?? process.cwd();
  const dir = path.join(repoRoot, "docs/knowledge-factory/continuous");
  const batchArtifacts: BatchEffectSummary[] = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (!name.startsWith("neon-massive-batch") || !name.endsWith(".json")) continue;
      const raw = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as Record<string, unknown>;
      batchArtifacts.push({
        batchKey: String(raw.batchKey ?? name),
        persisted: Number(raw.persisted ?? 0),
        reused: Number(raw.reused ?? 0),
        skippedExisting: Number(raw.skippedExisting ?? 0),
        skippedNonFinancing: Number(raw.skippedNonFinancing ?? 0),
        fetched: Number(raw.fetched ?? 0),
        analyzed: Number(raw.analyzed ?? 0),
        failed: Number(raw.failed ?? 0),
        relationshipEdgesPersisted: Number(raw.relationshipEdgesPersisted ?? 0),
        byClassDelta: (raw.byClassDelta as Record<string, number>) ?? {},
        neonAfter: (raw.neonAfter as Record<string, unknown>) ?? undefined,
      });
    }
  }

  const totals = {
    persisted: batchArtifacts.reduce((n, b) => n + b.persisted, 0),
    reused: batchArtifacts.reduce((n, b) => n + b.reused, 0),
    skippedExisting: batchArtifacts.reduce((n, b) => n + b.skippedExisting, 0),
    skippedNonFinancing: batchArtifacts.reduce((n, b) => n + b.skippedNonFinancing, 0),
    fetched: batchArtifacts.reduce((n, b) => n + b.fetched, 0),
    failed: batchArtifacts.reduce((n, b) => n + b.failed, 0),
    relationshipEdgesPersistedClaimed: batchArtifacts.reduce(
      (n, b) => n + b.relationshipEdgesPersisted,
      0,
    ),
  };

  const liveCounts = {
    knowledgeSources: await prisma.knowledgeSource.count(),
    publicSecEdgar: await prisma.knowledgeSource.count({
      where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
    }),
    documentByteObjects: await prisma.documentByteObject.count(),
    knowledgeRelationships: await prisma.knowledgeRelationshipEdge.count(),
    knowledgeImportBatches: await prisma.knowledgeImportBatch.count(),
    continuousExpand: await prisma.knowledgeSource.count({
      where: { provenance: "sec-edgar-continuous-expand" },
    }),
    abl: await prisma.knowledgeSource.count({
      where: { documentClass: "ABL_AGREEMENT", usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
    }),
    intercreditor: await prisma.knowledgeSource.count({
      where: {
        documentClass: "INTERCREDITOR_AGREEMENT",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      },
    }),
    guarantee: await prisma.knowledgeSource.count({
      where: {
        documentClass: "GUARANTEE_AGREEMENT",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      },
    }),
  };

  const levels = await prisma.knowledgeSource.groupBy({
    by: ["representationLevel"],
    _count: true,
  });
  const representationLevels = Object.fromEntries(levels.map((r) => [r.representationLevel, r._count]));

  let databaseSizePretty: string | null = null;
  try {
    const size = await prisma.$queryRaw<Array<{ db_size: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size
    `;
    databaseSizePretty = size[0]?.db_size ?? null;
  } catch {
    databaseSizePretty = null;
  }

  return {
    schema: "kf-database-effects.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    liveCounts,
    representationLevels,
    batchArtifacts,
    totalsFromBatches: totals,
    storage: {
      databaseSizePretty,
      documentByteObjects: liveCounts.documentByteObjects,
      knowledgeSources: liveCounts.knowledgeSources,
    },
    rollbackReplay: {
      idempotentOnSourceIdAndHash: true,
      knowledgeImportBatches: liveCounts.knowledgeImportBatches,
      note: "Replay reuses BYTEA by content hash; KnowledgeImportBatch checkpoints record completed sourceIds. No destructive rollback executed this gate.",
    },
    neonMutationsThisGate: false,
  };
}
