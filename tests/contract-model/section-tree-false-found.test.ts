/** Reviewer false FOUNDs: a "Financial Condition" representation and a definitions-only amendment are not covenants. */
import { describe, expect, it } from "vitest";
import { parseSectionTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";

const fr = (text: string) => covenantChecklist(parseSectionTree(text), text).find((c) => c.family === "FINANCIAL_RATIOS")!.status;
const FOUND = ["CAP_FOUND", "NEEDS_INPUT", "CONDITIONS_LIMITED"];

describe("not covenants", () => {
  it("'1.1 Financial Condition' representation is not FINANCIAL_RATIOS FOUND", () => {
    const text = "SECTION 1. REPRESENTATIONS AND WARRANTIES\n\nThe Company represents and warrants that:\n\n1.1 Financial Condition. The consolidated balance sheet of the Company as at December 31, 2023 presents fairly its financial condition, and the Company shall maintain a Consolidated Leverage Ratio of not more than 3.00 to 1.00 as of such date as shown therein.\n\n1.2 No Change. Since December 31, 2023 there has been no Material Adverse Effect.\n\n1.3 Existence. The Company is duly organized.\n";
    expect(FOUND).not.toContain(fr(text));
  });
  it("definitions-only amendment is not FINANCIAL_RATIOS FOUND", () => {
    const text = "FIRST AMENDMENT TO CREDIT AGREEMENT\n\nSection 1. Amendments.\n\n(a) The definition of \u201cConsolidated Fixed Charge Coverage Ratio\u201d in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows:\n\n\u201cConsolidated Fixed Charge Coverage Ratio\u201d means, for any period, the ratio of EBITDA to Fixed Charges, which the Borrower shall maintain at not less than 1.25 to 1.00.\n\nSection 2. Counterparts. This Amendment may be executed in counterparts.\n";
    expect(FOUND).not.toContain(fr(text));
  });
  it("a real maintenance covenant still is FOUND", () => {
    const text = "ARTICLE VI\n\nNEGATIVE COVENANTS\n\nSection 6.12 Financial Covenants. The Borrower shall not permit the Consolidated Leverage Ratio as of the last day of any fiscal quarter to exceed 3.50 to 1.00.\n\nSection 6.13 Liens. The Borrower shall not create any Lien.\n";
    expect(FOUND).toContain(fr(text));
  });
});
