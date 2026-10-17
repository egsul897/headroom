import { describe, expect, it } from "vitest";
import { clauseRatioTerm, clauseRatioThreshold } from "@/lib/contract-model/covenant-computation/baskets";

describe("ratio-based basket linking", () => {
  it("reads the full ratio term, so a longer term never borrows a shorter catalog ratio", () => {
    expect(clauseRatioTerm("“ Total First Lien Leverage Ratio ” means")).toBe("Total First Lien Leverage Ratio");
    expect(clauseRatioTerm("so long as (i) the Consolidated Senior Secured Leverage Ratio of the Borrower")).toBe("Consolidated Senior Secured Leverage Ratio");
    expect(clauseRatioTerm("(ii) Total Net Leverage Ratio on a Pro Forma Basis")).toBe("Total Net Leverage Ratio");
    expect(clauseRatioTerm("no ratio here")).toBeNull();
  });
  it("reads one stated threshold in the usual forms and refuses ambiguity", () => {
    expect(clauseRatioThreshold("the Total Net Leverage Ratio is not greater than 3.00 to 1.00")).toMatchObject({ comparator: "NO_GREATER_THAN", num: 3, den: 1 });
    expect(clauseRatioThreshold("the Leverage Ratio shall not exceed 3.50:1.00")).toMatchObject({ comparator: "NO_GREATER_THAN", num: 3.5, den: 1 });
    expect(clauseRatioThreshold("Fixed Charge Coverage Ratio would be at least 1.75 to 1.00")).toMatchObject({ comparator: "AT_LEAST", num: 1.75, den: 1 });
    expect(clauseRatioThreshold("is less than or equal to 3.5 to 1.0 or, after an election, 4.0 to 1.0")).toBeNull();
    expect(clauseRatioThreshold("the Leverage Ratio as set forth in the table")).toBeNull();
  });
});
