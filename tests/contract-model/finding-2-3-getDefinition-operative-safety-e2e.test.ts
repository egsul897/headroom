/**
 * Phase 3F.1.6.RX-FINAL Workstream B - FINDING-2/FINDING-3 required
 * end-to-end test (task brief's own "Required end-to-end test" section).
 *
 * Proves the getDefinition fix (lib/contract-model/compiler/semantic/
 * tools.ts) has a REAL downstream effect on the actual, live tool-use
 * compilation loop - not merely a cosmetic label change on the tool's own
 * unit-level return value (already covered by
 * tests/contract-model/part-b-recert-blocker2-6-tools-adversarial.test.ts).
 *
 * Construction: a real StructuralIndex holding a stale, pre-amendment
 * definition of "Permitted Investments" ($8,000,000), paired with a real
 * OperativeContractState whose one DEFINITION-kind OperativeProvisionView
 * for that exact term is AMBIGUOUS/OPERATIVE_STATE_PARTIAL (targetResolution
 * could not uniquely attach a real amendment to either of 2 colliding
 * physical occurrences - the same fixture shape as
 * cross-module-propagation-chains.test.ts's own "Chain 2" BLOCKER-6
 * construction). Compiled via the REAL RealSemanticCaller.compile() (the
 * exact class getSemanticCaller() returns in production) and the REAL
 * normalizeSubmission()/compileCovenantToIR() - only the Anthropic client
 * itself is scripted, exactly like caller-tool-discipline.test.ts's own
 * established convention. This exercises the REAL ToolRunner, the REAL
 * getDefinition.execute(), and the REAL deterministic post-processing -
 * never a mock of any of that production logic.
 *
 * ARCHITECTURAL FACT this test also documents (relevant to "not merely
 * cosmetic"): normalize.ts's own enforceSufficiencyConsistency (the ONE
 * deterministic backstop that can force a sufficiency downgrade based on
 * operative-state uncertainty) is called with `operativeLineage: null` for
 * EVERY definition, unconditionally (normalize.ts line ~397) - lineage is
 * only ever computed at the CANDIDATE/rule level (its own anchored
 * structuralNodeIds), never per defined-term. This means a DEFINITION's own
 * sufficiency has NO deterministic downstream backstop at all - the
 * getDefinition tool's own honest disclosure to the model is the ONLY real
 * control point standing between an ambiguous, on-file amendment and a
 * falsely-confident COMPLETE definition reaching persisted IR. That is
 * exactly what makes this fix load-bearing rather than cosmetic, and it is
 * independently confirmed by test 2 below (a model that ignores the
 * disclosure is not caught by any other mechanism - proving the disclosure
 * itself, not some other downstream gate, is what test 1 depends on).
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { enforceSufficiencyConsistency } from "../../lib/contract-model/compiler/semantic/normalize";
import type { SemanticCompilerInput, SemanticToolAccess } from "../../lib/contract-model/compiler/semantic/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import type { OperativeContractState, OperativeProvisionView } from "../../lib/contract-model/compiler/amendment/types";
import type { DetectedDefinition } from "../../lib/contract-model/compiler/structural-definitions";
import { emptyContextBundle, testCompilerInput, TEST_DOCUMENT_ID } from "./semantic-compiler/test-helpers";

const STALE_DEFINITION_TEXT = `"Permitted Investments" means investments not to exceed $8,000,000 in the aggregate.`;

function buildAccessWithAmbiguousDefinition(): SemanticToolAccess {
  const node: StructuralNode = {
    documentId: TEST_DOCUMENT_ID,
    nodeType: "CLAUSE",
    heading: "Permitted Investments",
    sectionRef: "1.01(pi)",
    nodeKey: `${TEST_DOCUMENT_ID}::1.01(pi)`,
    nodeId: `n-${TEST_DOCUMENT_ID}-pi`,
    charStart: 0,
    charEnd: STALE_DEFINITION_TEXT.length,
    ordinal: 0,
    parentSectionRef: null,
    parentNodeId: null,
  };
  const def: DetectedDefinition = {
    documentId: TEST_DOCUMENT_ID,
    exactTerm: "Permitted Investments",
    normalizedTerm: "permitted investments",
    sourceNodeKey: node.nodeKey,
    sourceNodeId: node.nodeId,
    charStart: 0,
    charEnd: STALE_DEFINITION_TEXT.length,
    definitionExcerpt: STALE_DEFINITION_TEXT,
  };
  const index = buildStructuralIndex(new Map([[TEST_DOCUMENT_ID, { text: STALE_DEFINITION_TEXT, nodes: [node] }]]), [def], []);

  const ambiguousDefinitionProvision: OperativeProvisionView = {
    instrumentKey: "instrument-1",
    provisionKey: "instrument-1::DEFINITION::permitted investments",
    kind: "DEFINITION",
    documentId: TEST_DOCUMENT_ID,
    sectionRef: null,
    definedTermRef: "Permitted Investments",
    asOfDate: "2026-01-01",
    currentSourceDocumentId: TEST_DOCUMENT_ID,
    currentSourceNodeKey: null,
    currentSourceNodeId: null,
    currentText: null, // honest: AMBIGUOUS target resolution -> no confidently-attached currentText.
    fullChain: [{ effectId: "eff-1", amendmentDocumentId: "amend-doc-1", operation: "MODIFY_THRESHOLD", effectiveDate: { date: "2024-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "test", reason: "test" }, sourceCitation: "Amendment No. 1 Section 2", appliedAsOfQuery: true }],
    appliedChain: [{ effectId: "eff-1", amendmentDocumentId: "amend-doc-1", operation: "MODIFY_THRESHOLD", effectiveDate: { date: "2024-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "test", reason: "test" }, sourceCitation: "Amendment No. 1 Section 2", appliedAsOfQuery: true }],
    supersededSourceNodeKeys: [],
    supersededSourceNodeIds: [],
    status: "OPERATIVE_STATE_PARTIAL",
    unresolvedIssues: ["This defined term's own base reference is AMBIGUOUS: 2 distinct physical occurrences define it, and the amendment's own target could not be uniquely attached to either."],
    conflicts: [],
    targetResolutionStatus: "AMBIGUOUS",
    targetResolutionReason: "2 distinct physical occurrences of \"Permitted Investments\" exist in this document - the amendment's own target could not be uniquely resolved.",
    candidateSourceNodeIds: ["n-permitted-investments-a", "n-permitted-investments-b"],
    structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
    structuralHealthIssues: [],
    attemptedText: "The Permitted Investments basket is hereby increased.",
    reviewRequired: true,
    candidateTexts: [],
  };
  const operativeState: OperativeContractState = {
    instrumentKey: "instrument-1",
    asOfDate: "2026-01-01",
    provisions: [ambiguousDefinitionProvision],
    status: "OPERATIVE_STATE_PARTIAL",
    summary: "test",
    unattachedEffects: [],
  };
  return { structuralIndex: index, operativeState, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() };
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

/** Records every real tool_result content actually sent back to the model, plus every outbound message array - so the test can inspect the EXACT bytes the real ToolRunner produced for a real getDefinition call, not a re-derivation of it. */
function scriptedClient(script: Anthropic.Message[]): MinimalAnthropicClient & { sentMessages: Anthropic.MessageParam[][] } {
  let i = 0;
  const sentMessages: Anthropic.MessageParam[][] = [];
  return {
    sentMessages,
    messages: {
      stream: (params: { messages: Anthropic.MessageParam[] }) => {
        sentMessages.push(params.messages);
        return { finalMessage: async () => { const msg = script[Math.min(i, script.length - 1)]!; i++; return msg; } };
      },
    },
  } as MinimalAnthropicClient & { sentMessages: Anthropic.MessageParam[][] };
}

function toolResultTexts(messages: Anthropic.MessageParam[][]): string {
  return JSON.stringify(messages);
}

describe("FINDING-2/3 end-to-end: getDefinition's operative-safety disclosure has a real downstream effect on the live tool-use compilation loop", () => {
  it("test 1 (honored disclosure): the real ToolRunner's getDefinition tool_result reaching the model discloses the real AMBIGUOUS/PARTIAL status and withholds the stale $8,000,000 figure - and when the (scripted) model honestly reflects that uncertainty in its submission, the honest sufficiency survives normalize.ts's deterministic post-processing unchanged (never silently upgraded back to COMPLETE)", async () => {
    const access = buildAccessWithAmbiguousDefinition();
    const input: SemanticCompilerInput = testCompilerInput({ toolAccess: access, sourceSectionRef: "9.01" });

    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "getDefinition", { term: "Permitted Investments" })]),
      fakeMessage([
        toolUseBlock("t2", "submit_compilation", {
          rules: [],
          definitions: [
            {
              localRef: "d1",
              termName: "Permitted Investments",
              sufficiency: "AMBIGUOUS",
              sufficiencyReasons: ["getDefinition disclosed status OPERATIVE_STATE_PARTIAL / targetResolutionStatus AMBIGUOUS for this exact term - the base document's own $8,000,000 figure cannot be trusted as current without human review."],
            },
          ],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(input, { caller, cache: new InMemorySemanticCompilationCache() });

    // (a) REAL, LIVE WIRING: the actual tool_result bytes the model received
    // mid-loop (not a direct, isolated tools.ts call) never contain the
    // stale figure, and DO contain the real disclosure - this is the
    // concrete, non-cosmetic downstream artifact of the fix.
    const wireLog = toolResultTexts(client.sentMessages);
    expect(wireLog).not.toContain("$8,000,000");
    expect(wireLog).toMatch(/OPERATIVE_STATE_PARTIAL|AMBIGUOUS/);

    // (b) The honest AMBIGUOUS sufficiency the (well-behaved) model reported
    // survives all the way through real normalizeSubmission()/IR validation
    // to the final compiled result - never silently overwritten to COMPLETE
    // by any deterministic post-processing (there is none at the definition
    // level - see this file's own header comment).
    expect(result.status).not.toBe("FAILED");
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0]!.sufficiency).toBe("AMBIGUOUS");
  });

  it("test 2 (contrast/architectural proof): a model that IGNORES getDefinition's disclosure and dishonestly submits sufficiency COMPLETE for the SAME ambiguous term is NOT caught by any other deterministic downstream mechanism - proving getDefinition's own disclosure (fixed above) is the ONLY real control point, not a decorative label change", async () => {
    const access = buildAccessWithAmbiguousDefinition();
    const input: SemanticCompilerInput = testCompilerInput({ toolAccess: access, sourceSectionRef: "9.01" });

    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "getDefinition", { term: "Permitted Investments" })]),
      fakeMessage([
        toolUseBlock("t2", "submit_compilation", {
          rules: [],
          definitions: [{ localRef: "d1", termName: "Permitted Investments", sufficiency: "COMPLETE", sufficiencyReasons: ["(adversarial: model ignored the disclosed ambiguity)"] }],
        }),
      ]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await compileCovenantToIR(input, { caller, cache: new InMemorySemanticCompilationCache() });

    // The dishonest COMPLETE is NOT deterministically downgraded - confirmed
    // both through the real pipeline result and directly against
    // enforceSufficiencyConsistency (normalize.ts always passes
    // operativeLineage: null for definitions - an architectural fact, not
    // this fix's own defect, but the reason THIS fix is load-bearing).
    expect(result.definitions[0]!.sufficiency).toBe("COMPLETE");
    const directCheck = enforceSufficiencyConsistency("COMPLETE", [], null, null);
    expect(directCheck.sufficiency).toBe("COMPLETE");
  });
});
