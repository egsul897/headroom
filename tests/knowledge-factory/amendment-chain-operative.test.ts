import { describe, expect, it } from "vitest";
import { discoverDocumentRelationships } from "../../lib/knowledge-factory/relationships/discover";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

function src(
  partial: Partial<KnowledgeSourceRecord> &
    Pick<KnowledgeSourceRecord, "sourceId" | "documentClass" | "documentTitle" | "filingDate">,
): KnowledgeSourceRecord {
  return {
    issuerCik: "0000898293",
    accessionNumber: "fixture",
    exhibitFilename: `${partial.sourceId}.htm`,
    sourceUrl: `fixture://${partial.sourceId}`,
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

/**
 * Effective-date selection over discovery edges: prefer the latest restatement/
 * amendment whose filingDate ≤ asOf. Discovery ≠ legal effectiveness — this
 * models the evaluation-date filter only.
 */
function selectOperativeAsOf(
  docs: KnowledgeSourceRecord[],
  edges: ReturnType<typeof discoverDocumentRelationships>,
  asOf: string,
): string {
  const asOfMs = Date.parse(asOf);
  const restatements = edges
    .filter((e) => e.kind === "AGREEMENT_RESTATEMENT")
    .map((e) => docs.find((d) => d.sourceId === e.sourceId)!)
    .filter((d) => d && Date.parse(d.filingDate) <= asOfMs)
    .sort((a, b) => Date.parse(b.filingDate) - Date.parse(a.filingDate));
  if (restatements[0]) return restatements[0].sourceId;

  const bases = docs
    .filter((d) =>
      ["CREDIT_AGREEMENT", "TERM_LOAN_AGREEMENT", "REVOLVING_CREDIT_AGREEMENT", "ABL_AGREEMENT"].includes(
        d.documentClass,
      ),
    )
    .filter((d) => Date.parse(d.filingDate) <= asOfMs)
    .sort((a, b) => Date.parse(b.filingDate) - Date.parse(a.filingDate));
  return bases[0]?.sourceId ?? docs[0]!.sourceId;
}

describe("multi-document amendment chains", () => {
  const docA = src({
    sourceId: "chain-a",
    documentClass: "TERM_LOAN_AGREEMENT",
    documentTitle: "Term Loan Credit Agreement Dated as of December 15, 2022",
    filingDate: "2022-12-15",
  });
  const docB = src({
    sourceId: "chain-b",
    documentClass: "RESTATEMENT",
    documentTitle: "Amended and Restated Credit Agreement Dated as of August 14, 2024",
    filingDate: "2024-08-14",
  });
  const docC = src({
    sourceId: "chain-c",
    documentClass: "AMENDMENT",
    documentTitle: "First Amendment to Amended and Restated Credit Agreement dated March 31, 2025",
    filingDate: "2025-03-31",
  });
  const docD = src({
    sourceId: "chain-d",
    documentClass: "AMENDMENT",
    documentTitle: "Second Amendment to Amended and Restated Credit Agreement dated June 1, 2026",
    filingDate: "2026-06-01",
  });

  it("discovers RESTATES and sequential AMENDS without self-links", () => {
    const edges = discoverDocumentRelationships([docA, docB, docC, docD]);
    expect(edges.every((e) => e.sourceId !== e.targetId)).toBe(true);
    expect(
      edges.some(
        (e) => e.kind === "AGREEMENT_RESTATEMENT" && e.sourceId === "chain-b" && e.targetId === "chain-a",
      ),
    ).toBe(true);
    expect(
      edges.some((e) => e.kind === "AGREEMENT_AMENDMENT" && e.sourceId === "chain-c" && e.targetId === "chain-b"),
    ).toBe(true);
    expect(
      edges.some((e) => e.kind === "AGREEMENT_AMENDMENT" && e.sourceId === "chain-d" && e.targetId === "chain-b"),
    ).toBe(true);
  });

  it("selects operative instrument by evaluation date (restatement supersedes original)", () => {
    const docs = [docA, docB, docC, docD];
    const edges = discoverDocumentRelationships(docs);
    expect(selectOperativeAsOf(docs, edges, "2023-06-01")).toBe("chain-a");
    expect(selectOperativeAsOf(docs, edges, "2024-09-01")).toBe("chain-b");
    expect(selectOperativeAsOf(docs, edges, "2026-07-01")).toBe("chain-b");
  });

  it("does not treat chronology alone as legal effectiveness in edge evidence", () => {
    const edges = discoverDocumentRelationships([docA, docB, docC]);
    for (const e of edges) {
      expect(e.evidenceStatus).toBe("DISCOVERED");
      expect(e.rationale).toMatch(/not a determination of legal effectiveness/i);
    }
  });
});
