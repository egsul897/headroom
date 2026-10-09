import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";
import { compareAmendmentSummaries } from "../../lib/product/customer-intelligence/amendment-compare";
import { buildCovenantDependencyGraph } from "../../lib/product/customer-intelligence/dependency-graph";
import { renderCovenantReviewMarkdown } from "../../lib/product/customer-intelligence/export-review";
import type { CovenantReviewWorkspace } from "../../lib/product/customer-intelligence/covenant-review";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";
import type {
  CovenantCandidateRecord,
  DefinitionRecord,
  KnowledgeSourceRecord,
  StructuralNodeRecord,
} from "../../lib/knowledge-factory/types";

function baseSource(overrides: Partial<KnowledgeSourceRecord>): KnowledgeSourceRecord {
  return {
    sourceId: "s1",
    issuerCik: "0000000000",
    accessionNumber: "customer-1",
    exhibitFilename: "credit-agreement.txt",
    sourceUrl: "fixture://customer/x",
    filingDate: "2024-01-01",
    formType: "UPLOAD",
    documentTitle: "Credit Agreement",
    documentClass: "CREDIT_AGREEMENT",
    originalBytesHash: "abc",
    acquisitionTimestamp: "2024-01-01T00:00:00.000Z",
    parserVersion: "test",
    extractionStatus: "CANDIDATES_DISCOVERED",
    representationLevel: "DISCOVERED_CANDIDATE",
    provenance: "customer-upload",
    usageRightsReviewStatus: "UNREVIEWED",
    ...overrides,
  };
}

describe("customer amendment package", () => {
  it("surfaces unresolved precedence for base + amendment without silent selection", () => {
    const view = analyzeAmendmentPackage({
      companyId: "co-1",
      sources: [
        baseSource({ sourceId: "base", documentClass: "CREDIT_AGREEMENT", documentTitle: "Credit Agreement" }),
        baseSource({
          sourceId: "amd",
          documentClass: "AMENDMENT",
          documentTitle: "First Amendment to Credit Agreement",
          exhibitFilename: "amendment-1.txt",
        }),
      ],
      relationships: [
        {
          id: "r1",
          sourceId: "amd",
          targetId: "base",
          kind: "AGREEMENT_AMENDMENT",
          evidenceStatus: "DISCOVERED",
          rationale: "title link",
          confidence: 0.5,
        },
      ],
    });
    expect(view.operativeResolution).toBe("UNRESOLVED_PRECEDENCE");
    expect(view.unresolvedReasons.length).toBeGreaterThan(0);
    expect(view.provisionChangeSignals.some((s) => s.kind === "AMENDED")).toBe(true);
    expect(view.askGuidance.toLowerCase()).toContain("unresolved");
  });
});

describe("covenant summary substance", () => {
  it("explains substance with scope, baskets, dependencies, and citations", () => {
    const nodes: StructuralNodeRecord[] = [
      {
        nodeId: "n1",
        sourceId: "cust",
        nodeType: "SECTION",
        sectionRef: "7.01",
        heading: "Indebtedness",
        charStart: 0,
        charEnd: 200,
      },
    ];
    const defs: DefinitionRecord[] = [
      {
        term: "Consolidated EBITDA",
        sourceId: "cust",
        charStart: 0,
        charEnd: 40,
        excerpt: "Consolidated EBITDA means ...",
      },
    ];
    const candidates: CovenantCandidateRecord[] = [
      {
        candidateId: "c1",
        sourceId: "cust",
        nodeId: "n1",
        families: ["INDEBTEDNESS"],
        signals: ["indebtedness"],
        excerpt:
          "The Borrower and any Restricted Subsidiary shall not incur Indebtedness except the greater of $50,000,000 and 25% of Consolidated EBITDA, subject to Section 7.03.",
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: 0.9,
      },
    ];
    const summary = buildDocumentCovenantSummary({
      sourceId: "cust",
      documentTitle: "Credit Agreement",
      issuerCik: "0000000000",
      documentClass: "CREDIT_AGREEMENT",
      candidates,
      definitions: defs,
      structuralNodes: nodes,
      crossReferences: [
        {
          sourceId: "cust",
          fromNodeId: "n1",
          rawReference: "Section 7.03",
          charStart: 0,
          charEnd: 12,
        },
      ],
    });
    expect(summary.items.length).toBe(1);
    const item = summary.items[0]!;
    expect(item.plainEnglish.toLowerCase()).toContain("debt");
    expect(item.plainEnglish).not.toMatch(/appears to address/);
    expect(item.plainEnglish).not.toBe(item.heading);
    expect(item.posture).toBeTruthy();
    expect(item.analysis.plainEnglish).toBe(item.plainEnglish);
    expect(item.entityScope.borrower).toBe(true);
    expect(item.entityScope.restrictedSubsidiary).toBe(true);
    expect(item.materialBasketsThresholds.length).toBeGreaterThan(0);
    expect(item.dependencies.some((d) => d.includes("7.03") || d.includes("Consolidated EBITDA"))).toBe(
      true,
    );
    expect(item.applicableDefinitions.some((d) => d.term === "Consolidated EBITDA")).toBe(true);
    expect(item.sourceCitation).toContain("7.01");
    expect(item.unresolvedQuestions.length).toBeGreaterThan(0);
  });
});

describe("dependency graph and amendment compare", () => {
  function stubItem(
    overrides: Partial<CovenantSummaryItem> & {
      sectionRef: string;
      category: CovenantSummaryItem["category"];
      sourceId?: string;
      documentTitle?: string;
    },
  ): CovenantSummaryItem & { sourceId: string; documentTitle: string } {
    return {
      categoryLabel: overrides.category,
      heading: overrides.heading ?? overrides.sectionRef,
      posture: "GENERAL_PROHIBITION",
      plainEnglish: "Test provision.",
      restriction: "No action except baskets.",
      permissions: [],
      coveredEntities: ["Borrower"],
      exceptions: [],
      conditions: [],
      materialBasketsThresholds: [],
      draftingPatterns: [],
      operativeLanguageExcerpt: "The Borrower shall not…",
      sourceCitation: `§${overrides.sectionRef}`,
      governingAgreement: "CA",
      families: [],
      relatedDefinedTerms: [],
      applicableDefinitions: [],
      entityScope: {
        borrower: true,
        guarantor: false,
        restrictedSubsidiary: false,
        unrestrictedSubsidiary: false,
        notes: [],
      },
      crossReferences: overrides.crossReferences ?? [],
      dependencies: overrides.dependencies ?? [],
      epistemicStatus: "DISCOVERED_CANDIDATE",
      interpretationNote: "",
      unresolvedQuestions: [],
      analysis: {} as CovenantSummaryItem["analysis"],
      sourceId: "s1",
      documentTitle: "Credit Agreement",
      ...overrides,
    };
  }

  it("builds debt-to-lien dependency edges without inventing permission", () => {
    const graph = buildCovenantDependencyGraph([
      stubItem({ sectionRef: "7.01", category: "DEBT_INCURRENCE" }),
      stubItem({ sectionRef: "7.02", category: "LIENS_SECURED_DEBT" }),
    ]);
    expect(graph.edgeCount).toBeGreaterThan(0);
    expect(graph.edges.some((e) => e.kind === "DEBT_TO_LIEN")).toBe(true);
    expect(graph.note.toLowerCase()).toContain("do not authorize");
  });

  it("compares base vs amendment summaries without selecting operative text", () => {
    const view = analyzeAmendmentPackage({
      companyId: "co-1",
      sources: [
        baseSource({ sourceId: "base", documentClass: "CREDIT_AGREEMENT", documentTitle: "Credit Agreement" }),
        baseSource({
          sourceId: "amd",
          documentClass: "AMENDMENT",
          documentTitle: "First Amendment",
          exhibitFilename: "amd.htm",
        }),
      ],
      relationships: [],
    });
    const compare = compareAmendmentSummaries({
      amendmentPackage: view,
      items: [
        stubItem({
          sectionRef: "7.01",
          category: "DEBT_INCURRENCE",
          sourceId: "base",
          materialBasketsThresholds: ["$50,000,000"],
        }),
        stubItem({
          sectionRef: "7.01",
          category: "DEBT_INCURRENCE",
          sourceId: "amd",
          documentTitle: "First Amendment",
          materialBasketsThresholds: ["$100,000,000"],
          operativeLanguageExcerpt: "Amended basket language…",
        }),
      ],
    });
    expect(compare.operativeResolution).toBe("UNRESOLVED_PRECEDENCE");
    expect(compare.rows.some((r) => r.changeKind === "THRESHOLD_OR_TEXT_SHIFT")).toBe(true);
    expect(compare.note.toLowerCase()).toContain("unresolved");
  });
});

describe("export formats", () => {
  it("renders HTML and DOCX from the shared review object", async () => {
    const { renderCovenantReviewHtml, renderCovenantReviewDocx } = await import(
      "../../lib/product/customer-intelligence/export-docx"
    );
    const review: CovenantReviewWorkspace = {
      companyId: "co-export",
      documentCount: 1,
      analyzedOkCount: 1,
      failedCount: 0,
      totalSummaries: 1,
      executive: {
        headline: "1 document analyzed.",
        materialRestrictions: ["§7.01: No Indebtedness except baskets."],
        materialPermissions: [],
        unresolved: [],
      },
      categories: [],
      documents: [],
      amendmentPackage: null,
      dependencyGraph: { edgeCount: 0, edges: [], cycles: [], note: "n/a" },
      amendmentCompare: {
        operativeResolution: "NO_DOCUMENTS",
        rows: [],
        unresolvedReasons: [],
        note: "n/a",
      },
    };
    const html = renderCovenantReviewHtml(review);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("DISCOVERED");
    const docx = await renderCovenantReviewDocx(review);
    expect(docx.length).toBeGreaterThan(500);
    // DOCX is a zip package
    expect(docx[0]).toBe(0x50);
    expect(docx[1]).toBe(0x4b);
  });
});

describe("covenant review markdown export", () => {
  it("renders executive fields from the shared review object", () => {
    const review: CovenantReviewWorkspace = {
      companyId: "co-export",
      documentCount: 1,
      analyzedOkCount: 1,
      failedCount: 0,
      totalSummaries: 1,
      executive: {
        headline: "1 document(s) analyzed with 1 source-backed covenant summaries.",
        materialRestrictions: ["§7.01: No Indebtedness except enumerated baskets."],
        materialPermissions: ["§7.01: general basket $50,000,000"],
        unresolved: ["§7.01: operative amendment status unresolved"],
      },
      categories: [],
      documents: [],
      amendmentPackage: null,
      dependencyGraph: {
        edgeCount: 0,
        edges: [],
        cycles: [],
        note: "Edges are discovery-backed relationship hints for review.",
      },
      amendmentCompare: {
        operativeResolution: "NO_DOCUMENTS",
        rows: [],
        unresolvedReasons: [],
        note: "Upload a base agreement and an amendment to enable before/after comparison.",
      },
    };
    const md = renderCovenantReviewMarkdown(review);
    expect(md).toContain("# Covenant review — co-export");
    expect(md).toContain("DISCOVERED ≠ VERIFIED");
    expect(md).toContain("§7.01: No Indebtedness");
    expect(md).toContain("not capacity");
  });
});

describe("capacity / simulate honesty wiring", () => {
  const root = path.join(__dirname, "../..");

  it("capacity page fail-closes without inventing figures when readiness blocks evaluation", () => {
    const source = readFileSync(path.join(root, "app/[companyId]/capacity/page.tsx"), "utf8");
    const readiness = readFileSync(
      path.join(root, "lib/product/customer-intelligence/capacity-readiness.ts"),
      "utf8",
    );
    expect(source).toContain("loadCapacityReadiness");
    expect(source).toContain("NOT DETERMINABLE");
    expect(source).toContain("canEvaluateExecutableCapacity");
    expect(source).toMatch(/never rendered as \$0 or Unlimited/);
    expect(source).not.toMatch(/remainingCapacity\s*\?\?\s*0/);
    expect(readiness).toContain("DISCOVERED ≠ VERIFIED");
    expect(readiness).toContain("SOURCE_BACKED ≠ LEGALLY_EXECUTABLE");
    expect(readiness).toContain("canEvaluateExecutableCapacity");
  });

  it("simulate page shows readiness for every company, not only CONMED", () => {
    const source = readFileSync(path.join(root, "app/[companyId]/simulate/page.tsx"), "utf8");
    expect(source).toContain("loadCapacityReadiness");
    expect(source).toContain("NOT DETERMINABLE");
    expect(source).not.toContain("CONMED_DEMO_COMPANY_ID");
    expect(source).toContain("never modify the live transaction ledger");
  });

  it("covenant review workspace is the covenants page data source", () => {
    const source = readFileSync(path.join(root, "app/[companyId]/covenants/page.tsx"), "utf8");
    expect(source).toContain("loadCovenantReviewWorkspace");
    expect(source).toContain("DISCOVERED ≠ VERIFIED");
    expect(source).toContain("SOURCE_BACKED ≠ LEGALLY_EXECUTABLE");
  });
});
