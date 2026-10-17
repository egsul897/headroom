/**
 * Rule 40 — basket amount dedup must be span-based, not
 * string-inclusion-based.
 *
 * extractBaskets skipped a bare "$X" amount whenever ANY listed
 * entry's text contained "$X". A section with a greater-of limb
 * of $150.0 million AND a separate clause-(b) basket of $150.0
 * million lost the clause-(b) basket entirely — the greater-of
 * entry's text contains "$150.0 million", so the distinct second
 * basket was treated as a duplicate. Dedup by span instead: a
 * bare amount is skipped only when it falls INSIDE a greater-of
 * match span (i.e. it IS the limb). The same amount string at a
 * different position is a separate basket and is kept.
 */
import { describe, expect, it } from "vitest";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

function baskets(excerpt: string): string[] {
  const candidate = {
    candidateId: "c1",
    sourceId: "doc-1",
    families: ["DEBT_INCURRENCE"],
    signals: [],
    excerpt,
    representationLevel: "SOURCE_BACKED",
    discoveryScore: 0.9,
  } as unknown as CovenantCandidateRecord;
  const a = analyzeProvision({
    sourceId: "doc-1",
    documentTitle: "Credit Agreement",
    candidate,
    definitions: [],
    structuralNodes: [],
  });
  return a.basketsAndThresholds;
}

describe("basket amount dedup by span", () => {
  it("keeps a distinct same-amount basket outside the greater-of span", () => {
    const out = baskets(
      "Indebtedness not to exceed the greater of (x) $150.0 million and (y) 10.0% of Consolidated EBITDA, and (b) $150.0 million in additional Indebtedness.",
    );
    const greaterOf = out.filter((x) => x.startsWith("Greater-of basket"));
    const bare = out.filter((x) => x.startsWith("Amount/threshold: $150.0 million"));
    expect(greaterOf).toHaveLength(1);
    expect(bare).toHaveLength(1);
  });

  it("still skips the greater-of limb amount itself (no double-list)", () => {
    const out = baskets(
      "Indebtedness not to exceed the greater of (x) $150.0 million and (y) 10.0% of Consolidated EBITDA.",
    );
    const bare = out.filter((x) => x.startsWith("Amount/threshold: $150.0 million"));
    expect(bare).toHaveLength(0);
    expect(out.some((x) => x.startsWith("Greater-of basket"))).toBe(true);
  });
});
