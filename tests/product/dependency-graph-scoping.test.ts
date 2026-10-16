/**
 * Rule 49 — dependency-graph cross-references are
 * document-scoped (rule 27 class).
 *
 * A bare "Section 6.02" in Doc A was resolved against ALL
 * workspace items by section ref alone, so the first item in
 * array order won — Doc A's reference could link to Doc B's
 * §6.02. Same for cycle detection, which keyed adjacency by
 * bare section ref and could report a "cycle" spanning two
 * documents. Cross-reference targets now resolve within the
 * same document only; cycles are keyed by document+ref.
 */
import { describe, expect, it } from "vitest";
import { buildCovenantDependencyGraph } from "../../lib/product/customer-intelligence/dependency-graph";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(over: Partial<CovenantSummaryItem> & { sourceId: string; documentTitle: string }) {
  return {
    sectionRef: "6.01",
    category: "DEBT_INCURRENCE",
    heading: "Indebtedness",
    plainEnglish: "Test item.",
    posture: "GENERAL_PROHIBITION",
    ...over,
  } as CovenantSummaryItem & { sourceId: string; documentTitle: string };
}

describe("buildCovenantDependencyGraph document scoping", () => {
  it("does not link Doc A's cross-ref to Doc B's same-numbered section", () => {
    const graph = buildCovenantDependencyGraph([
      item({ sourceId: "docA", documentTitle: "Indenture.pdf", sectionRef: "6.01", crossReferences: ["Section 6.02"] }),
      item({ sourceId: "docB", documentTitle: "Credit Agreement.pdf", sectionRef: "6.02" }),
    ]);
    expect(graph.edges.filter((e) => e.kind === "CROSS_REFERENCE")).toEqual([]);
  });

  it("links Doc A's cross-ref to Doc A's own section", () => {
    const graph = buildCovenantDependencyGraph([
      item({ sourceId: "docA", documentTitle: "Indenture.pdf", sectionRef: "6.01", crossReferences: ["Section 6.02"] }),
      item({ sourceId: "docA", documentTitle: "Indenture.pdf", sectionRef: "6.02" }),
      item({ sourceId: "docB", documentTitle: "Credit Agreement.pdf", sectionRef: "6.02" }),
    ]);
    const edges = graph.edges.filter((e) => e.kind === "CROSS_REFERENCE");
    expect(edges).toHaveLength(1);
    expect(edges[0]?.toDocumentTitle).toBe("Indenture.pdf");
  });

  it("does not report a cycle spanning two documents", () => {
    const graph = buildCovenantDependencyGraph([
      item({ sourceId: "docA", documentTitle: "Indenture.pdf", sectionRef: "6.01", crossReferences: ["Section 6.02"] }),
      item({ sourceId: "docA", documentTitle: "Indenture.pdf", sectionRef: "6.02" }),
      item({ sourceId: "docB", documentTitle: "Credit Agreement.pdf", sectionRef: "6.01", crossReferences: ["Section 6.02"] }),
      item({ sourceId: "docB", documentTitle: "Credit Agreement.pdf", sectionRef: "6.02" }),
    ]);
    // Edges are same-doc only, so no 6.01→6.02→6.01 cycle exists
    // across docs (each doc's pair is one-directional).
    expect(graph.cycles).toEqual([]);
  });

  it("still reports a real same-document cycle", () => {
    const graph = buildCovenantDependencyGraph([
      item({ sourceId: "docA", documentTitle: "Indenture.pdf", sectionRef: "6.01", crossReferences: ["Section 6.02"] }),
      item({ sourceId: "docA", documentTitle: "Indenture.pdf", sectionRef: "6.02", crossReferences: ["Section 6.01"] }),
    ]);
    // Both directions are reported (pre-existing detector behavior).
    expect(graph.cycles).toHaveLength(2);
    expect(graph.cycles.some((c) => c.includes("6.01") && c.includes("6.02"))).toBe(true);
  });
});
