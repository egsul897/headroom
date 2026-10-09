import { describe, expect, it } from "vitest";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import type { CovenantCandidateRecord, StructuralNodeRecord } from "../../lib/knowledge-factory/types";

function makeCand(
  i: number,
  family: string,
  sectionRef: string,
  heading: string,
): { candidate: CovenantCandidateRecord; node: StructuralNodeRecord } {
  const nodeId = `n${i}`;
  return {
    candidate: {
      candidateId: `c${i}`,
      sourceId: "fixture:balance",
      nodeId,
      families: [family as never],
      signals: [],
      excerpt: `shall not except as permitted. ${heading} basket $1,000,000.`,
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: 10,
    },
    node: {
      nodeId,
      sourceId: "fixture:balance",
      nodeType: "SECTION",
      sectionRef,
      heading,
      charStart: i * 10,
      charEnd: i * 10 + 8,
      ambiguous: false,
    },
  };
}

describe("summary category balance", () => {
  it("retains Restricted Payments items even when Indebtedness candidates dominate", () => {
    const pairs = [];
    for (let i = 0; i < 100; i++) {
      pairs.push(makeCand(i, "INDEBTEDNESS", `7.03(${i})`, `Debt basket ${i}`));
    }
    for (let i = 0; i < 5; i++) {
      pairs.push(
        makeCand(200 + i, "RESTRICTED_PAYMENTS", `7.06(${i})`, `Restricted Payments ${i}`),
      );
    }
    const summary = buildDocumentCovenantSummary({
      sourceId: "fixture:balance",
      documentTitle: "Balance Test",
      issuerCik: "0",
      documentClass: "CREDIT_AGREEMENT",
      candidates: pairs.map((p) => p.candidate),
      definitions: [],
      structuralNodes: pairs.map((p) => p.node),
    });
    expect(summary.items.length).toBeLessThanOrEqual(120);
    expect(
      summary.items.some(
        (i) =>
          i.category === "RESTRICTED_PAYMENTS_INVESTMENTS" ||
          /restricted\s+payments?/i.test(i.heading),
      ),
    ).toBe(true);
  });
});
