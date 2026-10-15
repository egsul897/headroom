/**
 * Rule 10 — the operative resolver must not override package-level
 * fail-closed signals, and a restatement must evidence it restates
 * THE SAME agreement as the base.
 *
 * Holes found in resolveOperativePrecedence (fail-before behavior):
 *  (a) A restatement titled "Amended and Restated Credit Agreement"
 *      superseded a base INDENTURE — different instruments — with
 *      no evidence they concern the same agreement. The resolver
 *      never checked that the restatement relates to the base.
 *  (b) The RESOLVED returns reset unresolvedReasons to [], discarding
 *      the package-level UNRESOLVED reasons (e.g. rule 8's
 *      unclassified-sibling reason). A package with base +
 *      restatement + UNKNOWN sibling resolved to RESOLVED.
 *  (c) The second restatement path used Array.find (first match in
 *      sourceId order) when multiple restatements existed, silently
 *      picking one instead of flagging the sequencing conflict.
 */
import { describe, expect, it } from "vitest";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";
import { compareAmendmentSummaries } from "../../lib/product/customer-intelligence/amendment-compare";
import { resolveOperativePrecedence } from "../../lib/product/customer-intelligence/operative-resolution";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

function src(
  sourceId: string,
  documentClass: string,
  documentTitle: string,
  filingDate = "2024-01-01",
): KnowledgeSourceRecord {
  return {
    sourceId,
    issuerCik: "0000000000",
    accessionNumber: "acc",
    exhibitFilename: `${sourceId}.txt`,
    sourceUrl: `fixture://${sourceId}`,
    filingDate,
    formType: "UPLOAD",
    documentTitle,
    documentClass: documentClass as KnowledgeSourceRecord["documentClass"],
    originalBytesHash: "hash",
    acquisitionTimestamp: "2024-01-01T00:00:00.000Z",
    parserVersion: "test",
    extractionStatus: "CANDIDATES_DISCOVERED",
    representationLevel: "DISCOVERED_CANDIDATE",
    provenance: "customer-upload",
    usageRightsReviewStatus: "UNREVIEWED",
  };
}

describe("operative resolution fail-closed gates", () => {
  it("restatement of a DIFFERENT instrument does not supersede the base", () => {
    const sources = [
      src("base-ind", "INDENTURE", "Indenture", "2022-01-15"),
      src("restated-ca", "RESTATEMENT", "Amended and Restated Credit Agreement", "2024-06-01"),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const compare = compareAmendmentSummaries({ amendmentPackage: ap, items: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare });
    expect(op.status).toBe("UNRESOLVED_PRECEDENCE");
    expect(op.unresolvedReasons.join(" ")).toMatch(/different instrument/i);
  });

  it("unclassified sibling blocks restatement RESOLVED at the resolver", () => {
    const sources = [
      src("base-ca", "CREDIT_AGREEMENT", "Credit Agreement", "2022-01-15"),
      src("restated", "RESTATEMENT", "Amended and Restated Credit Agreement", "2024-06-01"),
      src("mystery", "UNKNOWN", "Exhibit 10.1", "2024-02-01"),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const compare = compareAmendmentSummaries({ amendmentPackage: ap, items: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare });
    expect(op.status).toBe("UNRESOLVED_PRECEDENCE");
    expect(op.unresolvedReasons.join(" ")).toMatch(/unclassified/i);
  });

  it("multiple restatements do not silently pick one", () => {
    const sources = [
      src("base-ca", "CREDIT_AGREEMENT", "Credit Agreement", "2022-01-15"),
      src("rest1", "RESTATEMENT", "Amended and Restated Credit Agreement", "2024-06-01"),
      src("rest2", "AMENDMENT", "Second Amended and Restated Credit Agreement", "2025-01-01"),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const compare = compareAmendmentSummaries({ amendmentPackage: ap, items: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare });
    expect(op.status).toBe("UNRESOLVED_PRECEDENCE");
    expect(op.unresolvedReasons.join(" ")).toMatch(/multiple restatement/i);
  });

  it("same-instrument restatement still resolves", () => {
    const sources = [
      src("base-ca", "CREDIT_AGREEMENT", "Credit Agreement", "2022-01-15"),
      src("restated", "RESTATEMENT", "Amended and Restated Credit Agreement", "2024-06-01"),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const compare = compareAmendmentSummaries({ amendmentPackage: ap, items: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare });
    expect(op.status).toBe("RESOLVED");
    expect(op.operativeDocumentSourceId).toBe("restated");
  });
});
