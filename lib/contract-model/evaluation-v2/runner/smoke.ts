/**
 * Evaluation Methodology V2 — developer smoke runner.
 *
 * Phase 3F.1.5. Loads the frozen DSGR dataset, runs the deterministic engine,
 * and prints headline counts. Produces no artifact; the artifact-producing
 * runners are run-dsgr.ts / run-cross-dataset.ts / run-adversarial.ts.
 *
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/smoke.ts
 */
import { loadDsgrDataset, DSGR_DATASET_KEY } from "../adapters/dsgr";
import { runEvaluationV2 } from "../index";

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const t0 = Date.now();
  const dataset = loadDsgrDataset(repoRoot);
  console.log(`loaded in ${Date.now() - t0}ms: ${dataset.groundTruth.length} GT units, ${dataset.candidates.length} candidates (${dataset.droppedContentFreeCandidates} content-free dropped)`);

  const result = await runEvaluationV2(dataset.groundTruth, dataset.candidates, {
    datasetKey: DSGR_DATASET_KEY,
    inputHashes: dataset.inputHashes,
    adapterQualityFindings: dataset.qualityFindings,
  });
  console.log("performance:", result.performance);
  console.log("byMatchStatus:", result.metrics.byMatchStatus);
  console.log("dangerousUnaccountedCount:", result.metrics.dangerousUnaccountedCount);
  console.log("criticalRecall:", result.metrics.criticalSemanticRecall.rate, `(${result.metrics.criticalSemanticRecall.numerator}/${result.metrics.criticalSemanticRecall.denominator})`);

  const suspects = [
    "doc-a::VI::6.01-chapeau",
    "doc-a::VI::6.05-chapeau",
    "doc-d::VI::6-01-chapeau",
    "doc-a::VI::6.10-chapeau",
  ];
  for (const id of suspects) {
    const u = result.units.find((x) => x.gtUnitId === id);
    if (!u) {
      console.log(`  ${id}: NOT FOUND`);
      continue;
    }
    console.log(`  ${id}: ${u.matchStatus} / ${u.representationStatus} dangerous=${u.dangerousUnaccountedV2} matched=[${u.matchedCandidateIds.join(", ")}] pairs=${u.pairAssessments.length}`);
    console.log(`     role=${u.provisionRole} reason=${(u.reasonForCredit ?? u.reasonForPartialCredit ?? u.reasonForNoCredit ?? "").slice(0, 200)}`);
  }
}

void main();
