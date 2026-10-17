/**
 * Rule 7 — silent truncation is a lie. countsByCategory counted EVERY
 * candidate while items was capped at 120 with no marker, so the counts
 * and the listed items disagreed silently. Summaries now disclose
 * totalItemsBeforeCap + truncated.
 */
import { describe, expect, it } from "vitest";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

function candidate(i: number): CovenantCandidateRecord {
  return {
    candidateId: `cand-${i}`,
    sourceId: "test:trunc",
    families: ["INDEBTEDNESS"],
    signals: [],
    excerpt: `Section 6.${String(i).padStart(2, "0")} Limitation on Indebtedness. The Issuer shall not incur Indebtedness except Permitted Indebtedness.`,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 5,
  };
}

function summaryFor(n: number) {
  return buildDocumentCovenantSummary({
    sourceId: "test:trunc",
    documentTitle: "Test Indenture",
    issuerCik: "0000000000",
    documentClass: "INDENTURE",
    candidates: Array.from({ length: n }, (_, i) => candidate(i)),
    definitions: [],
    structuralNodes: [],
  });
}

describe("summary truncation disclosure", () => {
  it("discloses truncation when candidates exceed the 120-item cap", () => {
    const s = summaryFor(130);
    expect(s.items.length).toBe(120);
    expect(s.totalItemsBeforeCap).toBe(130);
    expect(s.truncated).toBe(true);
    const counted = Object.values(s.countsByCategory).reduce((a, b) => a + b, 0);
    expect(counted).toBe(130);
  });

  it("no truncation marker under the cap", () => {
    const s = summaryFor(3);
    expect(s.items.length).toBe(3);
    expect(s.totalItemsBeforeCap).toBe(3);
    expect(s.truncated).toBe(false);
  });
});
