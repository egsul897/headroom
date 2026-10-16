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
    expect(grantTypesForItem(item("Limitation on Asset Sales", "OTHER", "No Asset Sale shall exceed $10.0 million in proceeds."), "OTHER")).toEqual([]);
  });

  it("merger covenant matches NO grant type", () => {
    expect(grantTypesForItem(item("Merger, Consolidation or Sale of Assets", "OTHER", "The Company shall not merge with another Person."), "OTHER")).toEqual([]);
  });

  it("debt covenant still maps to DEBT_INCURRENCE", () => {
    expect(
      grantTypesForItem(item("Limitation on Indebtedness", "DEBT_INCURRENCE", "Indebtedness not to exceed $150.0 million."), "DEBT_INCURRENCE"),
    ).toEqual(["DEBT_INCURRENCE"]);
  });

  it("secured-debt covenant maps to both DEBT_INCURRENCE and LIEN", () => {
    expect(
      grantTypesForItem(item("Limitation on Liens", "LIENS_SECURED_DEBT", "Secured Indebtedness and Liens permitted."), "LIENS_SECURED_DEBT"),
    ).toEqual(["DEBT_INCURRENCE", "LIEN"]);
  });

  it("dividend covenant maps to RESTRICTED_PAYMENT", () => {
    expect(
      grantTypesForItem(item("Limitation on Restricted Payments", "RESTRICTED_PAYMENTS", "Dividends permitted from the builder basket."), "RESTRICTED_PAYMENTS"),
    ).toEqual(["RESTRICTED_PAYMENT"]);
  });
});
