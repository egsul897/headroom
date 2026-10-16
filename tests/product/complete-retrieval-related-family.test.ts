/**
 * Rule 70 — no false MISSING_RELATED_FAMILY omission when the
 * peer family is already in the retrieval set.
 *
 * expandRetrievalSet's related-family block computed
 * `related` = corpus peers NOT yet seen, added them, then
 * flagged an omission when `related.length === 0` and ANY
 * peer existed in the corpus. But related.length === 0 with
 * peers present means every peer is ALREADY in the set — so
 * the omission fired exactly when the peer family was
 * present, falsely claiming the initial set omitted it. The
 * adversarial verifier turns this into a MATERIAL
 * OMISSION_FROM_RETRIEVAL finding: a false alarm on verified
 * answers.
 */
import { describe, expect, it } from "vitest";
import { expandRetrievalSet } from "../../lib/product/covenant-intelligence/complete-retrieval";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(
  sectionRef: string,
  category: CovenantSummaryItem["category"],
  posture: CovenantSummaryItem["posture"],
): CovenantSummaryItem & { sourceId: string } {
  return {
    category,
    categoryLabel: category,
    sectionRef,
    heading: `Section ${sectionRef}`,
    posture,
    plainEnglish: "Test provision.",
    restriction: null,
    permissions: [],
    coveredEntities: [],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: [],
    draftingPatterns: [],
    operativeLanguageExcerpt: "The Company shall not incur Indebtedness.",
    sourceCitation: `s1 · §${sectionRef}`,
    governingAgreement: "Test Indenture",
    families: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: { borrower: true, guarantor: false, restrictedSubsidiary: false, unrestrictedSubsidiary: false, notes: [] },
    crossReferences: [],
    dependencies: [],
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote: "",
    unresolvedQuestions: [],
    analysis: {} as CovenantSummaryItem["analysis"],
    sourceId: "s1",
  };
}

describe("expandRetrievalSet related-family omissions", () => {
  it("does not flag MISSING_RELATED_FAMILY when the peer family is already in the initial set", () => {
    const debt = item("6.01", "DEBT_INCURRENCE", "GENERAL_PROHIBITION");
    const lien = item("6.02", "LIENS_SECURED_DEBT", "GENERAL_PROHIBITION");
    const { omissions } = expandRetrievalSet({
      question: "Can we incur secured debt?",
      initial: [debt, lien],
      corpus: [debt, lien],
    });
    expect(omissions.filter((o) => o.kind === "MISSING_RELATED_FAMILY")).toHaveLength(0);
  });

  it("expands an unseen peer family instead of flagging it missing", () => {
    const debt = item("6.01", "DEBT_INCURRENCE", "GENERAL_PROHIBITION");
    const lien = item("6.02", "LIENS_SECURED_DEBT", "GENERAL_PROHIBITION");
    const { expanded, omissions } = expandRetrievalSet({
      question: "Can we incur secured debt?",
      initial: [debt],
      corpus: [debt, lien],
    });
    expect(expanded.some((e) => e.sectionRef === "6.02" && e.role === "RELATED_COVENANT")).toBe(true);
    expect(omissions.filter((o) => o.kind === "MISSING_RELATED_FAMILY")).toHaveLength(0);
  });
});
