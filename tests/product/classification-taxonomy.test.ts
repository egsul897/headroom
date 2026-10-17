/**
 * Classification census steps 1–3 — structural classification.
 *
 * Step 1 pins: items that are definitions, representations,
 * facility/agent mechanics, CP checklists, boilerplate, or
 * [reserved] placeholders get an explicit NON_COVENANT
 * classification (with subtype) from structural position —
 * article position, instrument identity, node type — BEFORE
 * family keyword scoring can label them as covenants. The gate
 * is fail-closed: chapeau stems, mandatory-prepayment
 * obligations, masked-family covenants, and EoD-shaped items are
 * never gated.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import { grantTypesForItem } from "../../lib/product/customer-intelligence/grant-types";
import type {
  CovenantCandidateRecord,
  StructuralNodeRecord,
} from "../../lib/knowledge-factory/types";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

const SOURCE = "test:classification";

let seq = 0;
function node(
  nodeType: string,
  sectionRef: string,
  heading: string,
  charStart: number,
  charEnd: number,
  parentNodeId?: string,
): StructuralNodeRecord {
  seq += 1;
  return {
    nodeId: `n${seq}`,
    sourceId: SOURCE,
    nodeType,
    sectionRef,
    heading,
    charStart,
    charEnd,
    parentNodeId: parentNodeId ?? null,
    ambiguous: false,
  } as StructuralNodeRecord;
}

function analyze(
  nodes: StructuralNodeRecord[],
  candidateNode: StructuralNodeRecord,
  families: string[],
  excerpt: string,
) {
  const candidate: CovenantCandidateRecord = {
    candidateId: `c-${candidateNode.nodeId}`,
    sourceId: SOURCE,
    nodeId: candidateNode.nodeId,
    families: families as CovenantCandidateRecord["families"],
    signals: [],
    excerpt,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 5,
  };
  return analyzeProvision({
    sourceId: SOURCE,
    documentTitle: "Test Credit Agreement",
    candidate,
    definitions: [],
    structuralNodes: nodes,
  });
}

/** A small credit agreement skeleton: Article I Definitions,
 * Article II The Credits, Article V Representations, Article VI
 * Affirmative Covenants, Article VII Negative Covenants. */
function skeleton() {
  seq = 0;
  const defs = node("ARTICLE", "I", "Definitions and Accounting Terms", 0, 1000);
  const credits = node("ARTICLE", "II", "The Credits", 1000, 3000);
  const reps = node("ARTICLE", "V", "Representations and Warranties", 3000, 4000);
  const aff = node("ARTICLE", "VI", "Affirmative Covenants", 4000, 5000);
  const neg = node("ARTICLE", "VII", "Negative Covenants", 5000, 9000);
  const misc = node("ARTICLE", "X", "Miscellaneous", 9000, 10000);
  return { defs, credits, reps, aff, neg, misc, all: [defs, credits, reps, aff, neg, misc] };
}

describe("step 1 — NON_COVENANT structural classification", () => {
  it("a definition clause mentioning Indebtedness is a DEFINITION, not a debt covenant", () => {
    const s = skeleton();
    const sec = node("SECTION", "1.01", "Defined Terms", 10, 900, s.defs.nodeId);
    const item = node("SUBSECTION", "1.01(a)", "", 20, 300, sec.nodeId);
    const a = analyze(
      [...s.all, sec, item],
      item,
      ["INDEBTEDNESS", "LIENS"],
      "(a) “Indebtedness” means, with respect to any Person, all obligations of such Person in respect of borrowed money and Guarantees thereof.",
    );
    expect(a.category).toBe("NON_COVENANT");
    expect(a.nonCovenantSubtype).toBe("DEFINITION");
    expect(a.posture).toBe("UNRESOLVED");
    expect(a.permissions).toEqual([]);
    expect(a.restriction).toBeNull();
  });

  it("a representation mentioning Liens is a REPRESENTATION", () => {
    const s = skeleton();
    const sec = node("SECTION", "5.07", "Ownership of Property; Liens", 3100, 3900, s.reps.nodeId);
    const a = analyze(
      [...s.all, sec],
      sec,
      ["LIENS"],
      "Section 5.07. Ownership of Property; Liens. Each Loan Party has good title to its properties, free of Liens other than Permitted Liens.",
    );
    expect(a.category).toBe("NON_COVENANT");
    expect(a.nonCovenantSubtype).toBe("REPRESENTATION");
  });

  it("a conditions-precedent item is MECHANICS even with a financial-covenant family", () => {
    const s = skeleton();
    const cond = node("ARTICLE", "IV", "Conditions", 2950, 3000);
    const sec = node("SECTION", "4.02", "Each Credit Event", 2955, 2995, cond.nodeId);
    const item = node("SUBSECTION", "4.02(d)", "", 2960, 2990, sec.nodeId);
    const a = analyze(
      [...s.all, cond, sec, item],
      item,
      ["FINANCIAL_MAINTENANCE_COVENANTS"],
      "(d) The Borrower shall have delivered a certificate certifying that the Borrower shall be in compliance with the financial covenants set forth in Section 7.11.",
    );
    expect(a.category).toBe("NON_COVENANT");
    expect(a.nonCovenantSubtype).toBe("MECHANICS");
  });

  it("a [reserved] placeholder in a negative-covenant article is RESERVED", () => {
    const s = skeleton();
    const sec = node("SECTION", "7.15", "[Reserved]", 6000, 6100, s.neg.nodeId);
    const a = analyze([...s.all, sec], sec, ["UNKNOWN"], "Section 7.15. [Reserved].");
    expect(a.category).toBe("NON_COVENANT");
    expect(a.nonCovenantSubtype).toBe("RESERVED");
  });

  it("a miscellaneous-article amendments clause is BOILERPLATE even with an incidental family mention", () => {
    const s = skeleton();
    const sec = node("SECTION", "10.02", "Amendments", 9100, 9900, s.misc.nodeId);
    const item = node("SUBSECTION", "10.02(b)", "", 9200, 9800, sec.nodeId);
    const a = analyze(
      [...s.all, sec, item],
      item,
      ["UNKNOWN", "LIENS"],
      "(b) No amendment to the subordination provisions of this Section shall be effective without the consent of each Lender.",
    );
    expect(a.category).toBe("NON_COVENANT");
    expect(a.nonCovenantSubtype).toBe("BOILERPLATE");
  });

  it("the guaranty-obligations carve-out keeps an obligations-absolute clause out of the boilerplate gate", () => {
    const s = skeleton();
    const sec = node("SECTION", "10.22", "Obligations Absolute", 9100, 9900, s.misc.nodeId);
    const item = node("SUBSECTION", "10.22(d)", "", 9200, 9800, sec.nodeId);
    const a = analyze(
      [...s.all, sec, item],
      item,
      ["UNKNOWN", "GUARANTEES"],
      "(d) Each Guarantor waives presentment, demand, protest and notice of dishonor.",
    );
    expect(a.category).not.toBe("NON_COVENANT");
  });

  it("a credits-article title-only stem is NOT gated (its clauses carry the substance)", () => {
    const s = skeleton();
    const sec = node("SECTION", "2.09", "Termination of Commitment", 1100, 2900, s.credits.nodeId);
    const a = analyze(
      [...s.all, sec],
      sec,
      ["UNKNOWN", "GENERAL_CONDITIONS_AND_EXCEPTIONS"],
      "Section 2.09. Termination of Commitment.",
    );
    expect(a.category).toBe("OTHER");
  });

  it("a credits-article payment-application clause is MECHANICS", () => {
    const s = skeleton();
    const sec = node("SECTION", "2.11", "Prepayment of Loans", 1100, 2900, s.credits.nodeId);
    const item = node("SUBSECTION", "2.11(d)", "", 1200, 2000, sec.nodeId);
    const a = analyze(
      [...s.all, sec, item],
      item,
      ["UNKNOWN", "SHARED_CAPACITY_PROVISIONS"],
      "(d) All prepayments made pursuant to this Section shall be applied to the Loans in direct order of maturity.",
    );
    expect(a.category).toBe("NON_COVENANT");
    expect(a.nonCovenantSubtype).toBe("MECHANICS");
  });

  it("a mandatory-prepayment obligation in the credits article is NOT gated", () => {
    const s = skeleton();
    const sec = node("SECTION", "2.11", "Prepayment of Loans", 1100, 2900, s.credits.nodeId);
    const item = node("SUBSECTION", "2.11(c)", "", 1200, 2000, sec.nodeId);
    const a = analyze(
      [...s.all, sec, item],
      item,
      ["UNKNOWN", "SHARED_CAPACITY_PROVISIONS"],
      "(c) In the event any Net Proceeds are received in respect of a Prepayment Event, the Borrowers shall, immediately after such Net Proceeds are received, prepay the Loans.",
    );
    expect(a.category).not.toBe("NON_COVENANT");
  });

  it("a credits-article clause with a masked mappable family is NOT gated", () => {
    const s = skeleton();
    const sec = node("SECTION", "2.16", "Incremental Facilities", 1100, 2900, s.credits.nodeId);
    const item = node("SUBSECTION", "2.16(a)", "", 1200, 2000, sec.nodeId);
    const a = analyze(
      [...s.all, sec, item],
      item,
      ["UNKNOWN", "INCREMENTAL_DEBT_AND_FACILITIES", "SHARED_CAPACITY_PROVISIONS"],
      "(a) The Borrower may incur Incremental Term Loans subject to the conditions of this Section.",
    );
    expect(a.category).not.toBe("NON_COVENANT");
  });

  it("a designation-mechanics clause under a designation section is MECHANICS", () => {
    const s = skeleton();
    const sec = node(
      "SECTION",
      "6.13",
      "Designation of Restricted and Unrestricted Subsidiaries",
      4100,
      4900,
      s.aff.nodeId,
    );
    const item = node("SUBSECTION", "6.13(b)", "", 4200, 4800, sec.nodeId);
    const a = analyze(
      [...s.all, sec, item],
      item,
      ["RESTRICTED_SUBSIDIARIES", "UNRESTRICTED_SUBSIDIARIES"],
      "(b) The designation of any Subsidiary as an Unrestricted Subsidiary shall be made by delivery of a certificate of a Responsible Officer.",
    );
    expect(a.category).toBe("NON_COVENANT");
    expect(a.nonCovenantSubtype).toBe("MECHANICS");
  });

  it("a negative-covenant item with RS at [0] is NOT gated by step 1 (the trap's safe direction)", () => {
    const s = skeleton();
    const sec = node("SECTION", "7.02", "Investments", 5100, 8900, s.neg.nodeId);
    const item = node("SUBSECTION", "7.02(x)", "", 5200, 6000, sec.nodeId);
    const a = analyze(
      [...s.all, sec, item],
      item,
      ["RESTRICTED_SUBSIDIARIES", "INVESTMENTS"],
      "(x) Investments by Restricted Subsidiaries in Unrestricted Subsidiaries shall not exceed the amount set forth in this clause.",
    );
    expect(a.category).not.toBe("NON_COVENANT");
  });

  it("bundled instrument: an otherwise-OTHER item in the guaranty region is MECHANICS; the same shape in the CA body is not gated", () => {
    seq = 0;
    // Primary instrument (large spans) then a bundled guaranty
    // whose article numerals restart under different headings.
    const ca1 = node("ARTICLE", "I", "Definitions", 0, 5000);
    const ca2 = node("ARTICLE", "II", "The Credits", 5000, 20000);
    const ca7 = node("ARTICLE", "VII", "Negative Covenants", 20000, 30000);
    const caX = node("ARTICLE", "X", "Miscellaneous", 30000, 35000);
    const g1 = node("ARTICLE", "I", "Definitions", 35000, 37000);
    const g2 = node("ARTICLE", "II", "The Guarantees", 37000, 45000);
    const bodyItem = node("SECTION", "7.20", "Some Covenant Section", 21000, 22000, ca7.nodeId);
    const guarItem = node("SECTION", "2.05", "Waiver of Notice", 38000, 39000, g2.nodeId);
    const nodes = [ca1, ca2, ca7, caX, g1, g2, bodyItem, guarItem];
    const inGuaranty = analyze(nodes, guarItem, ["UNKNOWN"], "Section 2.05. Waiver of Notice. Each Guarantor waives notice of acceptance of this Guaranty.");
    expect(inGuaranty.category).toBe("NON_COVENANT");
    expect(inGuaranty.nonCovenantSubtype).toBe("MECHANICS");
    const inBody = analyze(nodes, bodyItem, ["UNKNOWN"], "Section 7.20. Some Covenant Section. The Borrower shall not engage in any transaction not permitted by this Section.");
    expect(inBody.category).toBe("OTHER");
  });

  it("a TOC duplicate sequence does not create a bundled region", () => {
    seq = 0;
    const toc1 = node("ARTICLE", "I", "Definitions", 0, 200);
    const toc2 = node("ARTICLE", "VII", "Negative Covenants", 200, 400);
    const body1 = node("ARTICLE", "I", "Definitions", 1000, 9000);
    const body2 = node("ARTICLE", "VII", "Negative Covenants", 9000, 20000);
    const item = node("SECTION", "7.20", "Some Covenant Section", 10000, 11000, body2.nodeId);
    const a = analyze([toc1, toc2, body1, body2, item], item, ["UNKNOWN"], "Section 7.20. Some Covenant Section. The Borrower shall not engage in any transaction not permitted by this Section.");
    expect(a.category).toBe("OTHER");
  });

  it("grantTypesForItem mints nothing for a NON_COVENANT item", () => {
    const item = {
      category: "NON_COVENANT",
      categoryLabel: "Non-covenant provision",
      nonCovenantSubtype: "DEFINITION",
      sectionRef: "1.01",
      heading: "Defined Terms",
      families: ["INDEBTEDNESS"],
      plainEnglish: "Indebtedness means all borrowed money obligations.",
      operativeLanguageExcerpt: "“Indebtedness” means all obligations in respect of borrowed money.",
      conditions: [],
    } as unknown as CovenantSummaryItem;
    expect(grantTypesForItem(item)).toEqual([]);
  });
});
