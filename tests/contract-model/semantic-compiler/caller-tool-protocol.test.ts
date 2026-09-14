/**
 * Phase 3 Chewy remediation F-1 - provider tool-use protocol invariant for the semantic compiler caller.
 * Every scripted client here ENFORCES the protocol exactly as the Anthropic Messages API does (a tool_use
 * that is followed by another turn must receive its tool_result first), so a protocol violation surfaces as
 * the same 400-class error the frozen Chewy run hit. Zero network, zero paid calls.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { validateToolUseProtocol, ToolProtocolViolationError } from "../../../lib/contract-model/compiler/semantic/tool-protocol";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import { DEFAULT_TOOL_BUDGET } from "../../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput } from "./test-helpers";

function fakeMessage(content: Anthropic.ContentBlock[]): Anthropic.Message {
  return { id: "msg_test", container: null, content, model: "claude-sonnet-5", role: "assistant", stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", stop_sequence: null, type: "message", usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null } as Anthropic.Usage } as Anthropic.Message;
}
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as Anthropic.ToolUseBlock;
const text = (t: string) => ({ type: "text", text: t, citations: [] }) as Anthropic.TextBlock;
const unresolvedRule = (sufficiency: string) => ({ localRef: "r1", sourceSectionRef: "9.01", sufficiency, capacityExpression: { kind: "UNSUPPORTED", semanticDescription: "x", reason: "y", sourceEvidence: "9.01" } });
const resolvedRule = () => ({ localRef: "r1", sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", capacityExpression: { kind: "MONEY", amount: 1 } });

type Enforcing = MinimalAnthropicClient & { sent: Anthropic.MessageParam[][]; failTurn?: number };
/** Scripted client that validates every outgoing message array like the provider and rejects violations with the provider's own error class. `failTurn` (1-based) simulates a transport failure on that turn. */
function enforcingClient(script: Anthropic.Message[], failTurn?: number): Enforcing {
  let i = 0;
  const sent: Anthropic.MessageParam[][] = [];
  return {
    sent,
    failTurn,
    messages: {
      stream: (params) => ({
        finalMessage: async () => {
          sent.push(JSON.parse(JSON.stringify(params.messages)));
          const violations = validateToolUseProtocol(params.messages);
          if (violations.length > 0) throw new ToolProtocolViolationError(violations);
          i++;
          if (failTurn === i) throw new Error("simulated transport failure: gateway_stream_terminated");
          return script[Math.min(i - 1, script.length - 1)]!;
        },
      }),
    },
  };
}
const blockTypes = (m: Anthropic.MessageParam) => (typeof m.content === "string" ? ["<text>"] : (m.content as { type: string }[]).map((b) => b.type));

describe("F-1 protocol validator (local harness rejects malformed sequences)", () => {
  it("F: a tool_use followed by a plain-text user turn is a violation; followed by its tool_result it is valid; a trailing terminal tool_use needs nothing", () => {
    const assistant: Anthropic.MessageParam = { role: "assistant", content: [toolUse("t1", "submit_compilation", {})] };
    expect(validateToolUseProtocol([{ role: "user", content: "ctx" }, assistant, { role: "user", content: "nudge as plain text" }])).toEqual([expect.objectContaining({ toolUseId: "t1", reason: "FOLLOWING_USER_CONTENT_IS_PLAIN_TEXT" })]);
    expect(validateToolUseProtocol([{ role: "user", content: "ctx" }, assistant, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] }])).toEqual([]);
    expect(validateToolUseProtocol([{ role: "user", content: "ctx" }, assistant])).toEqual([]);
  });
  it("F: a missing tool_result for one of several tool_use ids, or a text block placed before the tool_results, is a violation", () => {
    const assistant: Anthropic.MessageParam = { role: "assistant", content: [toolUse("a", "getDefinition", {}), toolUse("b", "getReferencedProvision", {})] };
    expect(validateToolUseProtocol([{ role: "user", content: "ctx" }, assistant, { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "x" }] }]).map((v) => v.toolUseId)).toEqual(["b"]);
    expect(validateToolUseProtocol([{ role: "user", content: "ctx" }, assistant, { role: "user", content: [{ type: "text", text: "hi" }, { type: "tool_result", tool_use_id: "a", content: "x" }, { type: "tool_result", tool_use_id: "b", content: "y" }] }]).map((v) => v.reason)).toEqual(["NON_TOOL_RESULT_BLOCK_BEFORE_TOOL_RESULTS", "NON_TOOL_RESULT_BLOCK_BEFORE_TOOL_RESULTS"]);
  });
});

describe("F-1 caller obeys the tool_use/tool_result protocol on every continuation", () => {
  it("A: submit_compilation with COMPLETE sufficiency is terminal - accepted on the first turn, no continuation, sequence valid", async () => {
    const client = enforcingClient([fakeMessage([toolUse("t1", "submit_compilation", { rules: [resolvedRule()] })])]);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(client.sent).toHaveLength(1);
  });

  it("B (the Chewy 1.01 shape): a provisional submission that triggers the retrieval nudge is answered with a tool_result carrying the nudge, the sequence is protocol-valid, and the resubmission is accepted", async () => {
    const client = enforcingClient([fakeMessage([toolUse("toolu_01XVmzaisBtgfjUX3Q2qNCs4", "submit_compilation", { rules: [unresolvedRule("MISSING_CONTEXT")] })]), fakeMessage([toolUse("t2", "submit_compilation", { rules: [unresolvedRule("MISSING_CONTEXT")] })])]);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(client.sent).toHaveLength(2);
    const turn2 = client.sent[1]!;
    expect(turn2.map(blockTypes)).toEqual([["<text>"], ["tool_use"], ["tool_result"]]);
    const reply = turn2[2]!.content as Anthropic.ToolResultBlockParam[];
    expect(reply[0]!.tool_use_id).toBe("toolu_01XVmzaisBtgfjUX3Q2qNCs4");
    expect(String(reply[0]!.content)).toMatch(/RETRIEVAL BEFORE GIVING UP/);
    expect(validateToolUseProtocol(turn2)).toEqual([]);
    expect(result.submission?.rules[0]?.sufficiency).toBe("MISSING_CONTEXT");
  });

  it("C: a retrieval tool_use is followed by its tool_result before the next assistant turn", async () => {
    const client = enforcingClient([fakeMessage([toolUse("t1", "getInstrumentDocuments", {})]), fakeMessage([toolUse("t2", "submit_compilation", { rules: [resolvedRule()] })])]);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect((client.sent[1]![2]!.content as Anthropic.ToolResultBlockParam[]).map((b) => b.tool_use_id)).toEqual(["t1"]);
    expect(result.toolCallLog).toHaveLength(1);
  });

  it("D: multiple retrieval tool calls in one assistant turn each receive a tool_result, in order, in a single user content block", async () => {
    const client = enforcingClient([fakeMessage([toolUse("a", "getInstrumentDocuments", {}), toolUse("b", "getDefinition", { term: "Consolidated EBITDA" }), toolUse("c", "getReferencedProvision", { ref: "Section 6.01" })]), fakeMessage([toolUse("t2", "submit_compilation", { rules: [resolvedRule()] })])]);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect((client.sent[1]![2]!.content as Anthropic.ToolResultBlockParam[]).map((b) => b.tool_use_id)).toEqual(["a", "b", "c"]);
    expect(result.toolCallLog.map((e) => e.toolName)).toEqual(["getInstrumentDocuments", "getDefinition", "getReferencedProvision"]);
  });

  it("E: submit_compilation plus retrieval tool_use in the SAME assistant turn (provisional case) - every tool_use in the turn is answered: the submit with the nudge, the evidence tools with their real results", async () => {
    const client = enforcingClient([fakeMessage([toolUse("s1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] }), toolUse("e1", "getInstrumentDocuments", {})]), fakeMessage([toolUse("s2", "submit_compilation", { rules: [resolvedRule()] })])]);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    const reply = client.sent[1]![2]!.content as Anthropic.ToolResultBlockParam[];
    expect(reply.map((b) => b.tool_use_id)).toEqual(["s1", "e1"]);
    expect(String(reply[0]!.content)).toMatch(/NOT YET ACCEPTED/);
    expect(result.toolCallLog.map((e) => e.toolName)).toEqual(["getInstrumentDocuments"]);
    expect(validateToolUseProtocol(client.sent[1]!)).toEqual([]);
  });

  it("G: semantic insufficiency stays insufficiency - a nudged then re-stated UNSUPPORTED rule is returned UNSUPPORTED, never rewritten to COMPLETE, and compile.ts keeps UNSUPPORTED_SEMANTICS", async () => {
    const client = enforcingClient([fakeMessage([toolUse("t1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })]), fakeMessage([toolUse("t2", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })])]);
    const caller = new RealSemanticCaller("test", "m", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(result.submission?.rules[0]?.sufficiency).toBe("UNSUPPORTED");
    const compiled = await compileCovenantToIR(testCompilerInput(), { caller: new RealSemanticCaller("test", "m", enforcingClient([fakeMessage([toolUse("t1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })]), fakeMessage([toolUse("t2", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })])])), cache: new InMemorySemanticCompilationCache(), accountability: false });
    expect(compiled.status).not.toBe("COMPLETED");
    expect(compiled.failureReasons).toContain("UNSUPPORTED_SEMANTICS");
  });

  it("H: a genuine transport failure on the continuation turn is reported as PROVIDER_FAILURE, distinguishable from semantic insufficiency, and the held provisional submission is RETAINED with its own sufficiency (never null, never COMPLETE)", async () => {
    const client = enforcingClient([fakeMessage([toolUse("t1", "submit_compilation", { rules: [unresolvedRule("MISSING_CONTEXT")] })])], 2);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput());
    expect(result.failureReason).toBe("PROVIDER_FAILURE");
    expect(result.failureDetail).toMatch(/gateway_stream_terminated/);
    expect(result.failureDetail).toMatch(/RETAINED/);
    expect(result.submission?.rules[0]?.sufficiency).toBe("MISSING_CONTEXT");
    expect(result.rawSubmission).not.toBeNull();
    const compiled = await compileCovenantToIR(testCompilerInput(), { caller: new RealSemanticCaller("test", "m", enforcingClient([fakeMessage([toolUse("t1", "submit_compilation", { rules: [unresolvedRule("MISSING_CONTEXT")] })])], 2)), cache: new InMemorySemanticCompilationCache(), accountability: false });
    expect(compiled.status).toBe("REVIEW_REQUIRED");
    expect(compiled.failureReasons).toContain("PROVIDER_FAILURE");
    expect(compiled.failureReasons).toContain("MISSING_CONTEXT");
    expect(compiled.rules).toHaveLength(1);
  });

  it("H2: a transport failure with NO held submission is still a plain PROVIDER_FAILURE with a null submission (nothing is invented)", async () => {
    const client = enforcingClient([fakeMessage([toolUse("t1", "submit_compilation", { rules: [resolvedRule()] })])], 1);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput());
    expect(result.failureReason).toBe("PROVIDER_FAILURE");
    expect(result.submission).toBeNull();
  });

  it("same-root: after the nudge, a model that never resubmits and exhausts the turn ceiling still returns the held provisional submission under TOOL_BUDGET_EXHAUSTED", async () => {
    const script = [fakeMessage([toolUse("t1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })]), ...Array.from({ length: 30 }, (_, i) => fakeMessage([toolUse(`e${i}`, "getInstrumentDocuments", { i })]))];
    const client = enforcingClient(script);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput({ toolBudget: { ...DEFAULT_TOOL_BUDGET, maxToolCalls: 2 } }));
    expect(result.failureReason).toBe("TOOL_BUDGET_EXHAUSTED");
    expect(result.submission?.rules[0]?.sufficiency).toBe("UNSUPPORTED");
    for (const turn of client.sent) expect(validateToolUseProtocol(turn)).toEqual([]);
  });

  it("same-root: after the nudge, a model that answers with plain text twice returns the held provisional submission under MODEL_SCHEMA_FAILURE rather than discarding it", async () => {
    const client = enforcingClient([fakeMessage([toolUse("t1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })]), fakeMessage([text("thinking")]), fakeMessage([text("still thinking")])]);
    const result = await new RealSemanticCaller("test", "m", client).compile(testCompilerInput());
    expect(result.failureReason).toBe("MODEL_SCHEMA_FAILURE");
    expect(result.submission?.rules[0]?.sufficiency).toBe("UNSUPPORTED");
    for (const turn of client.sent) expect(validateToolUseProtocol(turn)).toEqual([]);
  });

  it("existing nudge semantics preserved: nudge fires once, is skipped after any tool call or with zero budget, and COMPLETE submissions are never nudged", async () => {
    const afterTool = enforcingClient([fakeMessage([toolUse("t1", "getInstrumentDocuments", {})]), fakeMessage([toolUse("t2", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })])]);
    expect((await new RealSemanticCaller("test", "m", afterTool).compile(testCompilerInput())).failureReason).toBeNull();
    expect(afterTool.sent).toHaveLength(2);
    const zeroBudget = enforcingClient([fakeMessage([toolUse("t1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })])]);
    expect((await new RealSemanticCaller("test", "m", zeroBudget).compile(testCompilerInput({ toolBudget: { ...DEFAULT_TOOL_BUDGET, maxToolCalls: 0 } }))).failureReason).toBeNull();
    expect(zeroBudget.sent).toHaveLength(1);
  });
});
