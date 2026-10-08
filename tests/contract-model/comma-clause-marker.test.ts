/**
 * A "), (iii) ... and (iv) ... (1)" gap is one clause list. A bare citation stays a
 * citation. A comma lead-in that does not bridge a following proviso stays a citation,
 * so a later line-start (a)/(b)/(c) list keeps its parent. Synthetic text, plus CONMED 7.4.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildClauseTree } from "../../lib/contract-model/compiler/clause-hierarchy";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

const refs = (text: string) => buildClauseTree(text).map((n) => [...n.parentMarkerPath, n.marker].join(""));

describe("comma-separated clause markers", () => {
  it("continues a list when the comma joins two clause bodies", () => {
    const text = "(a) (i) any Subsidiary may merge into the Parent Borrower (provided that the Parent Borrower survives); (ii) any other Subsidiary may merge into a Guarantor (provided that the Guarantor survives), (iii) any limited liability company Subsidiary may consummate a Division if the successors could have received the assets under Section 7.5 and (iv) the Parent Borrower may merge into a Subsidiary provided further that (1) no Event of Default exists and (2) the survivor assumes the obligations.";
    expect(refs(text)).toEqual(["(a)", "(a)(i)", "(a)(ii)", "(a)(iii)", "(a)(iv)", "(a)(iv)(1)", "(a)(iv)(2)"]);
  });

  it("does not turn a bare citation list into clauses", () => {
    const text = "(a) first item. Indebtedness permitted under clauses (a), (b) and (c) of this Section, and under clauses (a) , (i) , (j) , (m) of this Section 6.01, remains the first item.\n(b) second item.";
    expect(refs(text)).toEqual(["(a)", "(b)"]);
  });

  it("does not treat a parenthetical gloss between citations as a clause body", () => {
    const text = "(a) first item, including the baskets in clauses (a) (general basket), (b) (ratio basket) and (c) (builder basket).\n(b) second item.";
    expect(refs(text)).toEqual(["(a)", "(b)"]);
  });

  it("does not let a comma lead-in start a list that reparents the following line-start clauses", () => {
    const text = "(a) The Borrowers shall not consummate an Asset Sale, unless:\n(1) consideration is received; and\n(2) except in the case of a Permitted Asset Swap, (i) at least 50% of the consideration is cash and (ii) at least 75% of the consideration is cash; provided that the amount of:\n(a) assumed liabilities;\n(b) securities converted into cash; and\n(c) Designated Non-cash Consideration;\nshall be deemed cash.";
    const tree = refs(text);
    expect(tree).toContain("(a)(2)(c)");
    expect(tree).not.toContain("(a)(2)(ii)(c)");
    expect(tree).not.toContain("(a)(2)(i)");
  });

  it("parses CONMED Section 7.4(a)(iii) and (iv) without keeping the successor proviso under (ii)", () => {
    const text = readFileSync("tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt", "utf8");
    const sectionRefs = parseDocumentStructure({ documentId: "conmed", label: "Credit Agreement", text }).map((n) => n.sectionRef);
    expect(sectionRefs).toEqual(expect.arrayContaining(["7.4(a)(i)", "7.4(a)(ii)", "7.4(a)(iii)", "7.4(a)(iv)", "7.4(a)(iv)(1)", "7.4(a)(iv)(2)"]));
    expect(sectionRefs).not.toContain("7.4(a)(ii)(1)");
    expect(sectionRefs).not.toContain("7.4(a)(ii)(2)");
  });
});
