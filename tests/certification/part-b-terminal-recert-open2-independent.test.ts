/**
 * Phase 3F.1-terminal Architecture Decision - Part B INDEPENDENT
 * recertification of OPEN-2 (getDefinition stale/ambiguous amendment
 * safety). Written FRESH by an independent auditor to try to FALSIFY Part
 * A's claimed fix (docs/phase-3f1-terminal-architecture-decision/
 * 04-definition-operative-fix.json): findProvisionView's whitespace
 * normalization, the canonical resolveOperativeDefinitionEvidence
 * primitive (amendment/operative-state.ts), ToolCallLogEntry.
 * evidenceUnresolved, and compile.ts/verify.ts forcing REVIEW_REQUIRED on
 * unresolved definitions.
 *
 * This file shares no fixture code with tests/certification/
 * part-b-recert-finding2-3-independent.test.ts (Part A's own required
 * test) or its ancestors - every scenario here is a fresh adversarial
 * construction. All scenarios exercise the REAL production pipeline
 * (parseDocumentStructure -> detectStructuralDefinitions ->
 * buildStructuralIndex -> computeOperativeContractState -> buildToolSet's
 * real getDefinition.execute(), and for the critical finding, the REAL
 * RealSemanticCaller tool-use loop -> compileCovenantToIR ->
 * verifyCompiledCandidate). No DB access anywhere in this file (every
 * function under test is a pure function over in-memory StructuralIndex/
 * AmendmentEffectCandidate[]/CovenantContextBundle) - no Postgres rows are
 * created, no test company id is needed.
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
import type { ContextItem, CovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/types";
import { emptyContextBundle, testCompilerInput } from "../contract-model/semantic-compiler/test-helpers";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";

const DOC_ID = "part-b-open2-indep-doc";
const INSTRUMENT = "instrument:part-b-open2-indep";

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

function buildRealIndex(text: string) {
  const nodes = parseDocumentStructure({ documentId: DOC_ID, label: DOC_ID, text });
  const definitions = detectStructuralDefinitions(DOC_ID, text, nodes);
  const index = buildStructuralIndex(new Map([[DOC_ID, { text, nodes }]]), definitions, []);
  return { index, nodes, definitions };
}

function accessFor(index: ReturnType<typeof buildRealIndex>["index"], operativeState: ReturnType<typeof computeOperativeContractState> | null, allEffects: AmendmentEffectCandidate[] | null = null, contextBundle?: CovenantContextBundle): SemanticToolAccess {
  return { structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: allEffects, contextBundle: contextBundle ?? emptyContextBundle() };
}

function getDefinitionTool(access: SemanticToolAccess) {
  const tools = buildToolSet(access, DOC_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
  const tool = tools.find((t) => t.name === "getDefinition");
  if (!tool) throw new Error("getDefinition tool not registered");
  return tool;
}

// ---------------------------------------------------------------------------
// Group 1: fresh whitespace-irregularity adversarial queries (unicode
// whitespace, NBSP, mixed tabs/newlines) - none of these exact byte
// sequences appear in Part A's own required test file.
// ---------------------------------------------------------------------------
describe("OPEN-2 independent recert - unicode/exotic whitespace query variants against a real CONFLICTED definition", () => {
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Adjusted Total Leverage" means, for any period, the ratio described in the definition of Consolidated Leverage Ratio, not to exceed 4,000,000 in the aggregate.

ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit the Adjusted Total Leverage to exceed 3.50 to 1.00.
`.trim();

  function buildState() {
    const { index } = buildRealIndex(TEXT);
    const effectA = baseEffect({
      effectId: "eff-uc-A",
      amendmentDocumentId: "amendment-doc-uc-A",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Adjusted Total Leverage"),
      newText: `"Adjusted Total Leverage" means the ratio not to exceed 6,000,000 (as amended, version A).`,
      effectiveDate: DATED("2021-06-01"),
      sourceCitation: "amendment-doc-uc-A::Section 2",
    });
    const effectB = baseEffect({
      effectId: "eff-uc-B",
      amendmentDocumentId: "amendment-doc-uc-B",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Adjusted Total Leverage"),
      newText: `"Adjusted Total Leverage" means the ratio not to exceed 7,500,000 (as amended, version B, same effective date).`,
      effectiveDate: DATED("2021-06-01"), // same date as effectA -> real AMENDMENT_CONFLICT
      sourceCitation: "amendment-doc-uc-B::Section 2",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    return { index, state };
  }

  it("SETUP CHECK: the fixture genuinely produces OPERATIVE_STATE_CONFLICTED", () => {
    const { state } = buildState();
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_CONFLICTED");
  });

  const variants: Array<{ label: string; term: string }> = [
    { label: "non-breaking space (U+00A0) between words", term: "Adjusted Total Leverage" },
    { label: "ideographic space (U+3000) between words", term: "Adjusted　Total Leverage" },
    { label: "en space (U+2002) + em space (U+2003) mixed", term: "Adjusted Total Leverage" },
    { label: "mixed tabs and doubled spaces and a stray leading/trailing newline", term: "\nAdjusted\t\tTotal  Leverage\n" },
    { label: "carriage-return + linefeed line-wrap remnant mid-term", term: "Adjusted\r\nTotal Leverage" },
    { label: "narrow no-break space (U+202F)", term: "Adjusted Total Leverage" },
  ];

  for (const { label, term } of variants) {
    it(`FRESH ADVERSARIAL (${label}): getDefinition still discloses the real CONFLICTED status, never falling back to stale/base text`, () => {
      const { index, state } = buildState();
      const outcome = getDefinitionTool(accessFor(index, state)).execute({ term });
      expect(outcome.ok).toBe(true);
      const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; text: string };
      expect(result.status).toBe("OPERATIVE_STATE_CONFLICTED");
      expect(result.evidenceStatus).toBe("OPERATIVE_STATE_UNRESOLVED");
      expect(result.isCurrentTruth).toBe(false);
      expect(result.text).not.toContain("4,000,000");
      expect(result.text).not.toContain("6,000,000");
      expect(result.text).not.toContain("7,500,000");
    });
  }

  it("DOCUMENTED, NON-BLOCKING BEHAVIOR: a zero-width space (U+200B, not part of JS's \\s class) embedded in the query term is NOT collapsed by normalizeDefinedTermRef and therefore fails to match the stored view - but this fails SAFE (NOT_FOUND / refused), never a false CURRENT/stale disclosure, so it is not a defect of this fix's own safety property even though it is a residual matching gap", () => {
    const { index, state } = buildState();
    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Adjusted​Total Leverage" });
    // Not falsified: either refused outright (base-document fallback found
    // no match either, since the same term without the ZWSP is unique) or -
    // if ever changed to match - it must still disclose the real CONFLICTED
    // status, never silently report CURRENT/RESOLVED off stale text. Both
    // outcomes are asserted as mutually exhaustive safe possibilities so
    // this test would fail loudly if a future change made this silently
    // unsafe.
    if (outcome.ok) {
      const result = outcome.result as { status: string; isCurrentTruth: boolean; text: string };
      expect(result.text).not.toContain("4,000,000");
      if (result.isCurrentTruth) {
        throw new Error("SAFETY VIOLATION: a zero-width-space query term was reported isCurrentTruth:true - this must never happen for a term with a real, on-file CONFLICTED amendment");
      }
    } else {
      expect((outcome.result as { error: string }).error).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Group 2: casing/pluralization variant queries.
// ---------------------------------------------------------------------------
describe("OPEN-2 independent recert - casing and pluralization variant queries", () => {
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Permitted Investment" means any Investment permitted under Section 6.05, not to exceed $10,000,000 in the aggregate.
`.trim();

  function buildState() {
    const { index } = buildRealIndex(TEXT);
    const effect = baseEffect({
      effectId: "eff-case-A",
      amendmentDocumentId: "amendment-doc-case",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Permitted Investment"),
      operation: "MODIFY_THRESHOLD",
      newText: null, // real, resolved, dated effect with no capturable text -> PARTIAL
      effectiveDate: DATED("2021-04-01"),
      sourceCitation: "amendment-doc-case::Section 5",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: [effect] });
    return { index, state };
  }

  it("ALL-CAPS casing variant of a PARTIAL-amendment term still resolves to the real PARTIAL_AMENDMENT status (case-insensitivity works, per normalizeDefinedTermRef's own toLowerCase())", () => {
    const { index, state } = buildState();
    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "PERMITTED INVESTMENT" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; text: string };
    expect(result.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(result.evidenceStatus).toBe("PARTIAL_AMENDMENT");
    expect(result.isCurrentTruth).toBe(false);
    expect(result.text).not.toContain("$10,000,000");
  });

  it("PLURALIZATION variant ('Permitted Investments', which the base document never separately defines) correctly fails to resolve at all, rather than silently matching the singular's real amendment history and either falsely serving it as unresolved-for-a-different-term or masking it with an unrelated NOT_FOUND that a caller could misread as 'safe to assume never amended'", () => {
    const { index, state } = buildState();
    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Permitted Investments" });
    // Fails SAFE: refused as NOT_FOUND, never silently serves the singular
    // term's own PARTIAL/CONFLICTED evidence under the plural's name, and
    // never fabricates a CURRENT answer for a term string that does not
    // itself exist in the base document.
    expect(outcome.ok).toBe(false);
    const err = (outcome.result as { error: string }).error;
    expect(err).toMatch(/no defined term matching/i);
  });
});

// ---------------------------------------------------------------------------
// Group 3: a chained, multi-amendment scenario where an EARLIER link in a
// definition's own amendment chain is later superseded by a subsequent
// amendment, interleaved with an unrelated whole-section restatement of
// the SAME definition's enclosing structural node - proving currentText
// always reflects the true LATEST applied effect (never an intermediate,
// already-superseded one) and that the later, unrelated section-level
// restatement of the enclosing node does not corrupt an actively-amended
// definition's own status.
// ---------------------------------------------------------------------------
describe("OPEN-2 independent recert - chained multi-amendment where an intermediate link is itself effectively superseded by a later link, plus an interleaved enclosing-section restatement", () => {
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Excess Cash Flow Percentage" means 50%.

ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.50 to 1.00.
`.trim();

  function buildState() {
    const { index } = buildRealIndex(TEXT);
    const effects: AmendmentEffectCandidate[] = [
      // Link 1 (2019): first amendment, sets 40%.
      baseEffect({ effectId: "eff-chain-1", amendmentDocumentId: "amendment-2019", target: definitionTarget(DOC_ID, INSTRUMENT, "Excess Cash Flow Percentage"), newText: `"Excess Cash Flow Percentage" means 40%.`, effectiveDate: DATED("2019-01-01"), sourceCitation: "amendment-2019::Section 2" }),
      // Link 2 (2020): a SECOND amendment that entirely supersedes Link 1's
      // own effect (the "intermediate amendment is itself superseded" case)
      // by setting a genuinely different value at a later date.
      baseEffect({ effectId: "eff-chain-2", amendmentDocumentId: "amendment-2020", target: definitionTarget(DOC_ID, INSTRUMENT, "Excess Cash Flow Percentage"), newText: `"Excess Cash Flow Percentage" means 25%.`, effectiveDate: DATED("2020-01-01"), sourceCitation: "amendment-2020::Section 2" }),
      // Link 3 (2021): a THIRD amendment supersedes Link 2 in turn.
      baseEffect({ effectId: "eff-chain-3", amendmentDocumentId: "amendment-2021", target: definitionTarget(DOC_ID, INSTRUMENT, "Excess Cash Flow Percentage"), newText: `"Excess Cash Flow Percentage" means 10%.`, oldText: `"Excess Cash Flow Percentage" means 25%.`, effectiveDate: DATED("2021-01-01"), sourceCitation: "amendment-2021::Section 2" }),
      // Unrelated, interleaved whole-section restatement of the SAME
      // "ARTICLE I DEFINITIONS" enclosing node the term physically lives in
      // - dated BETWEEN link 2 and link 3, verifying this never corrupts
      // the definition's own amendment-chain-derived status (an actively
      // amended definition's currentSourceNodeId is null - text comes from
      // the amendment document, not the base node - so enclosing-node
      // supersession must never spuriously apply to it).
      baseEffect({ effectId: "eff-section-restate", amendmentDocumentId: "amendment-2020-restate", target: sectionTarget(DOC_ID, INSTRUMENT, "1.01"), operation: "REPLACE_TEXT", newText: `Section 1.01 Definitions . As used in this Agreement, "Excess Cash Flow Percentage" means 25%.`, effectiveDate: DATED("2020-06-01"), sourceCitation: "amendment-2020-restate::Section 2" }),
    ];
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: effects });
    return { index, state, effects };
  }

  it("SETUP CHECK: the definition's own status is RESOLVED at the LATEST (10%) value, unaffected by the interleaved section restatement", () => {
    const { state } = buildState();
    const defView = state.provisions.find((p) => p.kind === "DEFINITION")!;
    expect(defView.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(defView.currentText).toContain("10%");
    expect(defView.fullChain).toHaveLength(3);
  });

  it("getDefinition (canonical term) serves exactly the LATEST (10%) text, never the superseded intermediate 40%/25% links", () => {
    const { index, state } = buildState();
    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Excess Cash Flow Percentage" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { status: string; evidenceStatus: string; isCurrentTruth: boolean; text: string };
    expect(result.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(result.evidenceStatus).toBe("CURRENT");
    expect(result.isCurrentTruth).toBe(true);
    expect(result.text).toContain("10%");
    expect(result.text).not.toContain("40%");
    expect(result.text).not.toContain("25%");
  });

  it("getDefinition with a whitespace-variant query on the SAME chained term also serves exactly the latest (10%) text - the whitespace fix and the chain-supersession logic compose correctly together", () => {
    const { index, state } = buildState();
    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Excess  Cash Flow\tPercentage" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { status: string; isCurrentTruth: boolean; text: string };
    expect(result.isCurrentTruth).toBe(true);
    expect(result.text).toContain("10%");
    expect(result.text).not.toContain("25%");
    expect(result.text).not.toContain("40%");
  });

  it("getPriorVersion (canonical term) returns the immediately-prior (25%) text, correctly labeled superseded - not the original (40%) or the current (10%)", () => {
    const { index, state, effects } = buildState();
    const tools = buildToolSet(accessFor(index, state, effects), DOC_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const tool = tools.find((t) => t.name === "getPriorVersion")!;
    const outcome = tool.execute({ ref: "Excess Cash Flow Percentage" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { priorText: string };
    expect(result.priorText).toContain("25%");
    expect(result.priorText).not.toContain("40%");
    expect(result.priorText).not.toContain("10%");
  });
});

// ---------------------------------------------------------------------------
// Group 4 (CRITICAL): an end-to-end attempt to coerce compile.ts/verify.ts
// into COMPLETED/VERIFIED status off a genuinely unresolved (CONFLICTED)
// definition through a path Part A's own tests never exercised: Phase 2D's
// own already-gathered CovenantContextBundle, which caller.ts's
// summarizeContextBundle() dumps VERBATIM (raw excerptText, no operative-
// state/supersession annotation of any kind - confirmed by reading
// caller.ts's summarizeContextBundle end to end) into the model's very
// FIRST turn. A model that answers straight from that bundle - as the
// system prompt explicitly invites it to do ("Already-gathered context...
// read this BEFORE requesting tools") - never calls getDefinition at all,
// so ToolCallLogEntry.evidenceUnresolved (the ENTIRE signal compile.ts/
// verify.ts's OPEN-2 fix depends on) is never set, because it is only ever
// populated by a getDefinition call that actually happened. The exact same
// real, on-file CONFLICTED amendment evidence that getDefinition would
// have disclosed (proven in the SETUP CHECK below) is invisible to both
// downstream gates the moment it arrives via context instead of a tool
// call - a definition-side counterpart to the ALREADY-DOCUMENTED gap this
// codebase's own comments elsewhere admit for getContextBundleComponent/
// getSharedCapContext's raw excerptText (semantic/tools.ts's own header
// comment on summarizeItemWithSupersession), except that fix only ever
// covers a tool RESPONSE re-reading the bundle - never the always-present
// INITIAL context dump every compilation attempt receives regardless of
// whether any tool is ever called.
// ---------------------------------------------------------------------------
describe("OPEN-2 independent recert - CRITICAL: context-bundle-sourced stale definition bypasses evidenceUnresolved entirely (zero tool calls)", () => {
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated EBITDA" means, for any period, an amount equal to Consolidated Net Income for such period, not to exceed $5,000,000 in the aggregate.
`.trim();

  function buildState() {
    const { index } = buildRealIndex(TEXT);
    const effectA = baseEffect({
      effectId: "eff-ctx-A",
      amendmentDocumentId: "amendment-doc-ctx-A",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Consolidated EBITDA"),
      newText: `"Consolidated EBITDA" means an amount not to exceed $9,000,000 in the aggregate (Amendment No. 1).`,
      effectiveDate: DATED("2021-06-01"),
      sourceCitation: "amendment-doc-ctx-A::Section 2",
    });
    const effectB = baseEffect({
      effectId: "eff-ctx-B",
      amendmentDocumentId: "amendment-doc-ctx-B",
      target: definitionTarget(DOC_ID, INSTRUMENT, "Consolidated EBITDA"),
      newText: `"Consolidated EBITDA" means an amount not to exceed $12,000,000 in the aggregate (competing Amendment No. 1-Alternate).`,
      effectiveDate: DATED("2021-06-01"), // same date -> real AMENDMENT_CONFLICT
      sourceCitation: "amendment-doc-ctx-B::Section 2",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC_ID, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    return { index, state };
  }

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

  it("SETUP CHECK: this term genuinely IS CONFLICTED, and getDefinition (if actually called) genuinely WOULD disclose it - the fix works exactly as designed for the tool-call path", () => {
    const { index, state } = buildState();
    const outcome = getDefinitionTool(accessFor(index, state)).execute({ term: "Consolidated EBITDA" });
    const result = outcome.result as { status: string; isCurrentTruth: boolean };
    expect(result.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(result.isCurrentTruth).toBe(false);
  });

  it("FALSIFICATION: compileCovenantToIR reaches status COMPLETED for a definition whose real operative state is CONFLICTED, because the model answered from the context bundle's raw excerptText and never called getDefinition - toolCallLog is empty, so evidenceUnresolved is never set anywhere and compile.ts's OPEN-2 propagation check has nothing to see", async () => {
    const { index, state } = buildState();

    // Phase 2D's own "already-gathered context" bundle - built exactly the
    // way context-retrieval/pipeline.ts's own DEFINITION-type items are
    // documented to be built elsewhere in this codebase (raw excerptText
    // via StructuralIndex text extraction, no operative-state/supersession
    // field on ContextItem at all - confirmed in context-retrieval/types.ts).
    // This item's excerptText is deliberately the STALE base-document
    // figure ($5,000,000) - not even one of the two competing amended
    // figures - to make unmistakable that this is pre-amendment text.
    const staleContextItem: ContextItem = {
      itemId: "def-consolidated-ebitda",
      type: "DEFINITION",
      documentId: DOC_ID,
      structuralNodeKey: null,
      structuralNodeId: null,
      normalizedRef: "consolidated ebitda",
      sourceCitation: `${DOC_ID}::Section 1.01`,
      excerptText: `"Consolidated EBITDA" means, for any period, an amount equal to Consolidated Net Income for such period, not to exceed $5,000,000 in the aggregate.`,
      reason: "defined term referenced by the operative covenant text",
      retrievalDepth: 1,
      retrievalPath: [],
      retrievalMethod: "DEFINITION_INDEX",
      confidence: 1,
    };
    const contextBundle = emptyContextBundle({ items: [staleContextItem] });
    const access = accessFor(index, state, [], contextBundle);
    const input = testCompilerInput({
      toolAccess: access,
      contextBundle,
      sourceDocumentId: DOC_ID,
      instrumentKey: INSTRUMENT,
      sourceSectionRef: null,
      operativeSourceText: "The Borrower shall comply with the covenant.",
      candidateRef: "open2-ctx-bypass-candidate",
    });

    // The scripted model submits IMMEDIATELY on turn 1 - zero tool calls of
    // any kind - declaring the definition COMPLETE straight from the
    // context bundle's own (stale) excerptText handed to it in the very
    // first user message.
    const client = scriptedClient([
      fakeMessage([
        toolUseBlock("t1", "submit_compilation", {
          rules: [],
          definitions: [{ localRef: "d1", termName: "Consolidated EBITDA", sufficiency: "COMPLETE", sufficiencyReasons: ["answered directly from already-gathered context bundle item def-consolidated-ebitda - no tool call needed"] }],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(input, { caller, cache: new InMemorySemanticCompilationCache() });

    // The smoking gun: zero tool calls were made at all this attempt.
    expect(result.toolCallLog).toHaveLength(0);
    expect(result.toolCallLog.some((e) => e.evidenceUnresolved === true)).toBe(false);
    expect(result.failureReasons).not.toContain("OPERATIVE_STATE_UNRESOLVED");
    // This is the falsification: a definition whose real, on-file operative
    // state is genuinely CONFLICTED (proven in the SETUP CHECK above)
    // reaches COMPLETED status - the exact outcome the OPEN-2 fix's own
    // stated design principle ("must not become trusted verified current
    // truth solely from that definition") was supposed to make
    // unreachable, reached here via a path (context-bundle-sourced answer,
    // no tool call) neither compile.ts's failureReasons wiring nor Part A's
    // own required tests ever exercised.
    expect(result.status).toBe("COMPLETED");
  });

  it("FALSIFICATION (verify.ts): the SAME real compilationResult (toolCallLog empty) reaches VERIFIED_NO_MATERIAL_GAP_FOUND under verifyCompiledCandidate, despite the candidate's own compiled definition resting entirely on a genuinely CONFLICTED, never-independently-checked defined term", async () => {
    const { index, state } = buildState();
    const staleContextItem: ContextItem = {
      itemId: "def-consolidated-ebitda",
      type: "DEFINITION",
      documentId: DOC_ID,
      structuralNodeKey: null,
      structuralNodeId: null,
      normalizedRef: "consolidated ebitda",
      sourceCitation: `${DOC_ID}::Section 1.01`,
      excerptText: `"Consolidated EBITDA" means, for any period, an amount equal to Consolidated Net Income for such period, not to exceed $5,000,000 in the aggregate.`,
      reason: "defined term referenced by the operative covenant text",
      retrievalDepth: 1,
      retrievalPath: [],
      retrievalMethod: "DEFINITION_INDEX",
      confidence: 1,
    };
    const contextBundle = emptyContextBundle({ items: [staleContextItem] });
    const access = accessFor(index, state, [], contextBundle);
    const compilerInput = testCompilerInput({
      toolAccess: access,
      contextBundle,
      sourceDocumentId: DOC_ID,
      instrumentKey: INSTRUMENT,
      sourceSectionRef: null,
      operativeLineage: null,
      operativeSourceText: "The Borrower shall comply with the covenant.",
      candidateRef: "open2-ctx-bypass-candidate-verify",
    });
    const client = scriptedClient([
      { id: "msg_test", container: null, model: "claude-sonnet-5", role: "assistant", stop_reason: "tool_use", stop_sequence: null, type: "message", usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null } as Anthropic.Usage, content: [toolUseBlock("t1", "submit_compilation", { rules: [], definitions: [{ localRef: "d1", termName: "Consolidated EBITDA", sufficiency: "COMPLETE", sufficiencyReasons: ["answered directly from context bundle"] }] })] } as Anthropic.Message,
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const compilationResult: SemanticCompilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });
    expect(compilationResult.toolCallLog).toHaveLength(0);
    expect(compilationResult.status).toBe("COMPLETED");

    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });

    // The falsification: verify.ts's own hasUnresolvedDefinitionEvidence
    // check (Part A's OPEN-2 downstream gate) only ever inspects
    // compilationResult.toolCallLog - it has no independent way to notice
    // that the candidate's OWN compiled definition is entirely built on a
    // term with a real, on-file AMENDMENT_CONFLICT, because that evidence
    // never flowed through a tool call this time.
    expect(verification.status).not.toBe("MATERIAL_DISCREPANCY");
    expect(verification.status).not.toBe("REVIEW_REQUIRED");
    expect(["VERIFIED_NO_MATERIAL_GAP_FOUND", "VERIFIED_WITH_NON_MATERIAL_FINDINGS"]).toContain(verification.status);
  });
});
