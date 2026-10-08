/**
 * A comma-separated marker is a clause when both sides are clause bodies.
 * A bare citation list stays a citation. Synthetic text, plus the CONMED
 * Section 7.4 list whose (iii) and (iv) were dropped by the citation exclusion.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildClauseTree } from "../../lib/contract-model/compiler/clause-hierarchy";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

const refs = (text: string) => buildClauseTree(text).map((n) => [...n.parentMarkerPath, n.marker].join(""));

describe("comma-separated clause markers", () => {
  it("continues a list when the comma joins two clause bodies", () => {
    const text = "(a) (i) any Subsidiary may merge into the Parent Borrower (provided that the Parent Borrower survives); (ii) any other Subsidiary may merge into a Guarantor (provided that the Guarantor survives), (iii) any limited liability company Subsidiary may consummate a Division if the successors could have received the assets under Section 7.5 and (iv) the Parent Borrower may merge into a Subsidiary provided that the survivor assumes the obligations.";
    expect(refs(text)).toEqual(["(a)", "(a)(i)", "(a)(ii)", "(a)(iii)", "(a)(iv)"]);
  });

  it("does not turn a bare citation list into clauses", () => {
    const text = "(a) first item. Indebtedness permitted under clauses (a), (b) and (c) of this Section, and under clauses (a) , (i) , (j) , (m) of this Section 6.01, remains the first item.\n(b) second item.";
    expect(refs(text)).toEqual(["(a)", "(b)"]);
  });

  it("does not treat a parenthetical gloss between citations as a clause body", () => {
    const text = "(a) first item, including the baskets in clauses (a) (general basket), (b) (ratio basket) and (c) (builder basket).\n(b) second item.";
    expect(refs(text)).toEqual(["(a)", "(b)"]);
  });

  it("parses CONMED Section 7.4(a)(iii) and (iv) without keeping the successor proviso under (ii)", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt", "utf8");
    const sectionRefs = parseDocumentStructure({ documentId: "conmed", label: "Credit Agreement", text }).map((n) => n.sectionRef);
    expect(sectionRefs).toEqual(expect.arrayContaining(["7.4(a)(i)", "7.4(a)(ii)", "7.4(a)(iii)", "7.4(a)(iv)", "7.4(a)(iv)(1)", "7.4(a)(iv)(2)"]));
    expect(sectionRefs).not.toContain("7.4(a)(ii)(1)");
    expect(sectionRefs).not.toContain("7.4(a)(ii)(2)");
  });
});
