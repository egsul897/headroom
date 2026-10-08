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

export { DOCUMENT_REGISTRY } from "./corpus";
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
