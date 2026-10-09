/**
 * Secured-debt Ask must retrieve BOTH Liens and Indebtedness regimes —
 * not only the highest-scoring incremental / debt provision.
 */
import { describe, expect, it } from "vitest";
import { answerFromSummaryItems } from "../../lib/product/covenant-intelligence/ask-retrieve";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function stubItem(
  partial: Partial<CovenantSummaryItem> &
    Pick<CovenantSummaryItem, "sectionRef" | "heading" | "category" | "posture">,
): CovenantSummaryItem & { sourceId: string } {
  return {
    categoryLabel: partial.categoryLabel ?? partial.category,
    plainEnglish:
      partial.plainEnglish ??
      `Section ${partial.sectionRef} addresses ${partial.heading.toLowerCase()}.`,
    restriction: partial.restriction ?? null,
    permissions: partial.permissions ?? [],
    coveredEntities: ["Borrower"],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: partial.materialBasketsThresholds ?? [],
    draftingPatterns: [],
    operativeLanguageExcerpt: partial.operativeLanguageExcerpt ?? partial.heading,
    sourceCitation: `§${partial.sectionRef}`,
    governingAgreement: "Test Credit Agreement",
    families: partial.families ?? [],
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
    interpretationNote: "",
    unresolvedQuestions: [],
    analysis: {} as CovenantSummaryItem["analysis"],
    ...partial,
    sourceId: "fixture:secured-debt",
  };
}

describe("secured-debt dual-regime Ask", () => {
  it("returns both LIENS and INDEBTEDNESS regimes even when incremental debt scores highest", () => {
    const items = [
      stubItem({
        sectionRef: "2.14",
        heading: "Incremental Facilities",
        category: "DEBT_INCURRENCE",
        posture: "CONDITIONAL_PERMISSION",
        plainEnglish:
          "Incremental Cap combines Fixed Incremental Amount, Ratio Incremental Amount, and Voluntary Prepayment Incremental Amount.",
        materialBasketsThresholds: [
          "Incremental path: Fixed / Cash-Capped Incremental Amount.",
          "Incremental path: Ratio Incremental Amount (ratio condition).",
          "Incremental Amount is a multi-component sum (fixed / ratio / voluntary / reallocations).",
        ],
        families: ["INDEBTEDNESS"],
      }),
      stubItem({
        sectionRef: "7.01",
        heading: "Limitation on Indebtedness",
        category: "DEBT_INCURRENCE",
        posture: "GENERAL_PROHIBITION",
        restriction: "Borrower shall not create, incur, assume or suffer to exist any Indebtedness",
        plainEnglish: "General prohibition on Indebtedness except enumerated baskets.",
        permissions: ["Ratio debt basket", "General debt basket"],
        families: ["INDEBTEDNESS"],
      }),
      stubItem({
        sectionRef: "7.02",
        heading: "Limitation on Liens",
        category: "LIENS_SECURED_DEBT",
        posture: "GENERAL_PROHIBITION",
        restriction: "Create, incur, assume or suffer to exist any Lien — except as expressly permitted",
        plainEnglish: "General prohibition on Liens except Permitted Liens.",
        permissions: ["Permitted Liens basket", "Available Amount Lien basket"],
        materialBasketsThresholds: ["Not Otherwise Applied / builder netting referenced."],
        families: ["LIENS"],
      }),
      stubItem({
        sectionRef: "7.05",
        heading: "Restricted Payments",
        category: "RESTRICTED_PAYMENTS_INVESTMENTS",
        posture: "GENERAL_PROHIBITION",
        plainEnglish: "Restricted Payments prohibited except baskets including Available Amount.",
        families: ["RESTRICTED_PAYMENTS"],
      }),
    ];

    const answer = answerFromSummaryItems({
      question: "What restrictions apply to additional secured debt?",
      items,
      researchOnly: true,
      limit: 5,
    });

    expect(answer.kind).toBe("answered");
    expect(answer.detail).toMatch(/\[LIENS REGIME\]/);
    expect(answer.detail).toMatch(/\[INDEBTEDNESS REGIME\]/);
    expect(answer.citations.some((c) => c.sectionRef === "7.02")).toBe(true);
    expect(answer.citations.some((c) => c.sectionRef === "7.01")).toBe(true);
    // Liens regime must appear even though incremental facilities would otherwise dominate ranking.
    const liensIdx = answer.detail.indexOf("LIENS REGIME");
    const debtIdx = answer.detail.indexOf("INDEBTEDNESS REGIME");
    expect(liensIdx).toBeGreaterThan(-1);
    expect(debtIdx).toBeGreaterThan(-1);
  });

  it("surfaces incremental path mechanics on incremental-facility questions", () => {
    const answer = answerFromSummaryItems({
      question: "What incremental facility capacity paths are available?",
      items: [
        stubItem({
          sectionRef: "2.18",
          heading: "Incremental Facilities",
          category: "DEBT_INCURRENCE",
          posture: "CONDITIONAL_PERMISSION",
          plainEnglish: "Incremental Cap is Fixed plus Ratio plus Voluntary Prepayment.",
          materialBasketsThresholds: [
            "Incremental path: Fixed / Cash-Capped Incremental Amount.",
            "Incremental path: Ratio Incremental Amount (ratio condition).",
            "Incremental default utilization order / election dependency present.",
          ],
          families: ["INDEBTEDNESS"],
        }),
        stubItem({
          sectionRef: "7.01",
          heading: "Indebtedness",
          category: "DEBT_INCURRENCE",
          posture: "GENERAL_PROHIBITION",
          plainEnglish: "General debt prohibition.",
          families: ["INDEBTEDNESS"],
        }),
      ],
      researchOnly: true,
      limit: 4,
    });
    expect(answer.kind).toBe("answered");
    expect(answer.detail).toMatch(/Incremental capacity typically combines/);
    expect(answer.detail).toMatch(/Capacity mechanics:.*Fixed|Ratio|election/i);
  });
});
