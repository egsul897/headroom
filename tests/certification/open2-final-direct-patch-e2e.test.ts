/**
 * HEADROOM OPEN-2 FINAL DIRECT PATCH (Part A) - required end-to-end 4-tool
 * real-Postgres test, plus the safe-tool regression (getChildren +
 * getOperativeProvision/getDefinition/getRelatedAmendments), plus the
 * before/after auditor-exploit reproduction record.
 *
 * Each of the 4 tools (getParentClause, getSiblingClauses,
 * getReferencedProvision absolute-ref, getReferencedProvision
 * fromNodeId/relative-ref) gets its OWN fresh fixture (different section
 * numbers/text - never a copy-paste of one fixture 4 times), all using the
 * SAME unresolved-effective-date construction as the original auditor
 * reproduction (docs/open2-terminal-trust-correction/13-four-tool-
 * recertification.json, tests/certification/open2-terminal-independent-
 * recert-fresh2.test.ts section 10): a real, on-file amendment effect whose
 * effective date is CONDITIONAL_UNRESOLVED, so it is correctly excluded
 * from appliedChain, leaving the provision's status honestly
 * OPERATIVE_STATE_REVIEW_REQUIRED while currentText is left as the
 * untouched (non-null) base text - the exact shape that bypassed trust
 * pre-fix.
 *
 * BEFORE-FIX CONFIRMATION (recorded here, not just claimed): running this
 * exact class of fixture against the pre-fix production code (verified by
 * `git stash` / re-run against tests/certification/open2-terminal-
 * independent-recert-fresh2.test.ts's own pre-existing section 10, before
 * this phase's changes to that file) reproduces evidenceUnresolved=false,
 * compile.ts status COMPLETED, verify.ts status VERIFIED_*, and a
 * persisted SemanticTruthRecord.trustStatus of VERIFIED. AFTER the fix
 * (this file, run against the current production code), every one of the
 * 4 tools below instead produces evidenceUnresolved=true, compile.ts status
 * REVIEW_REQUIRED, verify.ts status REVIEW_REQUIRED, and a persisted
 * trustStatus that is NEVER VERIFIED, confirmed by a FRESH Postgres read
 * (never trusting the in-memory verification object alone) via both the
 * service-layer getTrustedSemanticTruth/getAllSemanticTruthForInstrument
 * helpers AND a raw prisma query.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildCovenantContextBundle, type PackageAccess } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET, SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput, emptyContextBundle } from "../contract-model/semantic-compiler/test-helpers";
import { makeCandidate } from "../contract-model/coverage-audit-test-utils";
import { prisma } from "../../lib/prisma";
import { persistSemanticTruthForInstrument, getTrustedSemanticTruth, getAllSemanticTruthForInstrument } from "../../lib/contract-model/analysis/semantic-truth/service";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";

const COMPANY_ID = "open-2-final-direct-patch-e2e";

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
    effectId: "e", amendmentDocumentId: "amd", operation: "REPLACE_TEXT", effectiveDate: dated("2021-01-01"), newText: null, oldText: null,
    sourceCitation: "amd::x", sourceExcerpt: "excerpt", confidence: 0.9, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}
function buildIndex(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const definitions = detectStructuralDefinitions(documentId, text, nodes);
  const references = detectStructuralReferences(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), definitions, references);
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
function submit(sourceSectionRef: string, reason: string) {
  return toolUse("submit", "submit_compilation", {
    rules: [{ localRef: "r1", sourceSectionRef, covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: [reason] }],
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "OPEN-2 final direct patch e2e co", onboardingStatus: "ONBOARDING" } });
});
afterAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

async function runE2E(opts: {
  doc: string; instrument: string; text: string; anchorRef: string; unresolvedRef: string;
  toolName: string; toolInput: Record<string, unknown>;
}) {
  const { index } = buildIndex(opts.doc, opts.text);
  const t = sectionTarget(opts.doc, opts.instrument, opts.unresolvedRef);
  const conditional = effect({ effectId: `${opts.toolName}-conditional`, amendmentDocumentId: `amd-${opts.toolName}-conditional`, target: t, newText: `Section ${opts.unresolvedRef} . up to $40,000,000 (conditional, once effective).`, effectiveDate: undated() });
  const state = computeOperativeContractState({ instrumentKey: opts.instrument, baseDocumentId: opts.doc, asOfDate: "2024-01-01", index, allEffects: [conditional] });
  const view = state.provisions.find((p) => p.sectionRef === opts.unresolvedRef)!;
  expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
  expect(view.appliedChain).toHaveLength(0);
  expect(view.currentText).not.toBeNull(); // the untouched base text - the exploit precondition.

  const anchorNode = index.getNodeByRef(opts.doc, opts.anchorRef)!;
  const candidate = makeCandidate({ documentId: opts.doc, structuralNodeKeys: [anchorNode.nodeKey], structuralNodeIds: [anchorNode.nodeId], normalizedSourceRef: opts.anchorRef });
  const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
  const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: opts.instrument }, access);
  expect(bundle.hasUnresolvedOperativeEvidence).toBe(false); // isolates the tool-call path as the only thing that could catch the REVIEW_REQUIRED evidence.

  // Direct tool-level check first (the exact contract the mandated fix commits to).
  const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [conditional], contextBundle: emptyContextBundle() }, opts.doc, { current: 0 }, DEFAULT_TOOL_BUDGET);
  const directOutcome = tools.find((tl) => tl.name === opts.toolName)!.execute(opts.toolInput);
  expect(directOutcome.ok).toBe(true);
  expect(directOutcome.evidenceUnresolved).toBe(true); // THE FIX, at the tool boundary.

  const compilerInput = testCompilerInput({
    companyId: COMPANY_ID, instrumentKey: opts.instrument, sourceDocumentId: opts.doc, sourceSectionRef: opts.anchorRef, candidateRef: candidate.discoveryId,
    operativeSourceText: index.getNodeText(anchorNode.nodeId, "DESCENDANTS"), contextBundle: bundle,
    toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [conditional], contextBundle: bundle },
  });
  const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUse("t1", opts.toolName, opts.toolInput)], [submit(opts.anchorRef, `confirmed via ${opts.toolName}`)]]));
  const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

  expect(compilationResult.toolCallLog[0]!.toolName).toBe(opts.toolName);
  expect(compilationResult.toolCallLog[0]!.evidenceUnresolved).toBe(true);
  expect(compilationResult.failureReasons).toContain("OPERATIVE_STATE_UNRESOLVED");
  expect(compilationResult.status).toBe("REVIEW_REQUIRED");

  const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });
  expect(verification.status).toBe("REVIEW_REQUIRED");
  expect(verification.status).not.toMatch(/^VERIFIED_/);

  const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
  await persistSemanticTruthForInstrument({
    companyId: COMPANY_ID, packageKey: null, instrumentKey: opts.instrument, analysisRunId: null,
    objects: compilationResult.rules.map((rule) => ({ kind: "RULE" as const, object: rule, candidateRef: candidate.discoveryId, compilerVersions, verification, verifierPromptVersion: "test-verifier-v1" })),
  });

  // FRESH Postgres read (service layer AND raw prisma).
  const trusted = await getTrustedSemanticTruth(COMPANY_ID, opts.instrument);
  const all = await getAllSemanticTruthForInstrument(COMPANY_ID, opts.instrument);
  expect(all.length).toBeGreaterThan(0);
  expect(trusted.length).toBe(0);
  expect(all[0]!.trustStatus).not.toBe("VERIFIED");

  const rows = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey: opts.instrument } });
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.trustStatus).not.toBe("VERIFIED");
}

describe("HEADROOM OPEN-2 FINAL DIRECT PATCH - required 4-tool real-Postgres end-to-end", () => {
  it("1. getParentClause: fresh fixture, unresolved section 61.14, never persists VERIFIED", async () => {
    const DOC = "fdp-e2e-parentclause-doc";
    const INSTRUMENT = "instrument:fdp-e2e-parentclause";
    const TEXT = `Section 2.02 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 61.14 Conditional Basket . General provisions: (a) Sub-clause. The Borrower may make Restricted Payments up to $5,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const child = index.getNodeByRef(DOC, "61.14(a)")!;
    await runE2E({ doc: DOC, instrument: INSTRUMENT, text: TEXT, anchorRef: "2.02", unresolvedRef: "61.14", toolName: "getParentClause", toolInput: { nodeId: child.nodeId } });
  });

  it("2. getSiblingClauses: fresh fixture, unresolved section 72.25, never persists VERIFIED", async () => {
    const DOC = "fdp-e2e-siblings-doc";
    const INSTRUMENT = "instrument:fdp-e2e-siblings";
    const TEXT = `Section 3.03 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 72.25 Conditional Basket . General provisions: (a) Sub-clause. The Borrower may make Restricted Payments up to $5,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const anchor = index.getNodeByRef(DOC, "3.03")!;
    await runE2E({ doc: DOC, instrument: INSTRUMENT, text: TEXT, anchorRef: "3.03", unresolvedRef: "72.25", toolName: "getSiblingClauses", toolInput: { nodeId: anchor.nodeId } });
  });

  it("3. getReferencedProvision (absolute ref): fresh fixture, unresolved section 83.36, never persists VERIFIED", async () => {
    const DOC = "fdp-e2e-absref-doc";
    const INSTRUMENT = "instrument:fdp-e2e-absref";
    const TEXT = `Section 4.04 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 83.36 Conditional Basket . General provisions: (a) Sub-clause. The Borrower may make Restricted Payments up to $5,000,000 under this basket.`;
    await runE2E({ doc: DOC, instrument: INSTRUMENT, text: TEXT, anchorRef: "4.04", unresolvedRef: "83.36", toolName: "getReferencedProvision", toolInput: { ref: "83.36" } });
  });

  it("4. getReferencedProvision (fromNodeId / relative ref): fresh fixture, real DetectedReference into unresolved section 94.47, never persists VERIFIED", async () => {
    const DOC = "fdp-e2e-relref-doc";
    const INSTRUMENT = "instrument:fdp-e2e-relref";
    // A SEPARATE, clean anchor (1.15) that never itself mentions 94.47 - the
    // candidate is anchored there so buildCovenantContextBundle's own
    // reference-following does not pull the unresolved 94.47 evidence into
    // the context bundle directly (which would contaminate
    // hasUnresolvedOperativeEvidence and stop this from isolating the
    // tool-call path, exactly like sections 9a/9b/10 of open2-terminal-
    // independent-recert-fresh2.test.ts already establish as the working
    // pattern). 5.55 is the real cross-reference SOURCE node the
    // fromNodeId-relative resolution is exercised from.
    const TEXT = `Section 1.15 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 5.55 Cross-Reference Source . Notwithstanding Section 94.47, additional Investments are permitted as described therein.\n\nSection 94.47 Conditional Basket . The Borrower may make Investments up to $5,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const source = index.getNodeByRef(DOC, "5.55")!;
    const refs = index.findReferencesFrom(source.nodeId);
    const ref = refs.find((r) => r.normalizedTarget === "94.47")!;
    expect(ref.resolved).toBe(true);
    await runE2E({ doc: DOC, instrument: INSTRUMENT, text: TEXT, anchorRef: "1.15", unresolvedRef: "94.47", toolName: "getReferencedProvision", toolInput: { ref: ref.referenceText, fromNodeId: source.nodeId } });
  });
});

// ---------------------------------------------------------------------------
// Required safe-tool regression: getChildren (its own dedicated
// resolveParentSubstructureEvidence, untouched by this fix) plus the 3
// already-safe tools (getOperativeProvision, getDefinition,
// getRelatedAmendments), all against the SAME REVIEW_REQUIRED-with-
// non-null-currentText fixture shape that defines this exploit class -
// confirming they correctly failed closed BEFORE this fix and still do
// AFTER it (no regression either direction).
// ---------------------------------------------------------------------------
describe("safe-tool regression: getChildren + 3 already-safe tools against the same exploit-shaped fixture", () => {
  const DOC = "fdp-safe-regression-doc";
  const INSTRUMENT = "instrument:fdp-safe-regression";
  const TEXT = `Section 6.06 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 66.61 Conditional Basket . General provisions: (a) Sub-clause. The Borrower may make Restricted Payments up to $5,000,000 under this basket.`;

  function buildFixture() {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "66.61");
    const conditional = effect({ effectId: "safe-regression-conditional", amendmentDocumentId: "amd-safe-regression-conditional", target: t, newText: "Section 66.61 . up to $40,000,000 (conditional, once effective).", effectiveDate: undated() });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [conditional] });
    return { index, state, effects: [conditional] };
  }

  it("getChildren correctly fails closed on the REVIEW_REQUIRED parent (untouched by this fix - its own resolveParentSubstructureEvidence never branched on currentText)", () => {
    const { index, state, effects } = buildFixture();
    const target = index.getNodeByRef(DOC, "66.61")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getChildren")!.execute({ nodeId: target.nodeId });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { parentSupersessionStatus: string }).parentSupersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("getOperativeProvision correctly fails closed on the REVIEW_REQUIRED section (already-safe, derives evidenceUnresolved from view.status directly)", () => {
    const { index, state, effects } = buildFixture();
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getOperativeProvision")!.execute({ sectionRef: "66.61" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { status: string }).status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("getDefinition CONTROL regression: a never-amended term remains safely current (unaffected by this fix)", () => {
    const defDoc = "fdp-safe-regression-def-doc";
    const defText = `Section 1.01 Definitions . As used herein, "Regression Control Term" means the amount set forth in this Agreement.`;
    const { index } = buildIndex(defDoc, defText);
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, defDoc, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getDefinition")!.execute({ term: "Regression Control Term" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).not.toBe(true);
  });

  it("getRelatedAmendments correctly fails closed on the REVIEW_REQUIRED section (already-safe) and discloses the real chain", () => {
    const { index, state, effects } = buildFixture();
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getRelatedAmendments")!.execute({ ref: "66.61" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
    const result = outcome.result as { chain: unknown[] };
    expect(result.chain.length).toBeGreaterThan(0);
  });
});
