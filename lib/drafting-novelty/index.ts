export { DRAFTING_NOVELTY_VERSION } from "./types";
export type {
  AcquisitionRecommendation,
  ClusterSummary,
  CorpusCoverageReport,
  DocumentSource,
  DraftingCategory,
  DraftingUnit,
  LexicalNeighbor,
  NoveltyFinding,
  NoveltyRunResult,
  ReviewerQueueItem,
  SignatureToken,
  SourceSpan,
  StructuralSignature,
  SuspectedFailureMode,
} from "./types";

export { DRAFTING_NOVELTY_PHASE2_VERSION } from "./phase2-types";
export type {
  AcquiredAgreementManifest,
  BalancedNoveltyReport,
  ContextCompleteness,
  ControllingContext,
  HighRiskDraftingExample,
  IndependentReviewItem,
  IndependentReviewLabel,
  IndependentReviewReport,
  KnowledgeFactoryNoveltyImportRecord,
  Phase2RunResult,
} from "./phase2-types";

export { DOCUMENT_REGISTRY, loadAcquiredDocumentSources } from "./corpus";
export { normalizeDraftingText, normalizeForMatch, maskNumericLiterals, sha256Hex } from "./normalize";
export {
  detectCategories,
  extractSignatureTokens,
  makeSignature,
  signatureDistance,
  buildSignatureKey,
  categoryHasCoreToken,
} from "./signatures";
export { splitCandidateWindows, extractUnitsFromDocument } from "./extract";
export { shingles, jaccard, lexicalJaccard } from "./similarity";
export { clusterBySignature, summarizeClusters } from "./cluster";
export { scoreNovelty, buildReviewerQueue, buildAcquisitionRecommendations } from "./score";
export { loadUnits, buildCoverage, runNoveltyDiscovery } from "./pipeline";
export { mulberry32, runBalancedNoveltyEvaluation } from "./balanced";
export { recoverControllingContext, recoverContextsForFindings } from "./context";
export { independentlyReviewQueue, stratifyQueueSample } from "./review";
export { buildKnowledgeFactoryImport, buildHighRiskExamples } from "./kf-export";
export { acquireAgreementsViaEdgarConnector } from "./acquire";
export { consumeEhbAcquisitionQueue, loadExistingAcquired } from "./consume-ehb-queue";
export { allAcquisitionTickers, issuerMetaFor, issuerIdForPackage } from "./issuers";
