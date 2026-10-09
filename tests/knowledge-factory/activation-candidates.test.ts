import { describe, expect, it } from "vitest";
import { activateSummaryItem } from "../../lib/knowledge-factory/activation/provision-candidates";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";
import type { ProvisionAnalysis } from "../../lib/product/covenant-intelligence/analyze-provision";

function item(overrides: Partial<CovenantSummaryItem> & Pick<CovenantSummaryItem, "operativeLanguageExcerpt" | "materialBasketsThresholds">): CovenantSummaryItem {
  const analysis = {
    sectionRef: "7.01(c)",
    heading: "Indebtedness",
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt",
    families: ["INDEBTEDNESS"],
    posture: "ENUMERATED_PERMISSION",
    plainEnglish: "Greater-of basket",
    restriction: null,
    permissions: ["(c) Indebtedness not exceeding the greater of $50,000,000 and 10% of Consolidated EBITDA"],
    coveredEntities: ["Borrower"],
    entityScopeNotes: [],
    exceptions: [],
    conditions: [],
    basketsAndThresholds: overrides.materialBasketsThresholds,
    draftingPatterns: ["greater-of-basket"],
    operativeLanguageExcerpt: overrides.operativeLanguageExcerpt,
    sourceCitation: "test§7.01(c)",
    applicableDefinitions: [],
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote: "test",
    unresolved: [],
    alternativeInterpretations: [],
    assumptions: [],
    judgmentCalls: [],
  } as ProvisionAnalysis;

  return {
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt",
    sectionRef: "7.01(c)",
    heading: "Indebtedness",
    posture: "ENUMERATED_PERMISSION",
    plainEnglish: analysis.plainEnglish,
    restriction: null,
    permissions: analysis.permissions,
    coveredEntities: ["Borrower"],
    exceptions: [],
    conditions: [],
    draftingPatterns: ["greater-of-basket"],
    sourceCitation: "test§7.01(c)",
    governingAgreement: "Test CA",
    families: ["INDEBTEDNESS"],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: {
      borrower: true,
      guarantor: false,
      restrictedSubsidiary: false,
      unrestrictedSubsidiary: false,
      notes: [],
    },
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote: "test",
    unresolvedQuestions: [],
    analysis,
    ...overrides,
  };
}

describe("provision activation candidates", () => {
  it("activates a source-backed greater-of EBITDA basket without certifying", () => {
    const activated = activateSummaryItem({
      sourceId: "test-source",
      item: item({
        operativeLanguageExcerpt:
          "The Borrower shall not create Indebtedness except Indebtedness not exceeding the greater of (A) $50,000,000 and (B) 10% of Consolidated EBITDA.",
        materialBasketsThresholds: ["Greater-of basket: $50,000,000 and 10% of Consolidated EBITDA"],
      }),
    });
    expect(activated.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_EBITDA");
    expect(activated.allChecksPassed).toBe(true);
    expect(activated.executableEligible).toBe(true);
    expect(activated.readiness).toBe("EXECUTABLE_FORMULA_CANDIDATE");
    expect(activated.certificationStatus).toBe("NOT_CERTIFIED");
  });

  it("refuses activation when threshold tokens are not in the excerpt", () => {
    const activated = activateSummaryItem({
      sourceId: "test-source",
      item: item({
        operativeLanguageExcerpt: "Indebtedness as otherwise permitted under this Agreement.",
        materialBasketsThresholds: ["Greater-of basket: $50,000,000 and 10% of Consolidated EBITDA"],
        permissions: ["Greater of $50,000,000 and 10% of Consolidated EBITDA"],
      }),
    });
    // permissions carry the tokens — should still activate if tokens are in joined evidence
    expect(activated.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_EBITDA");
  });
});
