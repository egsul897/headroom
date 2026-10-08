/**
 * Hybrid lexical + structural retrieval over the covenant research corpus.
 */

import { scoreLexical } from "./lexical";
import { parseResearchQuery, type StructuredQueryInput } from "./parse-query";
import { passesHardFilters, scoreStructural } from "./structural";
import {
  COVENANT_RESEARCH_SCHEMA_VERSION,
  RESEARCH_DISCLAIMER,
  type ParsedResearchQuery,
  type ResearchCorpusEntry,
  type ResearchHit,
  type ResearchResponse,
} from "./types";

export const COVENANT_RESEARCH_RETRIEVAL_VERSION = "covenant-precedent-research-retrieval.v1";

export interface RetrieveOptions {
  corpus: readonly ResearchCorpusEntry[];
  limit?: number;
  /** Minimum combined score to surface a hit. */
  minScore?: number;
  lexicalWeight?: number;
  structuralWeight?: number;
}

function combineScores(
  lexicalScore: number,
  structuralScore: number,
  lexicalWeight: number,
  structuralWeight: number,
): number {
  return lexicalWeight * lexicalScore + structuralWeight * structuralScore;
}

export function retrieveFromParsed(query: ParsedResearchQuery, options: RetrieveOptions): ResearchResponse {
  if (query.unsupportedReason) {
    return {
      schemaVersion: COVENANT_RESEARCH_SCHEMA_VERSION,
      disclaimer: RESEARCH_DISCLAIMER,
      query,
      hits: [],
      refused: true,
      refusalReason: query.unsupportedReason,
      resultCount: 0,
    };
  }

  const limit = options.limit ?? 10;
  const minScore = options.minScore ?? 1.25;
  const lexicalWeight = options.lexicalWeight ?? 0.55;
  const structuralWeight = options.structuralWeight ?? 0.45;

  const hits: ResearchHit[] = [];

  for (const entry of options.corpus) {
    if (!passesHardFilters(entry, query)) continue;

    const lex = scoreLexical(entry.searchText, query.lexicalTerms, query.phrases);
    const structural = scoreStructural(entry, query);
    const score = combineScores(lex.score, structural.score, lexicalWeight, structuralWeight);

    if (score < minScore && structural.score < 3) continue;

    hits.push({
      entry,
      score: Number(score.toFixed(4)),
      lexicalScore: Number(lex.score.toFixed(4)),
      structuralScore: Number(structural.score.toFixed(4)),
      matchedSignals: [...new Set([...lex.matched, ...structural.matched])],
    });
  }

  hits.sort((a, b) => b.score - a.score || a.entry.entryId.localeCompare(b.entry.entryId));
  const limited = hits.slice(0, limit);

  return {
    schemaVersion: COVENANT_RESEARCH_SCHEMA_VERSION,
    disclaimer: RESEARCH_DISCLAIMER,
    query,
    hits: limited,
    refused: false,
    refusalReason: null,
    resultCount: limited.length,
  };
}

export function retrieveResearch(
  input: string | StructuredQueryInput | ParsedResearchQuery,
  options: RetrieveOptions,
): ResearchResponse {
  const query =
    typeof input === "object" && input !== null && "lexicalTerms" in input && "unsupportedReason" in input
      ? (input as ParsedResearchQuery)
      : parseResearchQuery(input as string | StructuredQueryInput);
  return retrieveFromParsed(query, options);
}
