/**
 * HEADROOM OPEN-2 (universal evidence-trust invariant) - INDEPENDENT Part B
 * recertification audit, performed by a separate auditor from the
 * implementer who wrote tests/certification/open-2-fresh-attack-matrix.test.ts
 * and tests/certification/part-b-final-recert-fix2-independent.test.ts (whose
 * own scenario-1 was updated in place to assert the new fixed behavior). This
 * file does not rerun either of those - every scenario below is a FRESH
 * construction, built directly against production code at commit
 * a7ee654f4eec1614ef59d47c5f07c597264edc5a, to independently verify (not
 * merely trust) the implementer's own claim in docs/phase-3f1-human-
 * architecture-decision/06-llm-tool-registry-audit.json ("7 of 14 tools
 * declared CURRENT_OPERATIVE_EVIDENCE; the missing-derivation gap found in 6
 * of them besides getOperativeProvision, all fixed via the one shared
 * isConfirmedCurrentOperativeEvidence helper").
 *
 * ORIGINAL DISPOSITION (as first written): this audit did NOT confirm
 * closure. Section 4 reproduced a genuine, independently-discovered,
 * STILL-OPEN gap in 4 of the 7 CURRENT_OPERATIVE_EVIDENCE tools
 * (getParentClause, getChildren, getSiblingClauses, getReferencedProvision):
 * whenever a real, on-file amendment conflict/ambiguity had not yet been
 * APPLIED as of the analysis date (the ordinary, realistic case of a
 * competing amendment with a future or otherwise-not-yet-effective date, or
 * an amendment whose base target is genuinely ambiguous/unresolved), these
 * four tools silently fell back to a NODE-only supersession check that never
 * consulted the provision's own real OperativeProvisionView.status at all -
 * unlike getOperativeProvision, getDefinition, and getRelatedAmendments,
 * which correctly read view.status directly. Section 4's own "consequence"
 * case proved this reached compile.ts status COMPLETED, verify.ts
 * VERIFIED_NO_MATERIAL_GAP_FOUND, and a persisted SemanticTruthRecord.
 * trustStatus of VERIFIED end to end through real production code.
 *
 * See docs/phase-3f1-human-architecture-decision/16-evidence-tool-
 * recertification.json for the full original disposition writeup.
 *
 * HEADROOM OPEN-2 TERMINAL (Part A) UPDATE: the gap section 4 named is now
 * FIXED (lib/contract-model/compiler/semantic/tools.ts's
 * resolveNodeWithSupersessionAwareness and getChildren's own parent check
 * now derive their trust verdict from the section's real
 * OperativeProvisionView.status UNCONDITIONALLY whenever a matching view
 * exists, never only when currentText happens to be non-null). Section 4's
 * own assertions were re-run against pre-fix code (confirmed reproducing,
 * captured in docs/open2-terminal-trust-correction/06-targeted-tests.json)
 * and then updated in place, exactly like this file's own sibling
 * part-b-final-recert-fix2-independent.test.ts did for its own scenario-1
 * previously, to certify the now-fixed (safe) behavior - never deleted or
 * silently dropped, so the historical exploit shape and its resolution both
 * remain on file. See docs/open2-terminal-trust-correction/04-four-tool-fix.json
 * for the full fix writeup and end-to-end matrix.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState, isConfirmedCurrentOperativeEvidence } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildCovenantContextBundle, type PackageAccess } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { buildToolSet, type ToolOperativeStateDiscipline } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput, emptyContextBundle } from "../contract-model/semantic-compiler/test-helpers";
import { makeCandidate } from "../contract-model/coverage-audit-test-utils";
import { prisma } from "../../lib/prisma";
import { persistSemanticTruthForInstrument, getTrustedSemanticTruth, getAllSemanticTruthForInstrument } from "../../lib/contract-model/analysis/semantic-truth/service";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";

const COMPANY_ID = "open-2-indep-recert-fresh";

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
    effectId: "e",
    amendmentDocumentId: "amd",
    operation: "REPLACE_TEXT",
    effectiveDate: dated("2021-01-01"),
    newText: null,
    oldText: null,
    sourceCitation: "amd::x",
    sourceExcerpt: "excerpt",
    confidence: 0.9,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}
function buildIndex(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const definitions = detectStructuralDefinitions(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), definitions, []);
  return { index, nodes, definitions };
}
function msg(content: Anthropic.ContentBlock[]): Anthropic.Message {
  return {
    id: "msg", container: null, content, model: "claude-sonnet-5", role: "assistant",
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", stop_sequence: null, type: "message",
    usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null } as Anthropic.Usage,
  } as Anthropic.Message;
}
function toolUse(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}
function submit(overrides: Record<string, unknown> = {}) {
  return toolUse("submit", "submit_compilation", {
    rules: [{ localRef: "r1", sourceSectionRef: "6.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: ["confirmed via tool call"], ...overrides }],
    definitions: [],
  });
}
function scriptedClient(turns: Anthropic.ContentBlock[][]): MinimalAnthropicClient {
  let turn = 0;
  return { messages: { stream: () => ({ finalMessage: async () => { const c = turns[turn] ?? turns[turns.length - 1]!; turn++; return msg(c); } }) } };
}

beforeAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "OPEN-2 independent fresh recert co", onboardingStatus: "ONBOARDING" } });
});
afterAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

// ---------------------------------------------------------------------------
// 1. INDEPENDENT REGISTRY RECOUNT - read buildToolSet's actual returned
// definitions directly (never trust the implementer's own JSON report's
// count) against a minimal real access object.
// ---------------------------------------------------------------------------
describe("1. independent registry recount", () => {
  it("exactly 7 of 14 tools are declared CURRENT_OPERATIVE_EVIDENCE, and they are exactly the 7 the implementer's report names", () => {
    const { index } = buildIndex("registry-doc", "Section 1.01 Definitions . text.\n\nSection 6.01 Indebtedness . text.");
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, "registry-doc", charsUsed, DEFAULT_TOOL_BUDGET);
    expect(tools).toHaveLength(14);
    const byDiscipline = new Map<ToolOperativeStateDiscipline, string[]>();
    for (const t of tools) {
      const list = byDiscipline.get(t.operativeStateDiscipline) ?? [];
      list.push(t.name);
      byDiscipline.set(t.operativeStateDiscipline, list);
    }
    const current = (byDiscipline.get("CURRENT_OPERATIVE_EVIDENCE") ?? []).sort();
    expect(current).toEqual(["getChildren", "getDefinition", "getOperativeProvision", "getParentClause", "getReferencedProvision", "getRelatedAmendments", "getSiblingClauses"].sort());
    expect(byDiscipline.get("HISTORICAL_EVIDENCE_WITH_STATUS")?.sort()).toEqual(["getContextBundleComponent", "getPriorVersion", "getSharedCapContext", "getSourceSpan"].sort());
    expect(byDiscipline.get("NOT_CONTRACT_TEXT_EVIDENCE")?.sort()).toEqual(["getDefinitionDependencies", "getInstrumentDocuments", "getRuleDependency"].sort());
  });
});

// ---------------------------------------------------------------------------
// 2. ORIGINAL EXPLOIT REPRODUCTION (fresh fixture) - getOperativeProvision on
// a genuinely, currently-EFFECTIVE conflicted section, confirming (a) it now
// fails closed, and (b) REVIEW_REQUIRED is the actually-correct outcome (real
// evidence disclosed for human adjudication), not merely a different unsafe
// status.
// ---------------------------------------------------------------------------
describe("2. original getOperativeProvision exploit - fresh fixture, reasoned confirmation of closure", () => {
  const DOC = "recert-doc-original-exploit";
  const INSTRUMENT = "instrument:recert-original-exploit";
  // Section 4.01 (the candidate's own primary source) states the SAME
  // $5,000,000 figure the compiled rule asserts, exactly mirroring the
  // established test-infra convention (see e.g. tests/certification/open-2-
  // fresh-attack-matrix.test.ts's own scenario 2) so Layer 1's independent
  // deterministic reconciliation has nothing of its own to flag - this
  // isolates the operative-state trust gate itself as the only thing that
  // could catch the conflicted 7.15 evidence reached via the tool call. Its
  // heading is a single word ("Indebtedness") so its own text never trips
  // the retrieval pipeline's separate, unrelated Title-Case-phrase "possible
  // undeclared defined term" heuristic (extractCandidatePhrases in
  // context-retrieval/pipeline.ts), which would otherwise force
  // sufficiencyState away from SUFFICIENT for a reason that has nothing to
  // do with OPEN-2.
  const TEXT = `Section 4.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 7.15 Investments Basket . The Borrower may make Investments up to $5,000,000 under this basket.`;

  function buildState() {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "7.15");
    const a = effect({ effectId: "orig-a", amendmentDocumentId: "amd-orig-a", target: t, newText: "Section 7.15 . up to $11,000,000 (Amendment No. 3).", effectiveDate: dated("2020-03-01") });
    const b = effect({ effectId: "orig-b", amendmentDocumentId: "amd-orig-b", target: t, newText: "Section 7.15 . up to $18,500,000 (competing side letter).", effectiveDate: dated("2020-03-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a, b] });
    return { index, state, access: { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state } as PackageAccess };
  }

  it("SETUP: 7.15 is genuinely, currently OPERATIVE_STATE_CONFLICTED (real, already-effective amendments) with two real disclosed candidateTexts and no fabricated currentText", () => {
    const { state } = buildState();
    const view = state.provisions.find((p) => p.sectionRef === "7.15")!;
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(view.currentText).toBeNull();
    expect(view.candidateTexts.sort()).toEqual(["Section 7.15 . up to $11,000,000 (Amendment No. 3).", "Section 7.15 . up to $18,500,000 (competing side letter)."].sort());
  });

  it("reproduction: end to end through compile+verify+persist, the exploit no longer reaches COMPLETED/VERIFIED, and REVIEW_REQUIRED correctly surfaces both real competing numbers for a human to adjudicate", async () => {
    const { index, state, access } = buildState();
    const node = index.getNodeByRef(DOC, "4.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: "4.01" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: INSTRUMENT, sourceDocumentId: DOC, sourceSectionRef: "4.01", candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"), contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: bundle },
    });
    const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUse("t1", "getOperativeProvision", { sectionRef: "7.15" })], [submit({ sufficiencyReasons: ["read the current 7.15 basket via tool call"] })]]));
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(compilationResult.toolCallLog[0]!.evidenceUnresolved).toBe(true);
    expect(compilationResult.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    // Correctness reasoning, not just "not COMPLETED": REVIEW_REQUIRED is the
    // deliberate human-adjudication state (verify.ts's determineStatus checks
    // this exact condition before any reconciliation-based finding), never a
    // silent error/crash and never a downgrade to a WORSE-but-still-unsafe
    // status like a fabricated CONTRADICTED - it is the honest "cannot be
    // machine-resolved, a person must look" outcome the underlying real
    // evidence (two competing captured texts, no evidence-based precedence
    // rule) genuinely warrants.
    expect(compilationResult.status).toBe("REVIEW_REQUIRED");

    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });
    expect(verification.status).toBe("REVIEW_REQUIRED");
    expect(verification.status).not.toMatch(/^VERIFIED_/);

    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
    await persistSemanticTruthForInstrument({
      companyId: COMPANY_ID, packageKey: null, instrumentKey: INSTRUMENT, analysisRunId: null,
      objects: compilationResult.rules.map((rule) => ({ kind: "RULE" as const, object: rule, candidateRef: candidate.discoveryId, compilerVersions, verification, verifierPromptVersion: "test-verifier-v1" })),
    });
    const trusted = await getTrustedSemanticTruth(COMPANY_ID, INSTRUMENT);
    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, INSTRUMENT);
    expect(trusted.length).toBe(0);
    expect(all[0]!.trustStatus).toBe("REVIEW_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// 3. CURRENT baseline for all 7 CURRENT_OPERATIVE_EVIDENCE tools (fresh
// never-amended fixture with a real parent/children/siblings structure) -
// every tool must be usable and never falsely flag safe evidence.
// ---------------------------------------------------------------------------
describe("3. CURRENT baseline (never-amended, real structure) for every one of the 7 tools", () => {
  const DOC = "recert-doc-current-baseline";
  const INSTRUMENT = "instrument:recert-current-baseline";
  const TEXT = `Section 1.01 Definitions . As used herein, "Fixed Charge Coverage Ratio" means the ratio described in this Agreement.\n\nSection 6.01 Indebtedness . text.\n\nSection 8.30 Restricted Payments Basket . General provisions apply as follows: (a) General Basket. The Borrower may make Restricted Payments up to $5,000,000. (b) Additional Basket. The Borrower may make Restricted Payments up to $3,000,000.\n\nSection 9.10 Cross Reference Test . Notwithstanding Section 8.30, additional payments are permitted.`;

  function buildState() {
    const { index, definitions } = buildIndex(DOC, TEXT);
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [] });
    return { index, state, definitions };
  }

  it("every tool's execute() reports evidenceUnresolved falsy on genuinely current, never-amended evidence", () => {
    const { index, state } = buildState();
    const charsUsed = { current: 0 };
    const access = { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [] as AmendmentEffectCandidate[], contextBundle: emptyContextBundle() };
    const tools = buildToolSet(access, DOC, charsUsed, DEFAULT_TOOL_BUDGET);
    const parent = index.getNodeByRef(DOC, "8.30")!;
    const child = index.getNodeByRef(DOC, "8.30(a)")!;

    const cases: Array<[string, Record<string, unknown>]> = [
      ["getOperativeProvision", { sectionRef: "8.30" }],
      ["getDefinition", { term: "Fixed Charge Coverage Ratio" }],
      ["getParentClause", { nodeId: child.nodeId }],
      ["getChildren", { nodeId: parent.nodeId }],
      ["getSiblingClauses", { nodeId: child.nodeId }],
      ["getReferencedProvision", { ref: "8.30" }],
      ["getRelatedAmendments", { ref: "8.30" }],
    ];
    for (const [name, input] of cases) {
      if (name === "getRelatedAmendments") continue; // no amendment history at all - covered separately below (a legitimate refusal, not a CURRENT case).
      const outcome = tools.find((t) => t.name === name)!.execute(input);
      expect(outcome.ok, `${name} expected ok:true`).toBe(true);
      expect(outcome.evidenceUnresolved, `${name} expected evidenceUnresolved falsy`).not.toBe(true);
    }
    // getRelatedAmendments has no chain at all for a never-amended section -
    // an honest refusal (there is no amendment history to report), not a
    // fabricated CURRENT result - evidenceUnresolved must never be
    // fabricated true for a refusal either.
    const related = tools.find((t) => t.name === "getRelatedAmendments")!.execute({ ref: "8.30" });
    expect(related.ok).toBe(false);
    expect(related.evidenceUnresolved).not.toBe(true);
  });

  it("getRelatedAmendments CURRENT case: a real, cleanly-RESOLVED amendment chain reports evidenceUnresolved falsy", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "8.30");
    const a = effect({ effectId: "clean-a", amendmentDocumentId: "amd-clean", target: t, newText: "Section 8.30 . up to $5,000,000 restated cleanly.", effectiveDate: dated("2020-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [a] });
    expect(state.provisions.find((p) => p.sectionRef === "8.30")!.status).toBe("OPERATIVE_STATE_RESOLVED");
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a], contextBundle: emptyContextBundle() }, DOC, charsUsed, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getRelatedAmendments")!.execute({ ref: "8.30" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. HEADROOM OPEN-2 TERMINAL (Part A) - this section originally
// falsified getParentClause/getChildren/getSiblingClauses/
// getReferencedProvision against a genuinely CONFLICTED provision whose
// competing effects had NOT yet applied as of the analysis date (a real,
// on-file amendment with a stated future/not-yet-effective date competing
// with another - an entirely ordinary real-world shape, e.g. a
// signed-but-not-yet-effective side letter). Confirmed reproducing against
// pre-fix production code (all 5 assertions below passed before this fix -
// see docs/open2-terminal-trust-correction/06-targeted-tests.json for the
// captured pre-fix run). ROOT CAUSE: the shared
// resolveNodeWithSupersessionAwareness helper (and getChildren's own parity
// check) only consulted view.status when view.currentText happened to be
// non-null; a CONFLICTED (or targetUnresolved/structuralHealthUnsafe-
// PARTIAL) view ALWAYS has currentText === null by buildProvisionView's own
// design, so these four tools silently fell through to a raw per-PHYSICAL-
// NODE supersession check that has no record of this node at all unless
// something has actually applied over it - reporting CURRENT_OPERATIVE by
// omission.
//
// FIXED (lib/contract-model/compiler/semantic/tools.ts): both
// resolveNodeWithSupersessionAwareness and getChildren's own parent check
// now derive their trust verdict from the section's real
// OperativeProvisionView.status UNCONDITIONALLY whenever a matching view
// exists - never only when currentText happens to be present. The
// assertions below now certify the FIXED (safe) behavior.
// ---------------------------------------------------------------------------
describe("4. FIXED: prospective (not-yet-applied) CONFLICTED provision no longer bypasses getParentClause/getChildren/getSiblingClauses/getReferencedProvision", () => {
  const DOC = "recert-doc-prospective-conflict";
  const INSTRUMENT = "instrument:recert-prospective-conflict";
  // Section 5.01 (the candidate's own primary source) states the SAME
  // $5,000,000 figure the compiled rule asserts (see scenario 2's own
  // comment on this convention), with a single-word heading for the same
  // reason as scenario 2's own comment explains - isolates the tool-call
  // path as the only thing that could catch the conflicted 7.40 evidence.
  const TEXT = `Section 5.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 7.40 Restricted Payments Basket . Distributions are permitted as follows: (a) General Basket. The Borrower may make Restricted Payments up to $5,000,000. (b) Additional Basket. The Borrower may make Restricted Payments up to $3,000,000.`;

  function buildState() {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "7.40");
    // Two REAL, on-file, competing effects sharing the SAME future effective
    // date - a genuine AMENDMENT_CONFLICT per chain.ts's own §22 rule,
    // computed independent of whether the date has passed - but the query
    // asOfDate (2022) is well BEFORE either effect's stated date (2099), so
    // the applied-chain loop in buildProvisionView never runs for this
    // provision at all (appliedChain.length === 0).
    const a = effect({ effectId: "prospective-a", amendmentDocumentId: "amd-prospective-a", target: t, newText: "Section 7.40 . up to $9,000,000 (proposed Amendment No. 1, not yet effective).", effectiveDate: dated("2099-01-01") });
    const b = effect({ effectId: "prospective-b", amendmentDocumentId: "amd-prospective-b", target: t, newText: "Section 7.40 . up to $15,000,000 (competing proposed restatement, not yet effective).", effectiveDate: dated("2099-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [a, b] });
    return { index, state, effects: [a, b] };
  }

  it("SETUP: 7.40 is genuinely OPERATIVE_STATE_CONFLICTED with a real, disclosed conflict, currentText withheld, and ZERO applied effects (the prospective/not-yet-applied shape)", () => {
    const { state } = buildState();
    const view = state.provisions.find((p) => p.sectionRef === "7.40")!;
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(view.currentText).toBeNull();
    expect(view.appliedChain).toHaveLength(0);
    expect(view.supersededSourceNodeIds).toHaveLength(0); // confirms the node-level supersession index has nothing recorded for this node.
  });

  it("CONTRAST (still safe): getOperativeProvision, getDefinition-class getRelatedAmendments both correctly set evidenceUnresolved=true for this exact prospective conflict", () => {
    const { index, state, effects } = buildState();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, charsUsed, DEFAULT_TOOL_BUDGET);
    const opProv = tools.find((t) => t.name === "getOperativeProvision")!.execute({ sectionRef: "7.40" });
    expect(opProv.evidenceUnresolved).toBe(true);
    const related = tools.find((t) => t.name === "getRelatedAmendments")!.execute({ ref: "7.40" });
    expect(related.evidenceUnresolved).toBe(true);
  });

  it("FIXED: getParentClause on a CHILD of the conflicted section no longer reports CURRENT_OPERATIVE and now correctly sets evidenceUnresolved=true", () => {
    const { index, state, effects } = buildState();
    const child = index.getNodeByRef(DOC, "7.40(a)")!;
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, charsUsed, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getParentClause")!.execute({ nodeId: child.nodeId });
    expect(outcome.ok).toBe(true);
    // FIXED: the parent's own real OperativeProvisionView.status (CONFLICTED)
    // now gates this unconditionally - never CURRENT_OPERATIVE merely
    // because the physical node itself hasn't (yet) been superseded.
    expect((outcome.result as { supersessionStatus: string }).supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("FIXED: getChildren on the conflicted section's OWN node no longer reports parentSupersessionStatus CURRENT_OPERATIVE and now correctly sets evidenceUnresolved=true", () => {
    const { index, state, effects } = buildState();
    const parent = index.getNodeByRef(DOC, "7.40")!;
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, charsUsed, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getChildren")!.execute({ nodeId: parent.nodeId });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { parentSupersessionStatus: string }).parentSupersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("FIXED: getSiblingClauses reading the conflicted section as a sibling no longer reports CURRENT_OPERATIVE and now correctly sets evidenceUnresolved=true", () => {
    const { index, state, effects } = buildState();
    const node501 = index.getNodeByRef(DOC, "5.01")!;
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, charsUsed, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getSiblingClauses")!.execute({ nodeId: node501.nodeId });
    expect(outcome.ok).toBe(true);
    const siblings = (outcome.result as { siblings: { sectionRef: string; supersessionStatus: string }[] }).siblings;
    const conflictedSibling = siblings.find((s) => s.sectionRef === "7.40")!;
    expect(conflictedSibling).toBeDefined();
    expect(conflictedSibling.supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("FIXED: getReferencedProvision resolving an absolute reference to the conflicted section no longer reports CURRENT_OPERATIVE and now correctly sets evidenceUnresolved=true", () => {
    const { index, state, effects } = buildState();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, charsUsed, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: "7.40" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { supersessionStatus: string }).supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("FIXED, PROVEN END TO END: a real getSiblingClauses tool call reaching the prospectively-conflicted section no longer drives the rule to compile.ts COMPLETED/verify.ts VERIFIED - it now correctly reaches REVIEW_REQUIRED and no SemanticTruthRecord persists as trusted VERIFIED", async () => {
    const { index, state, effects } = buildState();
    const node501 = index.getNodeByRef(DOC, "5.01")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node501.nodeKey], structuralNodeIds: [node501.nodeId], normalizedSourceRef: "5.01" });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(false); // isolates the tool-call path - this is not the already-fixed bundle-level gap.

    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: INSTRUMENT, sourceDocumentId: DOC, sourceSectionRef: "5.01", candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node501.nodeId, "DESCENDANTS"), contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: bundle },
    });
    const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUse("t1", "getSiblingClauses", { nodeId: node501.nodeId })], [submit({ sufficiencyReasons: ["confirmed the $5,000,000 basket via getSiblingClauses"] })]]));
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(compilationResult.toolCallLog).toHaveLength(1);
    expect(compilationResult.toolCallLog[0]!.toolName).toBe("getSiblingClauses");
    // THE FIX, END TO END:
    expect(compilationResult.toolCallLog[0]!.evidenceUnresolved).toBe(true);
    expect(compilationResult.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(compilationResult.status).toBe("REVIEW_REQUIRED");

    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });
    expect(verification.status).toBe("REVIEW_REQUIRED");
    expect(verification.status).not.toMatch(/^VERIFIED_/);

    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
    await persistSemanticTruthForInstrument({
      companyId: COMPANY_ID, packageKey: null, instrumentKey: INSTRUMENT, analysisRunId: null,
      objects: compilationResult.rules.map((rule) => ({ kind: "RULE" as const, object: rule, candidateRef: candidate.discoveryId, compilerVersions, verification, verifierPromptVersion: "test-verifier-v1" })),
    });
    const trusted = await getTrustedSemanticTruth(COMPANY_ID, INSTRUMENT);
    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, INSTRUMENT);
    expect(all.length).toBeGreaterThan(0);
    // THE FULL FIX: a rule whose real justification depended on a genuinely
    // CONFLICTED section can no longer persist as trusted current truth.
    expect(trusted.length).toBe(0);
    expect(all[0]!.trustStatus).toBe("REVIEW_REQUIRED");
  });

  it("root cause, confirmed directly against amendment/operative-state.ts: isConfirmedCurrentOperativeEvidence itself is correct (CONFLICTED is never a confirmed-current value) - the defect is which status value the 4 broken tools pass to it, not the shared helper", () => {
    expect(isConfirmedCurrentOperativeEvidence("OPERATIVE_STATE_CONFLICTED")).toBe(false);
    expect(isConfirmedCurrentOperativeEvidence("OPERATIVE_STATE_RESOLVED")).toBe(true);
    expect(isConfirmedCurrentOperativeEvidence("CURRENT_OPERATIVE")).toBe(true);
    expect(isConfirmedCurrentOperativeEvidence("UNKNOWN_SUPERSESSION_STATUS")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Aggregation across DIFFERENT tools (not two calls of the same tool),
// both call orders - using a shape the fix DOES correctly catch (an
// already-EFFECTIVE, past-dated conflict, so the aggregation logic itself is
// isolated from the section-4 gap).
// ---------------------------------------------------------------------------
describe("5. cross-tool aggregation OR, both orders", () => {
  const DOC = "recert-doc-cross-tool-agg";
  const INSTRUMENT = "instrument:recert-cross-tool-agg";
  // Section 3.01 (the candidate's own primary source in every scenario
  // below) states the SAME $5,000,000 figure submit()'s default rule
  // asserts, isolating the operative-state trust gate from Layer 1's own
  // independent deterministic reconciliation (see scenario 2's own comment).
  const TEXT = `Section 3.01 Baseline . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 6.01 Indebtedness . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 8.55 Liens Basket . Liens are permitted up to $5,000,000 under this basket.`;

  function buildState() {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "8.55");
    // Already-EFFECTIVE (past-dated) conflict - correctly caught by every
    // tool via KNOWN_SUPERSEDED, per section 4's own contrast finding.
    const a = effect({ effectId: "agg-a", amendmentDocumentId: "amd-agg-a", target: t, newText: "Section 8.55 . up to $9,000,000 (Amendment No. 1).", effectiveDate: dated("2020-06-01") });
    const b = effect({ effectId: "agg-b", amendmentDocumentId: "amd-agg-b", target: t, newText: "Section 8.55 . up to $16,000,000 (competing restatement).", effectiveDate: dated("2020-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [a, b] });
    return { index, state, effects: [a, b] };
  }

  async function runAttempt(nodeForCandidate: string, turns: Anthropic.ContentBlock[][]) {
    const { index, state, effects } = buildState();
    const node = index.getNodeByRef(DOC, nodeForCandidate)!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node.nodeKey], structuralNodeIds: [node.nodeId], normalizedSourceRef: nodeForCandidate });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: INSTRUMENT, sourceDocumentId: DOC, sourceSectionRef: nodeForCandidate, candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node.nodeId, "DESCENDANTS"), contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: bundle },
    });
    const caller = new RealSemanticCaller("test", "test-model", scriptedClient(turns));
    return compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });
  }

  it("getDefinition-shaped-safe call FIRST (getRelatedAmendments refusal on never-amended 3.01), then getOperativeProvision UNRESOLVED SECOND on 8.55 - aggregate ORs", async () => {
    const result = await runAttempt("3.01", [[toolUse("t1", "getRelatedAmendments", { ref: "3.01" })], [toolUse("t2", "getOperativeProvision", { sectionRef: "8.55" })], [submit()]]);
    expect(result.toolCallLog).toHaveLength(2);
    expect(result.toolCallLog[0]!.evidenceUnresolved).not.toBe(true);
    expect(result.toolCallLog[1]!.evidenceUnresolved).toBe(true);
    expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).toBe("REVIEW_REQUIRED");
  });

  it("UNRESOLVED call (getOperativeProvision on 8.55) FIRST, then a DIFFERENT, safe tool (getReferencedProvision on 3.01) SECOND - the later safe call from a DIFFERENT tool never erases the earlier one", async () => {
    const result = await runAttempt("3.01", [[toolUse("t1", "getOperativeProvision", { sectionRef: "8.55" })], [toolUse("t2", "getReferencedProvision", { ref: "3.01" })], [submit()]]);
    expect(result.toolCallLog).toHaveLength(2);
    expect(result.toolCallLog[0]!.evidenceUnresolved).toBe(true);
    expect(result.toolCallLog[1]!.evidenceUnresolved).not.toBe(true);
    expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).toBe("REVIEW_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// 6. Model-ignores-warning, fresh construction on a DIFFERENT tool
// (getParentClause on an already-effective known-superseded section) - the
// deterministic gate must fail closed regardless of the model's own
// self-reported confidence.
// ---------------------------------------------------------------------------
describe("6. scripted model ignores an unresolved warning from getParentClause and submits COMPLETE anyway", () => {
  const DOC = "recert-doc-ignored-warning-parentclause";
  const INSTRUMENT = "instrument:recert-ignored-warning-parentclause";
  // Section 2.01 (the candidate's own primary source) states the SAME
  // $5,000,000 figure the compiled rule asserts, and uses a single-word
  // heading ("Anchor") so its own text never trips the retrieval pipeline's
  // separate, unrelated Title-Case-phrase "possible undeclared defined term"
  // heuristic (extractCandidatePhrases in context-retrieval/pipeline.ts) -
  // isolating the OPEN-2 gate under test from that different mechanism.
  const TEXT = `Section 2.01 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 6.70 Restricted Payments Basket . General provisions apply as follows: (a) General Basket. The Borrower may make Restricted Payments up to $5,000,000. (b) Additional Basket. Up to $3,000,000.`;

  it("the model reads a KNOWN_SUPERSEDED parent clause via getParentClause, claims high confidence anyway, but the deterministic gate still forces REVIEW_REQUIRED", async () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "6.70");
    // Two REAL, already-EFFECTIVE (past-dated, same date) competing effects -
    // a genuine AMENDMENT_CONFLICT that HAS actually applied as of the query
    // date, so the base physical node is genuinely recorded KNOWN_SUPERSEDED
    // in the node-level supersession index (section 4's own "contrast" case
    // - the shape the fix DOES correctly catch, deliberately used here so
    // this scenario isolates the model-ignores-the-warning question from
    // section 4's own still-open gap).
    const a = effect({ effectId: "ignore-a", amendmentDocumentId: "amd-ignore-a", target: t, newText: "Section 6.70 (restated) . up to $9,000,000 (Amendment No. 1).", effectiveDate: dated("2019-01-01") });
    const b = effect({ effectId: "ignore-b", amendmentDocumentId: "amd-ignore-b", target: t, newText: "Section 6.70 (restated) . up to $14,000,000 (competing restatement).", effectiveDate: dated("2019-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [a, b] });
    expect(state.provisions.find((p) => p.sectionRef === "6.70")!.status).toBe("OPERATIVE_STATE_CONFLICTED");
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
    const node201 = index.getNodeByRef(DOC, "2.01")!;
    const childNode = index.getNodeByRef(DOC, "6.70(a)")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node201.nodeKey], structuralNodeIds: [node201.nodeId], normalizedSourceRef: "2.01" });
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: INSTRUMENT, sourceDocumentId: DOC, sourceSectionRef: "2.01", candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node201.nodeId, "DESCENDANTS"), contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a, b], contextBundle: bundle },
    });
    const caller = new RealSemanticCaller(
      "test", "test-model",
      scriptedClient([[toolUse("t1", "getParentClause", { nodeId: childNode.nodeId })], [submit({ sufficiency: "COMPLETE", sufficiencyReasons: ["I read the parent clause via tool call and am confident despite any restatement history"] })]])
    );
    const result = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(result.toolCallLog[0]!.toolName).toBe("getParentClause");
    expect(result.toolCallLog[0]!.evidenceUnresolved).toBe(true);
    expect(result.rules[0]?.sufficiency).toBe("COMPLETE"); // the model's own self-report, unmodified.
    // The ATTEMPT-level status is never overridden by the model's own claim.
    expect(result.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.status).not.toBe("COMPLETED");
  });
});
