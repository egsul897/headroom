import { describe, expect, it } from "vitest";
import { extractBasketClauses } from "@/lib/contract-model/covenant-computation/extract-baskets";

describe("a covenant section's last clause stops at the next sibling section", () => {
  it("6.12 (j) does not absorb 6.13", () => {
    const text = "ARTICLE VI COVENANTS. 6.12 Liens . The Borrower will not create, incur or suffer to exist any Lien in, of or on its property, except: (a) Liens for taxes not yet due and payable; and (b) Liens filed in connection with the construction of the headquarters in an aggregate amount not in excess of $100,000,000. 6.13 Affiliates . The Borrower will not enter into any transaction with any Affiliate except upon fair and reasonable terms no less favorable than an arm’s length transaction. 6.14 Sanctions . The Borrower will not use the proceeds of any Advance in violation of Sanctions.";
    const clauses = extractBasketClauses({ documentId: "d", text } as any);
    const b = clauses.find((c) => c.operativeText.includes("$100,000,000"))!;
    expect(b).toBeTruthy();
    expect(b.operativeText).not.toMatch(/6\.13|Affiliates|Sanctions/);
  });
});
