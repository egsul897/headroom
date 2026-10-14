/**
 * Builder sums are NEEDS_INPUT while any component is unbound: the fixed-dollar limb of "the sum of (1) 50% of CNI,
 * plus (2) 100% of Net Proceeds, plus (3) $200,000,000" must never be COMPUTED as a cap on its own.
 */
import { describe, expect, it } from "vitest";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";

const doc = (body: string) => `CREDIT AGREEMENT

ARTICLE VI
NEGATIVE COVENANTS

Section 6.06 Restricted Payments. The Borrower will not, and will not permit any Subsidiary to, declare or make any Restricted Payment, except:

(a) Restricted Payments made solely in Equity Interests of the Borrower;

${body}

(c) Restricted Payments to pay taxes of any parent entity attributable to the Borrower and its Subsidiaries.

Section 6.07 Transactions with Affiliates. The Borrower will not enter into any transaction with any Affiliate except on terms no less favorable than arm's-length terms.

ARTICLE VII
EVENTS OF DEFAULT

Section 7.01 Events of Default. If any of the following events shall occur: (a) the Borrower shall fail to pay any principal when due.
`;

const SUMS = [
  `(b) other Restricted Payments in an aggregate amount not to exceed the sum of:

(1) 50% of Consolidated Net Income for the period from the Closing Date to the end of the most recent fiscal quarter, plus

(2) 100% of the aggregate Net Cash Proceeds received by the Borrower from the issue or sale of its Equity Interests, plus

(3) $200,000,000;`,
  `(b) other Restricted Payments in an aggregate amount not to exceed (x) $200,000,000 plus (y) 50% of Consolidated Net Income plus (z) 100% of Net Proceeds of equity issuances;`,
];

describe("builder sums stay NEEDS_INPUT while any part is unbound", () => {
  for (const [i, body] of SUMS.entries()) {
    it(`sum form ${i + 1}: no basket is COMPUTED at $200,000,000 alone`, () => {
      const r = runAgreementPipeline({ sourceId: `t${i}`, text: doc(body) });
      const all = r.families.flatMap((f) => f.baskets);
      const limb = all.filter((b) => /not to exceed/.test(b.citation) || /200,000,000/.test(b.citation));
      expect(limb.length).toBeGreaterThan(0);
      expect(limb.map((b) => b.category)).toEqual(["BUILDER_AVAILABLE_AMOUNT"]);
      for (const b of all) expect(b.cap).not.toBe("200000000");
      for (const b of limb) {
        expect(b.capStatus, b.citation).not.toBe("COMPUTED");
        expect(b.cap).not.toBe("200000000");
      }
      for (const f of r.families) expect(f.outcome === "CAP_COMPUTED" && f.baskets.some((b) => /not to exceed/.test(b.citation))).toBe(false);
    });
  }
});
