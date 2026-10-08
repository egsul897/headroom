/**
 * Build source-to-covenant dataset (Phase 2 ground-truth integrity).
 * Offline only — no paid inference.
 */
import { resolve } from "path";
import { writePhase2Artifacts } from "../../lib/source-to-covenant-dataset/phase2-build";

function main() {
  const repoRoot = resolve(__dirname, "../..");
  const report = writePhase2Artifacts(repoRoot);
  console.log(JSON.stringify({
    totalRecords: report.expansion.totalRecords,
    authenticExamplesAdded: report.expansion.authenticExamplesAdded,
    independentlyVerified: report.verificationClaims.independentlyVerifiedAfterAudit,
    lackingIndependentReview: report.verificationClaims.lackingIndependentReview,
    demoted: report.verificationClaims.previouslyClaimedHumanSourceVerified,
    contextComplete: report.controllingContext.controllingContextComplete,
    contextIncomplete: report.controllingContext.contextIncomplete,
    trainingEligible: report.eligibility.trainingEligibleCount,
    evaluationEligible: report.eligibility.evaluationEligibleCount,
    sftExportBlocked: report.eligibility.sftExportBlocked,
    distinctIssuers: report.expansion.distinctIssuers,
    issuerTargetMet: report.expansion.issuerTargetMet,
    kfImportable: report.importResults.recordsAcceptedForImport,
    benchmarkCases: report.evaluationBenchmark.caseCount,
    performanceMetricsReported: report.evaluationBenchmark.performanceMetricsReported,
  }, null, 2));
}

main();
