/**
 * Training-loop regressions: long-section reclass (head+tail) and
 * Incremental Prepayment / Cap definition mechanics.
 */
import { describe, expect, it } from "vitest";
import { stitchHeadTail, discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { extractStructure, discoverDefinitions, discoverCrossReferences } from "../../lib/knowledge-factory/pipeline/structural";
import { extractBaskets } from "../../lib/product/covenant-intelligence/analyze-provision";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";

describe("covenant training repetition regressions", () => {
  it("stitchHeadTail preserves trailing reclassification language", () => {
    const head = "SECTION 7.2 Limitation on Indebtedness. No Borrower shall incur Indebtedness except: (a) facility debt; (b) $5,000,000. ";
    const mid = "x".repeat(6000);
    const tail =
      "the Parent Borrower shall, in its sole discretion, classify or reclassify, or later divide, classify or reclassify, such item of Indebtedness in any manner that complies with this Section 7.2.";
    const stitched = stitchHeadTail(head + mid + tail, 5200);
    expect(stitched).toMatch(/classify or reclassify/);
    expect(stitched).toMatch(/Limitation on Indebtedness/);
  });

  it("extracts Incremental Prepayment Amount as voluntary/prepayment path", () => {
    const baskets = extractBaskets(
      "Incremental Cap means the sum of (x) the Fixed Incremental Amount, (y)(A) the Incremental Prepayment Amount minus (B) amounts previously applied, and (z) the Ratio Incremental Amount.",
    );
    expect(baskets.some((b) => /Incremental path: Fixed/i.test(b))).toBe(true);
    expect(baskets.some((b) => /Incremental path: Voluntary Prepayment|Prepayment/i.test(b))).toBe(true);
    expect(baskets.some((b) => /multi-component/i.test(b))).toBe(true);
  });

  it("merges Incremental Cap definition mechanics onto debt items", () => {
    const sourceId = "fixture:train-incr-cap-def";
    const text = `
SECTION 1.1 Defined Terms.
“ Incremental Cap ” means, as of any date of determination, the sum of: (I) an amount equal to the greater of (x) $35,600,000 and (y) 100% of Consolidated EBITDA (the “ Fixed Incremental Amount ”) plus (II) the Ratio Incremental Amount so long as the First Lien Leverage Ratio does not exceed 4.50 to 1.00 plus (III) the Prepayment Incremental Amount.
SECTION 6.01 Limitation on Indebtedness.
The Borrower shall not create, incur, assume or permit to exist any Indebtedness, except Indebtedness under Incremental Facilities not exceeding the Incremental Cap.
SECTION 6.02 Liens.
The Borrower shall not create, incur, assume or permit to exist any Lien except Permitted Liens.
`;
    const structural = extractStructure(sourceId, text);
    const definitions = discoverDefinitions(sourceId, structural.normalizedText, structural.nodes);
    const xrefs = discoverCrossReferences(sourceId, structural.normalizedText);
    const candidates = discoverCovenantCandidates(sourceId, structural.normalizedText, structural.nodes);
    const summary = buildDocumentCovenantSummary({
      sourceId,
      documentTitle: "Train Incremental Cap",
      issuerName: "Train",
      issuerCik: "0",
      documentClass: "CREDIT_AGREEMENT",
      candidates,
      definitions,
      structuralNodes: structural.nodes,
      crossReferences: xrefs,
    });
    const debt = summary.items.find((i) => i.category === "DEBT_INCURRENCE");
    expect(debt).toBeTruthy();
    const baskets = debt!.materialBasketsThresholds.join("\n");
    expect(baskets).toMatch(/Incremental path/i);
    expect(baskets).toMatch(/Fixed|Ratio|Prepayment|multi-component/i);
  });
});
