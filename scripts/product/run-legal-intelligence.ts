/**
 * Run integrated legal-intelligence paths + challenge stage.
 *   npm run product:legal-intelligence
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runIntegratedLegalIntelligence } from "../../lib/product/legal-intelligence/run-package-path";
import { prisma } from "../../lib/prisma";

const OUT = "docs/product/legal-intelligence";

async function main() {
  const result = await runIntegratedLegalIntelligence();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "path-results.json"), JSON.stringify(result, null, 2) + "\n");

  const summary = {
    generatedAt: result.generatedAt,
    packages: result.packages.map((p) => ({
      companyId: p.companyId,
      packageKey: p.packageKey,
      pathExecuted: p.pathExecuted,
      conclusions: p.conclusions.length,
      challenges: p.challenges.length,
      blockerChallenges: p.challenges.filter((c) => c.severity === "BLOCKER").length,
      survivingExecutableConclusions: p.survivingExecutableConclusions,
      metrics: p.metrics,
      blockedReasons: p.blockedReasons.slice(0, 8),
    })),
  };
  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
