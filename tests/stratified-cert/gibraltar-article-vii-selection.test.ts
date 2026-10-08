/**
 * Article VII cheapest-compile selection. No provider call.
 * DEVELOPMENT ≠ CERTIFIED.
 */
import { describe, expect, it } from "vitest";
import { ARTICLE_VII_BODY_REFS, haikuListUsd, selectArticleSevenBodies } from "../../scripts/p3-development-pipeline/compile-gibraltar-article-vii";

describe("Article VII body selection", () => {
  it("keeps the structurally operative body and drops a contents line even when that line is longer", () => {
    const selected = selectArticleSevenBodies([
      { discoveryId: "toc-705", normalizedSourceRef: "7.05", operativeChars: 80_000, role: "BASKET", structuralKind: "CONTENTS_LISTING", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: true },
      { discoveryId: "body-705", normalizedSourceRef: "7.05", operativeChars: 40, role: "BASKET", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: true },
      { discoveryId: "child-705", normalizedSourceRef: "7.05(a)", operativeChars: 8704, role: "BASKET", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: true },
      { discoveryId: "body-704", normalizedSourceRef: "7.04", operativeChars: 5767, role: "PROVISO", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: true },
      { discoveryId: "toc-only", normalizedSourceRef: "7.08", operativeChars: 39, role: "GENERAL_PROHIBITION", structuralKind: "CONTENTS_LISTING", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: true },
      { discoveryId: "body-702", normalizedSourceRef: "7.02", operativeChars: 415, role: "GENERAL_PROHIBITION", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: true },
      { discoveryId: "one-701", normalizedSourceRef: "7.01", operativeChars: 100, role: "GENERAL_PROHIBITION", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: true },
      { discoveryId: "two-701", normalizedSourceRef: "7.01", operativeChars: 21_491, role: "GENERAL_PROHIBITION", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: true },
      { discoveryId: "old-703", normalizedSourceRef: "7.03", operativeChars: 4_000, role: "GENERAL_PROHIBITION", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "KNOWN_SUPERSEDED", sourceHashOk: true },
      { discoveryId: "bad-706", normalizedSourceRef: "7.06", operativeChars: 8_000, role: "GENERAL_PROHIBITION", structuralKind: "OPERATIVE_OCCURRENCE", supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS", sourceHashOk: false },
    ]);
    expect(selected.map((row) => row.discoveryId)).toEqual(["body-702", "body-705"]);
    expect(selected.map((row) => row.discoveryId)).not.toContain("toc-705");
    expect(selected.map((row) => row.discoveryId)).not.toContain("toc-only");
    expect(selected.map((row) => row.discoveryId)).not.toContain("one-701");
    expect(ARTICLE_VII_BODY_REFS).not.toContain("7.04");
    expect(ARTICLE_VII_BODY_REFS[0]).toBe("7.02");
    expect(ARTICLE_VII_BODY_REFS[ARTICLE_VII_BODY_REFS.length - 1]).toBe("7.05");
  });

  it("prices Haiku list tokens below the twelve-dollar development spending target for one section reply", () => {
    const oneSection = haikuListUsd(60_000, 24_576);
    expect(oneSection).toBeGreaterThan(0.1);
    expect(oneSection).toBeLessThan(0.25);
    expect(oneSection * 6 * 2).toBeLessThan(12);
  });
});
