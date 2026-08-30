/**
 * Phase 3F.1.6.RX Part B - independent, production-frozen recertification.
 * Auditor 2 scope: BLOCKER-2 through BLOCKER-6 + the orchestrator
 * supersession/lineage integration closure (18-orchestrator-supersession-
 * lineage-closure.json). See docs/phase-3f1-6-rx-final-blocker-closure/
 * 24-part-b-blocker2-6-orchestrator-recertification.json for the full
 * write-up this file's own results feed into.
 *
 * NEW ADVERSARIAL FINDING (BLOCKER-5 scope): Workstream B's own per-tool
 * trace (04-operative-supersession-remediation.json) reviewed all 14
 * LLM-facing evidence tools in lib/contract-model/compiler/semantic/tools.ts
 * and found getDefinition "findProvisionView-first, correct as claimed."
 * That trace checked only the HAPPY branch (operative?.currentText truthy).
 * Independently re-reading getDefinition's own execute() body line by line
 * shows an asymmetry with its SECTION-kind sibling getOperativeProvision:
 * getOperativeProvision discloses `view.status` in BOTH its "found" and
 * "not found, raw fallback" branches; getDefinition discloses NOTHING about
 * `operative.status` in either branch - when `operative` exists (a real,
 * known amendment/ambiguity record for this exact term) but
 * `operative.currentText` is null (the honest value buildProvisionView sets
 * whenever targetResolutionStatus !== "UNIQUE", e.g. a real AMBIGUOUS
 * DEFINITION amendment - exactly BLOCKER-6's own scenario shape, see
 * operative-state.ts lines ~294/342), getDefinition silently falls through
 * to the RAW, stale base-document definition text via
 * getScopedDefinitionFullText, labeled only `source: "base-document"` -
 * with ZERO indication that a real, known amendment ambiguity exists for
 * this exact term. This is the SUPER-5-shaped false-confidence bypass
 * (raw text served as if uncontested) reintroduced through a narrower gap
 * than the 5 originally-named tools, on a fixture directly modeled on
 * cross-module-propagation-chains.test.ts's own "Chain 2" BLOCKER-6
 * construction (2 real physical definitions of the same term, one real
 * amendment targeting it, real AMBIGUOUS/PARTIAL resolution).
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { OperativeContractState, OperativeProvisionView } from "../../lib/contract-model/compiler/amendment/types";
import type { DetectedDefinition } from "../../lib/contract-model/compiler/structural-definitions";
import { emptyContextBundle, TEST_DOCUMENT_ID } from "./semantic-compiler/test-helpers";

const STALE_DEFINITION_TEXT = `"Permitted Investments" means investments not to exceed $8,000,000 in the aggregate.`;

function buildIndexWithStaleDefinition() {
  const node: StructuralNode = {
    documentId: TEST_DOCUMENT_ID,
    nodeType: "CLAUSE",
    heading: "Permitted Investments",
    sectionRef: "1.01(pi)",
    nodeKey: `${TEST_DOCUMENT_ID}::1.01(pi)`,
    nodeId: `n-${TEST_DOCUMENT_ID}-pi`,
    charStart: 0,
    charEnd: STALE_DEFINITION_TEXT.length,
    ordinal: 0,
    parentSectionRef: null,
    parentNodeId: null,
  };
  const def: DetectedDefinition = {
    documentId: TEST_DOCUMENT_ID,
    exactTerm: "Permitted Investments",
    normalizedTerm: "permitted investments",
    sourceNodeKey: node.nodeKey,
    sourceNodeId: node.nodeId,
    charStart: 0,
    charEnd: STALE_DEFINITION_TEXT.length,
    definitionExcerpt: STALE_DEFINITION_TEXT,
  };
  const index = buildStructuralIndex(new Map([[TEST_DOCUMENT_ID, { text: STALE_DEFINITION_TEXT, nodes: [node] }]]), [def], []);
  return { index, node };
}

/** Mirrors cross-module-propagation-chains.test.ts's own "Chain 2" real AMBIGUOUS DEFINITION construction (2 real physical definitions of the same term, a real amendment effect targeting it, buildProvisionView's own real AMBIGUOUS/PARTIAL/currentText-null resolution) - here hand-built for direct, isolated tool-level testing rather than re-run through the full amendment pipeline, exactly as the existing semantic-tools-operative-state-discipline.test.ts's own supersededProvision() fixture already does for the SECTION-kind case. */
function ambiguousDefinitionProvision(): OperativeProvisionView {
  return {
    instrumentKey: "instrument-1",
    provisionKey: "instrument-1::DEFINITION::permitted investments",
    kind: "DEFINITION",
    documentId: TEST_DOCUMENT_ID,
    sectionRef: null,
    definedTermRef: "Permitted Investments",
    asOfDate: "2026-01-01",
    currentSourceDocumentId: TEST_DOCUMENT_ID,
    currentSourceNodeKey: null,
    currentSourceNodeId: null,
    currentText: null, // honest: AMBIGUOUS target resolution -> no confidently-attached currentText (operative-state.ts's own real rule).
    fullChain: [{ effectId: "eff-1", amendmentDocumentId: "amend-doc-1", operation: "MODIFY_THRESHOLD", effectiveDate: { date: "2024-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "test", reason: "test" }, sourceCitation: "Amendment No. 1 Section 2", appliedAsOfQuery: true }],
    appliedChain: [{ effectId: "eff-1", amendmentDocumentId: "amend-doc-1", operation: "MODIFY_THRESHOLD", effectiveDate: { date: "2024-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "test", reason: "test" }, sourceCitation: "Amendment No. 1 Section 2", appliedAsOfQuery: true }],
    supersededSourceNodeKeys: [],
    supersededSourceNodeIds: [],
    status: "OPERATIVE_STATE_PARTIAL",
    unresolvedIssues: ["This defined term's own base reference is AMBIGUOUS: 2 distinct physical occurrences define it, and the amendment's own target could not be uniquely attached to either."],
    conflicts: [],
    targetResolutionStatus: "AMBIGUOUS",
    targetResolutionReason: "2 distinct physical occurrences of \"Permitted Investments\" exist in this document - the amendment's own target could not be uniquely resolved.",
    candidateSourceNodeIds: ["n-permitted-investments-a", "n-permitted-investments-b"],
    structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
    structuralHealthIssues: [],
    attemptedText: "The Permitted Investments basket is hereby increased.",
    reviewRequired: true,
    candidateTexts: [],
  };
}

describe("Part B recert - NEW finding: getDefinition silently serves stale text for a real, known AMBIGUOUS DEFINITION amendment", () => {
  it("getOperativeProvision's SECTION-kind analog discloses status even when currentText cannot be attached (the correct, established pattern)", () => {
    const sectionNode: StructuralNode = { documentId: TEST_DOCUMENT_ID, nodeType: "SECTION", heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${TEST_DOCUMENT_ID}::6.01`, nodeId: `n-${TEST_DOCUMENT_ID}-601`, charStart: 0, charEnd: 50, ordinal: 0, parentSectionRef: null, parentNodeId: null };
    const index = buildStructuralIndex(new Map([[TEST_DOCUMENT_ID, { text: "Section 6.01 Indebtedness. Stale $50,000,000 text.", nodes: [sectionNode] }]]), [], []);
    const ambiguousSectionProvision: OperativeProvisionView = {
      ...ambiguousDefinitionProvision(),
      kind: "SECTION",
      sectionRef: "6.01",
      definedTermRef: null,
      provisionKey: "instrument-1::SECTION::6.01",
    };
    const operativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [ambiguousSectionProvision], status: "OPERATIVE_STATE_PARTIAL", summary: "test", unattachedEffects: [] };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const getOperativeProvision = tools.find((t) => t.name === "getOperativeProvision")!;
    const outcome = getOperativeProvision.execute({ sectionRef: "6.01" });
    const result = outcome.result as Record<string, unknown>;
    // Even though currentText could not be attached (AMBIGUOUS), the tool
    // honestly discloses the real status - never silently substitutes raw
    // structural text without saying so.
    expect(result.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(result.currentText).toBe("(no current text recorded)");
  });

  it("BUG: getDefinition, given a real AMBIGUOUS DEFINITION amendment record for this exact term, silently returns the raw stale base-document text with NO status/ambiguity disclosure at all - a false-confidence answer for a MATERIAL term (e.g. a covenant basket definition)", () => {
    const { index } = buildIndexWithStaleDefinition();
    const operativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [ambiguousDefinitionProvision()], status: "OPERATIVE_STATE_PARTIAL", summary: "test", unattachedEffects: [] };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const getDefinition = tools.find((t) => t.name === "getDefinition")!;

    const outcome = getDefinition.execute({ term: "Permitted Investments" });
    const result = outcome.result as Record<string, unknown>;

    // OBSERVED (real, current production behavior): the raw, stale
    // $8,000,000 base-document text is served, unconditionally labeled
    // "source: base-document" - EXACTLY the label a genuinely-never-amended
    // term would also receive. There is no way for the LLM (or a human
    // reading the tool_result JSON) to tell this term is subject to a real,
    // known amendment the operative-state layer could not resolve.
    expect(result.source).toBe("base-document");
    expect(result.text).toContain("$8,000,000");
    // The bug: no field on this response discloses the real OperativeProvisionView
    // this exact term already has on file (status, targetResolutionStatus,
    // unresolvedIssues, reviewRequired) - contrast with getOperativeProvision
    // above, which discloses `status` unconditionally whenever a view exists.
    expect(result.status).toBeUndefined();
    expect(result.unresolvedIssues).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/AMBIGUOUS|PARTIAL|ambiguous|review/i);

    // Confirms this is not merely "no operativeState was supplied at all"
    // (an honest, already-covered case) - a real, on-file OperativeProvisionView
    // for this EXACT term with a real non-RESOLVED status is being silently
    // discarded by this one code path.
    expect(operativeState.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(operativeState.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
  });

  it("cross-check: getRelatedAmendments (a DIFFERENT tool, not always called by the model before trusting getDefinition) DOES correctly disclose the same ambiguity for the identical term - proving the operative-state record itself is fully correct and available; only getDefinition's own fallback branch fails to consult it", () => {
    const { index } = buildIndexWithStaleDefinition();
    const operativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [ambiguousDefinitionProvision()], status: "OPERATIVE_STATE_PARTIAL", summary: "test", unattachedEffects: [] };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const getRelatedAmendments = tools.find((t) => t.name === "getRelatedAmendments")!;
    const outcome = getRelatedAmendments.execute({ ref: "Permitted Investments" });
    const result = outcome.result as Record<string, unknown>;
    expect(result.status).toBe("OPERATIVE_STATE_PARTIAL");
  });
});
