/**
 * Regression: Bank-of-America / Benchmark-style credit agreements use
 *   ARTICLE I\nDEFINITIONS...\n  1.01\\t  Defined Terms.
 * (tab-separated bare decimals with leading indent + trailing period; ARTICLE
 * titles followed immediately by section numbers). Agent 6 authentic package
 * validation found the structural index collapsing to 3 ARTICLEs / 0 SECTIONs
 * on Benchmark's Second A&R — a generalizable drafting-convention gap.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runStructureStage } from "@/lib/contract-model/compiler/stage-structure";

const FIXTURE =
  "tests/fixtures/authentic-packages/benchmark-2025/extracted-text/doc-c-2025-06-27-second-ar-credit-agreement.txt";

describe("Agent 6 — BofA/Benchmark bare-decimal structure (generalizable)", () => {
  it("recovers ARTICLE + SECTION nodes on authentic Benchmark Second A&R", () => {
    const text = readFileSync(FIXTURE, "utf8");
    const result = runStructureStage([{ documentId: "doc-c", label: "BHE Second A&R", text }]);
    const byType: Record<string, number> = {};
    for (const n of result.output) byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1;

    expect(byType.ARTICLE ?? 0).toBeGreaterThanOrEqual(8);
    expect(byType.SECTION ?? 0).toBeGreaterThanOrEqual(40);

    const sectionRefs = new Set(
      result.output.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef),
    );
    expect(sectionRefs.has("7.01")).toBe(true);
    expect(sectionRefs.has("7.02")).toBe(true);
    expect(sectionRefs.has("1.01")).toBe(true);
  });

  it("synthetic BofA-shaped miniature parses sections after ARTICLE", () => {
    // Blank line before ARTICLE I supplies the paragraph-break plausibility
    // signal (same shape as a real filing after the cover/TOC block).
    const text = [
      "SECOND AMENDED AND RESTATED CREDIT AGREEMENT",
      "",
      "ARTICLE I",
      "DEFINITIONS AND ACCOUNTING TERMS",
      "  1.01\t  Defined Terms.",
      "  As used in this Agreement, the following terms shall have the meanings set forth below:",
      "  “Indebtedness” means debt.",
      "",
      "ARTICLE VII",
      "NEGATIVE COVENANTS",
      "  Each of the Borrowers hereby covenants and agrees that:",
      "  7.01\t  Liens.",
      "  No Borrower shall create any Lien.",
      "  7.02\t  Indebtedness.",
      "  No Borrower shall create Indebtedness.",
    ].join("\n");
    const result = runStructureStage([{ documentId: "mini", label: "synthetic BofA", text }]);
    const sections = result.output.filter((n) => n.nodeType === "SECTION");
    const articles = result.output.filter((n) => n.nodeType === "ARTICLE");
    expect(articles.map((a) => a.sectionRef).sort()).toEqual(["I", "VII"]);
    expect(sections.map((s) => s.sectionRef).sort()).toEqual(["1.01", "7.01", "7.02"]);
  });
});
