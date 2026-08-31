/**
 * HEADROOM OPEN-2 TERMINAL (Part A) - dedicated regression test for the
 * "clean deletion" special case named in the fix design
 * (docs/open2-terminal-trust-correction/03-null-currenttext-semantics.json,
 * reason G): a provision whose OperativeProvisionView.status is genuinely
 * OPERATIVE_STATE_RESOLVED (nothing about the provision's own aggregate
 * operative state is unresolved) but whose currentText is null because the
 * most recently applied real effect was a valid DELETE_TEXT/DELETE_DEFINITION/
 * REMOVE_COVENANT/REMOVE_EXCEPTION operation (buildProvisionView's own
 * DELETE_OPERATIONS branch, amendment/operative-state.ts).
 *
 * This is DISTINCT from the CONFLICTED/PARTIAL/REVIEW_REQUIRED case covered
 * by tests/certification/open-2-recert-independent-fresh.test.ts's own
 * section 4 and tests/contract-model/semantic-tools-operative-state-
 * discipline.test.ts's own registry-mechanical-invariant UNRESOLVED probe:
 * here the provision's own aggregate state IS resolved (a valid deletion is
 * a correct, intended null-governance outcome, not a derivation failure -
 * see buildProvisionView's own header comment on
 * textMissingDespiteAppliedEffect), so `view.status ===
 * "OPERATIVE_STATE_RESOLVED"` alone is NOT enough to certify the OLD base
 * document text as safely current - serving the pre-deletion provision text
 * as though it still governs would be its own distinct trust failure, one a
 * naive `view.status === RESOLVED -> trust` rule would silently reintroduce.
 *
 * Uses REAL appliedChain/deletion-provenance data (a real applied DELETE_TEXT
 * AmendmentEffectCandidate run through the real computeOperativeContractState/
 * buildProvisionView pipeline) rather than a hand-built view whose
 * lastAppliedWasCleanDeletion-driven fields might not reflect the real
 * producer's own invariants.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import { emptyContextBundle } from "./semantic-compiler/test-helpers";

const DOC = "clean-deletion-doc";
const INSTRUMENT = "instrument:clean-deletion";
const TEXT = `Section 4.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 6.05 Restricted Payments Basket . The Borrower may make Restricted Payments up to $2,000,000 under this basket.\n\nSection 6.06 Investments . The Borrower may make Investments up to $3,000,000.`;

function dated(date: string): EffectiveDateResult {
  return { date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `stated effective ${date}`, reason: "explicit effective date clause" };
}
function sectionTarget(documentId: string, instrumentKey: string, sectionRef: string): AmendmentTarget {
  return { kind: "SECTION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}
function buildIndex(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
  return { index, nodes };
}

function buildDeletionState() {
  const { index } = buildIndex(DOC, TEXT);
  const deleteEffect: AmendmentEffectCandidate = {
    effectId: "del-1",
    amendmentDocumentId: "amd-delete-6.05",
    operation: "DELETE_TEXT",
    effectiveDate: dated("2020-06-01"), // in the past relative to asOfDate below - genuinely APPLIED
    newText: null,
    oldText: "Section 6.05 Restricted Payments Basket . The Borrower may make Restricted Payments up to $2,000,000 under this basket.",
    sourceCitation: "amd-delete-6.05::1",
    sourceExcerpt: "Section 6.05 of the Credit Agreement is hereby deleted in its entirety.",
    confidence: 0.9,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    target: sectionTarget(DOC, INSTRUMENT, "6.05"),
  };
  const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [deleteEffect] });
  return { index, state };
}

describe("HEADROOM OPEN-2 TERMINAL (Part A): clean-deletion special case", () => {
  it("SETUP: a real, applied DELETE_TEXT effect produces status RESOLVED with currentText null, appliedChain non-empty, and the original node recorded in supersededSourceNodeIds (real deletion-provenance data, not a hand-built fixture)", () => {
    const { state } = buildDeletionState();
    const view = state.provisions.find((p) => p.sectionRef === "6.05")!;
    expect(view.status).toBe("OPERATIVE_STATE_RESOLVED"); // the deletion ITSELF is a resolved, settled fact.
    expect(view.currentText).toBeNull(); // but there is no current text to serve - it was deleted.
    expect(view.appliedChain).toHaveLength(1);
    expect(view.appliedChain[0]!.operation).toBe("DELETE_TEXT");
    expect(view.supersededSourceNodeIds.length).toBeGreaterThan(0); // the original node's own real provenance.
    expect(view.reviewRequired).toBe(false); // never conflated with a genuine unresolved conflict/partial/review-required state.
  });

  it("getReferencedProvision on the deleted section: never reports CURRENT_OPERATIVE and always sets evidenceUnresolved=true, despite view.status being OPERATIVE_STATE_RESOLVED", () => {
    const { index, state } = buildDeletionState();
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: "6.05" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { supersessionStatus: string; supersessionReason: string; text: string };
    // THE INVARIANT UNDER TEST: a RESOLVED aggregate status must never, by
    // itself, be read as "safe to serve as current" - the clean-deletion
    // case is the exact counter-example a naive `view.status === RESOLVED`
    // shortcut would get wrong.
    expect(result.supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
    // Per the design's option (b): the historical base text MAY still be
    // served, but only ever explicitly marked as such (never silently as
    // current) - confirmed here via the disclosed reason, never via a
    // fabricated substitute text.
    expect(result.text).toContain("$2,000,000");
    expect(result.supersessionReason.toLowerCase()).toContain("delet");
  });

  it("getSiblingClauses reading the deleted section as a sibling: fails the WHOLE call closed (evidenceUnresolved=true), never lets a deleted sibling's stale text through unlabeled", () => {
    const { index, state } = buildDeletionState();
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const node401 = index.getNodeByRef(DOC, "4.01")!;
    const outcome = tools.find((t) => t.name === "getSiblingClauses")!.execute({ nodeId: node401.nodeId });
    expect(outcome.ok).toBe(true);
    const siblings = (outcome.result as { siblings: { sectionRef: string; supersessionStatus: string }[] }).siblings;
    const deletedSibling = siblings.find((s) => s.sectionRef === "6.05")!;
    expect(deletedSibling).toBeDefined();
    expect(deletedSibling.supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("DISTINCT from a genuine CONFLICTED provision: the clean-deletion reason string is its own, never conflated with 'not confidently resolved' unresolved-conflict language", () => {
    const { index, state } = buildDeletionState();
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: "6.05" });
    const result = outcome.result as { supersessionReason: string };
    // The clean-deletion reason names the deletion explicitly; it must not
    // reuse the CONFLICTED/PARTIAL/REVIEW_REQUIRED branch's "not confidently
    // resolved (operative status ...)" wording, which would misleadingly
    // suggest an actual unresolved conflict exists here (it does not - the
    // deletion itself is a settled fact).
    expect(result.supersessionReason).toContain("validly deleted");
    expect(result.supersessionReason).not.toContain("not confidently resolved");
  });

  it("a never-amended sibling in the SAME state remains safely CURRENT - the clean-deletion fix does not degrade the ordinary case", () => {
    const { index, state } = buildDeletionState();
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: "4.01" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { supersessionStatus: string }).supersessionStatus).toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).not.toBe(true);
  });
});
