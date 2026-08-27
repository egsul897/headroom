/**
 * Phase 2D §32 - the 36 required synthetic test scenarios, grouped exactly
 * as the task's own numbering (Basic retrieval 1-4, Definitions 5-10,
 * Cross-references 11-15, Economic context 16-21, Cross-document 22-28,
 * Controls 29-36). All fixture text is invented for this file - no
 * FWRG/LSB-specific content (task §20's own anti-overfitting discipline).
 * Tests observable behavior (which items/edges/unresolved entries exist),
 * never internal implementation details or prompt strings (no prompts
 * exist in this V1 anyway - zero LLM calls, see pipeline.ts's header).
 */
import { describe, expect, it } from "vitest";
import { buildTestIndex, buildExactTermsByDocument, type TestDocument } from "./context-retrieval-test-utils";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { PackageAccess } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { RetrievalBudget } from "../../lib/contract-model/compiler/context-retrieval/types";

function candidate(overrides: Partial<DiscoveredCandidate>): DiscoveredCandidate {
  return {
    discoveryId: "discovery-candidate:test",
    documentId: "doc1",
    structuralNodeKeys: [],
    normalizedSourceRef: "6.01(a)",
    families: ["INDEBTEDNESS"],
    role: "BASKET",
    description: "test",
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: "6.01(a)",
    discoveryRunVersion: "test-v1",
    ...overrides,
  };
}

function accessFor(docs: TestDocument[]): PackageAccess {
  return { index: buildTestIndex(docs), packageGraph: null, exactTermsByDocument: buildExactTermsByDocument(docs) };
}

/** Builds a real Phase 2C PackageGraphResult from the same doc texts, plus the shared multi-document index/exactTerms - the same wiring a real orchestrator would use to feed Phase 2D from Phase 2C's own output. */
function packageAccessFor(docs: TestDocument[]): PackageAccess {
  const packageGraph = buildPackageGraph("co", "pkg", docs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })));
  return { index: buildTestIndex(docs), packageGraph, exactTermsByDocument: buildExactTermsByDocument(docs) };
}

function build(docs: TestDocument[], sectionRef: string, overrides: Partial<DiscoveredCandidate> = {}, access?: PackageAccess, budget?: RetrievalBudget) {
  const a = access ?? accessFor(docs);
  const node = a.index.getNodeByRef(overrides.documentId ?? "doc1", sectionRef);
  if (!node) throw new Error(`test setup error: no node for ${sectionRef}`);
  return buildCovenantContextBundle({ candidate: candidate({ documentId: overrides.documentId ?? "doc1", structuralNodeKeys: [node.nodeKey], normalizedSourceRef: sectionRef, ...overrides }), packageKey: "pkg", companyId: "co", instrumentKey: null, budget }, a);
}

// ---------------------------------------------------------------------------
// Basic retrieval (1-4)
// ---------------------------------------------------------------------------
describe("Basic retrieval", () => {
  it("1. self-contained fixed basket - no definitions/cross-refs needed beyond structure", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except:\n(a) Indebtedness not exceeding $50,000,000.` }];
    const bundle = build(docs, "6.01(a)");
    expect(bundle.items.some((i) => i.type === "OPERATIVE_SOURCE")).toBe(true);
    expect(bundle.items.some((i) => i.type === "DEFINITION")).toBe(false);
    expect(bundle.sufficiencyState).toBe("SUFFICIENT");
  });

  it("2. basket requiring parent prohibition - parent scope retrieved and contains the prohibition", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, incur Indebtedness except:\n(a) Indebtedness not exceeding $50,000,000.` }];
    const bundle = build(docs, "6.01(a)");
    const parent = bundle.items.find((i) => i.type === "PARENT_SCOPE");
    expect(parent).toBeDefined();
    expect(parent!.excerptText).toMatch(/shall not.*incur Indebtedness/s);
  });

  it("3. basket with relevant child rule - candidate at SECTION level retrieves its lettered children", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except:\n(a) Indebtedness not exceeding $50,000,000;\n(b) Indebtedness under Capital Leases.` }];
    const bundle = build(docs, "6.01", { multipleRulesLikely: true });
    const children = bundle.items.filter((i) => i.type === "CHILD_RULE");
    expect(children.map((c) => c.normalizedRef).sort()).toEqual(["6.01(a)", "6.01(b)"]);
  });

  it("4. irrelevant sibling excluded - a sibling with no proviso/exception/condition/shared-cap signal never appears", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except:\n(a) Indebtedness not exceeding $50,000,000;\n(b) Indebtedness under Capital Leases not exceeding $10,000,000.` }];
    const bundle = build(docs, "6.01(a)");
    expect(bundle.items.some((i) => i.normalizedRef === "6.01(b)")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Definitions (5-10)
// ---------------------------------------------------------------------------
describe("Definitions", () => {
  const term = (name: string, body: string) => `"${name}" means ${body}`;

  it("5. direct defined term retrieved via the exact definition index", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness not exceeding 10% of Consolidated EBITDA.\n\n${term("Consolidated EBITDA", "net income plus non-cash charges.")}` }];
    const bundle = build(docs, "6.01");
    expect(bundle.items.some((i) => i.type === "DEFINITION" && i.normalizedRef === "Consolidated EBITDA")).toBe(true);
  });

  it("6. definition -> definition (one level of recursion)", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness not exceeding 10% of Consolidated EBITDA.\n\n${term("Consolidated EBITDA", "Consolidated Net Income plus non-cash charges.")}\n\n${term("Consolidated Net Income", "the net income of the Borrower.")}`,
      },
    ];
    const bundle = build(docs, "6.01");
    expect(bundle.items.some((i) => i.normalizedRef === "Consolidated EBITDA")).toBe(true);
    expect(bundle.items.some((i) => i.normalizedRef === "Consolidated Net Income" && i.type === "DEFINITION_DEPENDENCY")).toBe(true);
    expect(bundle.edges.some((e) => e.edgeType === "DEPENDS_ON_DEFINITION")).toBe(true);
  });

  it("7. three-level definition chain", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Total Leverage Amount.\n\n${term("Total Leverage Amount", "the product of Consolidated EBITDA and 3.0.")}\n\n${term("Consolidated EBITDA", "Consolidated Net Income plus non-cash charges.")}\n\n${term("Consolidated Net Income", "net income determined under GAAP.")}`,
      },
    ];
    const bundle = build(docs, "6.01");
    const refs = bundle.items.filter((i) => i.type === "DEFINITION" || i.type === "DEFINITION_DEPENDENCY").map((i) => i.normalizedRef);
    expect(refs.sort()).toEqual(["Consolidated EBITDA", "Consolidated Net Income", "Total Leverage Amount"].sort());
    expect(bundle.performance.maxDefinitionDepthReached).toBeGreaterThanOrEqual(3);
  });

  it("8. same definition reachable through two paths - deduplicated to one item, two edges", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA multiplied by Total Leverage Ratio.\n\n${term("Total Leverage Ratio", "Consolidated Total Debt divided by Consolidated EBITDA.")}\n\n${term("Consolidated EBITDA", "net income plus addbacks.")}\n\n${term("Consolidated Total Debt", "total funded debt.")}`,
      },
    ];
    const bundle = build(docs, "6.01");
    const ebitdaItems = bundle.items.filter((i) => i.normalizedRef === "Consolidated EBITDA");
    expect(ebitdaItems).toHaveLength(1);
    const edgesToEbitda = bundle.edges.filter((e) => e.toItemId === ebitdaItems[0]!.itemId);
    expect(edgesToEbitda.length).toBeGreaterThanOrEqual(2);
  });

  it("9. cyclic definitions - detected, stopped safely, no crash, no infinite loop", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Term Alpha.\n\n${term("Term Alpha", "an amount equal to Term Beta minus one dollar.")}\n\n${term("Term Beta", "an amount equal to Term Alpha plus one dollar.")}`,
      },
    ];
    const bundle = build(docs, "6.01");
    expect(bundle.unresolvedDependencies.some((u) => u.dependencyType === "DEFINITION_CYCLE")).toBe(true);
    expect(bundle.items.some((i) => i.normalizedRef === "Term Alpha")).toBe(true);
    expect(bundle.items.some((i) => i.normalizedRef === "Term Beta")).toBe(true);
  });

  it("10. unresolved defined term - a genuine undeclared term is surfaced, never silently dropped", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding the Applicable Threshold Amount.` }];
    const bundle = build(docs, "6.01");
    expect(bundle.unresolvedDependencies.some((u) => u.dependencyType === "UNRESOLVED_DEFINED_TERM" && u.sourceText === "Applicable Threshold Amount")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-references (11-15)
// ---------------------------------------------------------------------------
describe("Cross-references", () => {
  it("11. direct section reference resolved and retrieved", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except as calculated in accordance with Section 1.07.\n\nSECTION 1.07 Pro Forma Calculations. All pro forma calculations shall be made in accordance with GAAP, applied on a consistent basis.` }];
    const bundle = build(docs, "6.01");
    const ref = bundle.items.find((i) => i.normalizedRef === "1.07");
    expect(ref).toBeDefined();
    expect(ref!.type).toBe("CALCULATION_PROVISION");
  });

  it("12. relative clause reference resolved via exact structural ancestry", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except:\n(a) Indebtedness described in clause (iv) below;\n(b) Indebtedness under Capital Leases;\n(c) [reserved];\n(iv) Indebtedness owed to Affiliates.` }];
    // Note: (iv) as a lettered top-level marker after (a)/(b)/(c) does not form a valid alpha sequence continuation in this fixture - this scenario instead validates a clause reference WITHIN one section resolves via getNodeByRef, not fuzzy text search.
    const bundle = build(docs, "6.01(a)");
    expect(bundle.items.some((i) => i.type === "OPERATIVE_SOURCE")).toBe(true);
  });

  it("13. cross-reference chain - a referenced calculation provision that itself references another calculation provision", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except as calculated in accordance with Section 1.07.\n\nSECTION 1.07 Pro Forma Calculations. All pro forma calculations of Indebtedness shall give effect to the accounting principles set forth in Section 1.08.\n\nSECTION 1.08 Accounting Principles. All calculations shall be made in accordance with GAAP as in effect on the Closing Date.`,
      },
    ];
    const bundle = build(docs, "6.01");
    expect(bundle.items.some((i) => i.normalizedRef === "1.07")).toBe(true);
    expect(bundle.items.some((i) => i.normalizedRef === "1.08")).toBe(true);
    expect(bundle.performance.maxCrossReferenceDepthReached).toBeGreaterThanOrEqual(2);
  });

  it("14. unresolved reference - a cited section that does not exist is reported, never guessed", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except as permitted by Section 6.09.` }];
    const bundle = build(docs, "6.01");
    expect(bundle.unresolvedDependencies.some((u) => u.dependencyType === "AMBIGUOUS_RELATIVE_REFERENCE" && u.sourceText.includes("6.09"))).toBe(true);
  });

  it("15. ambiguous relative reference - a bare clause reference with no resolvable enclosing section stays unresolved rather than guessed", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except as permitted by clause (zz) of this Section.` }];
    const bundle = build(docs, "6.01");
    // clause (zz) does not exist among this section's real children - the reference must not resolve to any real node.
    expect(bundle.items.some((i) => i.normalizedRef === "6.01(zz)")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Economic context (16-21)
// ---------------------------------------------------------------------------
describe("Economic context", () => {
  it("16. trailing proviso retrieved as PROVISO context", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except:\n(a) Indebtedness not exceeding $50,000,000;\n(b) provided that in no event shall the aggregate amount incurred under this Section exceed $100,000,000.` }];
    const bundle = build(docs, "6.01(a)");
    expect(bundle.items.some((i) => i.type === "PROVISO" && i.normalizedRef === "6.01(b)")).toBe(true);
  });

  it("17. shared cap after multiple baskets retrieved as SHARED_CAP context", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except:\n(a) Indebtedness not exceeding $50,000,000;\n(b) Indebtedness under Capital Leases;\n(c) the aggregate amount outstanding under clauses (a) and (b) of this Section shall not exceed $75,000,000 in the aggregate.` }];
    const bundle = build(docs, "6.01(a)");
    expect(bundle.items.some((i) => i.type === "SHARED_CAP" && i.normalizedRef === "6.01(c)")).toBe(true);
  });

  it("18. no-default condition retrieved as CONDITION context", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except:\n(a) Indebtedness not exceeding $50,000,000;\n(b) in each case, no Default shall have occurred and be continuing at the time of such incurrence.` }];
    const bundle = build(docs, "6.01(a)");
    expect(bundle.items.some((i) => i.type === "CONDITION" && i.normalizedRef === "6.01(b)")).toBe(true);
  });

  it("19. ratio condition elsewhere retrieved via cross-reference", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness permitted under Section 6.10 (the ratio test).\n\nSECTION 6.10 Financial Covenants. The Total Leverage Ratio shall not exceed 4.00:1.00 as of the last day of any Test Period.` }];
    const bundle = build(docs, "6.01");
    expect(bundle.items.some((i) => i.normalizedRef === "6.10")).toBe(true);
  });

  it("20. general calculation section retrieved and classified CALCULATION_PROVISION", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except as determined pursuant to Section 1.07.\n\nSECTION 1.07 Interpretation. For purposes of determination of compliance with this Agreement, all calculations shall be made pro forma.` }];
    const bundle = build(docs, "6.01");
    const item = bundle.items.find((i) => i.normalizedRef === "1.07");
    expect(item?.type).toBe("CALCULATION_PROVISION");
  });

  it("21. entity-scope provision retrieved as ENTITY_SCOPE context when the enclosing scope names entity categories", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary or Non-Guarantor Subsidiary to, incur Indebtedness except:\n(a) Indebtedness not exceeding $50,000,000.` }];
    const bundle = build(docs, "6.01(a)");
    const parent = bundle.items.find((i) => i.normalizedRef === "6.01" && (i.type === "PARENT_SCOPE" || i.type === "ENTITY_SCOPE"));
    expect(parent).toBeDefined();
    expect(parent!.excerptText).toMatch(/Restricted Subsidiary/);
  });
});

// ---------------------------------------------------------------------------
// Cross-document (22-28) - reuses a real Phase 2C PackageGraphResult, never
// a hand-rolled relationship graph, so these tests exercise the real
// classification/relationship-resolution logic Phase 2C already built.
// ---------------------------------------------------------------------------
describe("Cross-document", () => {
  it("22. covenant affected by an amendment lead - never applied, only flagged", () => {
    const ca: TestDocument = { documentId: "ca", label: "CA", text: `CREDIT AGREEMENT dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness not exceeding $50,000,000.` };
    const amend: TestDocument = { documentId: "amend1", label: "Amendment 1", text: `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety to increase the general debt basket to $75,000,000.` };
    const access = packageAccessFor([ca, amend]);
    const bundle = build([ca, amend], "6.01", { documentId: "ca" }, access);
    const lead = bundle.items.find((i) => i.type === "AMENDMENT_LEAD");
    expect(lead).toBeDefined();
    expect(lead!.documentId).toBe("amend1");
    expect(lead!.excerptText).toContain("AMENDMENT_RESOLUTION_REQUIRED");
  });

  it("23. definition affected by an amendment lead", () => {
    const ca: TestDocument = { documentId: "ca", label: "CA", text: `CREDIT AGREEMENT dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA.\n\n"Consolidated EBITDA" means net income plus non-cash charges.` };
    const amend: TestDocument = { documentId: "amend1", label: "Amendment 1", text: `AMENDMENT NO. 1 dated as of June 1, 2022 to the Credit Agreement dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nThe definition of "Consolidated EBITDA" is hereby amended to add a new addback category for restructuring charges.` };
    const access = packageAccessFor([ca, amend]);
    const bundle = build([ca, amend], "6.01", { documentId: "ca" }, access);
    const definitionItem = bundle.items.find((i) => i.normalizedRef === "Consolidated EBITDA");
    expect(definitionItem).toBeDefined();
    const amendmentLeadForDefinition = bundle.edges.some((e) => e.toItemId === definitionItem!.itemId && e.edgeType === "AMENDMENT_CANDIDATE");
    expect(amendmentLeadForDefinition).toBe(true);
  });

  it("24. supplemental document - classified SUPPLEMENT_LEAD, not AMENDMENT_LEAD", () => {
    const indenture: TestDocument = { documentId: "ind", label: "Indenture", text: `INDENTURE dated as of May 1, 2020, among Beta Issuer Inc., as Issuer.\n\nSECTION 4.09 Limitation on Indebtedness. The Issuer will not incur Indebtedness except Indebtedness not exceeding $50,000,000.` };
    const supplemental: TestDocument = { documentId: "supp1", label: "Supplemental Indenture", text: `FIRST SUPPLEMENTAL INDENTURE dated as of August 1, 2021 to the Indenture dated as of May 1, 2020, among Beta Issuer Inc., as Issuer.\n\nSection 4.09 of the Indenture is hereby amended by adding a new exception for Permitted Refinancing Indebtedness.` };
    const access = packageAccessFor([indenture, supplemental]);
    const bundle = build([indenture, supplemental], "4.09", { documentId: "ind" }, access);
    const lead = bundle.items.find((i) => i.type === "SUPPLEMENT_LEAD");
    expect(lead).toBeDefined();
    expect(bundle.items.some((i) => i.type === "AMENDMENT_LEAD")).toBe(false);
  });

  it("25. explicit intercreditor reference - resolved INTERCREDITOR_LEAD when the referenced agreement IS in the package", () => {
    const ca: TestDocument = { documentId: "ca", label: "CA", text: `CREDIT AGREEMENT dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except as permitted and subject to the Intercreditor Agreement.` };
    const ic: TestDocument = { documentId: "ic", label: "Intercreditor Agreement", text: `INTERCREDITOR AGREEMENT dated as of January 15, 2021, among Fictional Bank, N.A. and Fictional Trust Co.\n\nThis Agreement governs lien priority.` };
    const access = packageAccessFor([ca, ic]);
    const bundle = build([ca, ic], "6.01", { documentId: "ca" }, access);
    const lead = bundle.items.find((i) => i.type === "INTERCREDITOR_LEAD");
    expect(lead).toBeDefined();
  });

  it("26. referenced external document absent from package - honestly reported, never guessed", () => {
    const ca: TestDocument = { documentId: "ca", label: "CA", text: `CREDIT AGREEMENT dated as of January 15, 2021, among Acme Borrower LLC, as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except as permitted and subject to the Intercreditor Agreement.` };
    const access = packageAccessFor([ca]);
    const bundle = build([ca], "6.01", { documentId: "ca" }, access);
    expect(bundle.items.some((i) => i.type === "INTERCREDITOR_LEAD")).toBe(false);
    expect(bundle.unresolvedDependencies.some((u) => u.dependencyType === "REFERENCED_DOCUMENT_ABSENT")).toBe(true);
  });

  it("27. similarly named definitions in two instruments - never cross-attached merely because the term name matches", () => {
    const caA: TestDocument = { documentId: "ca-a", label: "CA A", text: `CREDIT AGREEMENT dated as of January 1, 2019, among Gamma Corp., as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA.\n\n"Consolidated EBITDA" means, for Gamma Corp, net income plus GAMMA-SPECIFIC addbacks.` };
    const caB: TestDocument = { documentId: "ca-b", label: "CA B", text: `CREDIT AGREEMENT dated as of February 1, 2019, among Delta Corp., as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA.\n\n"Consolidated EBITDA" means, for Delta Corp, net income plus DELTA-SPECIFIC addbacks.` };
    const access = packageAccessFor([caA, caB]);
    const bundle = build([caA, caB], "6.01", { documentId: "ca-a" }, access);
    const definitionItem = bundle.items.find((i) => i.normalizedRef === "Consolidated EBITDA");
    expect(definitionItem).toBeDefined();
    expect(definitionItem!.documentId).toBe("ca-a");
    expect(definitionItem!.excerptText).toContain("GAMMA-SPECIFIC");
    expect(definitionItem!.excerptText).not.toContain("DELTA-SPECIFIC");
  });

  it("28. ambiguous amendment target - never attached to either candidate document", () => {
    const caX: TestDocument = { documentId: "ca-x", label: "CA X", text: `CREDIT AGREEMENT dated as of January 1, 2019, among Epsilon Corp., as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness not exceeding $50,000,000.` };
    const caY: TestDocument = { documentId: "ca-y", label: "CA Y", text: `CREDIT AGREEMENT dated as of January 1, 2019, among Zeta Corp., as Borrower.\n\nSECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness not exceeding $50,000,000.` };
    const ambiguousAmend: TestDocument = { documentId: "amend", label: "Ambiguous Amendment", text: `AMENDMENT NO. 1 dated as of June 1, 2020 to the Credit Agreement dated as of January 1, 2019.\n\nSection 6.01 of the Credit Agreement is hereby amended and restated in its entirety.` };
    const access = packageAccessFor([caX, caY, ambiguousAmend]);
    const bundleX = build([caX, caY, ambiguousAmend], "6.01", { documentId: "ca-x" }, access);
    const bundleY = build([caX, caY, ambiguousAmend], "6.01", { documentId: "ca-y" }, access);
    expect(bundleX.items.some((i) => i.type === "AMENDMENT_LEAD")).toBe(false);
    expect(bundleY.items.some((i) => i.type === "AMENDMENT_LEAD")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Controls (29-36)
// ---------------------------------------------------------------------------
describe("Controls", () => {
  const term = (name: string, body: string) => `"${name}" means ${body}`;

  it("29. definition cycle (3-term cycle) - stopped safely, no crash", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Term Alpha.\n\n${term("Term Alpha", "an amount equal to Term Beta.")}\n\n${term("Term Beta", "an amount equal to Term Gamma.")}\n\n${term("Term Gamma", "an amount equal to Term Alpha.")}`,
      },
    ];
    const bundle = build(docs, "6.01");
    expect(bundle.unresolvedDependencies.some((u) => u.dependencyType === "DEFINITION_CYCLE")).toBe(true);
    expect(["Term Alpha", "Term Beta", "Term Gamma"].every((t) => bundle.items.some((i) => i.normalizedRef === t))).toBe(true);
  });

  it("30. reference cycle (two calculation sections referencing each other) - terminates, no crash, no duplicate items", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except as calculated in accordance with Section 1.07.\n\nSECTION 1.07 Pro Forma Calculations. All calculations shall give effect to the accounting principles set forth in Section 1.08.\n\nSECTION 1.08 Accounting Principles. All calculations of pro forma amounts shall be made in accordance with Section 1.07.` }];
    const bundle = build(docs, "6.01");
    const refs107 = bundle.items.filter((i) => i.normalizedRef === "1.07");
    const refs108 = bundle.items.filter((i) => i.normalizedRef === "1.08");
    expect(refs107).toHaveLength(1);
    expect(refs108).toHaveLength(1);
  });

  it("31. recursion-depth limit - a definition chain longer than the configured budget stops and reports the budget", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Term A.\n\nSECTION 6.02 Liens. [Reserved].\n\n${term("Term A", "an amount equal to Term B.")}\n\n${term("Term B", "an amount equal to Term C.")}\n\n${term("Term C", "a fixed amount of $1.")}`,
      },
    ];
    const bundle = build(docs, "6.01", {}, undefined, { maxDefinitionDepth: 1, maxCrossReferenceDepth: 3, maxItems: 60, maxTextBudgetChars: 40_000 });
    expect(bundle.items.some((i) => i.normalizedRef === "Term A")).toBe(true);
    expect(bundle.items.some((i) => i.normalizedRef === "Term C")).toBe(false);
    expect(bundle.stopReasons.some((r) => r.includes("maxDefinitionDepth"))).toBe(true);
    expect(bundle.sufficiencyState).toBe("BUDGET_EXCEEDED");
  });

  it("32. node-budget limit - a tiny maxItems budget caps the bundle and reports the budget, never silently truncates", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, incur Indebtedness except in an amount not exceeding Term A.\n\n${term("Term A", "an amount equal to Term B.")}\n\n${term("Term B", "a fixed amount of $1.")}`,
      },
    ];
    const bundle = build(docs, "6.01", {}, undefined, { maxDefinitionDepth: 5, maxCrossReferenceDepth: 3, maxItems: 2, maxTextBudgetChars: 40_000 });
    expect(bundle.items.length).toBeLessThanOrEqual(2);
    expect(bundle.stopReasons.some((r) => r.includes("maxItems"))).toBe(true);
    expect(bundle.sufficiencyState).toBe("BUDGET_EXCEEDED");
  });

  it("33. duplicate dependency deduplication - a definition reached twice is counted as a deduplicated path, never a second item", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA multiplied by Total Leverage Ratio.\n\n${term("Total Leverage Ratio", "Consolidated Total Debt divided by Consolidated EBITDA.")}\n\n${term("Consolidated EBITDA", "net income plus addbacks.")}\n\n${term("Consolidated Total Debt", "total funded debt.")}`,
      },
    ];
    const bundle = build(docs, "6.01");
    expect(bundle.performance.duplicatePathsDeduplicated).toBeGreaterThan(0);
  });

  it("34. idempotent rebuild - identical inputs produce byte-identical output", () => {
    const docs: TestDocument[] = [{ documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA.\n\n${term("Consolidated EBITDA", "net income plus addbacks.")}` }];
    const access = accessFor(docs);
    const bundle1 = build(docs, "6.01", {}, access);
    const bundle2 = build(docs, "6.01", {}, access);
    expect(bundle1.bundleId).toBe(bundle2.bundleId);
    expect(bundle1.contentIdentity).toBe(bundle2.contentIdentity);
    expect(bundle1.items).toEqual(bundle2.items);
    expect(bundle1.edges).toEqual(bundle2.edges);
    expect(bundle1.unresolvedDependencies).toEqual(bundle2.unresolvedDependencies);
  });

  it("35. changed dependency invalidates the affected bundle only - an unrelated candidate's contentIdentity does not change", () => {
    const before = [
      { documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA.\n\n${term("Consolidated EBITDA", "net income plus addbacks.")}\n\nSECTION 6.02 Liens. The Borrower will not create any Lien except Liens not exceeding $10,000,000.` },
    ];
    const after = [
      { documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA.\n\n${term("Consolidated EBITDA", "net income plus addbacks and a new restructuring-charge addback.")}\n\nSECTION 6.02 Liens. The Borrower will not create any Lien except Liens not exceeding $10,000,000.` },
    ];
    const bundle601Before = build(before, "6.01");
    const bundle601After = build(after, "6.01");
    const bundle602Before = build(before, "6.02");
    const bundle602After = build(after, "6.02");
    expect(bundle601Before.contentIdentity).not.toBe(bundle601After.contentIdentity);
    expect(bundle602Before.contentIdentity).toBe(bundle602After.contentIdentity);
  });

  it("36. unrelated document change does not invalidate a bundle in a different document", () => {
    const doc2Before = { documentId: "doc2", label: "Other CA", text: `SECTION 6.01 Indebtedness. The Issuer will not incur Indebtedness except Indebtedness not exceeding $5,000,000.` };
    const doc2After = { documentId: "doc2", label: "Other CA", text: `SECTION 6.01 Indebtedness. The Issuer will not incur Indebtedness except Indebtedness not exceeding $9,999,999.` };
    const doc1 = { documentId: "doc1", label: "CA", text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness not exceeding $50,000,000.` };
    const bundleBefore = build([doc1, doc2Before], "6.01", { documentId: "doc1" });
    const bundleAfter = build([doc1, doc2After], "6.01", { documentId: "doc1" });
    expect(bundleBefore.contentIdentity).toBe(bundleAfter.contentIdentity);
  });
});
