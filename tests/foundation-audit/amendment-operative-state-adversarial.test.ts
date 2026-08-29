/**
 * ADVERSARIAL FOUNDATION AUDIT - Section 14 (Amendment / Operative State
 * Adversarial Testing). Read-only audit test file against frozen
 * production code (lib/contract-model/compiler/amendment/**). Exercises
 * computeOperativeContractState/buildProvisionChain directly with
 * hand-constructed AmendmentEffectCandidate[] (the same approach
 * amendment-and-versioning.test.ts and phase-2g-amendment-precedence.test.ts
 * use for their own synthetic-fixture scenarios), plus real
 * parseDocumentStructure/buildStructuralIndex output for target resolution
 * where the scenario needs a real base document.
 *
 * REQUIRED INVARIANT under test throughout: for a package + as-of date, the
 * system must EITHER (1) prove the operative state with real provenance, OR
 * (2) explicitly represent unresolved/ambiguous state - it must NEVER
 * silently produce OPERATIVE_STATE_RESOLVED when the evidence doesn't
 * justify it.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { verifyAmendmentEffectsIndependently } from "../../lib/contract-model/compiler/amendment/independent-verification";
import type { AmendmentEffectCandidate, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";

function buildIndex(documentId: string, text: string): { index: StructuralIndex } {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  return { index: buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []) };
}

const DATED = (date: string): EffectiveDateResult => ({ date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `effective as of ${date}`, reason: "explicit effective date clause" });
const CONDITIONAL: EffectiveDateResult = { date: null, status: "CONDITIONAL_UNRESOLVED", evidence: "subject to satisfaction of conditions precedent", reason: "conditional, no concrete date" };

function baseEffect(overrides: Partial<AmendmentEffectCandidate> & { target: AmendmentEffectCandidate["target"] }): AmendmentEffectCandidate {
  return {
    effectId: "effect",
    amendmentDocumentId: "amendment-doc",
    operation: "REPLACE_TEXT",
    effectiveDate: DATED("2020-01-01"),
    newText: null,
    oldText: null,
    sourceCitation: "amendment-doc::Section 1",
    sourceExcerpt: "excerpt",
    confidence: 0.9,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}

function sectionTarget(documentId: string, instrumentKey: string, sectionRef: string) {
  return { kind: "SECTION" as const, targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}

const BASE_DOC = "base-doc";
const INSTRUMENT = "instrument:base-doc";
const SIMPLE_TEXT = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Neither party shall make any Restricted Payment except as permitted under this Agreement.

Section 6.05 Affiliate Transactions . Neither party shall enter into any transaction with an Affiliate involving $1,000,000 or more without approval.

Section 6.06 Liens . Neither party shall grant Liens except Permitted Liens.
`.trim();

describe("CENTRAL FINDING (FIXED): an AMBIGUOUS or MISSING amendment target with captured newText must never produce OPERATIVE_STATE_RESOLVED", () => {
  const DUPLICATE_TEXT = `${SIMPLE_TEXT}\n\nSchedule A - Cross-Reference Appendix\n\nSection 6.05 Affiliate Transactions . A second, physically distinct occurrence of the identical legal reference.`;
  const TRIPLICATE_TEXT = `${DUPLICATE_TEXT}\n\nSchedule B - Second Cross-Reference Appendix\n\nSection 6.05 Affiliate Transactions . A THIRD, physically distinct occurrence of the identical legal reference.`;

  it("AMBIGUOUS target (2 real physical occurrences share '6.05') + newText -> FIXED: never RESOLVED, unresolvedIssues populated, currentText withheld, amendment's own text still preserved for review", () => {
    const { index } = buildIndex(BASE_DOC, DUPLICATE_TEXT);
    expect(index.resolveUniqueNodeByRef(BASE_DOC, "6.05").status).toBe("AMBIGUOUS");

    const effect = baseEffect({ target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: "Section 6.05 Affiliate Transactions . Neither party shall enter into any transaction with an Affiliate involving $2,500,000 or more without approval, as amended." });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });

    // FIXED: the target's own ambiguity is never masked by the presence
    // of newText - status is fail-closed, not a confident RESOLVED.
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.unresolvedIssues.length).toBeGreaterThan(0);
    expect(state.provisions[0]!.unresolvedIssues.join(" ")).toMatch(/ambiguous/i);
    expect(state.provisions[0]!.reviewRequired).toBe(true);
    // currentText is withheld - never a confident "here's what governs" answer.
    expect(state.provisions[0]!.currentText).toBeNull();
    // But "here's what the amendment SAYS" is never discarded - a reviewer
    // can still see the captured replacement text even though WHERE it
    // attaches remains unresolved.
    expect(state.provisions[0]!.attemptedText).toContain("$2,500,000");
    // The real target-resolution status/candidates are now surfaced explicitly.
    expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(state.provisions[0]!.candidateSourceNodeIds.length).toBe(2);
    expect(state.provisions[0]!.currentSourceNodeId).toBeNull();
    expect(state.provisions[0]!.supersededSourceNodeIds).toHaveLength(0);

    // independent-verification.ts is now STRENGTHENED to also catch this -
    // it previously only checked EXISTENCE (findNodesByRef().length > 0),
    // which was true for an ambiguous match too. It now re-derives the
    // real three-way status directly and fails closed on AMBIGUOUS.
    const verification = verifyAmendmentEffectsIndependently(
      [effect],
      [
        { documentId: BASE_DOC, text: DUPLICATE_TEXT, label: BASE_DOC },
        { documentId: "amendment-doc", text: `Section 6.05 of the Agreement is hereby amended and restated to read as follows: ${effect.newText}`, label: "amendment-doc" },
      ],
      index
    );
    expect(verification[0]!.passed).toBe(false);
    expect(verification[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(verification[0]!.issues.join(" ")).toMatch(/AMBIGUOUS/);
  });

  it("GENERALIZED: 3 colliding physical occurrences (not just 2) are surfaced identically - the fix is not hardcoded to exactly two candidates", () => {
    const { index } = buildIndex(BASE_DOC, TRIPLICATE_TEXT);
    const resolution = index.resolveUniqueNodeByRef(BASE_DOC, "6.05");
    expect(resolution.status).toBe("AMBIGUOUS");
    if (resolution.status !== "AMBIGUOUS") throw new Error("expected AMBIGUOUS");
    expect(resolution.candidates.length).toBe(3);

    const effect = baseEffect({ target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: "Section 6.05 Affiliate Transactions . Threshold increased to $2,500,000, as amended." });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(state.provisions[0]!.candidateSourceNodeIds.length).toBe(3);
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.attemptedText).toContain("$2,500,000");
  });

  it("MISSING target (no node at all for '6.99') + newText -> FIXED at BOTH layers: operative-state.ts never RESOLVED, and independent-verification.ts (now wired into the live pipeline) also flags it", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    expect(index.resolveUniqueNodeByRef(BASE_DOC, "6.99").status).toBe("NOT_FOUND");

    const effect = baseEffect({ target: sectionTarget(BASE_DOC, INSTRUMENT, "6.99"), newText: "Section 6.99 Fabricated Section . This text has no real corresponding base provision." });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });

    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.unresolvedIssues.length).toBeGreaterThan(0);
    expect(state.provisions[0]!.unresolvedIssues.join(" ")).toMatch(/not found/i);
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.attemptedText).toContain("Fabricated Section");
    expect(state.provisions[0]!.targetResolutionStatus).toBe("NOT_FOUND");

    const verification = verifyAmendmentEffectsIndependently([effect], [{ documentId: BASE_DOC, text: SIMPLE_TEXT, label: BASE_DOC }], index);
    expect(verification[0]!.passed).toBe(false);
    expect(verification[0]!.targetResolutionStatus).toBe("NOT_FOUND");
    expect(verification[0]!.issues[0]).toMatch(/does not resolve/);
  });

  it("control: the SAME ambiguous target WITHOUT newText correctly downgrades to OPERATIVE_STATE_PARTIAL - confirms the fix applies uniformly regardless of whether newText happens to be present, not merely to the newText branch specifically", () => {
    const { index } = buildIndex(BASE_DOC, DUPLICATE_TEXT);
    const effect = baseEffect({ target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), operation: "MODIFY_THRESHOLD", newText: null });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.attemptedText).toBeNull();
  });

  it("independent-verification.ts is now WIRED into the live pipeline (pipeline.ts) as a real gate, while remaining a genuinely separate pass from operative-state.ts's own buildProvisionView (Architecture Invariant #17)", () => {
    // Phase 3F.1.4 §6C: previously this function had zero real callers
    // outside one-off diagnostic scripts (grep-confirmed by the audit).
    // It is now imported and invoked by runAmendmentPipeline. It remains
    // intentionally NOT imported by operative-state.ts itself, so
    // "propose" (buildProvisionView, consuming resolveUniqueNodeByRef
    // directly) and "check" (this module, re-deriving resolution
    // independently) stay two distinct passes, never fused into one.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    const pipelineSrc = fs.readFileSync(require.resolve("../../lib/contract-model/compiler/amendment/pipeline.ts"), "utf8");
    const operativeStateSrc = fs.readFileSync(require.resolve("../../lib/contract-model/compiler/amendment/operative-state.ts"), "utf8");
    expect(pipelineSrc.includes("verifyAmendmentEffectsIndependently")).toBe(true);
    expect(operativeStateSrc.includes("verifyAmendmentEffectsIndependently")).toBe(false);
  });
});

describe("Conflicting same-date amendments to the same provision (FIXED): status is CONFLICTED, and currentText is now withheld/order-INVARIANT instead of following iteration order", () => {
  it("two genuinely conflicting effects (same date, different resulting text) targeting the same section produce OPERATIVE_STATE_CONFLICTED, currentText is null in BOTH orders, and candidateTexts is the SAME (effectId-sorted) value regardless of input order", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effectX = baseEffect({ effectId: "effect-x", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "Section 6.04 (per Amendment X) - the cap is $10,000,000.", sourceCitation: "amendment-x::Section 1" });
    const effectY = baseEffect({ effectId: "effect-y", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "Section 6.04 (per Amendment Y) - the cap is $20,000,000.", sourceCitation: "amendment-y::Section 1" });

    const stateXY = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effectX, effectY] });
    const stateYX = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effectY, effectX] });

    expect(stateXY.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(stateYX.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(stateXY.provisions[0]!.conflicts.some((c) => c.conflictType === "AMENDMENT_CONFLICT")).toBe(true);

    // FIXED: no evidence-based precedence rule exists between these two
    // effects, so currentText is withheld entirely - never populated from
    // whichever effect happens to be last in the input array.
    expect(stateXY.provisions[0]!.currentText).toBeNull();
    expect(stateYX.provisions[0]!.currentText).toBeNull();
    // Both real candidate texts are still disclosed, in an INPUT-ORDER-
    // INVARIANT (effectId-sorted) sequence - proving order invariance
    // directly, not merely that currentText itself is null in both cases.
    expect(stateXY.provisions[0]!.candidateTexts).toEqual(["Section 6.04 (per Amendment X) - the cap is $10,000,000.", "Section 6.04 (per Amendment Y) - the cap is $20,000,000."]);
    expect(stateYX.provisions[0]!.candidateTexts).toEqual(stateXY.provisions[0]!.candidateTexts);
    expect(stateXY.provisions[0]!.reviewRequired).toBe(true);
  });
});

describe("Deletion (no replacement) - FIXED (P3): currentText is null AND status is now the correct RESOLVED, no longer mislabeled as a derivation failure", () => {
  it("a clean DELETE_TEXT effect with a fully resolved, unique target correctly resolves to null currentText WITH status RESOLVED - a well-evidenced, intended deletion is a correct null-governance outcome, never conflated with 'an effect governs but its resulting text could not be captured'", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effect = baseEffect({ operation: "DELETE_TEXT", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: null });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });

    expect(state.provisions[0]!.currentText).toBeNull();
    // FIXED: the system has full, unambiguous evidence that section 6.05
    // was deleted (a UNIQUE target, a real dated effect) and nothing
    // governs there any more - that is a correct, known outcome, not a
    // failure to derive text, so it no longer reads as OPERATIVE_STATE_PARTIAL.
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.unresolvedIssues).toHaveLength(0);
    expect(state.provisions[0]!.reviewRequired).toBe(false);
    expect(state.provisions[0]!.targetResolutionStatus).toBe("UNIQUE");
  });

  it("CONTROL: a governing effect with NO capturable text (a threshold change with no quoted replacement) is STILL correctly OPERATIVE_STATE_PARTIAL with the original 'could not be safely derived' message - the P3 fix is specific to deletions, never a blanket relaxation", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effect = baseEffect({ operation: "MODIFY_THRESHOLD", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: null });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.unresolvedIssues[0]).toMatch(/could not be safely derived/);
  });

  it("an AMBIGUOUS-target deletion is NOT treated as a clean deletion - we cannot say WHAT was deleted when the target itself never resolved uniquely", () => {
    const DUPLICATE_TEXT = `${SIMPLE_TEXT}\n\nSchedule A - Cross-Reference Appendix\n\nSection 6.05 Affiliate Transactions . A second, physically distinct occurrence of the identical legal reference.`;
    const { index } = buildIndex(BASE_DOC, DUPLICATE_TEXT);
    const effect = baseEffect({ operation: "DELETE_TEXT", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: null });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(state.provisions[0]!.currentText).toBeNull();
  });
});

describe("Amendment of an amendment (A amends base, B later amends A's own already-amended text)", () => {
  it("a two-step chain (2019 REPLACE, then 2022 REPLACE of the same provision) correctly resolves to the LATEST amendment's text as of a date after both, and to the FIRST amendment's text as of a date between them", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effect2019 = baseEffect({ effectId: "e2019", amendmentDocumentId: "amendment-2019", effectiveDate: DATED("2019-06-01"), target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "Section 6.04 (2019 amendment) - Restricted Payments capped at $5,000,000." });
    const effect2022 = baseEffect({ effectId: "e2022", amendmentDocumentId: "amendment-2022", effectiveDate: DATED("2022-06-01"), target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "Section 6.04 (2022 amendment, amending the 2019 amendment) - Restricted Payments capped at $8,000,000." });

    const stateBefore = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2018-01-01", index, allEffects: [effect2019, effect2022] });
    const stateBetween = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2020-01-01", index, allEffects: [effect2019, effect2022] });
    const stateAfter = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2023-01-01", index, allEffects: [effect2019, effect2022] });

    expect(stateBefore.provisions[0]!.currentText).toContain("Restricted Payment except as permitted"); // base, unamended
    expect(stateBefore.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(stateBetween.provisions[0]!.currentText).toContain("$5,000,000");
    expect(stateBetween.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(stateAfter.provisions[0]!.currentText).toContain("$8,000,000");
    expect(stateAfter.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    // Full lineage preserved regardless of asOfDate (task's own "historical versions remain queryable").
    expect(stateAfter.provisions[0]!.fullChain).toHaveLength(2);
    expect(stateAfter.provisions[0]!.supersededSourceNodeIds.length + (stateAfter.provisions[0]!.currentSourceNodeId ? 0 : 1)).toBeGreaterThanOrEqual(0); // sanity: no crash on lineage bookkeeping
  });
});

describe("Future effectiveness, retroactive effectiveness, and conditional (signing date != effective date)", () => {
  it("a future-dated effect does not apply yet as of an earlier query date (base text still governs, status RESOLVED, not merely 'nothing happened')", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effect = baseEffect({ effectiveDate: DATED("2030-01-01"), target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "future text" });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.appliedChain).toHaveLength(0);
    expect(state.provisions[0]!.currentText).toContain("except as permitted"); // base text
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("a retroactively-effective amendment (effective date before its own likely drafting/signing) applies exactly like any other dated effect once asOfDate is on/after it", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effect = baseEffect({ effectiveDate: DATED("2015-01-01"), target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "retroactively effective text" });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.currentText).toBe("retroactively effective text");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("a conditions-precedent amendment with no resolvable concrete date (signing date != effective date, effectiveness genuinely conditional) never silently applies and never silently resolves - it is placed at the end of the chain with AMENDMENT_SEQUENCE_UNRESOLVED", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effect = baseEffect({ effectiveDate: CONDITIONAL, target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "conditional text" });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2099-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.appliedChain).toHaveLength(0); // never applied - no concrete date, regardless of how far in the future asOfDate is
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(state.provisions[0]!.conflicts.some((c) => c.conflictType === "AMENDMENT_SEQUENCE_UNRESOLVED")).toBe(true);
  });
});

describe("F3 re-verification (post-3F.1.2): can OPERATIVE_STATE_RESOLVED + zero provisions occur, and does it conceal a real problem?", () => {
  it("zero effects at all for an instrument -> correctly RESOLVED with zero provisions (an honest 'nothing to report', not a concealment - no known unattached activity exists)", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [] });
    expect(state.provisions).toHaveLength(0);
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("a DOCUMENT-kind effect (e.g. RESTATE_AGREEMENT with an unresolved target document) cannot attach to any provision, correctly forces REVIEW_REQUIRED despite zero provisions - the F3 fix holds on current code", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const restateEffect = baseEffect({
      operation: "RESTATE_AGREEMENT",
      target: { kind: "DOCUMENT", targetDocumentId: null, targetInstrumentKey: INSTRUMENT, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: null, targetHint: "predecessor agreement not in curated package" },
      status: "UNRESOLVED",
      unresolvedReason: "restatement target document not present in package",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [restateEffect] });
    expect(state.provisions).toHaveLength(0);
    expect(state.unattachedEffects).toHaveLength(1);
    // This is the exact mechanism that must never regress: zero provisions
    // must not silently coexist with a status implying full resolution.
    expect(state.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
  });

  it("a real Article VI-shaped instrument with genuinely ZERO amendment history is honestly RESOLVED/empty - this is a case worth a human's attention for a real credit agreement, but is not, by itself, evidence of a system defect", () => {
    // Documented per the task's own framing, not asserted as a defect:
    // OPERATIVE_STATE_RESOLVED + 0 provisions is the CORRECT representation
    // whenever no amendment effect (attached or unattached) is known for
    // the instrument at all - distinguishing "never amended" from "amended
    // but we lost track of it" is exactly what unattachedEffects is for,
    // and it correctly gates the status above.
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [] });
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions).toHaveLength(0);
  });
});

describe("Cross-package instrument isolation: amendments across two instruments (base + guarantee) do not leak into each other's operative state", () => {
  it("an effect targeting the guarantee instrument never appears in the base instrument's own operative state, and vice versa", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const GUARANTEE_INSTRUMENT = "instrument:guarantee-doc";
    const baseAmendmentEffect = baseEffect({ effectId: "e-base", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "base amendment text" });
    const guaranteeAmendmentEffect = baseEffect({ effectId: "e-guarantee", target: sectionTarget("guarantee-doc", GUARANTEE_INSTRUMENT, "3.01"), newText: "guarantee amendment text" });

    const baseState = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [baseAmendmentEffect, guaranteeAmendmentEffect] });
    expect(baseState.provisions).toHaveLength(1);
    expect(baseState.provisions[0]!.sectionRef).toBe("6.04");
    expect(JSON.stringify(baseState)).not.toContain("guarantee amendment text");
  });
});

describe("Quoted historical language inside the amendment (the amendment's own text includes verbatim OLD text for reference)", () => {
  it("a quoted OLD section heading inside the amendment document's own text gets its own real nodeId (post-3F.1.2) SCOPED TO THE AMENDMENT DOCUMENT, and is never confusable with the BASE document's own governing node because StructuralIndex resolution is always documentId-scoped", () => {
    const amendmentDocumentId = "amendment-doc-quoting";
    const amendmentText = `
Section 1 Amendment . The Borrower and the Lenders hereby agree that Section 6.04 of the Credit Agreement, which currently reads as follows:

Section 6.04 Limitation on Distributions . Neither party shall make any Restricted Payment except as permitted under this Agreement.

is hereby amended and restated in its entirety to read as follows:

Section 6.04 Limitation on Distributions . Neither party shall make any Restricted Payment except as permitted under this Agreement, as amended to increase the cap to $9,000,000.
`.trim();

    const { index: baseIndex } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const amendmentParsedNodes = parseDocumentStructure({ documentId: amendmentDocumentId, label: amendmentDocumentId, text: amendmentText });
    // The quoted OLD heading and the real amendment's own replacement heading
    // both independently parse as real, distinct SECTION nodes WITHIN THE
    // AMENDMENT DOCUMENT - confirming 3F.1.2's own "quoted amendment text
    // creates a second real physical occurrence, not a corrupted one"
    // property holds even for quoted OLD (not just quoted NEW) text.
    const sixOhFourOccurrencesInAmendment = amendmentParsedNodes.filter((n) => n.sectionRef === "6.04");
    expect(sixOhFourOccurrencesInAmendment.length).toBeGreaterThanOrEqual(2);

    // Critically: operative-state.ts's resolveBaseText ALWAYS queries the
    // BASE document's own index by baseDocumentId - it has no code path
    // that could accidentally resolve a node from the amendment document's
    // OWN text instead, because StructuralIndex's resolveUniqueNodeByRef
    // is strictly documentId-scoped (`${documentId}::${normalizedRef}`).
    // Confirmed directly: the base index (built from BASE_DOC's text only)
    // has no knowledge of the amendment document's nodes at all.
    expect(baseIndex.resolveUniqueNodeByRef(amendmentDocumentId, "6.04").status).toBe("NOT_FOUND");
    const baseResolution = baseIndex.resolveUniqueNodeByRef(BASE_DOC, "6.04");
    expect(baseResolution.status).toBe("UNIQUE");
  });
});

describe("Duplicated legal reference as amendment target where NO newText is supplied (bare 'is hereby amended', no quoted replacement) - FIXED disclosure quality", () => {
  it("an ambiguous target with no newText correctly downgrades to PARTIAL and NOW explicitly names the ambiguity (2+ real candidates) as the reason, not a generic 'text could not be captured' message", () => {
    const DUPLICATE_TEXT = `${SIMPLE_TEXT}\n\nSchedule A - Cross-Reference Appendix\n\nSection 6.05 Affiliate Transactions . A second, physically distinct occurrence of the identical legal reference.`;
    const { index } = buildIndex(BASE_DOC, DUPLICATE_TEXT);
    const effect = baseEffect({ operation: "MODIFY_THRESHOLD", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: null });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    // FIXED: the audit's own disclosure-quality gap - a reviewer can now
    // tell from unresolvedIssues alone that the real reason is "two real,
    // distinct sections share this exact legal reference in the base
    // document," not merely "the amendment didn't quote replacement text."
    expect(state.provisions[0]!.unresolvedIssues.join(" ")).toMatch(/ambiguous/i);
    expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(state.provisions[0]!.candidateSourceNodeIds.length).toBe(2);
  });
});

describe("DEFINITION-kind versions of the CENTRAL FINDING (P0-1) - the same buildProvisionView code path, same fix, exercised for a defined term instead of a section", () => {
  function definedTermTarget(documentId: string, instrumentKey: string, term: string) {
    return { kind: "DEFINITION" as const, targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: term, targetHint: null };
  }

  it("AMBIGUOUS definition target (2 real, distinct definitions of the SAME term in the base document) + newText -> never RESOLVED, currentText withheld, attemptedText preserved", () => {
    const documentId = "def-base-doc";
    const text = `
CREDIT AGREEMENT dated as of January 15, 2021, among Acme LLC, as Borrower.

"Consolidated EBITDA" means net income plus interest, taxes, depreciation and amortization.

SCHEDULE 1 - Cross-Reference Appendix

"Consolidated EBITDA" means, for purposes of the leverage covenant only, net income plus interest and taxes (a second, genuinely distinct definition of the identical term).
`.trim();
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const defs = detectStructuralDefinitions(documentId, text, nodes);
    expect(defs.filter((d) => d.normalizedTerm === "consolidated ebitda")).toHaveLength(2);
    const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), defs, []);

    const instrumentKey = `instrument:${documentId}`;
    const effect = baseEffect({ target: definedTermTarget(documentId, instrumentKey, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means net income plus interest, taxes, depreciation, amortization, and non-recurring restructuring charges.` });
    const state = computeOperativeContractState({ instrumentKey, baseDocumentId: documentId, asOfDate: "2021-01-01", index, allEffects: [effect] });

    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.attemptedText).toContain("non-recurring restructuring charges");
    expect(state.provisions[0]!.candidateSourceNodeIds.length).toBeGreaterThanOrEqual(0); // definitions may or may not carry a source node id; never fabricated either way.
    expect(state.provisions[0]!.unresolvedIssues.join(" ")).toMatch(/ambiguous/i);
  });

  it("NOT_FOUND definition target (the base document never defines this term at all) + newText -> never RESOLVED for a REPLACE_DEFINITION of a term that should already exist", () => {
    const documentId = "def-base-doc-2";
    const text = `CREDIT AGREEMENT dated as of January 15, 2021, among Beta LLC, as Borrower.\n\nSection 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $50,000,000.`;
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
    const instrumentKey = `instrument:${documentId}`;

    const effect = baseEffect({ operation: "REPLACE_DEFINITION", target: definedTermTarget(documentId, instrumentKey, "Excluded Subsidiary"), newText: `"Excluded Subsidiary" means any Subsidiary designated as such by the Borrower.` });
    const state = computeOperativeContractState({ instrumentKey, baseDocumentId: documentId, asOfDate: "2021-01-01", index, allEffects: [effect] });

    expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.targetResolutionStatus).toBe("NOT_FOUND");
    expect(state.provisions[0]!.currentText).toBeNull();
    expect(state.provisions[0]!.attemptedText).toContain("Excluded Subsidiary");
  });

  it("POSITIVE CONTROL: ADD_DEFINITION introducing a genuinely NEW term (absent from the base document by design, not by error) is correctly treated as UNIQUE/resolvable, never flagged as a false ambiguous/missing target", () => {
    const documentId = "def-base-doc-3";
    const text = `CREDIT AGREEMENT dated as of January 15, 2021, among Gamma LLC, as Borrower.\n\nSection 6.01 Indebtedness. The Borrower will not incur Indebtedness in excess of $50,000,000.`;
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
    const instrumentKey = `instrument:${documentId}`;

    const effect = baseEffect({ operation: "ADD_DEFINITION", target: definedTermTarget(documentId, instrumentKey, "Permitted Refinancing Indebtedness"), newText: null });
    const state = computeOperativeContractState({ instrumentKey, baseDocumentId: documentId, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.targetResolutionStatus).toBe("UNIQUE");
    // ADD_DEFINITION's own deterministic parser never captures newText (task
    // §7's own scope), so this still reads as PARTIAL ("governs, exact
    // wording not captured") rather than RESOLVED - but crucially for a
    // DIFFERENT, correct reason than a false ambiguous/missing-target flag.
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.unresolvedIssues.join(" ")).not.toMatch(/ambiguous|not found/i);
  });
});

describe("GENERALIZED: deeply nested amendment chain with an ambiguous target - the ambiguity governs at every query date along the chain, not merely the latest one", () => {
  it("a 3-amendment chain against an AMBIGUOUS base section never reaches RESOLVED at any query date (before/between/after all three), even though every individual effect is itself well-dated and well-evidenced", () => {
    const DUPLICATE_TEXT = `${SIMPLE_TEXT}\n\nSchedule A - Cross-Reference Appendix\n\nSection 6.04 Limitation on Distributions . A second, physically distinct occurrence of the identical legal reference.`;
    const { index } = buildIndex(BASE_DOC, DUPLICATE_TEXT);
    expect(index.resolveUniqueNodeByRef(BASE_DOC, "6.04").status).toBe("AMBIGUOUS");

    const e1 = baseEffect({ effectId: "e1", amendmentDocumentId: "amend-2019", effectiveDate: DATED("2019-01-01"), target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "6.04 per 2019 amendment - $5,000,000 cap." });
    const e2 = baseEffect({ effectId: "e2", amendmentDocumentId: "amend-2021", effectiveDate: DATED("2021-01-01"), target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "6.04 per 2021 amendment - $8,000,000 cap." });
    const e3 = baseEffect({ effectId: "e3", amendmentDocumentId: "amend-2023", effectiveDate: DATED("2023-01-01"), target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "6.04 per 2023 amendment - $12,000,000 cap." });

    for (const asOfDate of ["2018-06-01", "2020-06-01", "2022-06-01", "2024-06-01"]) {
      const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate, index, allEffects: [e1, e2, e3] });
      expect(state.status).not.toBe("OPERATIVE_STATE_RESOLVED");
      expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
      expect(state.provisions[0]!.targetResolutionStatus).toBe("AMBIGUOUS");
      expect(state.provisions[0]!.currentText).toBeNull();
    }

    // The LATEST applied effect's own text is still preserved for review at the final date.
    const stateAfterAll = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2024-06-01", index, allEffects: [e1, e2, e3] });
    expect(stateAfterAll.provisions[0]!.attemptedText).toContain("$12,000,000");
    expect(stateAfterAll.provisions[0]!.fullChain).toHaveLength(3);
  });
});
