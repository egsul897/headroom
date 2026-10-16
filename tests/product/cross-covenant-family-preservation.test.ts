/**
 * Rule 75 — shared/reclass language adds a marker entry; it must
 * not relabel the item's own family.
 *
 * analyzeCrossCovenant pushed every mapped family as
 * SHARED_CAPACITY (or RECLASSIFICATION) when the item's text
 * had shared/reclass language, so a shared-capacity debt item
 * lost its DEBT_INCURRENCE restriction from the applicable set
 * and the conjunction consumer no longer saw the debt
 * restriction. Markers are now additional, not replacements.
 */
import { describe, expect, it } from "vitest";
import { analyzeCrossCovenant } from "../../lib/product/covenant-intelligence/cross-covenant";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(
  overrides: Partial<CovenantSummaryItem> = {},
): CovenantSummaryItem & { sourceId: string } {
  return {
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt incurrence",
    sectionRef: "7.2",
    heading: "Limitation on Indebtedness",
    posture: "GENERAL_PROHIBITION",
    plainEnglish: "The Company shall not incur Indebtedness.",
    restriction: "General prohibition on incurring Indebtedness.",
    permissions: [],
    coveredEntities: [],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: [],
    draftingPatterns: [],
    operativeLanguageExcerpt: "The Company shall not incur Indebtedness.",
    sourceCitation: "s1 · §7.2",
    governingAgreement: "Test Credit Agreement",
    families: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: { borrower: true, guarantor: false, restrictedSubsidiary: false, unrestrictedSubsidiary: false, notes: [] },
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote: "",
    unresolvedQuestions: [],
    analysis: {
      sectionRef: "7.2",
      heading: "Limitation on Indebtedness",
      category: "DEBT_INCURRENCE",
      categoryLabel: "Debt incurrence",
      families: [],
      posture: "GENERAL_PROHIBITION",
      plainEnglish: "The Company shall not incur Indebtedness.",
      restriction: "General prohibition on incurring Indebtedness.",
      permissions: [],
      coveredEntities: [],
      entityScopeNotes: [],
      exceptions: [],
      conditions: [],
      basketsAndThresholds: [],
      draftingPatterns: [],
      applicableDefinitions: [],
      crossReferences: [],
      dependencies: [],
      operativeLanguageExcerpt: "The Company shall not incur Indebtedness.",
      sourceCitation: "s1 · §7.2",
      epistemicStatus: "DISCOVERED_CANDIDATE",
      interpretationNote: "",
      unresolved: [],
    } as unknown as CovenantSummaryItem["analysis"],
    ...overrides,
    sourceId: "s1",
  };
}

describe("analyzeCrossCovenant family preservation", () => {
  it("a shared-capacity debt item keeps its DEBT_INCURRENCE restriction plus a SHARED_CAPACITY marker", () => {
    const result = analyzeCrossCovenant({
      transactionDescription: "Incur $30M of secured debt.",
      items: [
        item({
          operativeLanguageExcerpt:
            "The Company shall not incur Indebtedness together with Section 7.3 in the aggregate.",
        }),
      ],
    });
    const families = result.applicableRestrictions.map((r) => r.family);
    expect(families).toContain("DEBT_INCURRENCE");
    expect(families).toContain("SHARED_CAPACITY");
    expect(result.sharedCapacityLinks).toHaveLength(1);
  });

  it("a reclassification item keeps its own family plus a RECLASSIFICATION marker", () => {
    const result = analyzeCrossCovenant({
      transactionDescription: "Incur $30M of debt.",
      items: [
        item({
          operativeLanguageExcerpt:
            "The Company may reclassify any Indebtedness among the baskets in this Section.",
        }),
      ],
    });
    const families = result.applicableRestrictions.map((r) => r.family);
    expect(families).toContain("DEBT_INCURRENCE");
    expect(families).toContain("RECLASSIFICATION");
  });

  it("a plain debt item is unchanged (no marker entries)", () => {
    const result = analyzeCrossCovenant({
      transactionDescription: "Incur $30M of debt.",
      items: [item({})],
    });
    const families = result.applicableRestrictions.map((r) => r.family);
    expect(families).toContain("DEBT_INCURRENCE");
    expect(families).not.toContain("SHARED_CAPACITY");
    expect(families).not.toContain("RECLASSIFICATION");
  });
});
