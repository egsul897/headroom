/**
 * Consume an EDGAR Historical Backfill acquisition-queue.json through CKF:
 * fetch → classify → durable Neon BYTEA (optional) → structural analysis → v2 summary.
 *
 *   npx tsx scripts/knowledge-factory/consume-ehb-queue.ts --queue=path/to/acquisition-queue.json
 *   npx tsx scripts/knowledge-factory/consume-ehb-queue.ts --queue=... --limit=20 --dry-run
 *   KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE npx tsx ... --persist-neon
 *
 * Does not invent a new crawler. Respects SEC rate limits via EdgarKnowledgeClient.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { EdgarKnowledgeClient } from "../../lib/knowledge-factory/edgar/client";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { persistDurableKnowledgeSource } from "../../lib/knowledge-factory/preservation/durable-store";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { isSubstantiveFinancingPrecedent } from "../../lib/product/covenant-intelligence/corpus-quality";
import { openMassPrecedentCorpus } from "../../lib/knowledge-factory/mass-precedent/corpus-paths";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";
import { prisma } from "../../lib/prisma";

const LIVE_ENV = "KF_MASS_PRECEDENT_LIVE_WRITE";
const LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}
function argInt(name: string, fallback: number): number {
  const v = arg(name);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

interface QueueDoc {
  sourceId?: string;
  queueId?: string;
  cik?: string;
  ticker?: string;
  issuerName?: string;
  accessionNumber?: string;
  exhibitFilename?: string;
  filename?: string;
  sourceUrl?: string;
  sourceUri?: string;
  filingDate?: string;
  formType?: string;
  documentTitle?: string;
  description?: string;
  documentClass?: string;
  documentKind?: string;
  fetchStatus?: string;
  resolutionStatus?: string;
  filing?: {
    accessionNumber?: string;
    formType?: string;
    filingDate?: string;
    issuer?: { cik?: string; ticker?: string; name?: string };
  };
  exhibit?: {
    filename?: string;
    description?: string;
    sourceUrl?: string;
  };
}

function coerceDoc(raw: Record<string, unknown>): QueueDoc {
  const d = raw as QueueDoc;
  return {
    ...d,
    sourceId: d.sourceId ?? (d.queueId ? `ehb:${d.queueId}` : undefined),
    cik: d.cik ?? d.filing?.issuer?.cik,
    ticker: d.ticker ?? d.filing?.issuer?.ticker,
    issuerName: d.issuerName ?? d.filing?.issuer?.name,
    accessionNumber: d.accessionNumber ?? d.filing?.accessionNumber,
    formType: d.formType ?? d.filing?.formType,
    filingDate: d.filingDate ?? d.filing?.filingDate,
    exhibitFilename: d.exhibitFilename ?? d.filename ?? d.exhibit?.filename,
    documentTitle: d.documentTitle ?? d.description ?? d.exhibit?.description,
    sourceUrl: d.sourceUrl ?? d.sourceUri ?? d.exhibit?.sourceUrl,
    documentClass: d.documentClass ?? d.documentKind,
  };
}

function normalizeQueue(raw: unknown): QueueDoc[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of ["documents", "queue", "items", "locators", "fetchable", "acquisitionQueue"]) {
      if (Array.isArray(o[key])) {
        arr = o[key] as unknown[];
        break;
      }
    }
  }
  return arr
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map(coerceDoc);
}

function sourceIdOf(d: QueueDoc): string {
  if (d.sourceId) return d.sourceId;
  if (d.queueId) return `ehb:${d.queueId}`;
  if (d.accessionNumber && d.exhibitFilename) return `edgar:${d.accessionNumber}:${d.exhibitFilename}`;
  const url = d.sourceUrl ?? "";
  const m = url.match(/\/(\d+)\/(\d{18})\/([^/?#]+)$/);
  if (m) {
    const acc = `${m[2]!.slice(0, 10)}-${m[2]!.slice(10, 12)}-${m[2]!.slice(12)}`;
    return `edgar:${acc}:${m[3]}`;
  }
  return `ehb:${createHash("sha256").update(url || JSON.stringify(d)).digest("hex").slice(0, 24)}`;
}

async function main() {
  const queuePath = arg("--queue");
  if (!queuePath || !existsSync(queuePath)) {
    console.error("Provide --queue=/path/to/acquisition-queue.json");
    process.exit(1);
  }
  const limitRaw = arg("--limit");
  const limit = limitRaw ? Number(limitRaw) : Number.POSITIVE_INFINITY;
  const dryRun = flag("--dry-run");
  const persistNeon = flag("--persist-neon");
  if (persistNeon && process.env[LIVE_ENV] !== LIVE_TOKEN) {
    console.error(`Refusing Neon persist without ${LIVE_ENV}=${LIVE_TOKEN}`);
    process.exit(2);
  }

  const raw = JSON.parse(readFileSync(queuePath, "utf8"));
  const allDocs = normalizeQueue(raw);
  const docs =
    Number.isFinite(limit) && limit > 0 ? allDocs.slice(0, limit) : allDocs;
  const local = new CorpusStore(defaultCorpusPaths());
  const mass = openMassPrecedentCorpus();
  const client = new EdgarKnowledgeClient({
    cacheDir: path.join(local.paths.cache, "sec"),
    logDir: path.join(local.paths.root, "logs"),
  });

  const checkpointDir = path.join(local.paths.checkpoints, "ehb-consume");
  mkdirSync(checkpointDir, { recursive: true });
  const checkpointPath = path.join(checkpointDir, "progress.json");
  const done = new Set<string>(
    existsSync(checkpointPath)
      ? (JSON.parse(readFileSync(checkpointPath, "utf8")).completed as string[])
      : [],
  );

  const stats = {
    queued: docs.length,
    skippedDone: 0,
    fetched: 0,
    rejected: 0,
    nonFinancing: 0,
    localAnalyzed: 0,
    neonPersisted: 0,
    neonReused: 0,
    failed: 0,
  };

  for (const d of docs) {
    const sourceId = sourceIdOf(d);
    if (done.has(sourceId)) {
      stats.skippedDone += 1;
      continue;
    }
    const url = d.sourceUrl;
    if (!url) {
      stats.failed += 1;
      console.warn(`FAIL ${sourceId}: missing sourceUrl`);
      continue;
    }
    if (dryRun) {
      console.log(`DRY ${sourceId} ${url}`);
      continue;
    }
    try {
      const fetched = await client.http.get(url);
      if (fetched.status !== 200) {
        stats.failed += 1;
        console.warn(`FAIL ${sourceId}: HTTP ${fetched.status}`);
        continue;
      }
      const bytes = fetched.body;
      if (bytes.length < 8_000) {
        stats.rejected += 1;
        console.warn(`REJECT tiny ${sourceId} bytes=${bytes.length}`);
        continue;
      }
      stats.fetched += 1;
      const hash = createHash("sha256").update(bytes).digest("hex");
      const title = d.documentTitle || d.exhibitFilename || sourceId;
      const rawClass = (d.documentClass || "UNKNOWN").toUpperCase();
      const declaredClass =
        rawClass === "OTHER_DEBT_AGREEMENT"
          ? "OTHER_DEBT_RELATED"
          : rawClass === "REVOLVER" || rawClass === "REVOLVING_CREDIT"
            ? "REVOLVING_CREDIT_AGREEMENT"
            : rawClass;
      const substantive = isSubstantiveFinancingPrecedent({
        sourceId,
        documentTitle: title,
        documentClass: declaredClass,
        exhibitFilename: d.exhibitFilename ?? "exhibit.htm",
        provenance: "ehb-queue-consume",
        byteSize: bytes.length,
      });
      if (!substantive) {
        stats.nonFinancing += 1;
        console.log(`SKIP non-financing ${sourceId}`);
        done.add(sourceId);
        continue;
      }

      const source: KnowledgeSourceRecord = {
        sourceId,
        issuerCik: d.cik ?? "0000000000",
        issuerTicker: d.ticker,
        issuerName: d.issuerName,
        accessionNumber: d.accessionNumber ?? sourceId,
        exhibitFilename: d.exhibitFilename ?? "exhibit.htm",
        sourceUrl: url,
        filingDate: (d.filingDate ?? "1970-01-01").slice(0, 10),
        formType: d.formType ?? "8-K",
        documentTitle: title,
        documentClass: (declaredClass as KnowledgeSourceRecord["documentClass"]) || "UNKNOWN",
        originalBytesHash: hash,
        acquisitionTimestamp: new Date().toISOString(),
        parserVersion: "ehb-consume-v1",
        extractionStatus: "ACQUIRED",
        representationLevel: "SOURCE_ONLY",
        provenance: "ehb-queue-consume",
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      };
      local.writeBytes(hash, bytes);
      local.upsertSource(source);

      let canonical = sourceId;
      if (persistNeon) {
        const persist = await persistDurableKnowledgeSource({
          source,
          bytes,
          contentType: "text/html",
        });
        canonical = persist.sourceId;
        if (persist.reusedExisting) stats.neonReused += 1;
        else stats.neonPersisted += 1;
      }

      const processed = await processAcquiredDocument(mass, {
        discovered: {
          sourceId: canonical,
          filing: {
            accessionNumber: source.accessionNumber,
            formType: source.formType,
            filingDate: source.filingDate,
            issuer: { cik: source.issuerCik, ticker: source.issuerTicker, name: source.issuerName },
          },
          exhibit: {
            filename: source.exhibitFilename,
            description: source.documentTitle,
            exhibitType: "EX-10",
            sourceUrl: source.sourceUrl,
          },
          discoverySignals: ["ehb-consume"],
        },
        bytes,
        contentHash: hash,
        provenance: source.provenance,
        usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      });

      const summary = buildDocumentCovenantSummary({
        sourceId: canonical,
        documentTitle: processed.source.documentTitle || title,
        issuerName: processed.source.issuerName ?? source.issuerName,
        issuerCik: source.issuerCik,
        documentClass: processed.source.documentClass,
        candidates: mass.loadCandidates(canonical),
        definitions: mass.loadDefinitions(canonical),
        structuralNodes: mass.loadStructuralNodes(canonical),
        crossReferences: mass.loadCrossReferences(canonical),
      });
      stats.localAnalyzed += 1;

      if (persistNeon) {
        const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: canonical } });
        if (row) {
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
        }
      }

      console.log(
        `OK ${canonical} class=${processed.source.documentClass} summaries=${summary.items.length} neon=${persistNeon}`,
      );
      done.add(sourceId);
      writeFileSync(checkpointPath, JSON.stringify({ completed: [...done], updatedAt: new Date().toISOString() }, null, 2));
    } catch (err) {
      stats.failed += 1;
      console.warn(`FAIL ${sourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(JSON.stringify({ queuePath, dryRun, persistNeon, stats }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
