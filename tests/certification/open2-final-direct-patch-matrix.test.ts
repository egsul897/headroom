/**
 * HEADROOM OPEN-2 FINAL DIRECT PATCH (Part A) - direct-resolver status
 * matrix + permanent consumer invariant, for the exact bug described in
 * docs/open2-final-direct-patch/01-confirmed-bug.json.
 *
 * Tests `resolveNodeWithSupersessionAwareness` DIRECTLY (now exported from
 * lib/contract-model/compiler/semantic/tools.ts for exactly this purpose),
 * not only through the 4 tools that wrap it - crossing every relevant
 * OperativeStateStatus value with both text-presence shapes wherever
 * logically reachable, plus a permanent property-style invariant test that
 * is the regression guard for this entire defect class (any future
 * currentText-presence variant of the same mistake).
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildNodeSupersessionIndex, computeOperativeContractState, EMPTY_SUPERSESSION_INDEX } from "../../lib/contract-model/compiler/amendment/operative-state";
import { resolveNodeWithSupersessionAwareness } from "../../lib/contract-model/compiler/semantic/tools";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult, NodeSupersessionIndex, OperativeProvisionView, OperativeStateStatus } from "../../lib/contract-model/compiler/amendment/types";
import type { SemanticToolAccess } from "../../lib/contract-model/compiler/semantic/types";
import { emptyContextBundle } from "../contract-model/semantic-compiler/test-helpers";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

function dated(date: string): EffectiveDateResult {
  return { date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `stated effective ${date}`, reason: "explicit effective date clause" };
}
function undated(): EffectiveDateResult {
  return { date: null, status: "CONDITIONAL_UNRESOLVED", evidence: "effectiveness conditioned on a future event not yet satisfied", reason: "no fixed date could be established" };
}
function sectionTarget(documentId: string, instrumentKey: string, sectionRef: string): AmendmentTarget {
  return { kind: "SECTION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}
function effect(overrides: Partial<AmendmentEffectCandidate> & { target: AmendmentTarget }): AmendmentEffectCandidate {
  return {
    effectId: "e", amendmentDocumentId: "amd", operation: "REPLACE_TEXT", effectiveDate: dated("2021-01-01"), newText: null, oldText: null,
    sourceCitation: "amd::x", sourceExcerpt: "excerpt", confidence: 0.9, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}
function buildIndex(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const definitions = detectStructuralDefinitions(documentId, text, nodes);
  const references = detectStructuralReferences(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), definitions, references);
  return { index, nodes, definitions };
}
function access(index: StructuralIndex, operativeState: SemanticToolAccess["operativeState"], amendmentEffects: AmendmentEffectCandidate[] | null = null): SemanticToolAccess {
  return { structuralIndex: index, operativeState, packageGraph: null, amendmentEffects, contextBundle: emptyContextBundle() };
}

// ---------------------------------------------------------------------------
// PART 1 - direct-resolver status matrix, real producer fixtures wherever
// the shape is naturally reachable via computeOperativeContractState.
// ---------------------------------------------------------------------------
describe("resolveNodeWithSupersessionAwareness - direct status x text-presence matrix (real producer fixtures)", () => {
  const DOC = "matrix-doc";
  const INSTRUMENT = "instrument:matrix";
  const TEXT = `Section 1.01 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 8.08 Subject Basket . General provisions: (a) Sub-clause. The Borrower may make Restricted Payments up to $2,000,000 under this basket.`;

  it("RESOLVED + non-null currentText (CASE B): evidenceCurrent true, textSource AMENDED_CURRENT_TEXT", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "8.08");
    const a = effect({ effectId: "resolved-clean", amendmentDocumentId: "amd-resolved-clean", target: t, newText: "Section 8.08 . up to $9,000,000 (cleanly amended).", effectiveDate: dated("2019-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const view = state.provisions.find((p) => p.sectionRef === "8.08")!;
    expect(view.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(view.currentText).not.toBeNull();

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "8.08")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [a]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(true);
    expect(resolved.textSource).toBe("AMENDED_CURRENT_TEXT");
    expect(resolved.text).toContain("9,000,000");
    expect(resolved.unresolvedReasons).toEqual([]);
  });

  it("RESOLVED + null currentText (CASE C, clean deletion): evidenceCurrent false, textSource HISTORICAL_BASE_TEXT, reason says 'validly deleted' never 'not confidently resolved'", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "8.08");
    const del = effect({ effectId: "resolved-del", amendmentDocumentId: "amd-resolved-del", operation: "DELETE_TEXT", target: t, newText: null, oldText: "Section 8.08 . ...", effectiveDate: dated("2019-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [del] });
    const view = state.provisions.find((p) => p.sectionRef === "8.08")!;
    expect(view.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(view.currentText).toBeNull();

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "8.08")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [del]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("HISTORICAL_BASE_TEXT");
    expect(resolved.unresolvedReasons[0]).toContain("validly deleted");
    expect(resolved.unresolvedReasons[0]).not.toContain("not confidently resolved");
  });

  it("REVIEW_REQUIRED + non-null currentText (CASE A, THE EXPLOIT SHAPE - undated effect never enters appliedChain): evidenceCurrent false, textSource UNRESOLVED_AMENDED_TEXT (never AMENDED_CURRENT_TEXT)", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "8.08");
    const conditional = effect({ effectId: "review-conditional", amendmentDocumentId: "amd-review-conditional", target: t, newText: "Section 8.08 . up to $40,000,000 (conditional, once effective).", effectiveDate: undated() });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [conditional] });
    const view = state.provisions.find((p) => p.sectionRef === "8.08")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(view.currentText).not.toBeNull(); // the untouched base text, honestly non-null.

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "8.08")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [conditional]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false); // THE FIX.
    expect(resolved.textSource).toBe("UNRESOLVED_AMENDED_TEXT");
    expect(resolved.textSource).not.toBe("AMENDED_CURRENT_TEXT");
    expect(resolved.unresolvedReasons.join(" ")).toContain("OPERATIVE_STATE_REVIEW_REQUIRED");
  });

  it("REVIEW_REQUIRED + null currentText (a dated effect applied with no capturable text, status field REVIEW_REQUIRED): evidenceCurrent false, textSource BASE_DOCUMENT_TEXT", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "8.08");
    const a = effect({ effectId: "review-nulltext", amendmentDocumentId: "amd-review-nulltext", target: t, newText: null, effectiveDate: dated("2019-01-01"), status: "REVIEW_REQUIRED", unresolvedReason: "amendment language is a bare threshold reference with no quoted replacement text" });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const view = state.provisions.find((p) => p.sectionRef === "8.08")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(view.currentText).toBeNull();

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "8.08")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [a]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("BASE_DOCUMENT_TEXT");
  });

  it("CONFLICTED + null currentText (two effects sharing a future date): evidenceCurrent false, textSource BASE_DOCUMENT_TEXT", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "8.08");
    const a = effect({ effectId: "conf-a", amendmentDocumentId: "amd-conf-a", target: t, newText: "Section 8.08 . up to $9,000,000 (proposed A).", effectiveDate: dated("2099-01-01") });
    const b = effect({ effectId: "conf-b", amendmentDocumentId: "amd-conf-b", target: t, newText: "Section 8.08 . up to $12,000,000 (competing proposed B).", effectiveDate: dated("2099-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a, b] });
    const view = state.provisions.find((p) => p.sectionRef === "8.08")!;
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(view.currentText).toBeNull();

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "8.08")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [a, b]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("BASE_DOCUMENT_TEXT");
  });

  it("PARTIAL + null currentText (genuinely ambiguous physical target): evidenceCurrent false, textSource BASE_DOCUMENT_TEXT", () => {
    const root: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "Covenants", sectionRef: "0", nodeKey: `${DOC}::0`, nodeId: "n-part-root", charStart: 0, charEnd: 300, ordinal: -1, parentSectionRef: null, parentNodeId: null };
    const dupA: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "copy 1", sectionRef: "22.22", nodeKey: `${DOC}::22.22`, nodeId: "n-part-a", charStart: 0, charEnd: 150, ordinal: 0, parentSectionRef: "0", parentNodeId: root.nodeId };
    const dupB: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "copy 2", sectionRef: "22.22", nodeKey: `${DOC}::22.22`, nodeId: "n-part-b", charStart: 150, charEnd: 300, ordinal: 1, parentSectionRef: "0", parentNodeId: root.nodeId };
    const text = "Section 22.22 copy 1. Up to $5,000,000.\nSection 22.22 copy 2. Up to $5,000,000.";
    const index = buildStructuralIndex(new Map([[DOC, { text, nodes: [root, dupA, dupB] }]]), [], []);
    const t = sectionTarget(DOC, INSTRUMENT, "22.22");
    const a = effect({ effectId: "part-amb", amendmentDocumentId: "amd-part-amb", target: t, operation: "MODIFY_THRESHOLD", newText: null, effectiveDate: dated("2020-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const view = state.provisions.find((p) => p.sectionRef === "22.22")!;
    expect(view.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(view.currentText).toBeNull();

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [a]), supersessionIndex, dupA);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("BASE_DOCUMENT_TEXT");
  });

  it("CASE D - no matching view at all, node CURRENT_OPERATIVE: evidenceCurrent true", () => {
    const { index } = buildIndex(DOC, TEXT);
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [] });
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const anchor = index.getNodeByRef(DOC, "1.01")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, []), supersessionIndex, anchor);
    expect(resolved.provisionOperativeStatus).toBeNull();
    expect(resolved.evidenceCurrent).toBe(true);
    expect(resolved.textSource).toBe("BASE_DOCUMENT_TEXT");
  });

  it("CASE D - no matching view at all, node KNOWN_SUPERSEDED (via a DIFFERENT provision's supersession record): evidenceCurrent false", () => {
    const { index } = buildIndex(DOC, TEXT);
    const anchor = index.getNodeByRef(DOC, "1.01")!;
    const t = sectionTarget(DOC, INSTRUMENT, "1.01");
    const a = effect({ effectId: "relabel", amendmentDocumentId: "amd-relabel", target: t, newText: "Section 99.99 . renumbered.", effectiveDate: dated("2019-01-01") });
    const relabeledState = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const view = relabeledState.provisions.find((p) => p.sectionRef === "1.01")!;
    const relabeled: OperativeProvisionView = { ...view, sectionRef: "99.99", supersededSourceNodeIds: [anchor.nodeId] };
    const state = { ...relabeledState, provisions: [relabeled] };
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [a]), supersessionIndex, anchor); // findProvisionView("1.01") finds nothing now - hits CASE D.
    expect(resolved.provisionOperativeStatus).toBeNull();
    expect(resolved.nodeSupersessionStatus).toBe("KNOWN_SUPERSEDED");
    expect(resolved.evidenceCurrent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PART 2 - defensive fixtures the real producer does not construct today,
// per this phase's own requirement: "the helper must remain safe even if
// future producer behavior changes - do not encode 'this state can never
// happen' into the consumer." CONFLICTED/PARTIAL with non-null currentText
// is not naturally reachable via buildProvisionView today (both branches
// explicitly null currentText), but resolveNodeWithSupersessionAwareness
// must not silently rely on that never changing.
// ---------------------------------------------------------------------------
describe("resolveNodeWithSupersessionAwareness - defensive hand-built fixtures (status/currentText combinations not naturally producible today)", () => {
  const DOC = "defensive-doc";
  const INSTRUMENT = "instrument:defensive";
  const TEXT = `Section 5.05 Defensive Basket . Restricted Payments up to $2,000,000.`;

  function baseView(overrides: Partial<OperativeProvisionView>): OperativeProvisionView {
    return {
      instrumentKey: INSTRUMENT, provisionKey: "5.05", kind: "SECTION", documentId: DOC, sectionRef: "5.05", definedTermRef: null, asOfDate: "2024-01-01",
      currentSourceDocumentId: DOC, currentSourceNodeKey: null, currentSourceNodeId: null, currentText: null, fullChain: [], appliedChain: [],
      supersededSourceNodeKeys: [], supersededSourceNodeIds: [], status: "OPERATIVE_STATE_RESOLVED", unresolvedIssues: [], conflicts: [],
      targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT", structuralHealthIssues: [],
      attemptedText: null, reviewRequired: false, candidateTexts: [],
      ...overrides,
    };
  }

  it("hand-built CONFLICTED + non-null currentText (never produced by buildProvisionView today, but the consumer must still gate on it): evidenceCurrent false, textSource UNRESOLVED_AMENDED_TEXT", () => {
    const { index } = buildIndex(DOC, TEXT);
    const view = baseView({ status: "OPERATIVE_STATE_CONFLICTED", currentText: "Section 5.05 . up to $99,000,000 (hand-built defensive fixture - never trust this).", reviewRequired: true, unresolvedIssues: ["hand-built defensive fixture"] });
    const opState = { instrumentKey: INSTRUMENT, asOfDate: "2024-01-01", provisions: [view], status: "OPERATIVE_STATE_CONFLICTED" as OperativeStateStatus, summary: "defensive fixture", unattachedEffects: [] };
    const node = index.getNodeByRef(DOC, "5.05")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, opState), EMPTY_SUPERSESSION_INDEX, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("UNRESOLVED_AMENDED_TEXT");
    expect(resolved.text).toContain("99,000,000"); // still disclosed for context/provenance...
  });

  it("hand-built PARTIAL + non-null currentText: evidenceCurrent false, textSource UNRESOLVED_AMENDED_TEXT", () => {
    const { index } = buildIndex(DOC, TEXT);
    const view = baseView({ status: "OPERATIVE_STATE_PARTIAL", currentText: "Section 5.05 . up to $88,000,000 (hand-built defensive fixture).", reviewRequired: true, unresolvedIssues: ["hand-built defensive fixture"] });
    const opState = { instrumentKey: INSTRUMENT, asOfDate: "2024-01-01", provisions: [view], status: "OPERATIVE_STATE_PARTIAL" as OperativeStateStatus, summary: "defensive fixture", unattachedEffects: [] };
    const node = index.getNodeByRef(DOC, "5.05")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, opState), EMPTY_SUPERSESSION_INDEX, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("UNRESOLVED_AMENDED_TEXT");
  });

  it("hand-built CONFLICTED + non-null currentText, even when the underlying physical node is (independently, incorrectly-looking-safe) CURRENT_OPERATIVE at the node level: evidenceCurrent still false - view.status dominates, node-level status never overrides it", () => {
    const { index } = buildIndex(DOC, TEXT);
    const view = baseView({ status: "OPERATIVE_STATE_CONFLICTED", currentText: "Section 5.05 . up to $77,000,000 (hand-built).", reviewRequired: true });
    const opState = { instrumentKey: INSTRUMENT, asOfDate: "2024-01-01", provisions: [view], status: "OPERATIVE_STATE_CONFLICTED" as OperativeStateStatus, summary: "defensive fixture", unattachedEffects: [] };
    const node = index.getNodeByRef(DOC, "5.05")!;
    // A supersession index that covers this document but records NOTHING
    // superseded - the node-level check alone would report CURRENT_OPERATIVE.
    const coveringButCleanIndex: NodeSupersessionIndex = { coveredDocumentIds: new Set([DOC]), supersededByNodeId: new Map(), ambiguousNodeIds: new Set(), documentLevelSupersededDocuments: new Map() };
    const resolved = resolveNodeWithSupersessionAwareness(access(index, opState), coveringButCleanIndex, node);
    expect(resolved.nodeSupersessionStatus).toBe("CURRENT_OPERATIVE"); // the node-level signal alone WOULD say safe...
    expect(resolved.evidenceCurrent).toBe(false); // ...but the real view's own CONFLICTED status still gates it correctly.
  });
});

// ---------------------------------------------------------------------------
// PART 3 - PERMANENT CONSUMER INVARIANT (property-style): for ANY
// OperativeProvisionView whose status !== OPERATIVE_STATE_RESOLVED, assert
// evidenceCurrent === false, regardless of currentText null/non-null, node
// supersession status, or base text availability. This is the permanent
// regression guard against another currentText-presence variant of this
// exact defect class.
// ---------------------------------------------------------------------------
describe("PERMANENT INVARIANT: resolveNodeWithSupersessionAwareness never reports evidenceCurrent true for a non-RESOLVED view", () => {
  const DOC = "invariant-doc";
  const INSTRUMENT = "instrument:invariant";
  const TEXT = `Section 6.06 Invariant Basket . Restricted Payments up to $2,000,000.`;

  const NON_RESOLVED_STATUSES: OperativeStateStatus[] = ["OPERATIVE_STATE_CONFLICTED", "OPERATIVE_STATE_PARTIAL", "OPERATIVE_STATE_REVIEW_REQUIRED"];
  const CURRENT_TEXT_SHAPES: (string | null)[] = [null, "Section 6.06 . up to $999,000,000 (property-test text)."];
  const NODE_SUPERSESSION_SHAPES: ("UNKNOWN" | "COVERED_CLEAN" | "KNOWN_SUPERSEDED")[] = ["UNKNOWN", "COVERED_CLEAN", "KNOWN_SUPERSEDED"];

  function baseView(status: OperativeStateStatus, currentText: string | null): OperativeProvisionView {
    return {
      instrumentKey: INSTRUMENT, provisionKey: "6.06", kind: "SECTION", documentId: DOC, sectionRef: "6.06", definedTermRef: null, asOfDate: "2024-01-01",
      currentSourceDocumentId: DOC, currentSourceNodeKey: null, currentSourceNodeId: null, currentText, fullChain: [], appliedChain: [],
      supersededSourceNodeKeys: [], supersededSourceNodeIds: [], status, unresolvedIssues: [`property test: status ${status}`], conflicts: [],
      targetResolutionStatus: "UNIQUE", targetResolutionReason: null, candidateSourceNodeIds: [], structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT", structuralHealthIssues: [],
      attemptedText: currentText, reviewRequired: true, candidateTexts: [],
    };
  }

  for (const status of NON_RESOLVED_STATUSES) {
    for (const currentText of CURRENT_TEXT_SHAPES) {
      for (const nodeShape of NODE_SUPERSESSION_SHAPES) {
        it(`status=${status} currentText=${currentText === null ? "null" : "non-null"} nodeSupersession=${nodeShape} -> evidenceCurrent MUST be false`, () => {
          const { index } = buildIndex(DOC, TEXT);
          const node = index.getNodeByRef(DOC, "6.06")!;
          const view = baseView(status, currentText);
          const opState = { instrumentKey: INSTRUMENT, asOfDate: "2024-01-01", provisions: [view], status, summary: "property test", unattachedEffects: [] };
          let supersessionIndex: NodeSupersessionIndex;
          if (nodeShape === "UNKNOWN") {
            supersessionIndex = EMPTY_SUPERSESSION_INDEX;
          } else if (nodeShape === "COVERED_CLEAN") {
            supersessionIndex = { coveredDocumentIds: new Set([DOC]), supersededByNodeId: new Map(), ambiguousNodeIds: new Set(), documentLevelSupersededDocuments: new Map() };
          } else {
            supersessionIndex = {
              coveredDocumentIds: new Set([DOC]),
              supersededByNodeId: new Map([[node.nodeId, { nodeId: node.nodeId, instrumentKey: INSTRUMENT, provisionKey: "other", supersededByEffectId: "other-effect", supersededByAmendmentDocumentId: "amd-other", supersededEffectiveDate: "2020-01-01", supersessionKind: "PROVISION_LEVEL" as const, supersedingOperativeDocumentId: null }]]),
              ambiguousNodeIds: new Set(),
              documentLevelSupersededDocuments: new Map(),
            };
          }
          const resolved = resolveNodeWithSupersessionAwareness(access(index, opState), supersessionIndex, node);
          // THE PERMANENT INVARIANT.
          expect(resolved.evidenceCurrent).toBe(false);
          expect(resolved.provisionOperativeStatus).toBe(status);
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// PART 4 - required clean controls (confirm no over-blocking).
// ---------------------------------------------------------------------------
describe("clean controls - confirm the fix does not over-block ordinary, safe cases", () => {
  it("never-amended current base section (CASE D) remains current", () => {
    const DOC = "control-never-amended-doc";
    const TEXT = `Section 9.09 Clean Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const state = computeOperativeContractState({ instrumentKey: "instrument:control-never-amended", baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [] });
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "9.09")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, []), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(true);
    expect(resolved.text).toContain("2,000,000");
  });

  it("resolved amended section with replacement currentText (CASE B) remains current - the fix does not regress the ordinary amended case", () => {
    const DOC = "control-resolved-amended-doc";
    const INSTRUMENT = "instrument:control-resolved-amended";
    const TEXT = `Section 10.10 Amended Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "10.10");
    const a = effect({ effectId: "control-clean-amend", amendmentDocumentId: "amd-control-clean-amend", target: t, newText: "Section 10.10 . up to $3,000,000 (cleanly amended).", effectiveDate: dated("2019-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "10.10")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [a]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(true);
    expect(resolved.textSource).toBe("AMENDED_CURRENT_TEXT");
    expect(resolved.text).toContain("3,000,000");
  });

  it("known-superseded old base node with no view at all (CASE D) remains unresolved/historical - unchanged", () => {
    const DOC = "control-known-superseded-doc";
    const INSTRUMENT = "instrument:control-known-superseded";
    const TEXT = `Section 11.11 Restated Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const node = index.getNodeByRef(DOC, "11.11")!;
    const t = sectionTarget(DOC, INSTRUMENT, "11.11");
    const a = effect({ effectId: "control-relabel", amendmentDocumentId: "amd-control-relabel", target: t, newText: "Section 77.77 . renumbered.", effectiveDate: dated("2019-01-01") });
    const relabeledState = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const view = relabeledState.provisions.find((p) => p.sectionRef === "11.11")!;
    const relabeled: OperativeProvisionView = { ...view, sectionRef: "77.77", supersededSourceNodeIds: [node.nodeId] };
    const state = { ...relabeledState, provisions: [relabeled] };
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [a]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.nodeSupersessionStatus).toBe("KNOWN_SUPERSEDED");
  });

  it("clean deletion (CASE C): old text historical, never current", () => {
    const DOC = "control-clean-deletion-doc";
    const INSTRUMENT = "instrument:control-clean-deletion";
    const TEXT = `Section 12.12 Deleted Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "12.12");
    const del = effect({ effectId: "control-del", amendmentDocumentId: "amd-control-del", operation: "DELETE_TEXT", target: t, newText: null, oldText: "...", effectiveDate: dated("2019-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [del] });
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "12.12")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [del]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("HISTORICAL_BASE_TEXT");
  });

  it("a resolved provision with no relevant uncertainty remains usable end to end (status RESOLVED, real text, evidenceCurrent true)", () => {
    const DOC = "control-usable-doc";
    const INSTRUMENT = "instrument:control-usable";
    const TEXT = `Section 13.13 Usable Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "13.13");
    const a = effect({ effectId: "control-usable", amendmentDocumentId: "amd-control-usable", target: t, newText: "Section 13.13 . up to $4,000,000 (cleanly amended, fully resolved).", effectiveDate: dated("2018-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    expect(state.provisions.find((p) => p.sectionRef === "13.13")!.status).toBe("OPERATIVE_STATE_RESOLVED");
    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "13.13")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [a]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(true);
    expect(resolved.unresolvedReasons).toEqual([]);
  });
});
