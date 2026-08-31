/**
 * Phase 3F.1.6 Final Foundation Certification - Section 7 (ORIGINAL
 * REPRODUCTION, certified BLOCKER-5 / SUPER-5) - REMEDIATED in Phase
 * 3F.1.6.R.
 *
 * ORIGINAL FINDING (independently discovered, not named by any prior
 * phase): several of the controlled evidence tools the semantic compiler
 * exposes to the LLM (lib/contract-model/compiler/semantic/tools.ts)
 * navigated the raw `StructuralIndex` directly and NEVER consulted
 * `access.operativeState` - unlike `getOperativeProvision`/`getDefinition`/
 * `getRelatedAmendments`/`getPriorVersion`, which all did.
 * `getReferencedProvision` was the sharpest case: its own tool description
 * explicitly tells the model "Use this when the operative text you are
 * compiling expressly requires reading another section to know the
 * covenant's actual economics" - yet its implementation was a bare
 * `resolveUniqueNodeByRef` + `getNodeText` call with zero supersession
 * check. A cross-referenced section that had since been amended/restated
 * was returned as plain, undisclosed, "actual economics" text.
 *
 * Phase 3F.1.6.R BLOCKER-5 FIX: `getReferencedProvision` (along with
 * `getParentClause`, `getChildren`, `getSiblingClauses`) is now routed
 * through the SAME `findProvisionView(access.operativeState?.provisions,
 * ...)` supersession-aware path `getOperativeProvision` already used (see
 * `resolveNodeWithSupersessionAwareness` in tools.ts), and every response
 * carries a real `supersessionStatus`/`supersessionReason`. This test now
 * proves END-TO-END, with the REAL, unmodified `buildToolSet`/
 * `getReferencedProvision`, that the SAME scenario which used to leak
 * stale $10,000,000 text now correctly returns the CURRENT $25,000,000
 * text, with an explicit CURRENT_OPERATIVE disclosure.
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { OperativeContractState, OperativeProvisionView } from "../../lib/contract-model/compiler/amendment/types";
import { emptyContextBundle } from "../contract-model/semantic-compiler/test-helpers";

const DOCUMENT_ID = "doc-base-agreement";

const SECTION_601_TEXT = "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness in excess of $10,000,000.\n";
const SECTION_602_TEXT = "Section 6.02 Liens. Compliance with this covenant is measured with reference to Section 6.01.\n";
const FULL_TEXT = SECTION_601_TEXT + SECTION_602_TEXT;

function buildRealIndex() {
  const section601: StructuralNode = { documentId: DOCUMENT_ID, nodeType: "SECTION", heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${DOCUMENT_ID}::6.01`, nodeId: `n-${DOCUMENT_ID}-6.01`, charStart: 0, charEnd: SECTION_601_TEXT.length, ordinal: 0, parentSectionRef: null, parentNodeId: null };
  const section602: StructuralNode = { documentId: DOCUMENT_ID, nodeType: "SECTION", heading: "Liens", sectionRef: "6.02", nodeKey: `${DOCUMENT_ID}::6.02`, nodeId: `n-${DOCUMENT_ID}-6.02`, charStart: SECTION_601_TEXT.length, charEnd: FULL_TEXT.length, ordinal: 1, parentSectionRef: null, parentNodeId: null };
  const nodes = [section601, section602];
  const index = buildStructuralIndex(new Map([[DOCUMENT_ID, { text: FULL_TEXT, nodes }]]), [], []);
  return { index, section601, section602 };
}

describe("semantic/tools.ts: getReferencedProvision is now supersession-aware (BLOCKER-5 REMEDIATED - was supersession-blind)", () => {
  it("returns Section 6.01's CURRENT amended text (never the stale base-agreement text), with an explicit disclosure, when a real, non-null OperativeContractState marks that exact node as superseded by a later amendment", () => {
    const { index, section601 } = buildRealIndex();

    // A real, fully-populated OperativeContractState (same shape used by the
    // already-fixed cross-reference-audit.ts consumer) declaring Section
    // 6.01's base-document node superseded by a later amendment that raised
    // the cap to $25,000,000.
    const supersededProvision: OperativeProvisionView = {
      instrumentKey: "instrument-1",
      provisionKey: "prov-6.01",
      kind: "SECTION",
      documentId: DOCUMENT_ID,
      sectionRef: "6.01",
      definedTermRef: null,
      asOfDate: "2026-01-01",
      currentSourceDocumentId: "doc-third-amendment",
      currentSourceNodeKey: "doc-third-amendment::6.01-amended",
      currentSourceNodeId: "id-doc-third-amendment-6-01-amended",
      currentText: "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness in excess of $25,000,000.",
      fullChain: [],
      appliedChain: [],
      supersededSourceNodeKeys: [section601.nodeKey],
      supersededSourceNodeIds: [section601.nodeId],
      status: "OPERATIVE_STATE_RESOLVED",
      unresolvedIssues: [],
      conflicts: [],
      targetResolutionStatus: "UNIQUE",
      targetResolutionReason: null,
      candidateSourceNodeIds: [],
      structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
      structuralHealthIssues: [],
      attemptedText: null,
      reviewRequired: false,
      candidateTexts: [],
    };
    const operativeState: OperativeContractState = {
      instrumentKey: "instrument-1",
      asOfDate: "2026-01-01",
      provisions: [supersededProvision],
      status: "OPERATIVE_STATE_RESOLVED",
      summary: "test",
      unattachedEffects: [],
    };

    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle({ originatingDocumentId: DOCUMENT_ID }) }, DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const getReferencedProvision = tools.find((t) => t.name === "getReferencedProvision")!;

    const outcome = getReferencedProvision.execute({ ref: "6.01" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { ref: string; resolvedSectionRef: string; nodeId: string; text: string; truncated: boolean; supersessionStatus: string; supersessionReason: string };

    // THE FIX: the tool now resolves the reference against
    // access.operativeState FIRST (the same findProvisionView path
    // getOperativeProvision already used) and returns the CURRENT
    // $25,000,000 text, with an explicit CURRENT_OPERATIVE disclosure -
    // never the stale $10,000,000 base-document text.
    expect(result.text).toContain("$25,000,000");
    expect(result.text).not.toContain("$10,000,000");
    expect(result.supersessionStatus).toBe("CURRENT_OPERATIVE");
    expect(result.supersessionReason).toMatch(/amendment history/);

    // Contrast (unchanged): the sibling tool getOperativeProvision, which
    // was already fixed before this phase, agrees with the SAME answer -
    // both tools are now consistent.
    const getOperativeProvision = tools.find((t) => t.name === "getOperativeProvision")!;
    const operativeOutcome = getOperativeProvision.execute({ sectionRef: "6.01" });
    expect(operativeOutcome.ok).toBe(true);
    const operativeResult = JSON.stringify(operativeOutcome.result);
    expect(operativeResult).toContain("25,000,000");
  });

  it("REGRESSION GUARD for the ORIGINAL defect: a node with NO covering OperativeProvisionView (never amended) still returns its own raw text, tagged CURRENT_OPERATIVE via the supersession index fallback - proving the fix does not merely mask the old bug by always preferring amended text", () => {
    const { index, section602 } = buildRealIndex();
    // No provisions at all - this instrument has never been amended.
    const operativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [], status: "OPERATIVE_STATE_RESOLVED", summary: "test", unattachedEffects: [] };
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle({ originatingDocumentId: DOCUMENT_ID }) }, DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const getReferencedProvision = tools.find((t) => t.name === "getReferencedProvision")!;
    const outcome = getReferencedProvision.execute({ ref: "6.02" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { nodeId: string; text: string; supersessionStatus: string };
    expect(result.nodeId).toBe(section602.nodeId);
    expect(result.text).toContain("Compliance with this covenant");
    // CURRENT_OPERATIVE here because this document IS covered by the
    // (empty-but-real) operativeState and this node was never recorded as
    // superseded or ambiguous - never UNKNOWN merely for lack of a tracked
    // provision.
    expect(result.supersessionStatus).toBe("CURRENT_OPERATIVE");
  });
});

/**
 * Phase 3F.1.6.RX Workstream B - independent runtime trace found a SECOND,
 * related SUPER-5-shaped defect the 3F.1.6.R fix above did not catch:
 * getContextBundleComponent and getSharedCapContext were classified
 * NOT_CONTRACT_TEXT_EVIDENCE on the stated rationale "echoes an
 * already-vetted CovenantContextBundle item." Reading context-retrieval/
 * pipeline.ts end to end (zero references to operativeState/supersession
 * anywhere in that module) proves this false: every item's own excerptText
 * is built from raw StructuralIndex text with no operative-state check at
 * all. These two tools DO return independently-interpretable provision/
 * economic text (exactly what ToolOperativeStateDiscipline exists to
 * police), so the classification - and the false "already vetted" premise
 * behind it - was wrong. This is the permanent guardrail for that fix:
 * disclosure (never substitution - a bundle echo must return exactly what
 * the bundle holds), matching getSourceSpan's own established pattern.
 */
describe("semantic/tools.ts: getContextBundleComponent/getSharedCapContext are now honestly HISTORICAL_EVIDENCE_WITH_STATUS, not falsely NOT_CONTRACT_TEXT_EVIDENCE (Phase 3F.1.6.RX fix)", () => {
  it("getContextBundleComponent discloses a real, independently-computed supersessionStatus for a bundle item, without ever substituting different text than what the bundle actually holds", () => {
    const { index, section601 } = buildRealIndex();
    // No real OperativeContractState at all for this instrument (the honest
    // "nothing was ever computed" worst case) - buildToolSet's own
    // supersessionIndex therefore has an EMPTY coveredDocumentIds, so every
    // lookup fails closed to UNKNOWN, never CURRENT_OPERATIVE by omission
    // (contrast: the sibling test below supplies a real, empty-provisions
    // operativeState, which correctly resolves CURRENT_OPERATIVE instead -
    // see getReferencedProvision's own REGRESSION GUARD test above for the
    // same documented distinction).
    const operativeState: OperativeContractState | null = null;
    const bundle = emptyContextBundle({
      originatingDocumentId: DOCUMENT_ID,
      items: [
        {
          itemId: "item-op-source",
          type: "OPERATIVE_SOURCE",
          documentId: DOCUMENT_ID,
          structuralNodeKey: section601.nodeKey,
          structuralNodeId: section601.nodeId,
          normalizedRef: "6.01",
          sourceCitation: "Section 6.01",
          // Deliberately the STALE text - context-retrieval built this bundle
          // item with zero operative-state awareness of its own (confirmed by
          // grep), exactly what this fix must now honestly disclose rather
          // than silently serve as fact.
          excerptText: SECTION_601_TEXT,
          reason: "primary operative source",
          retrievalDepth: 0,
          retrievalPath: [],
          retrievalMethod: "STRUCTURAL_TRAVERSAL",
          confidence: 1,
        },
      ],
    });
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: bundle }, DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);

    const getContextBundleComponent = tools.find((t) => t.name === "getContextBundleComponent")!;
    expect(getContextBundleComponent.operativeStateDiscipline).toBe("HISTORICAL_EVIDENCE_WITH_STATUS");
    const outcome = getContextBundleComponent.execute({ itemId: "item-op-source" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { itemId: string; excerptText: string; supersessionStatus: string; supersessionReason: string };
    // Never substituted - a bundle echo must return exactly what the bundle holds.
    expect(result.excerptText).toBe(SECTION_601_TEXT);
    // But is not silently trusted: no tracked amendment index was supplied for
    // this instrument at all in this scenario (operativeState has zero
    // provisions and buildToolSet's own supersessionIndex is therefore built
    // from an empty entries array) - the honest, fail-closed default is
    // UNKNOWN, never CURRENT_OPERATIVE by omission.
    expect(result.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
    expect(result.supersessionReason.length).toBeGreaterThan(0);

    // Now the affirmative case: a real OperativeContractState that marks
    // this SAME node's own structuralNodeId superseded. The tool's echoed
    // excerptText is STILL the bundle's own (unsubstituted, stale) text -
    // never silently swapped - but supersessionStatus now honestly
    // discloses KNOWN_SUPERSEDED instead of falsely implying safety.
    const supersededProvision: OperativeProvisionView = {
      instrumentKey: "instrument-1", provisionKey: "prov-6.01", kind: "SECTION", documentId: DOCUMENT_ID, sectionRef: "6.01", definedTermRef: null, asOfDate: "2026-01-01",
      currentSourceDocumentId: "doc-third-amendment", currentSourceNodeKey: "doc-third-amendment::6.01-amended", currentSourceNodeId: "id-doc-third-amendment-6-01-amended",
      currentText: "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness in excess of $25,000,000.", fullChain: [], appliedChain: [],
      supersededSourceNodeKeys: [section601.nodeKey], supersededSourceNodeIds: [section601.nodeId], status: "OPERATIVE_STATE_RESOLVED", unresolvedIssues: [], conflicts: [],
      targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT", structuralHealthIssues: [], attemptedText: null, reviewRequired: false, candidateTexts: [],
    };
    const supersededOperativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [supersededProvision], status: "OPERATIVE_STATE_RESOLVED", summary: "test", unattachedEffects: [] };
    const toolsWithAmendment = buildToolSet({ structuralIndex: index, operativeState: supersededOperativeState, packageGraph: null, amendmentEffects: null, contextBundle: bundle }, DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome2 = toolsWithAmendment.find((t) => t.name === "getContextBundleComponent")!.execute({ itemId: "item-op-source" });
    const result2 = outcome2.result as { excerptText: string; supersessionStatus: string };
    expect(result2.excerptText).toBe(SECTION_601_TEXT); // still unsubstituted - disclosure, not substitution.
    expect(result2.supersessionStatus).toBe("KNOWN_SUPERSEDED");
  });

  it("getSharedCapContext discloses per-item supersessionStatus for every SHARED_CAP item it returns", () => {
    const { index, section602 } = buildRealIndex();
    const operativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [], status: "OPERATIVE_STATE_RESOLVED", summary: "test", unattachedEffects: [] };
    const bundle = emptyContextBundle({
      originatingDocumentId: DOCUMENT_ID,
      items: [
        { itemId: "item-shared-cap", type: "SHARED_CAP", documentId: DOCUMENT_ID, structuralNodeKey: section602.nodeKey, structuralNodeId: section602.nodeId, normalizedRef: "6.02", sourceCitation: "Section 6.02", excerptText: SECTION_602_TEXT, reason: "shared cap", retrievalDepth: 0, retrievalPath: [], retrievalMethod: "STRUCTURAL_TRAVERSAL", confidence: 1 },
      ],
    });
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: bundle }, DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);

    const getSharedCapContext = tools.find((t) => t.name === "getSharedCapContext")!;
    expect(getSharedCapContext.operativeStateDiscipline).toBe("HISTORICAL_EVIDENCE_WITH_STATUS");
    const outcome = getSharedCapContext.execute({});
    expect(outcome.ok).toBe(true);
    const items = (outcome.result as { items: Array<Record<string, unknown>> }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveProperty("supersessionStatus");
    expect(items[0]).toHaveProperty("supersessionReason");
  });

  it("a bundle item with no structuralNodeId (e.g. a DEFINITION anchored by term name, not a StructuralNode) resolves UNKNOWN_SUPERSESSION_STATUS via the same fail-closed 'no nodeId supplied' path - never guessed CURRENT_OPERATIVE", () => {
    const { index } = buildRealIndex();
    const bundle = emptyContextBundle({
      originatingDocumentId: DOCUMENT_ID,
      items: [{ itemId: "item-def", type: "DEFINITION", documentId: DOCUMENT_ID, structuralNodeKey: null, structuralNodeId: null, normalizedRef: "Permitted Investments", sourceCitation: "Definitions", excerptText: "definition text", reason: "direct definition", retrievalDepth: 0, retrievalPath: [], retrievalMethod: "DEFINITION_INDEX", confidence: 1 }],
    });
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: bundle }, DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getContextBundleComponent")!.execute({ itemId: "item-def" });
    const result = outcome.result as { supersessionStatus: string };
    expect(result.supersessionStatus).toBe("UNKNOWN_SUPERSESSION_STATUS");
  });
});
