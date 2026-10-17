/**
 * Exception-based review: routine supported interpretations
 * auto-compile without mandatory individual approval; everything
 * else is an exception for counsel.
 */
import { describe, expect, it } from "vitest";
import { isRoutineItem, compilesCleanly } from "../../lib/product/customer-intelligence/routine-review";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(overrides: Partial<CovenantSummaryItem> = {}): CovenantSummaryItem {
  return {
    heading: "6.01(a)",
    sectionRef: "6.01(a)",
    category: "INDEBTEDNESS",
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

describe("isRoutineItem", () => {
  it("a clean MODELED debt basket with no conditions is routine", () => {
    expect(isRoutineItem(item())).toBe(true);
    expect(compilesCleanly(item())).toBe(true);
  });

  it("a MODELED basket with a remaining (UNKNOWN) condition is an exception", () => {
    expect(
      isRoutineItem(item({ conditions: ["provided_that: provided that no Default has occurred"] })),
    ).toBe(false);
  });

  it("a MODELED basket whose only condition is a pure cap restatement is routine", () => {
    expect(
      isRoutineItem(
        item({ conditions: ["provided_that: provided that the aggregate amount shall not exceed $50,000,000"] }),
      ),
    ).toBe(true);
  });

  it("a MODELED basket with UNRESOLVED posture is an exception", () => {
    expect(isRoutineItem(item({ posture: "UNRESOLVED" }))).toBe(false);
  });

  it("a basket-shaped item the grant classifier missed (no grants, has baskets) is an exception", () => {
    expect(
      isRoutineItem(
        item({
          category: "OTHER",
          plainEnglish: "Miscellaneous provision with a threshold.",
          materialBasketsThresholds: ["Amount/threshold: $5,000,000"],
          operativeLanguageExcerpt: "Miscellaneous.",
        }),
      ),
    ).toBe(false);
  });

  it("a pure boilerplate item (no grants, no baskets, no conditions) is routine", () => {
    expect(
      isRoutineItem(
        item({
          category: "OTHER",
          plainEnglish: "The Borrower shall maintain its corporate existence.",
          materialBasketsThresholds: [],
          operativeLanguageExcerpt: "The Borrower shall maintain its corporate existence.",
        }),
      ),
    ).toBe(true);
  });

  it("a clean testable maintenance-ratio item is routine", () => {
    expect(
      isRoutineItem(
        item({
          category: "FINANCIAL_MAINTENANCE",
          posture: "MAINTENANCE_TEST",
          plainEnglish: "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00 at any quarter end.",
          materialBasketsThresholds: ["Ratio threshold: 4.00 to 1.00"],
          operativeLanguageExcerpt: "The Borrower shall not permit the Total Net Leverage Ratio to exceed 4.00 to 1.00.",
        }),
      ),
    ).toBe(true);
  });

  it("an INCOMPLETE formula (no parseable amount) is an exception", () => {
    expect(
      isRoutineItem(
        item({
          plainEnglish: "The Borrower may incur Indebtedness subject to certain baskets.",
          materialBasketsThresholds: [],
          operativeLanguageExcerpt: "The Borrower may incur Indebtedness.",
        }),
      ),
    ).toBe(false);
  });
});
