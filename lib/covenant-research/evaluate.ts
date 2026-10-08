/**
 * Held-out retrieval quality evaluation.
 * Relevance metrics are NOT evidence of legal correctness.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { retrieveResearch } from "./retrieve";
import type { ResearchCorpusEntry, ResearchResponse } from "./types";

export const HELD_OUT_QUERIES_PATH = resolve(
  process.cwd(),
  "tests/fixtures/covenant-research/held-out-queries.json",
);

export interface HeldOutQuery {
  id: string;
  category:
    | "DEBT_BASKETS"
    | "RESTRICTED_PAYMENTS"
    | "INVESTMENTS"
    | "EBITDA_DEFINITIONS"
    | "SHARED_CAPACITY"
    | "RECLASSIFICATION"
    | "AMENDMENTS"
    | "ENTITY_SCOPE"
    | "REMOTE_CONDITIONS"
    | "CROSS_DOCUMENT";
  query: string;
  /** Entry ids that are acceptable relevant hits (independent review list). */
  relevantEntryIds: string[];
  /** Additional relevance via section ref match (package-agnostic). */
  relevantSectionRefs?: string[];
  /** Optional issuer tickers/companyIds that may count as relevant with section match. */
  relevantIssuers?: string[];
  /** Optional: require citation substring in top hit excerpt/citation. */
  requiredCitationSubstrings?: string[];
  /** Optional as-of / operative expectations */
  asOfDate?: string;
  operativeOnly?: boolean;
  expectRefusal?: boolean;
  notes?: string;
}

export interface HeldOutQueryFile {
  schemaVersion: string;
  disclaimer: string;
  queries: HeldOutQuery[];
}

export interface QueryMetric {
  queryId: string;
  category: string;
  recallAt5: number;
  recallAt10: number;
  precisionAt5: number;
  citationCorrect: boolean | null;
  versionCorrect: boolean | null;
  missingDependencyDisclosed: boolean | null;
  refusedCorrectly: boolean | null;
  hitEntryIds: string[];
}

export interface EvalReport {
  disclaimer: string;
  queryCount: number;
  macroRecallAt5: number;
  macroRecallAt10: number;
  macroPrecisionAt5: number;
  citationCorrectRate: number;
  versionCorrectRate: number;
  missingDependencyDisclosureRate: number;
  refusalCorrectRate: number;
  perQuery: QueryMetric[];
}

function loadHeldOut(): HeldOutQueryFile {
  return JSON.parse(readFileSync(HELD_OUT_QUERIES_PATH, "utf8")) as HeldOutQueryFile;
}

function recall(relevant: Set<string>, hits: string[], k: number): number {
  if (relevant.size === 0) return 0;
  const top = hits.slice(0, k);
  const hitCount = top.filter((id) => relevant.has(id)).length;
  return hitCount / relevant.size;
}

function precisionAt(relevant: Set<string>, hits: string[], k: number): number {
  const top = hits.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((id) => relevant.has(id)).length / top.length;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
}

export function evaluateHeldOutRetrieval(corpus: readonly ResearchCorpusEntry[]): EvalReport {
  const file = loadHeldOut();
  const perQuery: QueryMetric[] = [];

  for (const q of file.queries) {
    const response: ResearchResponse = retrieveResearch(
      {
        text: q.query,
        asOfDate: q.asOfDate,
        operativeOnly: q.operativeOnly,
      },
      { corpus, limit: 10 },
    );

    if (q.expectRefusal) {
      perQuery.push({
        queryId: q.id,
        category: q.category,
        recallAt5: 0,
        recallAt10: 0,
        precisionAt5: 0,
        citationCorrect: null,
        versionCorrect: null,
        missingDependencyDisclosed: null,
        refusedCorrectly: response.refused === true,
        hitEntryIds: [],
      });
      continue;
    }

    const hitIds = response.hits.map((h) => h.entry.entryId);
    const relevant = new Set(q.relevantEntryIds);
    // Expand relevance by section/issuer when provided (still independent of scores).
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
      if (sectionOk && issuerOk && (q.relevantSectionRefs?.length || q.relevantIssuers?.length)) {
        if (q.relevantSectionRefs?.length || q.relevantEntryIds.includes(h.entry.entryId)) {
          relevant.add(h.entry.entryId);
        }
      }
    }
    // If only section/issuer criteria given, mark hits matching both.
    if (!q.relevantEntryIds.length && (q.relevantSectionRefs?.length || q.relevantIssuers?.length)) {
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
              h.entry.issuer.companyId.toLowerCase().includes(k)
            );
          });
        if (sectionOk && issuerOk) relevant.add(h.entry.entryId);
      }
    }
    const top5 = response.hits.slice(0, 5);

    let citationCorrect: boolean | null = null;
    if (q.requiredCitationSubstrings?.length) {
      citationCorrect = top5.some((h) =>
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
        // Must not silently label superseded as current without notes
        if (cls === "SUPERSEDED" || cls === "UNKNOWN_EFFECTIVE_DATE" || cls === "UNRESOLVED_OPERATIVE_STATE") {
          return (h.uncertaintyNotes?.length ?? 0) > 0 || !q.operativeOnly;
        }
        return true;
      });
    }

    let missingDependencyDisclosed: boolean | null = null;
    const deps = response.missingDependencyDisclosures ?? [];
    const hitDeps = response.hits.flatMap((h) => h.entry.missingDependencies ?? []);
    if (hitDeps.length > 0 || deps.length > 0) {
      missingDependencyDisclosed = [...deps, ...hitDeps].every((d) => d.disclosed === true);
    }

    perQuery.push({
      queryId: q.id,
      category: q.category,
      recallAt5: Number(recall(relevant, hitIds, 5).toFixed(4)),
      recallAt10: Number(recall(relevant, hitIds, 10).toFixed(4)),
      precisionAt5: Number(precisionAt(relevant, hitIds, 5).toFixed(4)),
      citationCorrect,
      versionCorrect,
      missingDependencyDisclosed,
      refusedCorrectly: null,
      hitEntryIds: hitIds,
    });
  }

  const nonRefusal = perQuery.filter((q) => q.refusedCorrectly == null);
  const citationMeasured = perQuery.filter((q) => q.citationCorrect != null);
  const versionMeasured = perQuery.filter((q) => q.versionCorrect != null);
  const depMeasured = perQuery.filter((q) => q.missingDependencyDisclosed != null);
  const refusalMeasured = perQuery.filter((q) => q.refusedCorrectly != null);

  return {
    disclaimer:
      file.disclaimer +
      " Retrieval relevance is not evidence of legal correctness.",
    queryCount: file.queries.length,
    macroRecallAt5: avg(nonRefusal.map((q) => q.recallAt5)),
    macroRecallAt10: avg(nonRefusal.map((q) => q.recallAt10)),
    macroPrecisionAt5: avg(nonRefusal.map((q) => q.precisionAt5)),
    citationCorrectRate: citationMeasured.length
      ? avg(citationMeasured.map((q) => (q.citationCorrect ? 1 : 0)))
      : 0,
    versionCorrectRate: versionMeasured.length
      ? avg(versionMeasured.map((q) => (q.versionCorrect ? 1 : 0)))
      : 0,
    missingDependencyDisclosureRate: depMeasured.length
      ? avg(depMeasured.map((q) => (q.missingDependencyDisclosed ? 1 : 0)))
      : 1,
    refusalCorrectRate: refusalMeasured.length
      ? avg(refusalMeasured.map((q) => (q.refusedCorrectly ? 1 : 0)))
      : 0,
    perQuery,
  };
}
