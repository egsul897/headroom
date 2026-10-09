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
export {
  isSharedCapacityLanguage,
  hasSharedCapacityRelationship,
  hasAggregateCeilingLanguage,
  hasAntiStackingLanguage,
} from "./patterns/shared-capacity";
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
export { extractConditionsAndExceptions } from "./pipeline/conditions";
export { computeInstrumentIdentity, attachInstrumentIdentity } from "./pipeline/instrument-identity";
export { loadEhbHandoffPackage, handoffToDiscovered } from "./coordination/ehb-handoff";
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
export {
  CORPUS_POPULATION_REGISTRY,
  packagesForPopulation,
  assertHoldoutUntouched,
} from "./corpus/population-registry";
export type { CorpusPopulation, PopulationPackage } from "./corpus/population-registry";
export {
  NON_DEBT_TITLE,
  isDebtSource,
  isFinancingDoc,
  isFixtureDoc,
  isFalsePositiveDebtExhibit,
} from "./corpus/financing-filter";

export {
  buildAssetInventory,
  buildDryRunPlan,
  scanOriginalByteCandidates,
  verifyGibraltarFixture,
  importOriginalByteCandidates,
  importExportSourcesMetadataOnly,
  LIVE_WRITE_ENV,
  LIVE_WRITE_TOKEN,
} from "./consolidation";
export type {
  AssetFamilyInventory,
  DryRunPlanSummary,
  OriginalByteCandidate,
} from "./consolidation";

export { probeDurability } from "./preservation/durability";
export {
  requireDurableCredentials,
  persistDurableKnowledgeSource,
  retrieveDurableKnowledgeSource,
  loadDurableSourceBytes,
  hashBytesSha256,
  DurableCredentialsError,
  DurableContentConflictError,
  DurableRetrieveError,
  DURABILITY_BLOCKED_CREDENTIALS,
  KF_CORPUS_STORAGE_NAMESPACE,
} from "./preservation/durable-store";
export type {
  DurableCredentialGate,
  DurableSourcePersistResult,
  DurableSourceRetrieveResult,
} from "./preservation/durable-store";
export { buildSourceInventory, SOURCE_INVENTORY_SCHEMA_VERSION } from "./preservation/inventory";
export {
  buildAcquisitionManifest,
  ACQUISITION_MANIFEST_SCHEMA_VERSION,
} from "./preservation/acquisition-manifest";
export {
  measureReplayCounts,
  replayAgainstPilotTargets,
  PILOT_REPLAY_TARGETS,
} from "./preservation/replay";

export {
  CONSUMER_EXPORT_SCHEMA_VERSION,
  CONSUMER_EXPORT_KIND,
  CONSUMER_EXPORT_SAFETY,
  consumerContractIdentity,
} from "./export/consumer-contract";
export { buildCanonicalConsumerExport, writeCanonicalExport } from "./export/build-canonical-export";

export {
  DefinitionEncyclopediaImportStore,
  runDefinitionEncyclopediaImport,
  DEFINITION_ENCYCLOPEDIA_ADAPTER_VERSION,
} from "./consumers/definition-encyclopedia-import";
export {
  DependencyAtlasImportStore,
  runDependencyAtlasImport,
  DEPENDENCY_ATLAS_ADAPTER_VERSION,
} from "./consumers/dependency-atlas-import";
