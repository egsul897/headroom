/** Reviewer items: "so long as no Default" is not a negation; "Payment Conditions" gates an unlimited grant. */
import { describe, expect, it } from "vitest";
import { unlimitedCapacityMatch } from "@/lib/contract-model/covenant-computation/baskets";

describe("unlimited grants and their conditions", () => {
  it("'so long as no Default ... exists' before the grant is not NEGATED", () => {
    expect(unlimitedCapacityMatch("so long as no Default or Event of Default has occurred and is continuing, the Borrower may make Restricted Payments in an unlimited amount").kind).not.toBe("NEGATED");
  });
  it("a real negation stays NEGATED", () => {
    expect(unlimitedCapacityMatch("nothing herein shall permit the Borrower to make Investments in an unlimited amount").kind).toBe("NEGATED");
  });
  it("'so long as the Payment Conditions are satisfied' is never UNCONDITIONAL (before or after the grant)", () => {
    expect(unlimitedCapacityMatch("Restricted Payments in an unlimited amount so long as the Payment Conditions are satisfied").kind).toBe("CONDITIONAL");
    expect(unlimitedCapacityMatch("if the Payment Conditions are satisfied, Restricted Payments in an unlimited amount").kind).toBe("CONDITIONAL");
  });
});
