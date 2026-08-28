/**
 * FOUNDATION AUDIT REMEDIATION — Phase 3F.1.4, Workstream A: Source
 * Accounting & Coverage Integrity.
 *
 * Generalized adversarial regression coverage for:
 *  - P0-3 (DISC-01): structural-coverage.ts's real charEnd-bounded
 *    top-level spans (replacing the old "next node's charStart"
 *    construction) - see tests/foundation-audit/discovery-fail-closed.test.ts
 *    D/D2/D3 for the ORIGINAL exact audit counterexamples, updated in place.
 *  - The NEW boundary-anomaly detection (EMBEDDED_HEADING_LIKE_FRAGMENT /
 *    SIGNAL_DENSITY_SHIFT / OWN_TEXT_LENGTH_OUTLIER) that catches the
 *    Q1/Q5-shaped "content is nominally covered by the WRONG node" defect
 *    class pure span/charEnd accounting can never see - see
 *    tests/foundation-audit/part2-adversarial-structural-assumptions.test.ts
 *    Q1/Q5 for the ORIGINAL exact audit counterexamples, updated in place.
 *  - P0-4: coverage-audit/pipeline.ts's raw-source-fallback routing, fixed
 *    to also route on a SIGNIFICANT boundary anomaly, not merely a
 *    significant uncovered span - proven here at the FULL PIPELINE level
 *    (runIndependentCoverageAudit), not just at the coverage-function level.
 *  - The new structural-index.ts health-diagnostics signals
 *    (SIBLING_SPAN_OVERLAP, IMPLAUSIBLE_HIERARCHY_RANK) and the Q3/P1-10
 *    bounded mitigation (SECTION_NUMBER_SEQUENCE_ANOMALY).
 *
 * Every test drives real, unmodified production functions
 * (parseDocumentStructure, buildStructuralIndex, computeStructuralCoverage,
 * runIndependentCoverageAudit) - no mocking of the logic under test.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex, type StructuralHealthFinding } from "../../lib/contract-model/compiler/structural-index";
import { computeStructuralCoverage } from "../../lib/contract-model/compiler/structural-coverage";
import { runIndependentCoverageAudit } from "../../lib/contract-model/compiler/coverage-audit/pipeline";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

function buildIndexFromDocs(docs: { documentId: string; label: string; text: string }[]): StructuralIndex {
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  for (const doc of docs) {
    const nodes = parseDocumentStructure(doc);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
  }
  return buildStructuralIndex(nodesByDocument, [], []);
}

function n(overrides: Partial<StructuralNode> & Pick<StructuralNode, "documentId" | "nodeType" | "sectionRef" | "charStart" | "charEnd">): StructuralNode {
  return {
    documentId: overrides.documentId,
    nodeType: overrides.nodeType,
    heading: overrides.heading ?? overrides.sectionRef,
    sectionRef: overrides.sectionRef,
    nodeKey: overrides.nodeKey ?? `${overrides.documentId}::${overrides.sectionRef.replace(/\s+/g, "")}`,
    nodeId: overrides.nodeId ?? `synthetic:${overrides.documentId}:${overrides.nodeType}:${overrides.charStart}`,
    charStart: overrides.charStart,
    charEnd: overrides.charEnd,
    ordinal: overrides.ordinal ?? 0,
    parentSectionRef: overrides.parentSectionRef ?? null,
    parentNodeId: overrides.parentNodeId ?? null,
  };
}

function errorsOf(findings: StructuralHealthFinding[]): StructuralHealthFinding[] {
  return findings.filter((f) => f.severity === "ERROR");
}

const HEALTHY_DOC_TEXT = `
CREDIT AGREEMENT

ARTICLE VI
NEGATIVE COVENANTS

Section 6.01 Indebtedness . The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:
(a) Indebtedness existing on the Closing Date and set forth on Schedule 6.01;
(b) Indebtedness incurred pursuant to this Agreement;
(c) Indebtedness in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.

Section 6.02 Liens. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on any property or asset now owned or hereafter acquired, except Permitted Liens.

Section 6.03 [Reserved].

Section 6.04 Restricted Payments. The Borrower shall not, and shall not permit any Restricted Subsidiary to, declare or make any Restricted Payment, except that, so long as no Default has occurred and is continuing, the Borrower may make Restricted Payments not to exceed the greater of $10,000,000 and 15% of Consolidated EBITDA.

Section 6.05 Investments. The Borrower shall not, and shall not permit any Restricted Subsidiary to, make any Investment, except Permitted Investments.
`;

// ---------------------------------------------------------------------------
// A. Generalized gap-size/position variants (structural-coverage.ts spans)
// ---------------------------------------------------------------------------
describe("A. structural-coverage.ts real-charEnd span accounting - generalized gap shapes", () => {
  function twoNodes(documentId: string, firstEnd: number, secondStart: number, textLength: number): StructuralNode[] {
    return [
      n({ documentId, nodeType: "ARTICLE", sectionRef: "V", charStart: 0, charEnd: firstEnd, nodeId: "a" }),
      n({ documentId, nodeType: "ARTICLE", sectionRef: "VI", charStart: secondStart, charEnd: textLength, nodeId: "b" }),
    ];
  }

  it("A1. a gap SMALLER than MIN_SIGNIFICANT_UNCOVERED_CHARS (40) is real but correctly NOT reported as 'significant' - the threshold still works with the new accounting", () => {
    const documentId = "a1-tiny-gap";
    const text = "X".repeat(50) + "y".repeat(10) + "Z".repeat(50); // 10-char real gap
    const nodes = twoNodes(documentId, 50, 60, text.length);
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.significantUncoveredSpans).toHaveLength(0);
    // But the gap chars ARE still counted as uncovered in the aggregate accounting - never silently rounded away.
    expect(coverage.uncoveredSubstantiveChars).toBe(10);
    expect(coverage.coveragePercent).toBeLessThan(100);
  });

  it("A2. TWO separate interior gaps are BOTH detected independently, each correctly tagged INTERIOR", () => {
    const documentId = "a2-two-gaps";
    const gap = "g".repeat(100);
    const text = "A".repeat(50) + gap + "B".repeat(50) + gap + "C".repeat(50);
    const nodes = [
      n({ documentId, nodeType: "ARTICLE", sectionRef: "V", charStart: 0, charEnd: 50, nodeId: "a" }),
      n({ documentId, nodeType: "ARTICLE", sectionRef: "VI", charStart: 150, charEnd: 200, nodeId: "b" }),
      n({ documentId, nodeType: "ARTICLE", sectionRef: "VII", charStart: 300, charEnd: text.length, nodeId: "c" }),
    ];
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.significantUncoveredSpans).toHaveLength(2);
    expect(coverage.significantUncoveredSpans.every((s) => s.gapKind === "INTERIOR")).toBe(true);
    expect(coverage.significantUncoveredSpans[0]!.charStart).toBe(50);
    expect(coverage.significantUncoveredSpans[1]!.charStart).toBe(200);
  });

  it("A3. LEADING + INTERIOR + TRAILING all present in the SAME document are all three detected, each with the correct gapKind", () => {
    const documentId = "a3-all-three-shapes";
    const gap = "g".repeat(100);
    const text = gap + "A".repeat(50) + gap + "B".repeat(50) + gap;
    const nodes = [
      n({ documentId, nodeType: "ARTICLE", sectionRef: "V", charStart: 100, charEnd: 150, nodeId: "a" }),
      n({ documentId, nodeType: "ARTICLE", sectionRef: "VI", charStart: 250, charEnd: 300, nodeId: "b" }),
    ];
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.significantUncoveredSpans.map((s) => s.gapKind)).toEqual(["LEADING", "INTERIOR", "TRAILING"]);
    expect(coverage.health).not.toBe("STRUCTURE_HEALTHY");
  });

  it("A4. defensive: OVERLAPPING top-level spans (a distinct anomaly SIBLING_SPAN_OVERLAP now separately catches at the index layer) never produce a negative-length gap or a crash here", () => {
    const documentId = "a4-overlap-defensive";
    const text = "X".repeat(200);
    const nodes = [
      n({ documentId, nodeType: "ARTICLE", sectionRef: "V", charStart: 0, charEnd: 120, nodeId: "a" }),
      n({ documentId, nodeType: "ARTICLE", sectionRef: "VI", charStart: 100, charEnd: 200, nodeId: "b" }), // overlaps [100,120)
    ];
    expect(() => computeStructuralCoverage(documentId, text, nodes)).not.toThrow();
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.significantUncoveredSpans).toHaveLength(0);
    expect(coverage.coveragePercent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// B. Generalized heading-defeat mechanisms (EMBEDDED_HEADING_LIKE_FRAGMENT)
// ---------------------------------------------------------------------------
describe("B. boundary-anomaly detection generalizes beyond the exact Q1 fixture", () => {
  it("B1. extra/doubled internal whitespace around the swallowed heading is STILL caught (a different real-world OCR/extraction defeat shape than Q1's colon)", () => {
    const documentId = "b1-whitespace-defeat";
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Real 6.01 prose here that is unambiguously its own. " +
      "Section   6.02:   Liens .   Real section two prose that should belong to its OWN section 6.02 but extra internal whitespace plus a colon compounds the defeat. " +
      "Section 6.03 Restricted Payments . Real section three prose, unambiguously 6.03's own.";
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    expect(nodes.some((nd) => nd.sectionRef === "6.02")).toBe(false); // confirms the real parser still misses it
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.boundaryAnomalies.some((a) => a.code === "EMBEDDED_HEADING_LIKE_FRAGMENT" && a.severity === "SIGNIFICANT")).toBe(true);
    expect(coverage.health).toBe("STRUCTURE_PARTIAL");
  });

  it("B2. an ARTICLE-level swallow (not just SECTION-level, generalizing Q1 beyond the exact fixture's node type) is also caught", () => {
    const documentId = "b2-article-level-swallow";
    const text =
      "ARTICLE V AFFIRMATIVE COVENANTS Section 5.01 Reporting . Real 5.01 prose, unambiguously its own and reasonably long so the fragment clears the significance threshold with real substantive content padding it out further still. " +
      "ARTICLE VI: NEGATIVE COVENANTS. Neither party shall incur any Indebtedness whatsoever in excess of the amounts expressly permitted under this Agreement without the prior written consent of the Required Lenders, remaining at all times fully subject to the other terms and conditions of this Agreement. " +
      "Section 6.01 Indebtedness . Real 6.01 prose that should belong to a genuinely separate ARTICLE VI but the colon after the article number defeats the real parser's own ARTICLE_PATTERNS, so it is silently swallowed into ARTICLE V's own claimed span instead of becoming its own top-level node.";
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const articles = nodes.filter((nd) => nd.nodeType === "ARTICLE");
    expect(articles).toHaveLength(1); // confirms the real parser only ever recognized ONE article - the swallow is real
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    const embedded = coverage.boundaryAnomalies.filter((a) => a.code === "EMBEDDED_HEADING_LIKE_FRAGMENT");
    expect(embedded.length).toBeGreaterThan(0);
    expect(embedded.some((a) => a.severity === "SIGNIFICANT")).toBe(true);
  });

  it("B3. NEGATIVE CONTROL: ordinary lowercase in-prose use of the word 'section' never falsely triggers an embedded-heading finding (bounded false-positive risk, by design)", () => {
    const documentId = "b3-lowercase-negative-control";
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness except as described in this section of the Agreement, which section governs Indebtedness generally and cross-references other sections throughout without ever forming a real heading-shaped fragment. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.boundaryAnomalies.filter((a) => a.code === "EMBEDDED_HEADING_LIKE_FRAGMENT")).toHaveLength(0);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
  });
});

// ---------------------------------------------------------------------------
// C. SIGNAL_DENSITY_SHIFT generalization (Q5 beyond the ARTICLE-only fixture)
// ---------------------------------------------------------------------------
describe("C. SIGNAL_DENSITY_SHIFT generalizes Q5 beyond the exact ARTICLE-direct-clause fixture", () => {
  it("C1. a SECTION (not an ARTICLE) whose own text contains 2+ distinct lettered markers with ZERO real children is flagged SIGNIFICANT", () => {
    const documentId = "c1-section-level-density-shift";
    // Deliberately defeats clause-tree parsing: buildClauseTree's own
    // exact-sequence rule (clause-hierarchy.ts) only starts a new list at
    // index 1 ("(a)"/"(i)"/"(A)"/"(1)") - a bare reference to two
    // NON-sequential, out-of-order letters ("(b)" then "(d)", never
    // preceded by a real "(a)") satisfies neither the "start a new level"
    // rule (index must be 1) nor any "continue an open level" rule (no
    // level is ever open), so BOTH are silently skipped and zero
    // CLAUSE/SUBSECTION nodes are created at all - a real, if narrower,
    // clause-tree defeat shape distinct from Q1/B1/B2's heading-defeat mechanism.
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness except (b) as set forth on Schedule 6.01 hereto; or (d) as separately approved in writing by the Required Lenders from time to time. Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const section601 = nodes.find((nd) => nd.sectionRef === "6.01")!;
    expect(nodes.filter((nd) => nd.parentNodeId === section601.nodeId)).toHaveLength(0); // confirms zero real children were parsed for 6.01
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    const density = coverage.boundaryAnomalies.filter((a) => a.code === "SIGNAL_DENSITY_SHIFT" && a.nodeId === section601.nodeId);
    expect(density.length).toBeGreaterThan(0);
    expect(density[0]!.severity).toBe("SIGNIFICANT");
  });

  it("C2. NEGATIVE CONTROL: the same marker shapes, when clause-tree parsing DOES succeed (real children exist), never produce a density-shift finding", () => {
    const documentId = "c2-real-children-negative-control";
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except:
(a) Permitted Indebtedness of the first kind;
(b) Permitted Indebtedness of the second kind.

Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.
`.trim();
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const section601 = nodes.find((nd) => nd.sectionRef === "6.01")!;
    expect(nodes.filter((nd) => nd.parentNodeId === section601.nodeId).length).toBeGreaterThan(0);
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.boundaryAnomalies.filter((a) => a.code === "SIGNAL_DENSITY_SHIFT")).toHaveLength(0);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
  });

  it("C3. a SINGLE stray, out-of-sequence clause-letter cross-reference ('clause (c) above', never preceded by a real '(a)'/'(b)' so it never itself qualifies as a real clause start either) with zero children is only WARNING, never forces health down on its own", () => {
    const documentId = "c3-single-marker-warning-only";
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness, subject to the exception described in clause (c) above of the Existing Credit Agreement referenced elsewhere in this Agreement. Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    const density = coverage.boundaryAnomalies.filter((a) => a.code === "SIGNAL_DENSITY_SHIFT");
    expect(density.length).toBeGreaterThan(0);
    expect(density.every((a) => a.severity === "WARNING")).toBe(true);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
  });
});

// ---------------------------------------------------------------------------
// D. OWN_TEXT_LENGTH_OUTLIER - WARNING-only by design (never fails a document)
// ---------------------------------------------------------------------------
describe("D. OWN_TEXT_LENGTH_OUTLIER is WARNING-only and never gates health on its own", () => {
  it("a section 5x longer than its siblings is flagged WARNING, but health stays governed by the other, real signals only", () => {
    const documentId = "d-length-outlier";
    const filler = "This is ordinary, unremarkable covenant prose repeated to build up real substantive length. ";
    const normalBody = filler.repeat(10); // ~900 substantive chars
    const longBody = filler.repeat(60); // ~5400 substantive chars - well over 4x normalBody and over the 2000-char absolute floor
    const text = [
      "ARTICLE VI COVENANTS",
      `Section 6.01 Indebtedness . ${normalBody}`,
      `Section 6.02 Liens . ${normalBody}`,
      `Section 6.03 Investments . ${longBody}`,
      `Section 6.04 Restricted Payments . ${normalBody}`,
    ].join("\n\n");
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    const outliers = coverage.boundaryAnomalies.filter((a) => a.code === "OWN_TEXT_LENGTH_OUTLIER");
    expect(outliers.length).toBeGreaterThan(0);
    expect(outliers.every((a) => a.severity === "WARNING")).toBe(true);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
  });
});

// ---------------------------------------------------------------------------
// E. Positive control + full-pipeline (P0-4) routing proof
// ---------------------------------------------------------------------------
describe("E. positive control (no false-positive explosion) and full runIndependentCoverageAudit routing proof", () => {
  it("E1. a genuinely healthy, well-formed multi-section document produces ZERO significant uncovered spans and ZERO significant boundary anomalies", () => {
    const documentId = "e1-healthy-positive-control";
    const nodes = parseDocumentStructure({ documentId, label: documentId, text: HEALTHY_DOC_TEXT });
    const coverage = computeStructuralCoverage(documentId, HEALTHY_DOC_TEXT, nodes);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
    expect(coverage.significantUncoveredSpans).toHaveLength(0);
    expect(coverage.boundaryAnomalies.filter((a) => a.severity === "SIGNIFICANT")).toHaveLength(0);
  });

  it("E2. P0-4 FULL PIPELINE proof: runIndependentCoverageAudit's own raw-source-fallback routing now fires for a mid-document swallow AND a trailing swallow (not merely at the computeStructuralCoverage function level)", () => {
    const gapText = "REAL COVENANT TEXT THAT WAS NEVER STRUCTURALLY RECOGNIZED. ".repeat(80).padEnd(5000, "Z");
    const midDocId = "e2-mid-doc-swallow";
    const midFullText = "A".repeat(50) + gapText + "B".repeat(50);
    const midNodes: StructuralNode[] = [
      n({ documentId: midDocId, nodeType: "ARTICLE", sectionRef: "V", charStart: 0, charEnd: 50, nodeId: "e2-a" }),
      n({ documentId: midDocId, nodeType: "ARTICLE", sectionRef: "VII", charStart: midFullText.length - 50, charEnd: midFullText.length, nodeId: "e2-b" }),
    ];
    const trailDocId = "e2-trailing-swallow";
    const trailFullText = "A".repeat(50) + gapText;
    const trailNodes: StructuralNode[] = [n({ documentId: trailDocId, nodeType: "ARTICLE", sectionRef: "V", charStart: 0, charEnd: 50, nodeId: "e2-c" })];

    const index = buildStructuralIndex(
      new Map([
        [midDocId, { text: midFullText, nodes: midNodes }],
        [trailDocId, { text: trailFullText, nodes: trailNodes }],
      ]),
      [],
      []
    );
    const result = runIndependentCoverageAudit({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: [midDocId, trailDocId], index, candidates: [], packageGraph: null, bundles: [] });
    const midFindings = result.findings.filter((f) => f.documentId === midDocId);
    const trailFindings = result.findings.filter((f) => f.documentId === trailDocId);
    expect(midFindings.some((f) => f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT")).toBe(true);
    expect(trailFindings.some((f) => f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT")).toBe(true);
  });

  it("E3. P0-4 FULL PIPELINE proof: a Q1-shaped colon-defeated mid-document swallow (nominally 'covered', no coverage gap at all) STILL reaches the raw-source-fallback scan through the full pipeline via the new boundary-anomaly routing", () => {
    const documentId = "e3-q1-shaped-full-pipeline";
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . The Borrower shall not incur any Indebtedness in excess of $25,000,000 in the aggregate without the prior written consent of the Required Lenders. " +
      "Section 6.02: Liens . The Borrower shall not create or suffer to exist any Lien on its assets in excess of $10,000,000, except Permitted Liens, without the prior written consent of the Required Lenders. " +
      "Section 6.03 Restricted Payments . The Borrower shall not declare or make any Restricted Payment in excess of $5,000,000 in any fiscal year.";
    const index = buildIndexFromDocs([{ documentId, label: documentId, text }]);
    const nodes = index.allNodes().filter((nd) => nd.documentId === documentId);
    expect(nodes.some((nd) => nd.sectionRef === "6.02")).toBe(false); // confirms the real parser still misses it
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.significantUncoveredSpans).toHaveLength(0); // no coverage GAP - this is the whole point of the boundary-anomaly defect class
    const result = runIndependentCoverageAudit({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: [documentId], index, candidates: [], packageGraph: null, bundles: [] });
    const docFindings = result.findings.filter((f) => f.documentId === documentId);
    expect(docFindings.some((f) => f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT")).toBe(true);
    // The swallowed Liens text carries real covenant/economic signal - the
    // independent raw-text scan (triggered by the boundary anomaly, never
    // by re-reading Phase 2B/2D output) should surface it too.
    expect(docFindings.some((f) => f.findingType === "RAW_SOURCE_COVENANT_SIGNAL")).toBe(true);
  });

  it("E4. NEGATIVE CONTROL: a genuinely healthy document produces ZERO STRUCTURAL_ANALYSIS_INSUFFICIENT/RAW_SOURCE_* findings through the full pipeline - no unreasonable full-document raw-scan explosion for clean documents", () => {
    const documentId = "e4-healthy-full-pipeline-negative-control";
    const index = buildIndexFromDocs([{ documentId, label: documentId, text: HEALTHY_DOC_TEXT }]);
    const result = runIndependentCoverageAudit({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: [documentId], index, candidates: [], packageGraph: null, bundles: [] });
    const docFindings = result.findings.filter((f) => f.documentId === documentId);
    expect(docFindings.filter((f) => f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT" || f.findingType === "RAW_SOURCE_COVENANT_SIGNAL" || f.findingType === "RAW_SOURCE_AMENDMENT_SIGNAL")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F. structural-index.ts new health checks - generalized beyond the single fixtures
// ---------------------------------------------------------------------------
describe("F. SIBLING_SPAN_OVERLAP and IMPLAUSIBLE_HIERARCHY_RANK generalize beyond the exact fault-injection fixtures", () => {
  it("F1. sibling overlap among TOP-LEVEL ROOT nodes (not merely children under a shared parent) is also detected", () => {
    const a = n({ documentId: "f1", nodeType: "ARTICLE", sectionRef: "V", charStart: 0, charEnd: 500, nodeId: "art-v" });
    const b = n({ documentId: "f1", nodeType: "ARTICLE", sectionRef: "VI", charStart: 400, charEnd: 900, nodeId: "art-vi" }); // overlaps art-v's [0,500) at [400,500)
    const index = buildStructuralIndex(new Map([["f1", { text: "x".repeat(1000), nodes: [a, b] }]]), [], []);
    const overlaps = index.healthDiagnostics().filter((f) => f.code === "SIBLING_SPAN_OVERLAP");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.nodeId).toBe("art-vi");
  });

  it("F2. a rank-skip of MORE than one level (SUBCLAUSE directly under SECTION, skipping SUBSECTION and CLAUSE) is also detected", () => {
    const section = n({ documentId: "f2", nodeType: "SECTION", sectionRef: "6.01", charStart: 0, charEnd: 1000, nodeId: "sec-601" });
    const subclause = n({ documentId: "f2", nodeType: "SUBCLAUSE", sectionRef: "6.01(a)(i)(A)", charStart: 10, charEnd: 20, parentNodeId: "sec-601", nodeId: "subclause-1" });
    const index = buildStructuralIndex(new Map([["f2", { text: "x".repeat(1000), nodes: [section, subclause] }]]), [], []);
    const rankFindings = index.healthDiagnostics().filter((f) => f.code === "IMPLAUSIBLE_HIERARCHY_RANK");
    expect(rankFindings).toHaveLength(1);
    expect(rankFindings[0]!.nodeId).toBe("subclause-1");
  });

  it("F3. NEGATIVE CONTROL: ordinary ADJACENT-rank parenting (SUBSECTION directly under SECTION, ARTICLE directly under nothing/SECTION under ARTICLE) never fires IMPLAUSIBLE_HIERARCHY_RANK", () => {
    const article = n({ documentId: "f3", nodeType: "ARTICLE", sectionRef: "VI", charStart: 0, charEnd: 1000, nodeId: "art-6" });
    const section = n({ documentId: "f3", nodeType: "SECTION", sectionRef: "6.01", charStart: 10, charEnd: 500, parentNodeId: "art-6", nodeId: "sec-601" });
    const subsection = n({ documentId: "f3", nodeType: "SUBSECTION", sectionRef: "6.01(a)", charStart: 20, charEnd: 100, parentNodeId: "sec-601", nodeId: "sub-a" });
    const index = buildStructuralIndex(new Map([["f3", { text: "x".repeat(1000), nodes: [article, section, subsection] }]]), [], []);
    expect(errorsOf(index.healthDiagnostics()).filter((f) => f.code === "IMPLAUSIBLE_HIERARCHY_RANK")).toHaveLength(0);
  });

  it("F4. NEGATIVE CONTROL: ordinary non-overlapping siblings never fire SIBLING_SPAN_OVERLAP", () => {
    const parent = n({ documentId: "f4", nodeType: "SECTION", sectionRef: "6.01", charStart: 0, charEnd: 1000, nodeId: "sec-601" });
    const a = n({ documentId: "f4", nodeType: "SUBSECTION", sectionRef: "6.01(a)", charStart: 100, charEnd: 300, parentNodeId: "sec-601", nodeId: "sub-a" });
    const b = n({ documentId: "f4", nodeType: "SUBSECTION", sectionRef: "6.01(b)", charStart: 300, charEnd: 600, parentNodeId: "sec-601", nodeId: "sub-b" });
    const index = buildStructuralIndex(new Map([["f4", { text: "x".repeat(1000), nodes: [parent, a, b] }]]), [], []);
    expect(index.healthDiagnostics().filter((f) => f.code === "SIBLING_SPAN_OVERLAP")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G. Q3/P1-10 bounded mitigation: SECTION_NUMBER_SEQUENCE_ANOMALY
// ---------------------------------------------------------------------------
describe("G. Q3/P1-10 SECTION_NUMBER_SEQUENCE_ANOMALY - detection-only bounded mitigation (see final report for the full ARCHITECTURE_CHANGE_REQUIRED determination on CORRECTING the underlying misattachment)", () => {
  it("G1. the exact Q3 fixture (a spurious in-text 'Section 6.05 Reserved .' citation between real 6.01 and 6.02) IS flagged - INFO severity, never gating", () => {
    const documentId = "g1-q3-exact-fixture";
    const text =
      "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness, except as permitted under Section 6.05 Reserved . and subject to the following exceptions: " +
      "(a) Indebtedness existing on the Closing Date; " +
      "(b) intercompany Indebtedness. " +
      "Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    const index = buildIndexFromDocs([{ documentId, label: documentId, text }]);
    const anomalies = index.healthDiagnostics().filter((f) => f.code === "SECTION_NUMBER_SEQUENCE_ANOMALY");
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.every((f) => f.severity === "INFO")).toBe(true);
    // INFO-severity, non-gating: confirmed zero ERROR findings for this
    // exact scenario, matching Q3's own original assertion (the underlying
    // misattachment is NOT corrected by this signal - see the final report).
    expect(errorsOf(index.healthDiagnostics())).toHaveLength(0);
  });

  it("G2. NEGATIVE CONTROL: Q3b's genuinely well-ordered two-section document never fires SECTION_NUMBER_SEQUENCE_ANOMALY", () => {
    const documentId = "g2-q3b-control";
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except:
(a) Permitted Indebtedness of the first kind;
(b) Permitted Indebtedness of the second kind.

Section 6.02 Liens . Neither party shall grant Liens except:
(a) Permitted Liens of the first kind;
(b) Permitted Liens of the second kind.
`.trim();
    const index = buildIndexFromDocs([{ documentId, label: documentId, text }]);
    expect(index.healthDiagnostics().filter((f) => f.code === "SECTION_NUMBER_SEQUENCE_ANOMALY")).toHaveLength(0);
  });

  it("G3. NEGATIVE CONTROL: a legitimate inserted lettered-decimal section ('6.01A' between 6.01 and 6.02) never false-positives", () => {
    const documentId = "g3-legitimate-lettered-insertion";
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Original indebtedness covenant text.

Section 6.01A Additional Indebtedness . An inserted section from a later amendment, legitimately numbered between 6.01 and 6.02.

Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.
`.trim();
    const index = buildIndexFromDocs([{ documentId, label: documentId, text }]);
    expect(index.healthDiagnostics().filter((f) => f.code === "SECTION_NUMBER_SEQUENCE_ANOMALY")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// H. Explicit fail-closed assertions
// ---------------------------------------------------------------------------
describe("H. fail-closed discipline: uncertain/ambiguous structural evidence is always surfaced as a signal, never silently treated as fine", () => {
  it("a document combining a real coverage gap AND a real boundary anomaly surfaces BOTH independently - neither masks the other, and both route to the raw-source-fallback scan", () => {
    const documentId = "h-combined-uncertainty";
    const gapText = "REAL COVENANT TEXT NEVER STRUCTURALLY RECOGNIZED. ".repeat(80).padEnd(5000, "Z");
    // Build: ARTICLE V (real, own text swallows a colon-defeated heading-shaped fragment) -> big real gap -> ARTICLE VII (real).
    const swallowPrefix = "Section 5.01 Reporting . Real 5.01 prose. Section 5.02: Notices . Swallowed fragment prose that should have been its own section but the colon defeats the real parser, forming a genuine boundary anomaly of significant substantive length on its own. ";
    const fullText = swallowPrefix.padEnd(200, "P") + gapText + "B".repeat(50);
    const articleV: StructuralNode = n({ documentId, nodeType: "ARTICLE", sectionRef: "V", charStart: 0, charEnd: 200, nodeId: "h-a" });
    const articleVII: StructuralNode = n({ documentId, nodeType: "ARTICLE", sectionRef: "VII", charStart: fullText.length - 50, charEnd: fullText.length, nodeId: "h-b" });
    const coverage = computeStructuralCoverage(documentId, fullText, [articleV, articleVII]);
    expect(coverage.significantUncoveredSpans.length).toBeGreaterThan(0); // the real gap is surfaced
    expect(coverage.boundaryAnomalies.some((a) => a.code === "EMBEDDED_HEADING_LIKE_FRAGMENT" && a.severity === "SIGNIFICANT")).toBe(true); // the swallow is ALSO surfaced, independently
    expect(coverage.health).not.toBe("STRUCTURE_HEALTHY");

    const index = buildStructuralIndex(new Map([[documentId, { text: fullText, nodes: [articleV, articleVII] }]]), [], []);
    const result = runIndependentCoverageAudit({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentIds: [documentId], index, candidates: [], packageGraph: null, bundles: [] });
    expect(result.findings.some((f) => f.documentId === documentId && f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT")).toBe(true);
  });
});
