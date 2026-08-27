/**
 * Phase 2E - the required 38 adversarial synthetic scenarios (task §24):
 * Discovery attacks (1-18), Context attacks (19-32), Auditor quality
 * controls (33-38). Every test asserts observable auditor behavior
 * (finding type/materiality/comparison result), never an internal
 * implementation detail. No FWRG/LSB-specific section numbers, thresholds,
 * or company names appear anywhere in this file (task §7's own
 * instruction) - the real-package audit is a separate script
 * (scripts/phase-2e-audit-fwrg-lsb.ts).
 */
import { describe, expect, it } from "vitest";
import { buildSourceCoverageInventory } from "../../lib/contract-model/compiler/coverage-audit/source-inventory";
import { auditDiscoveryCoverage } from "../../lib/contract-model/compiler/coverage-audit/discovery-comparison";
import { auditContextCoverage } from "../../lib/contract-model/compiler/coverage-audit/context-comparison";
import { auditDefinitionCompleteness } from "../../lib/contract-model/compiler/coverage-audit/definition-audit";
import { buildIndependentContextExpectations } from "../../lib/contract-model/compiler/coverage-audit/context-inventory";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { buildTestIndex, buildExactTermsByDocument, makeCandidate, removeItem, removeUnresolved } from "./coverage-audit-test-utils";

const DOC = "doc";

describe("Phase 2E discovery attacks (1-18)", () => {
  it("1. covenant outside expected covenant article is still independently flagged", () => {
    const text = `ARTICLE 9 MISCELLANEOUS Section 9.05. Currency Matters . Notwithstanding anything herein to the contrary, the Borrower shall not permit the aggregate outstanding principal amount of Indebtedness denominated in a currency other than Dollars to exceed $10,000,000 at any time.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    expect(findings.some((f) => f.findingType === "MATERIAL_DISCOVERY_MISS" && f.materiality === "MATERIAL")).toBe(true);
  });

  it("2. restriction expressed without 'shall not' is still caught via other signals", () => {
    const text = `SECTION 6.01. Indebtedness . No Restricted Subsidiary is permitted to incur Indebtedness in excess of $20,000,000 in the aggregate.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.sectionRef === "6.01" && r.detectedSignals.includes("permit_permitted"))).toBe(true);
    const findings = auditDiscoveryCoverage(regions, [], index);
    expect(findings.some((f) => f.materiality === "MATERIAL")).toBe(true);
  });

  it("3. permission without a currency threshold is UNCERTAIN, not silently dropped, when undiscovered", () => {
    const text = `SECTION 6.06. Investments . The Borrower may make Investments in Unrestricted Subsidiaries so long as no Default has occurred and is continuing.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    const finding = findings.find((f) => f.documentId === DOC && f.sourceCitation.includes("6.06"));
    expect(finding).toBeDefined();
    expect(finding!.materiality).toBe("UNCERTAIN");
  });

  it("4. an exception embedded in ordinary prose (not a separate lettered clause) is still detected", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness; provided that Indebtedness incurred to finance a Permitted Acquisition in an amount not to exceed the greater of $15,000,000 and 20% of Consolidated EBITDA shall be permitted notwithstanding the foregoing.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    expect(findings.some((f) => f.materiality === "MATERIAL" && f.sourceCitation.includes("6.01"))).toBe(true);
  });

  it("5. a multi-basket section whose parser only separates the FIRST item flags the remaining swallowed items as possibleUnstructuredMultiItem (mirrors the real Phase 2A comma/sequence-boundary limitation)", () => {
    const text = `SECTION 6.02. Liens . The Borrower shall not create Liens, except (i) Liens securing Indebtedness in an amount not to exceed $10,000,000, (ii) Liens securing Indebtedness in an amount not to exceed the greater of $5,000,000 and 10% of Consolidated EBITDA, and (iii) Liens so long as the Total Leverage Ratio does not exceed 3.00:1.00.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    // The structural parser only separates clause (i) into its own node here
    // (a real, pre-existing Phase 2A sequence-boundary limitation, same
    // class as the known LSB 6.14(b)/(c)/(d) comma-list gap) - (ii)/(iii)
    // are swallowed into (i)'s own DESCENDANTS span rather than 6.02's.
    const region = regions.find((r) => r.sectionRef === "6.02(i)");
    expect(region?.possibleUnstructuredMultiItem).toBe(true);
    expect(region!.inlineEnumeratedItemCount).toBeGreaterThanOrEqual(2);
  });

  it("6. parent discovered but nested lettered basket omitted is PARTIALLY_DISCOVERED, not credited as covered", () => {
    const text = `SECTION 6.03. Restricted Payments . The Borrower shall not make Restricted Payments except: (a) dividends not to exceed $5,000,000 per annum; (b) repurchases of Equity Interests not to exceed $10,000,000 in the aggregate.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const parentNode = index.getNodeByRef(DOC, "6.03")!;
    const candidates: DiscoveredCandidate[] = [makeCandidate({ documentId: DOC, structuralNodeKeys: [parentNode.nodeKey], normalizedSourceRef: "6.03" })];
    const findings = auditDiscoveryCoverage(regions, candidates, index);
    const childFinding = findings.find((f) => f.sourceCitation.includes("6.03(b)"));
    expect(childFinding).toBeDefined();
    expect(childFinding!.findingType).toBe("PARTIAL_DISCOVERY");
  });

  it("7. a bare percentage basket is detected", () => {
    const text = `SECTION 6.06. Investments . The Borrower shall not make Investments in an amount exceeding 15% of Consolidated Total Assets.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.detectedSignals.includes("percentage"))).toBe(true);
  });

  it("8. a bare ratio basket is detected", () => {
    const text = `SECTION 6.10. Financial Covenant . The Borrower shall not permit the Total Leverage Ratio to exceed 4.00:1.00 as of the last day of any fiscal quarter.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.detectedSignals.includes("ratio_expression"))).toBe(true);
  });

  it("9-10. a grower / greater-of basket is detected and classified BUILDER_GROWER_CANDIDATE", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower may incur Indebtedness not to exceed the greater of $10,000,000 and 15% of Consolidated EBITDA.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const region = regions.find((r) => r.sectionRef === "6.01");
    expect(region?.detectedSignals).toContain("greater_of");
    expect(region?.probableRole).toBe("BUILDER_GROWER_CANDIDATE");
  });

  it("11. a builder basket (Retained Excess Cash Flow) is detected", () => {
    const text = `SECTION 6.06. Investments . The Borrower may make Investments in an amount equal to the Retained Excess Cash Flow Amount.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.detectedSignals.includes("builder_basket"))).toBe(true);
  });

  it("12. a shared cap across clauses is detected", () => {
    const text = `SECTION 6.06. Investments . The aggregate amount of Investments made in reliance on this clause (c) and clause (d) below shall not exceed $25,000,000.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const region = regions.find((r) => r.sectionRef === "6.06");
    expect(region?.probableRole).toBe("SHARED_CAP_CANDIDATE");
  });

  it("13. a reclassification right is detected", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower may at any time reclassify all or a portion of such Indebtedness incurred under this Section 6.01 as Indebtedness incurred under another provision hereof.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.detectedSignals.includes("reclassification"))).toBe(true);
  });

  it("14. anti-double-counting language is detected", () => {
    const text = `SECTION 6.01. Indebtedness . For purposes of this Section 6.01, without duplication, any amount included as Indebtedness shall not also be included as an Investment.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.detectedSignals.includes("anti_duplication"))).toBe(true);
  });

  it("15. an ordinary-course exception with a real threshold is material", () => {
    const text = `SECTION 6.07. Affiliate Transactions . The Borrower shall not enter into transactions with Affiliates except for transactions in the ordinary course of business consistent with past practice involving aggregate consideration not to exceed $2,000,000.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    expect(findings.some((f) => f.materiality === "MATERIAL" && f.sourceCitation.includes("6.07"))).toBe(true);
  });

  it("16. a covenant mechanic hidden inside a definition's own text is still detected", () => {
    const text = `SECTION 1.01. Defined Terms . " Permitted Refinancing Indebtedness " means Indebtedness constituting a refinancing of existing Indebtedness; provided that the aggregate principal amount thereof shall not exceed $50,000,000.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    expect(findings.some((f) => f.materiality === "MATERIAL" && f.sourceCitation.includes("1.01"))).toBe(true);
  });

  it("17. a covenant mechanic hidden in a miscellaneous/calculation section is still detected", () => {
    const text = `SECTION 9.01. Miscellaneous . For purposes of calculating compliance with any Dollar-denominated restriction, no Default shall be deemed to exist solely as a result of fluctuations in currency exchange rates; provided that if the aggregate principal amount exceeds $100,000,000 the Borrower shall promptly notify the Administrative Agent.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    expect(findings.some((f) => f.materiality === "MATERIAL" && f.sourceCitation.includes("9.01"))).toBe(true);
  });

  it("18. a reserved section with genuinely no covenant content produces no finding", () => {
    const text = `SECTION 6.05. [Reserved]. SECTION 6.06. Investments . The Borrower shall not make Investments in excess of $1,000,000.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.sectionRef === "6.05")).toBe(false);
  });
});

describe("Phase 2E context attacks (19-32)", () => {
  function buildCorrectBundle(text: string, sectionRef: string) {
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const exactTerms = buildExactTermsByDocument([{ documentId: DOC, label: "CA", text }]);
    const node = index.getNodeByRef(DOC, sectionRef)!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], normalizedSourceRef: sectionRef });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: "c", instrumentKey: null }, { index, packageGraph: null, exactTermsByDocument: exactTerms });
    return { index, bundle, node };
  }

  it("19. parent prohibition omitted from the bundle is caught", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness. (a) Indebtedness not to exceed $5,000,000 shall be permitted.`;
    const { index, bundle } = buildCorrectBundle(text, "6.01(a)");
    const corrupted = removeItem(bundle, "PARENT_SCOPE", "6.01");
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.01(a)")!.nodeKey, index, packageGraph: null, bundle: corrupted });
    expect(findings.some((f) => f.findingType === "MISSING_PARENT_CONTEXT")).toBe(true);
  });

  it("20. a trailing proviso omitted from the bundle is caught", () => {
    const text = `SECTION 6.01. Indebtedness . (a) Indebtedness not to exceed $5,000,000 shall be permitted. (b) provided that no Default shall have occurred and is continuing at the time of such incurrence.`;
    const { index, bundle } = buildCorrectBundle(text, "6.01(a)");
    const corrupted = removeItem(bundle, "PROVISO", "6.01(b)");
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.01(a)")!.nodeKey, index, packageGraph: null, bundle: corrupted });
    expect(findings.some((f) => f.findingType === "MISSING_PROVISO")).toBe(true);
  });

  it("21. a shared cap omitted from the bundle is caught", () => {
    const text = `SECTION 6.06. Investments . (a) Investments not to exceed $5,000,000 shall be permitted. (b) the aggregate amount of Investments made under clause (a) and this clause (b) shall not exceed $10,000,000.`;
    const { index, bundle } = buildCorrectBundle(text, "6.06(a)");
    const corrupted = removeItem(bundle, "SHARED_CAP", "6.06(b)");
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.06(a)")!.nodeKey, index, packageGraph: null, bundle: corrupted });
    expect(findings.some((f) => f.findingType === "MISSING_SHARED_CAP")).toBe(true);
  });

  it("22. a nested definition omitted from both items and unresolved is a silent gap", () => {
    const text = `SECTION 6.10. Financial Covenant . The Borrower shall not permit "Consolidated Leverage Ratio" to exceed 4.00:1.00. " Consolidated Leverage Ratio " means the ratio of Consolidated Total Debt to "Consolidated EBITDA" . " Consolidated Total Debt " means total funded debt. " Consolidated EBITDA " means net income plus interest, taxes, depreciation and amortization.`;
    const { index, bundle } = buildCorrectBundle(text, "6.10");
    const corrupted = removeUnresolved(removeItem(bundle, "DEFINITION_DEPENDENCY", "Consolidated EBITDA"), "Consolidated EBITDA");
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.10")!.nodeKey, index, packageGraph: null, bundle: corrupted });
    expect(findings.some((f) => f.findingType === "MISSING_DEFINITION_DEPENDENCY")).toBe(true);
  });

  it("23. a definition exclusion dropped from the bundle's stored excerpt is caught by the definition-content audit", () => {
    const text = `SECTION 6.06. Investments . The Borrower shall not make "Investments" in excess of $5,000,000. " Investments " means any acquisition of Equity Interests, but excludes ordinary course trade receivables and shall not exceed the amount permitted under Section 6.01.`;
    const { index, bundle } = buildCorrectBundle(text, "6.06");
    const defItem = bundle.items.find((i) => i.type === "DEFINITION" && i.normalizedRef === "Investments")!;
    expect(defItem).toBeDefined();
    const truncated = { ...bundle, items: bundle.items.map((i) => (i.itemId === defItem.itemId ? { ...i, excerptText: i.excerptText.split("excludes")[0]! } : i)) };
    const findings = auditDefinitionCompleteness(truncated, index, DOC, "c", "p", null);
    expect(findings.some((f) => f.findingType === "MISSING_DEFINITION_DEPENDENCY" && f.sourceEvidence.includes("exclusion"))).toBe(true);
  });

  it("24. a material calculation cross-reference omitted from the bundle is caught", () => {
    const text = `SECTION 6.10. Financial Covenant . The Borrower shall not permit the Leverage Ratio to exceed 4.00:1.00, calculated in accordance with the pro forma methodology set forth in Section 1.05. SECTION 1.05. Pro Forma Calculations . Pro forma compliance shall be determined using the accounting principles set forth herein.`;
    const { index, bundle } = buildCorrectBundle(text, "6.10");
    const corrupted = removeUnresolved(removeItem(bundle, "CALCULATION_PROVISION", "1.05"), "1.05");
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.10")!.nodeKey, index, packageGraph: null, bundle: corrupted });
    expect(findings.some((f) => f.findingType === "SILENT_UNRESOLVED_DEPENDENCY" && f.sourceCitation.includes("1.05"))).toBe(true);
  });

  it("25. an entity-scope sibling provision omitted from the bundle is caught", () => {
    const text = `SECTION 6.01. Indebtedness . (a) Indebtedness not to exceed $5,000,000 shall be permitted. (b) This Section 6.01 shall apply only to Restricted Subsidiaries that are Domestic Subsidiaries.`;
    const { index, bundle } = buildCorrectBundle(text, "6.01(a)");
    const corrupted = removeItem(bundle, "ENTITY_SCOPE", "6.01(b)");
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.01(a)")!.nodeKey, index, packageGraph: null, bundle: corrupted });
    expect(findings.some((f) => f.findingType === "MISSING_ENTITY_SCOPE")).toBe(true);
  });

  it("26. a direct material cross-reference omitted from both items and unresolved is a silent gap", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness except as permitted under the calculation methodology in Section 1.06. SECTION 1.06. Calculation of Amounts . For purposes of determination of compliance, accounting principles shall be applied consistently.`;
    const { index, bundle } = buildCorrectBundle(text, "6.01");
    const corrupted = removeUnresolved(removeItem(removeItem(bundle, "CROSS_REFERENCE", "1.06"), "CALCULATION_PROVISION", "1.06"), "1.06");
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.01")!.nodeKey, index, packageGraph: null, bundle: corrupted });
    expect(findings.some((f) => f.findingType === "SILENT_UNRESOLVED_DEPENDENCY" && f.sourceCitation.includes("1.06"))).toBe(true);
  });

  it("27. a relative reference already surfaced as unresolved by Phase 2D produces no false auditor claim (known V1 limitation: relative references are not independently modeled)", () => {
    const text = `SECTION 6.01. Indebtedness . Indebtedness permitted under the preceding paragraph shall not exceed $5,000,000.`;
    const { index, bundle } = buildCorrectBundle(text, "6.01");
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.01")!.nodeKey, index, packageGraph: null, bundle });
    // The auditor does not independently detect relative references (only absolute SECTION/ARTICLE/SCHEDULE/EXHIBIT mentions via Phase 2A's node-anchored index) - it must never fabricate a finding about text it cannot independently evaluate.
    expect(findings.some((f) => f.sourceEvidence.includes("preceding paragraph"))).toBe(false);
  });

  it("28. a missing amendment lead for a real modification candidate is caught", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const { index, bundle } = buildCorrectBundle(text, "6.01");
    const packageGraph = {
      companyId: "c",
      packageKey: "p",
      classifications: [],
      identities: [],
      relationshipCandidates: [],
      modificationCandidates: [{ sourceDocumentId: "amendment-doc", sourceNodeCitation: "amendment-doc::1", sourceText: "Section 6.01 is hereby amended and restated in its entirety to increase the threshold to $10,000,000", operation: "RESTATE" as const, targetDocumentId: DOC, targetHint: null, targetSectionRef: "6.01", targetDefinedTermRef: null, status: "RESOLVED" as const, unresolvedReason: null, confidence: 0.9 }],
      crossDocumentReferenceLeads: [],
      instruments: [],
      performance: { documentCount: 2, totalCharsScanned: 0, relationshipCandidatesGenerated: 0, relationshipsResolved: 0, relationshipsUnresolved: 0, modificationCandidatesGenerated: 1, crossDocumentReferenceLeadsGenerated: 0, wallClockMs: 0, semanticCallsUsed: 0 },
    };
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.01")!.nodeKey, index, packageGraph, bundle });
    expect(findings.some((f) => f.findingType === "MISSING_AMENDMENT_LEAD")).toBe(true);
  });

  it("29. a missing supplement lead for a real modification candidate is caught", () => {
    const text = `SECTION 6.02. Liens . The Borrower shall not create Liens in excess of $5,000,000.`;
    const { index, bundle } = buildCorrectBundle(text, "6.02");
    const packageGraph = {
      companyId: "c",
      packageKey: "p",
      classifications: [],
      identities: [],
      relationshipCandidates: [],
      modificationCandidates: [{ sourceDocumentId: "supplement-doc", sourceNodeCitation: "supplement-doc::1", sourceText: "Section 6.02 is hereby amended by adding a new clause permitting additional Liens", operation: "ADD" as const, targetDocumentId: DOC, targetHint: null, targetSectionRef: "6.02", targetDefinedTermRef: null, status: "RESOLVED" as const, unresolvedReason: null, confidence: 0.9 }],
      crossDocumentReferenceLeads: [],
      instruments: [],
      performance: { documentCount: 2, totalCharsScanned: 0, relationshipCandidatesGenerated: 0, relationshipsResolved: 0, relationshipsUnresolved: 0, modificationCandidatesGenerated: 1, crossDocumentReferenceLeadsGenerated: 0, wallClockMs: 0, semanticCallsUsed: 0 },
    };
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.02")!.nodeKey, index, packageGraph, bundle });
    expect(findings.some((f) => f.findingType === "MISSING_AMENDMENT_LEAD")).toBe(true);
  });

  it("30. an absent referenced external document surfaced unresolved by Phase 2D produces no false auditor claim", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness except as permitted under the Intercreditor Agreement.`;
    const { index, bundle } = buildCorrectBundle(text, "6.01");
    const packageGraph = {
      companyId: "c",
      packageKey: "p",
      classifications: [],
      identities: [],
      relationshipCandidates: [],
      modificationCandidates: [],
      crossDocumentReferenceLeads: [{ sourceDocumentId: DOC, referenceText: "the Intercreditor Agreement", charStart: 0, namedAgreementHint: "Intercreditor Agreement", targetDocumentId: null, status: "UNRESOLVED" as const, unresolvedReason: "not present in this package" }],
      instruments: [],
      performance: { documentCount: 1, totalCharsScanned: 0, relationshipCandidatesGenerated: 0, relationshipsResolved: 0, relationshipsUnresolved: 0, modificationCandidatesGenerated: 0, crossDocumentReferenceLeadsGenerated: 1, wallClockMs: 0, semanticCallsUsed: 0 },
    };
    const findings = auditContextCoverage({ companyId: "c", packageKey: "p", instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.01")!.nodeKey, index, packageGraph, bundle });
    expect(findings.some((f) => f.findingType === "MISSING_CROSS_DOCUMENT_REFERENCE")).toBe(false);
  });

  it("31. cross-instrument similarly named definitions never leak into the wrong document's independent inventory", () => {
    const textA = `SECTION 6.01. Indebtedness . The Borrower shall not permit "Consolidated EBITDA" to be less than $0. " Consolidated EBITDA " means net income for Company A.`;
    const textB = `SECTION 6.01. Indebtedness . The Borrower shall not permit "Consolidated EBITDA" to be less than $0. " Consolidated EBITDA " means net income for Company B, calculated differently.`;
    const index = buildTestIndex([
      { documentId: "docA", label: "CA-A", text: textA },
      { documentId: "docB", label: "CA-B", text: textB },
    ]);
    const nodeA = index.getNodeByRef("docA", "6.01")!;
    const expectations = buildIndependentContextExpectations("docA", nodeA.nodeKey, index, null);
    const ebitda = expectations.definitions.find((d) => d.normalizedTerm === "consolidated ebitda");
    expect(ebitda?.exactTerm).toBe("Consolidated EBITDA");
    // Verify it resolved to document A's own definition text, not document B's.
    const fullText = index.getDefinitionFullText("Consolidated EBITDA", "docA");
    expect(fullText).toContain("Company A");
    expect(fullText).not.toContain("Company B");
  });

  it("32. a self-referential definition cycle is handled safely (terminates, no infinite loop)", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of " Available Amount " . " Available Amount " means an amount determined by reference to the " Cumulative Credit " . " Cumulative Credit " means an amount determined by reference to the " Available Amount " .`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const node = index.getNodeByRef(DOC, "6.01")!;
    const expectations = buildIndependentContextExpectations(DOC, node.nodeKey, index, null);
    expect(expectations.definitions.length).toBeGreaterThan(0);
    expect(expectations.definitions.length).toBeLessThan(10);
  });
});

describe("Phase 2E auditor quality controls (33-38)", () => {
  it("33. an irrelevant administrative paragraph produces no region at all", () => {
    const text = `SECTION 9.02. Notices . All notices hereunder shall be delivered by hand, by facsimile, or by electronic mail to the address set forth on the signature pages hereto.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.sectionRef === "9.02")).toBe(false);
  });

  it("34. a bare notice provision produces no region", () => {
    const text = `SECTION 9.03. Notice of Default . The Borrower shall provide notice to the Administrative Agent within five Business Days of becoming aware of any Default.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.sectionRef === "9.03")).toBe(false);
  });

  it("35. purely definitional material with no covenant relevance produces no region", () => {
    const text = `SECTION 1.01. Defined Terms . " Fiscal Quarter " means each three-month period ending on March 31, June 30, September 30 or December 31.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    expect(regions.some((r) => r.sectionRef === "1.01")).toBe(false);
  });

  it("36. boilerplate representation language never escalates past UNCERTAIN", () => {
    const text = `SECTION 9.08. Counterparts . This Agreement may be executed in counterparts, each of which shall be deemed an original, and all of which together shall constitute one instrument.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    const boilerplateFinding = findings.find((f) => f.sourceCitation.includes("9.08"));
    if (boilerplateFinding) expect(boilerplateFinding.materiality).not.toBe("MATERIAL");
  });

  it("37. complete, correct discovery and context produce zero material findings", () => {
    const text = `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidates = [makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], normalizedSourceRef: "6.01" })];
    const findings = auditDiscoveryCoverage(regions, candidates, index);
    expect(findings.filter((f) => f.materiality === "MATERIAL")).toHaveLength(0);
  });

  it("38. genuinely ambiguous source becomes UNCERTAIN rather than a fabricated material claim", () => {
    const text = `SECTION 6.06. Investments . The Borrower may make Investments in joint ventures so long as such Investments are consistent with past practice.`;
    const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
    const regions = buildSourceCoverageInventory(DOC, index, { companyId: "c", packageKey: "p", instrumentKey: null });
    const findings = auditDiscoveryCoverage(regions, [], index);
    const finding = findings.find((f) => f.sourceCitation.includes("6.06"));
    expect(finding).toBeDefined();
    expect(finding!.materiality).toBe("UNCERTAIN");
  });
});
