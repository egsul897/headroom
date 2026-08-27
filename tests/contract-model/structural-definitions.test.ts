/**
 * Phase 2A - tests for the deterministic defined-term detector
 * (structural-definitions.ts), including the three real quote encodings
 * this repository's own fixtures actually use (task §17 Definitions).
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";

function parse(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const defs = detectStructuralDefinitions(documentId, text, nodes);
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, defs, []);
  return { nodes, defs, index };
}

describe("detectStructuralDefinitions", () => {
  it("recognizes a straight-quote declaration", () => {
    const { defs } = parse("d1", 'Section 1.01. Definitions. "Consolidated EBITDA" means, for any period, net income plus interest, taxes, depreciation and amortization.');
    expect(defs.map((d) => d.exactTerm)).toContain("Consolidated EBITDA");
  });

  it("recognizes a real Unicode curly-quote declaration (LSB's own fixture encoding)", () => {
    const { defs } = parse("d1", "Section 1.01. Definitions. “ Availability ” means, at any time, an amount equal to the Borrowing Base.");
    expect(defs.map((d) => d.exactTerm.trim())).toContain("Availability");
  });

  it("recognizes the HTML numeric-entity curly-quote declaration (FWRG's own fixture encoding)", () => {
    const { defs } = parse("d1", "Section 1.01. Definitions. &#147; Restricted Subsidiary &#148; means any Subsidiary that is not an Unrestricted Subsidiary.");
    expect(defs.map((d) => d.exactTerm.trim())).toContain("Restricted Subsidiary");
  });

  it("tolerates a line break between the closing quote and 'means' (observed verbatim in LSB's own fixture)", () => {
    const { defs } = parse("d1", 'Section 1.01. Definitions. "Borrowing Base"\nmeans the lesser of the Aggregate Revolving Commitment and the borrowing base calculation.');
    expect(defs.map((d) => d.exactTerm)).toContain("Borrowing Base");
  });

  it("recognizes 'shall mean' and 'shall have the meaning' phrasing, not only 'means'", () => {
    const { defs } = parse("d1", '"Test Period" shall mean the four consecutive fiscal quarters most recently ended. "Fixed Charge Coverage Ratio" shall have the meaning set forth in Section 1.02.');
    expect(defs.map((d) => d.exactTerm)).toEqual(expect.arrayContaining(["Test Period", "Fixed Charge Coverage Ratio"]));
  });

  it("exact definition retrieval via getDefinition, case- and whitespace-insensitive", () => {
    const { index } = parse("d1", '"Consolidated EBITDA" means net income adjusted as set forth herein.');
    expect(index.getDefinition("Consolidated EBITDA")).toBeDefined();
    expect(index.getDefinition("consolidated   ebitda")?.exactTerm).toBe("Consolidated EBITDA");
  });

  it("similarly-named definitions are NOT confused with each other", () => {
    const { index } = parse("d1", '"Consolidated EBITDA" means A. "Consolidated Adjusted EBITDA" means B. "EBITDA" means C.');
    expect(index.getDefinition("Consolidated EBITDA")?.definitionExcerpt).toContain("means A");
    expect(index.getDefinition("Consolidated Adjusted EBITDA")?.definitionExcerpt).toContain("means B");
    expect(index.getDefinition("EBITDA")?.definitionExcerpt).toContain("means C");
  });

  it("a missing definition returns undefined, never a guessed near-match", () => {
    const { index } = parse("d1", '"Consolidated EBITDA" means net income adjusted as set forth herein.');
    expect(index.getDefinition("Total Net Leverage Ratio")).toBeUndefined();
  });

  it("attributes each definition to its enclosing structural node", () => {
    const { defs, nodes } = parse("d1", "Section 1.01. Definitions. \"Consolidated EBITDA\" means net income adjusted as set forth herein.");
    const def = defs.find((d) => d.exactTerm === "Consolidated EBITDA")!;
    const section = nodes.find((n) => n.sectionRef === "1.01")!;
    expect(def.sourceNodeKey).toBe(section.nodeKey);
  });
});
