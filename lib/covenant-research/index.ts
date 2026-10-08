/**
 * Covenant Precedent Research Interface — public exports.
 *
 * Hybrid lexical/structural retrieval over a source-backed covenant corpus.
 * CLI-first; no paid vector infrastructure.
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
export { formatResearchResponse } from "./format";
