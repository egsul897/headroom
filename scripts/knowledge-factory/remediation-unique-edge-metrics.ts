/**
 * READ-ONLY: unique-edge quality metrics (deduplicated by discoveryId).
 *   npx tsx scripts/knowledge-factory/remediation-unique-edge-metrics.ts
 * Optional: --twice  run twice and assert identical population totals (idempotent read).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { computeUniqueEdgeMetrics } from "../../lib/knowledge-factory/quality-gate/unique-edge-metrics";
import { prisma } from "../../lib/prisma";

async function main() {
  const twice = process.argv.includes("--twice");
  const outDir = path.join(process.cwd(), "docs/knowledge-factory/quality-gate/remediation");
  mkdirSync(outDir, { recursive: true });

  const run1 = await computeUniqueEdgeMetrics();
  writeFileSync(path.join(outDir, "unique-edge-metrics.json"), JSON.stringify(run1, null, 2) + "\n");

  let run2 = null;
  let idempotentRead = true;
  if (twice) {
    run2 = await computeUniqueEdgeMetrics();
    writeFileSync(
      path.join(outDir, "unique-edge-metrics-run2.json"),
      JSON.stringify(run2, null, 2) + "\n",
    );
    idempotentRead =
      run1.population.totalRawRows === run2.population.totalRawRows &&
      run1.population.uniqueDiscoveryIds === run2.population.uniqueDiscoveryIds &&
      run1.population.excessDuplicateRows === run2.population.excessDuplicateRows;
  }

  const summary = {
    schema: "kf-unique-edge-metrics-run.v1",
    generatedAt: new Date().toISOString(),
    neonMutations: false,
    run1Population: run1.population,
    run2Population: run2?.population ?? null,
    idempotentRead,
    stratifiedOverall: run1.stratifiedConfidence.overallHighConfidenceRate,
    stratifiedWilson95: run1.stratifiedConfidence.overallWilson95,
    authoritySeparation: run1.authoritySeparation,
    diversityGapsStillVisible: run1.diversityGapsStillVisible,
  };
  writeFileSync(path.join(outDir, "unique-edge-metrics-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  if (twice && !idempotentRead) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
