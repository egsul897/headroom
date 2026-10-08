/**
 * Phase 3 — issuer-disjoint independent evaluation (≥50 queries).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INDEPENDENT_EVAL_QUERIES_PATH,
  buildPhase3ResearchCorpus,
  evaluateIndependentRetrieval,
} from "../../lib/covenant-research";

describe("covenant research phase3 — independent evaluation", () => {
  const file = JSON.parse(readFileSync(INDEPENDENT_EVAL_QUERIES_PATH, "utf8")) as {
    queries: unknown[];
    issuerDisjointFromPhase2HeldOut: boolean;
    corpusOverlapDisclosure: { indentureDocumentsAvailable: boolean };
  };

  it("contains at least 50 independently authored queries with overlap disclosure", () => {
    expect(file.queries.length).toBeGreaterThanOrEqual(50);
    expect(file.issuerDisjointFromPhase2HeldOut).toBe(true);
    expect(file.corpusOverlapDisclosure.indentureDocumentsAvailable).toBe(false);
  });

  it("reports Recall@5/10, Precision@5, MRR, citation, version, refusal on phase3 corpus", () => {
    const corpus = buildPhase3ResearchCorpus();
    const report = evaluateIndependentRetrieval(corpus.entries);
    expect(report.queryCount).toBeGreaterThanOrEqual(50);
    expect(report.macroRecallAt5).toBeGreaterThan(0);
    expect(report.macroRecallAt10).toBeGreaterThanOrEqual(report.macroRecallAt5 - 0.0001);
    expect(report.mrr).toBeGreaterThan(0);
    expect(report.refusalCorrectRate).toBe(1);
    // Citation measured only on queries with requiredCitationSubstrings.
    expect(report.citationCorrectRate).toBeGreaterThan(0.5);
  }, 120_000);
});
