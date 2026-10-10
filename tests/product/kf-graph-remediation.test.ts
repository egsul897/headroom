/**
 * KF graph remediation: SON operative fail-closed, agreement self-loops,
 * amendment-chain adversarial cases, provision discovery identity, Wilson CI.
 */
import { describe, expect, it } from "vitest";
import { discoverDocumentRelationships } from "../../lib/knowledge-factory/relationships/discover";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";
import {
  canResolveRestatementSupersession,
  hasSubstantiveInstrumentLanguage,
  isOpaqueExhibitLabel,
  resolveOperativePrecedence,
} from "../../lib/product/customer-intelligence/operative-resolution";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";
import {
  compareAmendmentSummaries,
  type AmendmentCompareView,
} from "../../lib/product/customer-intelligence/amendment-compare";
import {
  discoverProvisionEdgesFromItems,
  provisionEdgeDiscoveryId,
} from "../../lib/product/legal-reasoning/provision-graph";
import { wilsonScoreInterval } from "../../lib/knowledge-factory/quality-gate/unique-edge-metrics";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function baseSource(partial: Partial<KnowledgeSourceRecord> & { sourceId: string }): KnowledgeSourceRecord {
  return {
    sourceId: partial.sourceId,
    issuerCik: partial.issuerCik ?? "0000001234",
    issuerTicker: partial.issuerTicker ?? "TEST",
    accessionNumber: partial.accessionNumber ?? "0001",
    exhibitFilename: partial.exhibitFilename ?? "ex.htm",
    sourceUrl: partial.sourceUrl ?? "https://example.test",
    filingDate: partial.filingDate ?? "2023-01-01",
    formType: partial.formType ?? "8-K",
    documentTitle: partial.documentTitle ?? "Credit Agreement",
    documentClass: partial.documentClass ?? "CREDIT_AGREEMENT",
    originalBytesHash: partial.originalBytesHash ?? "h",
    acquisitionTimestamp: partial.acquisitionTimestamp ?? "2023-01-01T00:00:00.000Z",
    parserVersion: partial.parserVersion ?? "t",
    extractionStatus: partial.extractionStatus ?? "STRUCTURALLY_INDEXED",
    representationLevel: partial.representationLevel ?? "STRUCTURALLY_INDEXED",
    provenance: partial.provenance ?? "sec-edgar",
    usageRightsReviewStatus: partial.usageRightsReviewStatus ?? "PUBLIC_SEC_EDGAR",
    instrumentIdentity: partial.instrumentIdentity,
  };
}

const emptyCompare = (): AmendmentCompareView => ({
  operativeResolution: "UNRESOLVED_PRECEDENCE",
  rows: [],
  unresolvedReasons: ["stub"],
  note: "stub",
});

describe("opaque exhibit / SON operative fail-closed", () => {
  it("treats EX-10.1 as opaque exhibit label", () => {
    expect(isOpaqueExhibitLabel("EX-10.1")).toBe(true);
    expect(isOpaqueExhibitLabel("Exhibit 10.2")).toBe(true);
    expect(isOpaqueExhibitLabel("Amended and Restated Credit Agreement dated as of 2024-06-01")).toBe(
      false,
    );
    expect(hasSubstantiveInstrumentLanguage("EX-10.1")).toBe(false);
    expect(canResolveRestatementSupersession({ documentTitle: "EX-10.1", documentClass: "RESTATEMENT" }).ok).toBe(
      false,
    );
  });

  it("never resolves operative authority from exhibit label + RESTATEMENT class + filing date", () => {
    const sources = [
      baseSource({
        sourceId: "son-base",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement dated as of 2022-01-15",
        filingDate: "2022-01-15",
        issuerTicker: "SON",
      }),
      baseSource({
        sourceId: "son-ex",
        documentClass: "RESTATEMENT",
        documentTitle: "EX-10.1",
        exhibitFilename: "ex10-1.htm",
        filingDate: "2024-05-07",
        issuerTicker: "SON",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare: emptyCompare(),
    });
    expect(op.status).toBe("UNRESOLVED_PRECEDENCE");
    expect(op.operativeDocumentSourceId).toBeNull();
    expect(op.unresolvedReasons.some((r) => /opaque exhibit|class alone|insufficient/i.test(r))).toBe(
      true,
    );
  });

  it("still resolves substantive amended-and-restated titles", () => {
    const sources = [
      baseSource({
        sourceId: "base-ca",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement dated as of 2022-01-15",
        filingDate: "2022-01-15",
      }),
      baseSource({
        sourceId: "restated",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement dated as of 2024-06-01",
        filingDate: "2024-06-01",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare: emptyCompare(),
    });
    expect(op.status).toBe("RESOLVED");
    expect(op.operativeDocumentSourceId).toBe("restated");
  });
});

describe("agreement self-loops vs provision same-document endpoints", () => {
  it("does not emit AGREEMENT_RESTATEMENT self-loops when restatement is also a base class", () => {
    const restatement = baseSource({
      sourceId: "r1",
      documentClass: "RESTATEMENT",
      documentTitle: "Amended and Restated Credit Agreement",
      filingDate: "2024-01-01",
    });
    const rels = discoverDocumentRelationships([restatement]);
    expect(rels.filter((r) => r.sourceId === r.targetId)).toHaveLength(0);
    expect(rels.filter((r) => r.kind === "AGREEMENT_RESTATEMENT")).toHaveLength(0);
  });

  it("still links restatement to a distinct base", () => {
    const rels = discoverDocumentRelationships([
      baseSource({
        sourceId: "base",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement dated as of 2020-01-01",
      }),
      baseSource({
        sourceId: "rest",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement",
        filingDate: "2024-01-01",
      }),
    ]);
    const edge = rels.find((r) => r.kind === "AGREEMENT_RESTATEMENT");
    expect(edge).toBeTruthy();
    expect(edge!.sourceId).toBe("rest");
    expect(edge!.targetId).toBe("base");
  });

  it("permits provision same-document definition endpoints", () => {
    const items: Array<CovenantSummaryItem & { sourceId: string }> = [
      {
        sourceId: "doc1",
        sectionRef: "7.01",
        category: "DEBT_INCURRENCE",
        plainEnglish: "No Indebtedness except as permitted.",
        materialBasketsThresholds: [],
        applicableDefinitions: [{ term: "Indebtedness", resolved: true }],
        crossReferences: [],
        exceptions: [],
        conditions: [],
      } as never,
    ];
    const edges = discoverProvisionEdgesFromItems(items);
    expect(edges.some((e) => e.kind === "PROVISION_DEFINITION" && e.fromSourceId === e.toSourceId)).toBe(
      true,
    );
    const id = provisionEdgeDiscoveryId(edges[0]!);
    expect(id).toHaveLength(24);
    // Idempotent identity across rediscovery
    const edges2 = discoverProvisionEdgesFromItems(items);
    expect(provisionEdgeDiscoveryId(edges2[0]!)).toBe(id);
  });
});

describe("amendment-chain adversarial cases", () => {
  it("fail-closes when base agreement is missing", () => {
    const sources = [
      baseSource({
        sourceId: "amd-only",
        documentClass: "AMENDMENT",
        documentTitle: "First Amendment to Credit Agreement — Section 7.01 is hereby amended",
        filingDate: "2024-03-15",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare: emptyCompare(),
    });
    expect(["UNRESOLVED_PRECEDENCE", "NO_DOCUMENTS", "SINGLE_DOCUMENT"]).toContain(op.status);
    expect(op.operativeDocumentSourceId === null || op.status !== "RESOLVED").toBe(true);
  });

  it("fail-closes on ambiguous duplicate restatement filings", () => {
    const sources = [
      baseSource({
        sourceId: "base",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement",
        filingDate: "2020-01-01",
      }),
      baseSource({
        sourceId: "r-a",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement dated as of 2023-01-01",
        filingDate: "2023-01-01",
      }),
      baseSource({
        sourceId: "r-b",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement dated as of 2024-01-01",
        filingDate: "2024-01-01",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare: emptyCompare(),
    });
    // Multiple restatements without compare evidence → must not silently pick latest
    expect(op.status).not.toBe("RESOLVED");
  });

  it("fail-closes when restatement effective date precedes base", () => {
    const sources = [
      baseSource({
        sourceId: "base",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement dated as of 2024-06-01",
        filingDate: "2024-06-01",
      }),
      baseSource({
        sourceId: "rest",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement dated as of 2023-01-01",
        filingDate: "2023-01-01",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare: emptyCompare(),
    });
    expect(op.status).toBe("UNRESOLVED_PRECEDENCE");
  });

  it("fail-closes cross-document references without section-diff evidence", () => {
    const sources = [
      baseSource({
        sourceId: "base",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement",
        filingDate: "2023-01-01",
      }),
      baseSource({
        sourceId: "amd",
        documentClass: "AMENDMENT",
        documentTitle: "First Amendment to Credit Agreement",
        filingDate: "2024-03-15",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const compare = compareAmendmentSummaries({ amendmentPackage: ap, items: [] });
    const op = resolveOperativePrecedence({ sources, amendmentPackage: ap, compare });
    expect(op.status).toBe("UNRESOLVED_PRECEDENCE");
    expect(op.bindings).toHaveLength(0);
  });

  it("binds when explicit amendatory section language is present", () => {
    const sources = [
      baseSource({
        sourceId: "base",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement",
        filingDate: "2023-01-01",
      }),
      baseSource({
        sourceId: "amd",
        documentClass: "AMENDMENT",
        documentTitle: "First Amendment dated as of 2024-03-15 — Section 7.01 is hereby amended",
        filingDate: "2024-03-15",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "co", sources, relationships: [] });
    const op = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare: emptyCompare(),
    });
    expect(["RESOLVED", "RESOLVED_PARTIAL"]).toContain(op.status);
    expect(op.bindings.some((b) => b.sectionRef === "7.01")).toBe(true);
  });
});

describe("unique-edge confidence intervals", () => {
  it("computes wilson intervals in [0,1]", () => {
    const w = wilsonScoreInterval(18, 20);
    expect(w).not.toBeNull();
    expect(w!.low).toBeGreaterThan(0.6);
    expect(w!.high).toBeLessThanOrEqual(1);
    expect(wilsonScoreInterval(0, 0)).toBeNull();
  });
});

describe("provision rediscovery identity is stable (idempotent key)", () => {
  it("same inputs yield identical discoveryIds and filter to one edge", () => {
    const items: Array<CovenantSummaryItem & { sourceId: string }> = [
      {
        sourceId: "s1",
        sectionRef: "1.01",
        category: "OTHER",
        plainEnglish: "Definitions.",
        materialBasketsThresholds: [],
        applicableDefinitions: [
          { term: "Affiliate", resolved: true },
          { term: "Affiliate", resolved: true },
        ],
        crossReferences: [],
        exceptions: [],
        conditions: [],
      } as never,
    ];
    const a = discoverProvisionEdgesFromItems(items);
    const b = discoverProvisionEdgesFromItems(items);
    expect(a.map(provisionEdgeDiscoveryId).sort()).toEqual(b.map(provisionEdgeDiscoveryId).sort());
    // Internal dedupe collapsed duplicate term emissions
    expect(a.filter((e) => e.toTerm === "Affiliate")).toHaveLength(1);
  });
});
