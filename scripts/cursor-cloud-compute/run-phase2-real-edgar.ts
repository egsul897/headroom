/**
 * Phase 2 CLI — real EDGAR scale benchmark on Cursor Cloud.
 *
 *   HEADROOM_CKF_ROOT=/tmp/peer-worktrees/ckf \
 *   HEADROOM_EHB_ROOT=/tmp/peer-worktrees/ehb \
 *   npx tsx scripts/cursor-cloud-compute/run-phase2-real-edgar.ts \
 *     --ehb-run-dir data/edgar-historical-backfill/cca-phase2-pilot100 \
 *     --limit 1000
 *
 * Soft gate. IMPLEMENTED ≠ CERTIFIED. No paid GPU/model calls.
 * Does not write raw corpora into git.
 */
import fs from "node:fs";
import path from "node:path";
import { proveResumeInvariants, runPhase2ScaleBenchmark, writePortablePhase2Artifacts } from "../../lib/cursor-cloud-compute/phase2/run-scale-benchmark";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const ehbRunDir =
    arg("ehb-run-dir") ??
    process.env.HEADROOM_EHB_RUN_DIR ??
    path.join(process.cwd(), "data", "edgar-historical-backfill", "cca-phase2-pilot100");
  const corpusRoot =
    arg("corpus-root") ?? path.join(process.cwd(), "data", "cursor-cloud-compute", "phase2-corpus");
  const limit = Number(arg("limit") ?? "1000");

  if (!fs.existsSync(ehbRunDir)) {
    console.error(`EHB run dir missing: ${ehbRunDir}`);
    console.error("Run WS-EHB discovery first, e.g.:");
    console.error("  cd /tmp/peer-worktrees/ehb && npx tsx scripts/edgar-historical-backfill/run-discovery.ts --scale pilot-100 --run-dir <dir>");
    process.exit(2);
  }

  console.log(
    JSON.stringify(
      {
        mission: "PHASE2_REAL_EDGAR_SCALE",
        status: "COMPUTE_ASSESSMENT_PHASE2_NOT_CERTIFIED",
        ehbRunDir,
        corpusRoot,
        limit,
        ckfRoot: process.env.HEADROOM_CKF_ROOT ?? "/tmp/peer-worktrees/ckf",
        ehbRoot: process.env.HEADROOM_EHB_ROOT ?? "/tmp/peer-worktrees/ehb",
      },
      null,
      2,
    ),
  );

  const report = await runPhase2ScaleBenchmark({
    ehbRunDir,
    corpusRoot,
    limit,
    resume: flag("resume"),
    skipWarm: flag("skip-warm"),
  });

  report.resumeProof = await proveResumeInvariants(corpusRoot);
  const { manifestPath, artifactPath } = writePortablePhase2Artifacts(report);

  console.log("\n=== COLD ===");
  console.log(
    JSON.stringify(
      {
        uniqueDocuments: report.cold.uniqueDocumentsProcessed,
        uniqueIssuers: report.cold.uniqueIssuers,
        uniqueInstruments: report.cold.uniqueInstruments,
        kinds: report.cold.documentKindCounts,
        endToEndSec: +(report.cold.endToEndWallMs / 1000).toFixed(3),
        processingOnlySec: +(report.cold.processingOnlyMs / 1000).toFixed(3),
        processingOnlyDocsPerSec: +report.cold.processingOnlyDocsPerSecond.toFixed(3),
        downloadSec: +(report.cold.downloadMs / 1000).toFixed(3),
        peakRssMiB: +(report.cold.peakRssBytes / 1024 ** 2).toFixed(1),
        cpuUtilizationApprox: +report.cold.cpuUtilizationApprox.toFixed(3),
        storageMiB: +(report.cold.storageBytes / 1024 ** 2).toFixed(1),
        failureRate: report.cold.failureRate,
        errors: report.cold.errorClassCounts,
        retries: report.cold.retryCount,
      },
      null,
      2,
    ),
  );

  console.log("\n=== WARM ===");
  console.log(
    JSON.stringify(
      {
        endToEndSec: +(report.warm.endToEndWallMs / 1000).toFixed(3),
        processingOnlySec: +(report.warm.processingOnlyMs / 1000).toFixed(3),
        processingOnlyDocsPerSec: +report.warm.processingOnlyDocsPerSecond.toFixed(3),
        cacheHits: report.warm.cacheHitCount,
        peakRssMiB: +(report.warm.peakRssBytes / 1024 ** 2).toFixed(1),
      },
      null,
      2,
    ),
  );

  console.log("\n=== QUALITY / RESUME / COST ===");
  console.log(JSON.stringify({ quality: report.quality, resumeProof: report.resumeProof, cost: report.cost, blocker: report.blocker }, null, 2));

  console.log(`\nportableManifest=${manifestPath}`);
  console.log(`artifact=${artifactPath}`);
  console.log(`jobId=${report.jobId}`);
  if (report.cold.failureCount > 0 && report.cold.okCount === 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
