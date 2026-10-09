import { describe, expect, it } from "vitest";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

function cand(
  partial: Partial<CovenantCandidateRecord> & Pick<CovenantCandidateRecord, "families" | "excerpt">,
): CovenantCandidateRecord {
  return {
    candidateId: "c1",
    sourceId: "fixture:posture",
    nodeId: "n1",
    signals: [],
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 8,
    ...partial,
  };
}

describe("negative covenant posture", () => {
  it("treats TOC-contaminated Restricted Payments headings as GENERAL_PROHIBITION", () => {
    const analysis = analyzeProvision({
      sourceId: "fixture:posture",
      documentTitle: "Test",
      candidate: cand({
        families: ["RESTRICTED_PAYMENTS"],
        excerpt: "125\n\nSection 7.07 Transactions with Affiliates …",
      }),
      definitions: [],
      structuralNodes: [
        {
          nodeId: "n1",
          sourceId: "fixture:posture",
          nodeType: "SECTION",
          sectionRef: "7.06",
          heading: "Section 7.06 Restricted Payments 125",
          charStart: 0,
          charEnd: 80,
          ambiguous: false,
        },
      ],
    });
    expect(analysis.posture).toBe("GENERAL_PROHIBITION");
    expect(analysis.category).toBe("RESTRICTED_PAYMENTS_INVESTMENTS");
  });

  it("treats Indebtedness section headings as GENERAL_PROHIBITION", () => {
    const analysis = analyzeProvision({
      sourceId: "fixture:posture",
      documentTitle: "Test",
      candidate: cand({
        families: ["INDEBTEDNESS"],
        excerpt: "except as permitted below: (a) Indebtedness under this Agreement…",
      }),
      definitions: [],
      structuralNodes: [
        {
          nodeId: "n1",
          sourceId: "fixture:posture",
          nodeType: "SECTION",
          sectionRef: "7.03",
          heading: "Indebtedness",
          charStart: 0,
          charEnd: 80,
          ambiguous: false,
        },
      ],
    });
    expect(analysis.posture).toBe("GENERAL_PROHIBITION");
  });
});
