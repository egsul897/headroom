import { describe, expect, it } from "vitest";
import { learnedClauseFamily } from "@/lib/contract-model/covenant-computation/extract-baskets";

describe("prohibitions worded with payment nouns or passive incurrence", () => {
  it("'will not ... make any voluntary or optional payment or mandatory prepayment or redemption ... of any Subordinated Debt' is a prepayment restriction", () => {
    expect(learnedClauseFamily("(b) The Credit Parties will not, and will not permit any of their Subsidiaries to, make (or give any notice or offer in respect of) any voluntary or optional payment or mandatory prepayment or redemption or acquisition for value of any Subordinated Debt.")).toBe("PREPAYMENTS");
  });
  it("'shall not be permitted to incur additional Obligations' under an 'Additional Obligations' heading is a debt covenant", () => {
    expect(learnedClauseFamily("Section 3.2. Additional Obligations - General Provisions . Except for the initial Secured Indebtedness secured by the Obligation issued pursuant to Section 3.1 hereof, the Members shall not be permitted to incur additional Obligations unless, as of the date of incurrence, the conditions below are met.")).toBe("DEBT");
  });
  it("lending mechanics and a payment to lenders stay family-less", () => {
    expect(learnedClauseFamily("(c) The Borrower shall not make any voluntary prepayment of the Loans except upon three Business Days' notice to the Administrative Agent.")).toBeNull();
    expect(learnedClauseFamily("Section 2.05 Additional Obligations of Lenders . No Lender shall be permitted to incur additional Obligations to fund Loans other than its Commitment.")).toBeNull();
  });
});
