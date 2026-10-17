/**
 * Rule 62 — the legacy repayment override must fire only when
 * repayment IS the transaction.
 *
 * The old code matched /repay|prepay|pay down/ anywhere, so
 * "Can we incur $50M secured debt to repay existing notes?"
 * simulated as DEBT_REPAYMENT — the wrong direction
 * (repayment frees capacity; incurrence consumes it) and the
 * repayment branch skips restriction evaluation. When the
 * question describes raising new capital, repayment is the
 * use of proceeds and the draft kind is the transaction.
 */
import { describe, expect, it } from "vitest";
import { legacyKindFromQuestion } from "../../lib/product/north-star-workflow/legacy-kind";

describe("legacyKindFromQuestion", () => {
  it("pure repayment stays DEBT_REPAYMENT", () => {
    expect(legacyKindFromQuestion("Can we repay $50M of debt?", "UNSECURED_DEBT")).toBe("DEBT_REPAYMENT");
  });

  it("prepay stays DEBT_REPAYMENT", () => {
    expect(legacyKindFromQuestion("Can we prepay the term loan?", "UNSECURED_DEBT")).toBe("DEBT_REPAYMENT");
  });

  it("incurrence-to-repay simulates the incurrence, not the repayment", () => {
    expect(
      legacyKindFromQuestion("Can we incur $50M secured debt to repay existing notes?", "SECURED_DEBT"),
    ).toBe("SECURED_DEBT");
  });

  it("raise-to-repay simulates the raise, not the repayment", () => {
    expect(
      legacyKindFromQuestion("Can we raise $50M to repay the revolver?", "UNSECURED_DEBT"),
    ).toBe("UNSECURED_DEBT");
  });

  it("repay-with-a-new-loan simulates the new loan", () => {
    expect(
      legacyKindFromQuestion("Can we repay $50M of debt with a new loan?", "UNSECURED_DEBT"),
    ).toBe("UNSECURED_DEBT");
  });

  it("dividend is unaffected", () => {
    expect(
      legacyKindFromQuestion("Can we pay a $50M dividend?", "RESTRICTED_PAYMENT"),
    ).toBe("RESTRICTED_PAYMENT");
  });

  it("unknown draft kind with no repayment/equity signal returns null", () => {
    expect(legacyKindFromQuestion("What are our covenants?", "UNKNOWN")).toBeNull();
  });
});
