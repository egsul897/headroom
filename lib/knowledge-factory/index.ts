/**
 * Covenant Knowledge Factory — public entrypoints.
 * Additive architecture; does not replace the production covenant compiler.
 */

export { KNOWLEDGE_FACTORY_VERSION } from "./types";
export type * from "./types";

export { EdgarKnowledgeClient, makeSourceId, validateSourceUrl } from "./edgar/client";
export { SecHttpClient, DEFAULT_USER_AGENT } from "./edgar/http";
export { RateLimiter, DEFAULT_SEC_RATE_LIMIT } from "./edgar/rate-limit";
export { PRIORITY_FORM_TYPES, collectDebtSignals, isPriorityForm } from "./edgar/forms";

export { classifyDebtDocument, stripIdentityTokens } from "./classify/debt-document";
export { scoreDiscoveryPotential } from "./rank/discovery-score";
export { TAXONOMY_VERSION, TAXONOMY_FAMILIES, classifyFamiliesFromText } from "./taxonomy/families";
export { PATTERN_LIBRARY_VERSION, SEED_PATTERNS, detectPatternsInText, allPatterns, getPattern } from "./patterns/library";
export { canTransition, assertNotSilentPromotion, describeLevel } from "./representation/levels";

export { CorpusStore, defaultCorpusPaths } from "./store/corpus-store";
export {
  processAcquiredDocument,
  ingestFixtureDocument,
  ingestIssuerFromEdgar,
  finalizeCorpusIndex,
} from "./pipeline/run";
export { extractStructure } from "./pipeline/structural";
export { discoverCovenantCandidates } from "./pipeline/candidates";
export { discoverDocumentRelationships } from "./relationships/discover";
export { findExactByteDuplicates, findExactNormalizedDuplicates, nearDuplicateScore } from "./dedupe/near-duplicate";
export { buildSemanticPriorityQueue } from "./queue/semantic-priority";
export { buildUncertaintyQueue } from "./queue/uncertainty";
export { retrievePrecedentInterpretations } from "./reuse/precedent";
export { searchKnowledge, runExampleQueries, traverseKnowledgeGraph } from "./search/query";
export { auditCorpusQuality } from "./audit/corpus-quality";
export { recordCost, summarizeCosts, modelCorpusEconomics, emptyStats } from "./cost/ledger";
export { runIntegrityChecks, assertIdempotentSourceUpsert } from "./integrity/checks";
export {
  assertKnowledgeFactoryCannotWriteCapacity,
  assertRepresentationCannotApproveCapacity,
  patternSimilarityIsNotRuleApproval,
  taxonomyLabelIsNotOperativeAuthority,
} from "./legal-safety/promotion-guards";
export { buildReviewerDataset } from "./corpus/reviewer-dataset";
export { PILOT_ISSUER_SEEDS, stratifiedPilotPlan, expansionPlan, diversityReport } from "./corpus/issuer-sample";
