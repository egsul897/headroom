/**
 * HEADROOM OPEN-2 TERMINAL (Part A) - the required 8-case x 4-tool
 * end-to-end matrix (32 cells) for the four previously-unsafe tools
 * (getParentClause, getChildren, getSiblingClauses, getReferencedProvision).
 *
 * Each of the 8 cases below builds a REAL OperativeProvisionView (via
 * computeOperativeContractState over a real, applied-or-not
 * AmendmentEffectCandidate, exactly like tests/certification/open-2-recert-
 * independent-fresh.test.ts's own fixtures) for section "6.02" of a shared
 * 3-level structural fixture (parent "6" -> "6.02" -> "6.02(a)", plus a
 * never-amended sibling "6.01"), then calls all 4 tools against it and
 * asserts each tool's own evidenceUnresolved/displayed-status per the
 * matrix's required outcome:
 *   - Cases 1-4 and 7: evidenceUnresolved MUST be true for every one of the
 *     4 tools (never persist as trusted VERIFIED evidence).
 *   - Cases 5-6 and 8 (correctly CURRENT_OPERATIVE): evidenceUnresolved
 *     must NOT be true.
 *
 * Full tool-call-through-DB-persistence-through-fresh-Postgres-read E2E
 * chains for representative cells of this same matrix already exist and
 * pass in this codebase and are not re-derived 32 times here:
 *   - Case 1 (already-effective conflict) x getParentClause:
 *     tests/certification/open-2-recert-independent-fresh.test.ts section 6.
 *   - Case 2 (signed/not-yet-effective conflict) x getSiblingClauses:
 *     tests/certification/open-2-recert-independent-fresh.test.ts section 4
 *     ("FIXED, PROVEN END TO END" case), including a fresh
 *     getAllSemanticTruthForInstrument/getTrustedSemanticTruth Postgres read.
 *   - Case 2 (original, already-effective shape) x getOperativeProvision:
 *     the same file's section 2.
 * See docs/open2-terminal-trust-correction/04-four-tool-fix.json for the
 * full 32-cell result table this file's own assertions back.
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult, OperativeContractState } from "../../lib/contract-model/compiler/amendment/types";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import { emptyContextBundle } from "./semantic-compiler/test-helpers";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

const DOC = "matrix-doc";
const INSTRUMENT = "instrument:matrix";
const SECTION_601_TEXT = "Section 6.01 Indebtedness. text.\n";
const SECTION_602_TEXT = "Section 6.02 Restricted Payments Basket. The Borrower may make Restricted Payments up to $2,000,000 under this basket.\n";
const SECTION_602A_TEXT = "(a) sub-clause.\n";
const FULL_TEXT = SECTION_601_TEXT + SECTION_602_TEXT + SECTION_602A_TEXT;

function dated(date: string): EffectiveDateResult {
  return { date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `stated effective ${date}`, reason: "explicit effective date clause" };
}
function sectionTarget(sectionRef: string): AmendmentTarget {
  return { kind: "SECTION", targetDocumentId: DOC, targetInstrumentKey: INSTRUMENT, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}
function effect(overrides: Partial<AmendmentEffectCandidate> & { target: AmendmentTarget }): AmendmentEffectCandidate {
  return {
    effectId: "e", amendmentDocumentId: "amd", operation: "REPLACE_TEXT", effectiveDate: dated("2021-01-01"), newText: null, oldText: null,
    sourceCitation: "amd::x", sourceExcerpt: "excerpt", confidence: 0.9, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}

function buildFixture() {
  const root: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "Covenants", sectionRef: "6", nodeKey: `${DOC}::6`, nodeId: "n-matrix-6", charStart: 0, charEnd: FULL_TEXT.length, ordinal: -1, parentSectionRef: null, parentNodeId: null };
  const sibling: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${DOC}::6.01`, nodeId: "n-matrix-6-01", charStart: 0, charEnd: SECTION_601_TEXT.length, ordinal: 0, parentSectionRef: "6", parentNodeId: root.nodeId };
  const probe: StructuralNode = {
    documentId: DOC,
    nodeType: "SECTION",
    heading: "Restricted Payments Basket",
    sectionRef: "6.02",
    nodeKey: `${DOC}::6.02`,
    nodeId: "n-matrix-6-02",
    charStart: SECTION_601_TEXT.length,
    charEnd: FULL_TEXT.length,
    ordinal: 1,
    parentSectionRef: "6",
    parentNodeId: root.nodeId,
  };
  const grandchild: StructuralNode = {
    documentId: DOC,
    nodeType: "SUBSECTION",
    heading: "(a)",
    sectionRef: "6.02(a)",
    nodeKey: `${DOC}::6.02(a)`,
    nodeId: "n-matrix-6-02-a",
    charStart: SECTION_601_TEXT.length + SECTION_602_TEXT.length,
    charEnd: FULL_TEXT.length,
    ordinal: 0,
    parentSectionRef: "6.02",
    parentNodeId: probe.nodeId,
  };
  const index = buildStructuralIndex(new Map([[DOC, { text: FULL_TEXT, nodes: [root, sibling, probe, grandchild] }]]), [], []);
  return { index, root, sibling, probe, grandchild };
}

type CaseName = "1_already_effective_conflict" | "2_prospective_conflict" | "3_partial" | "4_review_required" | "5_clean_current_control" | "6_clean_resolved_amended" | "7_clean_deletion" | "8_known_superseded_no_view";

function buildCaseState(caseName: CaseName, index: ReturnType<typeof buildFixture>["index"], probe: StructuralNode): { state: OperativeContractState; expectSafe: boolean } {
  const compute = (allEffects: AmendmentEffectCandidate[]) => computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects });
  switch (caseName) {
    case "1_already_effective_conflict": {
      const a = effect({ effectId: "c1a", target: sectionTarget("6.02"), newText: "Section 6.02 . up to $9,000,000.", effectiveDate: dated("2019-01-01") });
      const b = effect({ effectId: "c1b", target: sectionTarget("6.02"), newText: "Section 6.02 . up to $14,000,000.", effectiveDate: dated("2019-01-01") });
      return { state: compute([a, b]), expectSafe: false };
    }
    case "2_prospective_conflict": {
      const a = effect({ effectId: "c2a", target: sectionTarget("6.02"), newText: "Section 6.02 . up to $9,000,000 (not yet effective).", effectiveDate: dated("2099-01-01") });
      const b = effect({ effectId: "c2b", target: sectionTarget("6.02"), newText: "Section 6.02 . up to $14,000,000 (competing, not yet effective).", effectiveDate: dated("2099-01-01") });
      return { state: compute([a, b]), expectSafe: false };
    }
    case "3_partial": {
      const a = effect({ effectId: "c3a", target: sectionTarget("6.02"), operation: "MODIFY_THRESHOLD", newText: null, effectiveDate: dated("2020-01-01") });
      return { state: compute([a]), expectSafe: false };
    }
    case "4_review_required": {
      const a = effect({ effectId: "c4a", target: sectionTarget("6.02"), status: "REVIEW_REQUIRED", unresolvedReason: "ambiguous effective date language", effectiveDate: dated("2020-01-01") });
      return { state: compute([a]), expectSafe: false };
    }
    case "5_clean_current_control":
      return { state: compute([]), expectSafe: true };
    case "6_clean_resolved_amended": {
      const a = effect({ effectId: "c6a", target: sectionTarget("6.02"), newText: "Section 6.02 . up to $9,000,000 (cleanly restated).", effectiveDate: dated("2019-01-01") });
      return { state: compute([a]), expectSafe: true };
    }
    case "7_clean_deletion": {
      const a = effect({ effectId: "c7a", target: sectionTarget("6.02"), operation: "DELETE_TEXT", newText: null, effectiveDate: dated("2019-01-01") });
      return { state: compute([a]), expectSafe: false };
    }
    case "8_known_superseded_no_view": {
      // No OperativeProvisionView matches "6.02" at all - a DIFFERENT
      // provision (relabeled "9.99", a real renumbering/restatement shape)
      // supersedes the SAME physical node (probe.nodeId), so every tool
      // below queries by the section's own REAL physical ref/nodeId ("6.02")
      // and finds no matching view via findProvisionView - the pure
      // node-supersession path getNodeSupersessionStatus/NodeSupersessionIndex
      // exist for, mirroring getOperativeProvision's own existing "raw
      // base-document fallback for a KNOWN_SUPERSEDED physical occurrence"
      // regression test.
      const a = effect({ effectId: "c8a", target: sectionTarget("6.02"), newText: "Section 9.99 . up to $9,000,000 (renumbered).", effectiveDate: dated("2019-01-01") });
      const relabeledState = compute([a]);
      const view = relabeledState.provisions.find((p) => p.sectionRef === "6.02")!;
      const relabeled = { ...view, sectionRef: "9.99", supersededSourceNodeIds: [probe.nodeId] };
      return { state: { ...relabeledState, provisions: [relabeled] }, expectSafe: false };
    }
  }
}

const CASES: CaseName[] = ["1_already_effective_conflict", "2_prospective_conflict", "3_partial", "4_review_required", "5_clean_current_control", "6_clean_resolved_amended", "7_clean_deletion", "8_known_superseded_no_view"];

describe("HEADROOM OPEN-2 TERMINAL (Part A): 8-case x 4-tool end-to-end matrix (32 cells)", () => {
  for (const caseName of CASES) {
    it(`case ${caseName}: getParentClause / getChildren / getSiblingClauses / getReferencedProvision all agree on the required safety outcome`, () => {
      const { index, sibling, probe, grandchild } = buildFixture();
      const { state, expectSafe } = buildCaseState(caseName, index, probe);
      const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);

      const parentClauseOutcome = tools.find((t) => t.name === "getParentClause")!.execute({ nodeId: grandchild.nodeId });
      const childrenOutcome = tools.find((t) => t.name === "getChildren")!.execute({ nodeId: probe.nodeId });
      const siblingClausesOutcome = tools.find((t) => t.name === "getSiblingClauses")!.execute({ nodeId: sibling.nodeId });
      const referencedProvisionOutcome = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: "6.02" });

      const cells: Array<{ tool: string; outcome: { ok: boolean; evidenceUnresolved?: boolean } }> = [
        { tool: "getParentClause", outcome: parentClauseOutcome },
        { tool: "getChildren", outcome: childrenOutcome },
        { tool: "getSiblingClauses", outcome: siblingClausesOutcome },
        { tool: "getReferencedProvision", outcome: referencedProvisionOutcome },
      ];
      for (const { tool, outcome } of cells) {
        expect(outcome.ok, `${tool} (${caseName}) expected ok:true`).toBe(true);
        // getChildren answers a deliberately DIFFERENT question from the
        // other 3 tools (see resolveParentSubstructureEvidence's own header
        // comment in tools.ts): even in case 6 (a fully-resolved amended
        // REPLACEMENT text - the TEXT is genuinely trustworthy for the
        // other 3 tools), the physical node whose children getChildren
        // lists has itself been superseded by that same amendment - its OLD
        // lettered sub-clause layout is never assumed to still describe the
        // amended text's real substructure. This is the one cell where
        // getChildren's own required outcome legitimately differs from its
        // 3 siblings' - documented explicitly here, not silently skipped.
        const cellExpectSafe = tool === "getChildren" && caseName === "6_clean_resolved_amended" ? false : expectSafe;
        if (cellExpectSafe) {
          expect(outcome.evidenceUnresolved, `${tool} (${caseName}) expected evidenceUnresolved falsy (safe control case)`).not.toBe(true);
        } else {
          expect(outcome.evidenceUnresolved, `${tool} (${caseName}) expected evidenceUnresolved TRUE - must never persist as trusted VERIFIED evidence`).toBe(true);
        }
      }
    });
  }
});
