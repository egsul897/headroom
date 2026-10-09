/**
 * Independent issuer-/document-disjoint retrieval evaluation.
 * Labels come from independently reviewed fixture JSON — not model self-labels.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { retrieveResearch } from "./retrieve";
import type { ResearchCorpusEntry, ResearchResponse } from "./types";

export const INDEPENDENT_EVAL_QUERIES_PATH = resolve(
  process.cwd(),
  "tests/fixtures/covenant-research/independent-eval-queries.json",
);

export interface IndependentQuery {
  id: string;
  category: string;
  query: string;
  relevantEntryIds: string[];
  relevantSectionRefs?: string[];
  relevantIssuers?: string[];
  requiredCitationSubstrings?: string[];
  asOfDate?: string;
  operativeOnly?: boolean;
  expectRefusal?: boolean;
  expectEmptyOrUnanswerable?: boolean;
  notes?: string;
}

export interface IndependentEvalFile {
  schemaVersion: string;
  disclaimer: string;
  issuerDisjointFromPhase2HeldOut?: boolean;
  documentDisjointPositiveLabels?: boolean;
  primaryEvalIssuer?: { ticker: string; name: string; companyId: string };
  corpusOverlapDisclosure?: Record<string, unknown>;
  queries: IndependentQuery[];
}

export interface IndependentQueryMetric {
  queryId: string;
  category: string;
  recallAt5: number;
  recallAt10: number;
  precisionAt5: number;
  reciprocalRank: number;
  citationCorrect: boolean | null;
  versionCorrect: boolean | null;
  refusedCorrectly: boolean | null;
  unanswerableHandled: boolean | null;
  hitEntryIds: string[];
}

export interface IndependentEvalReport {
  disclaimer: string;
  queryCount: number;
  macroRecallAt5: number;
  macroRecallAt10: number;
  macroPrecisionAt5: number;
  mrr: number;
  citationCorrectRate: number;
  versionCorrectRate: number;
  refusalCorrectRate: number;
  unanswerableHandledRate: number;
  overlapDisclosure: Record<string, unknown> | null;
  perQuery: IndependentQueryMetric[];
}

function loadIndependent(): IndependentEvalFile {
  return JSON.parse(readFileSync(INDEPENDENT_EVAL_QUERIES_PATH, "utf8")) as IndependentEvalFile;
}

function expandRelevant(
  q: IndependentQuery,
  response: ResearchResponse,
): Set<string> {
  const relevant = new Set(q.relevantEntryIds);
  if (!q.relevantSectionRefs?.length && !q.relevantIssuers?.length) return relevant;

  for (const h of response.hits) {
    const sectionOk =
      !q.relevantSectionRefs?.length ||
      q.relevantSectionRefs.some(
        (s) =>
          (h.entry.sourceSectionRef ?? "").toLowerCase() === s.toLowerCase() ||
          h.entry.sourceCitation.toLowerCase().includes(s.toLowerCase()),
      );
    const issuerOk =
      !q.relevantIssuers?.length ||
      q.relevantIssuers.some((i) => {
        const k = i.toLowerCase();
        return (
          h.entry.issuer.ticker?.toLowerCase() === k ||
          h.entry.issuer.companyId.toLowerCase().includes(k) ||
          h.entry.issuer.name.toLowerCase().includes(k)
        );
      });
    if (sectionOk && issuerOk) {
      if (q.relevantEntryIds.includes(h.entry.entryId) || q.relevantSectionRefs?.length) {
        relevant.add(h.entry.entryId);
      }
    }
  }
  return relevant;
}

function recall(relevant: Set<string>, hits: string[], k: number): number {
  if (relevant.size === 0) return 0;
  return hits.slice(0, k).filter((id) => relevant.has(id)).length / relevant.size;
}

function precisionAt(relevant: Set<string>, hits: string[], k: number): number {
  const top = hits.slice(0, k);
  if (!top.length) return 0;
  return top.filter((id) => relevant.has(id)).length / top.length;
}

function reciprocalRank(relevant: Set<string>, hits: string[]): number {
  for (let i = 0; i < hits.length; i++) {
    if (relevant.has(hits[i]!)) return 1 / (i + 1);
  }
  return 0;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
}

export function evaluateIndependentRetrieval(
  corpus: readonly ResearchCorpusEntry[],
): IndependentEvalReport {
  const file = loadIndependent();
  const perQuery: IndependentQueryMetric[] = [];

  for (const q of file.queries) {
    const response = retrieveResearch(
      { text: q.query, asOfDate: q.asOfDate, operativeOnly: q.operativeOnly },
      { corpus, limit: 10 },
    );

    if (q.expectRefusal) {
      perQuery.push({
        queryId: q.id,
        category: q.category,
        recallAt5: 0,
        recallAt10: 0,
        precisionAt5: 0,
        reciprocalRank: 0,
        citationCorrect: null,
        versionCorrect: null,
        refusedCorrectly: response.refused === true,
        unanswerableHandled: null,
        hitEntryIds: [],
      });
      continue;
    }

    if (q.expectEmptyOrUnanswerable) {
      // Prefer empty; if hits exist they must not be treated as answerable truth —
      // count as handled when refused OR zero hits OR all hits carry uncertainty notes.
      const handled =
        response.refused === true ||
        response.hits.length === 0 ||
        response.hits.every((h) => (h.uncertaintyNotes?.length ?? 0) > 0 || h.entry.verificationStatus !== "INDEPENDENTLY_LEGALLY_VERIFIED");
      perQuery.push({
        queryId: q.id,
        category: q.category,
        recallAt5: 0,
        recallAt10: 0,
        precisionAt5: response.hits.length === 0 ? 1 : 0,
        reciprocalRank: 0,
        citationCorrect: null,
        versionCorrect: null,
        refusedCorrectly: null,
        unanswerableHandled: handled,
        hitEntryIds: response.hits.map((h) => h.entry.entryId),
      });
      continue;
    }

    const hitIds = response.hits.map((h) => h.entry.entryId);
    const relevant = expandRelevant(q, response);

    let citationCorrect: boolean | null = null;
    if (q.requiredCitationSubstrings?.length) {
      citationCorrect = response.hits.slice(0, 5).some((h) =>
        q.requiredCitationSubstrings!.some(
          (s) =>
            h.entry.sourceCitation.toLowerCase().includes(s.toLowerCase()) ||
            h.entry.sourceExcerpt.toLowerCase().includes(s.toLowerCase()),
        ),
      );
    }

    let versionCorrect: boolean | null = null;
    if (q.operativeOnly || q.asOfDate) {
      versionCorrect = response.hits.every((h) => {
        const cls = h.operativeClassification ?? h.entry.operativeVersion.status;
        if (q.operativeOnly) return cls === "CURRENT_OPERATIVE";
        if (cls === "SUPERSEDED" || cls === "UNKNOWN_EFFECTIVE_DATE" || cls === "UNRESOLVED_OPERATIVE_STATE") {
          return (h.uncertaintyNotes?.length ?? 0) > 0;
        }
        return true;
      });
    }

    perQuery.push({
      queryId: q.id,
      category: q.category,
      recallAt5: Number(recall(relevant, hitIds, 5).toFixed(4)),
      recallAt10: Number(recall(relevant, hitIds, 10).toFixed(4)),
      precisionAt5: Number(precisionAt(relevant, hitIds, 5).toFixed(4)),
      reciprocalRank: Number(reciprocalRank(relevant, hitIds).toFixed(4)),
      citationCorrect,
      versionCorrect,
      refusedCorrectly: null,
      unanswerableHandled: null,
      hitEntryIds: hitIds,
    });
  }

  const ranked = perQuery.filter((q) => q.refusedCorrectly == null && q.unanswerableHandled == null);
  const citationMeasured = perQuery.filter((q) => q.citationCorrect != null);
  const versionMeasured = perQuery.filter((q) => q.versionCorrect != null);
  const refusalMeasured = perQuery.filter((q) => q.refusedCorrectly != null);
  const unansMeasured = perQuery.filter((q) => q.unanswerableHandled != null);

  return {
    disclaimer: file.disclaimer + " Retrieval relevance is not evidence of legal correctness.",
    queryCount: file.queries.length,
    macroRecallAt5: avg(ranked.map((q) => q.recallAt5)),
    macroRecallAt10: avg(ranked.map((q) => q.recallAt10)),
    macroPrecisionAt5: avg(ranked.map((q) => q.precisionAt5)),
    mrr: avg(ranked.map((q) => q.reciprocalRank)),
    citationCorrectRate: citationMeasured.length
      ? avg(citationMeasured.map((q) => (q.citationCorrect ? 1 : 0)))
      : 0,
    versionCorrectRate: versionMeasured.length
      ? avg(versionMeasured.map((q) => (q.versionCorrect ? 1 : 0)))
      : 0,
    refusalCorrectRate: refusalMeasured.length
      ? avg(refusalMeasured.map((q) => (q.refusedCorrectly ? 1 : 0)))
      : 0,
    unanswerableHandledRate: unansMeasured.length
      ? avg(unansMeasured.map((q) => (q.unanswerableHandled ? 1 : 0)))
      : 0,
    overlapDisclosure: (file.corpusOverlapDisclosure as Record<string, unknown>) ?? null,
    perQuery,
  };
}
