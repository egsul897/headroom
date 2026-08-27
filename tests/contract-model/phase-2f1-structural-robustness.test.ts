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
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeStructuralCoverage } from "../../lib/contract-model/compiler/structural-coverage";
import { runIndependentCoverageAudit } from "../../lib/contract-model/compiler/coverage-audit/pipeline";
import { computePackageSafety } from "../../lib/contract-model/compiler/package-safety";

function parse(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const defs = detectStructuralDefinitions(documentId, text, nodes);
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, defs, []);
  return { nodes, defs, index };
}

/** Builds a real multi-document StructuralIndex (needed for coverage-audit tests, which read getDocumentText per document). */
function buildMultiDocIndex(docs: { documentId: string; text: string }[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefs = [];
  const allRefs = [];
  for (const doc of docs) {
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.documentId, text: doc.text });
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefs.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allRefs.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefs, allRefs);
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

describe("Phase 2F.1 - structural coverage/health (task §16, items 12-17)", () => {
  it("12. a healthy, fully-parsed document reports STRUCTURE_HEALTHY", () => {
    const text = [
      "SECTION 6.01 Indebtedness.\nThe Borrower shall not incur Indebtedness except as permitted under this Section.",
      "SECTION 6.02 Liens.\nThe Borrower shall not create Liens except as permitted under this Section.",
      "SECTION 6.03 Restricted Payments.\nThe Borrower shall not make Restricted Payments except as permitted under this Section.",
    ].join("\n");
    const { nodes } = parse("d1", text);
    const cov = computeStructuralCoverage("d1", text, nodes);
    expect(cov.health).toBe("STRUCTURE_HEALTHY");
    expect(cov.coveragePercent).toBeGreaterThan(90);
  });

  it("13. a partially-parsed document (real content before the first recognized heading) downgrades below HEALTHY", () => {
    const preamble = "A".repeat(500) + " some real recital text that establishes the parties and background of this agreement in real detail, spanning enough characters to be significant. ".repeat(5);
    const text = preamble + "\nSECTION 1.01 Definitions.\nShort body.";
    const { nodes } = parse("d1", text);
    const cov = computeStructuralCoverage("d1", text, nodes);
    expect(cov.health).not.toBe("STRUCTURE_HEALTHY");
    expect(cov.significantUncoveredSpans.length).toBeGreaterThan(0);
  });

  it("14. a long source collapsing to one node is flagged (not silently HEALTHY), even though 100% of its own text is technically covered", () => {
    const body = "The Borrower shall not incur Indebtedness except as permitted. ".repeat(400); // ~26,000 chars, one giant undivided section
    const text = `SECTION 6.01 Indebtedness.\n${body}`;
    const { nodes } = parse("d1", text);
    const cov = computeStructuralCoverage("d1", text, nodes);
    expect(cov.topLevelNodeCount).toBe(1);
    expect(cov.health).not.toBe("STRUCTURE_HEALTHY");
  });

  it("14b. a long source with both a giant single node AND a large unrepresented preamble is STRUCTURE_INSUFFICIENT (the real CONMED-shaped case)", () => {
    const preamble = "Definitions text with no enclosing heading. ".repeat(600); // ~27,000 chars, never covered by any node
    const body = "The Borrower shall not incur Indebtedness except as permitted. ".repeat(400);
    const text = `${preamble}\nSECTION 6.01 Indebtedness.\n${body}`;
    const { nodes } = parse("d1", text);
    const cov = computeStructuralCoverage("d1", text, nodes);
    expect(cov.health).toBe("STRUCTURE_INSUFFICIENT");
  });

  it("15. a small, valid amendment with only a few nodes is STRUCTURE_HEALTHY - no hardcoded document-length threshold alone penalizes a genuinely short document", () => {
    const text = "SECTION 1. Amendments.\nSection 7.1 is hereby amended.\nSECTION 2. Conditions.\nThis Amendment becomes effective upon execution.\nSECTION 3. Miscellaneous.\nGoverning law is New York.";
    const { nodes } = parse("d1", text);
    const cov = computeStructuralCoverage("d1", text, nodes);
    expect(cov.topLevelNodeCount).toBeLessThanOrEqual(4);
    expect(cov.health).toBe("STRUCTURE_HEALTHY");
  });

  it("16. a real uncovered material span is reported with its own excerpt and substantive char count", () => {
    const preamble = "Real recital and defined-term text that never sits under any recognized heading. ".repeat(6);
    const text = preamble + "\nSECTION 1.01 Definitions.\nShort body.";
    const { nodes } = parse("d1", text);
    const cov = computeStructuralCoverage("d1", text, nodes);
    expect(cov.significantUncoveredSpans.length).toBeGreaterThan(0);
    expect(cov.significantUncoveredSpans[0]!.substantiveChars).toBeGreaterThan(40);
    expect(cov.significantUncoveredSpans[0]!.excerpt.length).toBeGreaterThan(0);
  });

  it("17. uncovered NON-substantive whitespace between real sections is never reported as a significant gap", () => {
    const text = "SECTION 1.01 Definitions.\nShort body.\n\n\n\n\n   \n\nSECTION 1.02 Interpretation.\nMore body.";
    const { nodes } = parse("d1", text);
    const cov = computeStructuralCoverage("d1", text, nodes);
    expect(cov.significantUncoveredSpans).toHaveLength(0);
  });
});

describe("Phase 2F.1 - auditor raw-source fallback (task §16, items 18-24)", () => {
  const OPTS = { companyId: "test-co", packageKey: "test-pkg", instrumentKey: null };

  it("18. a real material covenant sitting in a structurally-unavailable span is surfaced as RAW_SOURCE_COVENANT_SIGNAL", () => {
    const unstructured = "The Borrower shall not incur Indebtedness in excess of $50,000,000, provided that no Event of Default has occurred, except as otherwise permitted under this Agreement. ".repeat(2);
    const text = unstructured; // zero headings anywhere - the whole document is one uncovered span
    const index = buildMultiDocIndex([{ documentId: "docX", text }]);
    const result = runIndependentCoverageAudit({ ...OPTS, documentIds: ["docX"], index, candidates: [], packageGraph: null, bundles: [] });
    const covenantFindings = result.findings.filter((f) => f.documentId === "docX" && f.findingType === "RAW_SOURCE_COVENANT_SIGNAL");
    expect(covenantFindings.length).toBeGreaterThan(0);
  });

  it("19. amendment language sitting in a structurally-unavailable span is surfaced as RAW_SOURCE_AMENDMENT_SIGNAL", () => {
    const unstructured = "This Amendment hereby amends and restates Section 7.1 of the Credit Agreement, effective as of the Effective Date, subject to the conditions precedent set forth below. ".repeat(2);
    const index = buildMultiDocIndex([{ documentId: "docY", text: unstructured }]);
    const result = runIndependentCoverageAudit({ ...OPTS, documentIds: ["docY"], index, candidates: [], packageGraph: null, bundles: [] });
    const amendmentFindings = result.findings.filter((f) => f.documentId === "docY" && f.findingType === "RAW_SOURCE_AMENDMENT_SIGNAL");
    expect(amendmentFindings.length).toBeGreaterThan(0);
  });

  it("20. raw source with no covenant/amendment signals produces zero raw-source findings for that region (never a blanket finding)", () => {
    const unstructured = "The parties acknowledge receipt of this document and confirm their respective addresses for notice purposes are as set forth on the signature pages hereto. ".repeat(2);
    const index = buildMultiDocIndex([{ documentId: "docZ", text: unstructured }]);
    const result = runIndependentCoverageAudit({ ...OPTS, documentIds: ["docZ"], index, candidates: [], packageGraph: null, bundles: [] });
    const regionFindings = result.findings.filter((f) => f.documentId === "docZ" && (f.findingType === "RAW_SOURCE_COVENANT_SIGNAL" || f.findingType === "RAW_SOURCE_AMENDMENT_SIGNAL"));
    expect(regionFindings).toHaveLength(0);
  });

  it("21. fallback regions partition on real boundary evidence, never exceeding the max region budget", () => {
    const paragraph = "The Borrower shall not incur Indebtedness except as permitted under this Agreement, subject to customary exceptions. ";
    const unstructured = Array.from({ length: 60 }, () => paragraph).join("\n\n"); // many real paragraph boundaries, large total volume
    const index = buildMultiDocIndex([{ documentId: "docBig", text: unstructured }]);
    const result = runIndependentCoverageAudit({ ...OPTS, documentIds: ["docBig"], index, candidates: [], packageGraph: null, bundles: [] });
    const regionFindings = result.findings.filter((f) => f.documentId === "docBig" && f.findingType === "RAW_SOURCE_COVENANT_SIGNAL");
    expect(regionFindings.length).toBeGreaterThan(1); // a single ~7,000-char span must have been split into more than one region
  });

  it("22. a fully STRUCTURE_HEALTHY document with no significant uncovered spans produces zero raw-source-fallback findings (no duplicate auditing)", () => {
    const text = "SECTION 6.01 Indebtedness.\nThe Borrower shall not incur Indebtedness except as permitted.\nSECTION 6.02 Liens.\nThe Borrower shall not create Liens except as permitted.";
    const index = buildMultiDocIndex([{ documentId: "docHealthy", text }]);
    const result = runIndependentCoverageAudit({ ...OPTS, documentIds: ["docHealthy"], index, candidates: [], packageGraph: null, bundles: [] });
    const fallbackFindings = result.findings.filter((f) => f.documentId === "docHealthy" && (f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT" || f.findingType === "RAW_SOURCE_COVENANT_SIGNAL" || f.findingType === "RAW_SOURCE_AMENDMENT_SIGNAL"));
    expect(fallbackFindings).toHaveLength(0);
  });

  it("23. a raw-source finding's own sourceCitation preserves the real raw char offsets", () => {
    const unstructured = "The Borrower shall not incur Indebtedness in excess of $50,000,000, provided that no Event of Default has occurred. ".repeat(2);
    const index = buildMultiDocIndex([{ documentId: "docOffsets", text: unstructured }]);
    const result = runIndependentCoverageAudit({ ...OPTS, documentIds: ["docOffsets"], index, candidates: [], packageGraph: null, bundles: [] });
    const finding = result.findings.find((f) => f.documentId === "docOffsets" && f.findingType === "RAW_SOURCE_COVENANT_SIGNAL");
    expect(finding?.sourceCitation).toMatch(/docOffsets::raw\[\d+-\d+\]/);
  });

  it("24. tenant/document isolation - two documents' raw-source fallback findings never cross-contaminate", () => {
    const docAText = "The Borrower shall not incur Indebtedness in excess of $50,000,000, provided that no Default has occurred. ".repeat(2);
    const docBText = "This Amendment hereby amends and restates Section 7.1 of the Credit Agreement, subject to conditions precedent. ".repeat(2);
    const index = buildMultiDocIndex([
      { documentId: "tenantDocA", text: docAText },
      { documentId: "tenantDocB", text: docBText },
    ]);
    const result = runIndependentCoverageAudit({ ...OPTS, documentIds: ["tenantDocA", "tenantDocB"], index, candidates: [], packageGraph: null, bundles: [] });
    const aFindings = result.findings.filter((f) => f.documentId === "tenantDocA");
    const bFindings = result.findings.filter((f) => f.documentId === "tenantDocB");
    expect(aFindings.every((f) => f.sourceCitation.startsWith("tenantDocA"))).toBe(true);
    expect(bFindings.every((f) => f.sourceCitation.startsWith("tenantDocB"))).toBe(true);
    expect(aFindings.some((f) => f.findingType === "RAW_SOURCE_COVENANT_SIGNAL")).toBe(true);
    expect(bFindings.some((f) => f.findingType === "RAW_SOURCE_AMENDMENT_SIGNAL")).toBe(true);
  });
});

describe("Phase 2F.1 - fault injection: deliberately unrecognizable source (task §17)", () => {
  it("proves the full safety chain: raw coverage decreases, health downgrades, the auditor audits the uncovered span, material signal surfaces, and package safety downgrades - dangerous silence does not occur", () => {
    // A real amendment-shaped document using a numbering convention the parser cannot recognize at all (roman-numeral-dot style, deliberately outside every supported pattern).
    const injectedText =
      "I. Amendment. This Amendment hereby amends and restates Section 7.1 of the Credit Agreement to increase the Indebtedness basket to $100,000,000, subject to the conditions precedent set forth below. II. Effectiveness. This Amendment becomes effective upon execution by all parties.";

    const healthyText = "SECTION 6.01 Indebtedness.\nThe Borrower shall not incur Indebtedness except as permitted under this Section.";

    const { nodes: injectedNodes } = parse("injected", injectedText);
    const injectedCoverage = computeStructuralCoverage("injected", injectedText, injectedNodes);
    // 1. raw coverage decreases / structural health downgrades
    expect(injectedCoverage.topLevelNodeCount).toBe(0);
    expect(injectedCoverage.health).toBe("STRUCTURE_FAILED");

    const index = buildMultiDocIndex([
      { documentId: "injected", text: injectedText },
      { documentId: "healthy", text: healthyText },
    ]);
    const auditResult = runIndependentCoverageAudit({ companyId: "c", packageKey: "p", instrumentKey: null, documentIds: ["injected", "healthy"], index, candidates: [], packageGraph: null, bundles: [] });

    // 2. Phase 2E audits the uncovered span and 3. material covenant/amendment signal is surfaced
    const injectedFindings = auditResult.findings.filter((f) => f.documentId === "injected");
    expect(injectedFindings.some((f) => f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT")).toBe(true);
    expect(injectedFindings.some((f) => f.findingType === "RAW_SOURCE_AMENDMENT_SIGNAL")).toBe(true);
    expect(injectedFindings.some((f) => f.findingType === "RAW_SOURCE_COVENANT_SIGNAL")).toBe(true);

    // 4. package safety downgrades
    const safety = computePackageSafety("p", [
      { documentId: "injected", documentText: injectedText, coverage: injectedCoverage, discoveryCandidateCount: 0 },
      { documentId: "healthy", documentText: healthyText, coverage: computeStructuralCoverage("healthy", healthyText, parse("healthy", healthyText).nodes), discoveryCandidateCount: 1 },
    ]);
    expect(safety.state).toBe("PACKAGE_UNSAFE");
    expect(safety.documents.find((d) => d.documentId === "injected")?.potentiallyRelevantAmendmentNotFullyAnalyzed).toBe(true);

    // 5. dangerous silence does not occur: the healthy document's own safety entry is unaffected (no cross-contamination), and the injected document's real problem is visible from BOTH the coverage model and the auditor, never silent.
    expect(safety.documents.find((d) => d.documentId === "healthy")?.structuralInputInsufficient).toBe(false);
  });
});
