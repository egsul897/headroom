import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeAmendmentPackage } from "../../lib/product/customer-intelligence/amendment-package";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
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
