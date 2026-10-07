/**
 * Article VII cheapest-compile selection. No provider call.
 * DEVELOPMENT ≠ CERTIFIED.
 */
import { describe, expect, it } from "vitest";
import { ARTICLE_VII_BODY_REFS, haikuListUsd, selectArticleSevenBodies } from "../../scripts/p3-development-pipeline/compile-gibraltar-article-vii";

describe("Article VII body selection", () => {
  it("keeps the longest exact section body and drops children, the TOC-sized twin, and 7.04", () => {
    const selected = selectArticleSevenBodies([
      { discoveryId: "toc-705", normalizedSourceRef: "7.05", operativeChars: 40, role: "BASKET" },
      { discoveryId: "body-705", normalizedSourceRef: "7.05", operativeChars: 34605, role: "BASKET" },
      { discoveryId: "child-705", normalizedSourceRef: "7.05(a)", operativeChars: 8704, role: "BASKET" },
      { discoveryId: "body-704", normalizedSourceRef: "7.04", operativeChars: 5767, role: "PROVISO" },
      { discoveryId: "toc-704", normalizedSourceRef: "7.04", operativeChars: 39, role: "GENERAL_PROHIBITION" },
      { discoveryId: "body-702", normalizedSourceRef: "7.02", operativeChars: 415, role: "GENERAL_PROHIBITION" },
      { discoveryId: "short-701", normalizedSourceRef: "7.01", operativeChars: 33, role: "GENERAL_PROHIBITION" },
      { discoveryId: "body-701", normalizedSourceRef: "7.01", operativeChars: 21491, role: "GENERAL_PROHIBITION" },
    ]);
    expect(selected.map((row) => row.discoveryId)).toEqual(["body-702", "body-701", "body-705"]);
    expect(ARTICLE_VII_BODY_REFS).not.toContain("7.04");
    expect(ARTICLE_VII_BODY_REFS[0]).toBe("7.02");
    expect(ARTICLE_VII_BODY_REFS[ARTICLE_VII_BODY_REFS.length - 1]).toBe("7.05");
  });

  it("prices Haiku list tokens below the twelve-dollar ceiling for one section reply", () => {
    const oneSection = haikuListUsd(60_000, 24_576);
    expect(oneSection).toBeGreaterThan(0.1);
    expect(oneSection).toBeLessThan(0.25);
    expect(oneSection * 6 * 2).toBeLessThan(12);
  });
});
