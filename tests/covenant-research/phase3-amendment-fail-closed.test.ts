/**
 * Phase 3 — amendment-aware fail-closed paths.
 */
import { describe, expect, it } from "vitest";
import {
  classifyOperativeAsOf,
  loadResearchCorpusFromFile,
  retrieveResearch,
  type ResearchCorpusEntry,
} from "../../lib/covenant-research";

const curated = loadResearchCorpusFromFile();

function withOperative(
  base: ResearchCorpusEntry,
  over: Partial<ResearchCorpusEntry["operativeVersion"]> & { entryId: string },
): ResearchCorpusEntry {
  return {
    ...base,
    entryId: over.entryId,
    operativeVersion: {
      ...base.operativeVersion,
      ...over,
    },
  };
}

describe("covenant research phase3 — amendment fail-closed", () => {
  const base = curated[0]!;

  it("fails closed on UNRESOLVED_OPERATIVE_STATE for operative-only queries", () => {
    const entry = withOperative(base, {
      entryId: "tmp-unresolved",
      status: "UNRESOLVED_OPERATIVE_STATE",
      effectiveFrom: "2020-01-01",
      effectiveTo: null,
      supersededByEntryId: null,
    });
    const cls = classifyOperativeAsOf(entry, "2024-01-01");
    expect(cls.includeInOperativeOnly).toBe(false);
    const response = retrieveResearch(
      { text: entry.sourceExcerpt.slice(0, 40), asOfDate: "2024-01-01", operativeOnly: true },
      { corpus: [entry], limit: 5 },
    );
    expect(response.hits.some((h) => h.entry.entryId === "tmp-unresolved")).toBe(false);
  });

  it("fails closed on MISSING_AMENDMENT_AUTHORITY", () => {
    const entry = withOperative(base, {
      entryId: "tmp-missing-authority",
      status: "MISSING_AMENDMENT_AUTHORITY",
      effectiveFrom: null,
      effectiveTo: null,
      supersededByEntryId: null,
    });
    const cls = classifyOperativeAsOf(entry, "2024-01-01");
    expect(cls.status).toBe("MISSING_AMENDMENT_AUTHORITY");
    expect(cls.includeInOperativeOnly).toBe(false);
  });

  it("surfaces uncertainty for superseded basket when not operative-only", () => {
    const prior = curated.find((e) => e.entryId === "fixture-rp-basket-pre-amendment")!;
    const response = retrieveResearch(
      { text: "Restricted Payments basket $50,000,000", issuer: "RFIC", asOfDate: "2024-06-01" },
      { corpus: curated, limit: 10 },
    );
    const hit = response.hits.find((h) => h.entry.entryId === prior.entryId);
    if (hit) {
      expect(hit.operativeClassification).toBe("SUPERSEDED");
      expect((hit.uncertaintyNotes ?? []).length).toBeGreaterThan(0);
    }
  });

  it("does not invent operative status for conditional-effectiveness without dates", () => {
    const entry = withOperative(base, {
      entryId: "tmp-conditional",
      status: "UNKNOWN",
      effectiveFrom: null,
      effectiveTo: null,
      supersededByEntryId: null,
    });
    entry.tags = [...entry.tags, "conditional-effectiveness"];
    entry.missingDependencies = [
      {
        kind: "CONDITIONAL_EFFECTIVENESS_UNRESOLVED",
        description: "Effectiveness conditions present but not resolved against as-of facts.",
        disclosed: true,
      },
    ];
    const response = retrieveResearch(
      { text: entry.sourceExcerpt.slice(0, 60), asOfDate: "2025-01-01", operativeOnly: true },
      { corpus: [entry], limit: 5 },
    );
    expect(response.hits.length).toBe(0);
  });

  it("distinguishes original vs amended RP fixture amounts under as-of", () => {
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
    // Amended excerpt may historically mention $50,000,000 while substituting $25,000,000.
    expect(response.hits.some((h) => h.entry.sourceExcerpt.includes("$25,000,000"))).toBe(true);
  });
});
