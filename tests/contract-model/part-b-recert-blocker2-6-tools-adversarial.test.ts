/**
 * Phase 3F.1.6.RX Part B - independent, production-frozen recertification.
 * Auditor 2 scope: BLOCKER-2 through BLOCKER-6 + the orchestrator
 * supersession/lineage integration closure (18-orchestrator-supersession-
 * lineage-closure.json). See docs/phase-3f1-6-rx-final-blocker-closure/
 * 24-part-b-blocker2-6-orchestrator-recertification.json for the full
 * write-up this file's own results originally fed into.
 *
 * Phase 3F.1.6.RX-FINAL Workstream B (FINDING-2/FINDING-3 remediation) -
 * this file originally DOCUMENTED the live defect the recertification
 * above found (24's own task5_blocker5RealDefect / task4.blocker6):
 * getDefinition silently served the raw, stale base-document definition
 * text with a plain `source: "base-document"` label - indistinguishable
 * from a never-amended term - for a term with a real, on-file
 * AMBIGUOUS/PARTIAL amendment record, unlike its SECTION-kind sibling
 * getOperativeProvision (which always discloses `status` in every
 * branch). The fix (lib/contract-model/compiler/semantic/tools.ts's
 * getDefinition, reusing getOperativeProvision's own discipline exactly -
 * see that file's own header comment on the fix) is now in production;
 * this file's assertions below have been updated from "prove the bug
 * exists" to "prove the bug is closed and stays closed" - same fixtures,
 * same adversarial construction, opposite expected outcome. See
 * docs/phase-3f1-6-rx-final-terminal-closure/
 * 04-definition-operative-safety-remediation.json for the full write-up.
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

describe("Part B recert FINDING-2/3 - FIXED: getDefinition no longer silently serves stale text for a real, known AMBIGUOUS DEFINITION amendment", () => {
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

  it("FIXED: getDefinition, given a real AMBIGUOUS DEFINITION amendment record for this exact term, no longer returns the raw stale base-document text as though uncontested - it discloses the real operative status and withholds the confident-looking figure", () => {
    const { index } = buildIndexWithStaleDefinition();
    const operativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [ambiguousDefinitionProvision()], status: "OPERATIVE_STATE_PARTIAL", summary: "test", unattachedEffects: [] };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const getDefinition = tools.find((t) => t.name === "getDefinition")!;

    const outcome = getDefinition.execute({ term: "Permitted Investments" });
    const result = outcome.result as Record<string, unknown>;

    // FIXED (mirrors getOperativeProvision's own established discipline
    // exactly): the real operative status is disclosed unconditionally
    // whenever an OperativeProvisionView exists for this term, and the
    // stale/raw base-document figure is NEVER substituted for a confident
    // "current" answer - the honest "(no current text recorded)" placeholder
    // is served instead, exactly like getOperativeProvision's own SECTION
    // case above. The $8,000,000 stale figure genuinely no longer appears
    // anywhere in the response - the compiling model cannot read it as a
    // settled, current fact any more.
    expect(result.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(result.currentText ?? result.text).toBe("(no current text recorded)");
    expect(JSON.stringify(result)).not.toContain("$8,000,000");
    expect(result.unresolvedIssues).toEqual(operativeState.provisions[0]!.unresolvedIssues);
    expect(JSON.stringify(result)).toMatch(/AMBIGUOUS|PARTIAL/i);

    // Confirms this is not merely "no operativeState was supplied at all"
    // (an honest, already-covered case) - a real, on-file OperativeProvisionView
    // for this EXACT term with a real non-RESOLVED status is what drove this
    // disclosure.
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

  it("positive control: a genuinely UNIQUE amendment target (targetResolutionStatus UNIQUE, currentText populated) is still served confidently, WITH status disclosed alongside it - the fix never over-triggers for the ordinary, common case", () => {
    const { index } = buildIndexWithStaleDefinition();
    const uniqueProvision: OperativeProvisionView = { ...ambiguousDefinitionProvision(), currentText: "\"Permitted Investments\" means investments not to exceed $12,000,000 in the aggregate.", status: "OPERATIVE_STATE_RESOLVED", targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], unresolvedIssues: [], reviewRequired: false };
    const operativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [uniqueProvision], status: "OPERATIVE_STATE_RESOLVED", summary: "test", unattachedEffects: [] };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getDefinition")!.execute({ term: "Permitted Investments" });
    const result = outcome.result as Record<string, unknown>;
    expect(result.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(result.source).toBe("amended");
    expect(result.text).toContain("$12,000,000");
  });

  it("Multiple candidate definition occurrences (never amended - no operativeState view at all): getDefinition never guesses among 2 colliding base-document definitions of the same term - it refuses with an honest ambiguity disclosure, exactly like getOperativeProvision's own resolveUniqueNodeByRef discipline for a colliding SECTION reference", () => {
    const textA = `"Permitted Investments" means investments not to exceed $5,000,000 in the aggregate.\n`;
    const textB = `"Permitted Investments" means investments not to exceed $9,000,000 in the aggregate.\n`;
    const fullText = textA + textB;
    const nodeA: StructuralNode = { documentId: TEST_DOCUMENT_ID, nodeType: "CLAUSE", heading: "Permitted Investments", sectionRef: "1.01(pi)(a)", nodeKey: `${TEST_DOCUMENT_ID}::1.01(pi)(a)`, nodeId: `n-${TEST_DOCUMENT_ID}-pi-a`, charStart: 0, charEnd: textA.length, ordinal: 0, parentSectionRef: null, parentNodeId: null };
    const nodeB: StructuralNode = { documentId: TEST_DOCUMENT_ID, nodeType: "CLAUSE", heading: "Permitted Investments", sectionRef: "1.01(pi)(b)", nodeKey: `${TEST_DOCUMENT_ID}::1.01(pi)(b)`, nodeId: `n-${TEST_DOCUMENT_ID}-pi-b`, charStart: textA.length, charEnd: fullText.length, ordinal: 1, parentSectionRef: null, parentNodeId: null };
    const defA: DetectedDefinition = { documentId: TEST_DOCUMENT_ID, exactTerm: "Permitted Investments", normalizedTerm: "permitted investments", sourceNodeKey: nodeA.nodeKey, sourceNodeId: nodeA.nodeId, charStart: 0, charEnd: textA.length, definitionExcerpt: textA };
    const defB: DetectedDefinition = { documentId: TEST_DOCUMENT_ID, exactTerm: "Permitted Investments", normalizedTerm: "permitted investments", sourceNodeKey: nodeB.nodeKey, sourceNodeId: nodeB.nodeId, charStart: textA.length, charEnd: fullText.length, definitionExcerpt: textB };
    const index = buildStructuralIndex(new Map([[TEST_DOCUMENT_ID, { text: fullText, nodes: [nodeA, nodeB] }]]), [defA, defB], []);
    // No operativeState at all - this is a real drafting collision, not an amendment.
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getDefinition")!.execute({ term: "Permitted Investments" });
    expect(outcome.ok).toBe(false);
    const result = outcome.result as { error: string };
    expect(result.error).toMatch(/2 distinct physical definitions/);
    expect(JSON.stringify(result)).not.toMatch(/\$5,000,000|\$9,000,000/);
  });
});
