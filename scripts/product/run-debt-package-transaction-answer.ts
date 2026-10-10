/**
 * CONMED debt package → transaction answer (end-to-end product milestone).
 *
 *   npx tsx scripts/product/run-debt-package-transaction-answer.ts
 *
 * Zero paid inference. Fail-closed. Does not invent financials or IR.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runConmedDebtPackageTransactionAnswer } from "../../lib/product/debt-package-workflow/conmed-transaction-answer";
import { prisma } from "../../lib/prisma";

async function main() {
  let startingSha: string | null = null;
  try {
    startingSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    startingSha = null;
  }

  const report = await runConmedDebtPackageTransactionAnswer({ startingSha });
  const outDir = path.join(process.cwd(), "docs/product/debt-package-transaction-answer");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(outDir, "customer-report.md"), report.customerReportMarkdown);
  writeFileSync(
    path.join(outDir, "answer-sheet.md"),
    buildAnswerSheet(report),
  );
  writeFileSync(
    path.join(outDir, `report-${report.generatedAt.replace(/[:.]/g, "-")}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        packageKey: report.packageKey,
        startingSha: report.startingSha,
        scenarios: report.scenarios.map((s) => ({
          id: s.id,
          status: s.headroom.status,
          assessment: s.assessment,
        })),
        correctnessSummary: report.correctnessSummary,
        capacityRequire: report.pipeline.authenticatedVep.capacityRequireOutcome,
        phase4e: report.pipeline.phase4e,
        remainingBlockers: report.remainingBlockers.slice(0, 6),
        outputs: {
          report: "docs/product/debt-package-transaction-answer/report.json",
          customer: "docs/product/debt-package-transaction-answer/customer-report.md",
          answerSheet: "docs/product/debt-package-transaction-answer/answer-sheet.md",
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  const incorrect = report.correctnessSummary.INCORRECT;
  if (incorrect > 0) process.exitCode = 2;
}

function buildAnswerSheet(report: Awaited<ReturnType<typeof runConmedDebtPackageTransactionAnswer>>): string {
  const lines: string[] = [];
  lines.push("# Independent answer sheet — CONMED debt package");
  lines.push("");
  lines.push("Expectations are authored from `human-ground-truth.ts` and curated Article VII source **before** comparing Headroom output. Engine predictions were not used to write expected answers.");
  lines.push("");
  lines.push("| Scenario | Independent status | Headroom status | Assessment |");
  lines.push("|---|---|---|---|");
  for (const s of report.scenarios) {
    lines.push(
      `| ${s.id} | ${s.independent.expectedStatus} | ${s.headroom.status} | **${s.assessment}** |`,
    );
  }
  lines.push("");
  lines.push("## Independent pathways (source-backed)");
  for (const s of report.scenarios) {
    lines.push(`### ${s.id}`);
    lines.push(`- Pathway: ${s.independent.pathway}`);
    lines.push(`- Document / section: ${s.independent.governingDocument} §${s.independent.section}`);
    lines.push(`- Citation: ${s.independent.sourceCitation}`);
    lines.push(`- Rationale: ${s.independent.rationale}`);
    lines.push(`- Headroom citations: ${s.headroom.sourceCitation.join("; ") || "(none)"}`);
    lines.push("");
  }
  lines.push("## Correctness totals");
  lines.push("```");
  lines.push(JSON.stringify(report.correctnessSummary, null, 2));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
