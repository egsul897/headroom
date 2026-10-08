/**
 * Precedent Comparison Intelligence — public exports (Phase 2).
 */
export { createPrecedentComparisonApi, compareFamilyFeatureSlice, loadCorpusFromJson } from "./api";
export type { PrecedentComparisonApi } from "./api";
export { PrecedentCorpus, getDefaultCorpus, setDefaultCorpusForTests, isHeldOutEval } from "./corpus";
export type { CorpusFile, CorpusProvisionJson } from "./corpus";
export { HELD_OUT_CKG_TAG } from "./types";
export type { EvalIsolation } from "./types";
export { compareProvisions } from "./compare";
export type { CompareOptions } from "./compare";
export { exactTextDiff, asymmetricPhraseDiff, benchmarkDiff, myersLineDiff } from "./diff";
export { detectDraftingFeatures, profileProvision, featureOverlap } from "./features";
export { retrieveComparableProvisions, searchExamples } from "./retrieve";
export { identifyDraftingPatterns, commonPatterns, uncommonPatterns } from "./patterns";
export { dependencyAwareView, buildDependencyLinks } from "./dependency-view";
export { retrieveCounterexamples } from "./counterexamples";
export { compareOriginalAndAmendment, listAmendmentPairs } from "./amendments";
export { signalsForProvision, normalizeText, tokenizeSource } from "./knowledge";
export { makeClaim, applyClaimReviews, evidenceFromExcerpts, maxStandingAmongClaims, EpistemicBoundaryError } from "./epistemic";
export { auditElevatedStandingEmissions, ELEVATED_STANDINGS } from "./epistemic-audit";
export type { StandingEmissionSite, ElevatedStanding } from "./epistemic-audit";
export { validateSourceSpan, validateCorpusSpans } from "./source-span";
export { sha256Hex } from "./hash";
export { loadDependencyAtlas, atlasEdgesForSection } from "./adapters/dependency-atlas";
export { loadDefinitionEncyclopedia, encyclopediaHitsForTerm } from "./adapters/definition-encyclopedia";
export { loadEdgarAcquisitionQueue } from "./adapters/edgar-backfill";
export { loadKnowledgeFactoryCorpus } from "./adapters/knowledge-factory";
export { loadAmendmentChainResearch } from "./adapters/amendment-chain";
export { loadFinancialDefinitionsPrecedent } from "./adapters/financial-definitions-precedent";
export { loadNegativeCovenantExceptionDatabase } from "./adapters/negative-covenant-exceptions";
export { auditCorpus, clusterDuplicateSpans, stratifiedSample } from "./validation/corpus-audit";
export type { CorpusAuditReport } from "./validation/corpus-audit";
export { ALL_BENCHMARK_SCENARIOS, DEV_SCENARIOS, HELD_OUT_SCENARIOS, benchmarkScenarioCounts } from "./benchmark/scenarios";
export { runBenchmarkSuite, evaluateScenario, aggregateMetrics } from "./benchmark/evaluate";
export type { BenchmarkScenario, BenchmarkMetrics, ScenarioEvaluation } from "./benchmark/types";
export { runDiffBenchmarkSuite, buildDiffBenchmarkCases } from "./diff-benchmark";
export {
  ALL_QUALITY_SCENARIOS,
  reviewForClaim,
  QUALITY_REVIEWER,
} from "./quality/reviewed-examples";
export {
  PRECEDENT_COMPARISON_SCHEMA_VERSION,
  COMPARABLE_COVENANT_FAMILIES,
  COMPARISON_DISCLAIMER,
  STANDING_ROLLUP_NOTE,
} from "./types";
export type {
  ComparisonStanding,
  ProvisionReviewStatus,
  DocumentRole,
  AgreementType,
  ComparableCovenantFamily,
  DraftingFeature,
  SourceLocator,
  PrecedentProvision,
  DraftingFeatureProfile,
  ExactTextDiff,
  ExactTextDiffHunk,
  ComparisonClaim,
  ClaimEvidence,
  ClaimReviewRecord,
  PrecedentComparisonRecord,
  PatternFrequency,
  DependencyLink,
  DependencyAwareComparisonView,
  RetrievalQuery,
  RetrievalHit,
  CounterexampleQuery,
  CounterexampleHit,
  CorpusStatistics,
} from "./types";
