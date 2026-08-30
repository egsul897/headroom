/**
 * Phase 3F.1.6 Final Foundation Certification - Section 7.
 *
 * INDEPENDENTLY DISCOVERED finding, not named by any prior phase: several
 * of the controlled evidence tools the semantic compiler exposes to the
 * LLM (lib/contract-model/compiler/semantic/tools.ts) navigate the raw
 * `StructuralIndex` directly and NEVER consult `access.operativeState` -
 * unlike `getOperativeProvision`/`getDefinition`/`getRelatedAmendments`/
 * `getPriorVersion`, which all do. `getReferencedProvision` is the sharpest
 * case: its own tool description explicitly tells the model "Use this when
 * the operative text you are compiling expressly requires reading another
 * section to know the covenant's actual economics" - yet its
 * implementation is a bare `resolveUniqueNodeByRef` + `getNodeText` call
 * with zero supersession check. A cross-referenced section that has since
 * been amended/restated is returned as plain, undisclosed, "actual
 * economics" text.
 *
 * This test drives the REAL, unmodified `buildToolSet`/`getReferencedProvision`
 * against a real StructuralIndex and a real, non-null OperativeContractState
 * that marks the target section's node as superseded - and shows the tool
 * returns the stale text anyway, with no warning, no refusal, and no field
 * in its own response that a caller could use to detect the problem.
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

describe("semantic/tools.ts: getReferencedProvision is a supersession-blind raw navigation tool (real, independently found defect)", () => {
  it("returns Section 6.01's STALE base-agreement text as plain 'resolved' fact, with no disclosure, even though a real, non-null OperativeContractState marks that exact node as superseded by a later amendment", () => {
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
    const result = outcome.result as { ref: string; resolvedSectionRef: string; nodeId: string; text: string; truncated: boolean };

    // THE DEFECT: the tool confidently "resolves" the reference to the
    // STALE base-document node and returns its (superseded) $10,000,000
    // text as plain fact - no supersession field, no warning, no refusal,
    // despite operativeState (passed into buildToolSet) knowing this exact
    // nodeId is superseded and knowing the real current text ($25,000,000).
    expect(result.nodeId).toBe(section601.nodeId);
    expect(result.text).toContain("$10,000,000");
    expect(result.text).not.toContain("superseded");
    expect(Object.keys(result)).not.toContain("supersessionStatus");
    expect(Object.keys(result)).not.toContain("supersededBy");
    expect(Object.keys(result)).not.toContain("currentText");

    // Contrast: the SAME operativeState IS correctly consulted by the
    // sibling tool getOperativeProvision for the identical section -
    // proving the fix pattern already exists in this file and was simply
    // never applied to getReferencedProvision's cross-reference path.
    const getOperativeProvision = tools.find((t) => t.name === "getOperativeProvision")!;
    const operativeOutcome = getOperativeProvision.execute({ sectionRef: "6.01" });
    expect(operativeOutcome.ok).toBe(true);
    const operativeResult = JSON.stringify(operativeOutcome.result);
    expect(operativeResult).toContain("25,000,000");
  });
});
