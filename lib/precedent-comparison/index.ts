/**
 * Precedent Comparison Intelligence — public exports.
 *
 * Sidecar over existing Headroom knowledge interfaces (evaluation-v2 signals).
 * Does not modify the production legal engine or Prisma schema.
 */
export { createPrecedentComparisonApi, compareFamilyFeatureSlice, loadCorpusFromJson } from "./api";
export type { PrecedentComparisonApi } from "./api";
export { PrecedentCorpus, getDefaultCorpus, setDefaultCorpusForTests } from "./corpus";
export type { CorpusFile, CorpusProvisionJson } from "./corpus";
export { compareProvisions } from "./compare";
export { exactTextDiff, asymmetricPhraseDiff } from "./diff";
export { detectDraftingFeatures, profileProvision, featureOverlap } from "./features";
export { retrieveComparableProvisions, searchExamples } from "./retrieve";
export { identifyDraftingPatterns, commonPatterns, uncommonPatterns } from "./patterns";
export { dependencyAwareView, buildDependencyLinks } from "./dependency-view";
export { retrieveCounterexamples } from "./counterexamples";
export { compareOriginalAndAmendment, listAmendmentPairs } from "./amendments";
export { signalsForProvision, normalizeText, tokenizeSource } from "./knowledge";
export {
  PRECEDENT_COMPARISON_SCHEMA_VERSION,
  COMPARABLE_COVENANT_FAMILIES,
  COMPARISON_DISCLAIMER,
} from "./types";
export type {
  ComparisonStanding,
  ProvisionReviewStatus,
  DocumentRole,
  ComparableCovenantFamily,
  DraftingFeature,
  SourceLocator,
  PrecedentProvision,
  DraftingFeatureProfile,
  ExactTextDiff,
  ExactTextDiffHunk,
  ComparisonClaim,
  PrecedentComparisonRecord,
  PatternFrequency,
  DependencyLink,
  DependencyAwareComparisonView,
  RetrievalQuery,
  RetrievalHit,
  CounterexampleQuery,
  CounterexampleHit,
} from "./types";
