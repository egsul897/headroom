/**
 * Covenant Precedent Research Interface — public exports.
 *
 * Hybrid lexical/structural retrieval over a source-backed covenant corpus.
 * CLI-first; no paid vector infrastructure. Read-only: never certifies.
 */

export {
  COVENANT_RESEARCH_SCHEMA_VERSION,
  RESEARCH_DISCLAIMER,
  type ResearchCorpusEntry,
  type ResearchResponse,
  type ResearchHit,
  type ParsedResearchQuery,
  type ResearchIntent,
  type ResearchFilters,
  type ResearchStructuralFeatures,
  type ResearchVerificationStatus,
  type OperativeVersionStatus,
  type ResearchMissingDependency,
} from "./types";

export { tokenize, scoreLexical, normalizeMoneyToken } from "./lexical";
export { scoreStructural, passesHardFilters } from "./structural";
export { parseResearchQuery, type StructuredQueryInput } from "./parse-query";
export {
  retrieveResearch,
  retrieveFromParsed,
  COVENANT_RESEARCH_RETRIEVAL_VERSION,
  type RetrieveOptions,
} from "./retrieve";
export {
  loadResearchCorpusFromFile,
  tryLoadResearchCorpusFromDb,
  normalizeCorpusEntry,
  researchEntryFromSemanticTruth,
  DEFAULT_RESEARCH_CORPUS_PATH,
} from "./corpus";
export {
  ingestDiscoveryRun,
  ingestDefaultDiscoveryPackages,
  defaultDiscoveryIngestSpecs,
  type PackageIngestSpec,
} from "./ingest-discovery";
export { ingestCompiledResults, type CompiledIngestSpec } from "./ingest-compiled";
export {
  buildPhase2ResearchCorpus,
  phase2DiscoverySpecs,
  phase2CompiledSpecs,
  type CorpusBuildReport,
} from "./ingest-registry";
export { dedupeResearchEntries, attachIdentityFields, researchIdentityKey } from "./identity";
export {
  probeKnowledgeFactoryIntegrations,
  knowledgeFactoryBlockers,
  type KnowledgeFactoryIntegrationStatus,
} from "./knowledge-factory";
export { classifyOperativeAsOf, passesAmendmentAwareFilter } from "./amendment-aware";
export { evaluateHeldOutRetrieval, HELD_OUT_QUERIES_PATH, type EvalReport } from "./evaluate";
export { formatResearchResponse } from "./format";
