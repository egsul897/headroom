/**
 * Phase 3B synthetic test matrix, part 2 (task §37 item 17, §38 tool-fault
 * tests, §39 no-overretrieval tests, §61 tenant isolation). Exercises the
 * real controlled evidence tools (tools.ts) against a small, real
 * StructuralIndex built the same way Phase 2A's own STRUCTURE stage would
 * build one - never a mocked index, since the whole point of these tools
 * is that they are thin wrappers over real, already-proven Phase 2 APIs.
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../../lib/contract-model/compiler/structural-references";
import { buildToolSet, ToolRunner } from "../../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../../lib/contract-model/compiler/semantic/types";
import type { StructuralNode } from "../../../lib/contract-model/compiler/types";
import { emptyContextBundle, TEST_DOCUMENT_ID } from "./test-helpers";

const SECTION_TEXT = "The Company may not incur Indebtedness in excess of 10% of Consolidated EBITDA.\n";
const DEFINITION_TEXT = '"Consolidated EBITDA" means, for any period, the consolidated net income of the Company plus interest, taxes, depreciation and amortization.\n';
const FULL_TEXT = SECTION_TEXT + DEFINITION_TEXT;

function buildRealIndex() {
  const sectionNode: StructuralNode = { documentId: TEST_DOCUMENT_ID, nodeType: "SECTION", heading: "Indebtedness", sectionRef: "9.01", nodeKey: `${TEST_DOCUMENT_ID}::9.01`, charStart: 0, charEnd: SECTION_TEXT.length, ordinal: 0, parentSectionRef: null };
  const definitionSectionNode: StructuralNode = { documentId: TEST_DOCUMENT_ID, nodeType: "SECTION", heading: "Definitions", sectionRef: "1.01", nodeKey: `${TEST_DOCUMENT_ID}::1.01`, charStart: SECTION_TEXT.length, charEnd: FULL_TEXT.length, ordinal: 1, parentSectionRef: null };
  const nodes = [sectionNode, definitionSectionNode];
  const definitions = detectStructuralDefinitions(TEST_DOCUMENT_ID, FULL_TEXT, nodes);
  const references = detectStructuralReferences(TEST_DOCUMENT_ID, FULL_TEXT, nodes);
  const index = buildStructuralIndex(new Map([[TEST_DOCUMENT_ID, { text: FULL_TEXT, nodes }]]), definitions, references);
  return { index, sectionNode, definitionSectionNode };
}

describe("Phase 3B synthetic tests - controlled evidence tools", () => {
  it("17: getDefinition retrieves a REAL definition not in the initial context bundle - the missing-context tool-request success path", () => {
    const { index } = buildRealIndex();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const getDefinition = tools.find((t) => t.name === "getDefinition")!;
    const outcome = getDefinition.execute({ term: "Consolidated EBITDA" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as { text: string }).text).toContain("consolidated net income");
  });

  it("getParentClause/getSiblingClauses return real, source-backed structural neighbors", () => {
    const { index, sectionNode, definitionSectionNode } = buildRealIndex();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const siblings = tools.find((t) => t.name === "getSiblingClauses")!.execute({ nodeId: sectionNode.nodeKey });
    expect(siblings.ok).toBe(true);
    expect((siblings.result as { siblings: { sectionRef: string }[] }).siblings.map((s) => s.sectionRef)).toContain(definitionSectionNode.sectionRef);
  });

  it("38a (tool fault): getDefinition for a term that genuinely does not exist refuses honestly, never fabricates", () => {
    const { index } = buildRealIndex();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getDefinition")!.execute({ term: "Nonexistent Defined Term" });
    expect(outcome.ok).toBe(false);
    expect((outcome.result as { error: string }).error).toMatch(/no defined term/);
  });

  it("18/39 (tool budget + no-overretrieval): ToolRunner refuses once maxToolCalls is exhausted", () => {
    const { index } = buildRealIndex();
    const charsUsed = { current: 0 };
    const budget = { ...DEFAULT_TOOL_BUDGET, maxToolCalls: 2 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, charsUsed, budget);
    const runner = new ToolRunner(tools, budget);
    runner.run("getInstrumentDocuments", {});
    runner.run("getDefinition", { term: "Consolidated EBITDA" });
    const third = runner.run("getDefinition", { term: "Some Other Term" }) as { error: string };
    expect(third.error).toMatch(/budget exhausted/);
    expect(runner.log).toHaveLength(3); // the refusal itself is still logged (task §34 - never silently discarded)
    expect(runner.remainingCalls).toBe(0);
  });

  it("19/39 (repeated-request suppression): an IDENTICAL request is refused the second time, never re-served or re-counted against real evidence", () => {
    const { index } = buildRealIndex();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const runner = new ToolRunner(tools, DEFAULT_TOOL_BUDGET);
    const first = runner.run("getDefinition", { term: "Consolidated EBITDA" }) as { text?: string };
    const second = runner.run("getDefinition", { term: "Consolidated EBITDA" }) as { error?: string };
    expect(first.text).toBeTruthy();
    expect(second.error).toMatch(/already made/);
  });

  it("unknown tool name is refused honestly rather than crashing", () => {
    const { index } = buildRealIndex();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const runner = new ToolRunner(tools, DEFAULT_TOOL_BUDGET);
    const result = runner.run("deleteEverything", {}) as { error: string };
    expect(result.error).toMatch(/unknown tool/);
  });

  it("61 (tenant/instrument isolation): a tool call naming a nodeId from a document outside this instrument is refused, never silently served", () => {
    const { index } = buildRealIndex();
    const charsUsed = { current: 0 };
    // No packageGraph supplied - allowedDocumentIds() must default to "home document only," never widen scope in the absence of evidence.
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const foreignNodeId = "a-different-document::9.01";
    const outcome = tools.find((t) => t.name === "getParentClause")!.execute({ nodeId: foreignNodeId });
    expect(outcome.ok).toBe(false);
  });

  it("getSharedCapContext and getContextBundleComponent surface only what is already in the bundle, never invent evidence", () => {
    const bundle = emptyContextBundle({ items: [{ itemId: "item-1", type: "SHARED_CAP", documentId: TEST_DOCUMENT_ID, structuralNodeKey: null, normalizedRef: "9.01", sourceCitation: "§9.01", excerptText: "shared cap text", reason: "test", retrievalDepth: 0, retrievalPath: [], retrievalMethod: "STRUCTURAL_TRAVERSAL", confidence: null }] });
    const { index } = buildRealIndex();
    const charsUsed = { current: 0 };
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: bundle }, TEST_DOCUMENT_ID, charsUsed, DEFAULT_TOOL_BUDGET);
    const shared = tools.find((t) => t.name === "getSharedCapContext")!.execute({});
    expect((shared.result as { items: unknown[] }).items).toHaveLength(1);
    const missing = tools.find((t) => t.name === "getContextBundleComponent")!.execute({ itemId: "does-not-exist" });
    expect(missing.ok).toBe(false);
  });
});
