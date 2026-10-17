import { describe, expect, it } from "vitest";
import { classifyCovenantFamily } from "@/lib/contract-model/section-tree/family-classifier";

describe("minimum EBITDA maintenance tests", () => {
  it("'allow ... Consolidated EBITDA for the 12-month period then ended to be less than' under 'Financial Covenants' is FINANCIAL_RATIOS", () => {
    const lead = "(a) Prior to the ABL Adjustment Date, allow, as of the end of each fiscal month set forth below, Consolidated EBITDA for the 12-month period then ended to be less than the following:";
    expect(classifyCovenantFamily({ title: "Financial Covenants", leadIn: lead }).family).toBe("FINANCIAL_RATIOS");
  });
  it("an EBITDA-based basket cap is not a maintenance test", () => {
    const lead = "The Borrower may make Investments in an aggregate amount not to exceed the greater of $25,000,000 and 20% of Consolidated EBITDA.";
    expect(classifyCovenantFamily({ title: "Investments", leadIn: lead }).families).not.toContain("FINANCIAL_RATIOS");
  });
});
