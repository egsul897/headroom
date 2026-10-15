import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";

const text = [
  "ARTICLE 6 NEGATIVE COVENANTS", "", "Each Loan Party will not and will not permit any of its Subsidiaries to do any of the following:", "",
  "6.18 Capital Expenditures", "", "Permit the aggregate amount of Capital Expenditures incurred in any fiscal year to exceed $50,000,000.", "",
  "6.19 Restricted Subsidiaries", "", "Allow any Restricted Subsidiary to engage in any activities, own any assets or incur any liabilities.", "",
  "ARTICLE 7 FINANCIAL COVENANTS", "", "So long as any Obligations remain outstanding, the Loan Parties shall:", "",
  "7.1 Maximum Senior Leverage Ratio", "", "Have a Senior Leverage Ratio, measured on a fiscal quarter-end basis, of not greater than 4.75 to 1.00.", "",
  "7.2 Minimum Cash Balance", "", "Maintain unrestricted cash of not less than $5,000,000 at all times.", "",
  "ARTICLE 8 EVENTS OF DEFAULT", "", "8.1 Events of Default", "", "Any one or more of the following events shall constitute an Event of Default.", "",
].join("\n");

describe("bare-number headings followed by a covenant imperative", () => {
  it("'7.1 Title' + 'Have a ... Ratio' and '6.19 Title' + 'Allow ...' open their own sections", () => {
    const t = parseDocumentTree(text);
    const nums = t.nodes.filter((n) => n.kind === "SECTION").map((n) => n.title);
    expect(nums).toEqual(expect.arrayContaining(["Restricted Subsidiaries", "Maximum Senior Leverage Ratio", "Minimum Cash Balance"]));
    const fr = covenantChecklist(t, t.text).find((c) => c.family === "FINANCIAL_RATIOS")!;
    expect(fr.status).not.toBe("MISSING");
    expect(fr.status).not.toBe("ABSENT_VERIFIED");
  });
  it("a numbered line followed by ordinary prose is not a heading", () => {
    const t = parseDocumentTree("The Borrower paid 2.50 Million Dollars\n\nHave a nice day said nobody in this agreement.\n");
    expect(t.nodes.filter((n) => n.kind === "SECTION")).toHaveLength(0);
  });
});
