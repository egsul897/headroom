/**
 * Rule 38 — summary items must sort section refs numerically,
 * not lexicographically.
 *
 * buildDocumentCovenantSummary sorted items with plain
 * localeCompare on sectionRef: "10.01" < "6.02" < "6.10" < "9.01"
 * (Article 10 listed before Article 6). Every document page
 * listed sections out of document order. Numeric collation
 * restores document order: 6.02, 6.10, 9.01, 10.01.
 */
import { describe, expect, it } from "vitest";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import type { CovenantCandidateRecord, StructuralNodeRecord } from "../../lib/knowledge-factory/types";

function build(refs: string[]): string[] {
  const nodes: StructuralNodeRecord[] = refs.map((sectionRef, i) => ({
    nodeId: `n${i}`,
    sectionRef,
    heading: `Section ${sectionRef} Limitation on Indebtedness`,
  })) as unknown as StructuralNodeRecord[];
  const candidates: CovenantCandidateRecord[] = refs.map((_, i) => ({
    candidateId: `c${i}`,
    sourceId: "doc-1",
    nodeId: `n${i}`,
    families: ["DEBT_INCURRENCE"],
    signals: [],
    excerpt:
      "The Company shall not create, incur, assume or suffer to exist any Indebtedness except as permitted under this Section.",
    representationLevel: "SOURCE_BACKED",
    discoveryScore: 0.9,
  })) as unknown as CovenantCandidateRecord[];
  const summary = buildDocumentCovenantSummary({
    sourceId: "doc-1",
    documentTitle: "Credit Agreement",
    issuerCik: "0000000000",
    documentClass: "CREDIT_AGREEMENT",
    candidates,
    definitions: [],
    structuralNodes: nodes,
  });
  return summary.items.map((i) => i.sectionRef);
}

describe("summary section-ref ordering", () => {
  it("orders 6.02, 6.10, 9.01, 10.01 numerically (document order)", () => {
    expect(build(["10.01", "9.01", "6.10", "6.02"])).toEqual(["6.02", "6.10", "9.01", "10.01"]);
  });
});
