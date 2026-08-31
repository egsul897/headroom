/**
 * HEADROOM OPEN-2 FINAL DIRECT PATCH - ONE TARGETED INDEPENDENT CONFIRMATION.
 *
 * A FRESH, INDEPENDENT audit of the status-first fix to
 * resolveNodeWithSupersessionAwareness (lib/contract-model/compiler/semantic/tools.ts,
 * production commit 4ca90f2). Every fixture in this file is deliberately
 * NEW (different section numbers, different document/instrument names,
 * different amendment wording, different condition wording) from every
 * fixture already used in docs/open2-final-direct-patch/04-06 and their
 * companion test files (open2-final-direct-patch-matrix.test.ts,
 * open2-final-direct-patch-e2e.test.ts) - this file exists to falsify the
 * implementer's own claim by construction, not to re-run their tests.
 *
 * See docs/open2-final-direct-patch/10-independent-confirmation.json for
 * the disposition and full write-up this file backs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildNodeSupersessionIndex, computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildCovenantContextBundle, type PackageAccess } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { AmendmentEffectCandidate, AmendmentTarget, EffectiveDateResult } from "../../lib/contract-model/compiler/amendment/types";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { buildToolSet, resolveNodeWithSupersessionAwareness } from "../../lib/contract-model/compiler/semantic/tools";
import type { SemanticToolAccess } from "../../lib/contract-model/compiler/semantic/types";
import { DEFAULT_TOOL_BUDGET, SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput, emptyContextBundle } from "../contract-model/semantic-compiler/test-helpers";
import { makeCandidate } from "../contract-model/coverage-audit-test-utils";
import { prisma } from "../../lib/prisma";
import { persistSemanticTruthForInstrument, getTrustedSemanticTruth, getAllSemanticTruthForInstrument } from "../../lib/contract-model/analysis/semantic-truth/service";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";

const COMPANY_ID = "open-2-independent-audit-10";

// ---------------------------------------------------------------------------
// Shared fixture helpers (independently written for this audit - structurally
// similar to the pattern established by earlier certification files because
// that pattern is the correct, already-proven way to exercise this pipeline,
// but every literal fixture below is new).
// ---------------------------------------------------------------------------
function dated(date: string): EffectiveDateResult {
  return { date, status: "EXPLICIT_EFFECTIVE_DATE", evidence: `explicit effective date stated as ${date}`, reason: "explicit effective date clause" };
}
function undated(reason: string): EffectiveDateResult {
  return { date: null, status: "CONDITIONAL_UNRESOLVED", evidence: reason, reason };
}
function sectionTarget(documentId: string, instrumentKey: string, sectionRef: string): AmendmentTarget {
  return { kind: "SECTION", targetDocumentId: documentId, targetInstrumentKey: instrumentKey, targetStructuralNodeKey: null, targetSectionRef: sectionRef, targetDefinedTermRef: null, targetHint: null };
}
function effect(overrides: Partial<AmendmentEffectCandidate> & { target: AmendmentTarget }): AmendmentEffectCandidate {
  return {
    effectId: "e", amendmentDocumentId: "amd", operation: "REPLACE_TEXT", effectiveDate: dated("2020-01-01"), newText: null, oldText: null,
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
function access(index: StructuralIndex, operativeState: SemanticToolAccess["operativeState"], amendmentEffects: AmendmentEffectCandidate[] | null = null): SemanticToolAccess {
  return { structuralIndex: index, operativeState, packageGraph: null, amendmentEffects, contextBundle: emptyContextBundle() };
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
function submit(sourceSectionRef: string, amount: number, reason: string) {
  return toolUse("submit", "submit_compilation", {
    rules: [{ localRef: "r1", sourceSectionRef, covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount, currency: "USD" }, sufficiency: "COMPLETE", sufficiencyReasons: [reason] }],
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
  await prisma.company.create({ data: { id: COMPANY_ID, name: "OPEN-2 independent audit co", onboardingStatus: "ONBOARDING" } });
});
afterAll(async () => {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

// ---------------------------------------------------------------------------
// Item 2 - non-null currentText + non-RESOLVED status, FRESH construction
// (the exact prior defect shape). Section 41.52, "Permitted Acquisitions"
// basket, condition wording about a lender-consent gate.
// ---------------------------------------------------------------------------
describe("Item 2 - non-null currentText + non-RESOLVED status (fresh construction) fails closed", () => {
  const DOC = "ia10-item2-doc";
  const INSTRUMENT = "instrument:ia10-item2";
  const TEXT = `Section 3.10 Anchor Covenant . The Borrower shall not make Investments in excess of $7,500,000.\n\nSection 41.52 Permitted Acquisitions Basket . General provisions: (a) Sub-clause. The Borrower may consummate Permitted Acquisitions up to $7,500,000 under this basket.`;

  it("direct resolveNodeWithSupersessionAwareness call: evidenceCurrent false, textSource UNRESOLVED_AMENDED_TEXT", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "41.52");
    const conditional = effect({
      effectId: "item2-cond", amendmentDocumentId: "amd-item2-cond", target: t,
      newText: "Section 41.52 . up to $60,000,000 (subject to lender consent gate not yet satisfied).",
      effectiveDate: undated("effectiveness is conditioned on written consent of the Required Lenders to a pending amendment, not yet obtained as of the analysis date"),
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [conditional] });
    const view = state.provisions.find((p) => p.sectionRef === "41.52")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(view.currentText).not.toBeNull(); // untouched base text, honestly non-null.

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "41.52")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [conditional]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("UNRESOLVED_AMENDED_TEXT");
  });

  it("getOperativeProvision tool call on the same fixture: evidenceUnresolved true", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "41.52");
    const conditional = effect({
      effectId: "item2-tool-cond", amendmentDocumentId: "amd-item2-tool-cond", target: t,
      newText: "Section 41.52 . up to $60,000,000 (subject to lender consent gate not yet satisfied).",
      effectiveDate: undated("effectiveness is conditioned on written consent of the Required Lenders to a pending amendment, not yet obtained as of the analysis date"),
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [conditional] });
    const tools = buildToolSet(access(index, state, [conditional]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getOperativeProvision")!.execute({ sectionRef: "41.52" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
    expect((outcome.result as { status: string }).status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// Item 3 - null currentText + non-RESOLVED status (the ORIGINAL, earlier-
// fixed shape). Section 53.64, a dated-past effect whose own per-effect
// status is REVIEW_REQUIRED and supplies no capturable replacement text.
// ---------------------------------------------------------------------------
describe("Item 3 - null currentText + non-RESOLVED status: confirm no regression", () => {
  const DOC = "ia10-item3-doc";
  const INSTRUMENT = "instrument:ia10-item3";
  const TEXT = `Section 4.11 Anchor Covenant . The Borrower shall not incur Liens in excess of $3,000,000.\n\nSection 53.64 Sale-Leaseback Basket . General provisions: (a) Sub-clause. The Borrower may enter into Sale-Leaseback transactions up to $3,000,000 under this basket.`;

  it("direct resolver + getParentClause: evidenceCurrent false, textSource BASE_DOCUMENT_TEXT", () => {
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "53.64");
    const bare = effect({
      effectId: "item3-bare", amendmentDocumentId: "amd-item3-bare", target: t, newText: null, effectiveDate: dated("2019-03-01"),
      status: "REVIEW_REQUIRED", unresolvedReason: "the amendment references 'the threshold currently in effect' with no quoted replacement figure",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [bare] });
    const view = state.provisions.find((p) => p.sectionRef === "53.64")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(view.currentText).toBeNull();

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "53.64")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [bare]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false);
    expect(resolved.textSource).toBe("BASE_DOCUMENT_TEXT");

    const child = index.getNodeByRef(DOC, "53.64(a)")!;
    const tools = buildToolSet(access(index, state, [bare]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getParentClause")!.execute({ nodeId: child.nodeId });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 4 - unresolved effective date, OWN fresh amendment fixture. Section
// 64.75, distinct condition wording (financial-covenant reset condition).
// ---------------------------------------------------------------------------
describe("Item 4 - genuinely conditional/unresolved effective date (own fresh fixture)", () => {
  it("getOperativeProvision fails closed", () => {
    const DOC = "ia10-item4-doc";
    const INSTRUMENT = "instrument:ia10-item4";
    const TEXT = `Section 5.12 Anchor . The Borrower shall not incur Indebtedness in excess of $2,000,000.\n\nSection 64.75 Contingent Basket . The Borrower may make Investments up to $2,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "64.75");
    const contingent = effect({
      effectId: "item4-contingent", amendmentDocumentId: "amd-item4-contingent", target: t,
      newText: "Section 64.75 . up to $25,000,000 (contingent, once effective).",
      effectiveDate: undated("effectiveness is contingent upon satisfaction of a financial-covenant reset condition not yet certified by the Administrative Agent"),
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [contingent] });
    const view = state.provisions.find((p) => p.sectionRef === "64.75")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(view.appliedChain).toHaveLength(0);
    expect(view.currentText).not.toBeNull();

    const tools = buildToolSet(access(index, state, [contingent]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getOperativeProvision")!.execute({ sectionRef: "64.75" });
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 5 - mixed applied + unresolved future amendment on the SAME section.
// Section 75.86: one already-applied (dated past) effect, plus a second,
// later effect on the SAME section still unresolved.
// ---------------------------------------------------------------------------
describe("Item 5 - mixed applied + unresolved future amendment, same section", () => {
  it("aggregate view stays non-RESOLVED (REVIEW_REQUIRED) and getSiblingClauses/getParentClause still fail closed, even though currentText reflects the already-applied predecessor", () => {
    const DOC = "ia10-item5-doc";
    const INSTRUMENT = "instrument:ia10-item5";
    const TEXT = `Section 6.13 Anchor Covenant . The Borrower shall not grant Liens in excess of $4,000,000.\n\nSection 75.86 Layered Basket . General provisions: (a) Sub-clause. The Borrower may grant Liens up to $4,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "75.86");
    const applied = effect({ effectId: "item5-applied", amendmentDocumentId: "amd-item5-applied", target: t, newText: "Section 75.86 . up to $8,000,000 (first amendment, already effective).", effectiveDate: dated("2020-05-01") });
    const pendingSecond = effect({
      effectId: "item5-pending", amendmentDocumentId: "amd-item5-pending", target: t,
      newText: "Section 75.86 . up to $30,000,000 (second amendment, effectiveness pending regulatory approval).",
      effectiveDate: undated("effectiveness of this second, later amendment is conditioned on a regulatory approval not yet obtained"),
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [applied, pendingSecond] });
    const view = state.provisions.find((p) => p.sectionRef === "75.86")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED"); // NOT RESOLVED, despite one real applied amendment.
    expect(view.appliedChain).toHaveLength(1);
    expect(view.currentText).toContain("8,000,000"); // the applied predecessor's own newText - non-null.

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "75.86")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [applied, pendingSecond]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false); // THE CENTRAL QUESTION, for this shape.
    expect(resolved.textSource).toBe("UNRESOLVED_AMENDED_TEXT");

    const anchor = index.getNodeByRef(DOC, "6.13")!;
    const tools = buildToolSet(access(index, state, [applied, pendingSecond]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    // getSiblingClauses called from the ANCHOR (top-level sibling of 75.86).
    const siblingOutcome = tools.find((tl) => tl.name === "getSiblingClauses")!.execute({ nodeId: anchor.nodeId });
    expect(siblingOutcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 6 - CONFLICTED state: two genuinely competing amendments, neither
// resolved (same future effective date, different resulting text).
// ---------------------------------------------------------------------------
describe("Item 6 - CONFLICTED state fails closed", () => {
  it("two competing effects sharing an identical future effective date on section 86.97", () => {
    const DOC = "ia10-item6-doc";
    const INSTRUMENT = "instrument:ia10-item6";
    const TEXT = `Section 7.14 Anchor Covenant . The Borrower shall not incur Indebtedness in excess of $6,000,000.\n\nSection 86.97 Disputed Basket . The Borrower may incur Indebtedness up to $6,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "86.97");
    const proposalA = effect({ effectId: "item6-a", amendmentDocumentId: "amd-item6-a", target: t, newText: "Section 86.97 . up to $18,000,000 (proposal A).", effectiveDate: dated("2099-06-01") });
    const proposalB = effect({ effectId: "item6-b", amendmentDocumentId: "amd-item6-b", target: t, newText: "Section 86.97 . up to $22,000,000 (competing proposal B).", effectiveDate: dated("2099-06-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [proposalA, proposalB] });
    const view = state.provisions.find((p) => p.sectionRef === "86.97")!;
    expect(view.status).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(view.currentText).toBeNull();

    const tools = buildToolSet(access(index, state, [proposalA, proposalB]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getReferencedProvision")!.execute({ ref: "86.97" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 7 - PARTIAL state via a partially-applied amendment sequence: a real,
// resolved, dated effect governs section 17.28 but supplies no capturable
// replacement text (textMissingDespiteAppliedEffect) - deliberately a
// DIFFERENT PARTIAL mechanism than the implementer's own ambiguous-physical-
// target construction.
// ---------------------------------------------------------------------------
describe("Item 7 - PARTIAL state (partially-applied amendment sequence) fails closed", () => {
  it("dated, RESOLVED effect with no capturable newText", () => {
    const DOC = "ia10-item7-doc";
    const INSTRUMENT = "instrument:ia10-item7";
    const TEXT = `Section 8.15 Anchor Covenant . The Borrower shall not incur Indebtedness in excess of $9,000,000.\n\nSection 17.28 Threshold Basket . The Borrower may incur Indebtedness up to $9,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "17.28");
    const bareThreshold = effect({ effectId: "item7-bare", amendmentDocumentId: "amd-item7-bare", target: t, operation: "MODIFY_THRESHOLD", newText: null, effectiveDate: dated("2021-02-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [bareThreshold] });
    const view = state.provisions.find((p) => p.sectionRef === "17.28")!;
    expect(view.status).toBe("OPERATIVE_STATE_PARTIAL");
    expect(view.currentText).toBeNull();
    expect(view.appliedChain).toHaveLength(1); // it DID apply - the fact it governs is known, the text is not.

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "17.28")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [bareThreshold]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Item 8 - REVIEW_REQUIRED via a DIFFERENT reason code than
// AMENDMENT_SEQUENCE_UNRESOLVED: a dated, PAST, per-effect status UNRESOLVED
// effect on section 28.39 (real newText, actually enters appliedChain - not
// excluded by the undated filter at all).
// ---------------------------------------------------------------------------
describe("Item 8 - REVIEW_REQUIRED via a different reason code (per-effect status UNRESOLVED, not AMENDMENT_SEQUENCE_UNRESOLVED)", () => {
  it("dated + applied effect whose own per-effect status is UNRESOLVED still forces REVIEW_REQUIRED, and the resolver still fails closed even though the effect DID apply and set non-null currentText", () => {
    const DOC = "ia10-item8-doc";
    const INSTRUMENT = "instrument:ia10-item8";
    const TEXT = `Section 9.16 Anchor Covenant . The Borrower shall not make Investments in excess of $11,000,000.\n\nSection 28.39 Ambiguous-Target Basket . The Borrower may make Investments up to $11,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "28.39");
    const ambiguousButApplied = effect({
      effectId: "item8-unresolved", amendmentDocumentId: "amd-item8-unresolved", target: t,
      newText: "Section 28.39 . up to $17,000,000 (per-effect status UNRESOLVED - do not trust this newText alone).",
      effectiveDate: dated("2019-08-01"), status: "UNRESOLVED",
      unresolvedReason: "the amendment's own drafting is ambiguous as to whether it modifies this sub-basket or a differently-numbered sibling basket - flagged for manual legal review, independent of any date/sequence uncertainty",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [ambiguousButApplied] });
    const view = state.provisions.find((p) => p.sectionRef === "28.39")!;
    expect(view.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");
    expect(view.appliedChain).toHaveLength(1); // dated + past -> genuinely entered appliedChain (unlike items 2/4's undated mechanism).
    expect(view.currentText).toContain("17,000,000"); // the applied effect's own newText - non-null.
    // Confirm this reached REVIEW_REQUIRED via the PER-EFFECT-STATUS reason
    // code, not AMENDMENT_SEQUENCE_UNRESOLVED (no undated effect exists here at all).
    expect(view.unresolvedIssues.join(" ")).toContain("ambiguous as to whether it modifies");
    expect(view.unresolvedIssues.join(" ")).not.toContain("effective date that could not be safely established");

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "28.39")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [ambiguousButApplied]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(false); // THE CENTRAL QUESTION, for a distinct reason code.
    expect(resolved.textSource).toBe("UNRESOLVED_AMENDED_TEXT");
  });
});

// ---------------------------------------------------------------------------
// Item 9 - absolute reference path (getReferencedProvision resolving a bare
// section reference, no fromNodeId).
// ---------------------------------------------------------------------------
describe("Item 9 - getReferencedProvision absolute-reference path fails closed", () => {
  it("bare 'Section 39.50' resolves to an unresolved section", () => {
    const DOC = "ia10-item9-doc";
    const INSTRUMENT = "instrument:ia10-item9";
    const TEXT = `Section 1.19 Anchor Covenant . The Borrower shall not incur Liens in excess of $1,500,000.\n\nSection 39.50 Excluded Liens Basket . The Borrower may incur Liens up to $1,500,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "39.50");
    const conditional = effect({
      effectId: "item9-cond", amendmentDocumentId: "amd-item9-cond", target: t,
      newText: "Section 39.50 . up to $19,500,000 (conditional).",
      effectiveDate: undated("effectiveness is subject to a closing condition described in a side letter not yet delivered"),
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [conditional] });
    const tools = buildToolSet(access(index, state, [conditional]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getReferencedProvision")!.execute({ ref: "39.50" });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
    expect((outcome.result as { supersessionStatus: string }).supersessionStatus).not.toBe("CURRENT_OPERATIVE");
  });
});

// ---------------------------------------------------------------------------
// Item 10 - relative/fromNodeId-scoped reference path.
// ---------------------------------------------------------------------------
describe("Item 10 - getReferencedProvision fromNodeId/relative-reference path fails closed", () => {
  it("a real DetectedReference from a distinct source clause into an unresolved section 40.61", () => {
    const DOC = "ia10-item10-doc";
    const INSTRUMENT = "instrument:ia10-item10";
    const TEXT = `Section 2.20 Anchor Covenant . The Borrower shall not incur Indebtedness in excess of $2,500,000.\n\nSection 6.60 Cross-Reference Source . Subject to the limitations set forth in Section 40.61, the Borrower may incur additional Indebtedness as described therein.\n\nSection 40.61 Contingent Debt Basket . The Borrower may incur Indebtedness up to $2,500,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "40.61");
    const conditional = effect({
      effectId: "item10-cond", amendmentDocumentId: "amd-item10-cond", target: t,
      newText: "Section 40.61 . up to $21,000,000 (conditional).",
      effectiveDate: undated("effectiveness is subject to receipt of a favorable tax ruling not yet obtained"),
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [conditional] });
    const source = index.getNodeByRef(DOC, "6.60")!;
    const refs = index.findReferencesFrom(source.nodeId);
    const ref = refs.find((r) => r.normalizedTarget === "40.61")!;
    expect(ref.resolved).toBe(true);

    const tools = buildToolSet(access(index, state, [conditional]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getReferencedProvision")!.execute({ ref: ref.referenceText, fromNodeId: source.nodeId });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 11 - getSiblingClauses aggregate-masking attempt: one RESOLVED
// sibling alongside one non-RESOLVED sibling under the same top-level
// parent. Confirm the WHOLE call's evidenceUnresolved is true, while the
// resolved sibling's OWN per-item supersessionStatus stays CURRENT_OPERATIVE
// (no over-blocking of the clean sibling either).
// ---------------------------------------------------------------------------
describe("Item 11 - getSiblingClauses: mixed resolved + non-resolved siblings, whole-call aggregate must mask to unresolved", () => {
  it("sibling Y (resolved amendment) + sibling Z (unresolved amendment), anchor X", () => {
    const DOC = "ia10-item11-doc";
    const INSTRUMENT = "instrument:ia10-item11";
    const TEXT = `Section 3.30 Anchor . The Borrower shall not make Restricted Payments in excess of $3,300,000.\n\nSection 51.62 Resolved Sibling Basket . The Borrower may make Restricted Payments up to $3,300,000 under this basket.\n\nSection 52.73 Unresolved Sibling Basket . The Borrower may make Restricted Payments up to $3,300,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const resolvedTarget = sectionTarget(DOC, INSTRUMENT, "51.62");
    const unresolvedTarget = sectionTarget(DOC, INSTRUMENT, "52.73");
    const resolvedEffect = effect({ effectId: "item11-resolved", amendmentDocumentId: "amd-item11-resolved", target: resolvedTarget, newText: "Section 51.62 . up to $9,500,000 (cleanly amended).", effectiveDate: dated("2018-01-01") });
    const unresolvedEffect = effect({
      effectId: "item11-unresolved", amendmentDocumentId: "amd-item11-unresolved", target: unresolvedTarget,
      newText: "Section 52.73 . up to $29,000,000 (conditional).",
      effectiveDate: undated("effectiveness is conditioned on an unsatisfied minimum-liquidity test"),
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [resolvedEffect, unresolvedEffect] });
    expect(state.provisions.find((p) => p.sectionRef === "51.62")!.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(state.provisions.find((p) => p.sectionRef === "52.73")!.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");

    const anchor = index.getNodeByRef(DOC, "3.30")!;
    const tools = buildToolSet(access(index, state, [resolvedEffect, unresolvedEffect]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getSiblingClauses")!.execute({ nodeId: anchor.nodeId });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true); // masking check: the WHOLE call fails closed.

    const siblings = (outcome.result as { siblings: Array<{ sectionRef: string; supersessionStatus: string; text: string }> }).siblings;
    const resolvedSibling = siblings.find((s) => s.sectionRef === "51.62")!;
    const unresolvedSibling = siblings.find((s) => s.sectionRef === "52.73")!;
    expect(resolvedSibling.supersessionStatus).toBe("CURRENT_OPERATIVE"); // clean sibling not over-blocked.
    expect(resolvedSibling.text).toContain("9,500,000");
    expect(unresolvedSibling.supersessionStatus).not.toBe("CURRENT_OPERATIVE");
  });
});

// ---------------------------------------------------------------------------
// Item 12 - getParentClause.
// ---------------------------------------------------------------------------
describe("Item 12 - getParentClause fails closed on a non-RESOLVED parent", () => {
  it("section 62.73 parent, unresolved via effect status UNRESOLVED (different mechanism than items 2/4/9/10's undated construction)", () => {
    const DOC = "ia10-item12-doc";
    const INSTRUMENT = "instrument:ia10-item12";
    const TEXT = `Section 4.40 Anchor . The Borrower shall not incur Indebtedness in excess of $4,400,000.\n\nSection 62.73 Parent Basket . General provisions: (a) Sub-clause. The Borrower may incur Indebtedness up to $4,400,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "62.73");
    const unresolved = effect({
      effectId: "item12-unresolved", amendmentDocumentId: "amd-item12-unresolved", target: t,
      newText: "Section 62.73 . up to $16,400,000 (per-effect status UNRESOLVED).",
      effectiveDate: dated("2020-09-01"), status: "UNRESOLVED", unresolvedReason: "conflicting drafting instructions in the amendment's own recitals as to the intended scope",
    });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [unresolved] });
    expect(state.provisions.find((p) => p.sectionRef === "62.73")!.status).toBe("OPERATIVE_STATE_REVIEW_REQUIRED");

    const child = index.getNodeByRef(DOC, "62.73(a)")!;
    const tools = buildToolSet(access(index, state, [unresolved]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getParentClause")!.execute({ nodeId: child.nodeId });
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 13 - getChildren re-confirmation (already CERTIFIED_CLOSED from a
// prior audit; ONE fresh construction against its own, separate resolver
// resolveParentSubstructureEvidence, which this patch's shared-type changes
// could in principle have affected).
// ---------------------------------------------------------------------------
describe("Item 13 - getChildren re-confirmation (separate resolveParentSubstructureEvidence resolver)", () => {
  it("section 73.84 parent, unresolved via yet another mechanism (dated-but-conflicted pair) - fresh construction", () => {
    const DOC = "ia10-item13-doc";
    const INSTRUMENT = "instrument:ia10-item13";
    const TEXT = `Section 5.50 Anchor Covenant . The Borrower shall not grant Liens in excess of $5,500,000.\n\nSection 73.84 Contested Parent . General provisions: (a) Sub-clause one. (b) Sub-clause two. The Borrower may grant Liens up to $5,500,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "73.84");
    const proposalA = effect({ effectId: "item13-a", amendmentDocumentId: "amd-item13-a", target: t, newText: "Section 73.84 . up to $12,000,000 (proposal A).", effectiveDate: dated("2099-03-01") });
    const proposalB = effect({ effectId: "item13-b", amendmentDocumentId: "amd-item13-b", target: t, newText: "Section 73.84 . up to $13,000,000 (competing proposal B).", effectiveDate: dated("2099-03-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [proposalA, proposalB] });
    expect(state.provisions.find((p) => p.sectionRef === "73.84")!.status).toBe("OPERATIVE_STATE_CONFLICTED");

    const parentNode = index.getNodeByRef(DOC, "73.84")!;
    const tools = buildToolSet(access(index, state, [proposalA, proposalB]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getChildren")!.execute({ nodeId: parentNode.nodeId });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { parentSupersessionStatus: string }).parentSupersessionStatus).not.toBe("CURRENT_OPERATIVE");
    expect(outcome.evidenceUnresolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 14 - real end-to-end persistence for 2 fresh constructions: tool call
// -> compile -> verify -> persist SemanticTruth -> FRESH real Postgres read.
// Reuses items 4 and 12's own fixtures (deliberately different tools:
// getOperativeProvision and getParentClause).
// ---------------------------------------------------------------------------
describe("Item 14 - real end-to-end persistence: trustStatus never VERIFIED for a non-RESOLVED construction", () => {
  async function runNonResolvedE2E(opts: {
    doc: string; instrument: string; text: string; anchorRef: string; unresolvedRef: string;
    toolName: string; toolInput: Record<string, unknown>; effects: AmendmentEffectCandidate[]; anchorAmount: number;
  }) {
    const { index } = buildIndex(opts.doc, opts.text);
    const state = computeOperativeContractState({ instrumentKey: opts.instrument, baseDocumentId: opts.doc, asOfDate: "2024-06-01", index, allEffects: opts.effects });
    const view = state.provisions.find((p) => p.sectionRef === opts.unresolvedRef)!;
    expect(view.status).not.toBe("OPERATIVE_STATE_RESOLVED");

    const anchorNode = index.getNodeByRef(opts.doc, opts.anchorRef)!;
    const candidate = makeCandidate({ documentId: opts.doc, structuralNodeKeys: [anchorNode.nodeKey], structuralNodeIds: [anchorNode.nodeId], normalizedSourceRef: opts.anchorRef });
    const packageAccess: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map(), operativeState: state };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "p", companyId: COMPANY_ID, instrumentKey: opts.instrument }, packageAccess);
    expect(bundle.hasUnresolvedOperativeEvidence).toBe(false); // isolates the tool-call path.

    const tools = buildToolSet(access(index, state, opts.effects), opts.doc, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const directOutcome = tools.find((tl) => tl.name === opts.toolName)!.execute(opts.toolInput);
    expect(directOutcome.ok).toBe(true);
    expect(directOutcome.evidenceUnresolved).toBe(true);

    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: opts.instrument, sourceDocumentId: opts.doc, sourceSectionRef: opts.anchorRef, candidateRef: candidate.discoveryId,
      operativeSourceText: index.getNodeText(anchorNode.nodeId, "DESCENDANTS"), contextBundle: bundle,
      toolAccess: access(index, state, opts.effects),
    });
    const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUse("t1", opts.toolName, opts.toolInput)], [submit(opts.anchorRef, opts.anchorAmount, `confirmed via ${opts.toolName}`)]]));
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });
    expect(compilationResult.toolCallLog[0]!.evidenceUnresolved).toBe(true);
    expect(compilationResult.status).toBe("REVIEW_REQUIRED");

    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });
    expect(verification.status).toBe("REVIEW_REQUIRED");
    expect(verification.status).not.toMatch(/^VERIFIED_/);

    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
    await persistSemanticTruthForInstrument({
      companyId: COMPANY_ID, packageKey: null, instrumentKey: opts.instrument, analysisRunId: null,
      objects: compilationResult.rules.map((rule) => ({ kind: "RULE" as const, object: rule, candidateRef: candidate.discoveryId, compilerVersions, verification, verifierPromptVersion: "test-verifier-v1" })),
    });

    const trusted = await getTrustedSemanticTruth(COMPANY_ID, opts.instrument);
    const all = await getAllSemanticTruthForInstrument(COMPANY_ID, opts.instrument);
    expect(all.length).toBeGreaterThan(0);
    expect(trusted.length).toBe(0);
    for (const rec of all) expect(rec.trustStatus).not.toBe("VERIFIED");

    const rows = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey: opts.instrument } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.trustStatus).not.toBe("VERIFIED");
  }

  it("1. getOperativeProvision (item 4's fixture): never persists VERIFIED", async () => {
    const DOC = "ia10-item14a-doc";
    const INSTRUMENT = "instrument:ia10-item14a";
    const TEXT = `Section 5.12 Anchor . The Borrower shall not incur Indebtedness in excess of $2,000,000.\n\nSection 64.75 Contingent Basket . The Borrower may make Investments up to $2,000,000 under this basket.`;
    const t = sectionTarget(DOC, INSTRUMENT, "64.75");
    const contingent = effect({
      effectId: "item14a-contingent", amendmentDocumentId: "amd-item14a-contingent", target: t,
      newText: "Section 64.75 . up to $25,000,000 (contingent, once effective).",
      effectiveDate: undated("effectiveness is contingent upon satisfaction of a financial-covenant reset condition not yet certified by the Administrative Agent"),
    });
    await runNonResolvedE2E({ doc: DOC, instrument: INSTRUMENT, text: TEXT, anchorRef: "5.12", unresolvedRef: "64.75", toolName: "getOperativeProvision", toolInput: { sectionRef: "64.75" }, effects: [contingent], anchorAmount: 2_000_000 });
  });

  it("2. getParentClause (item 12's fixture): never persists VERIFIED", async () => {
    const DOC = "ia10-item14b-doc";
    const INSTRUMENT = "instrument:ia10-item14b";
    const TEXT = `Section 4.40 Anchor . The Borrower shall not incur Indebtedness in excess of $4,400,000.\n\nSection 62.73 Parent Basket . General provisions: (a) Sub-clause. The Borrower may incur Indebtedness up to $4,400,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const child = index.getNodeByRef(DOC, "62.73(a)")!;
    const t = sectionTarget(DOC, INSTRUMENT, "62.73");
    const unresolved = effect({
      effectId: "item14b-unresolved", amendmentDocumentId: "amd-item14b-unresolved", target: t,
      newText: "Section 62.73 . up to $16,400,000 (per-effect status UNRESOLVED).",
      effectiveDate: dated("2020-09-01"), status: "UNRESOLVED", unresolvedReason: "conflicting drafting instructions in the amendment's own recitals as to the intended scope",
    });
    await runNonResolvedE2E({ doc: DOC, instrument: INSTRUMENT, text: TEXT, anchorRef: "4.40", unresolvedRef: "62.73", toolName: "getParentClause", toolInput: { nodeId: child.nodeId }, effects: [unresolved], anchorAmount: 4_400_000 });
  });
});

// ---------------------------------------------------------------------------
// Item 15 - clean controls: confirm no over-blocking regression.
// ---------------------------------------------------------------------------
describe("Item 15 - clean controls (no over-blocking regression)", () => {
  it("a genuinely RESOLVED provision with real amended currentText still reaches evidenceCurrent true at the resolver and evidenceUnresolved false at the tool boundary", () => {
    const DOC = "ia10-item15a-doc";
    const INSTRUMENT = "instrument:ia10-item15a";
    const TEXT = `Section 6.60 Anchor Covenant . The Borrower shall not incur Indebtedness in excess of $10,000,000.\n\nSection 82.93 Cleanly Amended Basket . The Borrower may incur Indebtedness up to $10,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const t = sectionTarget(DOC, INSTRUMENT, "82.93");
    const cleanAmendment = effect({ effectId: "item15a-clean", amendmentDocumentId: "amd-item15a-clean", target: t, newText: "Section 82.93 . up to $14,000,000 (cleanly amended, no ambiguity).", effectiveDate: dated("2018-04-01") });
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [cleanAmendment] });
    const view = state.provisions.find((p) => p.sectionRef === "82.93")!;
    expect(view.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(view.currentText).toContain("14,000,000");

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "82.93")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, [cleanAmendment]), supersessionIndex, node);
    expect(resolved.evidenceCurrent).toBe(true);
    expect(resolved.textSource).toBe("AMENDED_CURRENT_TEXT");

    const tools = buildToolSet(access(index, state, [cleanAmendment]), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const opOutcome = tools.find((tl) => tl.name === "getOperativeProvision")!.execute({ sectionRef: "82.93" });
    expect(opOutcome.evidenceUnresolved).toBe(false);
    const parentClauseOutcome = tools.find((tl) => tl.name === "getReferencedProvision")!.execute({ ref: "82.93" });
    expect(parentClauseOutcome.evidenceUnresolved).toBe(false);
  });

  it("a never-amended base section still resolves current (CASE D) at the resolver and every tool boundary", () => {
    const DOC = "ia10-item15b-doc";
    const INSTRUMENT = "instrument:ia10-item15b";
    const TEXT = `Section 7.70 Anchor Covenant . The Borrower shall not incur Liens in excess of $1,000,000.\n\nSection 91.02 Never Amended Basket . The Borrower may incur Liens up to $1,000,000 under this basket.`;
    const { index } = buildIndex(DOC, TEXT);
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [] });

    const supersessionIndex = buildNodeSupersessionIndex([{ baseDocumentId: DOC, state }]);
    const node = index.getNodeByRef(DOC, "91.02")!;
    const resolved = resolveNodeWithSupersessionAwareness(access(index, state, []), supersessionIndex, node);
    expect(resolved.provisionOperativeStatus).toBeNull(); // no view at all - CASE D.
    expect(resolved.evidenceCurrent).toBe(true);

    const tools = buildToolSet(access(index, state, []), DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((tl) => tl.name === "getReferencedProvision")!.execute({ ref: "91.02" });
    expect(outcome.evidenceUnresolved).toBe(false);
    expect((outcome.result as { supersessionStatus: string }).supersessionStatus).toBe("CURRENT_OPERATIVE");
  });

  it("real end-to-end persistence: a genuinely current (never-amended) provision reaches a persisted VERIFIED SemanticTruthRecord, confirmed by a fresh Postgres read", async () => {
    // NOTE ON SCOPE: this positive control deliberately uses a NEVER-amended
    // section (CASE D), not a RESOLVED-amended one (CASE B), for the FULL
    // persist-to-VERIFIED path. Direct tracing (see debug run recorded in
    // docs/open2-final-direct-patch/10-independent-confirmation.json, item 15)
    // found that verifyCompiledCandidate has its OWN separate, independent
    // KNOWN_SUPERSEDED gate (verify.ts line ~286, `sourceInventory.
    // supersessionStatus === "KNOWN_SUPERSEDED" -> REVIEW_REQUIRED`), keyed
    // off the OLD base physical node resolveUniqueNodeByRef(sourceSectionRef)
    // finds - which is unconditionally KNOWN_SUPERSEDED for any section that
    // was itself amendment-replaced, by design, regardless of
    // resolveNodeWithSupersessionAwareness's own (correct) CASE B verdict.
    // This is a real, pre-existing, intentionally conservative verifier-level
    // mechanism, orthogonal to the tools.ts fix under audit here - not an
    // over-blocking regression from this patch. CASE B's own
    // evidenceCurrent=true/evidenceUnresolved=false claim is independently
    // confirmed at the resolver AND tool boundary in the sibling test above
    // in this same describe block.
    const DOC = "ia10-item15c-doc";
    const INSTRUMENT = "instrument:ia10-item15c";
    // Mirrors the proven-clean reconciliation shape (single non-enumerated
    // basket naming both Borrower and Restricted Subsidiary, amount matching
    // operativeSourceText exactly, entityScope populated to match) already
    // established by tests/contract-model/semantic-truth-persistence.test.ts.
    const TEXT = `ARTICLE I. DEFINITIONS

"Borrower" means the Company.
"Restricted Subsidiary" means any Subsidiary of the Borrower that is not an Unrestricted Subsidiary.

ARTICLE VI. NEGATIVE COVENANTS

Section 95.10 Indebtedness . The Borrower shall not, and shall not permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness in an aggregate principal amount at any time outstanding in excess of $10,000,000.
`;
    const { index } = buildIndex(DOC, TEXT);
    const state = computeOperativeContractState({ instrumentKey: INSTRUMENT, baseDocumentId: DOC, asOfDate: "2024-06-01", index, allEffects: [] });

    const anchorNode = index.getNodeByRef(DOC, "95.10")!;
    const candidate = makeCandidate({ documentId: DOC, structuralNodeKeys: [anchorNode.nodeKey], structuralNodeIds: [anchorNode.nodeId], normalizedSourceRef: "95.10" });
    const toolAccess = access(index, state, []);
    const bundle = emptyContextBundle({ companyId: COMPANY_ID, instrumentKey: INSTRUMENT, originatingDocumentId: DOC, normalizedSourceRef: "95.10" });

    const tools = buildToolSet(toolAccess, DOC, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const directOutcome = tools.find((tl) => tl.name === "getOperativeProvision")!.execute({ sectionRef: "95.10" });
    expect(directOutcome.evidenceUnresolved).toBe(false);

    const operativeSourceText = index.getNodeText(anchorNode.nodeId, "OWN");
    const compilerInput = testCompilerInput({
      companyId: COMPANY_ID, instrumentKey: INSTRUMENT, sourceDocumentId: DOC, sourceSectionRef: "95.10", candidateRef: candidate.discoveryId,
      operativeSourceText, contextBundle: bundle, toolAccess,
    });
    const submitBlock = toolUse("submit", "submit_compilation", {
      rules: [{
        localRef: "r1", sourceSectionRef: "95.10", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION",
        entityScope: ["Borrower", "Restricted Subsidiary"],
        capacityExpression: { kind: "MONEY", type: "MONEY", exprId: "e1", amount: 10_000_000, currency: "USD" },
        sufficiency: "COMPLETE", sufficiencyReasons: ["confirmed current via getOperativeProvision, never amended"],
      }],
      definitions: [],
    });
    const caller = new RealSemanticCaller("test", "test-model", scriptedClient([[toolUse("t1", "getOperativeProvision", { sectionRef: "95.10" })], [submitBlock]]));
    const compilationResult = await compileCovenantToIR(compilerInput, { caller, cache: new InMemorySemanticCompilationCache() });
    expect(compilationResult.toolCallLog[0]!.evidenceUnresolved).toBe(false);

    const verification = await verifyCompiledCandidate({ compilerInput, compilationResult }, { skipSemanticReview: true });
    expect(verification.status).toMatch(/^VERIFIED_/); // clean control: must actually reach VERIFIED, not merely "not REVIEW_REQUIRED".

    const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION, toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION };
    await persistSemanticTruthForInstrument({
      companyId: COMPANY_ID, packageKey: null, instrumentKey: INSTRUMENT, analysisRunId: null,
      objects: compilationResult.rules.map((rule) => ({ kind: "RULE" as const, object: rule, candidateRef: candidate.discoveryId, compilerVersions, verification, verifierPromptVersion: "test-verifier-v1" })),
    });

    // FRESH Postgres read - never trusting the in-memory verification object alone.
    const trusted = await getTrustedSemanticTruth(COMPANY_ID, INSTRUMENT);
    expect(trusted.length).toBeGreaterThan(0);
    expect(trusted[0]!.trustStatus).toBe("VERIFIED");

    const rows = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey: INSTRUMENT } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.trustStatus === "VERIFIED")).toBe(true);
  });
});
