/** #371: covenant scope is read from lead-ins (section opening and clause openings), never from deep body text. */
import { describe, expect, it } from "vitest";
import { parseSectionTree } from "@/lib/contract-model/section-tree/parse";
import { sectionLooksCovenant } from "@/lib/covenant-learning-factory/sweep/tree-locator";

const pad = " This paragraph describes background matters at length.".repeat(20);
const scope = (body: string) => {
  const text = `ARTICLE IX\n\nMISCELLANEOUS\n\nSection 9.1. Governing Law.${body}\n\nSection 9.2. Counterparts. This Agreement may be executed in counterparts.\n`;
  const t = parseSectionTree(text);
  return sectionLooksCovenant(t, text, t.nodes.find((n) => n.path === "9.1")!);
};

describe("#371 scope from lead-ins only", () => {
  it("a prohibition deep inside a non-covenant body does not bring the section into scope", () => {
    expect(scope(` This Agreement shall be governed by the laws of New York.${pad} The Borrower shall not assert any claim against any Agent.`)).toBe(false);
  });
  it("a prohibition in the section lead-in does", () => {
    expect(scope(" The Borrower shall not create, incur or assume any Indebtedness.")).toBe(true);
  });
  it("a prohibition opening an enumerated clause does", () => {
    expect(scope(` This Section governs the following.${pad}\n(a) The Borrower shall not create any Lien on its property.`)).toBe(true);
  });
});
