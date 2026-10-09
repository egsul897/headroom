/**
 * Independent legal/financial validation of Coherent capacity + sequential txs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { runIndependentValidation } from "../../lib/product/financial-capacity-workflow";

function sha(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const report = await runIndependentValidation({ startingSha: sha() });
  const outDir = path.join(
    process.cwd(),
    "docs/product/financial-capacity-positions/independent-validation",
  );
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(path.join(outDir, `report-${stamp}.json`), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(path.join(outDir, "customer-report.md"), report.customerReportMarkdown);
  console.log(
    JSON.stringify(
      {
        outDir,
        fiveOneTwoNine: report.fiveOneTwoNineBillion,
        secured: report.capacityBreakdown.packageWideSecuredCapacity,
        unsecured: report.capacityBreakdown.packageWideUnsecuredCapacity,
        falseFavorable: report.capacityBreakdown.dashboardSolverDivergence,
        sequential: report.sequentialTransactions.map((s) => ({
          id: s.id,
          outcome: s.outcome,
          usesPrior: s.usesPriorPostState,
        })),
        outcomes: report.outcomeSummary,
        financialAuthority: report.financialAuthority.classification,
        paidInferenceCalls: report.paidInferenceCalls,
        promotedToLegalTruth: report.promotedToLegalTruth,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
