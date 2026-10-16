/**
 * Rule 165 (audit-driven): the structural parser must not mint a section
 * node from an in-text citation whose "title" is sentence continuation
 * ("Section 6.14 , provided that ..."). The positional gate alone cannot
 * tell it from a real heading when it sits at a line start after a
 * sentence boundary.
 *
 * @prisma/client is mocked because the compiler chain value-imports the
 * EntityClassTag enum; the values below mirror the Prisma schema enum.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class { constructor() { throw new Error("PrismaClient must not be constructed in this test"); } },
  Prisma: { Decimal: class { value: number; constructor(v: unknown) { this.value = Number(v); } toNumber() { return this.value; } }, JsonNull: Object.freeze({ toJSON: () => null }) },
  EntityClassTag: {
    BORROWER: "BORROWER",
    GUARANTOR_RS: "GUARANTOR_RS",
    NON_GUARANTOR_RS: "NON_GUARANTOR_RS",
    FOREIGN_RS: "FOREIGN_RS",
    UNRESTRICTED_SUB: "UNRESTRICTED_SUB",
    SECURITIZATION_SUB: "SECURITIZATION_SUB",
    IMMATERIAL_SUB: "IMMATERIAL_SUB",
    PARENT: "PARENT",
    LOAN_PARTY: "LOAN_PARTY",
    MATERIAL_SUBSIDIARY: "MATERIAL_SUBSIDIARY",
    ANY_SUBSIDIARY: "ANY_SUBSIDIARY",
  },
}));

import { extractStructure } from "../../lib/knowledge-factory/pipeline/structural";

describe("rule 165: parser title shape", () => {
  it("an in-text citation with sentence continuation is not a section node", () => {
    const text = [
      "The Borrower shall deliver financial reports.",
      "",
      "Section 6.14 , provided that in the event of any change in generally accepted accounting principles used in the preparation of such financial statements, it shall also provide additional reports.",
      "",
      "Section 6.15 Notices. All notices shall be in writing.",
    ].join("\n");
    const { nodes } = extractStructure("rule165-test", text);
    expect(nodes.filter((n) => n.sectionRef === "6.14")).toHaveLength(0);
    expect(nodes.some((n) => n.sectionRef === "6.15")).toBe(true);
  });

  it("the same citation without a comma still is not a node", () => {
    const text = [
      "Section 6.01 Indebtedness.",
      "",
      "The Borrower shall not incur Indebtedness. Section 6.14 provided that in the event of any change in generally accepted accounting principles, it shall also provide additional reports.",
    ].join("\n");
    const { nodes } = extractStructure("rule165-test-2", text);
    expect(nodes.filter((n) => n.sectionRef === "6.14")).toHaveLength(0);
    expect(nodes.some((n) => n.sectionRef === "6.01")).toBe(true);
  });
});

describe("rule 167: mid-line bare-decimal headings", () => {
  it("a bare-numbered heading mid-line after a sentence boundary is a node", () => {
    const text = [
      "Each Loan Party will fulfill its obligations under the minimum funding standards of Section 302 of ERISA and applicable law, rule or regulation.",
      "6.14. Financial Covenants (a) Consolidated Adjusted EBITDA to Consolidated Interest Expense .",
      "The Parent will maintain as of the last day of each Measurement Period a ratio of Consolidated Adjusted EBITDA to Consolidated Interest Expense of not less than 4.0 to 1.0.",
      "6.15. ERISA (a) Each Loan Party will fulfill its obligations.",
    ].join(" ");
    const { nodes } = extractStructure("rule167-test", text);
    const found = nodes.filter((n) => n.sectionRef === "6.14");
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.heading).toContain("Financial Covenants");
  });

  it("ordinary prose decimals do not become nodes", () => {
    const text = [
      "The maximum Consolidated Leverage Ratio permitted shall be 4.50 to 1.00, then 4.25 to 1.00, then 4.00 to 1.00.",
      "Upon an acquisition the ratio shall be automatically increased from 3.50 to 1.00 to 4.00 to 1.00 for four Fiscal Quarters.",
      "The Parent will maintain compliance with Section 6.14(b) shall apply as set forth herein.",
    ].join(" ");
    const { nodes } = extractStructure("rule167-test-2", text);
    expect(nodes.filter((n) => n.sectionRef === "4.50" || n.sectionRef === "4.25" || n.sectionRef === "4.00" || n.sectionRef === "3.50")).toHaveLength(0);
  });
});

describe("rule 167b: section title ends at the first subsection marker", () => {
  it("a heading whose title runs into a (a) clause is a node with the section title only", () => {
    const text = [
      "The Parent shall not change its Fiscal Year.",
      "6.15. ERISA (a) Each Loan Party will fulfill its obligations under the minimum funding standards.",
      "6.16. Indebtedness (a) Indebtedness under the Credit Agreement. (b) Other Indebtedness.",
      "6.17. Additional Guarantors . If any Subsidiary provides a guarantee, the Parent shall cause it to become a Guarantor.",
    ].join(" ");
    const { nodes } = extractStructure("rule167b-test", text);
    const erisa = nodes.filter((n) => n.sectionRef === "6.15");
    expect(erisa.length).toBeGreaterThan(0);
    expect(erisa[0]!.heading).toContain("ERISA");
    expect(erisa[0]!.heading).not.toContain("Each Loan Party");
    const debt = nodes.filter((n) => n.sectionRef === "6.16");
    expect(debt.length).toBeGreaterThan(0);
    expect(debt[0]!.heading).toContain("Indebtedness");
  });
});

describe("rule 167c: bare heading with number and title on adjacent lines", () => {
  it("a bare heading split across two adjacent lines is a node", () => {
    const text = [
      "The Parent will not permit any Subsidiary to create Indebtedness, except as provided in this Section 6.14(b).",
      "6.16.",
      "Indebtedness . The Parent will not permit any Subsidiary (other than a Guarantor) to create, incur, assume or suffer to exist any Indebtedness, except:",
      "(a) Indebtedness under the Loan Documents;",
      "(b) Indebtedness under the 2026 Credit Agreement.",
      "6.17. Additional Guarantors . If any Subsidiary provides a guarantee, the Parent shall cause it to become a Guarantor.",
    ].join("\n");
    const { nodes } = extractStructure("rule167c-test", text);
    const debt = nodes.filter((n) => n.sectionRef === "6.16");
    expect(debt.length).toBeGreaterThan(0);
    expect(debt[0]!.heading).toContain("Indebtedness");
  });

  it("a TOC entry split across a blank line is still not a heading", () => {
    const text = [
      "TABLE OF CONTENTS",
      "6.16.",
      "",
      "Indebtedness",
      "",
      "62",
      "6.17. Additional Guarantors . If any Subsidiary provides a guarantee, the Parent shall cause it to become a Guarantor.",
    ].join("\n");
    const { nodes } = extractStructure("rule167c-test-2", text);
    expect(nodes.filter((n) => n.sectionRef === "6.16")).toHaveLength(0);
  });
});

describe("rule 172: TOC entries with roman-numeral page tokens", () => {
  // discoverCovenantCandidates is the gate under test: a TOC node whose
  // collapsed span ends in a roman front-matter page ("119 iii") must
  // be suppressed, while the body section for the same ref survives.
  it("a TOC entry ending '119 iii' is suppressed; the body section survives", async () => {
    const { discoverCovenantCandidates } = await import("../../lib/knowledge-factory/pipeline/candidates");
    const text = [
      "Section 7.01.",
      "Events of Default",
      "119",
      "",
      "iii",
      "",
      "Section 7.01.       Events",
      "of Default . If any of the following events shall occur:",
      "",
      "(a) the Borrowers shall fail to pay any principal of any Loan when and as the same shall become due and payable,",
    ].join("\n");
    const tocStart = text.indexOf("Section 7.01.");
    const bodyStart = text.indexOf("Section 7.01.       Events");
    const nodes = [
      { nodeId: "toc-701", sectionRef: "7.01", nodeType: "SECTION", heading: "Section 7.01.\nEvents of Default", charStart: tocStart, charEnd: tocStart + 31, ambiguous: true },
      { nodeId: "body-701", sectionRef: "7.01", nodeType: "SECTION", heading: "Section 7.01.       Events", charStart: bodyStart, charEnd: bodyStart + 27, ambiguous: true },
    ] as never;
    const candidates = discoverCovenantCandidates("rule172-test", text, nodes);
    const excerpts = candidates.map((c) => c.excerpt);
    expect(excerpts.some((e) => e.includes("shall fail to pay any principal"))).toBe(true);
    expect(excerpts.some((e) => e.includes("119"))).toBe(false);
    expect(candidates).toHaveLength(1);
  });

  it("a bare roman page ('Indebtedness iii') is a TOC entry", async () => {
    const { discoverCovenantCandidates } = await import("../../lib/knowledge-factory/pipeline/candidates");
    const text = ["Section 6.01.", "Indebtedness", "iii", "", "Section 6.02. Liens . The Borrower shall not permit any Lien."].join("\n");
    const tocStart = text.indexOf("Section 6.01.");
    const bodyStart = text.indexOf("Section 6.02.");
    const nodes = [
      { nodeId: "toc-601", sectionRef: "6.01", nodeType: "SECTION", heading: "Section 6.01.\nIndebtedness", charStart: tocStart, charEnd: tocStart + 20, ambiguous: true },
      { nodeId: "body-602", sectionRef: "6.02", nodeType: "SECTION", heading: "Section 6.02. Liens .", charStart: bodyStart, charEnd: bodyStart + 20, ambiguous: false },
    ] as never;
    const candidates = discoverCovenantCandidates("rule172-test-2", text, nodes);
    expect(candidates.map((c) => c.excerpt).some((e) => e.includes("Indebtedness") && !e.includes("shall not"))).toBe(false);
    expect(candidates.some((c) => c.excerpt.includes("shall not permit any Lien"))).toBe(true);
  });
});

describe("rule 173: facility/capacity terms admit UNKNOWN candidates", () => {
  async function candidatesFor(heading: string, body: string) {
    const { discoverCovenantCandidates } = await import("../../lib/knowledge-factory/pipeline/candidates");
    const text = `${heading}\n${body}`;
    const nodes = [
      { nodeId: "n1", sectionRef: "1(b)", nodeType: "SUBSECTION", heading, charStart: 0, charEnd: heading.length, ambiguous: false },
    ] as never;
    return discoverCovenantCandidates("rule173-test", text, nodes);
  }

  it("a Revolver Commitment definition is admitted", async () => {
    const c = await candidatesFor(
      "",
      "(b)\nSection 1.1 of the Credit Agreement is hereby amended by amending and restating in its entirety the following definition:\n\n“Revolver Commitment” - for any Lender, its obligation to make Revolver Loans and to participate in LC Obligations up to the maximum principal amount shown on Schedule 1.1A.",
    );
    expect(c).toHaveLength(1);
  });

  it("an Availability test amendment is admitted", async () => {
    const c = await candidatesFor(
      "",
      "(a) Notwithstanding the provisions set forth in Section 1.4 of the Credit Agreement, the fixed Dollar component of Availability tests set forth in the definitions of “Cash Dominion Trigger Event” shall remain in effect.",
    );
    expect(c).toHaveLength(1);
  });

  it("a Swingline Sublimit amendment is admitted", async () => {
    const c = await candidatesFor(
      "",
      "(b) Notwithstanding the provisions set forth in Section 4.1.3 of the Credit Agreement, the Swingline Sublimit shall remain equal to the Dollar Equivalent Amount of $42,500,000 unless and until the Borrowers and the Agent agree to the contrary.",
    );
    expect(c).toHaveLength(1);
  });

  it("an unrelated UNKNOWN item is still dropped", async () => {
    const c = await candidatesFor("", "(a) The parties hereto agree to meet annually to discuss general business matters and exchange copies of public filings.");
    expect(c).toHaveLength(0);
  });
});

describe("rule 174: clause fallback when the parent produces nothing", () => {
  it("a pointer subsection's clauses surface; a covered parent's clauses do not", async () => {
    const { discoverCovenantCandidates } = await import("../../lib/knowledge-factory/pipeline/candidates");
    // Mirrors the real Calumet shape: the parent subsection is a bare
    // pointer ("See Annex A."), a §2 heading intervenes, and the
    // clause children carry the operative text (Availability tests,
    // Swingline Sublimit). The parent's section-span ends at §2, so
    // it fails the gates and does not cover its clauses.
    const text = [
      "(c)",
      "See Annex A.",
      "",
      "2.",
      "Acknowledgements of Impact of Amendments.",
      "",
      "(a) Notwithstanding the provisions set forth in Section 1.4 of the Credit Agreement, the fixed Dollar component of Availability tests shall remain in effect.",
      "",
      "(b) Notwithstanding the provisions set forth in Section 4.1.3 of the Credit Agreement, the Swingline Sublimit shall remain equal to the Dollar Equivalent Amount of $42,500,000.",
      "",
      "6.01(e)",
      "Indebtedness. The Borrower shall not create, incur, assume or suffer to exist any Indebtedness except Permitted Indebtedness. Permitted Indebtedness includes Indebtedness in an aggregate principal amount not to exceed $20,000,000.",
      "",
      "(i) This clause merely restates the cap above and carries no new substance.",
    ].join("\n");
    const idx = (s: string) => text.indexOf(s);
    const nodes = [
      { nodeId: "sub-1c", sectionRef: "1(c)", nodeType: "SUBSECTION", heading: "", charStart: idx("(c)"), charEnd: idx("(c)") + 3, ambiguous: false },
      { nodeId: "sec-2", sectionRef: "2", nodeType: "SECTION", heading: "Acknowledgements of Impact of Amendments.", charStart: idx("2."), charEnd: idx("2.") + 2, ambiguous: false },
      { nodeId: "cl-1ca", sectionRef: "1(c)(a)", nodeType: "CLAUSE", heading: "", charStart: idx("(a) Notwithstanding"), charEnd: idx("(a) Notwithstanding") + 3, ambiguous: false },
      { nodeId: "cl-1cb", sectionRef: "1(c)(b)", nodeType: "CLAUSE", heading: "", charStart: idx("(b) Notwithstanding"), charEnd: idx("(b) Notwithstanding") + 3, ambiguous: false },
      { nodeId: "sub-601e", sectionRef: "6.01(e)", nodeType: "SUBSECTION", heading: "6.01(e) Indebtedness.", charStart: idx("6.01(e)"), charEnd: idx("6.01(e)") + 6, ambiguous: false },
      { nodeId: "cl-601ei", sectionRef: "6.01(e)(i)", nodeType: "CLAUSE", heading: "", charStart: idx("(i) This clause"), charEnd: idx("(i) This clause") + 3, ambiguous: false },
    ] as never;
    const candidates = discoverCovenantCandidates("rule174-test", text, nodes);
    const excerpts = candidates.map((c) => c.excerpt);
    expect(excerpts.some((e) => e.includes("Availability tests"))).toBe(true);
    expect(excerpts.some((e) => e.includes("Swingline Sublimit"))).toBe(true);
    expect(excerpts.some((e) => e.includes("Permitted Indebtedness"))).toBe(true);
    // The covered parent's restating clause must not surface as its
    // own candidate (the parent's excerpt legitimately contains the
    // clause text — the parent covers it).
    expect(candidates.some((c) => c.nodeId === "cl-601ei")).toBe(false);
    expect(candidates.some((c) => c.nodeId === "cl-1ca")).toBe(true);
    expect(candidates.some((c) => c.nodeId === "cl-1cb")).toBe(true);
  });
});

describe("rule 175: operative amendment phrasing admits amendment content", () => {
  async function candidatesFor(heading: string, body: string) {
    const { discoverCovenantCandidates } = await import("../../lib/knowledge-factory/pipeline/candidates");
    const text = `${heading}\n${body}`;
    const nodes = [
      { nodeId: "n1", sectionRef: "2.1", nodeType: "SECTION", heading, charStart: 0, charEnd: heading.length, ambiguous: false },
    ] as never;
    return discoverCovenantCandidates("rule175-test", text, nodes);
  }

  it("an operative amendment ('hereby amended') is admitted", async () => {
    const c = await candidatesFor(
      "2.1 Amendments to Section 1.01",
      "Section 1.01 of the Existing Credit Agreement is hereby amended as follows: the defined term Maturity Date is amended and restated in its entirety to read as follows: Maturity Date means September 30, 2031.",
    );
    expect(c).toHaveLength(1);
  });

  it("a procedural amendments section ('may not be amended') stays out", async () => {
    const c = await candidatesFor(
      "10.02 Amendments; Waivers",
      "This Agreement may not be amended, waived or otherwise modified except by an instrument in writing signed by the Required Lenders and the Borrower.",
    );
    expect(c).toHaveLength(0);
  });
});

describe("rule 188: section title truncated at its own body-start", () => {
  function headingsFor(text: string) {
    const { nodes } = extractStructure("rule188-test", text);
    // Both confident nodes and ambiguous-candidate nodes surface here;
    // the heading must be the cleaned title in either case.
    return nodes.filter((n) => n.nodeType === "SECTION").map((n) => ({ ref: n.sectionRef, heading: n.heading, ambiguous: n.ambiguous }));
  }

  it("an underlined heading glued to its chapeau truncates to the noun-phrase title", () => {
    const text = [
      "6.3. Maintenance of Properties The Parent will maintain its properties.",
      "",
      "6.4. Conduct of Business The Parent will, and will cause each Subsidiary to, (a) carry on and conduct its business in substantially the same manner, and (b) do all things necessary to preserve its existence.",
      "",
      "6.5. Taxes The Borrower shall pay all taxes.",
    ].join("\n");
    const headings = headingsFor(text);
    const h64 = headings.find((h) => h.ref === "6.4");
    expect(h64).toBeDefined();
    expect(h64!.heading).toBe("Conduct of Business");
    expect(headings.find((h) => h.ref === "6.3")!.heading).toBe("Maintenance of Properties");
    expect(headings.find((h) => h.ref === "6.5")!.heading).toBe("Taxes");
  });

  it("a title legitimately containing a party name without a modal is untouched", () => {
    const text = [
      "10.1. Notices to the Borrower. All notices shall be in writing.",
      "",
      "10.2. Guarantor Representations. Each Guarantor represents as follows.",
      "",
      "10.3. Payment of Principal. The Borrower shall pay principal when due.",
    ].join("\n");
    const headings = headingsFor(text);
    expect(headings.find((h) => h.ref === "10.1")!.heading).toBe("Notices to the Borrower");
    expect(headings.find((h) => h.ref === "10.2")!.heading).toBe("Guarantor Representations");
    expect(headings.find((h) => h.ref === "10.3")!.heading).toBe("Payment of Principal");
  });
});

describe("rule 192: mid-line heading whose terminator sits past the first line", () => {
  it("recovers a heading + chapeau + except: whose (a) is two lines down (Aon 6.11 shape)", () => {
    const text = [
      "The Parent shall not dispose of assets.",
      "",
      "6.11. Liens The Parent will not, nor will it permit any other Loan Party to, create, incur, or suffer to exist any Lien in, of or on the",
      "Property of the Parent or any other Loan Party, except:",
      "(a) Liens for taxes, assessments or governmental charges or levies that are not delinquent.",
      "",
      "6.12. Affiliates The Parent will not enter into affiliate transactions.",
    ].join("\n");
    const { nodes } = extractStructure("rule192-test", text);
    const n = nodes.find((x) => x.sectionRef === "6.11");
    expect(n).toBeDefined();
    expect(n!.heading).toBe("Liens");
  });

  it("recovers a heading whose first terminal period is ~600 chars out (Aon 6.9 shape)", () => {
    const body =
      "The Parent will, and will cause each Subsidiary to, permit the Administrative Agent and its representatives, upon reasonable prior notice and during normal business hours, to visit and inspect the properties and books and records of the Parent and each Subsidiary, to examine and make copies of such books and records, and to discuss the affairs of the Parent and each Subsidiary with officers thereof.";
    expect(body.length).toBeGreaterThan(400);
    const text = [
      "The Parent shall maintain its properties.",
      "",
      `6.9. Inspection ${body}`,
      "",
      "6.10. Merger The Parent will not merge.",
    ].join("\n");
    const { nodes } = extractStructure("rule192-test-2", text);
    const n = nodes.find((x) => x.sectionRef === "6.9");
    expect(n).toBeDefined();
    expect(n!.heading).toBe("Inspection");
  });

  it("does not mint a node from a TOC entry split across blank lines", () => {
    const text = ["Article VI COVENANTS", "", "6.11.", "", "Liens", "", "58", "", "6.12.", "", "Affiliates", "", "60"].join("\n");
    const { nodes } = extractStructure("rule192-test-3", text);
    expect(nodes.filter((x) => x.sectionRef === "6.11")).toHaveLength(0);
    expect(nodes.filter((x) => x.sectionRef === "6.12")).toHaveLength(0);
  });

  it("the wider window does not mint a node from a mid-sentence citation", () => {
    const text = [
      "The Borrower shall deliver reports.",
      "",
      "The Borrower shall comply with Section 6.14. Financial Covenants (a) Consolidated Adjusted EBITDA to Consolidated Interest Expense of not less than 4.0 to 1.00, and shall maintain such ratio at all times.",
    ].join("\n");
    const { nodes } = extractStructure("rule192-test-4", text);
    expect(nodes.filter((x) => x.sectionRef === "6.14")).toHaveLength(0);
  });
});
