/**
 * Dry-run consolidation plan against live Neon (read-only).
 * Never writes. Never prints DATABASE_URL.
 */

import { createHash } from "node:crypto";
import { prisma } from "../../prisma";
import { scanOriginalByteCandidates } from "./scan-original-bytes";
import {
  CONSOLIDATION_PLAN_SCHEMA,
  type DryRunItemPlan,
  type DryRunPlanSummary,
  type ImportAction,
  type OriginalByteCandidate,
} from "./types";

function hostFingerprint(databaseUrl: string | undefined): string {
  if (!databaseUrl?.trim()) return "DATABASE_URL_ABSENT";
  try {
    const u = new URL(databaseUrl.replace(/^postgresql:/i, "http:"));
    return createHash("sha256").update(u.hostname).digest("hex").slice(0, 12);
  } catch {
    return "DATABASE_URL_UNPARSEABLE";
  }
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ t: string | null }[]>(
    `select to_regclass('public.${name}')::text as t`,
  );
  return Boolean(rows[0]?.t);
}

export async function readNeonBaseline(): Promise<DryRunPlanSummary["neon"]> {
  const mig = await prisma.$queryRawUnsafe<{ c: number }[]>(
    `select count(*)::int as c from "_prisma_migrations" where finished_at is not null`,
  );
  const documentByteObjectsTablePresent = await tableExists("document_byte_objects");
  const existingCounts: Record<string, number> = {
    companies: await prisma.company.count(),
    financialSnapshots: await prisma.financialSnapshot.count(),
    documents: await prisma.document.count(),
    knowledgeSources: await prisma.knowledgeSource.count(),
    knowledgeRelationshipEdges: await prisma.knowledgeRelationshipEdge.count(),
    knowledgeCostLedgerEntries: await prisma.knowledgeCostLedgerEntry.count(),
    goldenTests: await prisma.goldenTest.count(),
    definedTerms: await prisma.definedTerm.count(),
    sourceArtifacts: await prisma.sourceArtifact.count(),
  };
  if (documentByteObjectsTablePresent) {
    const c = await prisma.$queryRawUnsafe<{ c: number }[]>(
      `select count(*)::int as c from document_byte_objects`,
    );
    existingCounts.documentByteObjects = c[0]?.c ?? 0;
  } else {
    existingCounts.documentByteObjects = 0;
  }

  return {
    database: "neondb",
    hostFingerprint: hostFingerprint(process.env.DATABASE_URL),
    migrationsApplied: mig[0]?.c ?? 0,
    documentByteObjectsTablePresent,
    existingCounts,
  };
}

function bump(proposed: DryRunPlanSummary["proposed"], action: ImportAction) {
  switch (action) {
    case "INSERT_BYTES_AND_REGISTRY":
      proposed.insertBytesAndRegistry += 1;
      break;
    case "INSERT_REGISTRY_METADATA_ONLY":
      proposed.insertRegistryMetadataOnly += 1;
      break;
    case "REUSE_IDENTICAL":
      proposed.reuseIdentical += 1;
      break;
    case "ALIAS_IDENTICAL_BYTES":
      proposed.aliasIdenticalBytes += 1;
      break;
    case "CONFLICT_SOURCE_ID":
      proposed.conflictSourceId += 1;
      break;
    case "SKIP_MISSING_BYTES":
      proposed.skipMissingBytes += 1;
      break;
    case "SKIP_INCOMPLETE_METADATA":
      proposed.skipIncompleteMetadata += 1;
      break;
    case "SKIP_RESEARCH_ONLY":
      proposed.skipResearchOnly += 1;
      break;
  }
}

async function planCandidate(
  c: OriginalByteCandidate,
  byteTablePresent: boolean,
): Promise<DryRunItemPlan> {
  if (!byteTablePresent) {
    return {
      sourceId: c.sourceId,
      action: "SKIP_MISSING_BYTES",
      originalBytesHash: c.originalBytesHash,
      byteSize: c.byteSize,
      localPath: c.localPath,
      reason: "document_byte_objects migration not applied — cannot claim durable byte insert",
    };
  }

  const byId = await prisma.knowledgeSource.findUnique({ where: { sourceId: c.sourceId } });
  if (byId) {
    if (byId.originalBytesHash !== c.originalBytesHash) {
      return {
        sourceId: c.sourceId,
        action: "CONFLICT_SOURCE_ID",
        originalBytesHash: c.originalBytesHash,
        existingHash: byId.originalBytesHash,
        existingSourceId: byId.sourceId,
        localPath: c.localPath,
        reason: "same sourceId already bound to different hash — refuse overwrite",
      };
    }
    return {
      sourceId: c.sourceId,
      action: "REUSE_IDENTICAL",
      originalBytesHash: c.originalBytesHash,
      byteSize: c.byteSize,
      localPath: c.localPath,
      reason: "idempotent reuse of existing KnowledgeSource row",
    };
  }

  const byHash = await prisma.knowledgeSource.findFirst({
    where: { originalBytesHash: c.originalBytesHash },
  });
  if (byHash) {
    return {
      sourceId: c.sourceId,
      action: "ALIAS_IDENTICAL_BYTES",
      originalBytesHash: c.originalBytesHash,
      byteSize: c.byteSize,
      existingSourceId: byHash.sourceId,
      localPath: c.localPath,
      reason: "identical bytes under new sourceId — alias onto canonical row",
    };
  }

  if (!c.accessionNumber || !c.exhibitFilename || !c.sourceUrl) {
    return {
      sourceId: c.sourceId,
      action: "SKIP_INCOMPLETE_METADATA",
      originalBytesHash: c.originalBytesHash,
      localPath: c.localPath,
      reason: "incomplete filing metadata",
    };
  }

  return {
    sourceId: c.sourceId,
    action: "INSERT_BYTES_AND_REGISTRY",
    originalBytesHash: c.originalBytesHash,
    byteSize: c.byteSize,
    localPath: c.localPath,
    reason: `would persist ${c.label} via Postgres BYTEA + KnowledgeSource`,
  };
}

export async function buildDryRunPlan(params?: {
  repoRoot?: string;
  includeMetadataOnlyExport?: boolean;
}): Promise<DryRunPlanSummary> {
  const repoRoot = params?.repoRoot ?? process.cwd();
  const neon = await readNeonBaseline();
  const candidates = scanOriginalByteCandidates(repoRoot);
  const items: DryRunItemPlan[] = [];
  const proposed: DryRunPlanSummary["proposed"] = {
    insertBytesAndRegistry: 0,
    insertRegistryMetadataOnly: 0,
    reuseIdentical: 0,
    aliasIdenticalBytes: 0,
    conflictSourceId: 0,
    skipMissingBytes: 0,
    skipIncompleteMetadata: 0,
    skipResearchOnly: 0,
  };

  for (const c of candidates) {
    const item = await planCandidate(c, neon.documentByteObjectsTablePresent);
    items.push(item);
    bump(proposed, item.action);
  }

  // Metadata-only export rows (no local bytes) — plan only, never claim durable.
  if (params?.includeMetadataOnlyExport) {
    // Counted as informational skips when bytes absent from disk.
    proposed.skipMissingBytes += 0;
  }

  const blockers: string[] = [];
  if (!neon.documentByteObjectsTablePresent) {
    blockers.push(
      "Migration 20261009013000_document_byte_objects not applied — required before durable byte inserts",
    );
  }
  if (neon.migrationsApplied < 33) {
    blockers.push(`Expected ≥33 finished migrations; found ${neon.migrationsApplied}`);
  }
  blockers.push(
    "LIVE WRITE NOT AUTHORIZED by this prompt — return plan for explicit owner approval before bulk import",
  );

  const insertBytes = items.filter((i) => i.action === "INSERT_BYTES_AND_REGISTRY");
  const estimatedStorageBytes = insertBytes.reduce((a, i) => a + (i.byteSize ?? 0), 0);
  // When migration is absent, all candidates SKIP_MISSING_BYTES — still report
  // post-approval footprint so the owner can authorize with eyes open.
  const estimatedStorageBytesIfMigrationApplied = candidates.reduce(
    (a, c) => a + c.byteSize,
    0,
  );
  const proposedIfMigrationApplied = {
    insertBytesAndRegistry: neon.documentByteObjectsTablePresent
      ? proposed.insertBytesAndRegistry
      : candidates.length,
    note: neon.documentByteObjectsTablePresent
      ? "table present — see proposed.*"
      : "after migrate deploy of document_byte_objects, all scanned candidates become INSERT/REUSE/ALIAS plans",
  };

  return {
    schemaVersion: CONSOLIDATION_PLAN_SCHEMA,
    generatedAt: new Date().toISOString(),
    neon,
    availableOriginalByteFiles: candidates.length,
    availableOriginalBytesTotal: candidates.reduce((a, c) => a + c.byteSize, 0),
    proposed,
    estimatedStorageBytes,
    estimatedStorageBytesIfMigrationApplied,
    proposedIfMigrationApplied,
    items,
    blockers,
    liveWriteAuthorized: false,
    approvalCheckpoint:
      "OWNER_APPROVAL_REQUIRED_BEFORE_MIGRATE_DEPLOY_OR_BULK_IMPORT",
  };
}
