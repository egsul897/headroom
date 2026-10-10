import { describe, expect, it } from "vitest";
import { discoverDocumentRelationships } from "../../lib/knowledge-factory/relationships/discover";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

function src(
  partial: Partial<KnowledgeSourceRecord> &
    Pick<KnowledgeSourceRecord, "sourceId" | "documentClass" | "documentTitle">,
): KnowledgeSourceRecord {
  return {
    issuerCik: "0000898293",
    accessionNumber: "fixture",
    exhibitFilename: "fixture.htm",
    sourceUrl: "fixture://sup",
    filingDate: "2024-08-14",
    formType: "8-K",
    originalBytesHash: partial.sourceId,
    acquisitionTimestamp: new Date().toISOString(),
    parserVersion: "test",
    extractionStatus: "CANDIDATES_DISCOVERED",
    representationLevel: "DISCOVERED_CANDIDATE",
    provenance: "fixture-internal",
    usageRightsReviewStatus: "FIXTURE_INTERNAL",
    ...partial,
  };
}

describe("relationship discovery self-exclusion", () => {
  it("links RESTATEMENT to prior credit agreement, not to itself", () => {
    const edges = discoverDocumentRelationships([
      src({
        sourceId: "sup-doc-a",
        documentClass: "TERM_LOAN_AGREEMENT",
        documentTitle: "Term Loan Credit Agreement Dated as of December 15, 2022",
      }),
      src({
        sourceId: "sup-doc-b",
        documentClass: "RESTATEMENT",
        documentTitle: "AMENDED AND RESTATED CREDIT AGREEMENT Dated as of August 14, 2024",
      }),
    ]);
    expect(edges.some((e) => e.sourceId === e.targetId)).toBe(false);
    expect(
      edges.some(
        (e) =>
          e.kind === "AGREEMENT_RESTATEMENT" && e.sourceId === "sup-doc-b" && e.targetId === "sup-doc-a",
      ),
    ).toBe(true);
  });
});
