/**
 * Claim-level accuracy evaluation against independently authored ground truth.
 *
 * Does not invent ground truth. Metrics always include denominators.
 */
import { compareProvisions, type CompareOptions } from "../compare";
import { PrecedentCorpus } from "../corpus";
import { dependencyAwareView } from "../dependency-view";
import type { BenchmarkMetrics, BenchmarkScenario, BenchmarkSplit, ScenarioEvaluation } from "./types";
import { ALL_BENCHMARK_SCENARIOS } from "./scenarios";

function predictsMaterialLegalDifference(scenario: BenchmarkScenario, options: CompareOptions = {}): {
  materialPredicted: boolean;
  record: ReturnType<typeof compareProvisions>;
  citationOk: boolean;
  unsupportedRefused: boolean;
} {
  const opts: CompareOptions = {
    ...options,
    definitionOverlays:
      scenario.leftDefinitionOverlay || scenario.rightDefinitionOverlay
        ? {
            left: scenario.leftDefinitionOverlay ?? null,
            right: scenario.rightDefinitionOverlay ?? null,
          }
        : options.definitionOverlays,
  };
  const record = compareProvisions(scenario.left, scenario.right, opts);
  const materialPredicted = record.claims.some(
    (c) =>
      c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" ||
      c.standing === "REVIEWER_VERIFIED_CONCLUSION",
  );
  const elevated = record.claims.filter(
    (c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" || c.standing === "REVIEWER_VERIFIED_CONCLUSION",
  );
  const citationOk =
    elevated.length === 0 ||
    elevated.every((c) => c.evidence.sourceExcerpts.length > 0 && c.evidence.justification.trim().length > 0);
  const unsupportedRefused = !record.claims.some((c) => c.standing === "REVIEWER_VERIFIED_CONCLUSION" && !c.claimReviewId);
  return { materialPredicted, record, citationOk, unsupportedRefused };
}

export function evaluateScenario(scenario: BenchmarkScenario, baseDir: string = process.cwd()): ScenarioEvaluation {
  const { materialPredicted, record, citationOk, unsupportedRefused } = predictsMaterialLegalDifference(scenario);
  const gt = scenario.groundTruth;
  const textualOk = record.textual.identical === !gt.textualDifference;

  const corpus = new PrecedentCorpus([scenario.left, scenario.right]);
  const dep = dependencyAwareView(corpus, record, { baseDir });
  const qualifiedWhenIncomplete = !gt.controllingContextComplete ? record.comparisonQualified === true || !dep.closureComplete : true;

  const amendmentVersionOk = gt.amendmentVersionMatters
    ? scenario.right.documentRole === "AMENDMENT" ||
      record.claims.some((c) => c.dimension === "AMENDMENT" || /amend/i.test(c.summary))
    : true;

  return {
    scenarioId: scenario.id,
    split: scenario.split,
    category: scenario.category,
    textualOk,
    materialPredicted,
    materialExpected: gt.materialLegalDifference,
    falseMaterialDifference: materialPredicted && !gt.materialLegalDifference,
    missedMaterialDifference: !materialPredicted && gt.materialLegalDifference,
    citationOk,
    dependencyClosureReported: dep.closureComplete === false || dep.missingOrAmbiguousContext.length >= 0,
    amendmentVersionOk,
    unsupportedConclusionRefused: gt.mustRefuseUnsupportedConclusion ? unsupportedRefused : true,
    qualifiedWhenIncomplete,
    notes: [
      `algorithm=${record.textual.algorithm}`,
      `maxStanding=${record.maxStandingAmongClaims}`,
      `closureComplete=${dep.closureComplete}`,
      `qualified=${record.comparisonQualified ?? false}`,
      gt.authorNote,
    ],
  };
}

export function aggregateMetrics(evals: ScenarioEvaluation[], split: BenchmarkSplit | "ALL"): BenchmarkMetrics {
  const rows = split === "ALL" ? evals : evals.filter((e) => e.split === split);
  const n = rows.length;
  const textualOk = rows.filter((e) => e.textualOk).length;
  const predictedPos = rows.filter((e) => e.materialPredicted);
  const expectedPos = rows.filter((e) => e.materialExpected);
  const truePos = rows.filter((e) => e.materialPredicted && e.materialExpected).length;
  const falsePos = rows.filter((e) => e.falseMaterialDifference).length;
  const falseNeg = rows.filter((e) => e.missedMaterialDifference).length;
  const precisionDen = predictedPos.length;
  const recallDen = expectedPos.length;
  const citationDen = rows.length;
  const citationOk = rows.filter((e) => e.citationOk).length;
  const depOk = rows.filter((e) => e.dependencyClosureReported).length;
  const amdOk = rows.filter((e) => e.amendmentVersionOk).length;
  const refuseOk = rows.filter((e) => e.unsupportedConclusionRefused).length;
  const qualOk = rows.filter((e) => e.qualifiedWhenIncomplete).length;

  return {
    split,
    n,
    textualAccuracy: n ? textualOk / n : 0,
    materialPrecision: precisionDen ? truePos / precisionDen : 0,
    materialRecall: recallDen ? truePos / recallDen : 0,
    materialPrecisionDenominator: precisionDen,
    materialRecallDenominator: recallDen,
    falseMaterialDifferenceCount: falsePos,
    missedMaterialDifferenceCount: falseNeg,
    citationCorrectRate: citationDen ? citationOk / citationDen : 0,
    citationDenominator: citationDen,
    dependencyClosureReportedRate: n ? depOk / n : 0,
    amendmentVersionCorrectRate: n ? amdOk / n : 0,
    unsupportedConclusionRefusalRate: n ? refuseOk / n : 0,
    qualifiedIncompleteRate: n ? qualOk / n : 0,
  };
}

export function runBenchmarkSuite(baseDir: string = process.cwd()): {
  evaluations: ScenarioEvaluation[];
  metrics: { all: BenchmarkMetrics; dev: BenchmarkMetrics; heldOut: BenchmarkMetrics };
  falseLegalDifferenceFindings: ScenarioEvaluation[];
} {
  const evaluations = ALL_BENCHMARK_SCENARIOS.map((s) => evaluateScenario(s, baseDir));
  return {
    evaluations,
    metrics: {
      all: aggregateMetrics(evaluations, "ALL"),
      dev: aggregateMetrics(evaluations, "DEV"),
      heldOut: aggregateMetrics(evaluations, "HELD_OUT"),
    },
    falseLegalDifferenceFindings: evaluations.filter((e) => e.falseMaterialDifference),
  };
}
