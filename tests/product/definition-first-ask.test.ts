/**
 * Definitional questions must surface recovered definition text, not unrelated
 * incremental-facility / basket excerpts that merely mention the term.
 */
import { describe, expect, it } from "vitest";
import {
  answerFromSummaryItems,
  extractDefinedTermQuery,
} from "../../lib/product/covenant-intelligence/ask-retrieve";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";

function stubItem(partial: Partial<CovenantSummaryItem> & Pick<CovenantSummaryItem, "sectionRef" | "heading">): CovenantSummaryItem & { sourceId: string } {
  return {
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt incurrence",
    posture: "CONDITIONAL_PERMISSION",
    plainEnglish: partial.plainEnglish ?? `Section ${partial.sectionRef} mentions Consolidated EBITDA in a basket.`,
    restriction: null,
    permissions: [],
    coveredEntities: ["Borrower"],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: [],
    draftingPatterns: [],
    operativeLanguageExcerpt: partial.operativeLanguageExcerpt ?? "shall not exceed Consolidated EBITDA",
    sourceCitation: `§${partial.sectionRef}`,
    governingAgreement: "Test Credit Agreement",
    families: ["INDEBTEDNESS"],
    relatedDefinedTerms: [],
    applicableDefinitions: partial.applicableDefinitions ?? [],
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
    sourceId: "fixture:def-first",
  };
}

describe("definition-first Ask retrieval", () => {
  it("extracts defined-term queries from natural-language questions", () => {
    expect(extractDefinedTermQuery("What constitutes Consolidated EBITDA?")).toBe("Consolidated EBITDA");
    expect(extractDefinedTermQuery("What is Acquired EBITDA?")).toBe("Acquired EBITDA");
    expect(extractDefinedTermQuery("How is Total Net Leverage Ratio calculated?")).toBe(
      "Total Net Leverage Ratio",
    );
  });

  it("prefers bare Consolidated EBITDA over longer ratio terms containing that phrase", () => {
    const ebitdaExcerpt =
      "“ Consolidated EBITDA ” means, with reference to any period, Consolidated Net Income for such period plus add-backs.";
    const answer = answerFromSummaryItems({
      question: "What constitutes Consolidated EBITDA?",
      definedTerms: [
        {
          term: "Consolidated First Lien Secured Debt to Consolidated EBITDA Ratio",
          excerpt: "“Consolidated First Lien Secured Debt to Consolidated EBITDA Ratio” means the ratio of …",
        },
        { term: "Consolidated EBITDA", excerpt: ebitdaExcerpt },
      ],
      items: [
        stubItem({
          sectionRef: "9.6",
          heading: "Financial Covenants",
          category: "FINANCIAL_MAINTENANCE",
          posture: "MAINTENANCE_TEST",
          plainEnglish: "Leverage test uses Consolidated EBITDA.",
          applicableDefinitions: [
            { term: "Consolidated EBITDA", excerpt: ebitdaExcerpt, resolved: true },
          ],
        }),
      ],
      researchOnly: true,
      limit: 3,
    });
    expect(answer.citations[0]?.sectionRef).toBe("Definition: Consolidated EBITDA");
    expect(answer.detail).toMatch(/Consolidated Net Income/);
    expect(answer.citations[0]?.sectionRef).not.toMatch(/First Lien/i);
  });

  it("leads with definition text for 'what constitutes Consolidated EBITDA'", () => {
    const ebitdaExcerpt =
      "“ Consolidated EBITDA ” means, with reference to any period, Consolidated Net Income for such period plus add-backs.";
    const answer = answerFromSummaryItems({
      question: "What constitutes Consolidated EBITDA?",
      definedTerms: [{ term: "Consolidated EBITDA", excerpt: ebitdaExcerpt }],
      items: [
        stubItem({
          sectionRef: "2.20(j)",
          heading: "Incremental Cap",
          category: "DEBT_INCURRENCE",
          plainEnglish: "Incremental Equivalent Debt shall not exceed the Incremental Cap measured against Consolidated EBITDA.",
          operativeLanguageExcerpt: "shall not exceed (a) the Incremental Cap and Consolidated EBITDA",
        }),
        stubItem({
          sectionRef: "6.10",
          heading: "Financial Covenant",
          category: "FINANCIAL_MAINTENANCE",
          posture: "MAINTENANCE_TEST",
          plainEnglish: "Total Net Leverage Ratio based on Consolidated EBITDA.",
          applicableDefinitions: [
            { term: "Consolidated EBITDA", excerpt: ebitdaExcerpt, resolved: true },
          ],
        }),
      ],
      researchOnly: true,
      limit: 3,
    });

    expect(answer.kind).toBe("answered");
    expect(answer.detail).toMatch(/The agreement defines/);
    expect(answer.detail).toMatch(/Consolidated Net Income/);
    expect(answer.citations[0]?.sectionRef).toMatch(/^Definition:\s*Consolidated EBITDA/i);
    // Must not lead with Incremental Cap as the answer to a definitional question
    expect(answer.citations[0]?.sectionRef).not.toMatch(/2\.20/);
  });
});

describe("related definition attachment", () => {
  it("prefers longer material terms over short substring collisions", () => {
    const analysis = analyzeProvision({
      sourceId: "fixture:rel-defs",
      documentTitle: "Test",
      candidate: {
        candidateId: "c1",
        sourceId: "fixture:rel-defs",
        nodeId: "n1",
        families: ["INDEBTEDNESS"],
        signals: ["indebtedness"],
        excerpt:
          "Borrower shall not incur Indebtedness except Consolidated EBITDA based baskets and Lien permissions.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 10,
      },
      definitions: [
        { term: "EBITDA", sourceId: "x", charStart: 0, charEnd: 40, excerpt: "“EBITDA” means earnings." },
        {
          term: "Consolidated EBITDA",
          sourceId: "x",
          charStart: 0,
          charEnd: 80,
          excerpt: "“Consolidated EBITDA” means Consolidated Net Income plus add-backs.",
        },
        { term: "Lien", sourceId: "x", charStart: 0, charEnd: 30, excerpt: "“Lien” means a security interest." },
      ],
      structuralNodes: [
        {
          nodeId: "n1",
          sourceId: "fixture:rel-defs",
          nodeType: "SECTION",
          sectionRef: "7.01",
          heading: "Indebtedness",
          charStart: 0,
          charEnd: 120,
          ambiguous: false,
        },
      ],
    });
    const terms = analysis.applicableDefinitions.map((d) => d.term);
    expect(terms[0]).toBe("Consolidated EBITDA");
    expect(terms).toContain("Lien");
  });
});
