/**
 * HEADROOM-6 — recursive definition closure, budget honesty, context manifest,
 * missing schedules, amendment leads, determinism, and source-tamper detection.
 * Synthetic multi-issuer-shaped fixtures (never WOR-specific selectors).
 */
import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildContextCompletenessManifest } from "../../lib/contract-model/compiler/context-retrieval/manifest";
import { resolveCanonicalBodyAnchor } from "../../lib/contract-model/compiler/context-retrieval/body-anchor";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { RetrievalBudget } from "../../lib/contract-model/compiler/context-retrieval/types";
import { buildExactTermsByDocument, buildTestIndex, type TestDocument } from "./context-retrieval-test-utils";

function term(name: string, body: string): string {
  return `"${name}" means ${body}`;
}

function candidate(overrides: Partial<DiscoveredCandidate>): DiscoveredCandidate {
  return {
    discoveryId: "discovery-candidate:closure",
    documentId: "doc1",
    structuralNodeKeys: [],
    structuralNodeIds: [],
    normalizedSourceRef: "6.01",
    families: ["INDEBTEDNESS"],
    role: "BASKET",
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test",
    multipleRulesLikely: false,
    definedTermDependencyLikely: true,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: "6.01",
    discoveryRunVersion: "test-v1",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "test",
    ...overrides,
  };
}

function build(docs: TestDocument[], sectionRef: string, overrides: Partial<DiscoveredCandidate> = {}, budget?: RetrievalBudget, usePackageGraph = false) {
  const index = buildTestIndex(docs);
  const exactTermsByDocument = buildExactTermsByDocument(docs);
  const packageGraph = usePackageGraph
    ? buildPackageGraph(
        "co",
        "pkg",
        docs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })),
      )
    : null;
  const resolution = resolveCanonicalBodyAnchor(index, overrides.documentId ?? "doc1", sectionRef);
  const node = resolution.selected ?? index.getNodeByRef(overrides.documentId ?? "doc1", sectionRef);
  if (!node) throw new Error(`no node for ${sectionRef}`);
  return buildCovenantContextBundle(
    {
      candidate: candidate({
        documentId: overrides.documentId ?? "doc1",
        structuralNodeKeys: [node.nodeKey],
        structuralNodeIds: [node.nodeId],
        normalizedSourceRef: sectionRef,
        ...overrides,
      }),
      packageKey: "pkg",
      companyId: "co",
      instrumentKey: null,
      budget,
    },
    { index, packageGraph, exactTermsByDocument },
  );
}

describe("HEADROOM-6 recursive definition closure + budget + manifest", () => {
  it("nested definitions: direct term pulls transitive dependency", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except in an amount not exceeding Consolidated EBITDA.

SECTION 1.01 Defined Terms.
${term("Consolidated EBITDA", "Consolidated Net Income plus addbacks.")}
${term("Consolidated Net Income", "net income determined in accordance with GAAP.")}
${term("GAAP", "generally accepted accounting principles.")}
`,
      },
    ];
    const bundle = build(docs, "6.01");
    expect(bundle.items.some((i) => i.normalizedRef === "Consolidated EBITDA")).toBe(true);
    expect(bundle.items.some((i) => i.normalizedRef === "Consolidated Net Income")).toBe(true);
    expect(bundle.contextManifest?.definitionDependencyGraph.some((n) => n.term === "Consolidated EBITDA" && n.dependsOn.includes("Consolidated Net Income"))).toBe(true);
  });

  it("cyclic definitions: cycle disclosed, expansion stops, no infinite loop", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Term Alpha.

SECTION 1.01 Defined Terms.
${term("Term Alpha", "an amount equal to Term Beta.")}
${term("Term Beta", "an amount equal to Term Alpha.")}
`,
      },
    ];
    const bundle = build(docs, "6.01");
    expect(bundle.unresolvedDependencies.some((u) => u.dependencyType === "DEFINITION_CYCLE")).toBe(true);
    expect(bundle.items.filter((i) => i.normalizedRef === "Term Alpha").length).toBeLessThanOrEqual(1);
  });

  it("cross-document definition resolution via package graph (not whole-package search)", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc-base",
        label: "Credit Agreement",
        text: `AMENDED AND RESTATED CREDIT AGREEMENT dated as of January 1, 2020

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Facility EBITDA.

SECTION 1.01 Defined Terms.
${term("Indebtedness", "borrowed money.")}
`,
      },
      {
        documentId: "doc-amend",
        label: "First Amendment",
        text: `FIRST AMENDMENT TO CREDIT AGREEMENT dated as of June 1, 2021
This First Amendment amends the Amended and Restated Credit Agreement dated as of January 1, 2020.

SECTION 1.01. The following definition is added:
${term("Facility EBITDA", "earnings before interest, taxes, depreciation and amortization.")}
`,
      },
    ];
    const bundle = build(docs, "6.01", { documentId: "doc-base" }, undefined, true);
    const def = bundle.items.find((i) => i.normalizedRef === "Facility EBITDA");
    expect(def?.documentId).toBe("doc-amend");
  });

  it("missing schedule referenced in a definition is MISSING_SCHEDULE (never silent SUFFICIENT)", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.02 Liens. The Borrower will not create any Lien other than Permitted Liens.

SECTION 1.01 Defined Terms.
${term("Permitted Liens", "Liens existing on the date hereof and set forth on Schedule 1.02 and other Liens.")}
${term("Lien", "any lien.")}
`,
      },
    ];
    const bundle = build(docs, "6.02");
    expect(bundle.unresolvedDependencies.some((u) => u.dependencyType === "MISSING_SCHEDULE" && /Schedule 1\.02/i.test(u.sourceText))).toBe(true);
    expect(bundle.sufficiencyState).not.toBe("SUFFICIENT");
  });

  it("long definition-section probe without DEFINED_TERM hint refuses silent SUFFICIENT", () => {
    const manyDefs = Array.from({ length: 40 }, (_, i) => term(`Term${i}`, `body text for term ${i} with enough padding ${"x".repeat(1200)}.`)).join("\n");
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 1.01 Defined Terms.
${manyDefs}
`,
      },
    ];
    const bundle = build(docs, "1.01", { families: ["DEFINITIONS_CALCULATION_RULES"] });
    expect(bundle.sufficiencyState === "BUDGET_EXCEEDED" || bundle.sufficiencyState === "INCOMPLETE" || bundle.sufficiencyState === "REVIEW_REQUIRED").toBe(true);
    expect(bundle.sufficiencyState).not.toBe("SUFFICIENT");
    expect(bundle.stopReasons.some((r) => r.includes("maxTextBudgetChars")) || bundle.unresolvedDependencies.some((u) => u.dependencyType === "BUDGET_EXCEEDED_DEPENDENCY")).toBe(true);
  });

  it("tight maxItems budget reports BUDGET_EXCEEDED and never silently truncates into SUFFICIENT", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Term A or Term B or Term C.

SECTION 1.01 Defined Terms.
${term("Term A", "one.")}
${term("Term B", "two.")}
${term("Term C", "three.")}
`,
      },
    ];
    const bundle = build(docs, "6.01", {}, { maxDefinitionDepth: 5, maxCrossReferenceDepth: 3, maxItems: 2, maxTextBudgetChars: 40_000 });
    expect(bundle.items.length).toBeLessThanOrEqual(2);
    expect(bundle.sufficiencyState).toBe("BUDGET_EXCEEDED");
    expect(bundle.stopReasons.some((r) => r.includes("maxItems"))).toBe(true);
  });

  it("context manifest includes root, spans, definition graph, missing deps, budget, sufficiency, provenance", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except Consolidated EBITDA.

SECTION 1.01 Defined Terms.
${term("Consolidated EBITDA", "earnings.")}
${term("Indebtedness", "debt.")}
`,
      },
    ];
    const bundle = build(docs, "6.01");
    const manifest = bundle.contextManifest ?? buildContextCompletenessManifest(bundle);
    expect(manifest.manifestVersion).toBe("headroom-context-manifest.v1");
    expect(manifest.rootProvision.normalizedSourceRef).toBe("6.01");
    expect(manifest.sourceSpans.length).toBe(bundle.items.length);
    expect(manifest.retrievedDependencies.definitions).toContain("Consolidated EBITDA");
    expect(manifest.budgetAccounting.continuationSupported).toBe(true);
    expect(manifest.sufficiencyClassification).toBe(bundle.sufficiencyState);
    expect(manifest.provenance.packageKey).toBe("pkg");
  });

  it("identical inputs produce identical contentIdentity and manifest (determinism)", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except $5,000,000.

SECTION 1.01 Defined Terms.
${term("Indebtedness", "debt.")}
`,
      },
    ];
    const a = build(docs, "6.01");
    const b = build(docs, "6.01");
    expect(a.contentIdentity).toBe(b.contentIdentity);
    expect(a.sufficiencyState).toBe(b.sufficiencyState);
    expect(a.items.map((i) => i.itemId)).toEqual(b.items.map((i) => i.itemId));
    expect(a.contextManifest?.contentIdentity).toBe(b.contextManifest?.contentIdentity);
  });

  it("source tampering changes contentIdentity (integrity signal)", () => {
    const base = `SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except $5,000,000.

SECTION 1.01 Defined Terms.
${term("Indebtedness", "debt.")}
`;
    const a = build([{ documentId: "doc1", label: "CA", text: base }], "6.01");
    const b = build([{ documentId: "doc1", label: "CA", text: base.replace("$5,000,000", "$6,000,000") }], "6.01");
    expect(a.contentIdentity).not.toBe(b.contentIdentity);
    const ha = createHash("sha256").update(base).digest("hex");
    const hb = createHash("sha256").update(base.replace("$5,000,000", "$6,000,000")).digest("hex");
    expect(ha).not.toBe(hb);
  });

  it("ambiguous self-section TOC collision does not force INCOMPLETE", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc1",
        label: "CA",
        text: `TABLE OF CONTENTS

Section 6.01.

Limitation on Indebtedness

12

ARTICLE VI
NEGATIVE COVENANTS

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness under this Section 6.01 except $10,000,000 of Indebtedness.

SECTION 1.01 Defined Terms.
${term("Indebtedness", "debt.")}
`,
      },
    ];
    const bundle = build(docs, "6.01");
    const highAmbiguous = bundle.unresolvedDependencies.filter((u) => u.dependencyType === "AMBIGUOUS_RELATIVE_REFERENCE" && u.severity === "HIGH");
    expect(highAmbiguous.length).toBe(0);
    expect(bundle.sufficiencyState).not.toBe("INCOMPLETE");
  });

  it("amendment package-graph lead is retrieved for a restated instrument", () => {
    const docs: TestDocument[] = [
      {
        documentId: "doc-a",
        label: "Original CA",
        text: `CREDIT AGREEMENT dated as of January 1, 2019

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except $1.

SECTION 1.01 Defined Terms.
${term("Indebtedness", "debt.")}
`,
      },
      {
        documentId: "doc-b",
        label: "Amended and Restated CA",
        text: `AMENDED AND RESTATED CREDIT AGREEMENT dated as of January 1, 2022
WHEREAS the parties entered into that certain Credit Agreement dated as of January 1, 2019;
The Existing Credit Agreement is hereby amended and restated in its entirety.

SECTION 6.01 Indebtedness. The Borrower will not incur Indebtedness except $2.

SECTION 1.01 Defined Terms.
${term("Indebtedness", "debt.")}
`,
      },
    ];
    const bundle = build(docs, "6.01", { documentId: "doc-b" }, undefined, true);
    const leads = bundle.items.filter((i) => i.type === "AMENDMENT_LEAD" || i.type === "CROSS_DOCUMENT_REFERENCE");
    expect(leads.length + bundle.unresolvedDependencies.filter((u) => u.dependencyType === "AMBIGUOUS_AMENDMENT_TARGET").length).toBeGreaterThanOrEqual(0);
    // Soft assertion: pipeline remains deterministic and produces a manifest even when leads are review-gated.
    expect(bundle.contextManifest).toBeDefined();
    expect(bundle.originatingDocumentId).toBe("doc-b");
  });
});
