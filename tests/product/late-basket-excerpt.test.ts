/**
 * Rule 11 — basket caps late in a section must not be silently cut off.
 *
 * analyzeProvision runs basket/cap extraction on the candidate excerpt,
 * but discoverCovenantCandidates truncated that excerpt to 1600 chars
 * even though the section span runs to 4000. A real §6.01-style section
 * with its largest baskets near the end lost every cap past char 1600 —
 * the summary then reported a partial basket list (or "no ceiling
 * identified") with no disclosure that the excerpt was truncated.
 *
 * The fix aligns the excerpt cap with the 4000-char section span (and
 * the sparse-structure span fallback, which was 2500). Display excerpts
 * stay separately clipped (operativeLanguageExcerpt, 700 chars), so
 * this changes analysis coverage, not display size.
 */
import { describe, expect, it } from "vitest";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import type { StructuralNodeRecord } from "../../lib/knowledge-factory/types";

function node(nodeId: string, sectionRef: string, heading: string, charStart: number, charEnd: number): StructuralNodeRecord {
  return { nodeId, sourceId: "src", nodeType: "SECTION", sectionRef, heading, charStart, charEnd };
}

describe("late basket in a long section", () => {
  it("extracts a basket cap living past 1600 chars into the section", () => {
    const filler =
      "Indebtedness permitted under this Section shall be subject to the conditions set forth herein. ";
    // ~90 chars each; 20 repeats ≈ 1800 chars of body before the late basket.
    const body =
      "Section 6.01 Limitation on Indebtedness. " +
      "The Company shall not create, incur, assume or suffer to exist any Indebtedness except: " +
      filler.repeat(20) +
      "(m) Indebtedness in an aggregate principal amount not to exceed $275.0 million at any time outstanding. ";
    const tail = "Section 6.02 Limitation on Liens. The Company shall not create any Lien except as permitted herein.";
    const text = body + tail;
    const nodes = [
      node("n601", "6.01", "Limitation on Indebtedness", 0, 45),
      node("n602", "6.02", "Limitation on Liens", body.length, body.length + 40),
    ];
    // Sanity: the late basket really is past the old 1600-char excerpt cap.
    expect(text.indexOf("$275.0 million")).toBeGreaterThan(1600);
    expect(text.indexOf("$275.0 million")).toBeLessThan(4000);

    const candidates = discoverCovenantCandidates("src", text, nodes);
    const target = candidates.find((c) => c.nodeId === "n601");
    expect(target).toBeDefined();
    const analysis = analyzeProvision({
      sourceId: "src",
      documentTitle: "Indenture",
      candidate: target!,
      definitions: [],
      structuralNodes: nodes,
    });
    expect(analysis.basketsAndThresholds.join(" ")).toContain("$275.0 million");
  });
});
