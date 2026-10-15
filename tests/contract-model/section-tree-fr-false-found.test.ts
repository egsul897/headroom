import { describe, expect, it } from "vitest";
import { classifyCovenantFamily } from "../../lib/contract-model/section-tree/family-classifier";

describe("FINANCIAL_RATIOS false FOUNDs (reviewer #380)", () => {
  it("a 'Financial Condition' representation is not a ratio covenant", () => {
    const v = classifyCovenantFamily({ title: "Financial Condition", covenantContext: true, leadIn: " The consolidated balance sheet of the Borrower as at December 31 and the related statements present fairly the consolidated financial condition; the Leverage Ratio was not greater than 3.00 to 1.00." });
    expect(v.families).not.toContain("FINANCIAL_RATIOS");
  });
  it("a restated definition (definitions-only amendment) states no covenant", () => {
    const v = classifyCovenantFamily({ title: "Consolidated Leverage Ratio", covenantContext: true, leadIn: " “Consolidated Leverage Ratio” means, as of any date, the ratio of Consolidated Total Debt to EBITDA, which shall not exceed 3.50 to 1.00." });
    expect(v.families).toEqual([]);
  });
  it("an amendment instruction to a definition states no covenant", () => {
    const v = classifyCovenantFamily({ title: "Amendments to Section 1.01", covenantContext: true, leadIn: " The definition of “Permitted Liens” in Section 1.01 is hereby amended by deleting clause (k); the Borrower shall not create any Lien except Permitted Liens." });
    expect(v.families).toEqual([]);
  });
  it("a real maintenance test still classifies", () => {
    const v = classifyCovenantFamily({ title: "Financial Covenant", covenantContext: true, leadIn: " Consolidated Leverage Ratio. Permit the Consolidated Leverage Ratio as at the last day of any period of four consecutive fiscal quarters to exceed 3.50 to 1.00." });
    expect(v.families).toContain("FINANCIAL_RATIOS");
  });
});
