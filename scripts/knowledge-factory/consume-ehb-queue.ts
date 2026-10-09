/**
 * Consume an EDGAR Historical Backfill acquisition-queue.json through CKF:
 * fetch → classify → durable store → structural analysis → v2 summary.
 *
 * Modes (explicit):
 *   --mode=LOCAL       Local corpus only (default without --persist-neon)
 *   --mode=NEON        Neon BYTEA + KnowledgeSource (requires live-write gate)
 *   --mode=REPROCESS   Reanalyze from local/Neon bytes; no SEC fetch
 *
 * Legacy: --persist-neon is equivalent to --mode=NEON.
 *
 *   npx tsx scripts/knowledge-factory/consume-ehb-queue.ts --queue=path/to/acquisition-queue.json
 *   KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE npx tsx ... --mode=NEON
 *
 * Does not invent a new crawler. Respects SEC rate limits via EdgarKnowledgeClient.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { EdgarKnowledgeClient } from "../../lib/knowledge-factory/edgar/client";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import {
  loadDurableSourceBytes,
  persistDurableKnowledgeSource,
} from "../../lib/knowledge-factory/preservation/durable-store";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { isSubstantiveFinancingPrecedent } from "../../lib/product/covenant-intelligence/corpus-quality";
import {
  parsePersistenceMode,
  resolveAcquisitionPersistence,
  type ResolvedPersistence,
} from "../../lib/knowledge-factory/acquisition/persistence-mode";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";
import { prisma } from "../../lib/prisma";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
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
  originalBytesHash?: string;
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

function mapDeclaredClass(rawClass: string): string {
  const c = rawClass.toUpperCase();
  if (c === "OTHER_DEBT_AGREEMENT") return "OTHER_DEBT_RELATED";
  if (c === "REVOLVER" || c === "REVOLVING_CREDIT") return "REVOLVING_CREDIT_AGREEMENT";
  return c;
}

async function loadBytesForReprocess(
  d: QueueDoc,
  sourceId: string,
  local: ResolvedPersistence["local"],
): Promise<{ bytes: Buffer; hash: string } | null> {
  if (d.originalBytesHash) {
    const localBuf = local.readBytes(d.originalBytesHash);
    if (localBuf) return { bytes: localBuf, hash: d.originalBytesHash };
    const byHash = await prisma.documentByteObject.findUnique({
      where: { contentHash: d.originalBytesHash },
    });
    if (byHash?.bytes) return { bytes: Buffer.from(byHash.bytes), hash: d.originalBytesHash };
  }
  try {
    const loaded = await loadDurableSourceBytes({ sourceId });
    return { bytes: loaded.bytes, hash: loaded.row.originalBytesHash };
  } catch {
    /* try hash / alias lookup */
  }
  const existing = await prisma.knowledgeSource.findUnique({ where: { sourceId } });
  if (existing?.originalBytesHash) {
    const localBuf = local.readBytes(existing.originalBytesHash);
    if (localBuf) return { bytes: localBuf, hash: existing.originalBytesHash };
    const byHash = await prisma.documentByteObject.findUnique({
      where: { contentHash: existing.originalBytesHash },
    });
    if (byHash?.bytes) return { bytes: Buffer.from(byHash.bytes), hash: existing.originalBytesHash };
  }
  return null;
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
  const mode = parsePersistenceMode(arg("--mode"), flag("--persist-neon"));
  let persistence;
  try {
    persistence = resolveAcquisitionPersistence({ mode });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }

  const raw = JSON.parse(readFileSync(queuePath, "utf8"));
  const allDocs = normalizeQueue(raw);
  const docs = Number.isFinite(limit) && limit > 0 ? allDocs.slice(0, limit) : allDocs;
  const { local, analysis, persistNeon, allowSecFetch, roots } = persistence;

  const client = allowSecFetch
    ? new EdgarKnowledgeClient({
        cacheDir: path.join(local.paths.cache, "sec"),
        logDir: path.join(local.paths.root, "logs"),
      })
    : null;

  const checkpointDir = path.join(local.paths.checkpoints, "ehb-consume");
  mkdirSync(checkpointDir, { recursive: true });
  const checkpointPath = path.join(checkpointDir, "progress.json");
  const done = new Set<string>(
    existsSync(checkpointPath)
      ? (JSON.parse(readFileSync(checkpointPath, "utf8")).completed as string[])
      : [],
  );

  const stats = {
    mode,
    roots,
    queued: docs.length,
    skippedDone: 0,
    fetched: 0,
    reprocessed: 0,
    rejected: 0,
    nonFinancing: 0,
    localAnalyzed: 0,
    neonPersisted: 0,
    neonReused: 0,
    failed: 0,
  };

  console.log(JSON.stringify({ mode, persistNeon, allowSecFetch, roots, queued: docs.length }, null, 2));

  for (const d of docs) {
    const sourceId = sourceIdOf(d);
    if (done.has(sourceId) && mode !== "REPROCESS") {
      stats.skippedDone += 1;
      continue;
    }
    if (dryRun) {
      console.log(`DRY ${sourceId} ${d.sourceUrl ?? d.originalBytesHash ?? ""}`);
      continue;
    }
    try {
      let bytes: Buffer;
      let hash: string;

      if (!allowSecFetch) {
        const loaded = await loadBytesForReprocess(d, sourceId, local);
        if (!loaded) {
          stats.failed += 1;
          console.warn(`FAIL ${sourceId}: REPROCESS missing durable bytes`);
          continue;
        }
        bytes = loaded.bytes;
        hash = loaded.hash;
        stats.reprocessed += 1;
      } else {
        const url = d.sourceUrl;
        if (!url) {
          stats.failed += 1;
          console.warn(`FAIL ${sourceId}: missing sourceUrl`);
          continue;
        }
        const fetched = await client!.http.get(url);
        if (fetched.status !== 200) {
          stats.failed += 1;
          console.warn(`FAIL ${sourceId}: HTTP ${fetched.status}`);
          continue;
        }
        bytes = fetched.body;
        if (bytes.length < 8_000) {
          stats.rejected += 1;
          console.warn(`REJECT tiny ${sourceId} bytes=${bytes.length}`);
          done.add(sourceId);
          writeFileSync(
            checkpointPath,
            JSON.stringify({ completed: [...done], updatedAt: new Date().toISOString() }, null, 2),
          );
          continue;
        }
        stats.fetched += 1;
        hash = createHash("sha256").update(bytes).digest("hex");
      }

      const title = d.documentTitle || d.exhibitFilename || sourceId;
      const declaredClass = mapDeclaredClass(d.documentClass || "UNKNOWN");
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
        writeFileSync(
          checkpointPath,
          JSON.stringify({ completed: [...done], updatedAt: new Date().toISOString() }, null, 2),
        );
        continue;
      }

      const source: KnowledgeSourceRecord = {
        sourceId,
        issuerCik: d.cik ?? "0000000000",
        issuerTicker: d.ticker,
        issuerName: d.issuerName,
        accessionNumber: d.accessionNumber ?? sourceId,
        exhibitFilename: d.exhibitFilename ?? "exhibit.htm",
        sourceUrl: d.sourceUrl ?? `reprocess://${sourceId}`,
        filingDate: (d.filingDate ?? "1970-01-01").slice(0, 10),
        formType: d.formType ?? "8-K",
        documentTitle: title,
        documentClass: (declaredClass as KnowledgeSourceRecord["documentClass"]) || "UNKNOWN",
        originalBytesHash: hash,
        acquisitionTimestamp: new Date().toISOString(),
        parserVersion: "ehb-consume-v2",
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

      const processed = await processAcquiredDocument(analysis, {
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
          discoverySignals: ["ehb-consume", `mode:${mode}`],
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
        candidates: analysis.loadCandidates(canonical),
        definitions: analysis.loadDefinitions(canonical),
        structuralNodes: analysis.loadStructuralNodes(canonical),
        crossReferences: analysis.loadCrossReferences(canonical),
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
                  persistenceMode: mode,
                }),
              ),
            },
          });
        }
      }

      console.log(
        `OK ${canonical} class=${processed.source.documentClass} summaries=${summary.items.length} mode=${mode}`,
      );
      done.add(sourceId);
      writeFileSync(
        checkpointPath,
        JSON.stringify({ completed: [...done], updatedAt: new Date().toISOString(), mode }, null, 2),
      );
    } catch (err) {
      stats.failed += 1;
      const msg = err instanceof Error ? err.message || err.name : String(err);
      console.warn(`FAIL ${sourceId}: ${msg}`);
    }
  }

  console.log(JSON.stringify({ queuePath, dryRun, stats }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
