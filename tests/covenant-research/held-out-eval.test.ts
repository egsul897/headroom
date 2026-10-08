/**
 * Held-out retrieval quality — relevance ≠ legal correctness.
 */
import { describe, expect, it } from "vitest";
import {
  buildPhase2ResearchCorpus,
  evaluateHeldOutRetrieval,
  loadResearchCorpusFromFile,
} from "../../lib/covenant-research";

describe("covenant research — held-out retrieval quality", () => {
  it("meets baseline recall/precision on curated corpus and refuses unsupported asks", () => {
    const curated = loadResearchCorpusFromFile();
    const report = evaluateHeldOutRetrieval(curated);

    expect(report.queryCount).toBeGreaterThanOrEqual(10);
    expect(report.disclaimer).toMatch(/not evidence of legal correctness/i);
    expect(report.macroRecallAt5).toBeGreaterThanOrEqual(0.7);
    expect(report.macroRecallAt10).toBeGreaterThanOrEqual(0.7);
    expect(report.macroPrecisionAt5).toBeGreaterThanOrEqual(0.35);
    expect(report.citationCorrectRate).toBeGreaterThanOrEqual(0.7);
    expect(report.refusalCorrectRate).toBe(1);

    const asOf = report.perQuery.find((q) => q.queryId === "HO-AMEND-ASOF-01");
    expect(asOf?.versionCorrect).toBe(true);
  });

  it("phase2 expanded corpus does not collapse held-out refusal correctness", () => {
    const { entries } = buildPhase2ResearchCorpus();
    const report = evaluateHeldOutRetrieval(entries);
    expect(report.refusalCorrectRate).toBe(1);
    // Curated relevant ids should still surface among a larger index.
    expect(report.macroRecallAt10).toBeGreaterThanOrEqual(0.6);
  });
});
