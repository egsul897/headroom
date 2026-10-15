/** Reviewer §11.23 (ehb:8b895fb6): wrapped run-in headings with a space before the period are sibling sections. */
import { describe, expect, it } from "vitest";
import { parseSectionTree } from "@/lib/contract-model/section-tree/parse";

const TEXT = [
  "ARTICLE XI\n\nMISCELLANEOUS\n\n",
  "          Section 11.21\n     Severability .    Any\nprovision of this Agreement held to be invalid shall be ineffective to that extent.\n\n",
  "          Section 11.22\n     Independence of\nCovenants .    All covenants hereunder shall be given independent effect so that a\nDefault occurs.\n\n  91\n\n",
  "          Section 11.23\n     Interest Rate\nLimitation .    Notwithstanding anything herein to the contrary, interest shall be\nlimited to the Maximum Rate.\n\n",
  "          Section 11.24\n     USA Patriot Act .    Each Lender subject to the Act hereby notifies the Borrowers.\n",
].join("");

describe("§11.21-§11.24 nesting", () => {
  it("parses 11.22 and 11.23 as their own sections, not folded into 11.21", () => {
    const t = parseSectionTree(TEXT);
    const secs = t.nodes.filter((n) => n.kind === "SECTION").map((n) => [n.path, n.title]);
    expect(secs).toEqual([["11.21", "Severability"], ["11.22", "Independence of Covenants"], ["11.23", "Interest Rate Limitation"], ["11.24", "USA Patriot Act"]]);
    const s21 = t.nodes.find((n) => n.path === "11.21")!;
    expect(TEXT.slice(s21.start, s21.end)).not.toMatch(/Independence/);
  });
});
