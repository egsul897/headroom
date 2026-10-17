/**
 * Rule 26 — a lone amendment-type document is not SINGLE_DOCUMENT.
 *
 * analyzeAmendmentPackage resolved ANY single-document package as
 * SINGLE_DOCUMENT — including a lone AMENDMENT / WAIVER / CONSENT /
 * SUPPLEMENTAL_INDENTURE, which by class amends a base agreement
 * that is NOT in the package. SINGLE_DOCUMENT bypasses the
 * unresolved-precedence guards (covenant-review, CFO workflow),
 * so the amendment's language was treated as the operative
 * package even though the thing it amends is missing. A lone
 * amendment-type doc must resolve UNRESOLVED_PRECEDENCE (missing
 * base). A lone RESTATEMENT stays SINGLE_DOCUMENT — a restatement
 * IS the full agreement and stands alone.
 */
import { describe, expect, it } from "vitest";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

function source(sourceId: string, documentClass: string): KnowledgeSourceRecord {
  return {
    sourceId,
    documentClass,
    documentTitle: `${documentClass} document`,
  } as unknown as KnowledgeSourceRecord;
}

describe("lone amendment-type document", () => {
  it("lone AMENDMENT resolves UNRESOLVED_PRECEDENCE (missing base)", () => {
    const out = analyzeAmendmentPackage({
      companyId: "c1",
      sources: [source("s1", "AMENDMENT")],
      relationships: [],
    });
    expect(out.operativeResolution).toBe("UNRESOLVED_PRECEDENCE");
    expect(out.unresolvedReasons.join(" ")).toMatch(/base/i);
  });

  it("lone WAIVER resolves UNRESOLVED_PRECEDENCE (missing base)", () => {
    const out = analyzeAmendmentPackage({
      companyId: "c1",
      sources: [source("s1", "WAIVER")],
      relationships: [],
    });
    expect(out.operativeResolution).toBe("UNRESOLVED_PRECEDENCE");
  });

  it("lone RESTATEMENT stays SINGLE_DOCUMENT (it is the full agreement)", () => {
    const out = analyzeAmendmentPackage({
      companyId: "c1",
      sources: [source("s1", "RESTATEMENT")],
      relationships: [],
    });
    expect(out.operativeResolution).toBe("SINGLE_DOCUMENT");
  });

  it("lone CREDIT_AGREEMENT stays SINGLE_DOCUMENT", () => {
    const out = analyzeAmendmentPackage({
      companyId: "c1",
      sources: [source("s1", "CREDIT_AGREEMENT")],
      relationships: [],
    });
    expect(out.operativeResolution).toBe("SINGLE_DOCUMENT");
  });
});
