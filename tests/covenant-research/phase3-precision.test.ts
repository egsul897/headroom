/**
 * Phase 3 — deterministic rerank / span consolidation precision checks.
 * Tuned on FP patterns (overlapping discovery windows), not exclusively on held-out IDs.
 */
import { describe, expect, it } from "vitest";
import {
  buildPhase2ResearchCorpus,
  consolidateSourceSpans,
  evaluateHeldOutRetrieval,
  retrieveResearch,
  type ResearchHit,
} from "../../lib/covenant-research";

describe("covenant research phase3 — precision improvements", () => {
  const report = buildPhase2ResearchCorpus();

  it("consolidates near-duplicate source spans from the same doc/section/family", () => {
    const base = report.entries.find((e) => e.sourceExcerpt.length > 80)!;
    const hits: ResearchHit[] = [
      {
        entry: base,
        score: 5,
        lexicalScore: 3,
        structuralScore: 2,
        matchedSignals: [],
      },
      {
        entry: {
          ...base,
          entryId: `${base.entryId}-dup`,
          sourceExcerpt: base.sourceExcerpt.slice(0, Math.floor(base.sourceExcerpt.length * 0.95)),
        },
        score: 4.5,
        lexicalScore: 2.8,
        structuralScore: 1.8,
        matchedSignals: [],
      },
    ];
    const consolidated = consolidateSourceSpans(hits, 0.7);
    expect(consolidated.length).toBe(1);
    expect(consolidated[0]!.entry.entryId).toBe(base.entryId);
  });

  it("improves Precision@5 vs Phase-2 baseline without collapsing Recall@5 below 0.90", () => {
    const evalReport = evaluateHeldOutRetrieval(report.entries);
    // Phase-2 baseline Precision@5 was 0.3182; Phase-3 rerank must beat that.
    expect(evalReport.macroPrecisionAt5).toBeGreaterThan(0.3182);
    expect(evalReport.macroRecallAt5).toBeGreaterThanOrEqual(0.9);
    expect(evalReport.citationCorrectRate).toBe(1);
    expect(evalReport.refusalCorrectRate).toBe(1);
  });

  it("does not promote verification status because a hit is retrievable", () => {
    const response = retrieveResearch("Find restricted-payment baskets conditioned on no default", {
      corpus: report.entries,
      limit: 5,
    });
    expect(response.hits.length).toBeGreaterThan(0);
    for (const hit of response.hits) {
      expect(hit.entry.verificationStatus).not.toBe("SOURCE_VERIFIED");
      expect(hit.entry.verificationStatus).not.toBe("INDEPENDENTLY_LEGALLY_VERIFIED");
    }
  });
});
