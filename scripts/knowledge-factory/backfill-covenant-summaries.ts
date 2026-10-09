/**
 * Backfill covenant summaries into KnowledgeSource.metadata for Neon rows
 * that already have durable bytes (uses local mass-precedent corpus or re-analyze from Neon bytes).
 *
 * Deterministic-only: processAcquiredDocument never calls paid inference APIs.
 *
 *   npm run kf:backfill-covenant-summaries
 *   npm run kf:backfill-covenant-summaries -- --force-thin-defs --limit=50
 *   npm run kf:backfill-covenant-summaries -- --missing-only
 */
import { prisma } from "../../lib/prisma";
import { loadDurableSourceBytes } from "../../lib/knowledge-factory/preservation/durable-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { openMassPrecedentCorpus } from "../../lib/knowledge-factory/mass-precedent/corpus-paths";
import { writePrecedentRetrievalIndex } from "../../lib/knowledge-factory/mass-precedent/retrieval-index";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import path from "node:path";

const FINANCING_CLASSES = new Set([
  "CREDIT_AGREEMENT",
  "TERM_LOAN_AGREEMENT",
  "REVOLVING_CREDIT_AGREEMENT",
  "INDENTURE",
  "ABL_AGREEMENT",
  "AMENDED_AND_RESTATED_AGREEMENT",
]);

function argInt(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function analysisDefs(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return -1;
  const analysis = (metadata as { analysis?: { definitions?: unknown } }).analysis;
  return typeof analysis?.definitions === "number" ? analysis.definitions : -1;
}

/** Large financing docs whose prior definition discovery under-counted (curly-quote / shall-mean / HTML-entity defect). */
function isThinDefinitionDefect(row: {
  documentClass: string | null;
  byteSize: number | null;
  metadata: unknown;
}): boolean {
  if (!FINANCING_CLASSES.has(row.documentClass ?? "")) return false;
  if ((row.byteSize ?? 0) < 150_000) return false;
  const defs = analysisDefs(row.metadata);
  if (!(defs >= 0 && defs < 50)) return false;
  // Skip chronic thins already refreshed under the entity-aware definition scanner.
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    const refresh = (row.metadata as { definitionRefresh?: { scanner?: string; defs?: number } }).definitionRefresh;
    if (refresh?.scanner === "definition-scan.v2-entities" && refresh.defs === defs) {
      return false;
    }
  }
  return true;
}

async function main() {
  const limit = argInt("--limit", 10_000);
  const onlyCustomer = process.argv.includes("--customer-only");
  const force = process.argv.includes("--force");
  const forceThinDefs = process.argv.includes("--force-thin-defs");
  const missingOnly = process.argv.includes("--missing-only") || (!force && !forceThinDefs);
  const rows = await prisma.knowledgeSource.findMany({
    where: {
      storageRef: { not: null },
      ...(onlyCustomer ? { companyId: { not: null } } : {}),
    },
    orderBy: [{ byteSize: "desc" }, { sourceId: "asc" }],
    take: forceThinDefs || missingOnly ? 50_000 : limit,
  });
  const store = openMassPrecedentCorpus();
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let considered = 0;

  for (const row of rows) {
    if (updated + failed >= limit && (forceThinDefs || missingOnly)) break;
    const existing = summarizeFromStoredMetadata(row.metadata);
    const isV2 =
      existing &&
      typeof existing === "object" &&
      (existing as { schemaVersion?: string }).schemaVersion === "product.covenant-summary.v2";
    const hasUsableSummary = !!(existing && existing.items.length > 0 && isV2);
    const thinDefect = isThinDefinitionDefect(row);

    if (force) {
      // reprocess everything in the fetch window
    } else if (forceThinDefs) {
      if (!thinDefect) {
        skipped += 1;
        continue;
      }
    } else if (missingOnly) {
      if (hasUsableSummary) {
        skipped += 1;
        continue;
      }
    } else if (hasUsableSummary) {
      skipped += 1;
      continue;
    }

    considered += 1;
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
              definitionRefresh: {
                scanner: "definition-scan.v2-entities",
                defs: processed.definitionCount,
                candidates: processed.candidateCount,
                at: new Date().toISOString(),
                paidInferenceCalls: 0,
              },
              promotedToLegalTruth: 0,
            }),
          ),
        },
      });
      updated += 1;
      console.log(
        `OK ${row.sourceId} defs=${processed.definitionCount} candidates=${processed.candidateCount} summaryItems=${summary.items.length}${thinDefect ? " thin-defs-refresh" : ""}`,
      );
    } catch (err) {
      failed += 1;
      console.warn(`FAIL ${row.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  writePrecedentRetrievalIndex(
    store,
    path.join(process.cwd(), "docs/knowledge-factory/mass-precedent/retrieval-index.json"),
  );
  console.log(
    JSON.stringify(
      {
        mode: force ? "force" : forceThinDefs ? "force-thin-defs" : missingOnly ? "missing-only" : "default",
        fetched: rows.length,
        considered,
        updated,
        skipped,
        failed,
        paidInferenceCalls: 0,
        promotedToLegalTruth: 0,
      },
      null,
      2,
    ),
  );
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
