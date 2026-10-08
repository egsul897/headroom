/**
 * Amendment-aware retrieval — never silently treat superseded as current.
 */
import { describe, expect, it } from "vitest";
import {
  classifyOperativeAsOf,
  loadResearchCorpusFromFile,
  retrieveResearch,
} from "../../lib/covenant-research";

const curated = loadResearchCorpusFromFile();

describe("covenant research — amendment-aware retrieval", () => {
  it("classifies superseded pre-amendment RP basket as non-operative after as-of", () => {
    const prior = curated.find((e) => e.entryId === "fixture-rp-basket-pre-amendment")!;
    const cls = classifyOperativeAsOf(prior, "2024-06-01");
    expect(cls.status).toBe("SUPERSEDED");
    expect(cls.includeInOperativeOnly).toBe(false);
    expect(cls.uncertaintyNotes.length).toBeGreaterThan(0);
  });

  it("classifies post-amendment RP reduction as operative on as-of after effectiveFrom", () => {
    const cur = curated.find((e) => e.entryId === "fixture-amendment-reduces-rp-capacity")!;
    const cls = classifyOperativeAsOf(cur, "2024-06-01");
    expect(cls.status).toBe("CURRENT_OPERATIVE");
    expect(cls.includeInOperativeOnly).toBe(true);
  });

  it("operative-only as-of query excludes superseded $50m basket", () => {
    const response = retrieveResearch(
      {
        text: "Restricted Payments basket",
        issuer: "RFIC",
        asOfDate: "2024-06-01",
        operativeOnly: true,
      },
      { corpus: curated, limit: 10 },
    );
    expect(response.hits.some((h) => h.entry.entryId === "fixture-rp-basket-pre-amendment")).toBe(false);
    expect(response.hits.some((h) => h.entry.entryId === "fixture-amendment-reduces-rp-capacity")).toBe(true);
    for (const hit of response.hits) {
      expect(hit.operativeClassification).toBe("CURRENT_OPERATIVE");
    }
  });

  it("unknown effective dating is disclosed, not invented as current", () => {
    const unknown = {
      ...curated[0]!,
      entryId: "tmp-unknown-effective",
      operativeVersion: {
        status: "UNKNOWN" as const,
        effectiveFrom: null,
        effectiveTo: null,
        supersededByEntryId: null,
      },
    };
    const cls = classifyOperativeAsOf(unknown, "2024-01-01");
    expect(cls.status).toBe("UNKNOWN_EFFECTIVE_DATE");
    expect(cls.includeInOperativeOnly).toBe(false);
  });
});
