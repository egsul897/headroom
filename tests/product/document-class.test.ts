/**
 * Rules 127–128 — the confirmed-type → analysis-class mapping is
 * shared by promotion (confirmed type becomes the class) and
 * re-analysis (a confirmed type survives re-analysis). One helper
 * so the two call sites cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import {
  documentClassFromConfirmedType,
  isUnclassifiedDocument,
  unclassifiedDocumentNote,
} from "../../lib/product/customer-intelligence/document-class";

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

describe("rule 160: unclassified documents say so", () => {
  it("UNKNOWN with no declared type is unclassified", () => {
    expect(isUnclassifiedDocument({ documentClass: "UNKNOWN", declaredType: null })).toBe(true);
    expect(isUnclassifiedDocument({ documentClass: "UNKNOWN", declaredType: undefined })).toBe(true);
  });

  it("a classified document is not unclassified", () => {
    expect(isUnclassifiedDocument({ documentClass: "INDENTURE", declaredType: null })).toBe(false);
    expect(isUnclassifiedDocument({ documentClass: "CREDIT_AGREEMENT", declaredType: "CREDIT_AGREEMENT" })).toBe(false);
  });

  it("UNKNOWN with a declared type is not unclassified (mismatch note covers it)", () => {
    expect(isUnclassifiedDocument({ documentClass: "UNKNOWN", declaredType: "OTHER" })).toBe(false);
  });

  it("the note tells the user to confirm the type and to treat summaries with care", () => {
    expect(unclassifiedDocumentNote()).toMatch(/unclassified/i);
    expect(unclassifiedDocumentNote()).toMatch(/confirm the type/i);
    expect(unclassifiedDocumentNote()).toMatch(/extra care/i);
  });
});
