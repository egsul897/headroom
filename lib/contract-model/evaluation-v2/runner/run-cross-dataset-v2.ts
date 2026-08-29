/**
 * Phase 3F.1.5.2 — Section 24 cross-dataset generality regression. Re-runs
 * the EXACT SAME (now-remediated) engine against FWRG, LSB and CONMED with
 * ZERO tuning, mirroring run-cross-dataset.ts's computation exactly but
 * writing the result under docs/evaluation-v2-iteration-2/ instead of
 * docs/evaluation-v2/ (run-cross-dataset.ts's writeArtifact() hardcodes
 * ARTIFACT_DIR="docs/evaluation-v2", which would silently overwrite that
 * frozen Phase 3F.1.5 artifact — never touch it).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadConmedDataset, loadFwrgDataset, loadLsbDataset } from "../adapters/legacy-package";
import type { LegacyDataset } from "../adapters/legacy-package";
import { runEvaluationV2 } from "../index";
import { contentHash } from "../identity";

const DRAFTING_STYLE: Record<string, string> = {
  "fwrg-2021-credit-agreement":
    "Single-document sponsor-style credit agreement with greater-of grower baskets and an Available Amount builder. Candidate pool includes a real analyzer run's rule/defined-term output, so substantive representations actually exist here.",
  "lsb-2023-abl-credit-agreement":
    "ABL drafting: Payment Conditions as a reused named condition, availability tests, and an out-of-package intercreditor joinder. Tests whether qualitative, non-numeric gates are handled without falling back to numeric matching.",
  "conmed-2025-credit-facility":
    "Amendment-heavy four-document package including an amendment to a document that is deliberately NOT in the package. Candidate pool is discovery inventory plus independent coverage-audit findings — there is no compiled representation layer at all, which is exactly the case where a proximity-based scorer would manufacture credit.",
};

async function main() {
  const repoRoot = process.cwd();
  const datasets: LegacyDataset[] = [loadFwrgDataset(repoRoot), loadLsbDataset(repoRoot), loadConmedDataset(repoRoot)];
  const runs: { datasetKey: string; result: Awaited<ReturnType<typeof runEvaluationV2>>; dataset: LegacyDataset }[] = [];

  for (const dataset of datasets) {
    const result = await runEvaluationV2(dataset.groundTruth, dataset.candidates, {
      datasetKey: dataset.datasetKey,
      inputHashes: dataset.inputHashes,
    });
    runs.push({ datasetKey: dataset.datasetKey, result, dataset });
    console.error(`${dataset.datasetKey}: ${result.units.length} units, byMatchStatus=${JSON.stringify(result.metrics.byMatchStatus)}, dangerous=${result.metrics.dangerousUnaccountedCount}`);
  }

  const perDataset = runs.map(({ datasetKey, result, dataset }) => ({
    datasetKey,
    draftingStyle: DRAFTING_STYLE[datasetKey] ?? "",
    groundTruthUnits: dataset.groundTruth.length,
    candidatePool: dataset.candidates.length,
    droppedContentFreeCandidates: dataset.droppedContentFreeCandidates,
    inputHashes: dataset.inputHashes,
    metrics: result.metrics,
    performance: result.performance,
  }));

  const payload = {
    schemaVersion: "1.0",
    evaluationVersion: "phase-3f1-5-2-targeted-semantic-match-calibration.v1",
    artifactId: "PHASE_3F1_5_2_CROSS_DATASET_REGRESSION",
    generatedAt: new Date().toISOString(),
    purpose: "Section 24: after the 51-case methodology is frozen, rerun evaluator regression on FWRG/LSB/CONMED without tuning, to confirm the fixes made for the DSGR-observed defects are genuinely general (no package-specific/term-specific branches were introduced) and cause no regression on these permanent regression datasets.",
    packageStatusDisclosure: "FWRG, LSB and CONMED are permanent regression evidence, never unseen packages (architecture invariant #28). Nothing here re-labels them.",
    priorFrozenBaselineForComparison: "docs/evaluation-v2/09-cross-dataset-generalization.json (Phase 3F.1.5, byte-identical, untouched by this phase).",
    engineChangesThisPhase: [
      "conflicts.ts: added SOLE_DIMENSION_OBJECT_THRESHOLD/SOLE_DIMENSION_MIN_SHARED_TERMS",
      "semantic-correspondence.ts: stricter C_OBJECT_RESOURCE bar when gtActions.length === 0",
      "source-excerpt.ts: DEFINITION excerpt-resolution returns UNRESOLVED instead of falling through to the wrong span",
    ],
    datasets: perDataset,
    generalitySummary: perDataset.map((d) => ({
      datasetKey: d.datasetKey,
      groundTruthUnits: d.groundTruthUnits,
      candidatePool: d.candidatePool,
      byMatchStatus: d.metrics.byMatchStatus,
      combinedCriticalMaterialRecall: d.metrics.combinedCriticalMaterialRecall.rate,
      dangerousUnaccountedCount: d.metrics.dangerousUnaccountedCount,
      inventoryOnlySurfacedRate: d.metrics.inventoryOnlySurfacedRate.rate,
      candidateGenerationPrecision: d.metrics.candidateGenerationPrecision.rate,
    })),
  };

  const outPath = join(repoRoot, "docs/evaluation-v2-iteration-2/13-cross-dataset-regression.json");
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(outPath, body);
  console.error(`Wrote docs/evaluation-v2-iteration-2/13-cross-dataset-regression.json sha256=${contentHash(payload)} bytes=${Buffer.byteLength(body)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
