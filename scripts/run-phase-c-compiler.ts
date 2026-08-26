/**
 * Phase C - runs the real staged compiler (lib/contract-model/compiler/orchestrator.ts)
 * against a real unseen package, using a dedicated fixture Company/Document
 * (never "coherent"/"matthews" - the Phase C compiler must never write
 * ContractRule/DocumentNode rows attributed to either protected company,
 * preserving compatibility.test.ts's own zero-ContractRule-rows-for-Coherent
 * invariant). Persists a resumable JSON log next to the fixture, mirroring
 * scripts/run-phase-c0-analyzer.ts's own discipline, generalized to the
 * staged pipeline's own richer output (per-stage telemetry, promotion
 * decisions, coverage gaps) rather than one combined-call result.
 *
 * Usage: npx tsx scripts/run-phase-c-compiler.ts <fwrg|lsb> [--force]
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";
import { runContractCompiler } from "../lib/contract-model/compiler/orchestrator";
import { evaluateAll } from "../lib/contract-model/analyzer/evaluator";
import type { GroundTruthProvisionLike } from "../lib/contract-model/analyzer/evaluator";

interface PackageDef {
  key: string;
  companyId: string;
  fixtureDir: string;
  documents: { documentId: string; label: string; files: string[] }[];
  groundTruth: GroundTruthProvisionLike[];
}

async function loadPackage(name: string): Promise<PackageDef> {
  if (name === "fwrg") {
    const dir = join(__dirname, "..", "tests", "fixtures", "unseen-packages", "fwrg-2021-credit-agreement");
    const gt = await import(join(dir, "human-ground-truth.ts"));
    return {
      key: "fwrg-2021-credit-agreement",
      companyId: "fixture-fwrg-2021-credit-agreement-co",
      fixtureDir: dir,
      documents: [{ documentId: "fixture-fwrg-2021-credit-agreement-ca", label: "FWRG 2021 Credit Agreement", files: ["definitions-excerpt.txt", "article-6-negative-covenants.txt"] }],
      groundTruth: gt.HUMAN_PROVISIONS,
    };
  }
  if (name === "lsb") {
    const dir = join(__dirname, "..", "tests", "fixtures", "unseen-packages", "lsb-2023-abl-credit-agreement");
    const gt = await import(join(dir, "human-ground-truth.ts"));
    return {
      key: "lsb-2023-abl-credit-agreement",
      companyId: "fixture-lsb-2023-abl-credit-agreement-co",
      fixtureDir: dir,
      documents: [
        { documentId: "fixture-lsb-2023-abl-ca", label: "LSB 2023 ABL Credit Agreement", files: ["definitions-excerpt.txt", "article-6-negative-covenants.txt"] },
        { documentId: "fixture-lsb-2023-abl-joinder", label: "LSB Intercreditor Joinder Agreement", files: ["intercreditor-joinder.txt"] },
      ],
      groundTruth: gt.HUMAN_PROVISIONS,
    };
  }
  throw new Error(`Unknown package: ${name}`);
}

async function main() {
  const name = process.argv[2];
  const force = process.argv.includes("--force");
  if (!name) throw new Error("Usage: npx tsx scripts/run-phase-c-compiler.ts <fwrg|lsb> [--force]");

  const pkg = await loadPackage(name);
  await prisma.company.upsert({ where: { id: pkg.companyId }, create: { id: pkg.companyId, name: `Fixture ${pkg.key} Co (real unseen package, test-only)`, tenantKind: "EVALUATION" }, update: {} });
  for (const doc of pkg.documents) {
    await prisma.document.upsert({ where: { id: doc.documentId }, create: { id: doc.documentId, companyId: pkg.companyId, name: doc.label, type: "CREDIT_AGREEMENT" }, update: {} });
  }

  const documents = pkg.documents.map((doc) => ({
    documentId: doc.documentId,
    label: doc.label,
    text: doc.files.map((f) => readFileSync(join(pkg.fixtureDir, f), "utf-8")).join("\n\n"),
  }));

  console.log(`[run] package=${pkg.key} companyId=${pkg.companyId} documents=${documents.length}`);
  const summary = await runContractCompiler({ companyId: pkg.companyId, packageKey: pkg.key, documents }, { force });

  const evaluation = evaluateAll(pkg.groundTruth, summary.rules, summary.definedTerms);

  console.log("\n=== Stages ===");
  for (const s of summary.stages) console.log(`  ${s.stage}: ${s.status}`);

  console.log("\n=== Evaluation (blind, against independent human ground truth) ===");
  console.log(`total=${evaluation.total} correct=${evaluation.matchedCorrect} flagged=${evaluation.matchedIncorrectFlagged} unflagged=${evaluation.matchedIncorrectUnflagged} missing=${evaluation.missing}`);
  console.log(`DANGEROUS_UNFLAGGED_ERROR_RATE=${(evaluation.dangerousUnflaggedErrorRate * 100).toFixed(1)}% DANGEROUS_FLAGGED_ERROR_RATE=${(evaluation.dangerousFlaggedErrorRate * 100).toFixed(1)}%`);

  console.log("\n=== Promotion decisions ===");
  const byState = new Map<string, number>();
  for (const d of summary.promotionDecisions) byState.set(d.executabilityState, (byState.get(d.executabilityState) ?? 0) + 1);
  for (const [state, count] of byState) console.log(`  ${state}: ${count}`);

  console.log(`\nvalidationOk=${summary.validationOk} coverageGapCount=${summary.coverageGapCount} relationshipsPersisted=${summary.relationshipsPersisted} referencesPersisted=${summary.referencesPersisted}`);

  const stageRows = await prisma.contractCompilerStage.findMany({ where: { runId: summary.runId } });
  const totalCost = stageRows.reduce((sum, s) => sum + (((s.telemetry as { calculatedCostUsd?: number } | null)?.calculatedCostUsd) ?? 0), 0);
  const totalInputTokens = stageRows.reduce((sum, s) => sum + (((s.telemetry as { inputTokens?: number } | null)?.inputTokens) ?? 0), 0);
  const totalOutputTokens = stageRows.reduce((sum, s) => sum + (((s.telemetry as { outputTokens?: number } | null)?.outputTokens) ?? 0), 0);
  console.log(`\n=== Real cost/token totals across all stages ===\ntotalCostUsd=${totalCost.toFixed(4)} totalInputTokens=${totalInputTokens} totalOutputTokens=${totalOutputTokens}`);

  const logDir = join(pkg.fixtureDir, "compiler-runs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `run-${Date.now()}.json`);
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        packageKey: pkg.key,
        runId: summary.runId,
        stages: summary.stages,
        evaluation,
        promotionDecisions: summary.promotionDecisions,
        validationOk: summary.validationOk,
        coverageGapCount: summary.coverageGapCount,
        relationshipsPersisted: summary.relationshipsPersisted,
        referencesPersisted: summary.referencesPersisted,
        stageTelemetry: stageRows.map((s) => ({ stage: s.stage, provider: s.provider, model: s.model, telemetry: s.telemetry })),
        totals: { totalCostUsd: totalCost, totalInputTokens, totalOutputTokens },
      },
      null,
      2
    )
  );
  console.log(`\n[saved] ${logPath}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
