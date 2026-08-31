/**
 * HEADROOM FINAL 3F.1 CLOSURE - Part B INDEPENDENT recertification of FIX-2
 * (context-evidence trust boundary), performed by a separate auditor from
 * the implementer who wrote tests/certification/part-a-final-fix2-context-
 * trust.test.ts and docs/phase-3f1-final-closure/04-evidence-trust-context-
 * fix.json. This file does NOT rerun that file's own scenarios - it
 * constructs fresh exploit shapes the implementer's own file does not cover,
 * per this recertification's own charter:
 *
 *   1. A genuinely CONFLICTED SECTION reached ONLY via the getOperativeProvision
 *      TOOL CALL path (never embedded in the context bundle at all) - this is
 *      the implementer's own DISCLOSED residual gap (04-evidence-trust-
 *      context-fix.json's "residualRisk" #1: getOperativeProvision never sets
 *      ToolExecutionOutcome.evidenceUnresolved). The implementer explicitly
 *      claims "FIX-2's own context-bundle-level and defense-in-depth gates
 *      independently cover the same underlying scenario... so this residual
 *      gap does not currently permit VERIFIED/COMPLETED." This file tests
 *      that EXACT claim directly, end to end, through the real production
 *      code (buildToolSet/RealSemanticCaller/compileCovenantToIR/
 *      verifyCompiledCandidate) - not a mock of the gate logic.
 *
 *   2. A definition-shaped analog of the same tool-call-path gap
 *      (getDefinition DOES set evidenceUnresolved correctly - this confirms
 *      the asymmetry is specific to getOperativeProvision, not a general
 *      tool-call blind spot).
 *
 *   3. Aggregate OR-across-items: a bundle with ONE resolved (CURRENT) item
 *      and ONE unresolved (CONFLICTED) item - confirms the resolved item
 *      never masks the unresolved one in hasUnresolvedOperativeEvidence.
 *
 * Every scenario here builds real StructuralIndex/OperativeContractState/
 * CovenantContextBundle objects via the same production primitives the
 * implementer's own file uses (buildStructuralIndex, computeOperativeContractState,
 * buildCovenantContextBundle, RealSemanticCaller) - never a hand-mocked gate.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
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

const COMPANY_ID = "fix2-indep-recert-test";

const DATED = (date: string): EffectiveDateResult => ({ date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `effective as of ${date}`, reason: "explicit effective date clause" });

function sectionTarget(documentId: string, instrumentKey: string, sectionRef: string): AmendmentTarget {
  return { kind: "SECTION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}
function definitionTarget(documentId: string, instrumentKey: string, term: string): AmendmentTarget {
  return { kind: "DEFINITION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: term, targetHint: null };
}

function baseEffect(overrides: Partial<AmendmentEffectCandidate> & { target: AmendmentTarget }): AmendmentEffectCandidate {
  return {
    effectId: "effect",
    amendmentDocumentId: "amendment-doc",
    operation: "REPLACE_TEXT",
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

function fakeMessage(content: Anthropic.ContentBlock[], stopReason: Anthropic.Message["stop_reason"] = null): Anthropic.Message {
  return {
    id: "msg_test",
    container: null,
    content,
    model: "claude-sonnet-5",
    role: "assistant",
    stop_reason: stopReason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn"),
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null } as Anthropic.Usage,
  } as Anthropic.Message;
}
function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}

beforeAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "FIX-2 independent recert test co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

// ---------------------------------------------------------------------------
// 1. THE DISCLOSED RESIDUAL GAP, TESTED DIRECTLY: a genuinely CONFLICTED
// section, NEVER embedded in the context bundle at all (no cross-reference
// auto-discovers it - the candidate's own primary section text never
// mentions it), reached ONLY through a real getOperativeProvision TOOL CALL
// during a real RealSemanticCaller tool-use loop. Confirms/falsifies the
// implementer's own claim that "FIX-2's context-bundle-level and defense-
// in-depth gates independently cover the same scenario."
// ---------------------------------------------------------------------------
describe("1. CONFLICTED section reached ONLY via getOperativeProvision's tool-call path (disclosed residual gap)", () => {
  const DOC = "fix2-indep-doc-tool-only-conflict";
  const INSTRUMENT = "instrument:fix2-indep-tool-only";
  // Section 6.01 is the candidate's own primary source - clean, never
  // amended, and its own text carries the SAME dollar figure the compiled
  // rule will assert, so Layer 1 deterministic reconciliation (an entirely
  // separate, pre-existing mechanism) has nothing to flag on its own - this
  // isolates the FIX-2-specific operative-state trust gates as the only
  // thing that could catch this.
  const TEXT = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.

Section 6.99 Indebtedness Cap Detail . The Borrower may incur up to $5,000,000 of additional Indebtedness under this basket.
`.trim();

  function buildState() {
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    // Section 6.99 - a DIFFERENT section from the candidate's own 6.01 -
    // carries two genuinely competing, same-effective-date REPLACE_TEXT
    // effects, making it OPERATIVE_STATE_CONFLICTED. Section 6.01 itself is
    // never targeted by any amendment at all (clean/never-amended).
    const effectA = baseEffect({ effectId: "eff-tool-a", amendmentDocumentId: "amendment-doc-tool-a", target: sectionTarget(DOC, INSTRUMENT, "6.99"), newText: `Section 6.99 . The Borrower may incur up to $9,000,000 of additional Indebtedness (Amendment No. 1).`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-tool-b", amendmentDocumentId: "amendment-doc-tool-b", target: sectionTarget(DOC, INSTRUMENT, "6.99"), newText: `Section 6.99 . The Borrower may incur up to $15,000,000 of additional Indebtedness (competing restatement).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
    return { index, state, access, definitions };
  }

  it("SETUP CHECK: section 6.99 is genuinely OPERATIVE_STATE_CONFLICTED; section 6.01 (the candidate's own source) is untouched", () => {
    const { state } = buildState();
    const view699 = state.provisions.find((p) => p.sectionRef === "6.99")!;
    expect(view699.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(state.provisions.find((p) => p.sectionRef === "6.01")).toBeUndefined();
  });

  it("SETUP CHECK: the real buildCovenantContextBundle for the 6.01 candidate never embeds section 6.99 at all (no auto-discovered cross-reference) - the bundle itself is fully resolved", () => {
    const { index, access } = buildState();
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    expect(bundle.items.some((i) => i.normalizedRef === "6.99" || i.excerptText.includes("6.99"))).toBe(false);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(false);
    expect(bundle.unresolvedEvidenceItemIds ?? []).toHaveLength(0);
  });

  it("FALSIFICATION ATTEMPT: a real getOperativeProvision('6.99') tool call returns the CONFLICTED status but NEVER sets ToolCallLogEntry.evidenceUnresolved", async () => {
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

    // Turn 1: the model calls getOperativeProvision on section 6.99 (a
    // section it never received in its own pre-loaded context bundle at
    // all - a real, affirmative tool call, the exact path FIX-2's own
    // safety net for ZERO-tool-call answers does not gate on). Turn 2: it
    // submits a rule with sufficiency COMPLETE, disregarding the CONFLICTED
    // status the tool call's own response disclosed to it.
    let turn = 0;
    const client: MinimalAnthropicClient = {
      messages: {
        stream: () => ({
          finalMessage: async () => {
            turn++;
            if (turn === 1) return fakeMessage([toolUseBlock("t1", "getOperativeProvision", { sectionRef: "6.99" })]);
            return fakeMessage([
              toolUseBlock("t2", "submit_compilation", {
                rules: [{ localRef: "r1", sourceSectionRef: "6.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: ["confirmed via getOperativeProvision tool call"] }],
                definitions: [],
              }),
            ]);
          },
        }),
      },
    };
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    // Confirm the tool call actually happened and actually reached the
    // CONFLICTED section.
    expect(result.toolCallLog).toHaveLength(1);
    expect(result.toolCallLog[0]!.toolName).toBe("getOperativeProvision");
    expect(result.toolCallLog[0]!.outputSummary).toContain("OPERATIVE_STATE_CONFLICTED");

    // THE DISCLOSED GAP, CONFIRMED: evidenceUnresolved is never set true for
    // this call, unlike getDefinition's own equivalent call (see scenario 2
    // below for the contrast).
    expect(result.toolCallLog[0]!.evidenceUnresolved).not.toBe(true);

    // THE CONSEQUENCE: none of compile.ts's THREE OR'd signals fire -
    // toolCallLog[].evidenceUnresolved is unset, the context bundle never
    // carried this section (inputHasUnresolvedOperativeEvidence is false),
    // and hasStaleReferencedDefinition only re-checks IRDefinition.termName
    // (there are zero definitions in this submission) so it cannot see a
    // SECTION-shaped gap at all. The result reaches COMPLETED - the exact
    // outcome the required invariant says must never happen for a
    // genuinely-relied-upon CONFLICTED provision.
    expect(result.failureReasons).not.toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).toBe("COMPLETED");
  });

  it("FALSIFICATION ATTEMPT (verify.ts layer): verifyCompiledCandidate ALSO reaches a VERIFIED_* status for the same compilationResult, skipping semantic review", async () => {
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
    let turn = 0;
    const client: MinimalAnthropicClient = {
      messages: {
        stream: () => ({
          finalMessage: async () => {
            turn++;
            if (turn === 1) return fakeMessage([toolUseBlock("t1", "getOperativeProvision", { sectionRef: "6.99" })]);
            return fakeMessage([
              toolUseBlock("t2", "submit_compilation", {
                rules: [{ localRef: "r1", sourceSectionRef: "6.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: ["confirmed via getOperativeProvision tool call"] }],
                definitions: [],
              }),
            ]);
          },
        }),
      },
    };
    const caller = new RealSemanticCaller("test", "test-model", client);
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });
    expect(compilationResult.status).toBe("COMPLETED");

    // skipSemanticReview mirrors the implementer's own scenario-1/7 pattern
    // (a genuinely single, fully-reconciled fixed basket with matching
    // source/IR numbers would ALSO skip semantic review for real via the
    // two-gate deterministic+condition-suspicion routing - forcing the skip
    // here isolates exactly the FIX-2-specific gates under test, rather than
    // depending on an unrelated LLM-classifier call's own behavior).
    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });

    // THE FALSIFICATION: this reaches a VERIFIED_* status even though the
    // rule's own real justification (the model's own tool call) came from a
    // genuinely CONFLICTED section - none of hasUnresolvedDefinitionEvidence
    // (toolCallLog-based), hasUnresolvedContextBundleEvidence (bundle-based),
    // or hasStaleReferencedDefinition (IRDefinition-only, and this
    // submission has zero definitions) can see a SECTION-shaped gap reached
    // purely through getOperativeProvision's own tool-call path.
    expect(verification.status).toMatch(/^VERIFIED_/);
  });

  it("FALSIFICATION ATTEMPT (persistence layer): the resulting SemanticTruthRecord persists with trustStatus VERIFIED, not REVIEW_REQUIRED", async () => {
    const TRUTH_INSTRUMENT = "instrument:fix2-indep-tool-only-persist";
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-tool-persist-a", amendmentDocumentId: "amendment-doc-tool-persist-a", target: sectionTarget(DOC, TRUTH_INSTRUMENT, "6.99"), newText: `Section 6.99 . up to $9,000,000 (Amendment No. 1).`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-tool-persist-b", amendmentDocumentId: "amendment-doc-tool-persist-b", target: sectionTarget(DOC, TRUTH_INSTRUMENT, "6.99"), newText: `Section 6.99 . up to $15,000,000 (competing).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: TRUTH_INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    expect(state.provisions.find((p) => p.sectionRef === "6.99")!.status).toBe("OPERATIVE_STATE_CONFLICTED");

    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: TRUTH_INSTRUMENT }, access);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(false);

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
    let turn = 0;
    const client: MinimalAnthropicClient = {
      messages: {
        stream: () => ({
          finalMessage: async () => {
            turn++;
            if (turn === 1) return fakeMessage([toolUseBlock("t1", "getOperativeProvision", { sectionRef: "6.99" })]);
            return fakeMessage([
              toolUseBlock("t2", "submit_compilation", {
                rules: [{ localRef: "r1", sourceSectionRef: "6.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: ["confirmed via getOperativeProvision tool call"] }],
                definitions: [],
              }),
            ]);
          },
        }),
      },
    };
    const caller = new RealSemanticCaller("test", "test-model", client);
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });
    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });

    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
    await persistSemanticTruthForInstrument({
      companyId: COMPANY_ID,
      packageKey: null,
      instrumentKey: TRUTH_INSTRUMENT,
      analysisRunId: null,
      objects: compilationResult.rules.map((rule) => ({ kind: "RULE" as const, object: rule, candidateRef: candidate.discoveryId, compilerVersions, verification, verifierPromptVersion: "test-verifier-v1" })),
    });

    const trusted = await getTrustedSemanticTruth(COMPANY_ID, TRUTH_INSTRUMENT);
    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, TRUTH_INSTRUMENT);
    expect(all.length).toBeGreaterThan(0);
    // THE FALSIFICATION, CONFIRMED END TO END THROUGH REAL PERSISTENCE: a
    // rule whose real justification depended on a genuinely CONFLICTED
    // section (reached only via a tool call FIX-2 does not instrument)
    // persists as trusted current truth.
    expect(trusted.length).toBeGreaterThan(0);
    expect(all[0]!.trustStatus).toBe("VERIFIED");
  });
});

// ---------------------------------------------------------------------------
// 2. CONTRAST CASE: getDefinition's OWN tool-call path DOES correctly set
// evidenceUnresolved for the identical CONFLICTED shape - confirming the gap
// above is specific to getOperativeProvision, not a general "any tool call"
// blind spot in FIX-2's design.
// ---------------------------------------------------------------------------
describe("2. contrast: getDefinition's tool-call path correctly sets evidenceUnresolved for the same CONFLICTED shape", () => {
  const DOC = "fix2-indep-doc-getdefinition-contrast";
  const INSTRUMENT = "instrument:fix2-indep-contrast";
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated EBITDA" means an amount not to exceed $5,000,000.

ARTICLE VI COVENANTS

Section 6.01 Leverage Ratio . The Borrower shall not permit the Leverage Ratio to exceed 3.50 to 1.00, as calculated in accordance with the definitions in Article I.
`.trim();

  it("a real getDefinition tool call on a CONFLICTED term DOES set evidenceUnresolved=true, and compile.ts correctly forces REVIEW_REQUIRED", async () => {
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-contrast-a", amendmentDocumentId: "amendment-doc-contrast-a", target: definitionTarget(DOC, INSTRUMENT, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means $9,000,000 (Amendment No. 1).`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-contrast-b", amendmentDocumentId: "amendment-doc-contrast-b", target: definitionTarget(DOC, INSTRUMENT, "Consolidated EBITDA"), newText: `"Consolidated EBITDA" means $12,000,000 (competing).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    // "Consolidated EBITDA" is never mentioned in 6.01's own text, so the
    // bundle's own auto-discovery never picks it up either - it is reached
    // ONLY via a real getDefinition tool call, exactly mirroring scenario 1's
    // own isolation of the tool-call path.
    expect(bundle.items.some((i) => i.normalizedRef === "Consolidated EBITDA")).toBe(false);

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
    let turn = 0;
    const client: MinimalAnthropicClient = {
      messages: {
        stream: () => ({
          finalMessage: async () => {
            turn++;
            if (turn === 1) return fakeMessage([toolUseBlock("t1", "getDefinition", { term: "Consolidated EBITDA" })]);
            return fakeMessage([
              toolUseBlock("t2", "submit_compilation", {
                rules: [{ localRef: "r1", sourceSectionRef: "6.01", covenantFamily: "LEVERAGE", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "RATIO", type: "RATIO", exprId: "e1", ratio: 3.5 }, sufficiency: "COMPLETE", sufficiencyReasons: ["confirmed via getDefinition tool call"] }],
                definitions: [],
              }),
            ]);
          },
        }),
      },
    };
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(result.toolCallLog).toHaveLength(1);
    expect(result.toolCallLog[0]!.toolName).toBe("getDefinition");
    // getDefinition's own execute() unconditionally sets evidenceUnresolved
    // (tools.ts: `outcome.evidenceUnresolved = !resolution.isCurrentTruth`) -
    // the correct behavior getOperativeProvision's own sibling lacks.
    expect(result.toolCallLog[0]!.evidenceUnresolved).toBe(true);
    expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).not.toBe("COMPLETED");
    expect(result.status).toBe("REVIEW_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// 3. AGGREGATE OR-ACROSS-ITEMS: a bundle with one CURRENT (resolved) item and
// one CONFLICTED (unresolved) item - confirms the resolved item never masks
// the unresolved one, and the bundle-level flag correctly ORs across every
// item rather than e.g. only checking the first/last.
// ---------------------------------------------------------------------------
describe("3. aggregate hasUnresolvedOperativeEvidence correctly ORs across multiple items - a resolved item never masks an unresolved sibling", () => {
  const DOC = "fix2-indep-doc-aggregate-or";
  const INSTRUMENT = "instrument:fix2-indep-aggregate";
  const TEXT = `
ARTICLE I DEFINITIONS

Section 1.01 Definitions . As used in this Agreement, "Consolidated Net Income" means net income determined in accordance with GAAP.

Section 1.02 Definitions . As used in this Agreement, "Permitted Basket Amount" means $5,000,000.

ARTICLE VI COVENANTS

Section 6.01 Restricted Payments . The Borrower shall not make Restricted Payments except with Consolidated Net Income up to the Permitted Basket Amount.
`.trim();

  it("SETUP CHECK: exactly one of the two definitions used by the candidate's own text is CONFLICTED, the other never amended", () => {
    const { index } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-agg-a", amendmentDocumentId: "amendment-doc-agg-a", target: definitionTarget(DOC, INSTRUMENT, "Permitted Basket Amount"), newText: `"Permitted Basket Amount" means $8,000,000 (Amendment No. 1).`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-agg-b", amendmentDocumentId: "amendment-doc-agg-b", target: definitionTarget(DOC, INSTRUMENT, "Permitted Basket Amount"), newText: `"Permitted Basket Amount" means $11,000,000 (competing).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    expect(state.provisions).toHaveLength(1);
    expect(state.provisions[0]!.definedTermRef).toBe("permitted basket amount");
    expect(state.provisions[0]!.status).toBe("OPERATIVE_STATE_CONFLICTED");
  });

  it("the bundle carries BOTH a CURRENT definition item and a CONFLICTED definition item, and hasUnresolvedOperativeEvidence is true (the CURRENT item never masks the CONFLICTED one)", () => {
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-agg-a2", amendmentDocumentId: "amendment-doc-agg-a2", target: definitionTarget(DOC, INSTRUMENT, "Permitted Basket Amount"), newText: `"Permitted Basket Amount" means $8,000,000 (Amendment No. 1).`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-agg-b2", amendmentDocumentId: "amendment-doc-agg-b2", target: definitionTarget(DOC, INSTRUMENT, "Permitted Basket Amount"), newText: `"Permitted Basket Amount" means $11,000,000 (competing).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
    const node = index.getNodeByRef(DOC, "6.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "6.01" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);

    const netIncomeItem = bundle.items.find((i) => i.normalizedRef === "Consolidated Net Income");
    const basketItem = bundle.items.find((i) => i.normalizedRef === "Permitted Basket Amount");
    expect(netIncomeItem).toBeDefined();
    expect(basketItem).toBeDefined();
    // The never-amended term resolves CURRENT...
    expect(netIncomeItem!.evidenceState?.status).toBe("CURRENT");
    expect(netIncomeItem!.evidenceState?.isCurrentTruth).toBe(true);
    // ...but the CONFLICTED sibling is never masked by it.
    expect(basketItem!.evidenceState?.status).toBe("OPERATIVE_STATE_UNRESOLVED");
    expect(basketItem!.evidenceState?.isCurrentTruth).toBe(false);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(true);
    expect(bundle.unresolvedEvidenceItemIds).toContain(basketItem!.itemId);
    expect(bundle.unresolvedEvidenceItemIds).not.toContain(netIncomeItem!.itemId);
  });

  it("compileCovenantToIR (zero tool calls) still fails closed for the WHOLE compilation attempt because of the ONE unresolved item among several resolved ones", async () => {
    const { index, definitions } = buildRealIndex(DOC, TEXT);
    const effectA = baseEffect({ effectId: "eff-agg-a3", amendmentDocumentId: "amendment-doc-agg-a3", target: definitionTarget(DOC, INSTRUMENT, "Permitted Basket Amount"), newText: `"Permitted Basket Amount" means $8,000,000 (Amendment No. 1).`, effectiveDate: DATED("2021-06-01") });
    const effectB = baseEffect({ effectId: "eff-agg-b3", amendmentDocumentId: "amendment-doc-agg-b3", target: definitionTarget(DOC, INSTRUMENT, "Permitted Basket Amount"), newText: `"Permitted Basket Amount" means $11,000,000 (competing).`, effectiveDate: DATED("2021-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [effectA, effectB] });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: exactTermsFor(DOC, definitions), operativeState: state };
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
    const client: MinimalAnthropicClient = {
      messages: {
        stream: () => ({
          finalMessage: async () =>
            fakeMessage([
              toolUseBlock("t1", "submit_compilation", {
                rules: [{ localRef: "r1", sourceSectionRef: "6.01", covenantFamily: "RESTRICTED_PAYMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: ["answered directly from context"] }],
                definitions: [],
              }),
            ]),
        }),
      },
    };
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });
    expect(result.toolCallLog).toHaveLength(0);
    expect(result.inputHasUnresolvedOperativeEvidence).toBe(true);
    expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).not.toBe("COMPLETED");
  });
});
