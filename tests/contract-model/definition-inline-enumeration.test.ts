/**
 * A defined term that opens its own line stays on the enclosing section, even when
 * an earlier definition contains an inline (i)/(ii)/(A)/(B) list. Line-start definition
 * lists stay structural: deleting them reparents the certified Gibraltar Section 1.01 tree.
 * Synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { buildClauseTree } from "../../lib/contract-model/compiler/clause-hierarchy";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

const ABL = `ABL CREDIT AGREEMENT dated as of September 9, 2026.

ARTICLE I DEFINITIONS

SECTION 1.01 Defined Terms . As used in this Agreement, the following terms have the meanings specified below:

"Payment Conditions" means, with respect to any transaction, that (i) no Default has occurred and is continuing and (ii) Availability after giving effect to such transaction is not less than the greater of (A) $12,500,000 and (B) 12.5% of the Borrowing Base.

"Subsidiary" means any corporation or other entity that is controlled by the Borrower.

"Term Loan Agreement" means the Term Loan Credit Agreement dated as of September 9, 2026 among the Borrower and the lenders party thereto.

ARTICLE VII NEGATIVE COVENANTS

SECTION 7.02 Liens . The Borrower shall not create any Lien on any property, except:

(a) Liens securing the Obligations;

(b) Liens securing Indebtedness under the Term Loan Agreement;

provided that no Lien permitted under clause (b) shall attach to any Eligible Receivables.

SECTION 7.03 Investments . The Borrower shall not make any Investment, except:

(a) Investments in Subsidiaries; and

(b) other Investments not to exceed $3,000,000:

(i) provided that no Default has occurred; and

(ii) provided further that such Investments are made in cash.
`;

function parsed(text: string) {
  const nodes = parseDocumentStructure({ documentId: "abl", label: "ABL", text });
  const defs = detectStructuralDefinitions("abl", text, nodes);
  return { nodes, defs };
}

describe("definition inline enumerations", () => {
  it("does not nest later definitions under an inline (i)/(ii)/(A)/(B) list", () => {
    const { nodes, defs } = parsed(ABL);
    const source = (term: string) => nodes.find((n) => n.nodeId === defs.find((d) => d.exactTerm === term)?.sourceNodeId);
    expect(source("Payment Conditions")?.sectionRef).toBe("1.01");
    expect(source("Subsidiary")?.sectionRef).toBe("1.01");
    expect(source("Term Loan Agreement")?.sectionRef).toBe("1.01");
    expect(source("Subsidiary")?.nodeType).toBe("SECTION");
    expect(source("Term Loan Agreement")?.nodeType).toBe("SECTION");
    expect(nodes.filter((n) => n.sectionRef === "7.02" || n.sectionRef.startsWith("7.02(")).map((n) => n.sectionRef)).toEqual(["7.02", "7.02(a)", "7.02(b)"]);
    expect(nodes.map((n) => n.sectionRef)).toEqual(expect.arrayContaining(["7.03(b)(i)", "7.03(b)(ii)"]));
  });

  it("keeps a multiline definition list, including blank lines, from swallowing the next term", () => {
    const text = `SECTION 1.01 Defined Terms. As used in this Agreement:

"Excluded Assets" means the following:

(a) cash; and

(b) inventory.

"Subsidiary" means any entity controlled by the Borrower.
`;
    const { nodes, defs } = parsed(text);
    const subsidiary = defs.find((d) => d.exactTerm === "Subsidiary");
    const source = nodes.find((n) => n.nodeId === subsidiary?.sourceNodeId);
    expect(source?.sectionRef).toBe("1.01");
    expect(source?.nodeType).toBe("SECTION");
  });

  it("treats a wrapped definition list the same way", () => {
    const text = `SECTION 1.01 Defined Terms. As used in this Agreement:

"Payment Conditions" means, with respect to any transaction, that
(i) no Default has occurred and is continuing and
(ii) Availability is not less than the greater of
(A) $12,500,000 and
(B) 12.5% of the Borrowing Base.

"Subsidiary" means any entity controlled by the Borrower.
`;
    const { nodes, defs } = parsed(text);
    expect(defs.map((d) => d.exactTerm)).toEqual(["Payment Conditions", "Subsidiary"]);
    const sectionId = nodes.find((n) => n.nodeType === "SECTION")?.nodeId;
    expect(defs.every((d) => d.sourceNodeId === sectionId)).toBe(true);
  });

  it("keeps quoted-colon and unquoted-colon enumerations inside the definition", () => {
    const text = `SECTION 1.01 Defined Terms. As used in this Agreement:

"Available Amount": $15,000,000 plus (a) retained cash and (b) equity proceeds.

Applicable Margin: a percentage equal to (i) 2.00% or (ii) 2.50%.

"EBITDA": Consolidated Net Income.
`;
    const { nodes, defs } = parsed(text);
    expect(defs.map((d) => d.exactTerm)).toEqual(["Available Amount", "Applicable Margin", "EBITDA"]);
    const sectionId = nodes.find((n) => n.sectionRef === "1.01")?.nodeId;
    expect(defs.every((d) => d.sourceNodeId === sectionId)).toBe(true);
  });

  it("keeps a completed definition on the section when a covenant list follows it", () => {
    const text = `SECTION 6.01 Indebtedness. The Borrower shall not incur Indebtedness except as set forth below.

"Permitted Debt" means (i) the Loans and (ii) the Notes.

(a) Indebtedness under this Agreement; and

(b) other Indebtedness not to exceed $10,000,000.
`;
    const { nodes, defs } = parsed(text);
    expect(nodes.map((n) => n.sectionRef)).toEqual(expect.arrayContaining(["6.01(ii)(a)", "6.01(ii)(b)"]));
    expect(defs.find((d) => d.exactTerm === "Permitted Debt")?.sourceNodeId).toBe(nodes.find((n) => n.sectionRef === "6.01")?.nodeId);
    expect(nodes.find((n) => n.sectionRef === "6.01(ii)(a)")?.nodeId).not.toBe(defs.find((d) => d.exactTerm === "Permitted Debt")?.sourceNodeId);
  });

  it("keeps an events-of-default list on the section when the chapeau names the term", () => {
    const text = `SECTION 8.01 Events of Default. Any of the following shall constitute an "Event of Default":

(a) Non-Payment. The Borrower fails to pay (i) principal when due or (ii) interest within five Business Days; or

(b) Specific Covenants. The Borrower fails to perform any term in Article VII; or
`;
    const sectionRefs = parsed(text).nodes.map((n) => n.sectionRef);
    expect(sectionRefs).toEqual(expect.arrayContaining(["8.01(a)", "8.01(a)(i)", "8.01(a)(ii)", "8.01(b)"]));
    expect(sectionRefs).not.toContain("8.01(ii)(b)");
  });

  it("keeps a lettered definition entry as its own clause", () => {
    const text = `SECTION 1.01 Defined Terms. As used in this Agreement:

(a) "Availability" means the Borrowing Base minus outstanding Loans.

(b) "Subsidiary" means any entity controlled by the Borrower.
`;
    const { nodes, defs } = parsed(text);
    expect(nodes.map((n) => n.sectionRef)).toEqual(expect.arrayContaining(["1.01(a)", "1.01(b)"]));
    const nodeRef = (term: string) => nodes.find((n) => n.nodeId === defs.find((d) => d.exactTerm === term)?.sourceNodeId)?.sectionRef;
    expect(nodeRef("Availability")).toBe("1.01(a)");
    expect(nodeRef("Subsidiary")).toBe("1.01(b)");
  });

  it("does not turn a same-line covenant list into a definition and still parses except: (a)", () => {
    expect(buildClauseTree("except: (a) first; (b) second; (c) third.").map((n) => n.marker)).toEqual(["(a)", "(b)", "(c)"]);
    const text = `SECTION 7.01 Liens. The Borrower shall not create any Lien, except: (a) Liens securing the Obligations; and (b) Liens for taxes not yet due.

provided that a reference to clauses (a), (b) and (c) of this Section is not itself a clause.
`;
    const { nodes } = parsed(text);
    expect(nodes.map((n) => n.sectionRef)).toEqual(expect.arrayContaining(["7.01(a)", "7.01(b)"]));
    expect(nodes.some((n) => n.sectionRef === "7.01(c)")).toBe(false);
  });

  it("does not let a definition's internal cross-reference or a following table become a clause", () => {
    const text = `SECTION 1.01 Defined Terms. As used in this Agreement:

"Borrowed Money" means indebtedness of the type described in clauses (i) through (iv) of the definition of Indebtedness.

"Pricing Grid" means the following table.

Level    Margin
I        2.00%
II       2.50%

"Subsidiary" means any entity controlled by the Borrower.
`;
    const { nodes, defs } = parsed(text);
    expect(nodes.some((n) => n.sectionRef.includes("("))).toBe(false);
    expect(defs.map((d) => d.exactTerm)).toEqual(["Borrowed Money", "Pricing Grid", "Subsidiary"]);
  });
});
