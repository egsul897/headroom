import { describe, expect, it } from "vitest";
import { familyEvidence } from "@/lib/contract-model/section-tree/semantics";

describe("financial-covenant evidence excludes index, waiver, and EoD triggers", () => {
  it("'Section 6.14. Financial Covenants. 110 109' with no body is not evidence", () => {
    const t = "Section 6.13. Guaranties. 109\nSection 6.14. Financial Covenants. 110 109\nARTICLE VII\nEVENTS OF DEFAULT\nSection 7.1. Events of Default. 110\n";
    expect(familyEvidence(t, "FINANCIAL_RATIOS")).toEqual([]);
  });
  it("'shall not be required to maintain any minimum tangible net worth' is not evidence", () => {
    expect(familyEvidence("(c) Borrower shall not be required to maintain any minimum tangible net worth, working capital, current ratio or debt-to-equity ratio;\n", "FINANCIAL_RATIOS")).toEqual([]);
  });
  it("'fails to comply with the financial covenant' under an Events of Default article is not evidence", () => {
    expect(familyEvidence("28.1 Financial covenant\n(a) Subject to Clause 26.2, the Company fails to comply with the financial covenant in Clause 26.1 when tested.\n", "FINANCIAL_RATIOS")).toEqual([]);
  });
  it("an operative leverage test still counts", () => {
    expect(familyEvidence("6.14 Financial Covenants. The Borrower shall not permit the Leverage Ratio to exceed 3.00 to 1.00.\n", "FINANCIAL_RATIOS").length).toBeGreaterThan(0);
  });
});
