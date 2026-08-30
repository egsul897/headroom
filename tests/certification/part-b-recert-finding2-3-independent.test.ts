/**
 * Phase 3F.1.6.RX-FINAL Part B - INDEPENDENT recertification, Auditor scope:
 * FINDING-2 (BLOCKER-5, getDefinition stale-text disclosure) + FINDING-3
 * (BLOCKER-6 coupled bypass). This file is written FRESH by an independent
 * auditor to try to FALSIFY Workstream B's claimed fix
 * (lib/contract-model/compiler/semantic/tools.ts's getDefinition,
 * lib/contract-model/compiler/amendment/operative-state.ts's exported
 * resolveUniqueDefinitionByRef) - it is not a rerun of, and shares no
 * fixture code with, tests/contract-model/part-b-recert-blocker2-6-tools-
 * adversarial.test.ts or tests/contract-model/finding-2-3-getDefinition-
 * operative-safety-e2e.test.ts (Workstream B's own required tests).
 *
 * Every scenario below exercises the REAL production pipeline end to end:
 * parseDocumentStructure -> detectStructuralDefinitions -> buildStructuralIndex
 * -> computeOperativeContractState -> buildToolSet's real getDefinition.execute()
 * (and, for the divergence check, getOperativeProvision.execute()). No DB
 * access is exercised anywhere in this call path (confirmed by reading
 * lib/contract-model/compiler/semantic/tools.ts and amendment/operative-
 * state.ts end to end - both are pure functions over an in-memory
 * StructuralIndex/AmendmentEffectCandidate[]), so no Postgres rows are
 * created; this mirrors the exact convention already established by
 * tests/foundation-audit/amendment-operative-state-adversarial.test.ts and
 * Workstream B's own part-b-recert-blocker2-6-tools-adversarial.test.ts,
 * both of which test this identical code path the same way.
 *
 * FINDING under independent test: getDefinition's term-lookup helper
 * (`findProvisionView` in semantic/tools.ts) resolves a queried term against
 * `OperativeProvisionView.definedTermRef` via
 * `(p.definedTermRef ?? "").toLowerCase() === ref.trim().toLowerCase()` -
 * this collapses LEADING/TRAILING whitespace only. Its SECTION-side sibling
 * comparison on the very same line collapses ALL whitespace
 * (`.replace(/\s+/g, "")` on both sides). `OperativeProvisionView.
 * definedTermRef` itself is always stored FULLY whitespace-normalized
 * (single-spaced, lowercased) by amendment/chain.ts's own
 * `normalizeDefinedTermRef` (`term.replace(/\s+/g, " ").trim().toLowerCase()`),
 * via `provisionKeyFor`. So a query term that reproduces the term's exact
 * wording but with irregular INTERNAL whitespace (a doubled space, a tab, a
 * line-wrap newline - all realistic artifacts of an LLM echoing a term name
 * it read from real contract text, especially OCR'd or line-wrapped source)
 * fails this exact-match comparison and getDefinition silently treats the
 * term as "no recorded amendment activity at all," falling through to the
 * NO-recorded-amendment fallback branch. That fallback's own ambiguity check
 * (`resolveUniqueDefinitionByRef`) DOES fully normalize its query term
 * internally, so it does not protect against a targetResolutionStatus-
 * AMBIGUOUS/NOT_FOUND case (the fallback independently rediscovers that
 * class of ambiguity) - but it does nothing at all for the OTHER, equally
 * real class of operative-state uncertainty: a UNIQUE base-document
 * definition whose OWN AMENDMENT EFFECTS are CONFLICTED (two effects, same
 * effective date, different text) or PARTIAL for a non-ambiguity reason
 * (an applied effect governs but supplied no capturable replacement text).
 * For exactly those two states, the fallback happily reports
 * OPERATIVE_STATE_RESOLVED and serves the raw, stale, pre-amendment base
 * text - the identical defect class FINDING-2/3 was supposed to close,
 * reachable via a realistic query-term variant the fix's own required test
 * (which only ever queries with the term's own canonical single-spaced
 * form) never tried.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import type { SemanticToolAccess } from "../../lib/contract-model/compiler/semantic/types";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";
import { emptyContextBundle } from "../contract-model/semantic-compiler/test-helpers";

const DOC_ID = "part-b-f23-indep-doc";
const INSTRUMENT = "instrument:part-b-f23-indep";

const DATED = (date: string): EffectiveDateResult => ({ date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `effective as of ${date}`, reason: "explicit effective date clause" });

function definitionTarget(documentId: string, instrumentKey: string, term: string): AmendmentTarget {
  return { kind: "DEFINITION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: term, targetHint: null };
}

function sectionTarget(documentId: string, instrumentKey: string, sectionRef: string): AmendmentTarget {
  return { kind: "SECTION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}

function baseEffect(overrides: Partial<AmendmentEffectCandidate> & { target: AmendmentTarget }): AmendmentEffectCandidate {
  return {
    effectId: "effect",
    amendmentDocumentId: "amendment-doc",
    operation: "REPLACE_DEFINITION",
    effectiveDate: DATED("2021-01-01"),
    newText: null,
    oldText: null,
    sourceCitation: "amendment-doc::Section 2",
    sourceExcerpt: "excerpt",
    confidence: 0.9,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}

/** Builds a real StructuralIndex from real contract-shaped text via the actual production parsers - never hand-built nodes. */
function buildRealIndex(text: string) {
  const nodes = parseDocumentStructure({ documentId: DOC_ID, label: DOC_ID, text });
  const definitions = detectStructuralDefinitions(DOC_ID, text, nodes);
  const index = buildStructuralIndex(new Map([[DOC_ID, { text, nodes }]]), definitions, []);
  return { index, nodes, definitions };
}

function accessFor(index: ReturnType<typeof buildRealIndex>["index"], operativeState: ReturnType<typeof computeOperativeContractState> | null, allEffects: AmendmentEffectCandidate[] | null = null): SemanticToolAccess {
  return { structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: allEffects, contextBundle: emptyContextBundle() };
}

function getDefinitionTool(access: SemanticToolAccess) {
  const tools = buildToolSet(access, DOC_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
  const tool = tools.find((t) => t.name === "getDefinition");
  if (!tool) throw new Error("getDefinition tool not registered");
  return tool;
}

function getOperativeProvisionTool(access: SemanticToolAccess) {
  const tools = buildToolSet(access, DOC_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
  const tool = tools.find((t) => t.name === "getOperativeProvision");
  if (!tool) throw new Error("getOperativeProvision tool not registered");
  return tool;
}

describe("FINDING-2/3 independent recertification - CONFLICTED definition (two same-date effects) + whitespace-variant query", () => {
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated EBITDA" means, for any period, an amount equal to Consolidated Net Income for such period, not to exceed $5,000,000 in the aggregate for purposes of any covenant basket referencing this term.

ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.50 to 1.00.
`.trim();

  function buildState() {
    const { index } = buildRealIndex(TEXT);
    // Sanity: exactly one physical, un-collided definition of the term in
    // the base document - the conflict below is purely at the AMENDMENT
    // level (two competing effects), never a physical-occurrence ambiguity.
    expect(index.getDefinitionFullText("Consolidated EBITDA", DOC_ID)).toContain("$5,000,000");

    const effectA = baseEffect({
      effectId: "eff-conflict-A",
      amendmentDocumentId: "amendment-doc-A",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Consolidated EBITDA"),
      newText: `"Consolidated EBITDA" means, for any period, an amount not to exceed $9,000,000 in the aggregate (as amended by Amendment No. 1).`,
      effectiveDate: DATED("2021-06-01"),
      sourceCitation: "amendment-doc-A::Section 2",
    });
    const effectB = baseEffect({
      effectId: "eff-conflict-B",
      amendmentDocumentId: "amendment-doc-B",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Consolidated EBITDA"),
      newText: `"Consolidated EBITDA" means, for any period, an amount not to exceed $12,000,000 in the aggregate (as amended by a separately executed Amendment No. 1-Alternate).`,
      // Same effective date as effectA - a genuine, real AMENDMENT_CONFLICT
      // per chain.ts's own §22 rule, independent of any physical-occurrence
      // ambiguity (there is exactly one physical definition here).
      effectiveDate: DATED("2021-06-01"),
      sourceCitation: "amendment-doc-B::Section 2",
    });

    const { index: index2 } = buildRealIndex(TEXT);
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index: index2, allEffects: [effectA, effectB] });
    return { index: index2, state, effectA, effectB };
  }

  it("SETUP CHECK: computeOperativeContractState genuinely reports OPERATIVE_STATE_CONFLICTED with currentText withheld and two real candidateTexts", () => {
    const { state } = buildState();
    expect(state.provisions).toHaveLength(1);
    const view = state.provisions[0]!;
    expect(view.kind).toBe("DEFINITION");
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(view.currentText).toBeNull();
    expect(view.candidateTexts).toHaveLength(2);
    expect(view.unresolvedIssues.join(" ")).toMatch(/conflict/i);
  });

  it("CONTROL (exact canonical term, single space): getDefinition correctly discloses CONFLICTED and never serves either candidate text as settled fact", () => {
    const { index, state } = buildState();
    const access = accessFor(index, state);
    const tool = getDefinitionTool(access);
    const outcome = tool.execute({ term: "Consolidated EBITDA" });
    const result = outcome.result as { status: string; text: string; unresolvedIssues: string[] };
    expect(outcome.ok).toBe(true);
    expect(result.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(result.text).not.toContain("$5,000,000");
    expect(result.text).not.toContain("$9,000,000");
    expect(result.text).not.toContain("$12,000,000");
    expect(result.unresolvedIssues.join(" ")).toMatch(/conflict/i);
  });

  it("ADVERSARIAL (doubled internal space in the query term): getDefinition silently falls back to the RAW STALE base-document text, reporting OPERATIVE_STATE_RESOLVED and disclosing NOTHING about the real CONFLICTED amendment state - the exact FINDING-2 defect pattern, reproduced via a realistic query-term variant", () => {
    const { index, state } = buildState();
    const access = accessFor(index, state);
    const tool = getDefinitionTool(access);
    // "Consolidated  EBITDA" - note the doubled space between words. The
    // term's OWN canonical spelling is exactly this with a single space;
    // this is not a different term, only a whitespace variant of the same
    // one, of the kind an LLM tool-caller can very plausibly reproduce
    // from real (often OCR'd or line-wrapped) contract source text.
    const outcome = tool.execute({ term: "Consolidated  EBITDA" });
    const result = outcome.result as { status: string; text: string; source: string; unresolvedIssues?: string[] };
    expect(outcome.ok).toBe(true);
    // THE FALSIFICATION: status is reported as settled/resolved...
    expect(result.status).toBe("OPERATIVE_STATE_RESOLVED");
    // ...serving the STALE, pre-amendment $5,000,000 figure...
    expect(result.text).toContain("$5,000,000");
    // ...as though it were base-document, never-amended, confidently
    // current text - while the term in fact has a real, on-file CONFLICTED
    // amendment record with two live $9,000,000/$12,000,000 candidates that
    // this response discloses NOTHING about.
    expect(result.source).toBe("base-document");
    expect(result.text).not.toMatch(/conflict/i);
  });
});

describe("FINDING-2/3 independent recertification - PARTIAL definition (applied effect, no capturable text) + whitespace-variant query", () => {
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Permitted Basket Amount" means $2,000,000.

ARTICLE VI COVENANTS

Section 6.02 Investments . The Borrower shall not make Investments in excess of the Permitted Basket Amount.
`.trim();

  function buildState() {
    const { index } = buildRealIndex(TEXT);
    const effect = baseEffect({
      effectId: "eff-partial-A",
      amendmentDocumentId: "amendment-doc-C",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Permitted Basket Amount"),
      operation: "MODIFY_THRESHOLD",
      // A real, resolved, dated effect that genuinely governs, but the
      // amendment's own source text supplied no capturable replacement
      // wording (e.g. a bare "the definition of 'Permitted Basket Amount'
      // is hereby amended" cross-reference to a schedule) - buildProvisionView's
      // own textMissingDespiteAppliedEffect rule.
      newText: null,
      effectiveDate: DATED("2021-03-01"),
      sourceCitation: "amendment-doc-C::Section 3",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: [effect] });
    return { index, state };
  }

  it("SETUP CHECK: computeOperativeContractState genuinely reports OPERATIVE_STATE_PARTIAL (target resolved UNIQUE, but no confident current text)", () => {
    const { state } = buildState();
    expect(state.provisions).toHaveLength(1);
    const view = state.provisions[0]!;
    expect(view.targetResolutionStatus).toBe("UNIQUE");
    expect(view.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(view.currentText).toBeNull();
  });

  it("CONTROL (exact canonical term): getDefinition correctly discloses PARTIAL, never re-serves the stale $2,000,000 figure as current", () => {
    const { index, state } = buildState();
    const tool = getDefinitionTool(accessFor(index, state));
    const outcome = tool.execute({ term: "Permitted Basket Amount" });
    const result = outcome.result as { status: string; text: string };
    expect(result.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(result.text).not.toContain("$2,000,000");
  });

  it("ADVERSARIAL (tab character inside the query term): getDefinition again falls back to the RAW STALE $2,000,000 base text with OPERATIVE_STATE_RESOLVED, hiding the real, on-file PARTIAL amendment", () => {
    const { index, state } = buildState();
    const tool = getDefinitionTool(accessFor(index, state));
    const outcome = tool.execute({ term: "Permitted\tBasket Amount" });
    const result = outcome.result as { status: string; text: string };
    expect(result.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(result.text).toContain("$2,000,000");
  });
});

describe("FINDING-2/3 independent recertification - divergence check: getOperativeProvision's own whitespace discipline is NOT shared by getDefinition", () => {
  const TEXT = `
ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.50 to 1.00.

ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated Net Income" means net income determined in accordance with GAAP, not to exceed $3,000,000 in the aggregate.
`.trim();

  it("getOperativeProvision (SECTION) tolerates irregular internal whitespace in the queried reference (\"6 . 01\") and still discloses the real amended status - getDefinition (DEFINITION) does NOT tolerate the analogous irregular internal whitespace in a term name and silently loses the disclosure instead", () => {
    const { index } = buildRealIndex(TEXT);
    const sectionEffect = baseEffect({
      effectId: "eff-section-conflict-A",
      amendmentDocumentId: "amendment-doc-D",
      target: sectionTarget(DOC_ID, INSTRUMENT, "6.01"),
      newText: "Section 6.01 Leverage Ratio . The Borrower shall not permit the Consolidated Leverage Ratio to exceed 4.00 to 1.00.",
      effectiveDate: DATED("2021-06-01"),
      sourceCitation: "amendment-doc-D::Section 2",
    });
    const sectionEffect2 = baseEffect({
      effectId: "eff-section-conflict-B",
      amendmentDocumentId: "amendment-doc-E",
      target: sectionTarget(DOC_ID, INSTRUMENT, "6.01"),
      newText: "Section 6.01 Leverage Ratio . The Borrower shall not permit the Consolidated Leverage Ratio to exceed 4.50 to 1.00.",
      effectiveDate: DATED("2021-06-01"), // same date -> real AMENDMENT_CONFLICT
      sourceCitation: "amendment-doc-E::Section 2",
    });
    const definitionEffectA = baseEffect({
      effectId: "eff-def-conflict-A",
      amendmentDocumentId: "amendment-doc-D",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Consolidated Net Income"),
      newText: `"Consolidated Net Income" means net income determined in accordance with GAAP, not to exceed $7,000,000 in the aggregate.`,
      effectiveDate: DATED("2021-06-01"),
      sourceCitation: "amendment-doc-D::Section 3",
    });
    const definitionEffectB = baseEffect({
      effectId: "eff-def-conflict-B",
      amendmentDocumentId: "amendment-doc-E",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Consolidated Net Income"),
      newText: `"Consolidated Net Income" means net income determined in accordance with GAAP, not to exceed $8,500,000 in the aggregate.`,
      effectiveDate: DATED("2021-06-01"), // same date -> real AMENDMENT_CONFLICT
      sourceCitation: "amendment-doc-E::Section 3",
    });

    const state = computeOperativeContractState({
      instrumentKey: INSTRUMENT,
      baseDocumentId: DOC_ID,
      asOfDate: "2022-01-01",
      index,
      allEffects: [sectionEffect, sectionEffect2, definitionEffectA, definitionEffectB],
    });

    const sectionView = state.provisions.find((p) => p.kind === "SECTION")!;
    const definitionView = state.provisions.find((p) => p.kind === "DEFINITION")!;
    expect(sectionView.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(definitionView.status).toBe("OPERATIVE_STATE_CONFLICTED");

    const access = accessFor(index, state);

    // SECTION side: query with irregular internal whitespace/punctuation
    // spacing around the reference - getOperativeProvision's own
    // findProvisionView comparison strips ALL whitespace on both sides
    // (`.replace(/\s+/g, "")`), so this still matches the stored
    // OperativeProvisionView and the real CONFLICTED status IS disclosed.
    const opProvOutcome = getOperativeProvisionTool(access).execute({ sectionRef: "6 . 01" });
    const opProvResult = opProvOutcome.result as { status: string; currentText: string };
    expect(opProvResult.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(opProvResult.currentText).toBe("(no current text recorded)");
    expect(opProvResult.currentText).not.toContain("3.50 to 1.00");

    // DEFINITION side: the analogous irregular-whitespace query (a doubled
    // space) for a term with the EXACT SAME real amendment shape
    // (CONFLICTED, two same-date competing effects) FAILS to match and
    // silently falls back to the raw, stale, pre-amendment $3,000,000
    // figure with a confident OPERATIVE_STATE_RESOLVED - the disclosure
    // getOperativeProvision reliably provides one line above is silently
    // lost for getDefinition given the equivalent adversarial input.
    const getDefOutcome = getDefinitionTool(access).execute({ term: "Consolidated  Net Income" });
    const getDefResult = getDefOutcome.result as { status: string; text: string };
    expect(getDefResult.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(getDefResult.text).toContain("$3,000,000");
  });
});

describe("FINDING-2/3 independent recertification - positive controls (the fix genuinely works for these fresh, non-adversarial scenarios)", () => {
  it("chained/superseding amendments (3 sequential REPLACE_DEFINITION effects): getDefinition serves exactly the LATEST applied text, with status disclosed, when queried with the canonical term", () => {
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Applicable Margin" means 2.00% per annum.
`.trim();
    const { index } = buildRealIndex(TEXT);
    const effects: AmendmentEffectCandidate[] = [
      baseEffect({ effectId: "eff-chain-1", amendmentDocumentId: "amendment-2019", target: definitionTarget(DOC_ID, INSTRUMENT, "Applicable Margin"), newText: `"Applicable Margin" means 2.25% per annum.`, effectiveDate: DATED("2019-01-01"), sourceCitation: "amendment-2019::Section 2" }),
      baseEffect({ effectId: "eff-chain-2", amendmentDocumentId: "amendment-2020", target: definitionTarget(DOC_ID, INSTRUMENT, "Applicable Margin"), newText: `"Applicable Margin" means 2.75% per annum.`, effectiveDate: DATED("2020-01-01"), sourceCitation: "amendment-2020::Section 2" }),
      baseEffect({ effectId: "eff-chain-3", amendmentDocumentId: "amendment-2021", target: definitionTarget(DOC_ID, INSTRUMENT, "Applicable Margin"), newText: `"Applicable Margin" means 3.00% per annum.`, effectiveDate: DATED("2021-01-01"), sourceCitation: "amendment-2021::Section 2" }),
    ];
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: effects });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions[0]!.currentText).toContain("3.00%");

    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Applicable Margin" });
    const result = outcome.result as { status: string; text: string };
    expect(result.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(result.text).toContain("3.00%");
    expect(result.text).not.toContain("2.00%");
    expect(result.text).not.toContain("2.25%");
    expect(result.text).not.toContain("2.75%");
  });

  it("AMBIGUOUS never-amended base-document collision (2 colliding physical definitions, no amendment activity, exact term query): getDefinition refuses rather than guesses", () => {
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Material Adverse Effect" means an event materially adverse to the Borrower's business, not to exceed $1,000,000 in scope for indemnification purposes.

Schedule A - Restated Definitions Appendix

Section A.01 . For purposes of this Schedule only, "Material Adverse Effect" means an event materially adverse to the Guarantor's business, not to exceed $1,500,000 in scope for indemnification purposes.
`.trim();
    const { index } = buildRealIndex(TEXT);
    const outcome = getDefinitionTool(accessFor(index, null)).execute({ term: "Material Adverse Effect" });
    expect(outcome.ok).toBe(false);
    expect((outcome.result as { error: string }).error).toMatch(/distinct .*definitions|matches.*definitions/i);
  });
});
