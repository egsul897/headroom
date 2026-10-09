/**
 * Idempotent v2 covenant-summary backfill over persisted KnowledgeSources with BYTEA.
 *   npx tsx scripts/knowledge-factory/backfill-v2-summaries.ts --limit=200
 */
import { prisma } from "../../lib/prisma";
import { PostgresDocumentStorageProvider } from "../../lib/document-storage/postgres-bytea-provider";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function argInt(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  const n = hit ? Number(hit.slice(name.length + 1)) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const limit = argInt("--limit", 300);
  const force = process.argv.includes("--force");
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://x@localhost/x").hostname;
  const rows = await prisma.knowledgeSource.findMany({
    where: { storageRef: { not: null }, companyId: null },
    orderBy: { acquisitionTimestamp: "asc" },
    take: limit,
  });
  const provider = new PostgresDocumentStorageProvider();
  const stats = {
    host,
    eligible: rows.length,
    alreadyV2WithItems: 0,
    reanalyzed: 0,
    withItems: 0,
    emptyItems: 0,
    failed: 0,
  };

  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const cs = meta.covenantSummary as { schemaVersion?: string; items?: unknown[] } | undefined;
    if (
      !force &&
      cs?.schemaVersion === "product.covenant-summary.v2" &&
      Array.isArray(cs.items) &&
      cs.items.length > 0
    ) {
      stats.alreadyV2WithItems += 1;
      continue;
    }
    if (!row.storageRef) {
      stats.failed += 1;
      continue;
    }
    const workRoot = mkdtempSync(path.join(tmpdir(), "v2-backfill-"));
    try {
      const bytes = await provider.retrieve(row.storageRef);
      const store = new CorpusStore(defaultCorpusPaths(path.join(workRoot, "corpus")));
      const processed = await processAcquiredDocument(store, {
        discovered: {
          sourceId: row.sourceId,
          filing: {
            accessionNumber: row.accessionNumber,
            formType: row.formType,
            filingDate: row.filingDate.toISOString().slice(0, 10),
            issuer: { cik: row.issuerCik, ticker: row.issuerTicker ?? undefined, name: row.issuerName ?? undefined },
          },
          exhibit: {
            filename: row.exhibitFilename,
            description: row.documentTitle,
            exhibitType: "EX-10",
            sourceUrl: row.sourceUrl,
          },
          discoverySignals: ["v2-backfill"],
        },
        bytes,
        contentHash: row.originalBytesHash,
        provenance: row.provenance,
        usageRightsReviewStatus: row.usageRightsReviewStatus as never,
      });
      const summary = buildDocumentCovenantSummary({
        sourceId: row.sourceId,
        documentTitle: processed.source.documentTitle || row.documentTitle,
        issuerName: row.issuerName ?? undefined,
        issuerCik: row.issuerCik,
        documentClass: processed.source.documentClass,
        candidates: store.loadCandidates(row.sourceId),
        definitions: store.loadDefinitions(row.sourceId),
        structuralNodes: store.loadStructuralNodes(row.sourceId),
        crossReferences: store.loadCrossReferences(row.sourceId),
      });
      await prisma.knowledgeSource.update({
        where: { sourceId: row.sourceId },
        data: {
          documentClass: processed.source.documentClass as never,
          extractionStatus: processed.source.extractionStatus as never,
          representationLevel: processed.source.representationLevel as never,
          metadata: JSON.parse(
            JSON.stringify({
              ...meta,
              analysis: {
                structuralNodes: processed.structuralNodeCount,
                definitions: processed.definitionCount,
                covenantCandidates: processed.candidateCount,
                crossReferences: processed.crossReferenceCount,
              },
              covenantSummary: summary,
              promotedToLegalTruth: 0,
            }),
          ),
        },
      });
      stats.reanalyzed += 1;
      if (summary.items.length > 0) stats.withItems += 1;
      else stats.emptyItems += 1;
      console.log(`OK ${row.sourceId} defs=${processed.definitionCount} items=${summary.items.length}`);
    } catch (err) {
      stats.failed += 1;
      console.warn(`FAIL ${row.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  }

  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
