/**
 * Backfill covenant summaries into KnowledgeSource.metadata for Neon rows
 * that already have durable bytes (uses local mass-precedent corpus or re-analyze from Neon bytes).
 *
 *   npm run kf:backfill-covenant-summaries
 */
import { prisma } from "../../lib/prisma";
import { loadDurableSourceBytes } from "../../lib/knowledge-factory/preservation/durable-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { openMassPrecedentCorpus } from "../../lib/knowledge-factory/mass-precedent/corpus-paths";
import { writePrecedentRetrievalIndex } from "../../lib/knowledge-factory/mass-precedent/retrieval-index";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import path from "node:path";

function argInt(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const limit = argInt("--limit", 10_000);
  const onlyCustomer = process.argv.includes("--customer-only");
  const rows = await prisma.knowledgeSource.findMany({
    where: {
      storageRef: { not: null },
      ...(onlyCustomer ? { companyId: { not: null } } : {}),
    },
    orderBy: { sourceId: "asc" },
    take: limit,
  });
  const store = openMassPrecedentCorpus();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const existing = summarizeFromStoredMetadata(row.metadata);
    const force = process.argv.includes("--force");
    const isV2 =
      existing &&
      typeof existing === "object" &&
      (existing as { schemaVersion?: string }).schemaVersion === "product.covenant-summary.v2";
    if (!force && existing && existing.items.length > 0 && isV2) {
      skipped += 1;
      continue;
    }
    try {
      const { bytes } = await loadDurableSourceBytes({ sourceId: row.sourceId });
      const processed = await processAcquiredDocument(store, {
        discovered: {
          sourceId: row.sourceId,
          filing: {
            accessionNumber: row.accessionNumber,
            formType: row.formType,
            filingDate: row.filingDate.toISOString().slice(0, 10),
            issuer: {
              cik: row.issuerCik,
              ticker: row.issuerTicker ?? undefined,
              name: row.issuerName ?? undefined,
            },
          },
          exhibit: {
            filename: row.exhibitFilename,
            description: row.documentTitle,
            exhibitType: "EX-10",
            sourceUrl: row.sourceUrl,
          },
          discoverySignals: ["backfill-covenant-summaries"],
        },
        bytes,
        contentHash: row.originalBytesHash,
        provenance: row.provenance,
        usageRightsReviewStatus: row.usageRightsReviewStatus as "PUBLIC_SEC_EDGAR" | "FIXTURE_INTERNAL" | "UNREVIEWED",
      });

      const summary = buildDocumentCovenantSummary({
        sourceId: row.sourceId,
        documentTitle: processed.source.documentTitle || row.documentTitle,
        issuerName: processed.source.issuerName ?? row.issuerName ?? undefined,
        issuerCik: row.issuerCik,
        documentClass: processed.source.documentClass,
        candidates: store.loadCandidates(row.sourceId),
        definitions: store.loadDefinitions(row.sourceId),
        structuralNodes: store.loadStructuralNodes(row.sourceId),
        crossReferences: store.loadCrossReferences(row.sourceId),
      });

      const prev =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      await prisma.knowledgeSource.update({
        where: { sourceId: row.sourceId },
        data: {
          documentClass: processed.source.documentClass as never,
          extractionStatus: processed.source.extractionStatus as never,
          representationLevel: processed.source.representationLevel as never,
          metadata: JSON.parse(
            JSON.stringify({
              ...prev,
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
      updated += 1;
      console.log(`OK ${row.sourceId} candidates=${summary.items.length}`);
    } catch (err) {
      failed += 1;
      console.warn(`FAIL ${row.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  writePrecedentRetrievalIndex(
    store,
    path.join(process.cwd(), "docs/knowledge-factory/mass-precedent/retrieval-index.json"),
  );
  console.log(JSON.stringify({ total: rows.length, updated, skipped, failed }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
