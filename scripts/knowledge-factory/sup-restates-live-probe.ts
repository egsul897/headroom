/**
 * Live KF relationship discovery for Superior RESTATES gap.
 * Demonstrates discoverDocumentRelationships on fixture identities.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { discoverDocumentRelationships } from "../../lib/knowledge-factory/relationships/discover";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

function src(partial: Partial<KnowledgeSourceRecord> & Pick<KnowledgeSourceRecord, "sourceId" | "documentClass" | "documentTitle">): KnowledgeSourceRecord {
  return {
    issuerCik: "0000898293",
    issuerTicker: "SUP",
    issuerName: "Superior Industries International, Inc.",
    accessionNumber: "fixture",
    exhibitFilename: "fixture.htm",
    sourceUrl: "fixture://sup",
    filingDate: "2024-08-14",
    formType: "8-K",
    originalBytesHash: partial.sourceId,
    acquisitionTimestamp: new Date().toISOString(),
    parserVersion: "probe",
    extractionStatus: "CANDIDATES_DISCOVERED",
    representationLevel: "DISCOVERED_CANDIDATE",
    provenance: "fixture-internal",
    usageRightsReviewStatus: "FIXTURE_INTERNAL",
    ...partial,
  };
}

function main() {
  const docA = src({
    sourceId: "sup-doc-a",
    documentClass: "TERM_LOAN_AGREEMENT",
    documentTitle: "Term Loan Credit Agreement Dated as of December 15, 2022",
    filingDate: "2022-12-15",
  });
  const docB = src({
    sourceId: "sup-doc-b",
    documentClass: "RESTATEMENT",
    documentTitle:
      "$520,000,000 AMENDED AND RESTATED CREDIT AGREEMENT Dated as of August 14, 2024 — amend and restate that certain Credit Agreement, dated as of December 15, 2022",
    filingDate: "2024-08-14",
  });
  const docC = src({
    sourceId: "sup-doc-c",
    documentClass: "AMENDMENT",
    documentTitle: "FIRST AMENDMENT TO AMENDED AND RESTATED CREDIT AGREEMENT dated as of March 31, 2025",
    filingDate: "2025-03-31",
  });

  const edges = discoverDocumentRelationships([docA, docB, docC]);
  const restates = edges.find(
    (e) => e.kind === "AGREEMENT_RESTATEMENT" && e.sourceId === "sup-doc-b" && e.targetId === "sup-doc-a",
  );
  const amends = edges.find(
    (e) => e.kind === "AGREEMENT_AMENDMENT" && e.sourceId === "sup-doc-c" && e.targetId === "sup-doc-b",
  );

  const prediction = {
    restates: restates
      ? { relationship: "doc-b RESTATES doc-a", status: "resolved", evidenceStatus: restates.evidenceStatus, rationale: restates.rationale }
      : { relationship: "NONE", status: "missing" },
    amends: amends
      ? { relationship: "doc-c AMENDS doc-b", status: "review_required", evidenceStatus: amends.evidenceStatus, rationale: amends.rationale }
      : { relationship: "NONE", status: "missing" },
    allEdges: edges,
  };

  const outDir = path.resolve("docs/intelligence-factory/cycle-3");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "sup-restates-live-probe.json"), JSON.stringify(prediction, null, 2));
  console.log(JSON.stringify({ restatesFound: Boolean(restates), amendsFound: Boolean(amends), edgeCount: edges.length }, null, 2));
}

main();
