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
 *
 * STATUS (Phase 3F.1.6-terminal Part A, OPEN-2 remediation): FIXED. The
 * "ADVERSARIAL"-labeled tests below have been updated in place to assert
 * the CORRECT, fixed behavior (they used to assert the bug's own effects,
 * as documentation of the reproduction for the auditor who wrote this
 * file) - see docs/phase-3f1-terminal-architecture-decision/
 * 04-definition-operative-fix.json for the full writeup. New describe
 * blocks were appended below (never removed/renamed the original fixtures
 * or SETUP CHECK/CONTROL tests) covering: an AMBIGUOUS DEFINITION
 * amendment, a definition superseded via its own enclosing structural node
 * (never individually amended), an explicit no-operative-state-at-all
 * positive path, historical (NOT_FOUND-target) retrieval correctly labeled
 * historical rather than current, and an end-to-end proof that a
 * downstream compiler/verification path cannot mark VERIFIED/current-truth
 * off an unresolved definition alone even when the model itself
 * misreports sufficiency.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import type { SemanticCompilationResult, SemanticToolAccess } from "../../lib/contract-model/compiler/semantic/types";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";
import { emptyContextBundle, testCompilerInput } from "../contract-model/semantic-compiler/test-helpers";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";

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

  it("FIXED (doubled internal space in the query term): getDefinition no longer falls back to the raw stale base-document text - it correctly discloses OPERATIVE_STATE_CONFLICTED for a realistic whitespace-variant query, exactly as it already does for the canonical spelling", () => {
    const { index, state } = buildState();
    const access = accessFor(index, state);
    const tool = getDefinitionTool(access);
    // "Consolidated  EBITDA" - note the doubled space between words. The
    // term's OWN canonical spelling is exactly this with a single space;
    // this is not a different term, only a whitespace variant of the same
    // one, of the kind an LLM tool-caller can very plausibly reproduce
    // from real (often OCR'd or line-wrapped) contract source text.
    const outcome = tool.execute({ term: "Consolidated  EBITDA" });
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; text: string; source: string; unresolvedIssues?: string[] };
    expect(outcome.ok).toBe(true);
    // THE FIX: status is now correctly reported as CONFLICTED, identically
    // to the canonical-spelling CONTROL test above - the whitespace variant
    // no longer bypasses the real, on-file amendment conflict.
    expect(result.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(result.evidenceStatus).toBe("OPERATIVE_STATE_UNRESOLVED");
    expect(result.isCurrentTruth).toBe(false);
    // ...never serving either stale/candidate figure as settled fact...
    expect(result.text).not.toContain("$5,000,000");
    expect(result.text).not.toContain("$9,000,000");
    expect(result.text).not.toContain("$12,000,000");
    expect(result.source).toBe("amended");
    expect((result.unresolvedIssues ?? []).join(" ")).toMatch(/conflict/i);
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

  it("CONTROL (exact canonical term): getDefinition correctly discloses PARTIAL_AMENDMENT, never re-serves the stale $2,000,000 figure as current", () => {
    const { index, state } = buildState();
    const tool = getDefinitionTool(accessFor(index, state));
    const outcome = tool.execute({ term: "Permitted Basket Amount" });
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; text: string };
    expect(result.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(result.evidenceStatus).toBe("PARTIAL_AMENDMENT");
    expect(result.isCurrentTruth).toBe(false);
    expect(result.text).not.toContain("$2,000,000");
  });

  it("FIXED (tab character inside the query term): getDefinition no longer falls back to the raw stale $2,000,000 base text - it correctly discloses OPERATIVE_STATE_PARTIAL for a realistic whitespace-variant query, exactly as it already does for the canonical spelling", () => {
    const { index, state } = buildState();
    const tool = getDefinitionTool(accessFor(index, state));
    const outcome = tool.execute({ term: "Permitted\tBasket Amount" });
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; text: string };
    expect(result.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(result.evidenceStatus).toBe("PARTIAL_AMENDMENT");
    expect(result.isCurrentTruth).toBe(false);
    expect(result.text).not.toContain("$2,000,000");
  });
});

describe("FINDING-2/3 independent recertification - divergence check: getOperativeProvision's own whitespace discipline is NOT shared by getDefinition", () => {
  const TEXT = `
ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.50 to 1.00.

ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated Net Income" means net income determined in accordance with GAAP, not to exceed $3,000,000 in the aggregate.
`.trim();

  it("FIXED: getOperativeProvision (SECTION) tolerates irregular internal whitespace in the queried reference (\"6 . 01\") and discloses the real amended status - getDefinition (DEFINITION) now shows the SAME tolerance for the analogous irregular internal whitespace in a term name, closing the divergence", () => {
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
    // (CONFLICTED, two same-date competing effects) now ALSO correctly
    // discloses OPERATIVE_STATE_CONFLICTED - getDefinition's own term
    // lookup (getOperativeDefinition, via resolveOperativeDefinitionEvidence)
    // normalizes internal whitespace exactly like getOperativeProvision's
    // own comparison does, so the disclosure is no longer lost for this
    // equivalent adversarial input.
    const getDefOutcome = getDefinitionTool(access).execute({ term: "Consolidated  Net Income" });
    const getDefResult = getDefOutcome.result as { status: string; text: string };
    expect(getDefResult.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(getDefResult.text).not.toContain("$3,000,000");
    expect(getDefResult.text).not.toContain("$7,000,000");
    expect(getDefResult.text).not.toContain("$8,500,000");
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

  it("no-operative-state case: with an amendment pipeline that found NOTHING for this instrument at all (operativeState null, never merely empty), a unique never-amended term still resolves confidently CURRENT", () => {
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Fixed Charge Coverage Ratio" means the ratio of EBITDA to Fixed Charges for the applicable period.
`.trim();
    const { index } = buildRealIndex(TEXT);
    const outcome = getDefinitionTool(accessFor(index, null)).execute({ term: "Fixed Charge Coverage Ratio" });
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; source: string; text: string };
    expect(outcome.ok).toBe(true);
    expect(result.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(result.evidenceStatus).toBe("CURRENT");
    expect(result.isCurrentTruth).toBe(true);
    expect(result.source).toBe("base-document");
    expect(result.text).toContain("EBITDA to Fixed Charges");
  });
});

describe("FINDING-2/3 independent recertification - new required scenarios (Phase 3F.1.6-terminal Part A, OPEN-2)", () => {
  it("AMBIGUOUS amendment (a real, on-file amendment effect targets a term that itself collides across 2 physical base-document definitions): getDefinition discloses AMBIGUOUS_TARGET and withholds every candidate figure, mirroring getOperativeProvision's own established 'always disclose once a view exists' discipline rather than refusing outright", () => {
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Total Debt" means all Indebtedness of the Borrower, not to exceed $20,000,000 in the aggregate.

Schedule A - Restated Definitions Appendix

Section A.01 . For purposes of this Schedule only, "Total Debt" means all Indebtedness of the Guarantor, not to exceed $25,000,000 in the aggregate.
`.trim();
    const { index } = buildRealIndex(TEXT);
    const effect = baseEffect({
      effectId: "eff-ambiguous-amendment",
      amendmentDocumentId: "amendment-doc-ambig",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Total Debt"),
      newText: `"Total Debt" means all Indebtedness, not to exceed $40,000,000 in the aggregate.`,
      effectiveDate: DATED("2021-06-01"),
      sourceCitation: "amendment-doc-ambig::Section 2",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: [effect] });
    const view = state.provisions.find((p) => p.kind === "DEFINITION")!;
    // SETUP CHECK: this is a real, on-file AMBIGUOUS target resolution -
    // the amendment genuinely exists, but WHICH of the 2 colliding physical
    // definitions it amends cannot be determined from the evidence alone.
    expect(view.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(view.candidateSourceNodeIds).toHaveLength(2);

    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Total Debt" });
    // A real OperativeProvisionView exists for this term (a real amendment
    // was recorded, even though it could not be uniquely attached) - this
    // is disclosed, not refused, exactly like getOperativeProvision's own
    // established behavior once a view exists for a section (see the
    // sibling test in part-b-recert-blocker2-6-tools-adversarial.test.ts).
    // A refusal only ever happens for the SEPARATE "no view at all" fallback
    // case (see the positive-control AMBIGUOUS-never-amended test above).
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; text: string; unresolvedIssues: string[] };
    expect(result.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(result.evidenceStatus).toBe("AMBIGUOUS_TARGET");
    expect(result.isCurrentTruth).toBe(false);
    expect(result.text).toBe("(no current text recorded)");
    expect(result.unresolvedIssues.join(" ")).toMatch(/ambiguous|distinct/i);
  });

  it("superseded definition (never individually amended itself, but its own enclosing structural node was independently superseded by a whole-section REPLACE_TEXT amendment): getDefinition labels it KNOWN_SUPERSEDED, never CURRENT", () => {
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Permitted Liens" means Liens described on Schedule 1.01, not to exceed $20,000,000 in the aggregate.

ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.50 to 1.00.
`.trim();
    const { index } = buildRealIndex(TEXT);
    // A SECTION-kind amendment that entirely restates Section 1.01 (the
    // Definitions section itself) - "Permitted Liens" is never targeted
    // individually by any DEFINITION-kind effect, so access.operativeState
    // carries no DEFINITION-kind OperativeProvisionView for this term at
    // all; getDefinition must resolve it via the base-document fallback.
    const sectionEffect = baseEffect({
      effectId: "eff-section-restate",
      amendmentDocumentId: "amendment-doc-restate",
      target: sectionTarget(DOC_ID, INSTRUMENT, "1.01"),
      operation: "REPLACE_TEXT",
      newText: `Section 1.01 Definitions . As used in this Agreement, "Permitted Liens" means Liens described on Schedule 1.01, not to exceed $30,000,000 in the aggregate.`,
      effectiveDate: DATED("2021-01-01"),
      sourceCitation: "amendment-doc-restate::Section 2",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: [sectionEffect] });
    const sectionView = state.provisions.find((p) => p.kind === "SECTION")!;
    // SETUP CHECK: the SECTION provision applied cleanly (unique target, no
    // conflict) and recorded its own ORIGINAL base node as superseded -
    // this is the real NodeSupersessionIndex evidence getDefinition's own
    // base-document fallback must now consult for "Permitted Liens," since
    // that term's own enclosing structural node IS that same original node.
    expect(sectionView.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(sectionView.supersededSourceNodeIds.length).toBeGreaterThan(0);
    expect(state.provisions.some((p) => p.kind === "DEFINITION")).toBe(false);

    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Permitted Liens" });
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; source: string; text: string; unresolvedIssues: string[] };
    expect(outcome.ok).toBe(true);
    expect(result.evidenceStatus).toBe("KNOWN_SUPERSEDED");
    expect(result.isCurrentTruth).toBe(false);
    // The raw, now-superseded base text may still be returned for context,
    // but it is never labeled current - evidenceStatus/isCurrentTruth above
    // are the load-bearing signals a caller must check.
    expect(result.text).toContain("$20,000,000");
    expect(result.unresolvedIssues.join(" ")).toMatch(/superseded/i);
  });

  it("historical retrieval correctly labeled as historical, never as current (a real amendment references a term whose own base-document target could not be confirmed to exist at all - targetResolutionStatus NOT_FOUND)", () => {
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated EBITDA" means, for any period, an amount equal to Consolidated Net Income for such period.
`.trim();
    const { index } = buildRealIndex(TEXT);
    // "Excluded Contributions" is never defined anywhere in the base
    // document - operation is deliberately NOT ADD_DEFINITION (which
    // buildProvisionView treats as the expected "this is a brand-new term"
    // case), so this is a real, disclosable NOT_FOUND target.
    const effect = baseEffect({
      effectId: "eff-not-found-target",
      amendmentDocumentId: "amendment-doc-nf",
      operation: "MODIFY_DEFINITION",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Excluded Contributions"),
      newText: `"Excluded Contributions" means contributions to capital not otherwise includable in the Available Amount, in an amount not to exceed $5,000,000.`,
      effectiveDate: DATED("2021-01-01"),
      sourceCitation: "amendment-doc-nf::Section 4",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: [effect] });
    const view = state.provisions.find((p) => p.kind === "DEFINITION")!;
    expect(view.targetResolutionStatus).toBe("NOT_FOUND");
    expect(view.currentText).toBeNull();
    expect(view.attemptedText).toContain("$5,000,000");

    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Excluded Contributions" });
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; source: string; text: string };
    expect(outcome.ok).toBe(true);
    // Labeled explicitly historical/unconfirmed - the amendment's own
    // claimed text IS surfaced for context (never silently discarded), but
    // isCurrentTruth is unambiguously false and evidenceStatus never says
    // CURRENT or RESOLVED.
    expect(result.evidenceStatus).toBe("HISTORICAL_ONLY");
    expect(result.isCurrentTruth).toBe(false);
    expect(result.evidenceStatus).not.toBe("CURRENT");
    expect(result.text).toContain("$5,000,000");
  });
});

describe("FINDING-2/3 independent recertification - end-to-end: an unresolved definition can never become trusted current truth downstream, even when the model itself misreports sufficiency", () => {
  function fakeMessage(content: Anthropic.ContentBlock[]): Anthropic.Message {
    return {
      id: "msg_test",
      container: null,
      content,
      model: "claude-sonnet-5",
      role: "assistant",
      stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
      stop_sequence: null,
      type: "message",
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null } as Anthropic.Usage,
    } as Anthropic.Message;
  }
  function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
    return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
  }
  function scriptedClient(script: Anthropic.Message[]): MinimalAnthropicClient {
    let i = 0;
    return { messages: { stream: (_params: unknown) => ({ finalMessage: async () => { const msg = script[Math.min(i, script.length - 1)]!; i++; return msg; } }) } } as MinimalAnthropicClient;
  }

  it("compile.ts: a model that dishonestly reports sufficiency COMPLETE for a term getDefinition itself disclosed as CONFLICTED is deterministically kept off COMPLETED status anyway (never relying on the model's own self-report alone)", async () => {
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Permitted Debt Amount" means Indebtedness not to exceed $6,000,000 in the aggregate.
`.trim();
    const { index } = buildRealIndex(TEXT);
    const effectA = baseEffect({ effectId: "eff-e2e-A", amendmentDocumentId: "amendment-e2e-A", target: definitionTarget(DOC_ID, INSTRUMENT, "Permitted Debt Amount"), newText: `"Permitted Debt Amount" means Indebtedness not to exceed $9,000,000 in the aggregate.`, effectiveDate: DATED("2021-06-01"), sourceCitation: "amendment-e2e-A::Section 2" });
    const effectB = baseEffect({ effectId: "eff-e2e-B", amendmentDocumentId: "amendment-e2e-B", target: definitionTarget(DOC_ID, INSTRUMENT, "Permitted Debt Amount"), newText: `"Permitted Debt Amount" means Indebtedness not to exceed $11,000,000 in the aggregate.`, effectiveDate: DATED("2021-06-01"), sourceCitation: "amendment-e2e-B::Section 2" });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_CONFLICTED");

    const access: SemanticToolAccess = { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [effectA, effectB], contextBundle: emptyContextBundle() };
    const input = testCompilerInput({ toolAccess: access, sourceDocumentId: DOC_ID, instrumentKey: INSTRUMENT, sourceSectionRef: null, candidateRef: "e2e-candidate-1" });

    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "getDefinition", { term: "Permitted Debt Amount" })]),
      fakeMessage([
        toolUseBlock("t2", "submit_compilation", {
          rules: [],
          definitions: [{ localRef: "d1", termName: "Permitted Debt Amount", sufficiency: "COMPLETE", sufficiencyReasons: ["(adversarial: model ignored the disclosed conflict)"] }],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(input, { caller, cache: new InMemorySemanticCompilationCache() });

    // The model's own dishonest self-report survives untouched (this fix
    // never rewrites IR content)...
    expect(result.definitions[0]!.sufficiency).toBe("COMPLETE");
    // ...but the ATTEMPT-level status can no longer be COMPLETED merely
    // because of that self-report: the real toolCallLog shows getDefinition
    // itself flagged this evidence unresolved, and compile.ts now
    // deterministically forces at least REVIEW_REQUIRED off that fact
    // alone.
    expect(result.toolCallLog.some((e) => e.toolName === "getDefinition" && e.evidenceUnresolved === true)).toBe(true);
    expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).not.toBe("COMPLETED");
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("semantic-verification/verify.ts: a compiled candidate whose own toolCallLog shows an unresolved getDefinition call can never be marked VERIFIED_NO_MATERIAL_GAP_FOUND/VERIFIED_WITH_NON_MATERIAL_FINDINGS, even with zero reconciliation findings", async () => {
    const compilerInput = testCompilerInput({ sourceSectionRef: null, candidateRef: "e2e-candidate-verify-1" });
    const compilationResult: SemanticCompilationResult = {
      status: "REVIEW_REQUIRED",
      failureReasons: ["OPERATIVE_STATE_UNRESOLVED"],
      errorDetail: null,
      rules: [],
      definitions: [],
      sharedCapacities: [],
      irExtensionCandidates: [],
      unresolvedIssues: [],
      toolCallLog: [{ toolName: "getDefinition", input: { term: "Some Term" }, outputSummary: "definition \"Some Term\" (status OPERATIVE_STATE_CONFLICTED, evidence OPERATIVE_STATE_UNRESOLVED)", charsReturned: 40, timestamp: new Date().toISOString(), evidenceUnresolved: true }],
      rawModelOutput: null,
      provider: "test",
      model: "test-model",
      telemetry: null,
      cacheKey: "test-cache-key",
      compiledAt: new Date().toISOString(),
    };

    const result = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });

    expect(result.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(result.status).not.toBe("VERIFIED_WITH_NON_MATERIAL_FINDINGS");
    expect(result.status).toBe("REVIEW_REQUIRED");
  });
});
