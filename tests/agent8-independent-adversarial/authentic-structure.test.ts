/**
 * Lightweight authentic-source checks used by Agent 8 (no production edits).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "@/lib/contract-model/compiler/stage-structure";
import { buildPackageGraph } from "@/lib/contract-model/compiler/package-graph/pipeline";

const CONMED = path.resolve(__dirname, "../fixtures/unseen-packages/conmed-2025-credit-facility/curated");

describe("Agent 8 authentic CONMED structure / amendment precedence", () => {
  it("parses Art VII material debt/lien/RP basket figures into section spans", () => {
    const text = fs.readFileSync(path.join(CONMED, "base-credit-agreement-article-vii-negative-covenants.txt"), "utf8");
    const nodes = parseDocumentStructure({ documentId: "conmed-doc-a", label: "CA", text });
    expect(nodes.length).toBeGreaterThan(50);
    const inSpan = (hint: string, needle: string) =>
      nodes.some((n) => n.sectionRef.startsWith(hint) && text.slice(n.charStart, n.charEnd).includes(needle));
    expect(inSpan("7.2", "60,000,000")).toBe(true);
    expect(inSpan("7.3", "50,000,000")).toBe(true);
    expect(inSpan("7.6", "40,000,000")).toBe(true);
    expect(inSpan("7.14", "consensual encumbrance")).toBe(true);
  });

  it("does not RESOLVE Second Amendment (Seventh A&R) as amending the Eighth A&R excerpt", () => {
    const docs = [
      {
        documentId: "conmed-doc-a-eighth-ar-credit-agreement",
        label: "Eighth Amended and Restated Credit Agreement",
        text: fs.readFileSync(path.join(CONMED, "base-credit-agreement-article-vii-negative-covenants.txt"), "utf8"),
      },
      {
        documentId: "conmed-doc-c-second-amendment-2022",
        label:
          "Second Amendment dated as of August 1, 2022 to the Seventh Amended and Restated Credit Agreement dated as of July 16, 2021",
        text: fs.readFileSync(path.join(CONMED, "second-amendment-2022-full.txt"), "utf8"),
      },
      {
        documentId: "conmed-doc-d-first-omnibus-amendment-2026",
        label:
          "First Omnibus Amendment dated as of May 27, 2026 to the Eighth Amended and Restated Credit Agreement dated as of June 10, 2025",
        text: fs.readFileSync(path.join(CONMED, "first-omnibus-amendment-2026-curated.txt"), "utf8"),
      },
    ];
    const graph = buildPackageGraph("company:conmed", "conmed-a8", docs);
    const falseAttach = graph.relationshipCandidates.filter(
      (r) =>
        r.status === "RESOLVED" &&
        ((r.sourceDocumentId.includes("doc-c") && r.targetDocumentId?.includes("doc-a")) ||
          (r.sourceDocumentId.includes("doc-a") && r.targetDocumentId?.includes("doc-c"))),
    );
    expect(falseAttach).toEqual([]);
  });
});
