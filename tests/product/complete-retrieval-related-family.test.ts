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

describe("expandRetrievalSet section-ref boundary matching (rule 71)", () => {
  it("does not treat §6.10 as a child of a §6.1 prohibition", () => {
    const prohibition = item("6.1", "DEBT_INCURRENCE", "GENERAL_PROHIBITION");
    const otherSectionPerm = item("6.10", "DEBT_INCURRENCE", "ENUMERATED_PERMISSION");
    const { omissions } = expandRetrievalSet({
      question: "Can we incur debt?",
      initial: [prohibition],
      corpus: [prohibition, otherSectionPerm],
    });
    expect(omissions.filter((o) => o.kind === "MISSING_PERMISSION_UNDER_PROHIBITION")).toHaveLength(1);
  });

  it("still treats §6.01(b) as a child of a §6.01(a) prohibition", () => {
    const prohibition = item("6.01(a)", "DEBT_INCURRENCE", "GENERAL_PROHIBITION");
    const childPerm = item("6.01(b)", "DEBT_INCURRENCE", "ENUMERATED_PERMISSION");
    const { expanded, omissions } = expandRetrievalSet({
      question: "Can we incur debt?",
      initial: [prohibition],
      corpus: [prohibition, childPerm],
    });
    expect(expanded.some((e) => e.sectionRef === "6.01(b)" && e.role === "PERMISSION")).toBe(true);
    expect(omissions.filter((o) => o.kind === "MISSING_PERMISSION_UNDER_PROHIBITION")).toHaveLength(0);
  });

  it("does not resolve a cross-reference to §6.1 to §6.10's provision", () => {
    const hit = item("5.01", "DEBT_INCURRENCE", "GENERAL_PROHIBITION");
    hit.crossReferences = ["Section 6.1"];
    const other = item("6.10", "DEBT_INCURRENCE", "ENUMERATED_PERMISSION");
    const { expanded, omissions } = expandRetrievalSet({
      question: "Can we incur debt?",
      initial: [hit],
      corpus: [hit, other],
    });
    expect(expanded.some((e) => e.sectionRef === "6.10" && e.role === "CROSS_REFERENCE")).toBe(false);
    expect(omissions.filter((o) => o.kind === "MISSING_CROSS_REF_TARGET")).toHaveLength(1);
  });
});
