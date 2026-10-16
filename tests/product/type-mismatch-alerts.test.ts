/**
 * Rule 123 — monitoring feed must surface declared-vs-classified
 * document type mismatch.
 *
 * Rules 118–122 put the mismatch signal on the document pages,
 * the list, the review queue, the rulebook, and the covenants
 * page, but the monitoring feed — the surface a CFO checks for
 * "what needs attention" — was silent about it. The feed now
 * emits a TYPE_MISMATCH alert per mismatched document.
 */
import { describe, expect, it } from "vitest";
import { typeMismatchAlerts } from "../../lib/product/customer-intelligence/type-mismatch-alerts";

const doc = (over: Record<string, unknown> = {}) => ({
  filename: "Indenture.pdf",
  sourceId: "s1",
  declaredType: "INDENTURE",
  documentClass: "INDENTURE",
  ...over,
});

describe("typeMismatchAlerts", () => {
  it("is silent when declared and analyzed classes agree", () => {
    expect(typeMismatchAlerts([doc()])).toHaveLength(0);
  });

  it("is silent when the declared type is unknown", () => {
    expect(typeMismatchAlerts([doc({ declaredType: null })])).toHaveLength(0);
  });

  it("alerts on a declared-vs-analyzed mismatch, naming both values", () => {
    const alerts = typeMismatchAlerts([doc({ documentClass: "CREDIT_AGREEMENT" })]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("TYPE_MISMATCH");
    expect(alerts[0]?.severity).toBe("attention");
    expect(alerts[0]?.title).toContain("Indenture.pdf");
    expect(alerts[0]?.detail).toContain("Declared as INDENTURE");
    expect(alerts[0]?.detail).toContain("analysis classifies this document as CREDIT_AGREEMENT");
    expect(alerts[0]?.sourceRefs).toEqual(["s1"]);
  });

  it("alerts once per mismatched document", () => {
    const alerts = typeMismatchAlerts([
      doc({ sourceId: "s1", documentClass: "CREDIT_AGREEMENT" }),
      doc({ filename: "Amendment.pdf", sourceId: "s2", declaredType: "AMENDMENT", documentClass: "RESTATEMENT" }),
      doc({ filename: "Clean.pdf", sourceId: "s3" }),
    ]);
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.sourceRefs[0])).toEqual(["s1", "s2"]);
  });
});
