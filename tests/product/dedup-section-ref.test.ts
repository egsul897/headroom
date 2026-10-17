/**
 * Rule 13 — dedup by section ref must only collapse TRUE duplicates.
 *
 * dedupBySectionRef collapsed every candidate sharing a sectionRef,
 * keeping the highest score. But the same ref can carry DIFFERENT
 * text in one document — e.g. a single PDF containing both a base
 * agreement and an amendment that restates §6.01 with a new cap.
 * Collapsing those silently dropped one version's baskets.
 *
 * True parser duplicates (same span emitted twice) have identical —
 * or containment-equal — excerpts. Different text must keep both
 * candidates. Containment still collapses a truncated re-emit of the
 * same section, and a pure-superset amendment (base text + added
 * sentence) keeps the fuller version, losing nothing.
 */
import { describe, expect, it } from "vitest";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";

function node(nodeId: string, sectionRef: string, heading: string, charStart: number, charEnd: number): StructuralNodeRecord {
  return { nodeId, sourceId: "src", nodeType: "SECTION", sectionRef, heading, charStart, charEnd };
}

const BASE_601 =
  "Section 6.01 Limitation on Indebtedness. The Company shall not create Indebtedness " +
  "except Indebtedness in an aggregate principal amount not to exceed $50.0 million at any time outstanding.";
const AMENDED_601 =
  "Section 6.01 Limitation on Indebtedness. The Company shall not create Indebtedness " +
  "except Indebtedness in an aggregate principal amount not to exceed $100.0 million at any time outstanding, " +
  "plus Indebtedness under the Incremental Facilities.";

describe("dedup by section ref", () => {
  it("keeps both versions when the same ref carries different text", () => {
    const text = BASE_601 + "\n" + AMENDED_601;
    const nodes = [
      node("n-base", "6.01", "Limitation on Indebtedness", 0, 45),
      node("n-amd", "6.01", "Limitation on Indebtedness", BASE_601.length + 1, BASE_601.length + 46),
    ];
    const candidates = discoverCovenantCandidates("src", text, nodes);
    const sixOhOne = candidates.filter((c) => c.nodeId === "n-base" || c.nodeId === "n-amd");
    expect(sixOhOne).toHaveLength(2);
    expect(sixOhOne.map((c) => c.excerpt).join(" ")).toContain("$50.0 million");
    expect(sixOhOne.map((c) => c.excerpt).join(" ")).toContain("$100.0 million");
  });

  it("still collapses a true parser duplicate (same span emitted twice)", () => {
    const text = BASE_601;
    const nodes = [
      node("n-a", "6.01", "Limitation on Indebtedness", 0, 45),
      node("n-b", "6.01", "Limitation on Indebtedness", 0, 45),
    ];
    const candidates = discoverCovenantCandidates("src", text, nodes);
    const sixOhOne = candidates.filter((c) => c.nodeId === "n-a" || c.nodeId === "n-b");
    expect(sixOhOne).toHaveLength(1);
  });
});
