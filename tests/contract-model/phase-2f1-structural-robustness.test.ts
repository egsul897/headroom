/**
 * Phase 2F.1 §16 - synthetic structural-robustness corpus. Generalized
 * shapes only (never CONMED-specific text/company names in the
 * assertions themselves, per this task's own "do not tune covenant
 * discovery semantics against CONMED" and the established "production
 * logic must not contain company names" discipline this repo already
 * follows for FWRG/LSB).
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

describe("Phase 2F.1 - colon-style defined terms (task §16, items 1-6)", () => {
  it("1. quoted term + colon", () => {
    const { defs } = parse("d1", 'Section 1.1 Defined Terms. "Applicable Rate": the rate per annum set forth in the Pricing Grid.');
    expect(defs.map((d) => d.exactTerm.trim())).toContain("Applicable Rate");
  });

  it("2. unquoted term + colon", () => {
    const { defs } = parse("d1", "Section 1.1 Defined Terms.\nApplicable Rate: the rate per annum set forth in the Pricing Grid.");
    expect(defs.map((d) => d.exactTerm.trim())).toContain("Applicable Rate");
  });

  it("3. multiline colon definition (term and body wrap across lines, matching real CONMED formatting)", () => {
    const { defs } = parse(
      "d1",
      '"Consolidated\nSenior Secured Leverage Ratio": the ratio, as of any date of\ndetermination, of Consolidated Senior Secured Indebtedness to Consolidated EBITDA.'
    );
    expect(defs.map((d) => d.exactTerm.replace(/\s+/g, " ").trim())).toContain("Consolidated Senior Secured Leverage Ratio");
  });

  it("4. definition containing an internal colon does not truncate the captured term or spuriously start a second definition mid-body", () => {
    const { defs } = parse("d1", '"Permitted Ratio": determined as follows: the numerator is Debt and the denominator is EBITDA.');
    const term = defs.find((d) => d.exactTerm.trim() === "Permitted Ratio");
    expect(term).toBeDefined();
    // the internal colon after "follows" must not itself be read back as a second term boundary immediately inside the body
    expect(defs.filter((d) => d.charStart > (term?.charStart ?? -1) && d.charStart < (term?.charStart ?? -1) + 20)).toHaveLength(0);
  });

  it("5. a colon heading that is not a definition must not be detected (real false-positive risk: 'WITNESSETH:' / a spaced-letter recital marker)", () => {
    const { defs } = parse("d1", "W I T N E S S E T H :\nWHEREAS, the parties wish to enter into this Amendment;");
    expect(defs.map((d) => d.exactTerm)).not.toContain("W I T N E S S E T H");
  });

  it("5b. an all-caps section-style colon heading is not a definition", () => {
    const { defs } = parse("d1", "NEGATIVE COVENANTS:\nThe Borrower shall not incur Indebtedness.");
    expect(defs.map((d) => d.exactTerm)).not.toContain("NEGATIVE COVENANTS");
  });

  it("6. a table/list label is not a definition (no trailing colon at all, so it must never match)", () => {
    const { defs } = parse("d1", "Schedule 1\nNotice Addresses\nSchedule 2\nInvestment Property");
    expect(defs).toHaveLength(0);
  });

  it("6b. similarly-named terms are each captured distinctly, not merged", () => {
    const { defs } = parse("d1", '"Consolidated Total Leverage Ratio": the ratio described in Section 7.1(b).\n"Consolidated Senior Secured Leverage Ratio": the ratio described in Section 7.1(a).');
    const terms = defs.map((d) => d.exactTerm.trim());
    expect(terms).toContain("Consolidated Total Leverage Ratio");
    expect(terms).toContain("Consolidated Senior Secured Leverage Ratio");
  });

  it("6c. a definition boundary correctly separates into the next term (colon-style adjacency, real CONMED shape)", () => {
    const { defs } = parse("d1", '" ABR Loans ": Loans the rate of interest applicable to which is based upon the Alternate Base Rate.\n" Acquired Companies ": the Persons acquired pursuant to the Acquisition.');
    const terms = defs.map((d) => d.exactTerm.trim());
    expect(terms).toEqual(["ABR Loans", "Acquired Companies"]);
  });

  it("existing means-style detection is unaffected by the new colon patterns (regression)", () => {
    const { defs } = parse("d1", '"Consolidated EBITDA" means net income adjusted as set forth herein.');
    expect(defs.map((d) => d.exactTerm)).toContain("Consolidated EBITDA");
  });
});

describe("Phase 2F.1 - flat integer amendment sections (task §16, items 7-11)", () => {
  it("7-8. keyword-prefixed flat integer sections ('SECTION 1. Amendment', 'SECTION 2. Conditions') are recognized as top-level SECTION nodes", () => {
    const text = "SECTION 1. Amendments .\nThe Credit Agreement is hereby amended.\nSECTION 2. Conditions .\nThis Amendment becomes effective upon satisfaction of the following.";
    const { nodes } = parse("d1", text);
    const sections = nodes.filter((n) => n.nodeType === "SECTION");
    expect(sections.map((s) => s.sectionRef)).toEqual(expect.arrayContaining(["1", "2"]));
  });

  it("8b. bare integer sections with no 'Section' keyword at all are recognized", () => {
    const text = "1. Amendments\nThe Credit Agreement is hereby amended as follows.\n2. Conditions\nThis Amendment becomes effective upon satisfaction of the following.\n3. Representations\nEach party represents and warrants as follows.";
    const { nodes } = parse("d1", text);
    const sections = nodes.filter((n) => n.nodeType === "SECTION");
    expect(sections.map((s) => s.sectionRef)).toEqual(expect.arrayContaining(["1", "2", "3"]));
  });

  it("9. integer sections correctly host nested (a)/(i) clause hierarchy beneath them", () => {
    const text = "SECTION 1. Amendments .\n(a) Section 7.1 is hereby amended.\n(i) by deleting the reference to $75,000,000.\n(ii) by substituting $100,000,000.\n(b) Section 7.2 is hereby amended.";
    const { nodes } = parse("d1", text);
    const sec1 = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === "1");
    expect(sec1).toBeDefined();
    const subsections = nodes.filter((n) => n.nodeType === "SUBSECTION" && n.parentSectionRef === "1");
    expect(subsections.map((s) => s.sectionRef)).toEqual(expect.arrayContaining(["1(a)", "1(b)"]));
    const clauses = nodes.filter((n) => n.nodeType === "CLAUSE" && n.parentSectionRef === "1(a)");
    expect(clauses.map((c) => c.sectionRef)).toEqual(expect.arrayContaining(["1(a)(i)", "1(a)(ii)"]));
  });

  it("10. an ordinary numbered list embedded inside a real decimal-numbered section must NOT be promoted to top-level sections (regression guard)", () => {
    const text = "SECTION 7.2 Limitation on Indebtedness.\nCreate, incur or assume Indebtedness, except:\n1. Indebtedness under Loan Documents.\n2. Intercompany Indebtedness.\n3. Purchase money Indebtedness.";
    const { nodes } = parse("d1", text);
    const topLevelSections = nodes.filter((n) => n.nodeType === "SECTION");
    // the only real SECTION is 7.2 - the "1."/"2."/"3." list items must not become sibling top-level sections
    expect(topLevelSections.map((s) => s.sectionRef)).toEqual(["7.2"]);
  });

  it("11. mixed Section-style + integer-style document: a decimal-numbered body coexisting with flat-integer amendment sections in the same text both parse correctly", () => {
    const text = "SECTION 7.1 Financial Covenant.\nThe Leverage Ratio shall not exceed 3.75 to 1.00.\nSECTION 1. Amendments .\nSection 7.1 is hereby amended and restated.";
    const { nodes } = parse("d1", text);
    const refs = nodes.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef);
    expect(refs).toEqual(expect.arrayContaining(["7.1", "1"]));
  });

  it("existing decimal-style detection is unaffected by the new integer patterns (regression)", () => {
    const text = "SECTION 6.01 Indebtedness.\nThe Borrower shall not incur Indebtedness except as permitted.\nSECTION 6.02 Liens.\nThe Borrower shall not create Liens.";
    const { nodes } = parse("d1", text);
    const refs = nodes.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef);
    expect(refs).toEqual(["6.01", "6.02"]);
  });
});
