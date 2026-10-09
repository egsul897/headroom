/**
 * Import CBCFL phase-2 EDGAR acquisitions (authentic source.html) into Neon BYTEA + KnowledgeSource,
 * then run structural analysis + v2 covenant summaries.
 *
 * Idempotent on content hash / sourceId. Non-destructive.
 *
 *   npx tsx scripts/knowledge-factory/import-cbcfl-acquisitions.ts
 *   npx tsx scripts/knowledge-factory/import-cbcfl-acquisitions.ts --limit=5
 *   npx tsx scripts/knowledge-factory/import-cbcfl-acquisitions.ts --analyze-only
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { persistDurableKnowledgeSource } from "../../lib/knowledge-factory/preservation/durable-store";
import { openMassPrecedentCorpus } from "../../lib/knowledge-factory/mass-precedent/corpus-paths";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { isSubstantiveFinancingPrecedent } from "../../lib/product/covenant-intelligence/corpus-quality";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

const ROOT = path.join(
  process.cwd(),
  "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions",
);

function argInt(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function sourceIdFrom(doc: {
  accession?: string;
  filename?: string;
  docId: string;
  sourceUrl?: string;
}): string {
  if (doc.accession && doc.filename) {
    return `edgar:${doc.accession}:${doc.filename}`;
  }
  const m = (doc.sourceUrl ?? "").match(/\/(\d{10})\/(\d{18})\//);
  if (m && doc.filename) {
    const acc = `${m[2]!.slice(0, 10)}-${m[2]!.slice(10, 12)}-${m[2]!.slice(12)}`;
    return `edgar:${acc}:${doc.filename}`;
  }
  return `cbcfl:${doc.docId}`;
}

async function main() {
  const limit = argInt("--limit", 50);
  const analyzeOnly = process.argv.includes("--analyze-only");
  const manPath = path.join(ROOT, "acquisition-manifest.json");
  if (!existsSync(manPath)) {
    console.error("missing acquisition-manifest.json");
    process.exit(1);
  }
  const man = JSON.parse(readFileSync(manPath, "utf8")) as {
    documents: Array<{
      docId: string;
      ticker?: string;
      issuer?: string;
      cik?: string;
      accession?: string;
      filingDate?: string;
      form?: string;
      filename?: string;
      description?: string;
      sourceUrl?: string;
      relativeDir: string;
      bodySha256: string;
    }>;
  };

  const store = openMassPrecedentCorpus();
  let persisted = 0;
  let reused = 0;
  let analyzed = 0;
  let skippedNonFinancing = 0;
  let failed = 0;

  for (const doc of man.documents.slice(0, limit)) {
    const dir = path.join(process.cwd(), doc.relativeDir);
    const htmlPath = path.join(dir, "source.html");
    if (!existsSync(htmlPath)) {
      failed += 1;
      console.warn(`FAIL missing ${htmlPath}`);
      continue;
    }
    const bytes = readFileSync(htmlPath);
    const hash = sha256(bytes);
    if (hash !== doc.bodySha256) {
      console.warn(`WARN hash mismatch ${doc.docId}: manifest=${doc.bodySha256} actual=${hash}`);
    }
    const sourceId = sourceIdFrom(doc);
    const title = doc.description || doc.filename || doc.docId;
    const substantive = isSubstantiveFinancingPrecedent({
      sourceId,
      documentTitle: title,
      documentClass: "CREDIT_AGREEMENT",
      exhibitFilename: doc.filename ?? "source.html",
      provenance: "cbcfl-phase2-edgar-acquisition",
      byteSize: bytes.length,
    });
    if (!substantive) {
      skippedNonFinancing += 1;
      console.log(`SKIP non-financing ${sourceId}`);
      continue;
    }

    const source: KnowledgeSourceRecord = {
      sourceId,
      issuerCik: doc.cik ?? "0000000000",
      issuerTicker: doc.ticker,
      issuerName: doc.issuer,
      accessionNumber: doc.accession ?? sourceId,
      exhibitFilename: doc.filename ?? "source.html",
      sourceUrl: doc.sourceUrl ?? `fixture://${sourceId}`,
      filingDate: (doc.filingDate ?? "1970-01-01").slice(0, 10),
      formType: doc.form ?? "8-K",
      documentTitle: title,
      documentClass: "CREDIT_AGREEMENT",
      originalBytesHash: hash,
      acquisitionTimestamp: new Date().toISOString(),
      parserVersion: "cbcfl-import-v1",
      extractionStatus: "ACQUIRED",
      representationLevel: "SOURCE_ONLY",
      provenance: "cbcfl-phase2-edgar-acquisition",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    };

    try {
      let canonicalSourceId = sourceId;
      if (!analyzeOnly) {
        const persist = await persistDurableKnowledgeSource({
          source,
          bytes,
          contentType: "text/html",
        });
        canonicalSourceId = persist.sourceId;
        if (persist.reusedExisting) reused += 1;
        else persisted += 1;
        console.log(
          `${persist.reusedExisting ? "REUSE" : "NEW"} requested=${sourceId} canonical=${persist.sourceId} bytes=${persist.byteLength}`,
        );
      } else {
        const byHash = await prisma.knowledgeSource.findFirst({ where: { originalBytesHash: hash } });
        if (byHash) canonicalSourceId = byHash.sourceId;
      }

      // Analyze under the canonical Neon sourceId so summaries bind to the durable row.
      const processed = await processAcquiredDocument(store, {
        discovered: {
          sourceId: canonicalSourceId,
          filing: {
            accessionNumber: source.accessionNumber,
            formType: source.formType,
            filingDate: source.filingDate,
            issuer: {
              cik: source.issuerCik,
              ticker: source.issuerTicker,
              name: source.issuerName,
            },
          },
          exhibit: {
            filename: source.exhibitFilename,
            description: source.documentTitle,
            exhibitType: "EX-10",
            sourceUrl: source.sourceUrl,
          },
          discoverySignals: ["cbcfl-import"],
        },
        bytes,
        contentHash: hash,
        provenance: source.provenance,
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      });

      const summary = buildDocumentCovenantSummary({
        sourceId: canonicalSourceId,
        documentTitle: processed.source.documentTitle || source.documentTitle,
        issuerName: processed.source.issuerName ?? source.issuerName,
        issuerCik: source.issuerCik,
        documentClass: processed.source.documentClass,
        candidates: store.loadCandidates(canonicalSourceId),
        definitions: store.loadDefinitions(canonicalSourceId),
        structuralNodes: store.loadStructuralNodes(canonicalSourceId),
        crossReferences: store.loadCrossReferences(canonicalSourceId),
      });

      const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: canonicalSourceId } });
      if (row) {
        const prev =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
        await prisma.knowledgeSource.update({
          where: { sourceId: canonicalSourceId },
          data: {
            documentClass: processed.source.documentClass as never,
            extractionStatus: processed.source.extractionStatus as never,
            representationLevel: processed.source.representationLevel as never,
            issuerName: row.issuerName ?? source.issuerName ?? undefined,
            issuerTicker: row.issuerTicker ?? source.issuerTicker ?? undefined,
            documentTitle: row.documentTitle || source.documentTitle,
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
                cbcflDocId: doc.docId,
              }),
            ),
          },
        });
        analyzed += 1;
        console.log(`OK analyze ${canonicalSourceId} summaries=${summary.items.length}`);
      } else {
        console.warn(`WARN no Neon row for canonical ${canonicalSourceId}`);
      }
    } catch (err) {
      failed += 1;
      console.warn(`FAIL ${sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const total = await prisma.knowledgeSource.count();
  console.log(
    JSON.stringify(
      { persisted, reused, analyzed, skippedNonFinancing, failed, knowledgeSourcesTotal: total },
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
