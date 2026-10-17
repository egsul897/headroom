/**
 * Rule 52 — the operative resolver must not treat an
 * "Amendment ... to [the Amended and Restated ...]" as a full
 * restatement.
 *
 * The resolver's bare /\brestate/ title test classified such
 * an amendment as a restatementSource and returned RESOLVED
 * with the amendment as the operative document and ZERO
 * section bindings — whole-agreement supersession from a
 * section-level amendment. It must now take the amendment
 * path (section bindings or UNRESOLVED_PRECEDENCE), never the
 * restatement-supersession path.
 */
import { describe, expect, it } from "vitest";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";
import { resolveOperativePrecedence } from "../../lib/product/customer-intelligence/operative-resolution";

describe("resolveOperativePrecedence amendment-to-restated", () => {
  it("does not resolve an amendment-to-restated doc as a restatement supersession", () => {
    const sources = [
      { sourceId: "base", documentTitle: "Credit Agreement", documentClass: "CREDIT_AGREEMENT", filingDate: "2020-01-01" },
      { sourceId: "amd", documentTitle: "Amendment No. 1 to the Amended and Restated Credit Agreement", documentClass: "AMENDMENT", filingDate: "2021-01-01" },
    ] as never;
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const view = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare: { operativeResolution: "UNRESOLVED_PRECEDENCE", rows: [], unresolvedReasons: [], note: "" } as never,
    });
    // Must NOT be whole-agreement restatement supersession.
    expect(view.operativeDocumentSourceId).not.toBe("amd");
    expect(view.status).toBe("UNRESOLVED_PRECEDENCE");
    expect(view.bindings).toEqual([]);
  });

  it("still supersedes on a true restatement title", () => {
    const sources = [
      { sourceId: "base", documentTitle: "Credit Agreement", documentClass: "CREDIT_AGREEMENT", filingDate: "2020-01-01" },
      { sourceId: "rest", documentTitle: "Amended and Restated Credit Agreement", documentClass: "RESTATEMENT", filingDate: "2021-01-01" },
    ] as never;
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const view = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare: { operativeResolution: "UNRESOLVED_PRECEDENCE", rows: [], unresolvedReasons: [], note: "" } as never,
    });
    expect(view.status).toBe("RESOLVED");
    expect(view.operativeDocumentSourceId).toBe("rest");
  });
});
