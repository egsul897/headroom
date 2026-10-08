#!/usr/bin/env npx tsx
/**
 * Reproducible EDGAR historical discovery runner.
 *
 * Examples:
 *   npx tsx scripts/edgar-historical-backfill/run-discovery.ts --scale pilot-100
 *   npx tsx scripts/edgar-historical-backfill/run-discovery.ts --issuers 5 --prefer F,AAL,CNMD,MATW,COHR
 *   npx tsx scripts/edgar-historical-backfill/run-discovery.ts --resume --run-dir data/edgar-historical-backfill/pilot-100
 *
 * Metadata-first. Does not download exhibit bodies. Writes acquisition-queue.json
 * for the Covenant Knowledge Factory acquisition agent.
 */

import { join } from "node:path";
import { runHistoricalDiscovery } from "../../lib/edgar-historical-backfill/engine";
import { SecAccessCoordinator } from "../../lib/edgar-historical-backfill/sec-access";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const scale = (arg("scale") as "pilot-100" | "scale-1000" | "broad" | "custom" | undefined) ?? "custom";
  const issuers = arg("issuers") ? Number(arg("issuers")) : scale === "pilot-100" ? 100 : scale === "scale-1000" ? 1000 : 5;
  const prefer = (arg("prefer") ?? "F,AAL,CNMD,MATW,COHR,ROCK,DSGR,CHWY,LXU,FWRG").split(",").map((s) => s.trim()).filter(Boolean);
  const maxIndexes = arg("max-indexes") ? Number(arg("max-indexes")) : 8;
  const runDir =
    arg("run-dir") ??
    join(process.cwd(), "data", "edgar-historical-backfill", scale === "custom" ? `run-${issuers}` : scale);
  const resume = hasFlag("resume");

  const sec = new SecAccessCoordinator({
    cacheDir: join(runDir, ".sec-cache"),
    maxConcurrency: 2,
    maxRequestsPerSecond: 6,
  });

  console.log(
    JSON.stringify(
      {
        scale,
        issuers,
        prefer,
        maxIndexes,
        runDir,
        resume,
        userAgent: sec.getUserAgent(),
      },
      null,
      2,
    ),
  );

  const result = await runHistoricalDiscovery({
    runDir,
    scale,
    issuerCount: issuers,
    preferTickers: prefer,
    maxIndexesPerIssuer: maxIndexes,
    includeHistoricalArchives: true,
    maxArchiveFiles: 2,
    resume,
    sec,
    resolveIbrIndexes: true,
    onProgress: (m) => console.log(m),
  });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        checkpointPath: result.checkpointPath,
        stats: result.checkpoint.stats,
        coverage: {
          issuerCount: result.coverage.issuerCount,
          filingsScanned: result.coverage.filingsScanned,
          exhibitsDiscovered: result.coverage.exhibitsDiscovered,
          distinctAgreements: result.coverage.distinctAgreements,
          byDocumentKind: result.coverage.byDocumentKind,
          gapCount: result.coverage.gaps.length,
        },
        acquisitionQueueLength: result.acquisitionQueue.length,
        topQueue: result.acquisitionQueue.slice(0, 10).map((q) => ({
          priority: q.priority,
          ticker: q.ticker,
          kind: q.documentKind,
          filingDate: q.filingDate,
          description: q.description.slice(0, 80),
          sourceUri: q.sourceUri,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
