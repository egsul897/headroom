/**
 * Phase C.1 - synthetic, non-fixture-specific regression tests for the
 * deterministic section-level basket-completeness check
 * (lib/contract-model/compiler/basket-completeness.ts). These test
 * OBSERVABLE behavior (does a real synthetic multi-basket scenario get
 * flagged or not) against invented section text and invented rules, never
 * against FWRG/LSB's own text or expected values, and never by asserting
 * prompt strings or implementation details.
 */
import { describe, expect, it } from "vitest";
import { checkSectionBasketCompleteness } from "../../lib/contract-model/compiler/basket-completeness";
import type { CandidateContractRule } from "../../lib/contract-model/types";

function rule(overrides: Partial<CandidateContractRule>): CandidateContractRule {
  return {
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    conditions: [],
    exceptions: [],
    definedTermRefs: [],
    sourceSectionRef: "9.01",
    ...overrides,
  };
}

describe("checkSectionBasketCompleteness - synthetic multi-basket scenarios", () => {
  it("1. two baskets with different dollar thresholds, both correctly extracted -> not flagged", () => {
    const text = "Section 9.01. Widgets. The Company will not, except: (a) Widget debt not to exceed $1,000,000; (b) Gadget debt not to exceed $2,000,000.";
    const rules = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 1000000 }), rule({ sourceSectionRef: "9.01(b)", thresholdValue: 2000000 })];
    const result = checkSectionBasketCompleteness("9.01", text, rules);
    expect(result.flagged).toBe(false);
  });

  it("2. dollar basket + EBITDA percentage basket, both correctly extracted -> not flagged", () => {
    const text = "Section 9.01. Widgets. Except: (a) debt not to exceed $1,000,000; (b) debt not to exceed 10% of Consolidated EBITDA.";
    const rules = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 1000000 }), rule({ sourceSectionRef: "9.01(b)", thresholdValue: 10, formulaRef: "OTHER" })];
    const result = checkSectionBasketCompleteness("9.01", text, rules);
    expect(result.flagged).toBe(false);
  });

  it("3. fixed amount anchor value is captured even when described as a grower (qualitative grower mechanics not claimed) -> not flagged for the captured anchor", () => {
    const text = "Section 9.01. Widgets. Except: (a) debt not to exceed $1,000,000, increasing by $100,000 on each anniversary.";
    const rules = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 1000000, notes: "base amount; also increases by $100,000 annually" })];
    const result = checkSectionBasketCompleteness("9.01", text, rules);
    expect(result.flagged).toBe(false);
  });

  it("4. greater-of formula: both numbers within ONE basket must both appear in that basket's own rule(s)", () => {
    const text = "Section 9.01. Widgets. Except: (a) debt not to exceed the greater of $5,000,000 and 10% of Consolidated EBITDA.";
    const goodRule = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 5000000, notes: "greater of $5,000,000 and 10% of EBITDA" })];
    const goodResult = checkSectionBasketCompleteness("9.01", text, goodRule);
    expect(goodResult.flagged).toBe(false);

    const incompleteRule = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 5000000, notes: "flat cap" })]; // drops the 10% component
    const incompleteResult = checkSectionBasketCompleteness("9.01", text, incompleteRule);
    expect(incompleteResult.flagged).toBe(true);
    expect(incompleteResult.unmatchedNumbers.some((n) => n.value === 10)).toBe(true);
  });

  it("5. multiple baskets where one is omitted entirely -> flagged with the omitted basket's real number", () => {
    const text = "Section 9.01. Widgets. Except: (a) debt not to exceed $1,000,000; (b) debt not to exceed $2,000,000; (c) debt not to exceed $3,000,000.";
    const rules = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 1000000 }), rule({ sourceSectionRef: "9.01(b)", thresholdValue: 2000000 })]; // (c) never extracted
    const result = checkSectionBasketCompleteness("9.01", text, rules);
    expect(result.flagged).toBe(true);
    expect(result.unmatchedNumbers).toEqual([{ letter: "c", value: 3000000, raw: "$3,000,000" }]);
  });

  it("6. two correctly-extracted-looking baskets whose thresholds are swapped -> flagged", () => {
    const text = "Section 9.01. Widgets. Except: (a) debt not to exceed $1,000,000; (b) debt not to exceed $2,000,000.";
    const rules = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 2000000 }), rule({ sourceSectionRef: "9.01(b)", thresholdValue: 1000000 })];
    const result = checkSectionBasketCompleteness("9.01", text, rules);
    expect(result.flagged).toBe(true);
    expect(result.duplicatedThresholds.length).toBeGreaterThan(0);
  });

  it("7. a duplicated threshold incorrectly applied to two baskets -> flagged", () => {
    const text = "Section 9.01. Widgets. Except: (a) debt not to exceed $1,000,000; (b) debt not to exceed $2,000,000.";
    const rules = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 1000000 }), rule({ sourceSectionRef: "9.01(b)", thresholdValue: 1000000 })]; // (b) wrongly carries (a)'s number
    const result = checkSectionBasketCompleteness("9.01", text, rules);
    expect(result.flagged).toBe(true);
    expect(result.unmatchedNumbers.some((n) => n.letter === "b" && n.value === 2000000)).toBe(true);
  });

  it("8. multiple baskets with distinct conditions but very similar wording -> each still checked against its own real number", () => {
    const text =
      "Section 9.01. Widgets. Except: (a) debt incurred by a Restricted Subsidiary not to exceed $1,000,000 in the aggregate at any time outstanding; (b) debt incurred by a Restricted Subsidiary not to exceed $1,500,000 in the aggregate at any time outstanding.";
    const correct = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 1000000 }), rule({ sourceSectionRef: "9.01(b)", thresholdValue: 1500000 })];
    expect(checkSectionBasketCompleteness("9.01", text, correct).flagged).toBe(false);

    const wrong = [rule({ sourceSectionRef: "9.01(a)", thresholdValue: 1000000 }), rule({ sourceSectionRef: "9.01(b)", thresholdValue: 1000000 })];
    expect(checkSectionBasketCompleteness("9.01", text, wrong).flagged).toBe(true);
  });

  it("9. a correctly-extracted multi-basket section with three distinct baskets -> not flagged", () => {
    const text = "Section 9.01. Widgets. Except: (a) $1,000,000; (b) 5% of Consolidated EBITDA; (c) the greater of $2,000,000 and 8% of Consolidated Net Worth.";
    const rules = [
      rule({ sourceSectionRef: "9.01(a)", thresholdValue: 1000000 }),
      rule({ sourceSectionRef: "9.01(b)", thresholdValue: 5 }),
      rule({ sourceSectionRef: "9.01(c)", thresholdValue: 2000000, notes: "greater of $2,000,000 and 8% of Consolidated Net Worth" }),
    ];
    expect(checkSectionBasketCompleteness("9.01", text, rules).flagged).toBe(false);
  });

  it("10. a single-basket section (no lettered clauses) never produces a blanket false positive", () => {
    const text = "Section 9.01. Widgets. The Company will not incur debt in excess of $10,000,000 in the aggregate.";
    const correct = [rule({ sourceSectionRef: "9.01", thresholdValue: 10000000 })];
    expect(checkSectionBasketCompleteness("9.01", text, correct).flagged).toBe(false);

    // A genuine single-basket omission (no rule at all) must still be caught - this is not a "blanket" false positive, it is a real detected gap.
    const omitted: CandidateContractRule[] = [];
    const omittedResult = checkSectionBasketCompleteness("9.01", text, omitted);
    expect(omittedResult.flagged).toBe(true);
  });
});
