/**
 * Rule 8 — an UNCLASSIFIED sibling must block RESOLVED. Before this
 * rule, analyzeAmendmentPackage fell through to RESOLVED for "exactly
 * one base + other docs + no amendments + no edges" — even when the
 * other doc was UNKNOWN or OTHER_DEBT_RELATED, i.e. its relationship
 * to the base was by definition unknown. That contradicts the
 * module's own promise: "Surfaces unresolved precedence instead of
 * silently selecting a version." A classified, non-amending sibling
 * (e.g. SECURITY_AGREEMENT) still leaves the package RESOLVED.
 */
import { describe, expect, it } from "vitest";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

function src(sourceId: string, documentClass: string, documentTitle: string): KnowledgeSourceRecord {
  return {
    sourceId,
    issuerCik: "0000000000",
    accessionNumber: "acc",
    exhibitFilename: `${sourceId}.txt`,
    sourceUrl: `fixture://${sourceId}`,
    filingDate: "2024-01-01",
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

describe("amendment package unclassified sibling", () => {
  it("base + UNKNOWN sibling is UNRESOLVED_PRECEDENCE, never silent RESOLVED", () => {
    const view = analyzeAmendmentPackage({
      companyId: "co-1",
      sources: [
        src("base", "INDENTURE", "Indenture"),
        src("mystery", "UNKNOWN", "Exhibit 10.1"),
      ],
      relationships: [],
    });
    expect(view.operativeResolution).toBe("UNRESOLVED_PRECEDENCE");
    expect(view.unresolvedReasons.join(" ")).toMatch(/unclassified/i);
    expect(view.provisionChangeSignals.some((s) => s.kind === "UNRESOLVED")).toBe(true);
  });

  it("base + OTHER_DEBT_RELATED sibling is UNRESOLVED_PRECEDENCE", () => {
    const view = analyzeAmendmentPackage({
      companyId: "co-1",
      sources: [
        src("base", "INDENTURE", "Indenture"),
        src("other", "OTHER_DEBT_RELATED", "Senior Notes due 2030"),
      ],
      relationships: [],
    });
    expect(view.operativeResolution).toBe("UNRESOLVED_PRECEDENCE");
  });

  it("base + classified non-amending sibling stays RESOLVED", () => {
    const view = analyzeAmendmentPackage({
      companyId: "co-1",
      sources: [
        src("base", "INDENTURE", "Indenture"),
        src("sec", "SECURITY_AGREEMENT", "Security Agreement"),
      ],
      relationships: [],
    });
    expect(view.operativeResolution).toBe("RESOLVED");
  });

  it("single base document stays SINGLE_DOCUMENT", () => {
    const view = analyzeAmendmentPackage({
      companyId: "co-1",
      sources: [src("base", "INDENTURE", "Indenture")],
      relationships: [],
    });
    expect(view.operativeResolution).toBe("SINGLE_DOCUMENT");
  });
});
