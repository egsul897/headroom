/**
 * Region boundaries: a covenant section ends at the next numbered heading even when that heading is not a covenant
 * (no "Section" word, later article); table-of-contents entries never open a covenant region.
 */
import { describe, expect, it } from "vitest";
import { extractBasketClauses } from "@/lib/contract-model/covenant-computation/extract-baskets";

const TOC = `TABLE OF CONTENTS
7.1 Limitation on Liens 61
7.2 Mergers, Consolidations and Sales of Assets 62
7.3 Margin Regulations 63
11.23 Incremental Revolving Credit Commitments 98
`;
const BODY = `ARTICLE 7 NEGATIVE COVENANTS

7.2     Mergers, Consolidations and Sales of Assets  .  IBM will not merge or consolidate with any Person, or sell all or substantially all of its assets, except that (a) any Subsidiary may merge into IBM and (b) IBM may merge with another Person if IBM is the surviving corporation.

7.3     Margin Regulations  .  No Borrower will use the proceeds of any Loan to purchase margin stock.

ARTICLE 11 MISCELLANEOUS

11.22     Binding Effect  .  This Agreement shall be binding upon each Borrower.

11.23     Incremental Revolving Credit Commitments  .  (a) IBM and any one or more Lenders may from time to time agree that such Lenders shall provide incremental Revolving Credit Commitments. (e) Notwithstanding anything to the contrary in this Section 11.23, (i) the aggregate amount of incremental Revolving Credit Commitments pursuant to this Section 11.23 shall not exceed $2,000,000,000 and (ii) no Lender shall be obligated to provide more than $500,000,000.
`;

describe("covenant region boundaries", () => {
  const clauses = extractBasketClauses({ documentId: "d", text: TOC + "\n" + BODY } as never);
  it("Article 11 text is never cited inside §7.2", () => {
    for (const c of clauses) if (/^§7\.2\b/.test(c.sectionRef ?? "")) expect(c.operativeText).not.toMatch(/Incremental|2,000,000,000|500,000,000/);
  });
  it("the incremental $2B/$500M commitment cap is not a FUNDAMENTAL_CHANGES basket, and appears at most once", () => {
    const inc = clauses.filter((c) => /2,000,000,000/.test(c.operativeText));
    expect(inc.filter((c) => /FUNDAMENTAL|MERGER/i.test(c.covenantFamily ?? ""))).toEqual([]);
    expect(inc.length).toBeLessThanOrEqual(1);
  });
  it("table-of-contents entries do not open regions", () => {
    for (const c of clauses) expect(c.operativeText).not.toMatch(/Margin Regulations 63/);
  });
});
