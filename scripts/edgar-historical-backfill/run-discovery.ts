#!/usr/bin/env npx tsx
/**
 * Reproducible EDGAR historical discovery runner.
 *
 * Requires authorized SEC identity via configuration (never invents a contact):
 *   export SEC_EDGAR_USER_AGENT='HeadroomHistoricalBackfill/1.0 (contact: you@domain; research)'
 *   # or: export SEC_EDGAR_CONTACT_EMAIL='you@domain'
 *
 * Fleet-safe live fetch (pick ONE owner unless shared budget path exists):
 *   export HEADROOM_SEC_FETCH_OWNER=WS-EHB
 * Optional same-host shared budget:
 *   export HEADROOM_SEC_SHARED_BUDGET_PATH=/path/to/sec-budget.json
 *
 * Examples:
 *   npx tsx scripts/edgar-historical-backfill/run-discovery.ts --scale pilot-100
 *   npx tsx scripts/edgar-historical-backfill/run-discovery.ts --issuers 5 --prefer F,AAL,CNMD,MATW,COHR
 *   npx tsx scripts/edgar-historical-backfill/run-discovery.ts --resume --run-dir data/edgar-historical-backfill/pilot-100
 */

import { join } from "node:path";
import { runHistoricalDiscovery } from "../../lib/edgar-historical-backfill/engine";
import { SecAccessCoordinator } from "../../lib/edgar-historical-backfill/sec-access";
import { requireSecUserAgentFromEnv } from "../../lib/edgar-historical-backfill/sec-identity";
import { validateAcquisitionQueue } from "../../lib/edgar-historical-backfill/queue-validate";
import { toCkfHandoffPackage } from "../../lib/edgar-historical-backfill/ckf-handoff";
import { writeRunIntegrityManifest } from "../../lib/edgar-historical-backfill/integrity";
import { summarizeIbrResiduals } from "../../lib/edgar-historical-backfill/ibr-residuals";
import { writeJson } from "../../lib/edgar-historical-backfill/checkpoint";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import type { IssuerManifest } from "../../lib/edgar-historical-backfill/types";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const userAgent = requireSecUserAgentFromEnv();
  const scale = (arg("scale") as "pilot-100" | "scale-1000" | "broad" | "custom" | undefined) ?? "custom";
  const issuers = arg("issuers") ? Number(arg("issuers")) : scale === "pilot-100" ? 100 : scale === "scale-1000" ? 1000 : 5;
  const prefer = (arg("prefer") ?? "F,AAL,CNMD,MATW,COHR,ROCK,DSGR,CHWY,LXU,FWRG")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const maxIndexes = arg("max-indexes") ? Number(arg("max-indexes")) : 8;
  const runDir =
    arg("run-dir") ??
    join(process.cwd(), "data", "edgar-historical-backfill", scale === "custom" ? `run-${issuers}` : scale);
  const resume = hasFlag("resume");

  const sec = new SecAccessCoordinator({
    userAgent,
    role: "WS-EHB",
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
        accessPolicy: sec.getAccessPolicy(),
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
    maxIbrIndexFetches: 40,
    onProgress: (m) => console.log(m),
  });

  const queueValidation = validateAcquisitionQueue(result.acquisitionQueue);
  writeJson(join(runDir, "queue-validation.json"), queueValidation);

  const handoff = toCkfHandoffPackage(result.acquisitionQueue, {
    storageStatus: "EPHEMERAL_WORKSPACE",
  });
  writeJson(join(runDir, "ckf-handoff.json"), handoff);
  // Committed summary copy for peer visibility (not the full corpus).
  writeJson(join(process.cwd(), "docs", "edgar-historical-backfill", "ckf-handoff-summary.json"), {
    ...handoff,
    documents: handoff.documents.slice(0, 25),
    storageStatus: "COMMITTED_DOCS_SUMMARY",
    note: "Truncated summary for PR visibility; full handoff is workspace-local under the runDir.",
  });

  const manifestsDir = join(runDir, "manifests");
  const allExhibits = existsSync(manifestsDir)
    ? readdirSync(manifestsDir)
        .filter((n) => n.endsWith(".json") && !n.includes("dup"))
        .flatMap((n) => (JSON.parse(readFileSync(join(manifestsDir, n), "utf8")) as IssuerManifest).exhibits)
    : [];
  const ibrSummary = summarizeIbrResiduals(allExhibits);
  writeJson(join(runDir, "ibr-residuals.json"), {
    generatedAt: new Date().toISOString(),
    totalIbr: ibrSummary.totalIbr,
    byResidual: ibrSummary.byResidual,
    sampleCases: ibrSummary.cases.slice(0, 40),
  });

  const integrity = writeRunIntegrityManifest(runDir);

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
        queueValidation,
        ckfHandoffFetchable: handoff.fetchableCount,
        ibrResiduals: ibrSummary.byResidual,
        integrity: { queueSha256: integrity.queueSha256, artifactCount: integrity.artifacts.length },
        topQueue: result.acquisitionQueue.slice(0, 8).map((q) => ({
          priority: q.priority,
          ticker: q.ticker,
          kind: q.documentKind,
          resolution: q.resolutionStatus,
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
