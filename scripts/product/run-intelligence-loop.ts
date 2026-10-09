/**
 * Background-friendly Covenant Intelligence Loop runner.
 *
 *   npx tsx scripts/product/run-intelligence-loop.ts --vertical-slice
 *   npx tsx scripts/product/run-intelligence-loop.ts --limit 5 --exercises debt.secured.100,rp.dividend.50
 *   npx tsx scripts/product/run-intelligence-loop.ts --source-id <id>
 *   npx tsx scripts/product/run-intelligence-loop.ts --company-id <id>
 *   npx tsx scripts/product/run-intelligence-loop.ts --full-library --limit 3
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import {
  EXERCISE_LIBRARY,
  runCovenantIntelligenceLoop,
  runVerticalSlice,
} from "../../lib/product/covenant-intelligence-loop";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const vertical = has("--vertical-slice") || has("--vertical");
  const fullLibrary = has("--full-library");
  const sourceId = arg("--source-id");
  const companyId = arg("--company-id");
  const prefer = (arg("--prefer") ?? "CONMED,CNMD,RIOT").split(",").map((s) => s.trim()).filter(Boolean);
  const limit = Number(arg("--limit") ?? (vertical ? "3" : "5"));
  const exerciseLimit = Number(arg("--exercise-limit") ?? (fullLibrary ? String(EXERCISE_LIBRARY.length) : vertical ? "1" : "12"));
  const exercises = arg("--exercises")?.split(",").map((s) => s.trim()).filter(Boolean);
  const runId = arg("--run-id");
  const publishCompanyId = arg("--publish-company") ?? companyId;
  const useFixture = has("--fixture-conmed") || (vertical && has("--fixture"));
  const neonOnly = has("--neon");

  const opts = {
    sourceIds: sourceId ? [sourceId] : undefined,
    companyId,
    preferIssuer: prefer,
    documentLimit: Number.isFinite(limit) ? limit : 5,
    exerciseLimit: Number.isFinite(exerciseLimit) ? exerciseLimit : 12,
    exerciseIds: exercises,
    runId,
    resume: has("--resume"),
    reexerciseOnImprove: !has("--no-reexercise"),
    publishCompanyId: publishCompanyId ?? undefined,
    useConmedFixture: useFixture ? true : neonOnly ? false : undefined,
    scope: companyId ? ("CUSTOMER" as const) : sourceId ? ("SINGLE_SOURCE" as const) : ("PUBLIC_CORPUS" as const),
  };

  console.log(
    JSON.stringify(
      {
        mode: vertical ? "vertical-slice" : fullLibrary ? "full-library" : "scoped",
        librarySize: EXERCISE_LIBRARY.length,
        opts: { ...opts, preferIssuer: prefer },
      },
      null,
      2,
    ),
  );

  const run = vertical
    ? await runVerticalSlice(opts)
    : await runCovenantIntelligenceLoop({
        ...opts,
        verticalSlice: false,
        exerciseIds: exercises ?? (fullLibrary ? undefined : ["debt.secured.100", "debt.unsecured.50", "lien.secure_new_debt", "rp.dividend.50", "ratio.total_leverage"]),
      });

  const outDir = path.join("docs", "product", "covenant-intelligence-loop");
  mkdirSync(outDir, { recursive: true });

  const summary = {
    runId: run.runId,
    stages: run.stages.map((s) => ({ stage: s.stage, status: s.status, message: s.message })),
    publishSummary: run.publishSummary,
    sourceIds: run.sourceIds,
    sampleResults: run.exerciseResults.slice(0, 12).map((r) => ({
      exerciseId: r.exerciseId,
      sourceId: r.sourceId,
      outcome: r.outcome,
      citations: r.citations.length,
      citationSections: r.citations.map((c) => c.sectionRef).slice(0, 6),
      baskets: r.baskets.slice(0, 4),
      definitions: r.definitions.slice(0, 6),
      gaps: r.gaps.map((g) => `${g.origin}:${g.category}`),
      missingInputs: r.missingInputs,
      conditionalFormula: r.conditionalFormula?.slice(0, 400),
      headline: r.headline,
    })),
    openEngineeringTasks: run.engineeringTasks.filter((t) => t.status === "OPEN").slice(0, 8),
    patternsCaptured: run.patternsCaptured.slice(0, 20),
  };
  writeFileSync(path.join(outDir, "latest-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  if (has("--write-full-run")) {
    const outFile = path.join(outDir, `${run.runId}.json`);
    writeFileSync(outFile, JSON.stringify(run, null, 2) + "\n");
    console.log(`full run written to ${outFile}`);
  }
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
