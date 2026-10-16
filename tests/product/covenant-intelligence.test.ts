import { describe, expect, it } from "vitest";
import { buildDocumentCovenantSummary, summaryCapDisclosure } from "../../lib/product/covenant-intelligence/summarize";

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

describe("rule 159: capped summaries disclose the cap", () => {
  it("returns null when nothing was capped", () => {
    expect(summaryCapDisclosure({ truncated: false, totalItemsBeforeCap: 5, items: [1, 2, 3, 4, 5] })).toBeNull();
  });

  it("names the capped count, the total, and the dropped count", () => {
    const note = summaryCapDisclosure({
      truncated: true,
      totalItemsBeforeCap: 150,
      items: new Array(120).fill(null),
    });
    expect(note).toMatch(/capped at 120 of 150/i);
    expect(note).toMatch(/30 items were not included/i);
    expect(note).toMatch(/counts .* reflect all 150/i);
  });

  it("a 130-candidate document produces a disclosable capped summary", () => {
    const candidates = Array.from({ length: 130 }, (_, i) => ({
      candidateId: `c${i}`,
      sourceId: "test:doc",
      nodeId: `n${i}`,
      families: ["RESTRICTED_PAYMENTS"],
      signals: [] as string[],
      excerpt: "The Borrower shall not declare or pay any Restricted Payment...",
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 8,
    }));
    const structuralNodes = candidates.map((c, i) => ({
      nodeId: `n${i}`,
      sourceId: "test:doc",
      nodeType: "SECTION",
      sectionRef: `§7.${String(i + 1).padStart(2, "0")}`,
      heading: "Restricted Payments",
      charStart: 0,
      charEnd: 200,
    }));
    const summary = buildDocumentCovenantSummary({
      sourceId: "test:doc",
      documentTitle: "Test Credit Agreement",
      issuerCik: "0000000001",
      documentClass: "CREDIT_AGREEMENT",
      candidates,
      definitions: [],
      structuralNodes,
    });
    expect(summary.truncated).toBe(true);
    expect(summary.totalItemsBeforeCap).toBe(130);
    expect(summary.items).toHaveLength(120);
    expect(summaryCapDisclosure(summary)).toMatch(/capped at 120 of 130/i);
  });
});

describe("rule 157: summaries from ambiguous structure disclose it", () => {
  const build = (ambiguous: boolean) =>
    buildDocumentCovenantSummary({
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
      definitions: [],
      structuralNodes: [
        {
          nodeId: "n1",
          sourceId: "test:doc",
          nodeType: "SECTION",
          sectionRef: "§7.06",
          heading: "Restricted Payments",
          charStart: 0,
          charEnd: 200,
          ambiguous,
        },
      ],
    });

  it("flags ambiguity in unresolved questions when the source node is ambiguous", () => {
    const summary = build(true);
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.unresolvedQuestions.join(" ")).toMatch(
      /flagged ambiguous during parsing/i,
    );
  });

  it("does not flag ambiguity when the source node is not ambiguous", () => {
    const summary = build(false);
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]!.unresolvedQuestions.join(" ")).not.toMatch(/ambiguous/i);
  });
});
