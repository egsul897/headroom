/**
 * Run the eight mandated capacity-loop exercises against the demo customer workspace
 * (or --company-id). Persists results via the intelligence loop + writes a report.
 *
 *   npx tsx scripts/product/run-capacity-loop-exercises.ts
 *   npx tsx scripts/product/run-capacity-loop-exercises.ts --company-id demo-customer-workflow
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { getCompanyDashboard } from "../../lib/dashboard-service";
import { loadDebtIntelligenceDashboard } from "../../lib/product/customer-intelligence/debt-intelligence";
import { loadCapacityReadiness } from "../../lib/product/customer-intelligence/capacity-readiness";
import { runCovenantIntelligenceLoop } from "../../lib/product/covenant-intelligence-loop";

const MANDATE_EXERCISES = [
  "debt.secured.100",
  "debt.unsecured.150",
  "rp.dividend.50",
  "inv.75",
  "debt.non_guarantor",
  "ratio.ebitda_down_20",
  "amd.refinance",
  "amd.threshold_change",
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const companyId = arg("--company-id") ?? "demo-customer-workflow";
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new Error(
      `Company ${companyId} not found. Run npm run product:customer-workflow-demo first.`,
    );
  }

  const loop = await runCovenantIntelligenceLoop({
    companyId,
    exerciseIds: MANDATE_EXERCISES,
    exerciseLimit: MANDATE_EXERCISES.length,
    reexerciseOnImprove: true,
    publishCompanyId: companyId,
  });

  const [capacity, intelligence, engineDash] = await Promise.all([
    loadCapacityReadiness(companyId),
    loadDebtIntelligenceDashboard(companyId),
    getCompanyDashboard(companyId).catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    })),
  ]);

  const report = {
    companyId,
    runId: loop.runId,
    mandateExercises: MANDATE_EXERCISES,
    publishSummary: loop.publishSummary,
    stages: loop.stages.map((s) => ({ stage: s.stage, status: s.status, message: s.message })),
    exerciseOutcomes: loop.exerciseResults.map((r) => ({
      exerciseId: r.exerciseId,
      outcome: r.outcome,
      citations: r.citations.length,
      missingInputs: r.missingInputs,
      gaps: r.gaps.map((g) => `${g.origin}:${g.category}`),
      headline: r.headline,
      conditionalFormula: r.conditionalFormula?.slice(0, 240),
    })),
    engineeringTasks: loop.engineeringTasks.filter((t) => t.status === "OPEN").slice(0, 10),
    capacity,
    intelligence: {
      rulebookStage: intelligence.rulebookStage,
      capacityStatus: intelligence.capacityStatus,
      basketsComputed: intelligence.baskets.filter((b) => b.status === "COMPUTED").length,
      ratiosComputed: intelligence.ratios.filter((r) => r.status === "COMPUTED").length,
      proForma: intelligence.proForma,
      sampleBaskets: intelligence.baskets
        .filter((b) => b.status === "COMPUTED" || b.reviewDecision)
        .slice(0, 6),
    },
    engineCapacity:
      "error" in engineDash
        ? engineDash
        : {
            securedRemaining: engineDash.capacity.secured.remainingCapacity,
            securedStatus: engineDash.capacity.secured.status,
            unsecuredRemaining: engineDash.capacity.unsecured.remainingCapacity,
            unsecuredStatus: engineDash.capacity.unsecured.status,
            permissionsTotal: engineDash.legalReview.permissionsTotal,
          },
  };

  const outDir = path.join("docs", "product", "customer-workflow");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "capacity-loop-exercises.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
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
