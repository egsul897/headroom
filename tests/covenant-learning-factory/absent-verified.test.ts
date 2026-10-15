import { describe, expect, it } from "vitest";
import { familyEvidence } from "@/lib/contract-model/section-tree/semantics";

describe("family evidence (ABSENT_VERIFIED vs MISSING)", () => {
  it("finds an operative negative-covenant lead-in", () => {
    expect(familyEvidence("The Borrower shall not, and shall not permit any Subsidiary to, create, incur or assume any Indebtedness, except:", "DEBT").length).toBe(1);
    expect(familyEvidence("No Loan Party nor any Subsidiary shall declare or pay any dividend on its Equity Interests.", "RESTRICTED_PAYMENTS").length).toBe(1);
  });
  it("finds a numbered heading", () => {
    expect(familyEvidence("Text.\n6.07 Transactions with Affiliates\nOther text.", "AFFILIATE_TRANSACTIONS").length).toBe(1);
  });
  it("ignores negations that govern a different predicate (reviewed false positives on the 3 held-out docs)", () => {
    expect(familyEvidence("The Banks shall not be required to make any Advance, unless on the applicable Borrowing Date the conditions are met.", "INVESTMENTS")).toEqual([]);
    expect(familyEvidence("the provisions of this Article 11 shall not apply to any transfer of assets between the Company and its Subsidiaries.", "ASSET_SALES")).toEqual([]);
    expect(familyEvidence("the number of shares outstanding shall not include treasury shares so long as the Company does not pay any dividend.", "RESTRICTED_PAYMENTS")).toEqual([]);
    expect(familyEvidence("The Company shall not consolidate with or merge with or sell, convey, transfer or lease all or substantially all of its assets", "ASSET_SALES")).toEqual([]);
  });
});
