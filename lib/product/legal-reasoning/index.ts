/**
 * Product legal-reasoning surface — dependency traversal, adversarial persist,
 * counsel feedback intelligence, structural quality, benchmarks, precedent clauses.
 */

export {
  retrieveTransactionDependencies,
  inferTransactionKind,
  type TransactionKind,
  type TaggedProvision,
  type TransactionDependencyBundle,
} from "./transaction-deps";

export {
  persistAdversarialDisagreements,
  listOpenAdversarialDisagreements,
  resolveAdversarialDisagreement,
  type AdversarialDisagreement,
  type DisagreementStatus,
} from "./adversarial-store";

export {
  captureCounselFeedback,
  listCounselFeedback,
  summarizeCounselFeedback,
  type CounselFeedbackRecord,
  type CounselErrorCategory,
} from "./counsel-feedback";

export {
  assessStructuralQuality,
  collectAmbiguousProvisions,
  type StructuralQualityReport,
  type ProvisionIntelligenceRow,
} from "./structural-quality";

export {
  normalizePartyName,
  padCik,
  buildPartyIdentity,
  partiesLikelySame,
  type NormalizedPartyIdentity,
} from "./party-identity";

export {
  buildTransactionAnalysisScaffold,
  type TransactionAnalysisScaffold,
  type AnalysisChecklistStep,
} from "./analysis-checklist";

export {
  LEGAL_BENCHMARK_CASES,
  listBenchmarkCases,
  scoreAgainstAdjudicated,
  type LegalBenchmarkCase,
  type BenchmarkCaseKind,
  type BenchmarkScorecard,
  type BenchmarkMetric,
} from "./benchmark-cases";

export {
  searchPrecedentClauses,
  listPrecedentClauseQueries,
  type PrecedentClauseQuery,
  type PrecedentClauseHit,
} from "./precedent-clause-search";

export {
  persistAmendmentGraph,
  loadAmendmentGraphCoverage,
  type AmendmentGraphPersistResult,
} from "./amendment-graph";

export {
  discoverProvisionEdgesFromItems,
  persistProvisionGraph,
  type ProvisionGraphEdge,
  type ProvisionGraphPersistResult,
} from "./provision-graph";

export {
  scoreDocumentQuality,
  suggestCategoryForUnknown,
  type DocumentQualityScore,
} from "./document-quality";

export {
  generateExercisesFromSource,
  type GeneratedExercise,
} from "./exercise-factory";
