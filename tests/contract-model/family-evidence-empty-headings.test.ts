import { describe, expect, it } from "vitest";
import { familyEvidence } from "@/lib/contract-model/section-tree/semantics";

describe("headings that state no covenant", () => {
  it("'6.26 Financial Covenants. None.' is not evidence", () => {
    expect(familyEvidence("6.25 Use of Proceeds. The Borrower will use the proceeds for working capital.\n6.26 Financial Covenants. None.\n\nARTICLE 7\n", "FINANCIAL_RATIOS")).toEqual([]);
  });
  it("a notice duty under 'Debt and Liens' is not liens or debt evidence", () => {
    const t = "5.17 Debt and Liens\n\nCorporation will in reasonable time and due manner inform the Purchaser of any new liens and debts incurred by the Corporation.\n";
    expect(familyEvidence(t, "LIENS")).toEqual([]);
    expect(familyEvidence(t, "DEBT")).toEqual([]);
  });
  it("an operative heading still counts", () => {
    expect(familyEvidence("6.26 Financial Covenants. The Borrower shall not permit the Leverage Ratio to exceed 3.00 to 1.00.\n", "FINANCIAL_RATIOS").length).toBeGreaterThan(0);
    expect(familyEvidence("5.17 Liens\n\nThe Corporation shall not create any Lien on its property.\n", "LIENS").length).toBeGreaterThan(0);
  });
});
