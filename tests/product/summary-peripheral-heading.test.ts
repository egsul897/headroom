/**
 * Rule 68 — peripheral demotion tests the HEADING, not the excerpt.
 *
 * The summary ranking demoted candidates whose EXCERPT matched
 * a peripheral regex (notice / governing law / expenses /
 * successors / ...). A substantive covenant merely MENTIONING
 * one of those words — nearly every merger covenant says
 * "successors and assigns" — was demoted into the peripheral
 * bucket and could be cut by the 120-item cap while
 * lower-scored peripheral items survived. The heading is the
 * section's identity; a mention inside the text is not.
 */
import { describe, expect, it } from "vitest";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import type {
  CovenantCandidateRecord,
  StructuralNodeRecord,
} from "../../lib/knowledge-factory/types";

function node(nodeId: string, sectionRef: string, heading: string): StructuralNodeRecord {
  return { nodeId, sourceId: "s1", nodeType: "SECTION", sectionRef, heading, charStart: 0, charEnd: 100 };
}

function candidate(
  candidateId: string,
  nodeId: string,
  excerpt: string,
  discoveryScore: number,
  families: CovenantCandidateRecord["families"] = [],
): CovenantCandidateRecord {
  return {
    candidateId,
    sourceId: "s1",
    nodeId,
    families,
    signals: [],
    excerpt,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore,
  };
}

describe("summary peripheral demotion by heading", () => {
  it("a merger covenant mentioning successors survives the cap over lower-scored fillers", () => {
    const merger = candidate(
      "c-merger",
      "n-merger",
      "The Company shall not merge with another Person. This Section binds the Company and its successors and assigns.",
      0.95,
      ["FUNDAMENTAL_CHANGES"],
    );
    const fillers = Array.from({ length: 120 }, (_, i) =>
      candidate(
        `c-filler-${i}`,
        `n-filler-${i}`,
        "The Company shall not incur Indebtedness except as permitted.",
        0.5,
        ["INDEBTEDNESS"],
      ),
    );
    const nodes = [
      node("n-merger", "5.01", "Merger, Consolidation or Sale of Assets"),
      ...Array.from({ length: 120 }, (_, i) => node(`n-filler-${i}`, `6.${String(i + 1).padStart(2, "0")}`, "Limitation on Indebtedness")),
    ];
    const summary = buildDocumentCovenantSummary({
      sourceId: "s1",
      documentTitle: "Test Indenture",
      issuerCik: "0000000000",
      documentClass: "INDENTURE",
      candidates: [merger, ...fillers],
      definitions: [],
      structuralNodes: nodes,
    });
    expect(summary.truncated).toBe(true);
    expect(summary.totalItemsBeforeCap).toBe(121);
    expect(summary.items.some((i) => i.heading === "Merger, Consolidation or Sale of Assets")).toBe(true);
  });

  it("a genuinely peripheral section is still demoted below substantive ones", () => {
    const misc = candidate(
      "c-misc",
      "n-misc",
      "This Agreement may be executed in counterparts.",
      0.95,
    );
    const debt = candidate(
      "c-debt",
      "n-debt",
      "The Company shall not incur Indebtedness except as permitted.",
      0.5,
      ["INDEBTEDNESS"],
    );
    // 120 fillers push the total over the cap; the peripheral
    // Miscellaneous section (highest score, but peripheral
    // heading) must be the one cut.
    const fillers = Array.from({ length: 119 }, (_, i) =>
      candidate(`c-filler-${i}`, `n-filler-${i}`, "The Company shall not incur Indebtedness.", 0.4, ["INDEBTEDNESS"]),
    );
    const nodes = [
      node("n-misc", "9.01", "Miscellaneous"),
      node("n-debt", "6.01", "Limitation on Indebtedness"),
      ...Array.from({ length: 119 }, (_, i) => node(`n-filler-${i}`, `6.${String(i + 2).padStart(2, "0")}`, "Limitation on Indebtedness")),
    ];
    const summary = buildDocumentCovenantSummary({
      sourceId: "s1",
      documentTitle: "Test Indenture",
      issuerCik: "0000000000",
      documentClass: "INDENTURE",
      candidates: [misc, debt, ...fillers],
      definitions: [],
      structuralNodes: nodes,
    });
    expect(summary.truncated).toBe(true);
    expect(summary.items.some((i) => i.heading === "Miscellaneous")).toBe(false);
    expect(summary.items.some((i) => i.sectionRef === "6.01")).toBe(true);
  });
});
