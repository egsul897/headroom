/**
 * Analyze committed authentic bytes into persistent mass-precedent corpus + index.
 *
 *   npm run kf:mass-precedent-analyze -- --all
 *   npm run kf:mass-precedent-analyze -- --limit=10
 *   npm run kf:mass-precedent-analyze -- --source-id=edgar:...
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scanOriginalByteCandidates } from "../../lib/knowledge-factory/consolidation";
import {
  analyzeCommittedSource,
  analyzeBatchCommitted,
  openMassPrecedentCorpus,
  writePrecedentRetrievalIndex,
} from "../../lib/knowledge-factory/mass-precedent";

const OUT_DIR = "docs/knowledge-factory/mass-precedent";

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const sourceId = argValue("--source-id");
  const all = argFlag("--all");
  const limitRaw = argValue("--limit");
  const limit = all ? Number.POSITIVE_INFINITY : Number(limitRaw ?? "5");

  mkdirSync(path.join(OUT_DIR, "runs"), { recursive: true });

  if (sourceId) {
    const r = await analyzeCommittedSource({ sourceId });
    const store = openMassPrecedentCorpus();
    const index = writePrecedentRetrievalIndex(store, path.join(OUT_DIR, "retrieval-index.json"));
    console.log(
      JSON.stringify(
        { sourceId, ok: r.ok, counts: r.counts, processingMs: r.processingMs, indexTotals: index.totals },
        null,
        2,
      ),
    );
    return;
  }

  const candidates = scanOriginalByteCandidates()
    .slice()
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const ids = (
    Number.isFinite(limit) ? candidates.slice(0, limit) : candidates
  ).map((c) => c.sourceId);

  const started = Date.now();
  const summary = await analyzeBatchCommitted({ sourceIds: ids });
  const wallMs = Date.now() - started;

  const store = openMassPrecedentCorpus();
  const index = writePrecedentRetrievalIndex(store, path.join(OUT_DIR, "retrieval-index.json"));

  const board = {
    schemaVersion: "knowledge-factory.mass-precedent-analyze-summary.v1",
    generatedAt: new Date().toISOString(),
    ...summary,
    wallClockMs: wallMs,
    throughputDocsPerMinute:
      wallMs > 0 ? Number(((summary.analyzed * 60_000) / wallMs).toFixed(2)) : 0,
    sourceIds: ids,
    indexTotals: index.totals,
    familyHistogram: index.familyHistogram,
    documentClassHistogram: index.documentClassHistogram,
    note: "Local corpus under .local-knowledge-corpus/mass-precedent. Neon persist awaits migrate + LIVE WRITE approval. promotedToLegalTruth=0.",
  };
  writeFileSync(path.join(OUT_DIR, "analyze-summary.json"), JSON.stringify(board, null, 2) + "\n");
  writeFileSync(
    path.join(OUT_DIR, "operational-dashboard.json"),
    JSON.stringify(
      {
        schemaVersion: "knowledge-factory.mass-precedent-ops.v1",
        generatedAt: board.generatedAt,
        authenticDocumentsAcquiredOnDisk: candidates.length,
        originalDocumentsPersistedInNeon: 0,
        distinctIssuersIndexed: index.totals.distinctIssuers,
        definitionsExtracted: index.totals.definitions,
        covenantProvisionsExtracted: index.totals.covenantCandidates,
        basketFamiliesSeen: Object.keys(index.familyHistogram).filter((k) =>
          /BASKET|AVAILABLE_AMOUNT|SHARED_CAPACITY/i.test(k),
        ).length,
        dependencyCrossReferences: index.totals.crossReferences,
        amendmentsLinked: index.totals.amendmentRelationships,
        precedentsIndexedAndSearchable: index.totals.sources,
        failedDocumentsAwaitingRetry: summary.failed,
        storageUsedLocalBytes: candidates.reduce((a, c) => a + c.byteSize, 0),
        storageUsedNeonBytes: 0,
        actualProcessingThroughputDocsPerMinute: board.throughputDocsPerMinute,
        workingApplicationIntegration: ["/research/corpus"],
        neonBlocker: "OWNER_APPROVAL_REQUIRED_BEFORE_MIGRATE_OR_BULK_PRECEDENT_BACKFILL",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(board, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
