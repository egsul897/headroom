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

/**
 * Rule 209 (representation step 2 — grant-detection precision):
 * non-basket provisions mint no grants, and wrong-type grants on
 * genuine clauses are corrected. Every fixture is synthetic.
 * Note on Rule 209e vs the reverted Rule 208 category guard:
 * the bar is evidence-graded, not categorical — a LIENS/GUARANTEES
 * item whose text DIRECTLY permits the debt (cap frame, or a
 * modal asserting this clause's permission) keeps its DEBT grant;
 * only label-laundered and reference-form evidence is refused.
 */
describe("Rule 209: grant-detection precision", () => {
  function rich(partial: Partial<CovenantSummaryItem>): CovenantSummaryItem {
    return {
      heading: "",
      category: "OTHER",
      plainEnglish: "",
      families: [],
      sectionRef: "",
      operativeLanguageExcerpt: "",
      ...partial,
    } as unknown as CovenantSummaryItem;
  }

  it("209a: 'Secured' alone (ratio name) mints no LIEN and does not block the genuine RP grant", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "9.06(m)",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.06(m)",
          plainEnglish:
            "Section 9.06(m) operates as a conditional permission within the restricted payments regime. Permission substance: (m) Restricted Payments when the Secured Leverage Ratio is less than 4.00 to 1.00.",
        }),
      ),
    ).toEqual(["RESTRICTED_PAYMENT"]);
  });

  it("209a: 'Secured Obligations' as a defined term mints no LIEN", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Indebtedness",
          category: "DEBT_INCURRENCE",
          sectionRef: "9.03",
          plainEnglish:
            "Indebtedness under the revolving facility, together with the Secured Obligations thereunder, shall be repaid at maturity.",
        }),
      ),
    ).toEqual([]);
  });

  it("209b: the Available Amount alone (a prepayment mechanic) is not an RP grant", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Mandatory Prepayments",
          category: "OTHER",
          sectionRef: "9.05(b)",
          plainEnglish:
            "If the Available Amount is positive after a mandatory prepayment event, the Borrower shall prepay the Loans in an amount equal thereto.",
        }),
      ),
    ).toEqual([]);
  });

  it("209c: 'Guarantees by ...' is a guarantee permission, not an incurrence", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Guarantees",
          category: "GUARANTEES",
          sectionRef: "9.05(a)",
          plainEnglish:
            "Guarantees by any Loan Party of Indebtedness of any other Person, except Guarantees permitted under Section 9.04, are prohibited.",
          operativeLanguageExcerpt:
            "(a) Guarantees by any Loan Party of Indebtedness of any other Person, except Guarantees permitted under Section 9.04.",
        }),
      ),
    ).toEqual([]);
  });

  it("209c: 'Guarantee Obligations of ...' is a guarantee permission, not an incurrence", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Guarantees",
          category: "GUARANTEES",
          sectionRef: "9.05(d)",
          plainEnglish:
            "Guarantee Obligations of any Person in respect of Indebtedness of any other Person permitted under Section 9.04.",
          operativeLanguageExcerpt:
            "(d) Guarantee Obligations of any Person in respect of Indebtedness of any other Person permitted under Section 9.04.",
        }),
      ),
    ).toEqual([]);
  });

  it("209c preservation: a debt basket listing guarantees as a FORM of Indebtedness keeps DEBT (debt word first)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Indebtedness",
          category: "DEBT_INCURRENCE",
          sectionRef: "9.03(k)",
          plainEnglish:
            "Indebtedness, including Guarantee Obligations in respect of obligations of others, in an aggregate amount not to exceed $3,000,000.",
          operativeLanguageExcerpt:
            "(k) Indebtedness, including Guarantee Obligations in respect of obligations of others, in an aggregate amount not to exceed $3,000,000.",
        }),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });

  it("209d: 'Liens secure Indebtedness' (verb form) mints LIEN only", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Liens",
          category: "LIENS_SECURED_DEBT",
          sectionRef: "9.01(d)",
          plainEnglish:
            "Permission substance: (d) Liens on equipment; provided that such Liens secure Indebtedness permitted by Section 9.02(e).",
          operativeLanguageExcerpt:
            "(d) Liens on equipment; provided that such Liens secure Indebtedness permitted by Section 9.02(e).",
        }),
      ),
    ).toEqual(["LIEN"]);
  });

  it("209d: the lien-renewal frame mints LIEN only", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Liens",
          category: "LIENS_SECURED_DEBT",
          sectionRef: "9.01(w)",
          plainEnglish:
            "Permission substance: (w) the renewal or extension of any Lien permitted by clause (a), so long as the Indebtedness secured thereby is permitted by Section 9.03.",
          operativeLanguageExcerpt:
            "(w) the renewal or extension of any Lien permitted by clause (a), so long as the Indebtedness secured thereby is permitted by Section 9.03.",
        }),
      ),
    ).toEqual(["LIEN"]);
  });

  it("209e: label-laundered DEBT evidence on a LIENS item is refused (LIEN only)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Liens",
          category: "LIENS_SECURED_DEBT",
          sectionRef: "9.01(f)",
          plainEnglish:
            "Section 9.01(f) operates as a enumerated permission within the liens and secured debt regime. Permission substance: (f) deposits with banks in the ordinary course of business, other than Indebtedness for borrowed money, and Liens arising in connection therewith.",
          operativeLanguageExcerpt:
            "(f) deposits with banks in the ordinary course of business, other than Indebtedness for borrowed money.",
        }),
      ),
    ).toEqual(["LIEN"]);
  });

  it("209e: reference-form DEBT evidence on a LIENS item is refused (LIEN only)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Liens",
          category: "LIENS_SECURED_DEBT",
          sectionRef: "9.01(q)",
          plainEnglish:
            "Permission substance: (q) Liens on property acquired with Indebtedness permitted under Section 9.02(b).",
          operativeLanguageExcerpt:
            "(q) Liens on property acquired with Indebtedness permitted under Section 9.02(b).",
        }),
      ),
    ).toEqual(["LIEN"]);
  });

  it("209e preservation: a LIENS item that itself caps the debt keeps DEBT+LIEN", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Liens",
          category: "LIENS_SECURED_DEBT",
          sectionRef: "9.01(u)",
          plainEnglish:
            "Permission substance: (u) Indebtedness of any Subsidiary in an aggregate amount not to exceed $3,000,000, secured by Liens on its property.",
          operativeLanguageExcerpt:
            "(u) Indebtedness of any Subsidiary in an aggregate amount not to exceed $3,000,000, secured by Liens on its property.",
        }),
      ),
    ).toEqual(["DEBT_INCURRENCE", "LIEN"]);
  });

  it("209f: a cross-category clause whose lien words sit in a condition mints no LIEN", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Letters of Credit",
          category: "OTHER",
          sectionRef: "9.03(q)",
          plainEnglish: "Section 9.03(q) states a general prohibition for the Borrower.",
          operativeLanguageExcerpt:
            "(q) upon the occurrence of an Event of Default, the Borrower shall Cash Collateralize all Letter of Credit Outstandings and deposit Collateral with the Agent.",
        }),
      ),
    ).toEqual([]);
  });

  it("209f preservation: a clause with 'Liens permitted by' evidence keeps its LIEN", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Investments",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.02(z)",
          plainEnglish:
            "Permission substance: (z) Liens solely on any cash earnest money deposits made by the Borrower in connection with any purchase agreement permitted hereunder.",
          operativeLanguageExcerpt:
            "(z) Liens solely on any cash earnest money deposits made by the Borrower in connection with any purchase agreement permitted hereunder.",
        }),
      ),
    ).toEqual(["LIEN"]);
  });

  it("209f preservation: SECTION-level items are exempt (the stem's evidence is its section)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Collateral and Guaranty Matters",
          category: "GUARANTEES",
          sectionRef: "9.04",
          plainEnglish:
            "This Section governs Collateral matters; the Agent may release Liens and Guarantees in accordance with this Section.",
        }),
      ),
    ).toEqual(["LIEN"]);
  });

  it("209f gain: an investments clause whose only lien signal is an unevidenced condition mints INVESTMENT, not LIEN", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Investments",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.04(a)",
          plainEnglish:
            "Section 9.04(a) operates as a enumerated permission within the investments regime for Borrower. Material baskets: (a) Investments in Subsidiaries, provided the Agent holds a security interest and Liens on their assets.",
          operativeLanguageExcerpt:
            "(a) Investments in Subsidiaries, provided the Agent holds a security interest and Liens on their assets.",
        }),
      ),
    ).toEqual(["INVESTMENT"]);
  });

  it("209g: combined branch grounds each family in the clause's own text (investments-only clause)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "9.03(a)",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.03(a)",
          plainEnglish:
            "Section 9.03(a) relates to restricted payments and investments, but its posture could not be determined. Permission substance: (a) Investments in cash and Cash Equivalents held in deposit accounts.",
          operativeLanguageExcerpt: "(a) Investments in cash and Cash Equivalents held in deposit accounts;",
        }),
      ),
    ).toEqual(["INVESTMENT"]);
  });

  it("209g: combined branch grounding (RP-only clause)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "9.03(b)",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.03(b)",
          plainEnglish:
            "Section 9.03(b) relates to restricted payments and investments, but its posture could not be determined. Permission substance: (b) Restricted Payments in respect of tax distributions to equity holders.",
          operativeLanguageExcerpt: "(b) Restricted Payments in respect of tax distributions to equity holders;",
        }),
      ),
    ).toEqual(["RESTRICTED_PAYMENT"]);
  });

  it("209g fail-closed: a clause whose excerpt names NEITHER family keeps both grants", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "9.03(c)",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.03(c)",
          plainEnglish:
            "Section 9.03(c) relates to restricted payments and investments, but its posture could not be determined. Permission substance: (c) transactions under the builder basket in an amount not to exceed $3,000,000.",
          operativeLanguageExcerpt: "(c) the transactions described in this clause;",
        }),
      ),
    ).toEqual(["RESTRICTED_PAYMENT", "INVESTMENT"]);
  });

  it("209h: a payment-default trigger grants nothing", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Events of Default",
          category: "OTHER",
          sectionRef: "9.02(c)",
          plainEnglish: "Section 9.02(c) states a general prohibition for Loan Parties.",
          operativeLanguageExcerpt:
            "(c) any Loan Party shall fail to make any payment in respect of any Material Indebtedness when due and payable.",
        }),
      ),
    ).toEqual([]);
  });

  it("209h: a collateral-validity trigger grants nothing", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Events of Default",
          category: "LIENS_SECURED_DEBT",
          sectionRef: "9.02(p)",
          plainEnglish: "Section 9.02(p) states a general prohibition for Loan Parties.",
          operativeLanguageExcerpt:
            "(p) any Collateral Document shall fail to create a valid security interest in any Collateral purported to be covered thereby.",
        }),
      ),
    ).toEqual([]);
  });

  it("209i: an item inside an Events-of-Default ARTICLE grants nothing whatever its category", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "9.01(k)",
          category: "LIENS_SECURED_DEBT",
          sectionRef: "9.01(k)",
          articleHeading: "ARTICLE VIII EVENTS OF DEFAULT",
          plainEnglish:
            "Liens and Collateral securing the Obligations shall be enforceable by the Agent upon the occurrence of the events described herein.",
          operativeLanguageExcerpt: "(k) Liens and Collateral securing the Obligations.",
        }),
      ),
    ).toEqual([]);
  });

  it("209i: an item inside a Conditions Precedent article grants nothing", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Conditions to Loans",
          category: "DEBT_INCURRENCE",
          sectionRef: "9.01(a)",
          articleHeading: "ARTICLE IV CONDITIONS PRECEDENT",
          plainEnglish:
            "Indebtedness not to exceed $3,000,000 may be incurred when each condition precedent to the initial Loan is satisfied.",
          operativeLanguageExcerpt:
            "(a) Indebtedness not to exceed $3,000,000 may be incurred when each condition precedent is satisfied.",
        }),
      ),
    ).toEqual([]);
  });

  it("209j: a restrictive-agreements exception grants nothing (the permission runs to the restriction)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Restrictive Agreements",
          category: "OTHER",
          sectionRef: "9.10(e)",
          plainEnglish:
            "Permission substance: (e) restrictions imposed by any agreement relating to secured Indebtedness permitted by this Agreement on the date hereof.",
          operativeLanguageExcerpt:
            "(e) restrictions imposed by any agreement relating to secured Indebtedness permitted by this Agreement on the date hereof;",
        }),
      ),
    ).toEqual([]);
  });

  it("209k: an EBITDA fee/expense add-back component grants nothing", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Consolidated EBITDA",
          category: "OTHER",
          sectionRef: "9.14(xiv)",
          plainEnglish:
            "Permission substance: (xiv) any fees, costs and expenses in connection with any acquisition or issuance of Indebtedness, in an aggregate amount not to exceed 5% of the aggregate consideration therefor.",
          operativeLanguageExcerpt:
            "(xiv) any fees, costs and expenses in connection with any acquisition or issuance of Indebtedness, in an aggregate amount not to exceed 5% of the aggregate consideration therefor;",
        }),
      ),
    ).toEqual([]);
  });

  it("209l: a payment-frame clause (prepay/redeem) grants no incurrence", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Optional and Mandatory Prepayments",
          category: "DEBT_INCURRENCE",
          sectionRef: "9.08(a)",
          plainEnglish:
            "Permission substance: (a) Prepay, redeem, purchase or defease any subordinated Indebtedness, except with the proceeds of Indebtedness permitted by Section 9.03.",
          operativeLanguageExcerpt:
            "(a) Prepay, redeem, purchase or defease any subordinated Indebtedness, except with the proceeds of Indebtedness permitted by Section 9.03.",
        }),
      ),
    ).toEqual([]);
  });

  it("209l preservation: a purchase-money clause still mints DEBT (PURCHASE is not a payment-frame head)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Indebtedness",
          category: "DEBT_INCURRENCE",
          sectionRef: "9.03(b)",
          plainEnglish:
            "Permission substance: (b) purchase money Indebtedness incurred to finance equipment, in an aggregate amount not to exceed $3,000,000.",
          operativeLanguageExcerpt:
            "(b) purchase money Indebtedness incurred to finance equipment, in an aggregate amount not to exceed $3,000,000.",
        }),
      ),
    ).toEqual(["DEBT_INCURRENCE"]);
  });

  it("209m: a [reserved] clause grants nothing", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "9.02(aa)",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.02(aa)",
          plainEnglish:
            "Section 9.02(aa) relates to restricted payments and investments, but its posture could not be determined.",
          operativeLanguageExcerpt: "(aa) [reserved]; 118",
        }),
      ),
    ).toEqual([]);
  });

  it("209n: a bare-integer sectionRef (definitions enumeration fragment) grants nothing", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Excluded Property",
          category: "LIENS_SECURED_DEBT",
          sectionRef: "40(a)",
          plainEnglish: "Excluded Property shall not include Collateral Interests in real property or Capital Stock.",
          operativeLanguageExcerpt: "(a) Excluded Property shall not include Collateral Interests in real property.",
        }),
      ),
    ).toEqual([]);
  });

  it("209o: an article-level (pure roman) sectionRef grants nothing", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Miscellaneous",
          category: "OTHER",
          sectionRef: "VI",
          plainEnglish: "The Collateral Trustee shall hold all Liens for the benefit of the Secured Parties.",
          operativeLanguageExcerpt: "The Collateral Trustee shall hold all Liens for the benefit of the Secured Parties.",
        }),
      ),
    ).toEqual([]);
  });

  it("209p: definition-shaped text (two defined-term introductions) grants nothing", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "9.03(iv)",
          category: "DEBT_INCURRENCE",
          sectionRef: "9.03(iv)",
          plainEnglish:
            "Section 9.03(iv) relates to restricted payments and investments, but its posture could not be determined.",
          operativeLanguageExcerpt:
            '(iv) such Person is solvent after giving effect thereto. "Designated Account" means the account specified in Schedule 9.01. "Excluded Subsidiary" has the meaning specified in Section 9.01(b).',
        }),
      ),
    ).toEqual([]);
  });

  it("209p preservation: a basket naming one defined term inline still mints", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Investments",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.03(a)",
          plainEnglish:
            "Permission substance: (a) Investments in Designated Subsidiaries in an aggregate amount not to exceed $3,000,000.",
          operativeLanguageExcerpt:
            '(a) Investments in "Designated Subsidiaries" (as defined in Section 1.01) in an aggregate amount not to exceed $3,000,000;',
        }),
      ),
    ).toEqual(["INVESTMENT"]);
  });

  it("209q: a DEBT-filed item whose debt evidence failed does not fall through to INVESTMENT on 'Permitted Acquisition'", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "Limitation on Indebtedness",
          category: "DEBT_INCURRENCE",
          sectionRef: "9.03(v)",
          plainEnglish:
            "Section 9.03(v) operates as a conditional permission within the debt incurrence regime. Permission substance: (v) Indebtedness assumed in connection with a Permitted Acquisition or other similar Investment not prohibited hereunder, so long as the Total Net Leverage Ratio is not greater than 5.25 to 1.00.",
          operativeLanguageExcerpt:
            "(v) Indebtedness assumed in connection with a Permitted Acquisition or other similar Investment not prohibited hereunder, so long as the Total Net Leverage Ratio is not greater than 5.25 to 1.00; and (ii) any Liens securing Indebtedness permitted under this clause shall attach only to the assets so acquired.",
        }),
      ),
    ).toEqual([]);
  });

  it("no posture gate: an OBLIGATION-posture investment basket still mints (posture is evidence, not a gate)", () => {
    expect(
      grantTypesForItem(
        rich({
          heading: "9.03(p)",
          category: "RESTRICTED_PAYMENTS_INVESTMENTS",
          sectionRef: "9.03(p)",
          posture: "OBLIGATION",
          plainEnglish:
            "Section 9.03(p) imposes an affirmative or ongoing obligation related to restricted payments and investments. Material baskets/thresholds identified: Amount/threshold: $750,000.",
          operativeLanguageExcerpt:
            "(p) other Investments not exceeding $750,000 in any fiscal year, so long as no Default has occurred and is continuing.",
        }),
      ),
    ).toEqual(["INVESTMENT"]);
  });
});
