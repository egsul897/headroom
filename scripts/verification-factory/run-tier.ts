#!/usr/bin/env tsx
/**
 * Run CVF harness for a CI tier and print metrics (provider-free).
 *
 * Usage: npx tsx scripts/verification-factory/run-tier.ts [PR_FAST|INTEGRATION_BATCH]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { runHarness, CI_TIER_PLAN, type CiTier } from "@/lib/verification-factory";

const tier = ((process.argv[2] as CiTier) || "PR_FAST") as CiTier;
if (!CI_TIER_PLAN[tier]) {
  console.error(`Unknown tier ${tier}`);
  process.exit(2);
}

const report = runHarness({ tier });
mkdirSync("docs/continuous-verification-factory", { recursive: true });
writeFileSync(
  "docs/continuous-verification-factory/latest-harness-run.json",
  JSON.stringify(
    {
      version: report.version,
      tier: report.tier,
      metrics: report.metrics,
      incorrectFavorable: report.results.filter((r) => r.grade === "INCORRECT_FAVORABLE"),
      results: report.results,
      productionSemanticsUnchanged: report.productionSemanticsUnchanged,
      certificationGatesUnchanged: report.certificationGatesUnchanged,
      tierPlan: CI_TIER_PLAN[tier],
    },
    null,
    2,
  ),
);

console.log(report.metricsMarkdown);
console.log(`\nIncorrect favorable: ${report.metrics.incorrectFavorable}`);
console.log(`Executions: ${report.metrics.totalExecutions}`);
console.log(`Wrote docs/continuous-verification-factory/latest-harness-run.json`);

if (report.metrics.incorrectFavorable > 0) {
  process.exit(1);
}
