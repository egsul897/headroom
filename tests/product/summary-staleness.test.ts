/**
 * Rule 5 — stale-analysis marking. Before this rule, summaries carried
 * only a static schemaVersion and generatedAt, so an analysis produced
 * by older (buggier) code was indistinguishable from a current one —
 * the live Quila summary stayed pre-#391 with no marker. Now every
 * summary records its producer build (Vercel git SHA, "dev" elsewhere)
 * and isSummaryStale() flags summaries from older builds or predating
 * build stamping.
 */
import { describe, expect, it } from "vitest";
import {
  buildDocumentCovenantSummary,
  currentAnalyzerBuild,
  isSummaryStale,
} from "../../lib/product/covenant-intelligence/summarize";

describe("summary staleness", () => {
  it("stamps the current analyzer build on every summary", () => {
    const s = buildDocumentCovenantSummary({
      sourceId: "test:stale",
      documentTitle: "Test Indenture",
      issuerCik: "0000000000",
      documentClass: "INDENTURE",
      candidates: [],
      definitions: [],
      structuralNodes: [],
    });
    expect(s.analyzerBuild).toBe(currentAnalyzerBuild());
    expect(s.analyzerBuild).toBeTruthy();
  });

  it("a missing summary is absent, not stale", () => {
    expect(isSummaryStale(null)).toBe(false);
  });

  it("a summary predating build stamping is stale", () => {
    const s = buildDocumentCovenantSummary({
      sourceId: "test:stale",
      documentTitle: "Test Indenture",
      issuerCik: "0000000000",
      documentClass: "INDENTURE",
      candidates: [],
      definitions: [],
      structuralNodes: [],
    });
    expect(isSummaryStale({ ...s, analyzerBuild: undefined })).toBe(true);
  });

  it("a summary from the current build is not stale; an older build is", () => {
    const s = buildDocumentCovenantSummary({
      sourceId: "test:stale",
      documentTitle: "Test Indenture",
      issuerCik: "0000000000",
      documentClass: "INDENTURE",
      candidates: [],
      definitions: [],
      structuralNodes: [],
    });
    expect(isSummaryStale(s)).toBe(false);
    expect(isSummaryStale({ ...s, analyzerBuild: "older-build-sha" })).toBe(true);
  });
});
