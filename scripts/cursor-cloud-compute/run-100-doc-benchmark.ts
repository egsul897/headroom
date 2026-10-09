/**
 * CLI: run the 100-document deterministic Cursor Cloud compute assessment.
 *
 *   npx tsx scripts/cursor-cloud-compute/run-100-doc-benchmark.ts
 *   npx tsx scripts/cursor-cloud-compute/run-100-doc-benchmark.ts --size=20
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. No paid GPU/model calls.
 */
import { runComputeAssessment } from "../../lib/cursor-cloud-compute";

function parseSize(argv: string[]): number {
  const flag = argv.find((a) => a.startsWith("--size="));
  if (!flag) return 100;
  const n = Number(flag.slice("--size=".length));
  if (!Number.isFinite(n) || n < 1) throw new Error(`invalid --size: ${flag}`);
  return Math.floor(n);
}

async function main() {
  const size = parseSize(process.argv.slice(2));
  console.log(`HEADROOM Cursor Cloud compute assessment — size=${size}`);
  console.log("Soft gate only. IMPLEMENTED ≠ CERTIFIED. No paid infrastructure.");

  const report = await runComputeAssessment({ size, persist: true });

  console.log("\n=== ENVIRONMENT ===");
  console.log(
    JSON.stringify(
      {
        cpus: report.environment.cpu.logicalCpus,
        model: report.environment.cpu.model,
        memGiB: +(report.environment.memory.totalBytes / 1024 ** 3).toFixed(2),
        diskAvailGiB: +(report.environment.disk.rootAvailableBytes / 1024 ** 3).toFixed(2),
        gpu: report.environment.gpu,
        secGov: report.environment.network.secGovReachable,
        persistence: report.environment.persistence,
      },
      null,
      2,
    ),
  );

  console.log("\n=== BENCHMARK ===");
  console.log(
    JSON.stringify(
      {
        documents: report.benchmark.documentCountProcessed,
        unique: report.benchmark.uniqueDocuments,
        duplicates: report.benchmark.duplicateDocuments,
        ok: report.benchmark.okCount,
        failures: report.benchmark.failureCount,
        failureRate: report.benchmark.failureRate,
        wallClockSec: +(report.benchmark.wallClockMs / 1000).toFixed(3),
        cpuTotalSec: +(report.benchmark.cpuTotalMs / 1000).toFixed(3),
        peakRssMiB: +(report.benchmark.peakRssBytes / 1024 ** 2).toFixed(1),
        docsPerSecond: +report.benchmark.docsPerSecond.toFixed(3),
        charsPerSecond: Math.round(report.benchmark.charsPerSecond),
        p50DocMs: +report.benchmark.p50DocMs.toFixed(2),
        p95DocMs: +report.benchmark.p95DocMs.toFixed(2),
        totalNodes: report.benchmark.totalNodes,
        totalPassACandidates: report.benchmark.totalPassACandidates,
        stageTotalsMs: report.benchmark.stageTotalsMs,
      },
      null,
      2,
    ),
  );

  console.log("\n=== LOCAL MODEL PROBE ===");
  console.log(
    JSON.stringify(
      {
        status: report.localModelProbe.status,
        gpuAvailable: report.localModelProbe.gpuAvailable,
        probes: report.localModelProbe.probes.map((p) => ({
          name: p.name,
          tokPerSec: p.estimatedTokensPerSecond,
          wallMs: p.wallMs,
          practical: p.practicalOnThisVm,
          notes: p.notes,
        })),
      },
      null,
      2,
    ),
  );

  console.log("\n=== GPU WORKER ===");
  console.log(JSON.stringify(report.gpuWorker, null, 2));

  console.log("\n=== COST ===");
  console.log(JSON.stringify(report.cost, null, 2));

  console.log("\n=== DURABLE WRITES ===");
  console.log(JSON.stringify(report.durableWrites, null, 2));

  console.log("\n=== FITNESS VERDICT ===");
  console.log(JSON.stringify(report.fitnessVerdict, null, 2));

  console.log(`\nrunId=${report.runId}`);
  console.log(`status=${report.status}`);
  if (report.benchmark.failureCount > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
