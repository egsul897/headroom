/**
 * HEADROOM FINAL 3F.1 CLOSURE - Workstream FIX-2 required tests.
 *
 * Governing invariant: "TRUST METADATA BELONGS TO THE EVIDENCE ITSELF, NOT
 * TO THE RETRIEVAL MECHANISM." A prior independent auditor proved
 * caller.ts's summarizeContextBundle() dumps CovenantContextBundle items'
 * raw excerptText verbatim into the model's FIRST turn, and that
 * ToolCallLogEntry.evidenceUnresolved (the entire safety signal
 * compile.ts/verify.ts depended on) is only ever set by a getDefinition
 * call the model actually made - so a model that answers straight from the
 * pre-loaded bundle, with ZERO tool calls, could reach COMPLETED/
 * VERIFIED_NO_MATERIAL_GAP_FOUND off a genuinely CONFLICTED definition. See
 * tests/certification/part-b-terminal-recert-open2-independent.test.ts
 * (updated by this same fix to certify closure) for the original
 * reproduction this closes.
 *
 * This file exercises the REAL production pipeline end to end wherever
 * practical: parseDocumentStructure -> detectStructuralDefinitions ->
 * buildStructuralIndex -> computeOperativeContractState ->
 * buildCovenantContextBundle (context-retrieval/pipeline.ts, the ACTUAL
 * bundle-construction entry point every real analysis run uses) ->
 * compileCovenantToIR (a real RealSemanticCaller tool-use loop, scripted to
 * answer on turn 1 with zero tool calls) -> verifyCompiledCandidate ->
 * persistSemanticTruthForInstrument (real Postgres) -> re-read. A few
 * scenarios (ambiguous/historical evidence shapes that are hard to trigger
 * via the full auto-discovery path without package-specific language) call
 * the canonical amendment/operative-state.ts primitives and the
 * context-retrieval/state.ts adapters directly instead - the same
 * functions the real pipeline calls internally, never a re-implementation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState, resolveOperativeDefinitionEvidence, resolveOperativeSectionEvidence } from "../../lib/contract-model/compiler/amendment/operative-state";
import { resolveDefinitionEvidenceState, resolveSectionEvidenceState, createRetrievalState } from "../../lib/contract-model/compiler/context-retrieval/state";
import { buildCovenantContextBundle, type PackageAccess } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { testCompilerInput } from "../contract-model/semantic-compiler/test-helpers";
import { makeCandidate } from "../contract-model/coverage-audit-test-utils";
import { prisma } from "../../lib/prisma";
import { persistSemanticTruthForInstrument, getTrustedSemanticTruth, getAllSemanticTruthForInstrument } from "../../lib/contract-model/analysis/semantic-truth/service";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";

const COMPANY_ID = "fix2-context-trust-test";
const INSTRUMENT = "instrument:fix2-context-trust";

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

function buildRealIndex(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const definitions = detectStructuralDefinitions(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), definitions, []);
  return { index, nodes, definitions };
}

function exactTermsFor(documentId: string, definitions: ReturnType<typeof detectStructuralDefinitions>): Map<string, Map<string, string>> {
  const terms = new Map<string, string>();
  for (const d of definitions) terms.set(d.normalizedTerm, d.exactTerm);
  return new Map([[documentId, terms]]);
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
/** Scripted client that answers IMMEDIATELY on turn 1 with the given submission - ZERO tool calls, exactly the reproduced exploit's own model behavior ("answered directly from already-gathered context, never called a tool"). */
function zeroToolCallClient(submission: unknown): MinimalAnthropicClient {
  return { messages: { stream: (_params: unknown) => ({ finalMessage: async () => fakeMessage([toolUseBlock("t1", "submit_compilation", submission)]) }) } } as MinimalAnthropicClient;
}

beforeAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "FIX-2 context-trust test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

// ---------------------------------------------------------------------------
// 1. THE EXACT ORIGINAL EXPLOIT - CONFLICTED definition, stale excerpt
// (auto-discovered by the REAL buildCovenantContextBundle, not hand-built),
// zero tool calls, scripted model. Must now fail closed end to end,
// including the persisted SemanticTruthRecord (see block 7 below, which
// reuses this exact scenario).
// ---------------------------------------------------------------------------
describe("1. exact original exploit: CONFLICTED definition + stale auto-discovered excerpt + zero tool calls", () => {
  const DOC = "fix2-doc-conflicted-definition";
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated EBITDA" means, for any period, an amount equal to Consolidated Net Income for such period, not to exceed $5,000,000 in the aggregate.

ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit Consolidated EBITDA to be applied in a manner inconsistent with this Agreement.
`.trim();

  function buildState() {
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-a", amendmentDocumentId: "amendment-doc-a", target: definitionTarget(DOC, INSTRUMENT, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means an amount not to exceed $9,000,000 in the aggregate (Amendment No. 1).`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-b", amendmentDocumentId: "amendment-doc-b", target: definitionTarget(DOC, INSTRUMENT, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means an amount not to exceed $12,000,000 in the aggregate (competing).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
    return { index, state, access };
  }

  it("SETUP CHECK: the fixture genuinely produces OPERATIVE_STATE_CONFLICTED", () => {
    const { state } = buildState();
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_CONFLICTED");
  });

  it("the REAL buildCovenantContextBundle auto-discovers the definition and marks it unresolved, with NO tool call involved", () => {
    const { index, access } = buildState();
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);

    const defItem = bundle.items.find((i) => i.type === "DEFINITION" && i.normalizedRef === "Consolidated EBITDA");
    expect(defItem).toBeDefined();
    // The raw excerpt is still the STALE base-document text - historical
    // context is preserved, never silently discarded.
    expect(defItem!.excerptText).toContain("$5,000,000");
    // But it is now explicitly labeled, never silently presented as current.
    expect(defItem!.evidenceState?.status).toBe("OPERATIVE_STATE_UNRESOLVED");
    expect(defItem!.evidenceState?.isCurrentTruth).toBe(false);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(true);
    expect(bundle.unresolvedEvidenceItemIds).toContain(defItem!.itemId);
  });

  it("compileCovenantToIR (real tool-use loop, scripted zero-tool-call submission) fails closed: never COMPLETED, forces OPERATIVE_STATE_UNRESOLVED", async () => {
    const { index, state, access } = buildState();
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(true);

    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID,
      instrumentKey: INSTRUMENT,
      sourceDocumentId: DOC,
      sourceSectionRef: "6.01",
      candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
      contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
    });

    const client = zeroToolCallClient({ rules: [], definitions: [{ localRef: "d1", termName: "Consolidated EBITDA", sufficiency: "COMPLETE", sufficiencyReasons: ["answered directly from already-gathered context - no tool call needed"] }] });
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(result.toolCallLog).toHaveLength(0);
    expect(result.inputHasUnresolvedOperativeEvidence).toBe(true);
    expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).not.toBe("COMPLETED");
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("end to end: verifyCompiledCandidate never reaches VERIFIED_* for this same real compilationResult", async () => {
    const { index, state, access } = buildState();
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID,
      instrumentKey: INSTRUMENT,
      sourceDocumentId: DOC,
      sourceSectionRef: "6.01",
      candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
      contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
    });
    const client = zeroToolCallClient({ rules: [], definitions: [{ localRef: "d1", termName: "Consolidated EBITDA", sufficiency: "COMPLETE", sufficiencyReasons: ["straight from context"] }] });
    const caller = new RealSemanticCaller("test", "test-model", client);
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });
    // Never silently-trusted current truth (the required invariant) - it is
    // fine for the exact non-VERIFIED status to be REVIEW_REQUIRED (the
    // unresolved-evidence gate) or VERIFICATION_INCOMPLETE (the bundle's own
    // sufficiencyState gate, which also independently fires here since a
    // genuinely CONFLICTED definition bundle is never SUFFICIENT) - both are
    // real, disclosed non-current-truth outcomes.
    expect(verification.status).not.toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
    expect(verification.status).not.toBe("VERIFIED_WITH_NON_MATERIAL_FINDINGS");
    expect(["REVIEW_REQUIRED", "VERIFICATION_INCOMPLETE"]).toContain(verification.status);
  });
});

// ---------------------------------------------------------------------------
// 2. STALE SECTION EXCERPT (not just definitions) - a CONFLICTED SECTION
// (the candidate's OWN primary provision), auto-discovered by
// retrieveOperativeSource, with zero tool calls.
// ---------------------------------------------------------------------------
describe("2. stale SECTION excerpt: a CONFLICTED section is the candidate's own operative source, zero tool calls", () => {
  const DOC = "fix2-doc-conflicted-section";
  const TEXT = `
ARTICLE VI COVENANTS

Section 6.05 Restricted Payments . The Borrower shall not declare or pay dividends in excess of $5,000,000 in any fiscal year.
`.trim();

  function buildState() {
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-sec-a", amendmentDocumentId: "amendment-doc-sec-a", target: sectionTarget(DOC, INSTRUMENT, "6.05"), operation: "REPLACE_TEXT", newText: `Section 6.05 Restricted Payments . The Borrower shall not declare or pay dividends in excess of $8,000,000 in any fiscal year.`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-sec-b", amendmentDocumentId: "amendment-doc-sec-b", target: sectionTarget(DOC, INSTRUMENT, "6.05"), operation: "REPLACE_TEXT", newText: `Section 6.05 Restricted Payments . The Borrower shall not declare or pay dividends in excess of $11,000,000 in any fiscal year (competing restatement).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
    return { index, state, access };
  }

  it("SETUP CHECK: the section's own operative state is genuinely CONFLICTED", () => {
    const { state } = buildState();
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_CONFLICTED");
  });

  it("the OPERATIVE_SOURCE context item is marked unresolved, and the bundle-level flag is set - purely from context construction, never a tool call", () => {
    const { index, access } = buildState();
    const node = index.getNodeByRef(DOC, "6.05")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.05" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);

    const opSourceItem = bundle.items.find((i) => i.type === "OPERATIVE_SOURCE")!;
    expect(opSourceItem).toBeDefined();
    expect(opSourceItem.excerptText).toContain("$5,000,000");
    expect(opSourceItem.evidenceState?.status).toBe("OPERATIVE_STATE_UNRESOLVED");
    expect(opSourceItem.evidenceState?.isCurrentTruth).toBe(false);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(true);
  });

  it("compileCovenantToIR fails closed for a RULE built off this stale SECTION excerpt, with zero tool calls made at all", async () => {
    const { index, state, access } = buildState();
    const node = index.getNodeByRef(DOC, "6.05")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.05" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID,
      instrumentKey: INSTRUMENT,
      sourceDocumentId: DOC,
      sourceSectionRef: "6.05",
      candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
      contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
    });
    const client = zeroToolCallClient({
      rules: [{ localRef: "r1", sourceSectionRef: "6.05", covenantFamily: "RESTRICTED_PAYMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: ["answered directly from context"] }],
      definitions: [],
    });
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(result.toolCallLog).toHaveLength(0);
    expect(result.inputHasUnresolvedOperativeEvidence).toBe(true);
    expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).not.toBe("COMPLETED");
  });
});

// ---------------------------------------------------------------------------
// 3. HISTORICAL context item correctly labeled, never silently trusted.
// A real, on-file amendment targets a term whose OWN base-document
// occurrence cannot be confirmed to exist (targetResolutionStatus
// NOT_FOUND) - HISTORICAL_ONLY per resolveOperativeDefinitionEvidence's own
// taxonomy. Historical text is preserved for context (attemptedText), but
// isCurrentTruth is false and it is rendered to the model with an explicit
// [NOT CONFIRMED CURRENT] label.
// ---------------------------------------------------------------------------
describe("3. historical context item (HISTORICAL_ONLY) is disclosed for context but never silently trusted", () => {
  const DOC = "fix2-doc-historical";
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated Net Income" means net income determined in accordance with GAAP.
`.trim();

  function buildState() {
    const { index } = buildRealIndex(DOC, TEXT);
    // A real, on-file amendment claims to replace "Legacy Defunct Term" -
    // a term that never appears anywhere in the base document at all (not
    // an ADD_DEFINITION origin) - a genuine, disclosable NOT_FOUND target.
    const effect = baseEffect({ effectId: "eff-hist", amendmentDocumentId: "amendment-doc-hist", target: definitionTarget(DOC, INSTRUMENT, "Legacy Defunct Term"), newText: `"Legacy Defunct Term" means a fully-replaced, no-longer-anchored definition.`, effectiveDate: DATED("2021-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effect] });
    return { index, state };
  }

  it("SETUP CHECK: the term's own base-document target genuinely resolves NOT_FOUND", () => {
    const { state } = buildState();
    const view = state.provisions.find((p) => p.kind === "DEFINITION")!;
    expect(view.targetResolutionStatus).toBe("NOT_FOUND");
  });

  it("resolveOperativeDefinitionEvidence (the canonical primitive) discloses HISTORICAL_ONLY, isCurrentTruth false, text preserved as attemptedText", () => {
    const { index, state } = buildState();
    const resolution = resolveOperativeDefinitionEvidence({ index, operativeState: state, term: "Legacy Defunct Term", searchDocumentIds: [DOC] });
    expect(resolution.outcome).toBe("FOUND");
    if (resolution.outcome !== "FOUND") throw new Error("unreachable");
    expect(resolution.status).toBe("HISTORICAL_ONLY");
    expect(resolution.isCurrentTruth).toBe(false);
    expect(resolution.text).toContain("fully-replaced");
  });

  it("the context-retrieval adapter (resolveDefinitionEvidenceState) surfaces the SAME HISTORICAL_ONLY/not-current verdict a real context item would carry", () => {
    const { index, state } = buildState();
    const retrievalState = createRetrievalState({ maxDefinitionDepth: 5, maxCrossReferenceDepth: 3, maxItems: 60, maxTextBudgetChars: 40_000 }, state);
    const evidenceState = resolveDefinitionEvidenceState(retrievalState, index, DOC, "Legacy Defunct Term");
    expect(evidenceState.status).toBe("HISTORICAL_ONLY");
    expect(evidenceState.isCurrentTruth).toBe(false);
    expect(evidenceState.reason).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. AMBIGUOUS definition - two genuinely colliding physical definitions of
// the SAME term in one document, with no amendment involved at all
// (resolveUniqueDefinitionByRef's own AMBIGUOUS branch).
// ---------------------------------------------------------------------------
describe("4. ambiguous definition (two colliding physical definitions, never amended)", () => {
  const DOC = "fix2-doc-ambiguous-definition";
  const TEXT = `
Section 1.01 Definitions . As used in this Agreement, "Permitted Basket" means $1,000,000.

Section 1.02 Additional Definitions . As used in this Agreement, "Permitted Basket" means $2,000,000 for Restricted Subsidiaries.
`.trim();

  it("SETUP CHECK: the base document genuinely declares this term twice", () => {
    const { definitions } = buildRealIndex(DOC, TEXT);
    const matches = definitions.filter((d) => d.normalizedTerm === "permitted basket");
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("resolveOperativeDefinitionEvidence discloses AMBIGUOUS_TARGET, never guessing one of the two colliding definitions", () => {
    const { index } = buildRealIndex(DOC, TEXT);
    const resolution = resolveOperativeDefinitionEvidence({ index, operativeState: null, term: "Permitted Basket", searchDocumentIds: [DOC] });
    expect(resolution.outcome).toBe("AMBIGUOUS");
    if (resolution.outcome !== "AMBIGUOUS") throw new Error("unreachable");
    expect(resolution.candidateCount).toBeGreaterThanOrEqual(2);
  });

  it("the context-retrieval adapter surfaces the SAME AMBIGUOUS_TARGET verdict, isCurrentTruth false", () => {
    const { index } = buildRealIndex(DOC, TEXT);
    const retrievalState = createRetrievalState({ maxDefinitionDepth: 5, maxCrossReferenceDepth: 3, maxItems: 60, maxTextBudgetChars: 40_000 }, null);
    const evidenceState = resolveDefinitionEvidenceState(retrievalState, index, DOC, "Permitted Basket");
    expect(evidenceState.status).toBe("AMBIGUOUS_TARGET");
    expect(evidenceState.isCurrentTruth).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. PARTIAL amendment - a real, resolved, dated effect governs a term but
// supplies no capturable replacement text (PARTIAL_AMENDMENT).
// ---------------------------------------------------------------------------
describe("5. partial amendment (real, resolved, dated effect with no capturable text)", () => {
  const DOC = "fix2-doc-partial";
  const TEXT = `
Section 1.01 Definitions . As used in this Agreement, "Permitted Investment" means any Investment permitted under Section 6.05, not to exceed $10,000,000 in the aggregate.
`.trim();

  function buildState() {
    const { index } = buildRealIndex(DOC, TEXT);
    const effect = baseEffect({ effectId: "eff-partial", amendmentDocumentId: "amendment-doc-partial", target: definitionTarget(DOC, INSTRUMENT, "Permitted Investment"), operation: "MODIFY_THRESHOLD", newText: null, effectiveDate: DATED("2021-04-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effect] });
    return { index, state };
  }

  it("SETUP CHECK: the definition's own status is genuinely PARTIAL", () => {
    const { state } = buildState();
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_PARTIAL");
  });

  it("resolveOperativeDefinitionEvidence discloses PARTIAL_AMENDMENT, isCurrentTruth false, text withheld (never the stale $10,000,000 figure passed off as current)", () => {
    const { index, state } = buildState();
    const resolution = resolveOperativeDefinitionEvidence({ index, operativeState: state, term: "Permitted Investment", searchDocumentIds: [DOC] });
    expect(resolution.outcome).toBe("FOUND");
    if (resolution.outcome !== "FOUND") throw new Error("unreachable");
    expect(resolution.status).toBe("PARTIAL_AMENDMENT");
    expect(resolution.isCurrentTruth).toBe(false);
    expect(resolution.text ?? "").not.toContain("$10,000,000");
  });

  it("the real buildCovenantContextBundle marks the auto-discovered definition item PARTIAL_AMENDMENT when the operative text mentions it", () => {
    const { index, state } = buildState();
    const opText = `Section 6.01 Investments . The Borrower shall not make any Investment except a Permitted Investment.`;
    const opNodes = parseDocumentStructure({ documentId: DOC, label: DOC, text: TEXT + "\n\n" + opText });
    const opDefs = detectStructuralDefinitions(DOC, TEXT + "\n\n" + opText, opNodes);
    const fullIndex = buildStructuralIndex(new Map([[DOC, { text: TEXT + "\n\n" + opText, nodes: opNodes }]]), opDefs, []);
    const node = fullIndex.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const access: PackageAccess = { index: fullIndex, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, opDefs), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    const defItem = bundle.items.find((i) => i.type === "DEFINITION" && i.normalizedRef.toLowerCase() === "permitted investment");
    expect(defItem).toBeDefined();
    expect(defItem!.evidenceState?.status).toBe("PARTIAL_AMENDMENT");
    expect(defItem!.evidenceState?.isCurrentTruth).toBe(false);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Same term appearing across sibling documents must NOT cross-contaminate
// operative status - two separate instruments, each with its OWN
// OperativeContractState, built independently.
// ---------------------------------------------------------------------------
describe("6. same term across sibling documents does not cross-contaminate operative status", () => {
  const DOC_A = "fix2-doc-sibling-a";
  const DOC_B = "fix2-doc-sibling-b";
  const TEXT_A = `
Section 1.01 Definitions . As used in this Agreement, "Permitted Investment" means any Investment not to exceed $10,000,000.

Section 6.01 Investments . The Borrower shall not make any Investment except a Permitted Investment.
`.trim();
  const TEXT_B = `
Section 1.01 Definitions . As used in this Agreement, "Permitted Investment" means any Investment not to exceed $20,000,000.

Section 6.01 Investments . The Borrower shall not make any Investment except a Permitted Investment.
`.trim();

  it("document A's own CONFLICTED amendment history never leaks into document B's independently-built bundle for the identically-named term", () => {
    const { index: indexA, definitions: defsA } = buildRealIndex(DOC_A, TEXT_A);
    const effectA1 = baseEffect({ effectId: "eff-sib-a1", amendmentDocumentId: "amendment-a1", target: definitionTarget(DOC_A, "instrument:sibling-a", "Permitted Investment"), newText: `"Permitted Investment" means any Investment not to exceed $30,000,000 (A).`, effectiveDate: DATED("2021-06-01") });
    const effectA2 = baseEffect({ effectId: "eff-sib-a2", amendmentDocumentId: "amendment-a2", target: definitionTarget(DOC_A, "instrument:sibling-a", "Permitted Investment"), newText: `"Permitted Investment" means any Investment not to exceed $40,000,000 (competing A).`, effectiveDate: DATED("2021-06-01") });
    const stateA = computeOperativeContractState({ instrumentKey: "instrument:sibling-a", baseDocumentId: DOC_A, asOfDate: "2022-01-01", index: indexA, allEffects: [effectA1, effectA2] });
    expect(stateA.provisions[0]!.status).toBe("OPERATIVE_STATE_CONFLICTED");

    // Document B: the SAME term name, a DIFFERENT instrument, NEVER amended.
    const { index: indexB, definitions: defsB } = buildRealIndex(DOC_B, TEXT_B);
    const stateB = computeOperativeContractState({ instrumentKey: "instrument:sibling-b", baseDocumentId: DOC_B, asOfDate: "2022-01-01", index: indexB, allEffects: [] });
    expect(stateB.provisions).toHaveLength(0);

    const nodeA = indexA.getNodeByRef(DOC_A, "6.01")!;
    const candidateA = makeCandidate({ documentId: DOC_A, structuralNodeKeys: [nodeA.nodeKey], structuralNodeIds: [nodeA.nodeId], normalizedSourceRef: "6.01" });
    const bundleA = buildCovenantContextBundle({ candidate: candidateA, packageKey: "p", companyId: COMPANY_ID, instrumentKey: "instrument:sibling-a" }, { index: indexA, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC_A, defsA), operativeState: stateA });
    const defItemA = bundleA.items.find((i) => i.type === "DEFINITION")!;
    expect(defItemA.evidenceState?.status).toBe("OPERATIVE_STATE_UNRESOLVED");
    expect(bundleA.hasUnresolvedOperativeEvidence).toBe(true);

    const nodeB = indexB.getNodeByRef(DOC_B, "6.01")!;
    const candidateB = makeCandidate({ documentId: DOC_B, structuralNodeKeys: [nodeB.nodeKey], structuralNodeIds: [nodeB.nodeId], normalizedSourceRef: "6.01" });
    const bundleB = buildCovenantContextBundle({ candidate: candidateB, packageKey: "p", companyId: COMPANY_ID, instrumentKey: "instrument:sibling-b" }, { index: indexB, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC_B, defsB), operativeState: stateB });
    const defItemB = bundleB.items.find((i) => i.type === "DEFINITION")!;
    // Document B's own identically-named term is genuinely CURRENT (never
    // amended in ITS OWN instrument) - document A's conflict must never
    // bleed across.
    expect(defItemB.evidenceState?.status).toBe("CURRENT");
    expect(defItemB.evidenceState?.isCurrentTruth).toBe(true);
    expect(bundleB.hasUnresolvedOperativeEvidence).toBe(false);
    expect(defItemB.excerptText).toContain("$20,000,000");
  });
});

// ---------------------------------------------------------------------------
// 7. Full chain end-to-end: context -> model input -> compile -> verify ->
// persisted SemanticTruthRecord all carry consistent unresolved/trust
// state. Reuses scenario 1's exact real compile/verify result and persists
// it via the real service (real Postgres), then re-reads it.
// ---------------------------------------------------------------------------
describe("7. full chain persists consistent trust state into SemanticTruthRecord", () => {
  const DOC = "fix2-doc-persist-chain";
  const TRUTH_INSTRUMENT = "instrument:fix2-truth-chain";

  it("a REVIEW_REQUIRED verification never persists as trustStatus VERIFIED - getTrustedSemanticTruth correctly excludes it", async () => {
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated EBITDA" means, for any period, an amount equal to Consolidated Net Income for such period, not to exceed $5,000,000 in the aggregate.

ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit Consolidated EBITDA to be applied in a manner inconsistent with this Agreement.
`.trim();
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-chain-a", amendmentDocumentId: "amendment-doc-chain-a", target: definitionTarget(DOC, TRUTH_INSTRUMENT, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means an amount not to exceed $9,000,000 (Amendment No. 1).`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-chain-b", amendmentDocumentId: "amendment-doc-chain-b", target: definitionTarget(DOC, TRUTH_INSTRUMENT, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means an amount not to exceed $12,000,000 (competing).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: TRUTH_INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: TRUTH_INSTRUMENT }, access);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(true);

    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID,
      instrumentKey: TRUTH_INSTRUMENT,
      sourceDocumentId: DOC,
      sourceSectionRef: "6.01",
      candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
      contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
    });
    const client = zeroToolCallClient({ rules: [], definitions: [{ localRef: "d1", termName: "Consolidated EBITDA", sufficiency: "COMPLETE", sufficiencyReasons: ["straight from context"] }] });
    const caller = new RealSemanticCaller("test", "test-model", client);
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });
    expect(compilationResult.status).toBe("REVIEW_REQUIRED");

    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });
    expect(verification.status).not.toMatch(/^VERIFIED_/);
    expect(["REVIEW_REQUIRED", "VERIFICATION_INCOMPLETE"]).toContain(verification.status);

    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
    await persistSemanticTruthForInstrument({
      companyId: COMPANY_ID,
      packageKey: null,
      instrumentKey: TRUTH_INSTRUMENT,
      analysisRunId: null,
      objects: compilationResult.definitions.map((def) => ({ kind: "DEFINITION" as const, object: def, candidateRef: candidate.discoveryId, compilerVersions, verification, verifierPromptVersion: "test-verifier-v1" })),
    });

    const trusted = await getTrustedSemanticTruth(COMPANY_ID, TRUTH_INSTRUMENT);
    expect(trusted).toHaveLength(0);

    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, TRUTH_INSTRUMENT);
    expect(all.length).toBeGreaterThan(0);
    for (const row of all) {
      expect(row.trustStatus).toBe("REVIEW_REQUIRED");
      expect(row.trustStatus).not.toBe("VERIFIED");
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Courtesy rendering: summarizeContextBundle (caller.ts) explicitly
// surfaces evidenceStatus/reason to the model in the REAL first-turn prompt
// - a courtesy, never the safety mechanism itself (proven throughout this
// file: every fail-closed assertion above holds regardless of what the
// scripted model "read"). Captured via a spy on the real RealSemanticCaller
// tool-use loop's own first `messages.stream(...)` call, rather than
// reaching into caller.ts's private formatContextItem/summarizeContextBundle
// helpers (deliberately not exported).
// ---------------------------------------------------------------------------
describe("8. summarizeContextBundle renders evidenceStatus/reason explicitly (courtesy disclosure, not the safety mechanism)", () => {
  it("the real first-turn prompt text carries an explicit non-CURRENT evidenceStatus and a [NOT CONFIRMED CURRENT] marker for the unresolved item", async () => {
    const DOC = "fix2-doc-render";
    const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated EBITDA" means, for any period, an amount equal to Consolidated Net Income for such period, not to exceed $5,000,000 in the aggregate.

ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit Consolidated EBITDA to be applied in a manner inconsistent with this Agreement.
`.trim();
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-render-a", amendmentDocumentId: "amendment-render-a", target: definitionTarget(DOC, INSTRUMENT, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means $9,000,000.`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-render-b", amendmentDocumentId: "amendment-render-b", target: definitionTarget(DOC, INSTRUMENT, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means $12,000,000.`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);

    let capturedFirstUserMessage: unknown = null;
    const spyingClient: MinimalAnthropicClient = {
      messages: {
        stream: (params) => {
          if (capturedFirstUserMessage === null) capturedFirstUserMessage = params.messages[0]!.content;
          return { finalMessage: async () => fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [], definitions: [{ localRef: "d1", termName: "Consolidated EBITDA", sufficiency: "COMPLETE", sufficiencyReasons: ["straight from context"] }] })]) };
        },
      },
    };
    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID,
      instrumentKey: INSTRUMENT,
      sourceDocumentId: DOC,
      sourceSectionRef: "6.01",
      candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"),
      contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
    });
    const caller = new RealSemanticCaller("test", "test-model", spyingClient);
    await caller.compile(compilerInput);

    expect(typeof capturedFirstUserMessage).toBe("string");
    const rendered = capturedFirstUserMessage as string;
    expect(rendered).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(rendered).toContain("[NOT CONFIRMED CURRENT]");
    expect(rendered).toContain("$5,000,000");
  });
});
