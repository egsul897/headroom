/**
 * Phase 3F.1.6.R BLOCKER-5 fix (certification finding SUPER-5) - permanent
 * enforcement test.
 *
 * The original defect: 5 of the 14 LLM-facing evidence tools in
 * lib/contract-model/compiler/semantic/tools.ts (getReferencedProvision,
 * getParentClause, getChildren, getSiblingClauses, getSourceSpan)
 * navigated the raw StructuralIndex directly and never consulted
 * access.operativeState at all, despite getReferencedProvision's own
 * description telling the model to trust it for "the covenant's actual
 * economics." The fix routed 4 of them through the same
 * findProvisionView-first path getOperativeProvision already used, and
 * made the 5th (getSourceSpan - legitimately raw/historical by design)
 * explicitly disclose its own supersessionStatus instead.
 *
 * THIS TEST is the permanent guardrail the certification asked for: it
 * iterates every REGISTERED tool (not a hardcoded list of names) and
 * asserts each declares a real `operativeStateDiscipline` - a field
 * TypeScript itself refuses to compile a ToolDefinition without. A future
 * new tool that reads raw structural text without EITHER consulting
 * operative state OR being labeled historical cannot even compile, and
 * this test additionally spot-checks that the declared discipline matches
 * the tool's own real runtime behavior for a representative case.
 */
import { describe, expect, it } from "vitest";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildToolSet, type ToolOperativeStateDiscipline } from "../../lib/contract-model/compiler/semantic/tools";
import { DEFAULT_TOOL_BUDGET } from "../../lib/contract-model/compiler/semantic/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { OperativeContractState, OperativeProvisionView } from "../../lib/contract-model/compiler/amendment/types";
import { emptyContextBundle, TEST_DOCUMENT_ID } from "./semantic-compiler/test-helpers";

const SECTION_601_TEXT = "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness in excess of $10,000,000.\n";
const SECTION_602_TEXT = "Section 6.02 Liens. Compliance with this covenant is measured with reference to Section 6.01.\n";
const FULL_TEXT = SECTION_601_TEXT + SECTION_602_TEXT;

function buildRealIndex() {
  const section601: StructuralNode = { documentId: TEST_DOCUMENT_ID, nodeType: "SECTION", heading: "Indebtedness", sectionRef: "6.01", nodeKey: `${TEST_DOCUMENT_ID}::6.01`, nodeId: `n-${TEST_DOCUMENT_ID}-6.01`, charStart: 0, charEnd: SECTION_601_TEXT.length, ordinal: 0, parentSectionRef: null, parentNodeId: null };
  const section602: StructuralNode = { documentId: TEST_DOCUMENT_ID, nodeType: "SECTION", heading: "Liens", sectionRef: "6.02", nodeKey: `${TEST_DOCUMENT_ID}::6.02`, nodeId: `n-${TEST_DOCUMENT_ID}-6.02`, charStart: SECTION_601_TEXT.length, charEnd: FULL_TEXT.length, ordinal: 1, parentSectionRef: null, parentNodeId: null };
  const nodes = [section601, section602];
  const index = buildStructuralIndex(new Map([[TEST_DOCUMENT_ID, { text: FULL_TEXT, nodes }]]), [], []);
  return { index, section601, section602 };
}

function supersededProvision(section601: StructuralNode): OperativeProvisionView {
  return {
    instrumentKey: "instrument-1",
    provisionKey: "prov-6.01",
    kind: "SECTION",
    documentId: TEST_DOCUMENT_ID,
    sectionRef: "6.01",
    definedTermRef: null,
    asOfDate: "2026-01-01",
    currentSourceDocumentId: "doc-third-amendment",
    currentSourceNodeKey: "doc-third-amendment::6.01-amended",
    currentSourceNodeId: "id-doc-third-amendment-6-01-amended",
    currentText: "Section 6.01 Indebtedness. No Loan Party shall incur Indebtedness in excess of $25,000,000.",
    fullChain: [],
    appliedChain: [],
    supersededSourceNodeKeys: [section601.nodeKey],
    supersededSourceNodeIds: [section601.nodeId],
    status: "OPERATIVE_STATE_RESOLVED",
    unresolvedIssues: [],
    conflicts: [],
    targetResolutionStatus: "UNIQUE",
    targetResolutionReason: null,
    candidateSourceNodeIds: [],
    structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
    structuralHealthIssues: [],
    attemptedText: null,
    reviewRequired: false,
    candidateTexts: [],
  };
}

const VALID_DISCIPLINES: ToolOperativeStateDiscipline[] = ["CURRENT_OPERATIVE_EVIDENCE", "HISTORICAL_EVIDENCE_WITH_STATUS", "NOT_CONTRACT_TEXT_EVIDENCE"];

describe("BLOCKER-5 permanent enforcement: every registered LLM-facing evidence tool declares a real operativeStateDiscipline", () => {
  it("all 14 tools are present and each declares exactly one of the known-safe disciplines", () => {
    const { index } = buildRealIndex();
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);

    expect(tools.length).toBe(14);
    for (const tool of tools) {
      expect(VALID_DISCIPLINES, `tool "${tool.name}" must declare a real operativeStateDiscipline`).toContain(tool.operativeStateDiscipline);
    }
  });

  it("the 5 originally-affected tools (SUPER-5) are no longer classified RAW_EVIDENCE_BY_DESIGN - each is CURRENT_OPERATIVE_EVIDENCE or HISTORICAL_EVIDENCE_WITH_STATUS", () => {
    const { index } = buildRealIndex();
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const byName = new Map(tools.map((t) => [t.name, t]));

    expect(byName.get("getReferencedProvision")!.operativeStateDiscipline).toBe("CURRENT_OPERATIVE_EVIDENCE");
    expect(byName.get("getParentClause")!.operativeStateDiscipline).toBe("CURRENT_OPERATIVE_EVIDENCE");
    expect(byName.get("getChildren")!.operativeStateDiscipline).toBe("CURRENT_OPERATIVE_EVIDENCE");
    expect(byName.get("getSiblingClauses")!.operativeStateDiscipline).toBe("CURRENT_OPERATIVE_EVIDENCE");
    expect(byName.get("getSourceSpan")!.operativeStateDiscipline).toBe("HISTORICAL_EVIDENCE_WITH_STATUS");
  });

  it("Phase 3F.1.6.RX fix: getContextBundleComponent/getSharedCapContext are HISTORICAL_EVIDENCE_WITH_STATUS, not NOT_CONTRACT_TEXT_EVIDENCE - an independent trace found the prior 'already-vetted' classification false (context-retrieval/pipeline.ts has zero operative-state awareness of its own)", () => {
    const { index } = buildRealIndex();
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get("getContextBundleComponent")!.operativeStateDiscipline).toBe("HISTORICAL_EVIDENCE_WITH_STATUS");
    expect(byName.get("getSharedCapContext")!.operativeStateDiscipline).toBe("HISTORICAL_EVIDENCE_WITH_STATUS");
  });

  it("every tool declared CURRENT_OPERATIVE_EVIDENCE that returns provision text actually includes a real supersessionStatus in its response (spot-check against real behavior, not just the static label)", () => {
    const { index, section601 } = buildRealIndex();
    const operativeState: OperativeContractState = { instrumentKey: "instrument-1", asOfDate: "2026-01-01", provisions: [supersededProvision(section601)], status: "OPERATIVE_STATE_RESOLVED", summary: "test", unattachedEffects: [] };
    const tools = buildToolSet({ structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle({ originatingDocumentId: TEST_DOCUMENT_ID }) }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);

    const getReferencedProvision = tools.find((t) => t.name === "getReferencedProvision")!;
    const refOutcome = getReferencedProvision.execute({ ref: "6.01" }).result as Record<string, unknown>;
    expect(refOutcome.supersessionStatus).toBe("CURRENT_OPERATIVE"); // resolved via the amended provision.

    const getSiblingClauses = tools.find((t) => t.name === "getSiblingClauses")!;
    const siblingsOutcome = getSiblingClauses.execute({ nodeId: `n-${TEST_DOCUMENT_ID}-6.02` }).result as { siblings: Array<Record<string, unknown>> };
    expect(siblingsOutcome.siblings.length).toBeGreaterThan(0);
    expect(siblingsOutcome.siblings[0]).toHaveProperty("supersessionStatus");

    const getChildren = tools.find((t) => t.name === "getChildren")!;
    const childrenOutcome = getChildren.execute({ nodeId: section601.nodeId }).result as Record<string, unknown>;
    expect(childrenOutcome).toHaveProperty("parentSupersessionStatus");

    const getSourceSpan = tools.find((t) => t.name === "getSourceSpan")!;
    const spanOutcome = getSourceSpan.execute({ nodeId: section601.nodeId }).result as Record<string, unknown>;
    expect(spanOutcome).toHaveProperty("supersessionStatus");
    expect(spanOutcome).toHaveProperty("supersessionReason");
  });

  it("a hypothetical tool missing operativeStateDiscipline cannot satisfy the ToolDefinition type - enforced at compile time, not merely by this runtime test (documentation assertion: the interface field is non-optional)", () => {
    // This is a documentation-level assertion: ToolDefinition.operativeStateDiscipline
    // is declared as a required (non-optional) field in tools.ts. Attempting
    // `{ name: "x", description: "x", inputSchema: ..., execute: ... }` without
    // it is a TypeScript compile error, not a runtime failure - the strongest
    // enforcement available, verified indirectly here by confirming every
    // real registered tool's own field is a non-empty, known string (never
    // undefined, which a missing field would produce at runtime if the type
    // system were ever bypassed via `as ToolDefinition`).
    const { index } = buildRealIndex();
    const tools = buildToolSet({ structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() }, TEST_DOCUMENT_ID, { current: 0 }, DEFAULT_TOOL_BUDGET);
    for (const tool of tools) {
      expect(tool.operativeStateDiscipline).toBeDefined();
      expect(typeof tool.operativeStateDiscipline).toBe("string");
    }
  });
});
