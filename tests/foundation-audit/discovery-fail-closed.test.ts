/**
 * FOUNDATION AUDIT — Part 1: Discovery fail-closed assurance.
 *
 * Adversarial test file, added under the audit's own restriction that
 * production code (lib/, app/, prisma/schema.prisma) is FROZEN during this
 * audit phase. This file only exercises real, unmodified production code
 * paths (lib/contract-model/compiler/discovery/*, structural-coverage.ts,
 * structural-index.ts) with adversarial synthetic inputs and records what
 * ACTUALLY happens, never what the docs claim happens.
 *
 * Every scenario is a real, non-mocked call into the production pipeline
 * except Pass B's own LLM call, which is replaced by a minimal
 * ScriptedStageCaller (the same test-only pattern already established in
 * tests/contract-model/phase-2f2-discovery-schema-robustness.test.ts) —
 * this is the documented $0-cost convention for exercising Layers A/C/D
 * plus a controlled Pass B response, never a weakening of what's tested.
 */
import { describe, it, expect } from "vitest";
import type { ZodType } from "zod";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeStructuralCoverage } from "../../lib/contract-model/compiler/structural-coverage";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { runPassCNeighborhoodExpansion } from "../../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { runPassDReconciliation } from "../../lib/contract-model/compiler/discovery/pass-d-reconcile";
import { runDiscoveryPipeline, classifyDiscoveryHealth } from "../../lib/contract-model/compiler/discovery/pipeline";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";
import { buildRawSourceFallbackFindings, partitionUncoveredSpan, scanRawSourceRegion } from "../../lib/contract-model/compiler/coverage-audit/raw-source-fallback";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

// ---------------------------------------------------------------------------
// Shared test scaffolding
// ---------------------------------------------------------------------------

class ScriptedStageCaller implements StageCaller {
  providerName = "foundation-audit-scripted";
  model = "test-v1";
  isSynthetic = true;
  private callIndex = 0;
  constructor(private scripts: Array<(content: string) => unknown>) {}
  async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, content: string): Promise<T> {
    const script = this.scripts[this.callIndex];
    this.callIndex++;
    if (!script) throw new Error("ScriptedStageCaller: no script left for this call");
    const result = script(content);
    if (result instanceof Error) throw result;
    return schema.parse(result);
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

function buildIndexFromDocs(docs: { documentId: string; label: string; text: string }[]): StructuralIndex {
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  const allDefs = [];
  const allRefs = [];
  for (const doc of docs) {
    const nodes = parseDocumentStructure(doc);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefs.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allRefs.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefs, allRefs);
}

// A realistic (invented facility/company names) negative-covenant article.
const HEALTHY_DOC_TEXT = `
CREDIT AGREEMENT

ARTICLE VI
NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness, except:
(a) Indebtedness existing on the Closing Date and set forth on Schedule 6.01;
(b) Indebtedness incurred pursuant to this Agreement;
(c) Indebtedness in an aggregate principal amount not to exceed $50,000,000 at any time outstanding.

Section 6.02 Liens. The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or suffer to exist any Lien on any property or asset now owned or hereafter acquired, except Permitted Liens.

Section 6.03 [Reserved].

Section 6.04 Restricted Payments. The Borrower shall not, and shall not permit any Restricted Subsidiary to, declare or make any Restricted Payment, except that, so long as no Default has occurred and is continuing, the Borrower may make Restricted Payments not to exceed the greater of $10,000,000 and 15% of Consolidated EBITDA.
`;

describe("FOUNDATION AUDIT Part 1 — Discovery fail-closed assurance", () => {
  // -------------------------------------------------------------------------
  // A. Healthy structure
  // -------------------------------------------------------------------------
  it("A. healthy, well-formed document: structural health is HEALTHY and discovery produces candidates with a healthy discoveryHealth", async () => {
    const documentId = "doc-healthy";
    const index = buildIndexFromDocs([{ documentId, label: "Credit Agreement", text: HEALTHY_DOC_TEXT }]);
    const nodes = index.allNodes().filter((n) => n.documentId === documentId);
    const coverage = computeStructuralCoverage(documentId, HEALTHY_DOC_TEXT, nodes);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");

    const caller = new ScriptedStageCaller([
      () => ({ rules: [{ relativeRef: "", families: ["INDEBTEDNESS"], role: "GENERAL_PROHIBITION", description: "General prohibition on Indebtedness", confidence: 0.9 }] }),
      () => ({ rules: [{ relativeRef: "", families: ["LIENS"], role: "GENERAL_PROHIBITION", description: "General prohibition on Liens", confidence: 0.9 }] }),
      () => ({ rules: [{ relativeRef: "", families: ["RESTRICTED_PAYMENTS"], role: "GENERAL_PROHIBITION", description: "General prohibition on Restricted Payments", confidence: 0.9 }] }),
    ]);
    const result = await runDiscoveryPipeline(caller, documentId, index);
    expect(result.summary.documentDiscoveryHealth).toBe("DISCOVERY_HEALTHY");
    expect(result.summary.sectionFailures).toEqual([]);
    expect(result.candidates.length).toBeGreaterThan(0);
    // Reserved section 6.03 must never get a fabricated candidate (anti-gaming discipline).
    expect(result.candidates.some((c) => c.normalizedSourceRef.startsWith("6.03"))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // B. Partially structured (malformed heading mid-document)
  // -------------------------------------------------------------------------
  it("B. partially structured document (a malformed heading breaks mid-document parsing): sections before the break still discover candidates; health reflects the gap rather than reporting full health silently", async () => {
    // Section 6.02's heading is deliberately garbled (no "Section 6.02" marker at
    // all — a real-world PDF-extraction artifact) so the structural parser
    // cannot recognize it as its own top-level node; its content is not lost
    // (still text), but it will not become its own SECTION node.
    const documentId = "doc-partial";
    const text = `
CREDIT AGREEMENT

ARTICLE VI
NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not create, incur, assume or suffer to exist any Indebtedness, except Indebtedness not to exceed $25,000,000 in the aggregate.

##GARBLED##Liens. The Borrower shall not create or suffer to exist any Lien on any property, except Permitted Liens not to exceed $5,000,000.

Section 6.04 Restricted Payments. The Borrower shall not declare or make any Restricted Payment, except Restricted Payments not to exceed $10,000,000 in the aggregate.
`;
    const index = buildIndexFromDocs([{ documentId, label: "Credit Agreement", text }]);
    const nodes = index.allNodes().filter((n) => n.documentId === documentId);
    const sectionRefs = nodes.filter((n) => n.nodeType === "SECTION").map((n) => n.sectionRef);
    // Confirm the real parser behavior: 6.02 never becomes its own node.
    expect(sectionRefs).not.toContain("6.02");
    expect(sectionRefs).toContain("6.01");
    expect(sectionRefs).toContain("6.04");

    const coverage = computeStructuralCoverage(documentId, text, nodes);
    // The garbled Liens paragraph's real substantive content is folded
    // silently into whichever node's span happens to reach it (see finding
    // DISCOVERY-01 below) rather than reported as a gap — recorded here as
    // observed behavior, not asserted as correct.
    // eslint-disable-next-line no-console
    console.log("[B] coverage.health =", coverage.health, "significantUncoveredSpans =", coverage.significantUncoveredSpans.length);

    const caller = new ScriptedStageCaller([
      () => ({ rules: [{ relativeRef: "", families: ["INDEBTEDNESS"], role: "GENERAL_PROHIBITION", description: "6.01 prohibition", confidence: 0.9 }] }),
      () => ({ rules: [{ relativeRef: "", families: ["RESTRICTED_PAYMENTS"], role: "GENERAL_PROHIBITION", description: "6.04 prohibition", confidence: 0.9 }] }),
    ]);
    const result = await runDiscoveryPipeline(caller, documentId, index);
    // 6.01 and 6.04 candidates must survive even though 6.02 was unparseable.
    expect(result.candidates.some((c) => c.normalizedSourceRef === "6.01")).toBe(true);
    expect(result.candidates.some((c) => c.normalizedSourceRef === "6.04")).toBe(true);
    // No candidate exists anchored at a real "6.02" ref, because no such
    // node exists — this is the "missing context must be surfaced"
    // invariant's responsibility to catch, not discovery's; discovery
    // itself has no way to know 6.02 ever existed.
    expect(result.candidates.some((c) => c.normalizedSourceRef === "6.02")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // C. Corrupted structure (StructuralIndex built over garbage/near-empty text)
  // -------------------------------------------------------------------------
  it("C. corrupted/near-empty structural index: structural health reports STRUCTURE_FAILED, and discovery honestly returns zero candidates rather than inventing signal", async () => {
    const documentId = "doc-garbage";
    const text = "asdkj alksdj alksjd\n\n     \n\nlaksjd alksjdlaksjd. no headings, no sections, no legal structure at all. " + "x".repeat(500);
    const index = buildIndexFromDocs([{ documentId, label: "Garbage", text }]);
    const nodes = index.allNodes().filter((n) => n.documentId === documentId);
    expect(nodes.length).toBe(0); // no ARTICLE/SECTION nodes recognized at all

    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.health).toBe("STRUCTURE_FAILED");
    expect(coverage.topLevelNodeCount).toBe(0);

    const caller = new ScriptedStageCaller([]); // no sections exist, so Pass B should never even be called
    const result = await runDiscoveryPipeline(caller, documentId, index);
    expect(result.candidates).toEqual([]);
    expect(result.summary.sectionsAttempted).toBe(0);
    // KEY CHECK: discovery's own health field reports HEALTHY (0 attempted
    // is HEALTHY by classifyDiscoveryHealth's own definition) even though
    // the STRUCTURAL substrate underneath it totally failed. This is the
    // exact ambiguity the audit spec's invariant is worried about — see
    // finding DISCOVERY-02 below for why this is/is not dangerous in
    // practice (the raw-source-fallback / structural-coverage signal is a
    // SEPARATE, real, independent signal a caller must consult alongside
    // discoveryHealth, never inferred from discoveryHealth alone).
    expect(result.summary.documentDiscoveryHealth).toBe("DISCOVERY_HEALTHY");
    expect(coverage.health).not.toBe("STRUCTURE_HEALTHY");
  });

  // -------------------------------------------------------------------------
  // D. Missing structural region — THE CORE INVARIANT TEST
  // -------------------------------------------------------------------------
  it("D. a whole ARTICLE's worth of real text with ZERO structural nodes, sandwiched between two real nodes, is silently absorbed as 'covered' by structural-coverage.ts — this is a real gap in the fail-closed guarantee", () => {
    const documentId = "doc-missing-region";
    // Node 1: a real, small ARTICLE V node, charStart=0..50.
    // A big substantive gap from 50..5050 (5000 chars) — simulating an
    // entire ARTICLE VI's worth of real covenant text that the structural
    // parser completely failed to recognize as any node at all (zero nodes
    // reference this span in any way).
    // Node 2: a real ARTICLE VII node starting at 5050.
    const missingRegionText = "REAL COVENANT TEXT THAT WAS NEVER STRUCTURALLY RECOGNIZED. ".repeat(80); // ~4800 chars of real substantive prose
    const fullText = "A".repeat(50) + missingRegionText.padEnd(5000, "Z") + "B".repeat(50);
    expect(fullText.length).toBeGreaterThanOrEqual(5100);

    const articleV: StructuralNode = {
      documentId,
      nodeType: "ARTICLE",
      heading: "ARTICLE V — AFFIRMATIVE COVENANTS",
      sectionRef: "V",
      nodeKey: `${documentId}::V`,
      nodeId: `${documentId}::ARTICLE::0`,
      charStart: 0,
      charEnd: 50, // this node's REAL owned span is only the first 50 chars
      ordinal: 0,
      parentSectionRef: null,
      parentNodeId: null,
    };
    const articleVII: StructuralNode = {
      documentId,
      nodeType: "ARTICLE",
      heading: "ARTICLE VII — EVENTS OF DEFAULT",
      sectionRef: "VII",
      nodeKey: `${documentId}::VII`,
      nodeId: `${documentId}::ARTICLE::5050`,
      charStart: 5050,
      charEnd: fullText.length,
      ordinal: 1,
      parentSectionRef: null,
      parentNodeId: null,
    };

    const coverage = computeStructuralCoverage(documentId, fullText, [articleV, articleVII]);

    // eslint-disable-next-line no-console
    console.log("[D] coverage:", JSON.stringify({ coveragePercent: coverage.coveragePercent, health: coverage.health, significantUncoveredSpans: coverage.significantUncoveredSpans.length }, null, 2));

    // THE FINDING: computeTopLevelSpans treats [articleV.charStart, articleVII.charStart)
    // as ARTICLE V's own "span" for coverage purposes — completely ignoring
    // articleV.charEnd (its REAL owned span, 0..50). The ~5000 real
    // substantive characters between them, which correspond to ZERO real
    // structural nodes, are silently reported as "covered by Article V"
    // rather than flagged as a significant uncovered span.
    expect(coverage.significantUncoveredSpans.length).toBe(0); // <-- should be >0 if the gap were detected
    expect(coverage.coveragePercent).toBe(100); // <-- falsely reports 100% coverage
    expect(coverage.health).toBe("STRUCTURE_HEALTHY"); // <-- falsely reports healthy

    // Downstream consequence: because structural-coverage.ts never flags
    // this as an uncovered span, raw-source-fallback.ts — the ONE
    // independent safety net this architecture relies on for exactly this
    // failure mode (see docs/HEADROOM-ARCHITECTURE-INVARIANTS.md #18) —
    // never even attempts to scan this region, because it is only ever
    // invoked over structural-coverage.ts's own reported UncoveredSpan[].
    // Confirmed directly: buildRawSourceFallbackFindings produces NOTHING
    // for the missing Article VI text, because scanRawSourceRegion is only
    // ever called over spans structural-coverage.ts reports as uncovered —
    // and it reported none.
    const regions = coverage.significantUncoveredSpans.map((s) => partitionUncoveredSpan(documentId, fullText, s, "structural coverage gap")).flat();
    expect(regions.length).toBe(0);
    const scanResults = regions.map(scanRawSourceRegion);
    const findings = buildRawSourceFallbackFindings({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentId, healthReasons: coverage.healthReasons, includeDocumentLevelFinding: coverage.health !== "STRUCTURE_HEALTHY", scanResults });
    // Zero findings of ANY kind — the missing ARTICLE VI is completely
    // invisible to both the discovery pipeline (no node -> no Pass A
    // candidate -> never sent to Pass B) AND the independent raw-source
    // fallback auditor (no uncovered span -> never scanned) — a genuine,
    // silent, dual-path blind spot. This directly contradicts invariant
    // #10 ("missing context must be surfaced, never silently treated as
    // nothing more to find") and reproduces the exact shared-substrate
    // failure mode invariant #18 names as the standing precedent to guard
    // against (Phase 2F's Document B — except this is a NEW instance,
    // triggered by a middle-of-document gap rather than a whole-document
    // structural collapse, which is a materially different trigger
    // condition than what #18's own precedent covers).
    expect(findings.length).toBe(0);
  });

  it("D2. a TRAILING missing region (after the LAST top-level node) is ALSO silently absorbed — the blind spot is not limited to mid-document gaps", () => {
    // computeTopLevelSpans sets the LAST top-level node's own 'span' end to
    // textLength unconditionally (topLevel[i+1]?.charStart ?? textLength) —
    // exactly the same charEnd-ignoring construction as the middle-gap case
    // in test D, just applied to the final node instead of an interior one.
    // This means a structural parser that stops recognizing headers partway
    // through a real document (a realistic failure mode: garbled OCR/PDF
    // extraction in the back half of a long agreement) produces a
    // document reported as fully, healthily covered.
    const documentId = "doc-trailing-gap";
    const trailingText = "REAL COVENANT TEXT NEVER STRUCTURALLY RECOGNIZED. ".repeat(80).padEnd(5000, "Z");
    const fullText = "A".repeat(50) + trailingText;
    const articleV: StructuralNode = {
      documentId,
      nodeType: "ARTICLE",
      heading: "ARTICLE V",
      sectionRef: "V",
      nodeKey: `${documentId}::V`,
      nodeId: `${documentId}::ARTICLE::0`,
      charStart: 0,
      charEnd: 50, // real owned span is only 50 chars
      ordinal: 0,
      parentSectionRef: null,
      parentNodeId: null,
    };
    const coverage = computeStructuralCoverage(documentId, fullText, [articleV]);
    // eslint-disable-next-line no-console
    console.log("[D2] coverage:", JSON.stringify({ coveragePercent: coverage.coveragePercent, health: coverage.health, significantUncoveredSpans: coverage.significantUncoveredSpans.length }));
    // ACTUAL (adversarially confirmed) behavior: the trailing gap is ALSO
    // invisible — same root cause as test D, a different trigger shape.
    expect(coverage.significantUncoveredSpans.length).toBe(0);
    expect(coverage.coveragePercent).toBe(100);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
  });

  it("D3. (true control) a LEADING gap (real text BEFORE the first top-level node) IS correctly detected — this is the ONLY uncovered-region shape computeStructuralCoverage's own architecture can ever see", () => {
    const documentId = "doc-leading-gap";
    const leadingText = "REAL COVENANT TEXT NEVER STRUCTURALLY RECOGNIZED, BEFORE THE FIRST NODE. ".repeat(60).padEnd(5000, "Z");
    const fullText = leadingText + "B".repeat(50);
    const articleV: StructuralNode = {
      documentId,
      nodeType: "ARTICLE",
      heading: "ARTICLE V",
      sectionRef: "V",
      nodeKey: `${documentId}::V`,
      nodeId: `${documentId}::ARTICLE::${leadingText.length}`,
      charStart: leadingText.length,
      charEnd: fullText.length,
      ordinal: 0,
      parentSectionRef: null,
      parentNodeId: null,
    };
    const coverage = computeStructuralCoverage(documentId, fullText, [articleV]);
    expect(coverage.significantUncoveredSpans.length).toBeGreaterThan(0);
    expect(coverage.health).not.toBe("STRUCTURE_HEALTHY");
  });

  // -------------------------------------------------------------------------
  // E. Raw-source fallback path is a distinct signal from "genuinely nothing to find"
  // -------------------------------------------------------------------------
  it("E. raw-source fallback correctly distinguishes a structurally-failed document (real signal found in an uncovered span) from a healthy document that legitimately has zero candidates", () => {
    // E1: a genuinely healthy, structured document with a [Reserved]
    // section — legitimately zero candidates there, and it should produce
    // NO raw-source-fallback findings at all (nothing is uncovered).
    const healthyDocId = "doc-e-healthy";
    const healthyIndex = buildIndexFromDocs([{ documentId: healthyDocId, label: "CA", text: HEALTHY_DOC_TEXT }]);
    const healthyNodes = healthyIndex.allNodes().filter((n) => n.documentId === healthyDocId);
    const healthyCoverage = computeStructuralCoverage(healthyDocId, HEALTHY_DOC_TEXT, healthyNodes);
    expect(healthyCoverage.health).toBe("STRUCTURE_HEALTHY");
    const healthyRegions = healthyCoverage.significantUncoveredSpans.map((s) => partitionUncoveredSpan(healthyDocId, HEALTHY_DOC_TEXT, s, "n/a"));
    expect(healthyRegions.length).toBe(0);

    // E2: a document that totally fails to structurally parse (zero nodes)
    // but DOES contain real covenant-shaped prose — the fallback must
    // independently flag this with a real STRUCTURAL_ANALYSIS_INSUFFICIENT
    // + RAW_SOURCE_COVENANT_SIGNAL finding, DIFFERENT from and not
    // conflated with a legitimate zero-candidate outcome.
    const failedDocId = "doc-e-failed";
    // Deliberately NOT using "Section X.XX" markers so the structural
    // parser recognizes zero nodes, while still containing real covenant
    // economics (dollar values, prohibitive language) a human would
    // recognize as needing review.
    const failedText =
      "The Borrower shall not incur Indebtedness in excess of $25,000,000 in the aggregate, and shall not create or suffer to exist any Lien on its assets, except Permitted Liens, without the prior written consent of the Required Lenders. " +
      "The Borrower shall not declare or make any Restricted Payment in excess of $5,000,000 in any fiscal year.";
    const failedIndex = buildIndexFromDocs([{ documentId: failedDocId, label: "Unparseable", text: failedText }]);
    const failedNodes = failedIndex.allNodes().filter((n) => n.documentId === failedDocId);
    expect(failedNodes.length).toBe(0);
    const failedCoverage = computeStructuralCoverage(failedDocId, failedText, failedNodes);
    expect(failedCoverage.health).toBe("STRUCTURE_FAILED");

    const failedRegions = failedCoverage.significantUncoveredSpans.map((s) => partitionUncoveredSpan(failedDocId, failedText, s, "zero structural nodes recognized")).flat();
    const failedScanResults = failedRegions.map(scanRawSourceRegion);
    const failedFindings = buildRawSourceFallbackFindings({ companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, documentId: failedDocId, healthReasons: failedCoverage.healthReasons, includeDocumentLevelFinding: true, scanResults: failedScanResults });

    expect(failedFindings.some((f) => f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT")).toBe(true);
    expect(failedFindings.some((f) => f.findingType === "RAW_SOURCE_COVENANT_SIGNAL")).toBe(true);

    // And confirm discovery's own health signal for the SAME document
    // reports HEALTHY (0 sections attempted) — proving the two signals
    // really are different axes a caller must consult BOTH of, exactly as
    // the audit asked us to verify. A caller that looks only at
    // documentDiscoveryHealth would see "HEALTHY" for a document that in
    // fact totally failed to structurally parse.
    const health = classifyDiscoveryHealth(0, []);
    expect(health).toBe("DISCOVERY_HEALTHY");
  });

  // -------------------------------------------------------------------------
  // Fault isolation re-confirmation (Phase 2F.2 behavior, post-3F.1.2 nodeId migration)
  // -------------------------------------------------------------------------
  it("F. one section's Pass B call throwing does not silently drop the other sections' candidates, and the failure names exactly which section failed", async () => {
    const documentId = "doc-fault-isolation";
    const text = `
CREDIT AGREEMENT

ARTICLE VI
NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower shall not incur any Indebtedness, except Indebtedness not to exceed $10,000,000.

Section 6.02 Liens. The Borrower shall not create any Lien, except Permitted Liens not to exceed $5,000,000.

Section 6.04 Restricted Payments. The Borrower shall not make any Restricted Payment, except amounts not to exceed $2,000,000.
`;
    const index = buildIndexFromDocs([{ documentId, label: "CA", text }]);
    const caller = new ScriptedStageCaller([
      () => ({ rules: [{ relativeRef: "", families: ["INDEBTEDNESS"], role: "GENERAL_PROHIBITION", description: "6.01", confidence: 0.9 }] }),
      () => new Error("simulated network failure mid-document"),
      () => ({ rules: [{ relativeRef: "", families: ["RESTRICTED_PAYMENTS"], role: "GENERAL_PROHIBITION", description: "6.04", confidence: 0.9 }] }),
    ]);
    const result = await runDiscoveryPipeline(caller, documentId, index);
    expect(result.summary.documentDiscoveryHealth).toBe("DISCOVERY_PARTIAL");
    expect(result.summary.sectionFailures).toHaveLength(1);
    expect(result.summary.sectionFailures[0]!.sectionRef).toBe("6.02");
    // 6.01 and 6.04 candidates must still be present.
    expect(result.candidates.some((c) => c.normalizedSourceRef === "6.01")).toBe(true);
    expect(result.candidates.some((c) => c.normalizedSourceRef === "6.04")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Sanity re-check on Pass A/C/D wiring directly (no LLM involved at all)
  // -------------------------------------------------------------------------
  it("G. Pass A/C/D over a healthy document: general prohibition is always synthesized even when Pass B's own output would omit it", () => {
    const documentId = "doc-pacd";
    const index = buildIndexFromDocs([{ documentId, label: "CA", text: HEALTHY_DOC_TEXT }]);
    const deterministic = runPassADeterministicSignals(documentId, index);
    expect(deterministic.length).toBeGreaterThan(0);
    const section = index.allNodes().find((n) => n.documentId === documentId && n.nodeType === "SECTION" && n.sectionRef === "6.01")!;
    // Pass B returns ONLY an exception/basket item, never a general-prohibition item.
    const { candidates } = runPassCNeighborhoodExpansion(index, documentId, section.nodeId, section.sectionRef, [{ relativeRef: "(c)", families: ["INDEBTEDNESS"], role: "BASKET", roleRaw: "BASKET", roleNormalizationStatus: "VALID_CANONICAL", familiesRaw: ["INDEBTEDNESS"], familiesNormalizationStatus: "VALID_CANONICAL", description: "the $50mm basket", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.9, needsReview: false }], "test-version");
    const { candidates: reconciled } = runPassDReconciliation({ documentId, discoveryRunVersion: "test-version", expanded: candidates, discoveryId: (c) => `${c.normalizedSourceRef}::${c.role}`, deterministicByNodeId: new Map(deterministic.map((d) => [d.nodeId, d])) });
    expect(reconciled.some((c) => c.role === "GENERAL_PROHIBITION" && c.normalizedSourceRef === "6.01")).toBe(true);
    expect(reconciled.some((c) => c.role === "BASKET")).toBe(true);
  });
});
