/**
 * Build controlled batch plans (100 → 500 → 1000).
 * Committed authentic bytes first; network fetch only when --include-network.
 * Never claims bytes from URL-only locators.
 */

import { prisma } from "../../prisma";
import { buildMassPrecedentInventory } from "./inventory";
import {
  MASS_PRECEDENT_PLAN_SCHEMA,
  type AnalysisStage,
  type BatchPlanItem,
  type MassPrecedentBatchPlan,
} from "./types";

const DEFAULT_STAGES: AnalysisStage[] = [
  "STRUCTURAL_INDEX",
  "DEFINITIONS",
  "COVENANT_DISCOVERY",
  "DEPENDENCY_MAP",
  "AMENDMENT_RELATION",
  "CONSUMER_EXPORT",
];

async function neonSnapshot(): Promise<MassPrecedentBatchPlan["neon"]> {
  const mig = await prisma.$queryRawUnsafe<{ c: number }[]>(
    `select count(*)::int as c from "_prisma_migrations" where finished_at is not null`,
  );
  const reg = await prisma.$queryRawUnsafe<{ t: string | null }[]>(
    `select to_regclass('public.document_byte_objects')::text as t`,
  );
  return {
    migrationsApplied: mig[0]?.c ?? 0,
    documentByteObjectsTablePresent: Boolean(reg[0]?.t),
    knowledgeSources: await prisma.knowledgeSource.count(),
    companies: await prisma.company.count(),
    financialSnapshots: await prisma.financialSnapshot.count(),
  };
}

export async function buildMassPrecedentBatchPlan(params?: {
  repoRoot?: string;
  batchSize?: number;
  milestone?: MassPrecedentBatchPlan["milestone"];
  /** Include network fetch candidates in the plan (still dry-run / gated). */
  includeNetworkFetch?: boolean;
}): Promise<MassPrecedentBatchPlan> {
  const repoRoot = params?.repoRoot ?? process.cwd();
  const batchSize = params?.batchSize ?? 100;
  const milestone = params?.milestone ?? "batch-100";
  const includeNetwork = Boolean(params?.includeNetworkFetch);
  const neon = await neonSnapshot();
  const inventory = buildMassPrecedentInventory(repoRoot);

  const existingHashes = new Set<string>();
  if (neon.knowledgeSources > 0) {
    const rows = await prisma.knowledgeSource.findMany({
      select: { sourceId: true, originalBytesHash: true, storageRef: true },
    });
    for (const r of rows) {
      if (r.storageRef) existingHashes.add(r.originalBytesHash);
    }
  }

  const items: BatchPlanItem[] = [];
  const proposed: MassPrecedentBatchPlan["proposed"] = {
    persistCommittedBytes: 0,
    fetchThenPersist: 0,
    analyzeOnly: 0,
    skipNoBytes: 0,
    skipFalsePositive: 0,
    skipAlreadyPersisted: 0,
  };

  const eligible = inventory.items.filter((i) => i.corpusRole !== "FALSE_POSITIVE_EXHIBIT");

  for (const item of eligible) {
    if (items.length >= batchSize) break;

    if (item.originalBytesHash && existingHashes.has(item.originalBytesHash)) {
      items.push({
        sourceId: item.sourceId,
        action: "SKIP_ALREADY_PERSISTED",
        reason: "identical contentHash already bound in KnowledgeSource with storageRef",
        originalBytesHash: item.originalBytesHash,
        byteSize: item.byteSize,
      });
      proposed.skipAlreadyPersisted += 1;
      continue;
    }

    if (item.channel === "COMMITTED_BYTES" && item.evidenceStatus === "BYTES_ON_DISK") {
      // Always schedule persist of committed bytes in the plan; live import remains gated.
      // When migration is absent, reason states the blocker — action still names the intent.
      items.push({
        sourceId: item.sourceId,
        action: "PERSIST_COMMITTED_BYTES",
        reason: neon.documentByteObjectsTablePresent
          ? "Committed authentic HTML available on disk — ready after LIVE WRITE approval"
          : "Committed authentic HTML on disk — blocked until document_byte_objects migration + approval",
        byteSize: item.byteSize,
        originalBytesHash: item.originalBytesHash,
      });
      proposed.persistCommittedBytes += 1;
      continue;
    }

    if (includeNetwork && item.channel === "MANIFEST_URL_ONLY" && item.archivesUrl) {
      items.push({
        sourceId: item.sourceId,
        action: "FETCH_THEN_PERSIST",
        reason:
          "Manifest locator — SEC fetch under HEADROOM_SEC_FETCH_OWNER=WS-CKF after migrate + LIVE WRITE approval",
        byteSize: item.byteSize,
        originalBytesHash: item.originalBytesHash,
        archivesUrl: item.archivesUrl,
      });
      proposed.fetchThenPersist += 1;
      continue;
    }

    if (item.channel === "MANIFEST_URL_ONLY") {
      // Do not fill the batch with skips — leave room for committed/network actions.
      // Count separately only when we still have capacity and want visibility.
      continue;
    }
  }

  // Pad visibility: if batch not full and network not included, note remaining capacity.
  const remainingCapacity = batchSize - items.length;
  if (!includeNetwork && remainingCapacity > 0) {
    const urlOnly = eligible.filter((i) => i.channel === "MANIFEST_URL_ONLY").slice(0, remainingCapacity);
    for (const item of urlOnly) {
      items.push({
        sourceId: item.sourceId,
        action: "SKIP_NO_BYTES",
        reason:
          "HASH_AND_URL_ONLY — excluded from committed-first batch; pass --include-network after approval to schedule SEC fetch",
        byteSize: item.byteSize,
        originalBytesHash: item.originalBytesHash,
        archivesUrl: item.archivesUrl,
      });
      proposed.skipNoBytes += 1;
    }
  }

  const estimatedStorageBytes = items
    .filter((i) => i.action === "PERSIST_COMMITTED_BYTES" || i.action === "FETCH_THEN_PERSIST")
    .reduce((a, i) => a + (i.byteSize ?? 0), 0);

  const blockers: string[] = [];
  if (!neon.documentByteObjectsTablePresent) {
    blockers.push(
      "Deploy migrations 20261009013000_document_byte_objects + 20261009020000_knowledge_import_batches before durable persist",
    );
  }
  blockers.push("LIVE WRITE NOT AUTHORIZED — stop for owner approval before migrate/bulk precedent backfill");
  if (includeNetwork) {
    blockers.push("Network fetch requires HEADROOM_SEC_FETCH_OWNER=WS-CKF and SEC-compliant ≤10 req/s");
  }

  return {
    schemaVersion: MASS_PRECEDENT_PLAN_SCHEMA,
    generatedAt: new Date().toISOString(),
    batchSize,
    milestone,
    liveWriteAuthorized: false,
    neon,
    inventorySummary: {
      committedBytesAvailable: inventory.summary.committedBytesAvailable,
      committedBytesTotal: inventory.summary.committedBytesTotal,
      manifestUrlOnly: inventory.summary.manifestUrlOnly,
      financingLocators: inventory.summary.financingLocators,
      distinctIssuersInManifest: inventory.summary.distinctIssuersInManifest,
    },
    proposed,
    estimatedStorageBytes,
    estimatedSecRequests: proposed.fetchThenPersist,
    rateLimitNotes: [
      "SEC fair-access: identifying User-Agent required (SEC_EDGAR_USER_AGENT)",
      "Process rate ≤10 req/s; prefer serial ownership via HEADROOM_SEC_FETCH_OWNER=WS-CKF",
      "Use SecHttpClient cache; retries with exponential backoff",
      "Do not start unbounded crawling or paid AI workloads",
    ],
    items,
    analysisStages: DEFAULT_STAGES,
    approvalCheckpoint: "OWNER_APPROVAL_REQUIRED_BEFORE_MIGRATE_OR_BULK_PRECEDENT_BACKFILL",
    blockers,
  };
}
