import { describe, expect, it } from "vitest";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";

describe("covenant summaries", () => {
  it("builds category summaries without promoting legal truth", () => {
    const summary = buildDocumentCovenantSummary({
      sourceId: "test:doc",
      documentTitle: "Test Credit Agreement",
      issuerCik: "0000000001",
      documentClass: "CREDIT_AGREEMENT",
      candidates: [
        {
          candidateId: "c1",
          sourceId: "test:doc",
          nodeId: "n1",
          families: ["RESTRICTED_PAYMENTS"],
          signals: [],
          excerpt: "The Borrower shall not declare or pay any Restricted Payment...",
          representationLevel: "DISCOVERED_CANDIDATE",
          discoveryScore: 8,
        },
      ],
      definitions: [
        {
          term: "Restricted Payment",
          sourceId: "test:doc",
          charStart: 0,
          charEnd: 10,
          excerpt: "Restricted Payment means...",
        },
      ],
      structuralNodes: [
        {
          nodeId: "n1",
          sourceId: "test:doc",
          nodeType: "SECTION",
          sectionRef: "§7.06",
          heading: "Restricted Payments",
          charStart: 0,
          charEnd: 200,
          ambiguous: false,
        },
      ],
    });
    expect(summary.promotedToLegalTruth).toBe(0);
    expect(summary.items[0]!.category).toBe("RESTRICTED_PAYMENTS_INVESTMENTS");
    expect(summary.items[0]!.sourceCitation).toContain("§7.06");
    expect(summary.items[0]!.epistemicStatus).toBe("DISCOVERED_CANDIDATE");
  });
});
