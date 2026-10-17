/**
 * Headroom-proposed review decisions: every item gets a proposal
 * (ACCEPT / REJECT / NEEDS_INPUT) so counsel confirms or edits
 * instead of deciding from scratch. Only NEEDS_INPUT items are
 * flagged for attention.
 */
import { describe, expect, it } from "vitest";
import { proposeReviewDecision } from "../../lib/product/customer-intelligence/review-proposal";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(overrides: Partial<CovenantSummaryItem> = {}): CovenantSummaryItem {
  return {
    heading: "6.01(a)",
    sectionRef: "6.01(a)",
    category: "DEBT_INCURRENCE",
    posture: "ENUMERATED_PERMISSION",
    plainEnglish: "The Borrower may incur Indebtedness in an aggregate principal amount not to exceed $50,000,000.",
    restriction: null,
    permissions: [],
    coveredEntities: [],
    exceptions: [],
    conditions: [],
    materialBasketsThresholds: ["Amount/threshold: $50,000,000"],
    draftingPatterns: [],
    operativeLanguageExcerpt: "The Borrower may incur Indebtedness not to exceed $50,000,000.",
    sourceCitation: "test",
    governingAgreement: "test",
    families: [],
    relatedDefinedTerms: [],
    applicableDefinitions: [],
    entityScope: {},
    ...overrides,
  } as unknown as CovenantSummaryItem;
}

describe("proposeReviewDecision", () => {
  it("a clean MODELED basket proposes ACCEPT with exact terms, no flag", () => {
    const p = proposeReviewDecision(item());
    expect(p.decision).toBe("ACCEPTED");
    expect(p.needsAttention).toBe(false);
    expect(p.terms).toContain("50");
    expect(p.terms).toContain("DEBT");
  });

  it("a clean maintenance ratio proposes ACCEPT with ratio terms", () => {
    const p = proposeReviewDecision(
      item({
        category: "FINANCIAL_MAINTENANCE",
        posture: "MAINTENANCE_TEST",
        plainEnglish: "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00 at any quarter end.",
        materialBasketsThresholds: ["Ratio threshold: 4.00 to 1.00"],
        operativeLanguageExcerpt: "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00.",
      }),
    );
    expect(p.decision).toBe("ACCEPTED");
    expect(p.needsAttention).toBe(false);
    expect(p.terms).toContain("4");
    expect(p.terms).toContain("to 1");
  });

  it("pure boilerplate (no signal) proposes REJECT, no flag", () => {
    const p = proposeReviewDecision(
      item({
        category: "OTHER",
        plainEnglish: "The Borrower shall maintain its corporate existence.",
        materialBasketsThresholds: [],
        operativeLanguageExcerpt: "The Borrower shall maintain its corporate existence.",
      }),
    );
    expect(p.decision).toBe("REJECTED");
    expect(p.needsAttention).toBe(false);
    expect(p.reason).toMatch(/no capacity effect/i);
  });

  it("a grant item with an unparseable amount proposes NEEDS_INPUT and flags it", () => {
    const p = proposeReviewDecision(
      item({
        plainEnglish: "The Borrower may incur Indebtedness subject to certain baskets.",
        materialBasketsThresholds: [],
        operativeLanguageExcerpt: "The Borrower may incur Indebtedness.",
      }),
    );
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
    expect(p.reason).toMatch(/could not parse|missing/i);
  });

  it("a MODELED basket with a remaining UNKNOWN condition proposes NEEDS_INPUT naming the condition", () => {
    const p = proposeReviewDecision(
      item({ conditions: ["provided_that: provided that no Default has occurred"] }),
    );
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
    expect(p.reason).toMatch(/condition.*cannot resolve/i);
    expect(p.reason).toContain("no Default has occurred");
  });

  it("a MODELED basket with UNRESOLVED posture proposes NEEDS_INPUT", () => {
    const p = proposeReviewDecision(item({ posture: "UNRESOLVED" }));
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
    expect(p.reason).toMatch(/posture/i);
  });

  it("a basket-shaped item with no grants proposes NEEDS_INPUT", () => {
    const p = proposeReviewDecision(
      item({
        category: "OTHER",
        plainEnglish: "Miscellaneous provision with a threshold.",
        materialBasketsThresholds: ["Amount/threshold: $5,000,000"],
        operativeLanguageExcerpt: "Miscellaneous.",
      }),
    );
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
  });

  it("P4: a sub-$1,000 parsed threshold proposes NEEDS_INPUT naming the unit misread, never ACCEPT", () => {
    const p = proposeReviewDecision(
      item({
        plainEnglish: "The Borrower may incur Indebtedness not to exceed $30.",
        materialBasketsThresholds: ["Amount/threshold: $30"],
        operativeLanguageExcerpt: "The Borrower may incur Indebtedness not to exceed $30.",
      }),
    );
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
    expect(p.reason).toMatch(/unit misread/i);
    expect(p.reason).toMatch(/confirm the amount from the source text/i);
  });

  it("P1: a complete no-Default proviso does not block an ACCEPT (gate and proposer in lockstep)", () => {
    const p = proposeReviewDecision(
      item({
        conditions: [
          "no_default: no Default or Event of Default shall have occurred and be continuing or would result from the incurrence of such Indebtedness",
        ],
      }),
    );
    expect(p.decision).toBe("ACCEPTED");
    expect(p.needsAttention).toBe(false);
  });

  it("P1: a no-Default proviso with a certificate clause proposes NEEDS_INPUT naming the condition", () => {
    const p = proposeReviewDecision(
      item({
        conditions: [
          "no_default: no Default or Event of Default shall have occurred and be continuing, and the Borrower shall deliver an Officer's Certificate evidencing compliance",
        ],
      }),
    );
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
    expect(p.reason).toMatch(/condition.*cannot resolve/i);
  });

  it("a pure cap-restatement condition does not block an ACCEPT", () => {
    const p = proposeReviewDecision(
      item({ conditions: ["provided_that: provided that the aggregate amount shall not exceed $50,000,000"] }),
    );
    expect(p.decision).toBe("ACCEPTED");
    expect(p.needsAttention).toBe(false);
  });

  it("a structurally unresolved basket proposes NEEDS_INPUT naming the unresolved structural relationship", () => {
    const p = proposeReviewDecision(item({ structuralUnresolved: true }));
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
    expect(p.terms).toBeNull();
    expect(p.reason).toMatch(/structural relationship unresolved/i);
    expect(p.reason).toMatch(/not certified/i);
  });

  it("a structurally unresolved item with no capacity signal is never proposed as a routine REJECT", () => {
    const p = proposeReviewDecision(
      item({
        category: "OTHER",
        plainEnglish: "The Borrower shall maintain its corporate existence.",
        materialBasketsThresholds: [],
        operativeLanguageExcerpt: "The Borrower shall maintain its corporate existence.",
        structuralUnresolved: true,
      }),
    );
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
    expect(p.reason).toMatch(/structural relationship unresolved/i);
    expect(p.reason).not.toMatch(/no capacity effect/i);
  });

  it("a structurally unresolved item keeps its condition blocker visible after the structural disclosure", () => {
    const p = proposeReviewDecision(
      item({
        structuralUnresolved: true,
        conditions: ["provided_that: provided that no Default has occurred"],
      }),
    );
    expect(p.decision).toBe("NEEDS_INPUT");
    expect(p.needsAttention).toBe(true);
    expect(p.reason).toMatch(/structural relationship unresolved/i);
    expect(p.reason).toContain("no Default has occurred");
  });

  it("a structurally resolved basket carries no structural disclosure (control)", () => {
    const p = proposeReviewDecision(item());
    expect(p.decision).toBe("ACCEPTED");
    expect(p.reason).not.toMatch(/structural/i);
  });
});
