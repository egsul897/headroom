import { describe, expect, it } from "vitest";
import { classifyCovenantFamily } from "@/lib/contract-model/section-tree/family-classifier";

const lead = "(a) The Borrower shall not, and shall not permit any Restricted Subsidiary to, pay or make, directly or indirectly, any Restricted Payment, except that: (i) the Borrower may make Restricted Payments in an amount not to exceed $10,000,000.";
describe("combined restricted-payment / debt-payment headings", () => {
  for (const title of ["Restricted Payments; Restricted Debt Payments", "Restricted Payments; Payments of Junior Debt"]) {
    it(`'${title}' credits PREPAYMENTS as well as RESTRICTED_PAYMENTS, and not DEBT`, () => {
      const v = classifyCovenantFamily({ title, leadIn: lead, covenantContext: true });
      expect(v.family).toBe("RESTRICTED_PAYMENTS");
      expect(v.families).toContain("PREPAYMENTS");
      expect(v.families).not.toContain("DEBT");
    });
  }
  it("a payment-mechanics heading is not a prepayment covenant", () => {
    const v = classifyCovenantFamily({ title: "Payments Generally; Pro Rata Treatment", leadIn: "(a) Each payment by the Borrower shall be made without setoff.", covenantContext: true });
    expect(v.families).not.toContain("PREPAYMENTS");
  });
});
