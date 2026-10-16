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
