import { describe, expect, it } from "vitest";
import {
  assessOperativeCompleteness,
  isNonPermissionThreshold,
} from "../../lib/knowledge-factory/activation/completeness";
import {
  buildReviewReadyRecord,
  mayEnterCounselCompilePath,
} from "../../lib/knowledge-factory/activation/review-ready-record";
import type { IndependentAuditResult } from "../../lib/knowledge-factory/activation/independent-audit";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function baseItem(over: Partial<CovenantSummaryItem>): CovenantSummaryItem {
  return {
    category: "DEBT_INCURRENCE",
    categoryLabel: "Debt",
    sectionRef: "7.01",
    heading: "Indebtedness",
    posture: "ENUMERATED_PERMISSION",
    plainEnglish: "Basket",
    restriction: null,
    permissions: [],
    coveredEntities: ["Borrower"],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: ["$40,000,000"],
    draftingPatterns: [],
    operativeLanguageExcerpt:
      "The Borrower shall not create Indebtedness except in an amount not to exceed $40,000,000.",
    sourceCitation: "test§7.01",
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
    analysis: {} as CovenantSummaryItem["analysis"],
    ...over,
  };
}

describe("operative completeness", () => {
  it("rejects abbreviated excerpts as incomplete", () => {
    const v = assessOperativeCompleteness({
      item: baseItem({
        operativeLanguageExcerpt: "not to exceed $40,000,000 and",
      }),
      operativeExcerpt: "not to exceed $40,000,000 and",
    });
    expect(v.complete).toBe(false);
    expect(v.abbreviatedExcerpt).toBe(true);
  });

  it("requires structured conditions when proviso present", () => {
    const excerpt =
      "The Borrower shall not create Indebtedness except not to exceed $40,000,000; provided that no Default exists.";
    const v = assessOperativeCompleteness({
      item: baseItem({ operativeLanguageExcerpt: excerpt, conditions: [] }),
      operativeExcerpt: excerpt,
    });
    expect(v.conditionsStructured).toBe(false);
    expect(v.complete).toBe(false);
  });
});

describe("non-permission monetary thresholds", () => {
  it.each([
    ["Events of Default", ["EVENTS_OF_DEFAULT"]],
    ["Judgments", ["EVENTS_OF_DEFAULT"]],
    ["Mandatory Prepayments", ["MANDATORY_PREPAYMENTS"]],
    ["Indemnity", ["INDEBTEDNESS"]],
    ["Financial Reporting", ["INFORMATION_COVENANTS"]],
  ] as const)("detects %s", (heading, families) => {
    expect(
      isNonPermissionThreshold({
        heading,
        families: [...families],
        sectionRef: "8.01",
      }),
    ).toBe(true);
  });
});

describe("review-ready WITH_GAPS never counsel-compile-eligible", () => {
  it("forces incomplete block when audit has missed_condition_language", () => {
    const item = baseItem({
      operativeLanguageExcerpt:
        "The Borrower shall not, and shall not permit any Subsidiary to, make any Asset Disposition exceeding $50,000,000.",
      conditions: [],
    });
    const audit: IndependentAuditResult = {
      sourceId: "test",
      sectionRef: "8.5",
      formulaType: "FLAT_AMOUNT",
      mechanic: "FLAT_AMOUNT",
      disposition: "REVIEW_READY_WITH_GAPS",
      sufficientForExecutableEvaluation: true,
      falseExecutableClassification: false,
      fields: [],
      materialOmissions: ["missed_condition_language"],
      independentFormula: "FLAT_AMOUNT",
      independentThresholdMillions: 50,
      operativeWindowChars: 800,
      operativeWindowPreview: "SECTION 8.5 Asset Dispositions provided that ...",
      certificationStatus: "NOT_CERTIFIED",
    };
    const rec = buildReviewReadyRecord({ sourceId: "test", item, audit });
    expect(rec.counselCompileEligible).toBe(false);
    expect(rec.certificationState).toBe("BLOCKED_INCOMPLETE_OPERATIVE");
    expect(rec.promotionState).not.toBe("PRODUCTION_AUTHORITATIVE");
    expect(rec.promotionState).not.toBe("COUNSEL_COMPILE_ELIGIBLE");
    expect(mayEnterCounselCompilePath(rec)).toBe(false);
  });

  it("mayEnterCounselCompilePath requires counselCompileEligible boolean, not label alone", () => {
    expect(
      mayEnterCounselCompilePath({
        counselCompileEligible: false,
        promotionState: "COUNSEL_COMPILE_ELIGIBLE",
        certificationState: "BLOCKED_INCOMPLETE_OPERATIVE",
      }),
    ).toBe(false);
    expect(
      mayEnterCounselCompilePath({
        counselCompileEligible: true,
        promotionState: "COUNSEL_COMPILE_ELIGIBLE",
        certificationState: "REVIEW_READY_UNVERIFIED",
      }),
    ).toBe(true);
  });
});
