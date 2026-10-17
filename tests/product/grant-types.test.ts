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

/** Rule 201: a lien clause capping "Liens securing Indebtedness" does not mint DEBT. */
describe("rule 201: lien-secured obligation does not mint DEBT", () => {
  function item(plainEnglish: string, excerpt?: string) {
    return {
      sectionRef: "7.01(t)", heading: "Liens", category: "NEGATIVE_COVENANTS", plainEnglish,
      operativeLanguageExcerpt: excerpt ?? plainEnglish,
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [],
    } as any;
  }
  it("other Liens securing Indebtedness capped at $5M mints LIEN only", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem(item(
      "(t) other Liens securing Indebtedness outstanding in an aggregate principal amount not to exceed $5,000,000, provided that no such Lien shall extend to or cover any Collateral.",
    ));
    expect(grants).toEqual(["LIEN"]);
  });
  it("a debt basket secured by liens keeps DEBT", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem(item(
      "The Borrower may incur Indebtedness in an aggregate principal amount not to exceed $10,000,000, secured by Liens on the Collateral.",
    ));
    expect(grants).toContain("DEBT_INCURRENCE");
  });
});

/** Rule 202: the "imposes an affirmative or ongoing obligation" lead is a classification lead. */
describe("rule 202: regime-label lead does not launder an RP grant", () => {
  it("a pure Investments clause with an RP regime label mints INVESTMENT only", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem({
      sectionRef: "7.03(p)", heading: "Investments", category: "NEGATIVE_COVENANTS",
      plainEnglish:
        "Section 7.03(p) (\u201c7.03(p)\u201d) imposes an affirmative or ongoing obligation related to restricted payments and investments for Borrower, Loan Parties, Subsidiaries. Permission substance: (p) other Investments not exceeding, in the aggregate in any fiscal year of the Borrower, $500,000, so long as no Default has occurred.",
      operativeLanguageExcerpt:
        "(p) other Investments not exceeding, in the aggregate in any fiscal year of the Borrower, $500,000, so long as no Default has occurred and is continuing.",
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [],
    } as any);
    expect(grants).toEqual(["INVESTMENT"]);
  });
  it("a genuine combined RP + Investment clause still mints both", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem({
      sectionRef: "7.03(q)", heading: "Investments", category: "NEGATIVE_COVENANTS",
      plainEnglish:
        "Section 7.03(q) (\u201c7.03(q)\u201d) imposes an affirmative or ongoing obligation related to restricted payments and investments. Permission substance: (q) Restricted Payments and Investments not exceeding $1,000,000 in the aggregate.",
      operativeLanguageExcerpt:
        "(q) Restricted Payments and Investments not exceeding $1,000,000 in the aggregate.",
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [],
    } as any);
    expect(grants).toContain("RESTRICTED_PAYMENT");
    expect(grants).toContain("INVESTMENT");
  });
});

/** Rule 203: a clause item's own operative excerpt is grant evidence. */
describe("rule 203: clause excerpt is grant evidence; chapeau excerpt is not", () => {
  function item(sectionRef: string, plainEnglish: string, excerpt: string) {
    return {
      sectionRef, heading: "Investments", category: "NEGATIVE_COVENANTS", plainEnglish,
      operativeLanguageExcerpt: excerpt,
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [],
    } as any;
  }
  it("a clause item whose plainEnglish summarizes away the cap still mints INVESTMENT from its excerpt", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem(item(
      "7.03(p)",
      "Section 7.03(p) (\u201c7.03(p)\u201d) imposes an affirmative or ongoing obligation related to restricted payments and investments. Material baskets/thresholds identified: Amount/threshold: $500,000. Conditions: no Default has occurred.",
      "(p) other Investments not exceeding, in the aggregate in any fiscal year of the Borrower, $500,000, so long as no Default has occurred.",
    ));
    expect(grants).toEqual(["INVESTMENT"]);
  });
  it("a chapeau item does not mint a grant from a sub-clause's cap in its excerpt", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem(item(
      "7.03",
      "Section 7.03 (\u201c7.03\u201d) is a general investments article. The article sets out the investment regime.",
      "Section 7.03. Investments. The Borrower shall not make Investments except: (a) Investments in Cash Equivalents; (p) other Investments not exceeding $500,000 in the aggregate.",
    ));
    expect(grants).not.toContain("INVESTMENT");
  });
});

/** Rule 204: the definitions article never grants capacity. */
describe("rule 204: definitions-article items never mint grants", () => {
  it("a 1.01 definition condition with a Collateral mention mints nothing", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem({
      sectionRef: "1.01(f)(i)(d)(n)", heading: "1.01(f)(i)(d)(n)", category: "NEGATIVE_COVENANTS",
      plainEnglish: "Section 1.01(f)(i)(d)(n) defines a condition of Permitted Acquisition.",
      operativeLanguageExcerpt:
        "(n) with respect to any such Acquisition of assets that do not become Collateral, the aggregate Cost of Acquisition does not exceed $10,000,000 in any fiscal year.",
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [],
    } as any);
    expect(grants).toEqual([]);
  });

  it("a 1.01 item under a titled non-definitions article heading is not classified by number alone (D17)", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const operative = {
      heading: "Limitation on Liens", category: "LIENS_SECURED_DEBT",
      plainEnglish: "Secured Indebtedness and Liens permitted.",
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [], families: [],
    } as any;
    // Control: the same operative item at a covenant-article ref mints.
    expect(grantTypesForItem({ ...operative, sectionRef: "7.01(a)" })).toEqual(["DEBT_INCURRENCE", "LIEN"]);
    // At §1.01, a titled non-definitions article heading is
    // affirmative structural evidence about which article the item
    // sits in: the §1.01 number convention must not override it
    // and suppress the grants.
    expect(
      grantTypesForItem({ ...operative, sectionRef: "1.01(a)", articleHeading: "ARTICLE I — GUARANTEE" }),
    ).toEqual(["DEBT_INCURRENCE", "LIEN"]);
    // With no heading evidence, the number fallback still
    // classifies §1.01 as the definitions article (the Asure
    // protection in the test above).
    expect(grantTypesForItem({ ...operative, sectionRef: "1.01(a)" })).toEqual([]);
    // A bare designator carries no title evidence either.
    expect(grantTypesForItem({ ...operative, sectionRef: "1.01(a)", articleHeading: "ARTICLE I" })).toEqual([]);
  });

  it("a definitions article at a non-1.01 number is classified by its heading (Phase C branch)", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const rpItem = {
      heading: "Limitation on Restricted Payments", category: "RESTRICTED_PAYMENTS",
      plainEnglish: "Dividends permitted from the builder basket.",
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [], families: [],
    } as any;
    // Control: the same grant-bearing item outside a definitions
    // article mints.
    expect(
      grantTypesForItem({ ...rpItem, sectionRef: "6.08(a)", articleHeading: "ARTICLE VI — NEGATIVE COVENANTS" }),
    ).toEqual(["RESTRICTED_PAYMENT"]);
    // Under a Definitions heading it mints nothing, whatever its
    // number (the Tenable 1.02 shape).
    expect(
      grantTypesForItem({ ...rpItem, sectionRef: "1.02(d)", articleHeading: "ARTICLE I — DEFINITIONS" }),
    ).toEqual([]);
  });
});

/** Rule 203 tightening: excerpt evidence only for single-clause excerpts. */
describe("rule 203 tightening: composite excerpts are not evidence", () => {
  it("a clause with sub-clause exceptions in its excerpt does not mint from the sub-clause", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem({
      sectionRef: "6.08(a)", heading: "Restricted Payments", category: "NEGATIVE_COVENANTS",
      plainEnglish: "Section 6.08(a) prohibits Restricted Payments except as permitted.",
      operativeLanguageExcerpt:
        "No Loan Party will declare or make any Restricted Payment except (i) dividends payable in shares and (ii) Indebtedness permitted under Section 6.01 not exceeding $750,000.",
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [],
    } as any);
    expect(grants).not.toContain("DEBT_INCURRENCE");
  });
});

/** Rule 201 gap: the real Strata 6.02(l) has ~85 chars between "Liens" and "securing Indebtedness". */
describe("rule 201 gap: long-gap lien-secured clause still suppresses DEBT", () => {
  it("a lien clause with ~85 chars between Liens and securing Indebtedness mints LIEN only", async () => {
    const { grantTypesForItem } = await import("../../lib/product/customer-intelligence/grant-types");
    const grants = grantTypesForItem({
      sectionRef: "6.02(l)", heading: "6.02(l)", category: "LIENS_SECURED_DEBT",
      plainEnglish: "Section 6.02(l) operates as a permission. (l) other Liens incurred in the ordinary course of business of the Borrowers and their Subsidiaries securing Indebtedness and other obligations that do not in the aggregate exceed $250,000 at any time outstanding.",
      operativeLanguageExcerpt: "(l) other Liens incurred in the ordinary course of business of the Borrowers and their Subsidiaries securing Indebtedness and other obligations that do not in the aggregate exceed $250,000 at any time outstanding.",
      permissions: [], materialBasketsThresholds: [], conditions: [], exceptions: [],
      relatedDefinedTerms: [], applicableDefinitions: [],
    } as any);
    expect(grants).toEqual(["LIEN"]);
  });
});

describe("Rule 207: incremental-facility provisions never grant capacity", () => {
  it("Expand 2.19(b)-shaped incremental-facility item mints nothing", () => {
    expect(
      grantTypesForItem(
        item(
          "2.19(b)",
          "OTHER",
          "Incremental Increase: subject to notice to the Administrative Agent, the Borrower may request an Incremental Increase. The Applicable Rate may be increased. An Additional Lender may provide the increase. Amount: $5,000,000.",
        ),
      ),
    ).toEqual([]);
  });

  it("a covenant-category basket merely referencing an incremental facility keeps DEBT", () => {
    expect(
      grantTypesForItem(
        item(
          "Limitation on Indebtedness",
          "INDEBTEDNESS",
          "Indebtedness incurred pursuant to an Incremental Agreement, in an aggregate principal amount not to exceed $50,000,000.",
        ),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });

  it("an OTHER item mentioning an incremental facility WITHOUT a mechanic signal keeps its grants", () => {
    expect(
      grantTypesForItem(
        item(
          "Miscellaneous",
          "OTHER",
          "Indebtedness incurred pursuant to an Incremental Agreement, in an aggregate principal amount not to exceed $50,000,000.",
        ),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });
});

describe("Rule 208 (revised): the analyzer's posture meta-phrase is not permission evidence", () => {
  it("Expand 6.02(bb)-shaped item (meta-phrase + lien cap) mints LIEN only", () => {
    // The real 6.02(bb) plainEnglish carries "prohibition/permission
    // posture could not be determined" — the word "permission" in
    // that meta-phrase laundered into modal DEBT evidence. Stripping
    // the phrase leaves the LIEN signal ("liens and secured debt")
    // + the $60M cap, so the item mints LIEN only.
    expect(
      grantTypesForItem(
        item(
          "6.02(bb)",
          "LIENS_SECURED_DEBT",
          'Section 6.02(bb) ("6.02(bb)") relates to liens and secured debt, but its prohibition/permission posture could not be determined from the excerpt. Material baskets/thresholds identified: Amount/threshold: $60,000,000.',
        ),
      ),
    ).toEqual(["LIEN"]);
  });

  it("a genuine permission ('Secured Indebtedness and Liens permitted') still mints DEBT+LIEN", () => {
    // No meta-phrase here — "permitted" is operative language, not
    // analyzer boilerplate. (The first version of Rule 208 suppressed
    // DEBT for the whole LIENS_SECURED_DEBT category and broke this
    // test; the category guard was reverted in favor of the
    // meta-phrase strip.)
    expect(
      grantTypesForItem(item("Limitation on Liens", "LIENS_SECURED_DEBT", "Secured Indebtedness and Liens permitted.")),
    ).toEqual(["DEBT_INCURRENCE", "LIEN"]);
  });
});
