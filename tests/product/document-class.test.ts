/**
 * Rules 127–128 — the confirmed-type → analysis-class mapping is
 * shared by promotion (confirmed type becomes the class) and
 * re-analysis (a confirmed type survives re-analysis). One helper
 * so the two call sites cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import { documentClassFromConfirmedType } from "../../lib/product/customer-intelligence/document-class";

describe("documentClassFromConfirmedType", () => {
  it("maps the four financing-agreement types 1:1", () => {
    expect(documentClassFromConfirmedType("CREDIT_AGREEMENT")).toBe("CREDIT_AGREEMENT");
    expect(documentClassFromConfirmedType("INDENTURE")).toBe("INDENTURE");
    expect(documentClassFromConfirmedType("AMENDMENT")).toBe("AMENDMENT");
    expect(documentClassFromConfirmedType("INTERCREDITOR_AGREEMENT")).toBe("INTERCREDITOR_AGREEMENT");
  });

  it("maps non-class types to the catch-all", () => {
    expect(documentClassFromConfirmedType("OTHER")).toBe("OTHER_DEBT_RELATED");
    expect(documentClassFromConfirmedType("COMPLIANCE_CERTIFICATE")).toBe("OTHER_DEBT_RELATED");
  });
});
