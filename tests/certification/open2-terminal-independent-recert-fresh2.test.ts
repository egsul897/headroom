/**
 * HEADROOM OPEN-2 TERMINAL (Part A) - SECOND, INDEPENDENT recertification
 * audit, performed by a separate auditor from the implementer of commit
 * b3773adb8643d83cb2c57c029aef7eded59199ec ("OPEN-2 terminal trust
 * correction (Part A): fix resolveNodeWithSupersessionAwareness"). Every
 * scenario below is a FRESH construction the implementer's own test files
 * (tests/contract-model/open2-terminal-four-tool-matrix.test.ts,
 * tests/contract-model/open2-terminal-clean-deletion.test.ts,
 * tests/certification/open-2-recert-independent-fresh.test.ts) do not
 * already cover - never a rerun of their fixtures. Read those three files
 * first (see this file's own commit message / accompanying disclosure
 * docs for the summary of what they already prove) - this file goes
 * beyond their coverage, not around it.
 *
 * Root cause independently re-derived from lib/contract-model/compiler/
 * semantic/tools.ts and lib/contract-model/compiler/amendment/
 * operative-state.ts/types.ts read in full (see docs/open2-terminal-
 * trust-correction/13-four-tool-recertification.json for the writeup):
 * resolveNodeWithSupersessionAwareness's fix is real - `view.status` now
 * gates `evidenceCurrent` unconditionally whenever a matching
 * OperativeProvisionView exists, decoupled from whether `view.currentText`
 * happens to be non-null. getChildren's own separate
 * resolveParentSubstructureEvidence check (NOT a call to
 * resolveNodeWithSupersessionAwareness - confirmed by direct code read)
 * applies the equivalent fix for its own, structurally different question
 * (parent substructure validity, not text trust).
 *
 * NEW GROUND COVERED HERE (not in the implementer's own 32-cell matrix or
 * fresh-fixture file):
 *   - a mixed chain: one real, ALREADY-APPLIED clean amendment followed by
 *     two real, NOT-yet-applied competing amendments on the SAME section
 *     (hasConflict is true regardless of which conflict is prospective) -
 *     attacked via getReferencedProvision AND getParentClause.
 *   - the exact analysis-BOUNDARY effective date (effectiveDate ===
 *     asOfDate, inclusive per chain.ts's own `<=`), both as a genuine
 *     boundary conflict (two effects sharing that exact date) attacked via
 *     getChildren, and as a clean single-effect boundary control attacked
 *     via getSiblingClauses.
 *   - a genuinely AMBIGUOUS target (two real physical occurrences sharing
 *     the same legal section reference in the base document - a real
 *     drafting collision, not a hand-waved fixture) producing
 *     OPERATIVE_STATE_PARTIAL, attacked via getSiblingClauses and (for the
 *     3-safe-tool regression) getRelatedAmendments.
 *   - getReferencedProvision's OTHER code path - the `fromNodeId` relative-
 *     reference resolution branch (DetectedReference-based), never
 *     exercised by the implementer's own fresh file (which only ever calls
 *     getReferencedProvision with an absolute `ref`) - targeting a
 *     REVIEW_REQUIRED (undated effective date) provision.
 *   - 3-sibling aggregate masking (2 clean + 1 unresolved), rather than the
 *     2-sibling shape already covered elsewhere.
 *   - clean-deletion attacked via getParentClause and getChildren
 *     specifically (the implementer's own clean-deletion file only ever
 *     used getReferencedProvision and getSiblingClauses).
 *   - fresh regression fixtures for all 3 previously-safe tools
 *     (getOperativeProvision's raw-fallback/known-superseded-by-relabeling
 *     branch, getDefinition on a prospective-conflicted DEFINITION-kind
 *     amendment, getRelatedAmendments on a genuinely AMBIGUOUS-target
 *     PARTIAL provision).
 *   - two independent real-Postgres end-to-end persisted-trust checks
 *     (section 9 below): the original exploit shape via getSiblingClauses
 *     on an entirely fresh company/document, and this file's own mixed-
 *     chain variant via getParentClause.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState, isConfirmedCurrentOperativeEvidence } from "../../lib/contract-model/compiler/amendment/operative-state";
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
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

const COMPANY_ID = "open-2-indep-recert-fresh2";

function dated(date: string): EffectiveDateResult {
  return { date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `stated effective ${date}`, reason: "explicit effective date clause" };
}
function undated(): EffectiveDateResult {
  return { date: null, status: "CONDITIONAL_UNRESOLVED", evidence: "effectiveness conditioned on a future event not yet satisfied", reason: "no fixed date could be established" };
}
function sectionTarget(documentId: string, instrumentKey: string, sectionRef: string): AmendmentTarget {
  return { kind: "SECTION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}
function definitionTarget(documentId: string, instrumentKey: string, term: string): AmendmentTarget {
  return { kind: "DEFINITION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: term, targetHint: null };
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
function submit(overrides: Record<string, unknown> = {}) {
  return toolUse("submit", "submit_compilation", {
    rules: [{ localRef: "r1", sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 5_000_000, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: ["confirmed via tool call"], ...overrides }],
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "OPEN-2 independent fresh recert co 2", onboardingStatus: "ONBOARDING" } });
});
afterAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

// ---------------------------------------------------------------------------
// 1. MIXED CHAIN: a real, already-applied clean amendment followed by two
// real, NOT-yet-applied competing amendments on the SAME section. Confirms
// the fix does not accidentally trust the section merely because SOMETHING
// applied cleanly - a real, on-file future conflict must still gate trust,
// even riding on top of an already-settled applied predecessor.
// ---------------------------------------------------------------------------
describe("1. mixed chain (applied-clean + prospective-conflict) attacks getReferencedProvision and getParentClause", () => {
  const DOC = "fresh2-mixed-chain-doc";
  const INSTRUMENT = "instrument:fresh2-mixed-chain";
  const TEXT = `Section 2.10 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 11.20 Restricted Payments Basket . General provisions: (a) General Basket. The Borrower may make Restricted Payments up to $5,000,000.`;

  function buildState() {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "11.20");
    const applied = effect({ effectId: "mix-applied", amendmentDocumentId: "amd-mix-applied", target: t, newText: "Section 11.20 . up to $6,000,000 (Amendment No. 1, cleanly applied).", effectiveDate: dated("2018-01-01") });
    const futureA = effect({ effectId: "mix-future-a", amendmentDocumentId: "amd-mix-future-a", target: t, newText: "Section 11.20 . up to $20,000,000 (proposed Amendment No. 2).", effectiveDate: dated("2099-06-01") });
    const futureB = effect({ effectId: "mix-future-b", amendmentDocumentId: "amd-mix-future-b", target: t, newText: "Section 11.20 . up to $30,000,000 (competing proposed side letter).", effectiveDate: dated("2099-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [applied, futureA, futureB] });
    return { index, state, effects: [applied, futureA, futureB] };
  }

  it("SETUP: status is CONFLICTED despite a real applied predecessor, currentText null, appliedChain has exactly the clean predecessor (1 entry), and the base node IS recorded superseded (by the applied effect, not by either prospective one)", () => {
    const { state } = buildState();
    const view = state.provisions.find((p) => p.sectionRef === "11.20")!;
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(view.currentText).toBeNull();
    expect(view.appliedChain).toHaveLength(1);
    expect(view.appliedChain[0]!.effectId).toBe("mix-applied");
    expect(view.supersededSourceNodeIds.length).toBeGreaterThan(0); // the base node WAS physically superseded by the applied predecessor.
    expect(view.candidateTexts.sort()).toEqual(["Section 11.20 . up to $20,000,000 (proposed Amendment No. 2).", "Section 11.20 . up to $30,000,000 (competing proposed side letter)."].sort());
  });

  it("getReferencedProvision must NOT report CURRENT_OPERATIVE merely because the base node is independently KNOWN_SUPERSEDED (by the clean predecessor) - the real, on-file prospective conflict must still gate trust", () => {
    const { index, state, effects } = buildState();
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: "11.20" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { supersessionStatus: string }).supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("getParentClause on a child of the mixed-chain section also fails closed", () => {
    const { index, state, effects } = buildState();
    const childNode = index.getNodeByRef(DOC, "11.20(a)")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getParentClause")!.execute({ nodeId: childNode.nodeId });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { supersessionStatus: string }).supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. ANALYSIS-BOUNDARY effective date (effectiveDate === asOfDate exactly,
// inclusive per chain.ts's `<=`). Two shapes: a genuine boundary conflict
// (two effects sharing the boundary date), and a clean single-effect
// boundary control (never previously exercised in this codebase's OPEN-2
// coverage).
// ---------------------------------------------------------------------------
describe("2. exact analysis-boundary effective date", () => {
  const DOC = "fresh2-boundary-doc";
  const INSTRUMENT = "instrument:fresh2-boundary";
  const ASOF = "2024-06-15";
  const TEXT = `Section 1.50 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 12.30 Liens Basket . Liens permitted as follows: (a) General Basket. Liens up to $5,000,000. (b) Additional Basket. Liens up to $2,000,000.`;

  it("BOUNDARY CONFLICT: two competing effects both dated EXACTLY asOfDate are a real conflict AND both count as applied (<=) - getChildren must fail closed on the parent", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "12.30");
    const a = effect({ effectId: "boundary-a", amendmentDocumentId: "amd-boundary-a", target: t, newText: "Section 12.30 . up to $9,000,000 (boundary A).", effectiveDate: dated(ASOF) });
    const b = effect({ effectId: "boundary-b", amendmentDocumentId: "amd-boundary-b", target: t, newText: "Section 12.30 . up to $17,000,000 (boundary B).", effectiveDate: dated(ASOF) });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: ASOF, index, allEffects: [a, b] });
    const view = state.provisions.find((p) => p.sectionRef === "12.30")!;
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(view.appliedChain).toHaveLength(2); // both applied - the boundary date is inclusive.
    expect(view.supersededSourceNodeIds.length).toBeGreaterThan(0); // the base node IS recorded superseded at the exact boundary.

    const parent = index.getNodeByRef(DOC, "12.30")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a, b], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getChildren")!.execute({ nodeId: parent.nodeId });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { parentSupersessionStatus: string }).parentSupersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("BOUNDARY CONTROL (safe): a single, non-conflicting effect dated EXACTLY asOfDate is cleanly applied and current - getSiblingClauses must NOT fail closed on the boundary itself", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "12.30");
    const a = effect({ effectId: "boundary-clean", amendmentDocumentId: "amd-boundary-clean", target: t, newText: "Section 12.30 . up to $9,000,000 (cleanly restated at the exact boundary date).", effectiveDate: dated(ASOF) });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: ASOF, index, allEffects: [a] });
    const view = state.provisions.find((p) => p.sectionRef === "12.30")!;
    expect(view.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(view.appliedChain).toHaveLength(1); // the boundary date IS treated as applied.

    const anchor = index.getNodeByRef(DOC, "1.50")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getSiblingClauses")!.execute({ nodeId: anchor.nodeId });
    expect(outcome.ok).toBe(true);
    const siblings = (outcome.result as { siblings: { sectionRef: string; supersessionStatus: string; text: string }[] }).siblings;
    const restated = siblings.find((s) => s.sectionRef === "12.30")!;
    expect(restated.supersessionStatus).toBe("CURRENT_OPERATIVE");
    expect(restated.text).toContain("9,000,000");
    expect(outcome.evidenceUnresolved).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. GENUINELY AMBIGUOUS TARGET (real drafting collision: two physical
// occurrences share the same legal section reference in the base document)
// producing OPERATIVE_STATE_PARTIAL - a different unsafe-status root cause
// than the CONFLICTED/REVIEW_REQUIRED shapes the implementer's own matrix
// already covers.
// ---------------------------------------------------------------------------
describe("3. genuinely ambiguous physical target (duplicate section label) -> PARTIAL", () => {
  const DOC = "fresh2-ambiguous-doc";
  const INSTRUMENT = "instrument:fresh2-ambiguous";

  function buildFixture() {
    // Two real, distinct physical SECTION nodes both carrying legal
    // reference "15.05" (a genuine real-world drafting collision - e.g. a
    // renumbering error never corrected) plus a never-amended sibling
    // "3.20" whose own getSiblingClauses call is what actually surfaces the
    // ambiguous provision as a sibling.
    const root: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "Covenants", sectionRef: "0", nodeKey: `${DOC}::0`, nodeId: "n-amb-root", charStart: 0, charEnd: 400, ordinal: -1, parentSectionRef: null, parentNodeId: null };
    const anchor: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "Anchor", sectionRef: "3.20", nodeKey: `${DOC}::3.20`, nodeId: "n-amb-anchor", charStart: 0, charEnd: 50, ordinal: 0, parentSectionRef: "0", parentNodeId: root.nodeId };
    const dupA: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "Investments Basket (copy 1)", sectionRef: "15.05", nodeKey: `${DOC}::15.05`, nodeId: "n-amb-dup-a", charStart: 50, charEnd: 200, ordinal: 1, parentSectionRef: "0", parentNodeId: root.nodeId };
    const dupB: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "Investments Basket (copy 2, mis-numbered duplicate)", sectionRef: "15.05", nodeKey: `${DOC}::15.05`, nodeId: "n-amb-dup-b", charStart: 200, charEnd: 400, ordinal: 2, parentSectionRef: "0", parentNodeId: root.nodeId };
    const text = "Section 3.20 Anchor. The Borrower shall not incur Indebtedness in excess of $5,000,000.\nSection 15.05 Investments Basket. Up to $5,000,000 (copy 1).\nSection 15.05 Investments Basket. Up to $5,000,000 (copy 2, mis-numbered duplicate).";
    const index = buildStructuralIndex(new Map([[DOC, { text, nodes: [root, anchor, dupA, dupB] }]]), [], []);
    return { index, anchor, dupA, dupB };
  }

  it("SETUP: resolveUniqueNodeByRef and computeOperativeContractState both independently confirm AMBIGUOUS, never a silent pick of one occurrence", () => {
    const { index } = buildFixture();
    const resolution = index.resolveUniqueNodeByRef(DOC, "15.05");
    expect(resolution.status).toBe("AMBIGUOUS");

    const t = sectionTarget(DOC, INSTRUMENT, "15.05");
    const a = effect({ effectId: "amb-a", amendmentDocumentId: "amd-amb", target: t, operation: "MODIFY_THRESHOLD", newText: null, effectiveDate: dated("2020-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const view = state.provisions.find((p) => p.sectionRef === "15.05")!;
    expect(view.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(view.targetResolutionStatus).toBe("AMBIGUOUS");
    expect(view.currentText).toBeNull();
    return { state };
  });

  it("getSiblingClauses reading one of the ambiguous duplicates as a sibling fails the whole call closed", () => {
    const { index, anchor } = buildFixture();
    const t = sectionTarget(DOC, INSTRUMENT, "15.05");
    const a = effect({ effectId: "amb-sib-a", amendmentDocumentId: "amd-amb-sib", target: t, operation: "MODIFY_THRESHOLD", newText: null, effectiveDate: dated("2020-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getSiblingClauses")!.execute({ nodeId: anchor.nodeId });
    expect(outcome.ok).toBe(true);
    const siblings = (outcome.result as { siblings: { sectionRef: string; supersessionStatus: string }[] }).siblings;
    const dups = siblings.filter((s) => s.sectionRef === "15.05");
    expect(dups).toHaveLength(2);
    for (const d of dups) expect(d.supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. getReferencedProvision's OTHER code path: fromNodeId-relative
// resolution via a real DetectedReference, never exercised by the
// implementer's own fresh certification file (which only calls this tool
// with an absolute `ref`, never `fromNodeId`). Targets a REVIEW_REQUIRED
// (undated effective date) provision - a different unsafe status than
// section 1-3's CONFLICTED/PARTIAL shapes.
// ---------------------------------------------------------------------------
describe("4. getReferencedProvision fromNodeId (relative-reference) path against a REVIEW_REQUIRED provision", () => {
  const DOC = "fresh2-fromnodeid-doc";
  const INSTRUMENT = "instrument:fresh2-fromnodeid";
  const TEXT = `Section 4.44 Cross-Reference Source . Notwithstanding Section 9.77, additional Investments are permitted as described therein.\n\nSection 9.77 Investments Basket . The Borrower may make Investments up to $5,000,000 under this basket.`;

  function buildFixture() {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "9.77");
    // A real amendment effect whose own effective date could not be
    // established (a genuine CONDITIONAL_UNRESOLVED shape, e.g. "effective
    // upon receipt of lender consent, not yet obtained") - chain.ts's own
    // §22 AMENDMENT_SEQUENCE_UNRESOLVED rule, never dropped from the chain.
    const a = effect({ effectId: "fromnode-a", amendmentDocumentId: "amd-fromnode", target: t, newText: "Section 9.77 . up to $8,000,000 (conditional amendment).", effectiveDate: undated() });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    return { index, state, effects: [a] };
  }

  it("SETUP: the real DetectedReference from 4.44 resolves uniquely to 9.77's real node, and 9.77's own operative view is genuinely REVIEW_REQUIRED", () => {
    const { index, state } = buildFixture();
    const source = index.getNodeByRef(DOC, "4.44")!;
    const refs = index.findReferencesFrom(source.nodeId);
    expect(refs.length).toBeGreaterThan(0);
    const ref = refs.find((r) => r.normalizedTarget === "9.77")!;
    expect(ref.resolved).toBe(true);
    expect(ref.targetAmbiguous).toBe(false);
    const view = state.provisions.find((p) => p.sectionRef === "9.77")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
  });

  // ---------------------------------------------------------------------
  // UPDATE (HEADROOM OPEN-2 FINAL DIRECT PATCH): this WAS the STILL_OPEN
  // finding from the original independent recertification (see
  // docs/open2-terminal-trust-correction/13-four-tool-recertification.json)
  // - resolveNodeWithSupersessionAwareness's own `currentText !== null`
  // branch was taken UNCONDITIONALLY, never re-checking view.status, so a
  // provision whose ONLY recorded effect has a genuinely unresolvable
  // (CONDITIONAL_UNRESOLVED/UNKNOWN) effective date - correctly excluded
  // from appliedChain, leaving `currentText` as the UNTOUCHED base text
  // (non-null) even though `status` is honestly
  // OPERATIVE_STATE_REVIEW_REQUIRED - reported CURRENT_OPERATIVE. Fixed by
  // making `view.status === OPERATIVE_STATE_RESOLVED` the first, dominant
  // question (see tools.ts's own resolveNodeWithSupersessionAwareness
  // header comment and docs/open2-final-direct-patch/02-status-first-
  // design.json). Re-asserted here as a CLOSED confirmation, not silently
  // deleted - this is the exact regression guard for this exploit shape.
  // ---------------------------------------------------------------------
  it("FIXED: getReferencedProvision(ref, fromNodeId) correctly fails closed (NOT CURRENT_OPERATIVE, evidenceUnresolved=true) for the REVIEW_REQUIRED target, even though its currentText is the non-null untouched base text", () => {
    const { index, state, effects } = buildFixture();
    const source = index.getNodeByRef(DOC, "4.44")!;
    const refs = index.findReferencesFrom(source.nodeId);
    const ref = refs.find((r) => r.normalizedTarget === "9.77")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: ref.referenceText, fromNodeId: source.nodeId });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { resolvedSectionRef: string; supersessionStatus: string; supersessionReason: string };
    expect(result.resolvedSectionRef).toBe("9.77"); // confirms the fromNodeId branch, not an accidental fall-through to the absolute-ref loop.
    // THE FIX, CONFIRMED: a genuinely REVIEW_REQUIRED provision is no longer
    // reported CURRENT_OPERATIVE merely because currentText is non-null.
    expect(result.supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(result.supersessionReason).toContain("OPERATIVE_STATE_REVIEW_REQUIRED"); // still honestly discloses the real status.
    expect(outcome.evidenceUnresolved).toBe(true); // fails closed - never persisted as trusted evidence.
  });
});

// ---------------------------------------------------------------------------
// 5. 3-sibling aggregate masking (2 clean + 1 unresolved) - one bad apple in
// a LARGER sibling set (the implementer's own coverage only ever used a
// 2-sibling shape).
// ---------------------------------------------------------------------------
describe("5. 3-sibling aggregate: one unresolved sibling among two clean ones still fails the whole call closed", () => {
  const DOC = "fresh2-triple-sibling-doc";
  const INSTRUMENT = "instrument:fresh2-triple-sibling";
  const TEXT = `Section 6.10 Basket A . Restricted Payments up to $1,000,000.\n\nSection 6.11 Basket B (prospectively conflicted) . Restricted Payments up to $2,000,000.\n\nSection 6.12 Basket C . Restricted Payments up to $3,000,000.`;

  it("getSiblingClauses on 6.10 (querying its own siblings 6.11 + 6.12): evidenceUnresolved is true for the WHOLE call, but only 6.11 is individually flagged - the two clean siblings are not blanket-marked unsafe either", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "6.11");
    const a = effect({ effectId: "triple-a", amendmentDocumentId: "amd-triple-a", target: t, newText: "Section 6.11 . up to $9,000,000 (proposed).", effectiveDate: dated("2099-01-01") });
    const b = effect({ effectId: "triple-b", amendmentDocumentId: "amd-triple-b", target: t, newText: "Section 6.11 . up to $12,000,000 (competing proposed).", effectiveDate: dated("2099-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a, b] });
    const node610 = index.getNodeByRef(DOC, "6.10")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a, b], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getSiblingClauses")!.execute({ nodeId: node610.nodeId });
    expect(outcome.ok).toBe(true);
    const siblings = (outcome.result as { siblings: { sectionRef: string; supersessionStatus: string }[] }).siblings;
    expect(siblings).toHaveLength(2);
    const a11 = siblings.find((s) => s.sectionRef === "6.11")!;
    const a12 = siblings.find((s) => s.sectionRef === "6.12")!;
    expect(a11.supersessionStatus).not.toBe("CURRENT_OPERATIVE"); // the one bad apple.
    expect(a12.supersessionStatus).toBe("CURRENT_OPERATIVE"); // the clean one is not blanket-flagged.
    // THE INVARIANT: the WHOLE call still fails closed.
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. CLEAN DELETION attacked via getParentClause and getChildren (fresh
// tools - the implementer's own clean-deletion file only exercised
// getReferencedProvision and getSiblingClauses).
// ---------------------------------------------------------------------------
describe("6. clean-deletion special case via getParentClause and getChildren", () => {
  const DOC = "fresh2-clean-deletion-doc";
  const INSTRUMENT = "instrument:fresh2-clean-deletion";
  const TEXT = `Section 7.01 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 20.15 Deleted Basket . General provisions: (a) Sub-clause. The Borrower may make Restricted Payments up to $2,000,000 under this basket.`;

  function buildFixture() {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "20.15");
    const del = effect({ effectId: "del-fresh2", amendmentDocumentId: "amd-del-fresh2", operation: "DELETE_TEXT", target: t, newText: null, oldText: "Section 20.15 Deleted Basket . ...", effectiveDate: dated("2019-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [del] });
    const view = state.provisions.find((p) => p.sectionRef === "20.15")!;
    return { index, state, view };
  }

  it("SETUP: 20.15 is validly, cleanly deleted (status RESOLVED, currentText null, reviewRequired false)", () => {
    const { view } = buildFixture();
    expect(view.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(view.currentText).toBeNull();
    expect(view.reviewRequired).toBe(false);
  });

  it("getParentClause on the deleted section's own sub-clause: the parent's own real base text is served ONLY as disclosed history (HISTORICAL, never CURRENT_OPERATIVE) and evidenceUnresolved is true - distinct wording from a genuine unresolved conflict", () => {
    const { index, state } = buildFixture();
    const child = index.getNodeByRef(DOC, "20.15(a)")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getParentClause")!.execute({ nodeId: child.nodeId });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { supersessionStatus: string; supersessionReason: string; text: string };
    expect(result.supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    // getParentClause serves the parent's own "OWN" span (excluding its
    // descendant sub-clause text, which is where the $2,000,000 figure
    // itself lives) - confirm real, non-empty historical text was served.
    expect(result.text).toContain("Deleted Basket");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.supersessionReason.toLowerCase()).toContain("delet");
    expect(result.supersessionReason).not.toContain("not confidently resolved"); // never conflated with a genuine unresolved-conflict reason.
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("getChildren queried on the DELETED section's own node: fails closed too - a deleted section's own child listing must never be served as though it still describes current substructure", () => {
    const { index, state } = buildFixture();
    const deletedNode = index.getNodeByRef(DOC, "20.15")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getChildren")!.execute({ nodeId: deletedNode.nodeId });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { children: unknown[]; parentSupersessionStatus: string };
    expect(result.children).toHaveLength(1); // the structural listing itself is untouched (still reports the real physical children)...
    expect(result.parentSupersessionStatus).not.toBe("CURRENT_OPERATIVE"); // ...but the trust verdict on it correctly fails closed.
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("CONTROL: a never-amended sibling in the SAME state remains safely current for both tools - the clean-deletion fix does not degrade the ordinary case", () => {
    const { index, state } = buildFixture();
    const anchor = index.getNodeByRef(DOC, "7.01")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: "7.01" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { supersessionStatus: string }).supersessionStatus).toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. FRESH REGRESSION for the 3 previously-safe tools (getOperativeProvision,
// getDefinition, getRelatedAmendments) - none touched by this fix - both
// unsafe and safe fresh cases, to confirm no drift.
// ---------------------------------------------------------------------------
describe("7. three previously-safe tools: fresh regression, both unsafe and safe cases", () => {
  it("7a. getOperativeProvision raw-fallback branch: a section with NO matching view whose physical node is KNOWN_SUPERSEDED via a DIFFERENT (relabeled) provision must still fail closed", () => {
    const DOC = "fresh2-safe-opprov-doc";
    const INSTRUMENT = "instrument:fresh2-safe-opprov";
    const TEXT = `Section 30.01 Restated Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const node = index.getNodeByRef(DOC, "30.01")!;
    const t = sectionTarget(DOC, INSTRUMENT, "30.01");
    // The amendment targets 30.01 by its OWN real ref and produces a real
    // relabeled provisionKey "99.99" (a genuine restatement/renumbering
    // shape) - mirrors the matrix's own case 8 root cause but built fresh,
    // independently, against a different document/instrument/company.
    const a = effect({ effectId: "safe-relabel", amendmentDocumentId: "amd-safe-relabel", target: t, newText: "Section 99.99 . up to $9,000,000 (renumbered).", effectiveDate: dated("2019-01-01") });
    const relabeledState = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    const view = relabeledState.provisions.find((p) => p.sectionRef === "30.01")!;
    const relabeled = { ...view, sectionRef: "99.99", supersededSourceNodeIds: [node.nodeId] };
    const state = { ...relabeledState, provisions: [relabeled] };

    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getOperativeProvision")!.execute({ sectionRef: "30.01" }); // no view matches "30.01" any more - hits the raw fallback.
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("7b. getOperativeProvision CONTROL: a never-amended section via the same raw-fallback branch remains safely current (a REAL, empty OperativeContractState - not `operativeState: null` itself, which correctly fails closed via an empty supersession index covering nothing)", () => {
    const DOC = "fresh2-safe-opprov-control-doc";
    const INSTRUMENT = "instrument:fresh2-safe-opprov-control";
    const TEXT = `Section 31.01 Clean Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [] });
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getOperativeProvision")!.execute({ sectionRef: "31.01" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).not.toBe(true);
  });

  it("7b-note. CONFIRMS the contrast: `operativeState: null` (no computation ran at all for this document) correctly fails closed even for a never-amended section - fail-closed-by-default, never fail-open-by-omission", () => {
    const DOC = "fresh2-safe-opprov-null-doc";
    const TEXT = `Section 32.01 Clean Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getOperativeProvision")!.execute({ sectionRef: "32.01" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true); // correct: no operative-state computation ever covered this document.
  });

  it("7c. getDefinition on a prospective-CONFLICTED DEFINITION-kind amendment (two competing definitions sharing a future date) fails closed", () => {
    const DOC = "fresh2-safe-def-doc";
    const INSTRUMENT = "instrument:fresh2-safe-def";
    const TEXT = `Section 1.01 Definitions . As used herein, "Permitted Liens Cap" means the amount set forth in this Agreement.\n\nSection 6.01 Indebtedness . text.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = definitionTarget(DOC, INSTRUMENT, "Permitted Liens Cap");
    const a = effect({ effectId: "def-fut-a", amendmentDocumentId: "amd-def-fut-a", operation: "MODIFY_DEFINITION", target: t, newText: '"Permitted Liens Cap" means $9,000,000 (proposed).', effectiveDate: dated("2099-01-01") });
    const b = effect({ effectId: "def-fut-b", amendmentDocumentId: "amd-def-fut-b", operation: "MODIFY_DEFINITION", target: t, newText: '"Permitted Liens Cap" means $14,000,000 (competing proposed).', effectiveDate: dated("2099-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a, b] });
    const view = state.provisions.find((p) => p.definedTermRef === "permitted liens cap")!;
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");

    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a, b], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getDefinition")!.execute({ term: "Permitted Liens Cap" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("7d. getDefinition CONTROL: a never-amended term remains safely current", () => {
    const DOC = "fresh2-safe-def-control-doc";
    const TEXT = `Section 1.01 Definitions . As used herein, "Clean Term" means the amount set forth in this Agreement.`;
    const { index } = buildIndex(DOC, TEXT);
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getDefinition")!.execute({ term: "Clean Term" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).not.toBe(true);
  });

  it("7e. getRelatedAmendments on the genuinely AMBIGUOUS-target PARTIAL provision (section 3's own fixture) discloses the real chain and fails closed", () => {
    const DOC = "fresh2-ambiguous-doc-relamd";
    const INSTRUMENT = "instrument:fresh2-ambiguous-relamd";
    const root: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "Covenants", sectionRef: "0", nodeKey: `${DOC}::0`, nodeId: "n-relamd-root", charStart: 0, charEnd: 300, ordinal: -1, parentSectionRef: null, parentNodeId: null };
    const dupA: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "copy 1", sectionRef: "40.40", nodeKey: `${DOC}::40.40`, nodeId: "n-relamd-a", charStart: 0, charEnd: 150, ordinal: 0, parentSectionRef: "0", parentNodeId: root.nodeId };
    const dupB: StructuralNode = { documentId: DOC, nodeType: "SECTION", heading: "copy 2", sectionRef: "40.40", nodeKey: `${DOC}::40.40`, nodeId: "n-relamd-b", charStart: 150, charEnd: 300, ordinal: 1, parentSectionRef: "0", parentNodeId: root.nodeId };
    const text = "Section 40.40 copy 1. Up to $5,000,000.\nSection 40.40 copy 2. Up to $5,000,000.";
    const index = buildStructuralIndex(new Map([[DOC, { text, nodes: [root, dupA, dupB] }]]), [], []);
    const t = sectionTarget(DOC, INSTRUMENT, "40.40");
    const a = effect({ effectId: "relamd-a", amendmentDocumentId: "amd-relamd", target: t, operation: "MODIFY_THRESHOLD", newText: null, effectiveDate: dated("2020-05-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    expect(state.provisions.find((p) => p.sectionRef === "40.40")!.status).toBe("OPERATIVE_STATE_PARTIAL");

    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getRelatedAmendments")!.execute({ ref: "40.40" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { chain: unknown[] };
    expect(result.chain).toHaveLength(1); // the real chain IS disclosed even though the target is unresolved.
    expect(outcome.evidenceUnresolved).toBe(true);
  });

  it("7f. getRelatedAmendments CONTROL: a real, cleanly-RESOLVED chain remains safely current (fresh doc, different from the implementer's own control fixture)", () => {
    const DOC = "fresh2-safe-relamd-control-doc";
    const INSTRUMENT = "instrument:fresh2-safe-relamd-control";
    const TEXT = `Section 50.50 Clean Basket . Restricted Payments up to $2,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "50.50");
    const a = effect({ effectId: "relamd-clean", amendmentDocumentId: "amd-relamd-clean", target: t, newText: "Section 50.50 . up to $2,500,000 restated cleanly.", effectiveDate: dated("2020-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [a] });
    expect(state.provisions.find((p) => p.sectionRef === "50.50")!.status).toBe("OPERATIVE_STATE_RESOLVED");
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a], contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t2) => t2.name === "getRelatedAmendments")!.execute({ ref: "50.50" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. root-cause sanity: the shared boolean primitive itself is correct
// against the real enum values read independently from amendment/types.ts
// (never assuming the implementer's own string literals are right).
// ---------------------------------------------------------------------------
describe("8. isConfirmedCurrentOperativeEvidence against every real status literal", () => {
  it("exactly RESOLVED and CURRENT_OPERATIVE are confirmed-current; every other real enum value fails closed", () => {
    expect(isConfirmedCurrentOperativeEvidence("OPERATIVE_STATE_RESOLVED")).toBe(true);
    expect(isConfirmedCurrentOperativeEvidence("CURRENT_OPERATIVE")).toBe(true);
    expect(isConfirmedCurrentOperativeEvidence("OPERATIVE_STATE_PARTIAL")).toBe(false);
    expect(isConfirmedCurrentOperativeEvidence("OPERATIVE_STATE_REVIEW_REQUIRED")).toBe(false);
    expect(isConfirmedCurrentOperativeEvidence("OPERATIVE_STATE_CONFLICTED")).toBe(false);
    expect(isConfirmedCurrentOperativeEvidence("KNOWN_SUPERSEDED")).toBe(false);
    expect(isConfirmedCurrentOperativeEvidence("UNKNOWN_SUPERSESSION_STATUS")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. REAL POSTGRES end-to-end persisted-trust verification - two
// independent chains, both fresh company/document/instrument fixtures
// never used by the implementer's own tests, both reading the actual
// persisted SemanticTruthRecord row back from a fresh Postgres query
// (never trusting the in-memory verification object alone).
// ---------------------------------------------------------------------------
describe("9. real-Postgres end-to-end persisted trust", () => {
  it("9a. ORIGINAL EXPLOIT SHAPE (signed-but-not-yet-effective conflict) via getSiblingClauses, fresh fixture: compile -> verify -> persist -> fresh Postgres read confirms trustStatus is never VERIFIED", async () => {
    const DOC = "fresh2-e2e-exploit-doc";
    const INSTRUMENT = "instrument:fresh2-e2e-exploit";
    const TEXT = `Section 13.13 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 44.09 Restricted Payments Basket . General provisions: (a) General Basket. The Borrower may make Restricted Payments up to $5,000,000. (b) Additional Basket. up to $3,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "44.09");
    // Two real, on-file, competing effects sharing the SAME future
    // effective date - signed-but-not-yet-effective, exactly the exploit
    // shape - queried well before either date, so appliedChain is empty and
    // the base node is NOT marked superseded at the node level.
    const a = effect({ effectId: "e2e-a", amendmentDocumentId: "amd-e2e-a", target: t, newText: "Section 44.09 . up to $9,000,000 (proposed Amendment No. 1).", effectiveDate: dated("2099-01-01") });
    const b = effect({ effectId: "e2e-b", amendmentDocumentId: "amd-e2e-b", target: t, newText: "Section 44.09 . up to $15,000,000 (competing proposed restatement).", effectiveDate: dated("2099-01-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2022-01-01", index, allEffects: [a, b] });
    const view = state.provisions.find((p) => p.sectionRef === "44.09")!;
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(view.appliedChain).toHaveLength(0);
    expect(view.supersededSourceNodeIds).toHaveLength(0); // the base node is NOT physically superseded - the original exploit precondition.

    const node1313 = index.getNodeByRef(DOC, "13.13")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node1313.nodeKey], structuralNodeIds: [node1313.nodeId], normalizedSourceRef: "13.13" });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(false); // isolates the tool-call path.

    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: INSTRUMENT, sourceDocumentId: DOC, sourceSectionRef: "13.13", candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node1313.nodeId, "DESCENDANTS"), contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [a, b], contextBundle: bundle },
    });
    const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUse("t1", "getSiblingClauses", { nodeId: node1313.nodeId })], [submit({ sourceSectionRef: "13.13", sufficiencyReasons: ["confirmed the $5,000,000 basket via getSiblingClauses"] })]]));
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(compilationResult.toolCallLog[0]!.toolName).toBe("getSiblingClauses");
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

    // FRESH Postgres read (not the in-memory verification object).
    const trusted = await getTrustedSemanticTruth(COMPANY_ID, INSTRUMENT);
    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, INSTRUMENT);
    expect(all.length).toBeGreaterThan(0);
    expect(trusted.length).toBe(0);
    expect(all[0]!.trustStatus).toBe("REVIEW_REQUIRED");
    expect(all[0]!.trustStatus).not.toBe("VERIFIED");

    // Independent confirmation directly via raw prisma, bypassing the
    // service-layer helper entirely.
    const rows = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey: INSTRUMENT } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.trustStatus).not.toBe("VERIFIED");
  });

  it("9b. THIS FILE'S OWN mixed-chain variant (section 1's fixture) via getParentClause: compile -> verify -> persist -> fresh Postgres read confirms trustStatus is never VERIFIED", async () => {
    const DOC = "fresh2-e2e-mixedchain-doc";
    const INSTRUMENT = "instrument:fresh2-e2e-mixedchain";
    const TEXT = `Section 21.21 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 55.60 Restricted Payments Basket . General provisions: (a) General Basket. The Borrower may make Restricted Payments up to $5,000,000.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "55.60");
    const applied = effect({ effectId: "e2e-mix-applied", amendmentDocumentId: "amd-e2e-mix-applied", target: t, newText: "Section 55.60 . up to $6,000,000 (cleanly applied).", effectiveDate: dated("2018-01-01") });
    const futureA = effect({ effectId: "e2e-mix-future-a", amendmentDocumentId: "amd-e2e-mix-future-a", target: t, newText: "Section 55.60 . up to $20,000,000 (proposed).", effectiveDate: dated("2099-06-01") });
    const futureB = effect({ effectId: "e2e-mix-future-b", amendmentDocumentId: "amd-e2e-mix-future-b", target: t, newText: "Section 55.60 . up to $30,000,000 (competing proposed).", effectiveDate: dated("2099-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [applied, futureA, futureB] });
    expect(state.provisions.find((p) => p.sectionRef === "55.60")!.status).toBe("OPERATIVE_STATE_CONFLICTED");

    // Candidate is anchored on the SAFE, never-amended "21.21" node (never
    // the conflicted section's own child) - mirrors the established,
    // working pattern (implementer's own section 4/6, and this file's own
    // section 9a): isolates the tool-call path as the only thing that
    // could catch the conflicted 55.60 evidence, keeping
    // bundle.hasUnresolvedOperativeEvidence and contextBundle.
    // sufficiencyState clean so verify.ts's determineStatus reaches its
    // real OPERATIVE_STATE_CONFLICTED lineage check rather than bailing
    // out earlier on an unrelated VERIFICATION_INCOMPLETE bundle-
    // sufficiency gate.
    const childNode = index.getNodeByRef(DOC, "55.60(a)")!;
    const anchorNode = index.getNodeByRef(DOC, "21.21")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [anchorNode.nodeKey], structuralNodeIds: [anchorNode.nodeId], normalizedSourceRef: "21.21" });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(false);

    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: INSTRUMENT, sourceDocumentId: DOC, sourceSectionRef: "21.21", candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(anchorNode.nodeId, "DESCENDANTS"), contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: [applied, futureA, futureB], contextBundle: bundle },
    });
    const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUse("t1", "getParentClause", { nodeId: childNode.nodeId })], [submit({ sourceSectionRef: "21.21", sufficiencyReasons: ["read the parent clause via getParentClause"] })]]));
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(compilationResult.toolCallLog[0]!.toolName).toBe("getParentClause");
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
    expect(trusted.length).toBe(0);
    expect(all[0]!.trustStatus).toBe("REVIEW_REQUIRED");

    const rows = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey: INSTRUMENT } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.trustStatus).not.toBe("VERIFIED");
  });
});

// ---------------------------------------------------------------------------
// 10. UPDATE (HEADROOM OPEN-2 FINAL DIRECT PATCH): this section originally
// documented a STILL_OPEN, end-to-end reproduction of the residual gap
// found while building section 4's fixture - a provision whose ONLY
// recorded amendment effect has a genuinely unresolvable
// (CONDITIONAL_UNRESOLVED/UNKNOWN) effective date is correctly excluded
// from appliedChain, so its `currentText` is left as the untouched
// base-document text (non-null) even though `status` is honestly
// OPERATIVE_STATE_REVIEW_REQUIRED. resolveNodeWithSupersessionAwareness's
// `currentText !== null` branch used to be taken UNCONDITIONALLY - never
// consulting view.status first - for getParentClause, getSiblingClauses,
// and getReferencedProvision (getChildren's own SEPARATE
// resolveParentSubstructureEvidence check never shared this defect, since
// it never branches on currentText at all). Fixed by making
// `view.status === OPERATIVE_STATE_RESOLVED` the first, structurally-
// dominant question (see tools.ts's own resolveNodeWithSupersessionAwareness
// header comment and docs/open2-final-direct-patch/). Re-asserted below as
// CLOSED, not silently deleted - this is the permanent regression guard
// for this exact exploit shape.
// ---------------------------------------------------------------------------
describe("10. FIXED end-to-end: a REVIEW_REQUIRED provision with non-null (untouched-base) currentText no longer reaches a persisted VERIFIED SemanticTruthRecord via getSiblingClauses", () => {
  const DOC = "fresh2-finding-e2e-doc";
  const INSTRUMENT = "instrument:fresh2-finding-e2e";
  const TEXT = `Section 3.03 Anchor . The Borrower shall not incur Indebtedness in excess of $5,000,000.\n\nSection 66.60 Restricted Payments Basket . General provisions: (a) General Basket. The Borrower may make Restricted Payments up to $5,000,000. (b) Additional Basket. up to $3,000,000.`;

  function buildState() {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "66.60");
    // A real, on-file amendment effect - e.g. "the Restricted Payments
    // basket in Section 66.60 is hereby amended as set forth on Annex A,
    // effective upon satisfaction of the Merger Condition" - whose own
    // effective date is genuinely conditional/unresolved (an entirely
    // ordinary real-world drafting shape - a signed amendment awaiting a
    // condition precedent, e.g. lender consent or a merger closing).
    const conditional = effect({ effectId: "finding-conditional", amendmentDocumentId: "amd-finding-conditional", target: t, newText: "Section 66.60 . up to $40,000,000 (conditional, once effective).", effectiveDate: undated() });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-01-01", index, allEffects: [conditional] });
    return { index, state, effects: [conditional] };
  }

  it("SETUP: 66.60 is genuinely REVIEW_REQUIRED (AMENDMENT_SEQUENCE_UNRESOLVED), yet currentText is the UNTOUCHED base text (non-null) because the sole effect never entered appliedChain", () => {
    const { state } = buildState();
    const view = state.provisions.find((p) => p.sectionRef === "66.60")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(view.appliedChain).toHaveLength(0);
    expect(view.currentText).not.toBeNull();
    expect(view.currentText).toContain("Restricted Payments Basket");
  });

  it("CONFIRMS the fix is genuinely cross-tool: getParentClause, getSiblingClauses, and getReferencedProvision now ALL correctly fail closed (NOT CURRENT_OPERATIVE) for this REVIEW_REQUIRED section, exactly like getChildren, getOperativeProvision, and getRelatedAmendments (which always derived their trust verdict from view.status directly, never via a currentText-gated shortcut)", () => {
    const { index, state, effects } = buildState();
    const node303 = index.getNodeByRef(DOC, "3.03")!;
    const target6660 = index.getNodeByRef(DOC, "66.60")!;
    const child = index.getNodeByRef(DOC, "66.60(a)")!;
    const tools = buildToolSet({ structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: emptyContextBundle() }, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);

    const gpc = tools.find((t) => t.name === "getParentClause")!.execute({ nodeId: child.nodeId });
    const gsc = tools.find((t) => t.name === "getSiblingClauses")!.execute({ nodeId: node303.nodeId });
    const grp = tools.find((t) => t.name === "getReferencedProvision")!.execute({ ref: "66.60" });
    const gch = tools.find((t) => t.name === "getChildren")!.execute({ nodeId: target6660.nodeId });
    const gop = tools.find((t) => t.name === "getOperativeProvision")!.execute({ sectionRef: "66.60" });
    const gra = tools.find((t) => t.name === "getRelatedAmendments")!.execute({ ref: "66.60" });

    // THE FIX, CONFIRMED: all 3 previously-vulnerable tools now fail closed.
    expect((gpc.result as { supersessionStatus: string }).supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(gpc.evidenceUnresolved).toBe(true);

    const sibs = (gsc.result as { siblings: { sectionRef: string; supersessionStatus: string }[] }).siblings;
    expect(sibs.find((s) => s.sectionRef === "66.60")!.supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(gsc.evidenceUnresolved).toBe(true);

    expect((grp.result as { supersessionStatus: string }).supersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(grp.evidenceUnresolved).toBe(true);

    // getOperativeProvision and getRelatedAmendments (the 2 SECTION-kind
    // previously-safe tools) correctly fail closed on this EXACT fixture -
    // positive confirmation this correction did not disturb them.
    expect((gop.result as { status: string }).status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(gop.evidenceUnresolved).toBe(true);
    expect(gra.evidenceUnresolved).toBe(true);

    // getChildren was never vulnerable - its own resolveParentSubstructureEvidence
    // gates on view.status alone, never on currentText null-ness. Unchanged.
    expect((gch.result as { parentSupersessionStatus: string }).parentSupersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(gch.evidenceUnresolved).toBe(true);
  });

  it("END TO END, REAL POSTGRES: a getSiblingClauses call reaching this REVIEW_REQUIRED section now correctly reaches compile.ts REVIEW_REQUIRED and NEVER a persisted SemanticTruthRecord.trustStatus of VERIFIED - the fix, confirmed via the exact path that used to bypass it", async () => {
    const { index, state, effects } = buildState();
    const node303 = index.getNodeByRef(DOC, "3.03")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [node303.nodeKey], structuralNodeIds: [node303.nodeId], normalizedSourceRef: "3.03" });
    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: INSTRUMENT }, access);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(false); // isolates the tool-call path, exactly like sections 9a/9b above.

    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: INSTRUMENT, sourceDocumentId: DOC, sourceSectionRef: "3.03", candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(node303.nodeId, "DESCENDANTS"), contextBundle: bundle,
      toolAccess: { structuralIndex: index, operativeState: state, packageGraph: null, amendmentEffects: effects, contextBundle: bundle },
    });
    const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUse("t1", "getSiblingClauses", { nodeId: node303.nodeId })], [submit({ sourceSectionRef: "3.03", sufficiencyReasons: ["confirmed the $5,000,000 basket via getSiblingClauses"] })]]));
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });

    expect(compilationResult.toolCallLog[0]!.toolName).toBe("getSiblingClauses");
    // THE FIX, END TO END: evidenceUnresolved IS true for this call now, so
    // compile.ts correctly learns this attempt's evidence was unresolved.
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

    // FRESH Postgres read - the fix, confirmed.
    const trusted = await getTrustedSemanticTruth(COMPANY_ID, INSTRUMENT);
    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, INSTRUMENT);
    expect(all.length).toBeGreaterThan(0);
    expect(all[0]!.trustStatus).toBe("REVIEW_REQUIRED");
    expect(all[0]!.trustStatus).not.toBe("VERIFIED");
    expect(trusted.length).toBe(0); // a rule whose real justification depended on a genuinely REVIEW_REQUIRED section is never persisted as trusted current truth.

    const rows = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey: INSTRUMENT } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.trustStatus).not.toBe("VERIFIED");
  });
});
