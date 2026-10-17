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

describe("isRoutineItem", () => {
  it("a clean MODELED debt basket with no conditions is routine", () => {
    expect(isRoutineItem(item())).toBe(true);
    expect(compilesCleanly(item())).toBe(true);
  });

  it("Phase E (D10) gate unchanged: a structurally unresolved item is never routine, its resolved twin is", () => {
    expect(isRoutineItem(item({ structuralUnresolved: true }))).toBe(false);
    expect(isRoutineItem(item({ structuralUnresolved: false }))).toBe(true);
    expect(isRoutineItem(item())).toBe(true);
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

  it("P1: a MODELED basket whose only condition is a complete no-Default proviso is routine", () => {
    // The standard eligibility proviso, fully extracted: compile
    // carries it verbatim onto the Permission and the solver
    // fails closed on it at evaluation — auto-accept asserts
    // only the interpretation, never that the proviso holds.
    expect(
      isRoutineItem(
        item({
          conditions: [
            "no_default: no Default or Event of Default shall have occurred and be continuing or would result from the incurrence of such Indebtedness",
          ],
        }),
      ),
    ).toBe(true);
  });

  it("P1: the provided-that record of the same no-Default proviso is also mechanical", () => {
    expect(
      isRoutineItem(
        item({
          conditions: [
            "provided_that: provided that no Default or Event of Default shall have occurred and be continuing or would result therefrom",
          ],
        }),
      ),
    ).toBe(true);
  });

  it("P1: a MODELED basket whose only condition is a pro forma compliance proviso is routine", () => {
    expect(
      isRoutineItem(
        item({
          conditions: ["pro_forma_compliance: pro forma compliance with the Consolidated Leverage Ratio"],
        }),
      ),
    ).toBe(true);
  });

  it("P1: a no-Default proviso carrying a certificate-delivery clause in the same string is an exception", () => {
    expect(
      isRoutineItem(
        item({
          conditions: [
            "no_default: no Default or Event of Default shall have occurred and be continuing, and the Borrower shall deliver an Officer's Certificate evidencing compliance",
          ],
        }),
      ),
    ).toBe(false);
  });

  it("P1: a no-Default proviso carrying a solvency clause in the same string is an exception", () => {
    expect(
      isRoutineItem(
        item({
          conditions: [
            "no_default: no Default or Event of Default shall have occurred and be continuing and the Borrower shall be Solvent after giving effect thereto",
          ],
        }),
      ),
    ).toBe(false);
  });

  it("P1: a bespoke subject-to proviso is an exception", () => {
    expect(
      isRoutineItem(
        item({
          conditions: ["subject_to: subject to the satisfaction of all conditions precedent set forth in Section 4.01"],
        }),
      ),
    ).toBe(false);
  });

  it("a DEBT grant on a MERGERS-category item (classifier disagreement) is an exception", () => {
    // Successors-clause shape: "successor shall assume Indebtedness"
    // mints a DEBT grant, but the section is a merger provision, not
    // a debt covenant. Counsel decides — the item is not suppressed.
    expect(
      isRoutineItem(
        item({
          category: "MERGERS_FUNDAMENTAL_CHANGES",
          heading: "9.04 Successors",
          sectionRef: "9.04",
          plainEnglish: "The successor corporation shall assume all Indebtedness of the Borrower in an aggregate principal amount not to exceed $50,000,000.",
          operativeLanguageExcerpt: "The successor shall assume Indebtedness not to exceed $50,000,000.",
        }),
      ),
    ).toBe(false);
  });

  it("a dual-grant (DEBT + linked LIEN) item in a debt section stays routine", () => {
    // Rule 177: the linked LIEN does not make the item an exception
    // when the DEBT grant agrees with the category.
    expect(
      isRoutineItem(
        item({
          plainEnglish: "The Borrower may incur Indebtedness and grant Liens securing such Indebtedness in an aggregate principal amount not to exceed $50,000,000.",
          operativeLanguageExcerpt: "The Borrower may incur Indebtedness and grant Liens securing such Indebtedness not to exceed $50,000,000.",
        }),
      ),
    ).toBe(true);
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
