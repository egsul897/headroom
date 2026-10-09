import { describe, expect, it } from "vitest";
import {
  auditCandidateAgainstOperative,
  extractOperativeWindow,
  independentFormulaFromOperative,
  wilsonInterval,
  type CandidateForAudit,
} from "../../lib/knowledge-factory/activation/independent-audit";
import { buildReviewReadyRecord } from "../../lib/knowledge-factory/activation/review-ready-record";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

describe("independent operative-text audit", () => {
  it("classifies greater-of EBITDA from operative window (not summary tokens)", () => {
    const op =
      "Section 6.01 Indebtedness. The Borrower shall not permit Restricted Subsidiaries that are not Loan Parties to incur Indebtedness in an aggregate outstanding principal amount not to exceed the greater of $30,000,000 and 50% of Consolidated Adjusted EBITDA as of the last day of the most recently ended Test Period; provided that no Default shall have occurred.";
    const indep = independentFormulaFromOperative(op);
    expect(indep.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_EBITDA");
    expect(indep.thresholdMillions).toBe(30);
    expect(indep.pct).toBeCloseTo(0.5, 5);
    expect(indep.comparator).toBe("GREATER_OF");
  });

  it("classifies assets grower including 'total consolidated assets' phrasing", () => {
    const op =
      "Section 6.01. other Indebtedness in an aggregate principal amount outstanding at any time not to exceed the greater of $70,000,000 and 5.5% of the total consolidated assets of the Loan Parties and their Subsidiaries as reflected on their balance sheet.";
    const indep = independentFormulaFromOperative(op);
    expect(indep.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS");
    expect(indep.thresholdMillions).toBe(70);
    expect(indep.pct).toBeCloseTo(0.055, 5);
  });

  it("flags lesser-of misclassification as material omission", () => {
    const full =
      "Section 7.01 Liens. Liens securing Indebtedness in an aggregate amount not to exceed the lesser of $25,000,000 and 10% of Consolidated EBITDA; Borrower and Guarantors only.";
    const candidate: CandidateForAudit = {
      sourceId: "test:lesser",
      sectionRef: "7.01",
      heading: "Liens",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 25,
      params: { pctEbitda: 0.1 },
      posture: "GENERAL_PROHIBITION",
      families: ["LIENS"],
      excerptEvidence: "greater of $25,000,000 and 10%",
    };
    const audit = auditCandidateAgainstOperative({ candidate, fullDocumentText: full });
    expect(audit.falseExecutableClassification).toBe(true);
    expect(audit.materialOmissions).toContain("incorrect_greater_of_vs_lesser_of");
    expect(audit.disposition).toBe("FALSE_EXECUTABLE");
  });

  it("does not infer correctness from token overlap alone when section missing", () => {
    const candidate: CandidateForAudit = {
      sourceId: "test:missing",
      sectionRef: "99.99",
      heading: "Phantom",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 50,
      params: null,
      posture: "GENERAL_PROHIBITION",
      families: ["INDEBTEDNESS"],
      excerptEvidence: "$50,000,000 Indebtedness basket FLAT_AMOUNT",
    };
    const audit = auditCandidateAgainstOperative({
      candidate,
      fullDocumentText: "Unrelated document with no matching section reference at all.",
    });
    expect(audit.disposition).toBe("INSUFFICIENT_OPERATIVE_TEXT");
    expect(audit.falseExecutableClassification).toBe(true);
  });

  it("extractOperativeWindow prefers Section N.M anchors", () => {
    const text =
      "ARTICLE VI\nSection 6.01 Indebtedness. Basket of the greater of $12,000,000 and 20% of Consolidated Adjusted EBITDA. Borrower may incur.\nSection 6.02 Liens. Separate.";
    const w = extractOperativeWindow(text, "6.01");
    expect(w).toMatch(/greater of \$12,000,000/i);
    expect(w.length).toBeGreaterThan(40);
  });

  it("wilsonInterval returns sensible bounds", () => {
    const w = wilsonInterval(8, 10);
    expect(w.p).toBeCloseTo(0.8, 5);
    expect(w.low).toBeLessThan(w.p);
    expect(w.high).toBeGreaterThan(w.p);
  });

  it("buildReviewReadyRecord stays on counsel-compile path and never certifies", () => {
    const full =
      "Section 6.01 Indebtedness. The Borrower shall not create Indebtedness except in an amount not to exceed $40,000,000. Loan Parties only.";
    const candidate: CandidateForAudit = {
      sourceId: "test:flat",
      sectionRef: "6.01",
      heading: "Indebtedness",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 40,
      params: null,
      posture: "GENERAL_PROHIBITION",
      families: ["INDEBTEDNESS"],
      excerptEvidence: "not to exceed $40,000,000",
    };
    const audit = auditCandidateAgainstOperative({ candidate, fullDocumentText: full });
    const item = {
      sectionRef: "6.01",
      heading: "Indebtedness",
      governingAgreement: "Test CA",
      families: ["INDEBTEDNESS"],
      posture: "GENERAL_PROHIBITION",
      operativeLanguageExcerpt: "not to exceed $40,000,000",
      sourceCitation: "test:flat §6.01",
      epistemicStatus: "DISCOVERED",
      conditions: [],
      exceptions: [],
      applicableDefinitions: [],
      modelingHints: { formulaType: "FLAT_AMOUNT", thresholdValue: 40 },
    } as unknown as CovenantSummaryItem;
    const rec = buildReviewReadyRecord({
      sourceId: "test:flat",
      item,
      audit,
      documentClass: "CREDIT_AGREEMENT",
      issuerTicker: "TEST",
    });
    expect(rec.activationPath).toBe("counsel-compile-accepted-interpretation");
    expect(rec.peerCoordination.lifecyclePr).toContain("227");
    expect(["REVIEW_READY_UNVERIFIED", "BLOCKED_FALSE_EXECUTABLE", "BLOCKED_INSUFFICIENT_EVIDENCE", "NOT_CERTIFIED"]).toContain(
      rec.certificationState,
    );
    expect(rec.provenance.neonMutations).toBe(0);
    expect(rec.provenance.promotedToLegalTruth).toBe(0);
  });
});
