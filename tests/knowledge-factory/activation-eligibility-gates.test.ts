import { describe, expect, it } from "vitest";
import {
  activateSummaryItem,
  HIGH_CONFIDENCE_MECHANICS,
  STRICT_REVIEW_MECHANICS,
} from "../../lib/knowledge-factory/activation/provision-candidates";
import { parseCounselFormulaForTest } from "../../lib/product/customer-intelligence/compile-accepted";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";
import type { ProvisionAnalysis } from "../../lib/product/covenant-intelligence/analyze-provision";

function item(
  overrides: Partial<CovenantSummaryItem> &
    Pick<CovenantSummaryItem, "operativeLanguageExcerpt" | "materialBasketsThresholds">,
): CovenantSummaryItem {
  const analysis = {
    sectionRef: overrides.sectionRef ?? "7.01(c)",
    heading: overrides.heading ?? "Indebtedness",
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt",
    families: overrides.families ?? ["INDEBTEDNESS"],
    posture: "ENUMERATED_PERMISSION",
    plainEnglish: "Basket",
    restriction: null,
    permissions: overrides.permissions ?? [],
    coveredEntities: ["Borrower"],
    entityScopeNotes: [],
    exceptions: [],
    conditions: overrides.conditions ?? [],
    basketsAndThresholds: overrides.materialBasketsThresholds,
    draftingPatterns: [],
    operativeLanguageExcerpt: overrides.operativeLanguageExcerpt,
    sourceCitation: "test§7.01(c)",
    applicableDefinitions: overrides.applicableDefinitions ?? [],
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
    plainEnglish: "Basket",
    restriction: null,
    permissions: [],
    coveredEntities: ["Borrower"],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: overrides.materialBasketsThresholds,
    draftingPatterns: [],
    operativeLanguageExcerpt: overrides.operativeLanguageExcerpt,
    sourceCitation: "test§7.01(c)",
    governingAgreement: "Test Credit Agreement",
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

describe("Cycle 5 eligibility gates — formula discovery ≠ legal permission", () => {
  it("activates high-confidence greater-of EBITDA only after gates", () => {
    const activated = activateSummaryItem({
      sourceId: "test-source",
      item: item({
        operativeLanguageExcerpt:
          "The Borrower shall not create Indebtedness except Indebtedness not exceeding the greater of (A) $50,000,000 and (B) 10% of Consolidated EBITDA.",
        materialBasketsThresholds: ["Greater-of basket: $50,000,000 and 10% of Consolidated EBITDA"],
      }),
    });
    expect(HIGH_CONFIDENCE_MECHANICS.has(activated.formulaType!)).toBe(true);
    expect(activated.readiness).toBe("EXECUTABLE_FORMULA_CANDIDATE");
    expect(activated.executableEligible).toBe(true);
    expect(activated.certificationStatus).toBe("NOT_CERTIFIED");
    expect(activated.eligibilityGates.some((g) => g.gate === "high_confidence_mechanic" && g.ok)).toBe(
      true,
    );
  });

  it("does not mark BUILDER executable — strict mechanic gate", () => {
    const activated = activateSummaryItem({
      sourceId: "test-builder",
      item: item({
        operativeLanguageExcerpt:
          "Restricted Payments from the Available Amount, which means an amount equal to $20,000,000 plus 50% of Consolidated Net Income.",
        materialBasketsThresholds: ["Available Amount means $20,000,000 plus CNI"],
        families: ["AVAILABLE_AMOUNT_AND_BUILDER_BASKETS", "RESTRICTED_PAYMENTS"],
      }),
    });
    expect(activated.formulaType).toBe("BUILDER_BASKET");
    expect(STRICT_REVIEW_MECHANICS.has(activated.formulaType!)).toBe(true);
    expect(activated.readiness).toBe("BLOCKED_MECHANIC_GATE");
    expect(activated.executableEligible).toBe(false);
    expect(activated.ownershipHints.some((h) => /Agent3|Agent2/.test(h))).toBe(true);
  });

  it("does not mark LEVERAGE executable — strict mechanic gate", () => {
    const activated = activateSummaryItem({
      sourceId: "test-lev",
      item: item({
        operativeLanguageExcerpt:
          "The Borrower may incur Ratio Debt so long as the Total Net Leverage Ratio is not greater than 4.50 to 1.00 on a Pro Forma Basis.",
        materialBasketsThresholds: ["Ratio Debt at 4.50x leverage"],
        plainEnglish: "Ratio debt incurrence at 4.50 to 1.00 leverage",
      }),
    });
    expect(activated.formulaType === "LEVERAGE_RATIO_ROOM" || activated.formulaType === "RATIO_GATE").toBe(
      true,
    );
    expect(activated.executableEligible).toBe(false);
    expect(["BLOCKED_MECHANIC_GATE", "REVIEW_REQUIRED", "DISCOVERED_FORMULA"]).toContain(
      activated.readiness,
    );
  });

  it("blocks shared-capacity from executable promotion", () => {
    const activated = activateSummaryItem({
      sourceId: "test-shared",
      item: item({
        operativeLanguageExcerpt:
          "The Borrower shall not create Indebtedness except in an amount not to exceed $25,000,000; provided that such amount is calculated without duplication and combined with amounts incurred pursuant to Section 7.01(q).",
        materialBasketsThresholds: ["$25,000,000 flat basket shared with 7.01(q)"],
        families: ["INDEBTEDNESS", "SHARED_CAPACITY_PROVISIONS"],
      }),
    });
    expect(activated.formulaType).toBe("FLAT_AMOUNT");
    expect(activated.readiness).toBe("BLOCKED_SHARED_CAPACITY");
    expect(activated.executableEligible).toBe(false);
  });

  it("refuses executable for non-operative notices section with coincidental dollars", () => {
    const activated = activateSummaryItem({
      sourceId: "test-notices",
      item: item({
        sectionRef: "1.09",
        heading: "Notices Communications, Etc.",
        operativeLanguageExcerpt:
          "SECTION 1.09. Notices Communications, Etc. All notices shall be given in writing. Fee of $100,000,000 for overnight courier is illustrative only.",
        materialBasketsThresholds: ["$100,000,000"],
      }),
    });
    expect(activated.executableEligible).toBe(false);
    expect(activated.readiness).not.toBe("EXECUTABLE_FORMULA_CANDIDATE");
  });

  it("prefer greater-of over Available Amount mention (Cycle 4 false BUILDER root cause)", () => {
    const parsed = parseCounselFormulaForTest(
      item({
        operativeLanguageExcerpt:
          "Restricted Payments in an aggregate amount not to exceed the greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA; reductions of the Available Amount shall be without duplication.",
        materialBasketsThresholds: [
          "greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA; Available Amount",
        ],
        plainEnglish: "RP basket greater of $21M and 35% EBITDA; Available Amount offsets",
      }),
    );
    expect(parsed.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_EBITDA");
    expect(parsed.thresholdValue).toBe(21);
  });

  it("a plausible numeric formula alone is not executable without entity scope", () => {
    const activated = activateSummaryItem({
      sourceId: "test-no-entity",
      item: item({
        operativeLanguageExcerpt:
          "Indebtedness not to exceed $40,000,000 in aggregate principal amount at any time outstanding.",
        materialBasketsThresholds: ["$40,000,000"],
        coveredEntities: [],
        entityScope: {
          borrower: false,
          guarantor: false,
          restrictedSubsidiary: false,
          unrestrictedSubsidiary: false,
          notes: [],
        },
      }),
    });
    // excerpt lacks Borrower/etc. nouns
    expect(activated.executableEligible).toBe(false);
  });

  it("hard-fails executable when condition language present but conditions[] empty", () => {
    const activated = activateSummaryItem({
      sourceId: "test-cond",
      item: item({
        operativeLanguageExcerpt:
          "The Borrower shall not create Indebtedness except in an amount not to exceed $40,000,000; provided that no Event of Default shall have occurred and be continuing.",
        materialBasketsThresholds: ["$40,000,000"],
        conditions: [],
      }),
    });
    expect(activated.executableEligible).toBe(false);
    expect(activated.readiness).toBe("REVIEW_REQUIRED");
    expect(activated.unresolvedDependencies).toContain("conditions_not_structured");
  });

  it("blocks definitional Article I / 1.01 sections from executable", () => {
    const activated = activateSummaryItem({
      sourceId: "test-def",
      item: item({
        sectionRef: "1.01(i)",
        heading: "Definitions",
        operativeLanguageExcerpt:
          "Consolidated EBITDA means the greater of $50,000,000 and 10% of Consolidated EBITDA of the Borrower.",
        materialBasketsThresholds: ["greater of $50,000,000 and 10% of Consolidated EBITDA"],
      }),
    });
    expect(activated.executableEligible).toBe(false);
    expect(activated.readiness).not.toBe("EXECUTABLE_FORMULA_CANDIDATE");
  });
});
