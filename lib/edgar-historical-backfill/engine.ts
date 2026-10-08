/**
 * Historical filing discovery engine — orchestration.
 *
 * Discovers metadata, builds manifests, resolves IBR chains, dedupes, ranks,
 * and writes a durable acquisition queue for WS-CKF. Does not download exhibit
 * bodies and does not create a second source registry.
 */

import { join } from "node:path";
import { createHash } from "node:crypto";
import { SecAccessCoordinator, getSharedSecAccess } from "./sec-access";
import { selectIssuerUniverse, loadIssuerFilings, rankFilingsForIndexFetch } from "./submissions";
import { exhibitsFromIndexHtml, parseIndexExhibitRows } from "./index-parser";
import { completeIbrFromOriginalIndex, indexUrlFor } from "./ibr-resolver";
import { filingDebtSignalScore } from "./exhibit-classifier";
import { dedupeExhibits } from "./dedupe";
import { buildCoverageReport, countDistinctAgreements } from "./coverage";
import { buildAcquisitionQueue } from "./ranking";
import { checkpointPath, loadCheckpoint, newCheckpoint, readJson, saveCheckpoint, writeJson } from "./checkpoint";
import type {
  DiscoveryRunResult,
  ExhibitRef,
  IssuerManifest,
  IssuerRef,
  FilingManifestEntry,
} from "./types";

export interface RunDiscoveryOptions {
  runDir: string;
  scale?: "pilot-100" | "scale-1000" | "broad" | "custom";
  issuerCount?: number;
  /** Prefer these tickers first (still capped by issuerCount). */
  preferTickers?: string[];
  /** Explicit issuer list — skips universe selection when provided. */
  issuers?: IssuerRef[];
  /** Max filing indexes to open per issuer (metadata budget). */
  maxIndexesPerIssuer?: number;
  includeHistoricalArchives?: boolean;
  maxArchiveFiles?: number;
  resume?: boolean;
  sec?: SecAccessCoordinator;
  /** Resolve IBR targets by fetching original indexes (extra SEC calls). */
  resolveIbrIndexes?: boolean;
  acquisitionQueueLimit?: number;
  onProgress?: (msg: string) => void;
}

export async function runHistoricalDiscovery(opts: RunDiscoveryOptions): Promise<DiscoveryRunResult> {
  const scale = opts.scale ?? "pilot-100";
  const issuerCount = opts.issuerCount ?? (scale === "pilot-100" ? 100 : scale === "scale-1000" ? 1000 : 100);
  const maxIndexes = opts.maxIndexesPerIssuer ?? 12;
  const sec = opts.sec ?? getSharedSecAccess({ cacheDir: join(opts.runDir, ".sec-cache") });
  const log = opts.onProgress ?? (() => {});

  const cpFile = checkpointPath(opts.runDir);
  let checkpoint = opts.resume ? loadCheckpoint(cpFile) : null;

  if (!checkpoint) {
    const issuers =
      opts.issuers ??
      (await selectIssuerUniverse(sec, issuerCount, { preferTickers: opts.preferTickers }));
    const runId = createHash("sha256")
      .update(`${scale}|${issuers.map((i) => i.cik).join(",")}|${new Date().toISOString()}`)
      .digest("hex")
      .slice(0, 16);
    checkpoint = newCheckpoint({ runId, scale, issuers });
    saveCheckpoint(cpFile, checkpoint);
  }

  const manifestsDir = join(opts.runDir, "manifests");
  const manifests: IssuerManifest[] = [];
  const allExhibits: ExhibitRef[] = [];
  const issuersByCik = new Map(checkpoint.issuers.map((i) => [i.cik, i]));

  for (let i = checkpoint.issuerCursor; i < checkpoint.issuers.length; i++) {
    const issuer = checkpoint.issuers[i]!;
    if (checkpoint.completedCiks.includes(issuer.cik)) {
      try {
        const m = readJson<IssuerManifest>(join(manifestsDir, `${issuer.cik}.json`));
        manifests.push(m);
        allExhibits.push(...m.exhibits);
      } catch {
        /* continue rediscovery */
      }
      checkpoint.issuerCursor = i + 1;
      continue;
    }

    log(`[${i + 1}/${checkpoint.issuers.length}] CIK ${issuer.cik} ${issuer.ticker ?? ""}`);
    try {
      const { issuer: enriched, filings } = await loadIssuerFilings(sec, issuer, {
        includeHistoricalArchives: opts.includeHistoricalArchives,
        maxArchiveFiles: opts.maxArchiveFiles ?? 3,
      });
      issuersByCik.set(enriched.cik, enriched);
      checkpoint.stats.filingsScanned += filings.length;

      const toFetch = rankFilingsForIndexFetch(filings, maxIndexes);
      const filingEntries: FilingManifestEntry[] = filings.map((f) => ({
        ...f,
        debtSignalScore: filingDebtSignalScore(f.form, f.items, f.primaryDocDescription),
        indexFetched: false,
        exhibitCount: 0,
        relevantExhibitCount: 0,
      }));
      const entryByAcc = new Map(filingEntries.map((f) => [f.accessionNumber, f]));

      const discovered: ExhibitRef[] = [];
      for (const filing of toFetch) {
        const indexUrl = indexUrlFor(filing.cik, filing.accessionNumber);
        const { status, text } = await sec.getText(indexUrl);
        checkpoint.stats.indexesFetched++;
        const entry = entryByAcc.get(filing.accessionNumber);
        if (entry) entry.indexFetched = true;
        if (status !== 200) continue;
        const exhibits = exhibitsFromIndexHtml(filing, text);
        discovered.push(...exhibits);
        if (entry) {
          entry.exhibitCount = exhibits.length;
          entry.relevantExhibitCount = exhibits.filter((e) => e.relevanceScore >= 55).length;
        }
      }

      // Optional second-pass IBR completion against original indexes.
      if (opts.resolveIbrIndexes !== false) {
        const pending = discovered.filter(
          (e) => e.ibr && e.ibr.resolvedAccessionNumber && e.ibr.resolutionStatus !== "RESOLVED",
        );
        const originals = new Map<string, ReturnType<typeof parseIndexExhibitRows>>();
        for (const e of pending.slice(0, 20)) {
          const acc = e.ibr!.resolvedAccessionNumber!;
          if (!originals.has(acc)) {
            const { status, text } = await sec.getText(indexUrlFor(e.cik, acc));
            checkpoint.stats.indexesFetched++;
            originals.set(acc, status === 200 ? parseIndexExhibitRows(text) : []);
          }
          const rows = originals.get(acc) ?? [];
          e.ibr = completeIbrFromOriginalIndex(
            e.ibr!,
            rows.map((r) => ({
              type: r.type,
              filename: r.filename,
              href: r.href ?? "",
              description: r.description,
            })),
            e.cik,
          );
          if (e.ibr.resolutionStatus === "RESOLVED") {
            e.sourceUri = e.ibr.resolvedSourceUri ?? e.sourceUri;
            e.discoveryStatus = "DISCOVERED";
            checkpoint.stats.ibrResolved++;
          } else if (e.ibr.resolutionStatus === "UNRESOLVED") {
            e.discoveryStatus = "IBR_UNRESOLVED";
            checkpoint.stats.ibrUnresolved++;
          }
        }
      }

      const deduped = dedupeExhibits(discovered);
      checkpoint.stats.duplicatesCollapsed += deduped.collapsedCount;
      const kept = deduped.kept.map((e) =>
        e.discoveryStatus === "IBR_UNRESOLVED" ? e : { ...e, discoveryStatus: "DISCOVERED" as const },
      );
      checkpoint.stats.exhibitsDiscovered += kept.length;

      const fetchedAcc = new Set(toFetch.map((f) => f.accessionNumber));
      const manifest: IssuerManifest = {
        issuer: enriched,
        discoveredAt: new Date().toISOString(),
        filingsScanned: filings.length,
        filingsWithDebtSignals: toFetch.length,
        exhibitsDiscovered: kept.length,
        distinctAgreementKeys: countDistinctAgreements(kept),
        filings: filingEntries.filter((f) => f.indexFetched || fetchedAcc.has(f.accessionNumber) || f.debtSignalScore >= 40),
        exhibits: kept,
      };

      writeJson(join(manifestsDir, `${enriched.cik}.json`), manifest);
      writeJson(join(manifestsDir, `${enriched.cik}.duplicates.json`), deduped.groups);
      manifests.push(manifest);
      allExhibits.push(...kept);

      checkpoint.completedCiks.push(enriched.cik);
      checkpoint.failedCiks = checkpoint.failedCiks.filter((f) => f.cik !== enriched.cik);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`  FAILED: ${message}`);
      const existing = checkpoint.failedCiks.find((f) => f.cik === issuer.cik);
      if (existing) existing.attempts += 1;
      else checkpoint.failedCiks.push({ cik: issuer.cik, error: message, attempts: 1 });
    }

    checkpoint.issuerCursor = i + 1;
    checkpoint.stats.secRequests = sec.getRequestCount();
    saveCheckpoint(cpFile, checkpoint);
  }

  const coverage = buildCoverageReport(manifests);
  const queue = buildAcquisitionQueue({
    exhibits: allExhibits,
    issuersByCik,
    limit: opts.acquisitionQueueLimit,
  });
  checkpoint.stats.queuedForAcquisition = queue.length;
  checkpoint.stats.secRequests = sec.getRequestCount();
  saveCheckpoint(cpFile, checkpoint);

  writeJson(join(opts.runDir, "coverage.json"), coverage);
  writeJson(join(opts.runDir, "acquisition-queue.json"), queue);
  writeJson(join(opts.runDir, "duplicate-report.json"), {
    generatedAt: new Date().toISOString(),
    collapsedCount: checkpoint.stats.duplicatesCollapsed,
    // Per-issuer duplicate files are under manifests/; aggregate summary only here.
    note: "Per-issuer duplicate groups: manifests/<cik>.duplicates.json",
  });

  return {
    runId: checkpoint.runId,
    checkpointPath: cpFile,
    manifestsDir,
    coverage,
    duplicateReport: [],
    acquisitionQueue: queue,
    checkpoint,
  };
}
