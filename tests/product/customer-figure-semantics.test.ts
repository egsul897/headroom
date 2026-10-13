import { describe, expect, it } from "vitest";
import { classifyCustomerFigure } from "@/lib/product/north-star-workflow/customer-figure-semantics";

describe("customer figure semantics", () => {
  it("never presents gross, hypothetical, or legacy as available headroom", () => {
    for (const kind of [
      "GROSS_CONTRACTUAL_CAPACITY",
      "HYPOTHETICAL_SIMULATION",
      "LEGACY_ENGINE_CAPACITY",
      "REPORTED_FINANCIAL",
    ] as const) {
      const claim = classifyCustomerFigure({ kind, amount: 50_000_000, currency: "USD" });
      expect(claim.mayPresentAsAvailableHeadroom).toBe(false);
      expect(claim.kind).toBe(kind);
    }
  });

  it("downgrades verified remaining without completeness / trusted issuer", () => {
    const claim = classifyCustomerFigure({
      kind: "VERIFIED_REMAINING_CAPACITY",
      amount: 10,
      utilizationComplete: false,
      trustedIssuerActive: true,
      verifiedExecutionExecuted: true,
    });
    expect(claim.kind).toBe("UNSUPPORTED");
    expect(claim.amount).toBeNull();
    expect(claim.mayPresentAsAvailableHeadroom).toBe(false);
  });

  it("allows verified remaining only when all gates pass", () => {
    const claim = classifyCustomerFigure({
      kind: "VERIFIED_REMAINING_CAPACITY",
      amount: 12_000_000,
      currency: "USD",
      utilizationComplete: true,
      trustedIssuerActive: true,
      verifiedExecutionExecuted: true,
    });
    expect(claim.kind).toBe("VERIFIED_REMAINING_CAPACITY");
    expect(claim.mayPresentAsAvailableHeadroom).toBe(true);
  });

  it("refuses contractually derived without bound APPROVED snapshot", () => {
    const claim = classifyCustomerFigure({
      kind: "CONTRACTUALLY_DERIVED",
      amount: 3.5,
      approvedSnapshotBound: false,
    });
    expect(claim.kind).toBe("UNSUPPORTED");
    expect(claim.amount).toBeNull();
  });
});
