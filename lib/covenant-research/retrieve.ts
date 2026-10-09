/**
 * Hybrid lexical + structural retrieval over the covenant research corpus.
 * Amendment-aware and read-only: never certifies, approves, or promotes status.
 */

import { passesAmendmentAwareFilter } from "./amendment-aware";
import { scoreLexical } from "./lexical";
import { parseResearchQuery, type StructuredQueryInput } from "./parse-query";
import { rerankHits } from "./rerank";
import { passesHardFilters, scoreStructural } from "./structural";
import {
  COVENANT_RESEARCH_SCHEMA_VERSION,
  RESEARCH_DISCLAIMER,
  type ParsedResearchQuery,
  type ResearchCorpusEntry,
  type ResearchHit,
  type ResearchMissingDependency,
  type ResearchResponse,
} from "./types";

export const COVENANT_RESEARCH_RETRIEVAL_VERSION = "covenant-precedent-research-retrieval.v3";

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
      readOnly: true,
      missingDependencyDisclosures: [],
    };
  }

  const limit = options.limit ?? 10;
  const minScore = options.minScore ?? 1.25;
  const lexicalWeight = options.lexicalWeight ?? 0.55;
  const structuralWeight = options.structuralWeight ?? 0.45;

  const hits: ResearchHit[] = [];
  const missingDependencyDisclosures: ResearchMissingDependency[] = [];

  for (const entry of options.corpus) {
    if (!passesHardFilters(entry, query)) continue;

    const { pass, classification } = passesAmendmentAwareFilter(entry, {
      asOfDate: query.filters.asOfDate,
      operativeOnly: query.filters.operativeOnly,
    });
    if (!pass) continue;

    const lex = scoreLexical(entry.searchText, query.lexicalTerms, query.phrases);
    const structural = scoreStructural(entry, query);
    let score = combineScores(lex.score, structural.score, lexicalWeight, structuralWeight);

    // Soft penalty for non-operative hits when as-of is set but operativeOnly is false.
    if (query.filters.asOfDate && !classification.includeInOperativeOnly) {
      score *= 0.85;
    }

    if (score < minScore && structural.score < 3) continue;

    for (const d of entry.missingDependencies ?? []) {
      if (d.disclosed) missingDependencyDisclosures.push(d);
    }

    hits.push({
      entry,
      score: Number(score.toFixed(4)),
      lexicalScore: Number(lex.score.toFixed(4)),
      structuralScore: Number(structural.score.toFixed(4)),
      matchedSignals: [...new Set([...lex.matched, ...structural.matched])],
      operativeClassification: classification.status,
      uncertaintyNotes: classification.uncertaintyNotes,
    });
  }

  // Pull a wider candidate pool, then consolidate duplicates / diversify.
  const poolLimit = Math.max(limit * 8, 40);
  hits.sort((a, b) => b.score - a.score || a.entry.entryId.localeCompare(b.entry.entryId));
  const limited = rerankHits(hits.slice(0, poolLimit), limit);

  // Surface amendment uncertainty + missing deps on every affected hit.
  for (const hit of limited) {
    const notes = [...(hit.uncertaintyNotes ?? [])];
    const op = hit.operativeClassification ?? hit.entry.operativeVersion.status;
    if (
      op === "UNKNOWN_EFFECTIVE_DATE" ||
      op === "MISSING_AMENDMENT_AUTHORITY" ||
      op === "UNRESOLVED_OPERATIVE_STATE" ||
      op === "SUPERSEDED" ||
      op === "AMENDED"
    ) {
      if (!notes.some((n) => /amendment|operative|effective/i.test(n))) {
        notes.push(`Amendment/operative uncertainty: ${op}`);
      }
    }
    for (const d of hit.entry.missingDependencies ?? []) {
      if (d.disclosed && !notes.some((n) => n.includes(d.kind))) {
        notes.push(`Missing dependency disclosed: ${d.kind} — ${d.description}`);
      }
    }
    hit.uncertaintyNotes = notes;
  }

  return {
    schemaVersion: COVENANT_RESEARCH_SCHEMA_VERSION,
    disclaimer: RESEARCH_DISCLAIMER,
    query,
    hits: limited,
    refused: false,
    refusalReason: null,
    resultCount: limited.length,
    readOnly: true,
    missingDependencyDisclosures,
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
