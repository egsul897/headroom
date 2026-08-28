/**
 * Phase 3B.1 synthetic test matrix, remediation class B (task §29-31,
 * tool discipline). Exercises RealSemanticCaller's mechanical retrieval-
 * before-give-up nudge and the prompt's own explicit RETRIEVAL BEFORE
 * GIVING UP guidance - both generic and never keyed to any specific
 * package, section number, or defined-term name (task §16/§40's own "no
 * package-specific production logic" constraint).
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { buildSystemPrompt } from "../../../lib/contract-model/compiler/semantic/prompt";
import { DEFAULT_TOOL_BUDGET } from "../../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput } from "./test-helpers";

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

/** Records every `stream()` invocation's `messages` array so a test can assert on what the caller sent back after a nudge, in addition to scripting responses. */
function scriptedClient(script: Anthropic.Message[]): MinimalAnthropicClient & { sentMessages: Anthropic.MessageParam[][] } {
  let i = 0;
  const sentMessages: Anthropic.MessageParam[][] = [];
  return {
    sentMessages,
    messages: {
      stream: (params: { messages: Anthropic.MessageParam[] }) => {
        sentMessages.push(params.messages);
        return {
          finalMessage: async () => {
            const msg = script[Math.min(i, script.length - 1)]!;
            i++;
            return msg;
          },
        };
      },
    },
  } as MinimalAnthropicClient & { sentMessages: Anthropic.MessageParam[][] };
}

const unresolvedRule = (sufficiency: string) => ({ localRef: "r1", sourceSectionRef: "9.01", sufficiency, capacityExpression: { kind: "UNSUPPORTED", semanticDescription: "x", reason: "y", sourceEvidence: "9.01" } });
const unresolvedDefinition = (sufficiency: string) => ({ localRef: "d1", termName: "Some Term", sufficiency });
const resolvedRule = () => ({ localRef: "r1", sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", capacityExpression: { kind: "MONEY", amount: 1 } });

describe("Phase 3B.1 synthetic tests - tool discipline (remediation class B)", () => {
  it("the system prompt contains explicit, generic retrieval-before-give-up guidance naming the relevant tool categories - never a specific package/section/term", () => {
    const prompt = buildSystemPrompt({ irSchemaVersion: "test-v1", toolPolicyVersion: "test-tool-policy-v1" });
    expect(prompt).toMatch(/RETRIEVAL BEFORE GIVING UP/i);
    expect(prompt).toMatch(/getReferencedProvision/);
    expect(prompt).toMatch(/getDefinition/);
    expect(prompt.toLowerCase()).not.toMatch(/6\.13|6\.11|6\.03|payment conditions|lsb|fwrg/);
  });

  it("a submission with an UNSUPPORTED rule and ZERO tool calls, with budget remaining, triggers exactly one corrective nudge before being accepted", async () => {
    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })]),
      fakeMessage([toolUseBlock("t2", "submit_compilation", { rules: [resolvedRule()] })]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(result.submission?.rules[0]?.capacityExpression?.kind).toBe("MONEY");
    // exactly 2 model turns were used (the nudge, then the accepted resubmission)
    expect(client.sentMessages).toHaveLength(2);
    const nudgeText = JSON.stringify(client.sentMessages[1]);
    expect(nudgeText).toMatch(/RETRIEVAL BEFORE GIVING UP/);
  });

  it("a submission with a MISSING_CONTEXT definition and ZERO tool calls triggers the same nudge", async () => {
    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "submit_compilation", { definitions: [unresolvedDefinition("MISSING_CONTEXT")] })]),
      fakeMessage([toolUseBlock("t2", "submit_compilation", { rules: [resolvedRule()] })]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(client.sentMessages).toHaveLength(2);
  });

  it("the nudge fires only ONCE - a second still-unresolved resubmission after the nudge is accepted, not looped forever", async () => {
    const client = scriptedClient([
      fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })]),
      fakeMessage([toolUseBlock("t2", "submit_compilation", { rules: [unresolvedRule("MISSING_CONTEXT")] })]),
    ]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(result.submission?.rules[0]?.sufficiency).toBe("MISSING_CONTEXT");
    expect(client.sentMessages).toHaveLength(2); // nudge given once, second (still-unresolved) submission accepted honestly
  });

  it("the nudge does NOT fire when the model already made at least one tool call, even if the final submission still has an unresolved item (partial tool use is governed by the prompt, not a mechanical block)", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "getInstrumentDocuments", {})]), fakeMessage([toolUseBlock("t2", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(result.submission?.rules[0]?.sufficiency).toBe("UNSUPPORTED");
    expect(client.sentMessages).toHaveLength(2); // one tool-result turn + the accepted submission - no extra nudge turn
  });

  it("the nudge does NOT fire when tool budget is already exhausted (zero remainingCalls), even with zero tool calls made and an unresolved sufficiency", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const zeroBudget = { ...DEFAULT_TOOL_BUDGET, maxToolCalls: 0 };
    const result = await caller.compile(testCompilerInput({ toolBudget: zeroBudget }));
    expect(result.failureReason).toBeNull();
    expect(result.submission?.rules[0]?.sufficiency).toBe("UNSUPPORTED");
    expect(client.sentMessages).toHaveLength(1); // accepted immediately, no nudge turn possible with zero budget
  });

  it("a fully COMPLETE submission with zero tool calls is accepted immediately - the nudge only concerns UNSUPPORTED/MISSING_CONTEXT sufficiency, never healthy zero-tool-use compilations", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [resolvedRule()] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(client.sentMessages).toHaveLength(1);
  });

  it("the nudge turn itself counts toward the overall turn ceiling, so a model that keeps giving up after the nudge (never uses a tool, never resubmits cleanly) still terminates rather than looping forever", async () => {
    const alwaysUnresolved = Array.from({ length: 20 }, () => fakeMessage([toolUseBlock("t", "submit_compilation", { rules: [unresolvedRule("UNSUPPORTED")] })]));
    const client = scriptedClient(alwaysUnresolved);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    // after the one-time nudge is consumed, the second (still zero-tool-call) submission is accepted honestly rather than nudging forever
    expect(result.failureReason).toBeNull();
    expect(client.sentMessages.length).toBeLessThan(20);
  });
});
