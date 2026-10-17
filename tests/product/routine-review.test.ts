/**
 * Exception-based review: routine supported interpretations
 * auto-compile without mandatory individual approval; everything
 * else is an exception for counsel.
 */
import { describe, expect, it } from "vitest";
import { isRoutineItem, compilesCleanly } from "../../lib/product/customer-intelligence/routine-review";
import { grantTypesForItem } from "../../lib/product/customer-intelligence/grant-types";
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

  it("P3: a GUARANTEES-category item with debt-first evidence is routine (DEBT grant agrees)", () => {
    // Debt word precedes the guarantee word: a debt basket that
    // includes guarantee capacity. Rule 198 strips only the
    // guarantee-first shape, so this DEBT grant survived a
    // position-evidence test and agrees with the category.
    const guarItem = item({
      category: "GUARANTEES",
      sectionRef: "6.04(a)",
      heading: "6.04 Guarantees",
      plainEnglish:
        "The Borrower may incur Indebtedness, including Guarantees of Indebtedness of its Subsidiaries, in an aggregate principal amount not to exceed $50,000,000.",
      materialBasketsThresholds: ["Amount/threshold: $50,000,000"],
      operativeLanguageExcerpt:
        "The Borrower may incur Indebtedness, including Guarantees of Indebtedness, not to exceed $50,000,000.",
    });
    expect(grantTypesForItem(guarItem)).toContain("DEBT_INCURRENCE");
    expect(isRoutineItem(guarItem)).toBe(true);
  });

  it("P3: the Rule 198 guarantee-first shape still mints no DEBT grant and stays an exception", () => {
    // Guarantee word precedes the debt word: the clause permits
    // guaranteeing debt permitted elsewhere — the cap is a
    // guarantee cap, not an incurrence basket.
    const guarFirst = item({
      category: "GUARANTEES",
      sectionRef: "6.04(e)",
      heading: "6.04(e)",
      plainEnglish:
        "Guarantees constituting Indebtedness permitted by Section 6.01, provided that the aggregate principal amount of Indebtedness Guaranteed shall not exceed $750,000.",
      materialBasketsThresholds: ["Amount/threshold: $750,000"],
      operativeLanguageExcerpt:
        "(e) Guarantees constituting Indebtedness permitted by Section 6.01, provided that the aggregate principal amount of Indebtedness Guaranteed shall not exceed the Threshold Amount.",
    });
    expect(grantTypesForItem(guarFirst)).not.toContain("DEBT_INCURRENCE");
    expect(isRoutineItem(guarFirst)).toBe(false);
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

  it("P2: a definitions-article item carrying a $ amount is routine (it can never hold a grant)", () => {
    const defItem = item({
      category: "OTHER",
      sectionRef: "1.01",
      heading: "1.01 Defined Terms",
      articleHeading: "ARTICLE I Definitions",
      plainEnglish: "“Threshold Amount” means $750,000.",
      materialBasketsThresholds: ["Amount/threshold: $750,000"],
      operativeLanguageExcerpt: "“Threshold Amount” means $750,000.",
    });
    expect(grantTypesForItem(defItem)).toEqual([]);
    expect(isRoutineItem(defItem)).toBe(true);
  });

  it("P2: an EVENTS_OF_DEFAULT item with a cross-default $ threshold is routine", () => {
    const eodItem = item({
      category: "EVENTS_OF_DEFAULT",
      sectionRef: "7.01(f)",
      heading: "7.01 Events of Default",
      plainEnglish:
        "An Event of Default occurs if the Borrower or any Subsidiary defaults in the payment of Indebtedness in an aggregate amount exceeding $25,000,000.",
      materialBasketsThresholds: ["Amount/threshold: $25,000,000"],
      operativeLanguageExcerpt:
        "default in the payment of Indebtedness in an aggregate amount exceeding $25,000,000.",
    });
    expect(grantTypesForItem(eodItem)).toEqual([]);
    expect(isRoutineItem(eodItem)).toBe(true);
  });

  it("P2: the G-1 structural gate stays first — structurally unresolved definitions/EoD items are exceptions", () => {
    expect(
      isRoutineItem(
        item({
          category: "OTHER",
          sectionRef: "1.01",
          heading: "1.01 Defined Terms",
          articleHeading: "ARTICLE I Definitions",
          plainEnglish: "“Threshold Amount” means $750,000.",
          materialBasketsThresholds: ["Amount/threshold: $750,000"],
          operativeLanguageExcerpt: "“Threshold Amount” means $750,000.",
          structuralUnresolved: true,
        }),
      ),
    ).toBe(false);
    expect(
      isRoutineItem(
        item({
          category: "EVENTS_OF_DEFAULT",
          sectionRef: "7.01(f)",
          heading: "7.01 Events of Default",
          plainEnglish: "An Event of Default occurs upon a default in Indebtedness exceeding $25,000,000.",
          materialBasketsThresholds: ["Amount/threshold: $25,000,000"],
          operativeLanguageExcerpt: "default in Indebtedness exceeding $25,000,000.",
          structuralUnresolved: true,
        }),
      ),
    ).toBe(false);
  });

  it("P2: a definitions or EoD item carrying a greater-of basket entry is still an exception", () => {
    expect(
      isRoutineItem(
        item({
          category: "OTHER",
          sectionRef: "1.01",
          heading: "1.01 Defined Terms",
          articleHeading: "ARTICLE I Definitions",
          plainEnglish: "“General Basket” means the greater of $50 million and 10% of Consolidated EBITDA.",
          materialBasketsThresholds: ["Greater of basket: $50 million and 10% of Consolidated EBITDA"],
          operativeLanguageExcerpt: "the greater of $50 million and 10% of Consolidated EBITDA",
        }),
      ),
    ).toBe(false);
    expect(
      isRoutineItem(
        item({
          category: "EVENTS_OF_DEFAULT",
          sectionRef: "7.01(f)",
          heading: "7.01 Events of Default",
          plainEnglish: "An Event of Default occurs upon a default in Indebtedness exceeding the greater of $25 million and 1% of Total Assets.",
          materialBasketsThresholds: ["Greater of basket: $25 million and 1% of Total Assets"],
          operativeLanguageExcerpt: "exceeding the greater of $25 million and 1% of Total Assets.",
        }),
      ),
    ).toBe(false);
  });

  it("P2: a definitions item carrying a builder marker is still an exception", () => {
    expect(
      isRoutineItem(
        item({
          category: "OTHER",
          sectionRef: "1.01",
          heading: "1.01 Defined Terms",
          articleHeading: "ARTICLE I Definitions",
          plainEnglish: "“Available Amount” means an amount initially equal to $10,000,000, as increased by the builder components.",
          materialBasketsThresholds: [
            "Amount/threshold: $10,000,000",
            "Builder / Available Amount construct referenced.",
          ],
          operativeLanguageExcerpt: "“Available Amount” means an amount initially equal to $10,000,000.",
        }),
      ),
    ).toBe(false);
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
