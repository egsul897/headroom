/**
 * Demonstrate the learning factory on multiple genuinely distinct issuers
 * using the same canonical compiler runtime (compileFrozenDebtPackage).
 *
 * Default: MTN (TRAIN_DEV) + MHK (HELD_OUT) + ROCK/Gibraltar when present.
 *
 *   npx tsx scripts/covenant-learning-factory/demo-unseen.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runLearningBatch, listLearningPackages } from "../../lib/covenant-learning-factory";

async function main() {
  const repoRoot = process.cwd();
  const available = listLearningPackages(repoRoot);
  const preferred = [
    "mtn-2026-tenth-ar-credit-agreement",
    "mhk-2026-credit-agreement",
    "gibraltar-2026-credit-agreement",
    "chwy-2026-credit-agreement",
  ].filter((k) => available.some((p) => p.packageKey === k));

  if (preferred.length < 2) {
    throw new Error(`Need at least 2 demo packages; found: ${preferred.join(",") || "(none)"}`);
  }

  const result = await runLearningBatch({
    packageKeys: preferred,
    force: true,
    persistNeon: process.argv.includes("--persist-neon"),
    budget: {
      maxPackages: preferred.length,
      maxWallMs: 25 * 60 * 1000,
      maxEstimatedUsd: 0,
      maxRetriesPerPackage: 0,
    },
  });

  const outDir = path.join(repoRoot, "docs/covenant-learning-factory");
  mkdirSync(outDir, { recursive: true });
  const demo = {
    schemaVersion: "covenant-learning-factory.demo-unseen.v1",
    generatedAt: new Date().toISOString(),
    packageKeys: preferred,
    issuers: preferred.map((k) => {
      const p = available.find((x) => x.packageKey === k)!;
      return {
        packageKey: k,
        issuerCik: p.issuerCik,
        issuerTicker: p.issuerTicker,
        cohort: p.cohort,
      };
    }),
    results: result.manifests
      .filter((m) => preferred.includes(m.packageKey))
      .map((m) => ({
        packageKey: m.packageKey,
        cohort: m.cohort,
        status: m.status,
        compilerVersion: m.compilerVersion,
        compileSummary: m.compileSummary,
        evaluation: m.evaluation
          ? {
              sourceFidelityPass: m.evaluation.sourceFidelityPass,
              coverageScore: m.evaluation.coverageScore,
              dangerousOmissionCount: m.evaluation.dangerousOmissionCount,
              abstentionCount: m.evaluation.abstentionCount,
              verifiedExecutableUnits: m.evaluation.verifiedExecutableUnits,
              unsupportedUnits: m.evaluation.unsupportedUnits,
            }
          : null,
        errorClasses: [...new Set(m.errors.map((e) => e.class))],
        improvementProposals: m.improvementProposals.length,
        claims: m.claims,
      })),
    sameCanonicalCompiler: true,
    paidInferenceUsed: result.manifests.some((m) => m.compileSummary?.paidInferenceUsed),
    honesty: {
      trained: false,
      certified: false,
      generalized: false,
      productionReady: false,
      note: "Precedent processing ≠ training/certification/production authority",
    },
  };

  writeFileSync(path.join(outDir, "demo-unseen.json"), JSON.stringify(demo, null, 2) + "\n");
  console.log(JSON.stringify(demo, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
