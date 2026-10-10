#!/usr/bin/env tsx
/**
 * Run CVF harness for a CI tier and print metrics (provider-free).
 *
 * Usage: npx tsx scripts/verification-factory/run-tier.ts [PR_FAST|INTEGRATION_BATCH]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { runHarness, CI_TIER_PLAN, type CiTier } from "@/lib/verification-factory";
import {
  isKnownStandingIncorrectFavorable,
  KNOWN_STANDING_INCORRECT_FAVORABLES,
} from "@/lib/verification-factory/known-standing-defects";

const tier = ((process.argv[2] as CiTier) || "PR_FAST") as CiTier;
if (!CI_TIER_PLAN[tier]) {
  console.error(`Unknown tier ${tier}`);
  process.exit(2);
}

const report = runHarness({ tier });
const incorrectFavorable = report.results.filter((r) => r.grade === "INCORRECT_FAVORABLE");
const unexpectedIncorrectFavorable = incorrectFavorable.filter(
  (r) => !isKnownStandingIncorrectFavorable(r.caseId),
);
const knownStanding = incorrectFavorable.filter((r) => isKnownStandingIncorrectFavorable(r.caseId));

mkdirSync("docs/continuous-verification-factory", { recursive: true });
writeFileSync(
  "docs/continuous-verification-factory/latest-harness-run.json",
  JSON.stringify(
    {
      version: report.version,
      tier: report.tier,
      metrics: report.metrics,
      incorrectFavorable,
      unexpectedIncorrectFavorable,
      knownStandingIncorrectFavorable: knownStanding,
      knownStandingAllowlist: KNOWN_STANDING_INCORRECT_FAVORABLES,
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
console.log(`\nIncorrect favorable (total): ${report.metrics.incorrectFavorable}`);
console.log(`Unexpected incorrect favorable: ${unexpectedIncorrectFavorable.length}`);
console.log(`Known standing incorrect favorable: ${knownStanding.length}`);
console.log(`Executions: ${report.metrics.totalExecutions}`);
console.log(`Wrote docs/continuous-verification-factory/latest-harness-run.json`);

// Soft gate: fail only on unexpected incorrect favorables (not allowlisted standing defects).
if (unexpectedIncorrectFavorable.length > 0) {
  process.exit(1);
}
