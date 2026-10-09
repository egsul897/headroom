/**
 * Independent evaluation benchmark scaffold.
 * Dataset-author expectations are separated from independently reviewed GT.
 * Performance metrics are NOT reported until a compiler/model is actually executed.
 */
import type { SourceToCovenantRecordV2 } from "./types-v2";

export type BenchmarkChallenge =
  | "FALSE_AFFIRMATIVE_PERMISSION"
  | "COMPARATOR_THRESHOLD"
  | "REMOTE_PROVISO"
  | "DEFINITION_LEVEL_AMENDMENT"
  | "SHARED_CAPACITY_RESTRICTION"
  | "ENTITY_SCOPE"
  | "RECLASSIFICATION"
  | "CROSS_DOCUMENT_CONDITION"
  | "MISSING_FINANCIAL_INPUT"
  | "UNSUPPORTED_OR_AMBIGUOUS";

export interface BenchmarkCase {
  caseId: string;
  exampleId: string;
  challenges: BenchmarkChallenge[];
  datasetAuthorExpectation: string;
  independentlyReviewedGroundTruth: null;
  execution: {
    compilerOrModelExecuted: false;
    result: null;
    metrics: null;
  };
}

function inferChallenges(r: SourceToCovenantRecordV2): BenchmarkChallenge[] {
  const challenges: BenchmarkChallenge[] = [];
  const text = r.input.exactText;
  if (r.output.verificationStatus === "MODEL_HYPOTHESIS") challenges.push("FALSE_AFFIRMATIVE_PERMISSION");
  if (/greater of|less than|at least|exceed|:/i.test(text) && /\$|%|Ratio/i.test(text)) challenges.push("COMPARATOR_THRESHOLD");
  if (/provided that|provided,|Payment Conditions|so long as/i.test(text)) challenges.push("REMOTE_PROVISO");
  if (r.operativeVersion.amendmentIdentity && r.role === "AMENDMENT_EFFECT") challenges.push("DEFINITION_LEVEL_AMENDMENT");
  if (/Available Amount|shared|in aggregate|together with/i.test(text) || r.output.proposedDependencyEdges.some((e) => /SHARE/i.test(e.edgeType)))
    challenges.push("SHARED_CAPACITY_RESTRICTION");
  if (/Loan Party|Restricted Subsidiary|Guarantor|non-Guarantor/i.test(text)) challenges.push("ENTITY_SCOPE");
  if (/reclassif/i.test(text)) challenges.push("RECLASSIFICATION");
  if (r.role === "UNSUPPORTED_SEMANTICS" || /Intercreditor|cross-document/i.test(r.output.labelNotes)) challenges.push("CROSS_DOCUMENT_CONDITION");
  if (r.output.missingInputs.some((m) => /EBITDA|Availability|financial|assets/i.test(m)) || /EBITDA|Availability/i.test(text))
    challenges.push("MISSING_FINANCIAL_INPUT");
  if (r.output.verificationStatus === "UNSUPPORTED" || r.output.verificationStatus === "UNRESOLVED" || r.role === "UNSUPPORTED_SEMANTICS")
    challenges.push("UNSUPPORTED_OR_AMBIGUOUS");
  if (!challenges.length) challenges.push("UNSUPPORTED_OR_AMBIGUOUS");
  return [...new Set(challenges)];
}

export function buildEvaluationBenchmark(records: readonly SourceToCovenantRecordV2[]): {
  schemaVersion: "source-to-covenant-eval-benchmark.v1";
  compilerOrModelExecuted: false;
  performanceMetricsReported: false;
  reason: string;
  cases: BenchmarkCase[];
} {
  const prioritized = records.filter(
    (r) =>
      r.split === "eval-heldout" ||
      r.output.verificationStatus === "MODEL_HYPOTHESIS" ||
      r.output.verificationStatus === "UNRESOLVED" ||
      r.output.verificationStatus === "UNSUPPORTED" ||
      r.role === "UNSUPPORTED_SEMANTICS" ||
      r.role === "AMENDMENT_EFFECT" ||
      r.controllingContextAudit.status === "CONTEXT_INCOMPLETE",
  );

  const cases: BenchmarkCase[] = prioritized.map((r) => ({
    caseId: `bench-${r.exampleId}`,
    exampleId: r.exampleId,
    challenges: inferChallenges(r),
    datasetAuthorExpectation: r.datasetAuthorExpectation ?? r.output.proposedFormulaOrCapacity.description,
    independentlyReviewedGroundTruth: null,
    execution: {
      compilerOrModelExecuted: false,
      result: null,
      metrics: null,
    },
  }));

  return {
    schemaVersion: "source-to-covenant-eval-benchmark.v1",
    compilerOrModelExecuted: false,
    performanceMetricsReported: false,
    reason: "No compiler or model was executed against this benchmark in Phase 2. Metrics withheld by policy.",
    cases,
  };
}
