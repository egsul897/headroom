/**
 * Run multi-company financial capacity positions milestone.
 * Writes docs/product/financial-capacity-positions/{report.json,customer-report.md}.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { runFinancialCapacityPositions } from "../../lib/product/financial-capacity-workflow";

function sha(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const startingSha = sha();
  const report = await runFinancialCapacityPositions({ startingSha, persistNeon: true });
  const outDir = path.join(process.cwd(), "docs/product/financial-capacity-positions");
  mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(path.join(outDir, `report-${stamp}.json`), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(path.join(outDir, "customer-report.md"), report.customerReportMarkdown);
  console.log(
    JSON.stringify(
      {
        outDir,
        metrics: report.metrics,
        assessments: report.scenarios.map((s) => ({ id: s.id, assessment: s.assessment })),
        neon: report.neonIntelligence.map((n) => ({
          sourceId: n.sourceId,
          created: n.created,
        })),
        promotedToLegalTruth: report.promotedToLegalTruth,
        paidInferenceCalls: report.paidInferenceCalls,
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
