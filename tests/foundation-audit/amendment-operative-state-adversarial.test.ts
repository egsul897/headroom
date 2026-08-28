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

describe("CENTRAL FINDING: an AMBIGUOUS or MISSING amendment target with captured newText silently produces OPERATIVE_STATE_RESOLVED", () => {
  const DUPLICATE_TEXT = `${SIMPLE_TEXT}\n\nSchedule A - Cross-Reference Appendix\n\nSection 6.05 Affiliate Transactions . A second, physically distinct occurrence of the identical legal reference.`;

  it("AMBIGUOUS target (2 real physical occurrences share '6.05') + newText -> falsely OPERATIVE_STATE_RESOLVED, zero unresolvedIssues, zero provenance to the base node", () => {
    const { index } = buildIndex(BASE_DOC, DUPLICATE_TEXT);
    expect(index.resolveUniqueNodeByRef(BASE_DOC, "6.05").status).toBe("AMBIGUOUS");

    const effect = baseEffect({ target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: "Section 6.05 Affiliate Transactions . Neither party shall enter into any transaction with an Affiliate involving $2,500,000 or more without approval, as amended." });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });

    // THE DEFECT: status is RESOLVED despite the target never having been
    // uniquely identified in the base document at all.
    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.unresolvedIssues).toHaveLength(0);
    expect(state.provisions[0]!.currentText).toContain("$2,500,000");
    // No trace anywhere in the view that the OLD target was ambiguous.
    expect(state.provisions[0]!.currentSourceNodeId).toBeNull();
    expect(state.provisions[0]!.supersededSourceNodeIds).toHaveLength(0);

    // independent-verification.ts ALSO does not catch this - it only
    // checks EXISTENCE (findNodesByRef().length > 0), which is true for an
    // ambiguous match too, never distinguishing UNIQUE from AMBIGUOUS.
    const verification = verifyAmendmentEffectsIndependently(
      [effect],
      [
        { documentId: BASE_DOC, text: DUPLICATE_TEXT, label: BASE_DOC },
        { documentId: "amendment-doc", text: `Section 6.05 of the Agreement is hereby amended and restated to read as follows: ${effect.newText}`, label: "amendment-doc" },
      ],
      index
    );
    expect(verification[0]!.passed).toBe(true);
    expect(verification[0]!.issues).toHaveLength(0);
  });

  it("MISSING target (no node at all for '6.99') + newText -> ALSO falsely OPERATIVE_STATE_RESOLVED at the operative-state layer, though independent-verification DOES flag it (when actually invoked)", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    expect(index.resolveUniqueNodeByRef(BASE_DOC, "6.99").status).toBe("NOT_FOUND");

    const effect = baseEffect({ target: sectionTarget(BASE_DOC, INSTRUMENT, "6.99"), newText: "Section 6.99 Fabricated Section . This text has no real corresponding base provision." });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });

    expect(state.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.unresolvedIssues).toHaveLength(0);

    const verification = verifyAmendmentEffectsIndependently([effect], [{ documentId: BASE_DOC, text: SIMPLE_TEXT, label: BASE_DOC }], index);
    expect(verification[0]!.passed).toBe(false);
    expect(verification[0]!.issues[0]).toMatch(/does not resolve/);
  });

  it("control: the SAME ambiguous target WITHOUT newText correctly downgrades to OPERATIVE_STATE_PARTIAL - the bug is specific to the newText branch masking an unresolved base target", () => {
    const { index } = buildIndex(BASE_DOC, DUPLICATE_TEXT);
    const effect = baseEffect({ target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), operation: "MODIFY_THRESHOLD", newText: null });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.currentText).toBeNull();
  });

  it("independent-verification.ts is not wired into any live production caller - grep confirms its only real callers are one-off diagnostic scripts, never lib/amendment/pipeline.ts or lib/amendment/operative-state.ts itself", () => {
    // This assertion documents a real repository fact checked via Bash
    // during this audit (grep -rn "verifyAmendmentEffectsIndependently"
    // lib/ app/ scripts/) rather than re-deriving it here: the function is
    // exported but never imported by pipeline.ts/operative-state.ts or any
    // app/ route. Encoded as a lightweight structural check on the
    // pipeline module's own source text so a future wiring-up is detected
    // (test starts failing, in the safe direction) rather than silently
    // stale.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    const pipelineSrc = fs.readFileSync(require.resolve("../../lib/contract-model/compiler/amendment/pipeline.ts"), "utf8");
    const operativeStateSrc = fs.readFileSync(require.resolve("../../lib/contract-model/compiler/amendment/operative-state.ts"), "utf8");
    expect(pipelineSrc.includes("verifyAmendmentEffectsIndependently")).toBe(false);
    expect(operativeStateSrc.includes("verifyAmendmentEffectsIndependently")).toBe(false);
  });
});

describe("Conflicting same-date amendments to the same provision: status is correctly CONFLICTED, but currentText is still populated from iteration order, not evidence", () => {
  it("two genuinely conflicting effects (same date, different resulting text) targeting the same section produce OPERATIVE_STATE_CONFLICTED, and currentText silently follows ARRAY INSERTION ORDER, not any evidence-based precedence rule", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effectX = baseEffect({ effectId: "effect-x", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "Section 6.04 (per Amendment X) - the cap is $10,000,000.", sourceCitation: "amendment-x::Section 1" });
    const effectY = baseEffect({ effectId: "effect-y", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.04"), newText: "Section 6.04 (per Amendment Y) - the cap is $20,000,000.", sourceCitation: "amendment-y::Section 1" });

    const stateXY = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effectX, effectY] });
    const stateYX = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effectY, effectX] });

    expect(stateXY.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(stateYX.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(stateXY.provisions[0]!.conflicts.some((c) => c.conflictType === "AMENDMENT_CONFLICT")).toBe(true);

    // THE DEFECT (narrower, but real): currentText differs solely because
    // the two effects were passed in a different array order - a
    // downstream consumer that reads `currentText` without also checking
    // `status` (a real risk the type's own field ordering invites) would
    // see a DIFFERENT confident-looking dollar figure depending on
    // accidental input ordering, never on which amendment actually has
    // better legal precedence (there is none here by design - this is a
    // genuine drafting conflict with no resolving evidence).
    expect(stateXY.provisions[0]!.currentText).toContain("$20,000,000"); // Y processed last
    expect(stateYX.provisions[0]!.currentText).toContain("$10,000,000"); // X processed last
    expect(stateXY.provisions[0]!.currentText).not.toBe(stateYX.provisions[0]!.currentText);
  });
});

describe("Deletion (no replacement): currentText is correctly null, but the STATUS/reason text is misleading for a genuine, well-evidenced deletion", () => {
  it("a clean DELETE_TEXT effect with a fully resolved, unique target is downgraded to OPERATIVE_STATE_PARTIAL with a 'text could not be safely derived' message, even though the null text is the CORRECT, intended outcome of a deletion, not a derivation failure", () => {
    const { index } = buildIndex(BASE_DOC, SIMPLE_TEXT);
    const effect = baseEffect({ operation: "DELETE_TEXT", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: null });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });

    expect(state.provisions[0]!.currentText).toBeNull();
    // This is the over-conservative/mislabeled part: PARTIAL + a message
    // implying uncertainty about DERIVING text, when in fact the system
    // has full, unambiguous evidence that section 6.05 was deleted and
    // nothing governs there any more - a materially different situation
    // from "an amendment applies but we could not safely render its text."
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(state.provisions[0]!.unresolvedIssues[0]).toMatch(/could not be safely derived/);
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

describe("Duplicated legal reference as amendment target where NO newText is supplied (bare 'is hereby amended', no quoted replacement)", () => {
  it("an ambiguous target with no newText correctly downgrades to PARTIAL and explicitly names the ambiguity risk is NOT surfaced in unresolvedIssues (a real, if smaller, disclosure gap)", () => {
    const DUPLICATE_TEXT = `${SIMPLE_TEXT}\n\nSchedule A - Cross-Reference Appendix\n\nSection 6.05 Affiliate Transactions . A second, physically distinct occurrence of the identical legal reference.`;
    const { index } = buildIndex(BASE_DOC, DUPLICATE_TEXT);
    const effect = baseEffect({ operation: "MODIFY_THRESHOLD", target: sectionTarget(BASE_DOC, INSTRUMENT, "6.05"), newText: null });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: BASE_DOC, asOfDate: "2021-01-01", index, allEffects: [effect] });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
    // The unresolvedIssues message is generic ("text could not be safely
    // derived") - it never says WHY (ambiguous vs. simply not captured),
    // so a reviewer cannot tell from this view alone that the real reason
    // is "two real, distinct sections share this exact legal reference in
    // the base document" as opposed to "the amendment just didn't quote
    // replacement text." Documented as a disclosure-quality gap, not a
    // false-RESOLVED defect (that is the earlier, more severe finding).
    expect(state.provisions[0]!.unresolvedIssues.join(" ")).not.toMatch(/ambiguous/i);
  });
});
