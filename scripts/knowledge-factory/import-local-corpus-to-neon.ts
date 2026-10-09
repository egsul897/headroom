/**
 * Persist sources from the default local CorpusStore (.local-knowledge-corpus)
 * into Neon BYTEA + KnowledgeSource, with v2 covenant summaries.
 *
 *   npx tsx scripts/knowledge-factory/import-local-corpus-to-neon.ts
 *   npx tsx scripts/knowledge-factory/import-local-corpus-to-neon.ts --limit=50
 */
import { prisma } from "../../lib/prisma";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { persistDurableKnowledgeSource } from "../../lib/knowledge-factory/preservation/durable-store";
import { openMassPrecedentCorpus } from "../../lib/knowledge-factory/mass-precedent/corpus-paths";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { isSubstantiveFinancingPrecedent } from "../../lib/product/covenant-intelligence/corpus-quality";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

function argInt(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const limit = argInt("--limit", 200);
  const local = new CorpusStore(defaultCorpusPaths());
  const mass = openMassPrecedentCorpus();
  const sources = local.listSources().slice(0, limit);

  let persisted = 0;
  let reused = 0;
  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  for (const source of sources) {
    if (!source?.sourceId || !source.originalBytesHash) {
      skipped += 1;
      continue;
    }
    const bytes = local.readBytes(source.originalBytesHash);
    if (!bytes) {
      failed += 1;
      console.warn(`FAIL missing bytes ${source.sourceId}`);
      continue;
    }
    const substantive = isSubstantiveFinancingPrecedent({
      sourceId: source.sourceId,
      documentTitle: source.documentTitle,
      documentClass: source.documentClass,
      exhibitFilename: source.exhibitFilename,
      provenance: source.provenance,
      byteSize: bytes.length,
    });
    if (!substantive) {
      skipped += 1;
      console.log(`SKIP non-financing ${source.sourceId}`);
      continue;
    }

    try {
      const persist = await persistDurableKnowledgeSource({
        source: {
          ...source,
          usageRightsReviewStatus: source.usageRightsReviewStatus ?? "PUBLIC_SEC_EDGAR",
        },
        bytes,
        contentType: "text/html",
      });
      if (persist.reusedExisting) reused += 1;
      else persisted += 1;

      const canonical = persist.sourceId;
      const processed = await processAcquiredDocument(mass, {
        discovered: {
          sourceId: canonical,
          filing: {
            accessionNumber: source.accessionNumber,
            formType: source.formType,
            filingDate: source.filingDate,
            issuer: {
              cik: source.issuerCik,
              ticker: source.issuerTicker ?? undefined,
              name: source.issuerName ?? undefined,
            },
          },
          exhibit: {
            filename: source.exhibitFilename,
            description: source.documentTitle,
            exhibitType: "EX-10",
            sourceUrl: source.sourceUrl,
          },
          discoverySignals: ["local-corpus-import"],
        },
        bytes,
        contentHash: source.originalBytesHash,
        provenance: source.provenance,
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      });

      const summary = buildDocumentCovenantSummary({
        sourceId: canonical,
        documentTitle: processed.source.documentTitle || source.documentTitle,
        issuerName: processed.source.issuerName ?? source.issuerName ?? undefined,
        issuerCik: source.issuerCik,
        documentClass: processed.source.documentClass,
        candidates: mass.loadCandidates(canonical),
        definitions: mass.loadDefinitions(canonical),
        structuralNodes: mass.loadStructuralNodes(canonical),
        crossReferences: mass.loadCrossReferences(canonical),
      });

      const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: canonical } });
      if (!row) {
        failed += 1;
        continue;
      }
      const prev =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      await prisma.knowledgeSource.update({
        where: { sourceId: canonical },
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
      analyzed += 1;
      console.log(
        `${persist.reusedExisting ? "REUSE" : "NEW"} ${canonical} class=${processed.source.documentClass} summaries=${summary.items.length}`,
      );
    } catch (err) {
      failed += 1;
      console.warn(`FAIL ${source.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const total = await prisma.knowledgeSource.count();
  const issuers = await prisma.knowledgeSource.findMany({
    where: { companyId: null },
    select: { issuerCik: true },
    distinct: ["issuerCik"],
  });
  console.log(
    JSON.stringify(
      {
        sources: sources.length,
        persisted,
        reused,
        analyzed,
        skipped,
        failed,
        knowledgeSourcesTotal: total,
        issuers: issuers.length,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
