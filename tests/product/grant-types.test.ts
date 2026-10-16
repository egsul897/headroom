/**
 * Rule 23 — no grant-type signal → no permission minted (no
 * DEBT_INCURRENCE default).
 *
 * grantTypesForItem defaulted unmatched items to DEBT_INCURRENCE.
 * An asset-sale, merger, or affiliate-transaction covenant —
 * neither debt, lien, RP, nor investment — compiled as a
 * debt-incurrence permission, so its basket inflated debt
 * capacity. Now no signal returns [], and the compiler reports
 * INCOMPLETE instead of minting a wrong-typed Permission.
 */
import { describe, expect, it } from "vitest";
import { grantTypesForItem } from "../../lib/product/customer-intelligence/grant-types";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(heading: string, category = "OTHER", plainEnglish = ""): CovenantSummaryItem {
  return {
    heading,
    category: category as CovenantSummaryItem["category"],
    plainEnglish,
    families: [],
  } as unknown as CovenantSummaryItem;
}

describe("grant-type classification", () => {
  it("asset-sale covenant matches NO grant type (not DEBT_INCURRENCE)", () => {
    expect(grantTypesForItem(item("Limitation on Asset Sales", "OTHER", "No Asset Sale shall exceed $10.0 million in proceeds."))).toEqual([]);
  });

  it("merger covenant matches NO grant type", () => {
    expect(grantTypesForItem(item("Merger, Consolidation or Sale of Assets", "OTHER", "The Company shall not merge with another Person."))).toEqual([]);
  });

  it("debt covenant still maps to DEBT_INCURRENCE", () => {
    expect(
      grantTypesForItem(item("Limitation on Indebtedness", "DEBT_INCURRENCE", "Indebtedness not to exceed $150.0 million.")),
    ).toEqual(["DEBT_INCURRENCE"]);
  });

  it("secured-debt covenant maps to both DEBT_INCURRENCE and LIEN", () => {
    expect(
      grantTypesForItem(item("Limitation on Liens", "LIENS_SECURED_DEBT", "Secured Indebtedness and Liens permitted.")),
    ).toEqual(["DEBT_INCURRENCE", "LIEN"]);
  });

  it("dividend covenant maps to RESTRICTED_PAYMENT", () => {
    expect(
      grantTypesForItem(item("Limitation on Restricted Payments", "RESTRICTED_PAYMENTS", "Dividends permitted from the builder basket.")),
    ).toEqual(["RESTRICTED_PAYMENT"]);
  });
});

/**
 * Rule 60 — grant-type classification uses ONLY the item's own
 * evidence, never a caller-supplied category.
 *
 * The classifier used to take a `category` param fed straight
 * from the client's FormData (rulebook/actions.ts). Passing
 * "DEBT_INCURRENCE" for a liens-only covenant minted a
 * DEBT_INCURRENCE Permission from a liens covenant. The param
 * is gone; a liens-only item maps to LIEN alone.
 */
describe("grant-type classification ignores caller category", () => {
  it("liens-only item maps to LIEN alone", () => {
    expect(
      grantTypesForItem(item("Limitation on Liens", "LIENS", "No Liens shall be created on any assets.")),
    ).toEqual(["LIEN"]);
  });
});

/**
 * Rule 195 (audit-driven): grandfathering-only and default-trigger
 * clauses grant nothing.
 *
 * Aon 6.11(l) — "Liens existing on the Effective Date; provided
 * that ... such Lien ... in excess of $5,000,000 ... is set forth
 * on Schedule 6.11" — grandfathers existing liens; the $5M is a
 * disclosure threshold, not a basket. It minted DEBT + LIEN FLAT
 * $5M. A mixed clause with a creation verb keeps its grants.
 *
 * Strata 5.02(c) — "any Lien (other than Permitted Encumbrances)
 * or claim made or asserted against ... Collateral ... in excess
 * of $150,000" — an Event-of-Default trigger, not a lien
 * permission. It minted a LIEN $150k Permission. A permission
 * with a no-default CONDITION ("provided no Event of Default
 * has occurred") is not a trigger and keeps its grant.
 */
describe("rule 195: grandfathering-only and default-trigger clauses grant nothing", () => {
  it("pure grandfathering (existing liens, disclosure threshold) mints nothing", () => {
    expect(
      grantTypesForItem(
        item(
          "6.11(l)",
          "LIENS_SECURED_DEBT",
          "(l) Liens existing on the Effective Date; provided that, with respect to each such Lien securing Indebtedness or other obligations in an aggregate committed or principal amount in excess of $5,000,000, such Lien is set forth on Schedule 6.11.",
        ),
      ),
    ).toEqual([]);
  });

  it("a mixed clause with a creation verb keeps its grants", () => {
    expect(
      grantTypesForItem(
        item(
          "6.11(l)",
          "LIENS_SECURED_DEBT",
          "(l) Liens existing on the Effective Date and Liens created to refinance such Liens, in an aggregate principal amount not to exceed $10,000,000.",
        ),
      ),
    ).toContain("LIEN");
  });

  it("a default trigger (lien/claim asserted against Collateral) mints nothing", () => {
    expect(
      grantTypesForItem(
        item(
          "5.02(c)",
          "OTHER",
          "(c) any Lien (other than Permitted Encumbrances) or claim made or asserted against any of the Collateral securing obligations in excess of $150,000.",
        ),
      ),
    ).toEqual([]);
  });

  it("a permission with a no-default condition keeps its grant", () => {
    expect(
      grantTypesForItem(
        item(
          "6.01(j)",
          "DEBT_INCURRENCE",
          "(j) The Borrower may incur Indebtedness, provided that no Event of Default has occurred, in an aggregate principal amount not to exceed $20,000,000.",
        ),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });
});

/**
 * Rule 196: a residual ("other Liens") basket is pairable with an
 * independent DEBT Permission; a specific-purpose basket is not.
 */
describe("rule 196: residual lien baskets", () => {
  it("other Liens (residual catch-all) is residual", async () => {
    const { isResidualLienBasket } = await import("../../lib/product/customer-intelligence/grant-types");
    expect(isResidualLienBasket({ plainEnglish: "(t) other Liens securing an aggregate principal amount of obligations at no time exceeding the greater of $1,000,000,000." })).toBe(true);
  });
  it("a specific-purpose basket (Liens for taxes) is not residual", async () => {
    const { isResidualLienBasket } = await import("../../lib/product/customer-intelligence/grant-types");
    expect(isResidualLienBasket({ plainEnglish: "(a) Liens for taxes, assessments or governmental charges." })).toBe(false);
  });
  it("an exclusion (Liens other than Permitted Liens) is not residual", async () => {
    const { isResidualLienBasket } = await import("../../lib/product/customer-intelligence/grant-types");
    expect(isResidualLienBasket({ plainEnglish: "any Lien other than Permitted Liens asserted against Collateral." })).toBe(false);
  });
});

/**
 * Rule 197: a cap stated as a defined term resolves when the
 * definition is a bare dollar amount; anything else fails closed.
 */
describe("rule 197: defined-term cap resolution", () => {
  it("resolves 'not exceeding the Threshold Amount' + 'means $ 750,000.' to 0.75", async () => {
    const { resolveDefinedTermCap } = await import("../../lib/product/customer-intelligence/grant-types");
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: "(k) other unsecured Indebtedness in an aggregate principal amount not exceeding the Threshold Amount at any time outstanding.",
        applicableDefinitions: [{ term: "Threshold Amount", excerpt: "\u201c Threshold Amount \u201d means $ 750,000. \u201c Total Assets \u201d means, as of the date of any determination thereof, total assets." }],
      }),
    ).toBe(0.75);
  });
  it("a formula definition (greater of $X or Y%) does not resolve", async () => {
    const { resolveDefinedTermCap } = await import("../../lib/product/customer-intelligence/grant-types");
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: "(k) Indebtedness not exceeding the Threshold Amount.",
        applicableDefinitions: [{ term: "Threshold Amount", excerpt: "\u201cThreshold Amount\u201d means the greater of $750,000 or 10% of Consolidated Net Worth." }],
      }),
    ).toBeNull();
  });
  it("a conditional definition ($X, as adjusted) does not resolve", async () => {
    const { resolveDefinedTermCap } = await import("../../lib/product/customer-intelligence/grant-types");
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: "(k) Indebtedness not exceeding the Threshold Amount.",
        applicableDefinitions: [{ term: "Threshold Amount", excerpt: "\u201cThreshold Amount\u201d means $750,000, as adjusted from time to time." }],
      }),
    ).toBeNull();
  });
  it("a later definition's amount in the same excerpt is never borrowed", async () => {
    const { resolveDefinedTermCap } = await import("../../lib/product/customer-intelligence/grant-types");
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: "(k) Indebtedness not exceeding the Threshold Amount.",
        applicableDefinitions: [{ term: "Threshold Amount", excerpt: "\u201cThreshold Amount\u201d means the greater of $100 or 10% of X. \u201cOther Term\u201d means $200." }],
      }),
    ).toBeNull();
  });
  it("a term with a newline in the stored definition still matches", async () => {
    const { resolveDefinedTermCap } = await import("../../lib/product/customer-intelligence/grant-types");
    expect(
      resolveDefinedTermCap({
        operativeLanguageExcerpt: "(k) Indebtedness not exceeding the Threshold Amount.",
        applicableDefinitions: [{ term: "Threshold\nAmount", excerpt: "\u201c Threshold Amount \u201d means $ 750,000." }],
      }),
    ).toBe(0.75);
  });
});

/** Rule 198: a Guarantee is not a debt incurrence. */
describe("rule 198: guarantee permission does not mint DEBT", () => {
  function item(plainEnglish: string, excerpt?: string) {
    return {
      sectionRef: "6.04(e)", heading: "Investments", category: "NEGATIVE_COVENANTS", plainEnglish,
      operativeLanguageExcerpt: excerpt ?? plainEnglish,
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [],
    } as any;
  }
  it("a guarantee clause capped at a defined term mints no DEBT", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem(item(
      "(e) Guarantees constituting Indebtedness permitted by Section 6.01, provided that the aggregate principal amount of Indebtedness Guaranteed shall not exceed the Threshold Amount.",
    ));
    expect(grants).not.toContain("DEBT_INCURRENCE");
  });
  it("a debt basket that lists guarantees as a form of Indebtedness keeps DEBT", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem(item(
      "The Borrower may incur Indebtedness, including Guarantees of Indebtedness of Subsidiaries, in an aggregate principal amount not to exceed $10,000,000.",
    ));
    expect(grants).toContain("DEBT_INCURRENCE");
  });
  it("a pure guarantee clause (Guarantees of Indebtedness) mints no DEBT", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem(item(
      "The Borrower may provide Guarantees of Indebtedness of its Subsidiaries in an aggregate principal amount not to exceed $5,000,000.",
    ));
    expect(grants).not.toContain("DEBT_INCURRENCE");
  });
});
