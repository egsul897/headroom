/**
 * Rule 51 — an "Amendment ... to [the Amended and Restated
 * ...]" is an AMENDMENT, not a REPLACEMENT.
 *
 * The old title test matched "amended and restated" anywhere,
 * so "Amendment No. 1 to the Amended and Restated Credit
 * Agreement" got a REPLACED signal — but the title describes
 * the BASE, not the document. Only a document that IS the
 * restatement ("Amended and Restated Credit Agreement",
 * "Amendment and Restatement") gets REPLACED.
 */
import { describe, expect, it } from "vitest";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";

function src(sourceId: string, documentTitle: string, documentClass: string) {
  return { sourceId, documentTitle, documentClass } as never;
}

describe("analyzeAmendmentPackage restatement signals", () => {
  it("labels 'Amendment No. 1 to the Amended and Restated ...' as AMENDED", () => {
    const pkg = analyzeAmendmentPackage({
      companyId: "co",
      sources: [
        src("base", "Credit Agreement", "CREDIT_AGREEMENT"),
        src("amd", "Amendment No. 1 to the Amended and Restated Credit Agreement", "AMENDMENT"),
      ],
      relationships: [],
    });
    const kinds = pkg.provisionChangeSignals.map((s) => s.kind);
    expect(kinds).toContain("AMENDED");
    expect(kinds).not.toContain("REPLACED");
  });

  it("labels 'First Amendment to Amended and Restated ...' as AMENDED", () => {
    const pkg = analyzeAmendmentPackage({
      companyId: "co",
      sources: [
        src("base", "Credit Agreement", "CREDIT_AGREEMENT"),
        src("amd", "First Amendment to Amended and Restated Credit Agreement", "AMENDMENT"),
      ],
      relationships: [],
    });
    expect(pkg.provisionChangeSignals.map((s) => s.kind)).toContain("AMENDED");
  });

  it("still labels 'Amended and Restated Credit Agreement' as REPLACED", () => {
    const pkg = analyzeAmendmentPackage({
      companyId: "co",
      sources: [
        src("base", "Credit Agreement", "CREDIT_AGREEMENT"),
        src("rest", "Amended and Restated Credit Agreement", "RESTATEMENT"),
      ],
      relationships: [],
    });
    expect(pkg.provisionChangeSignals.map((s) => s.kind)).toContain("REPLACED");
  });

  it("still labels 'Amendment and Restatement' as REPLACED", () => {
    const pkg = analyzeAmendmentPackage({
      companyId: "co",
      sources: [
        src("base", "Credit Agreement", "CREDIT_AGREEMENT"),
        src("rest", "Amendment and Restatement Agreement", "RESTATEMENT"),
      ],
      relationships: [],
    });
    expect(pkg.provisionChangeSignals.map((s) => s.kind)).toContain("REPLACED");
  });
});
