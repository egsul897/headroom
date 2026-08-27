/**
 * Phase 3B synthetic test matrix, part 3 (task §37 items 17/18/20/21/22 as
 * they concern the TOOL-USE LOOP's own orchestration, distinct from
 * normalize.ts's own deterministic behavior already covered elsewhere).
 * Exercises RealSemanticCaller against a scripted FAKE Anthropic client
 * (MinimalAnthropicClient) - no network call, no real credential, full
 * control over what the "model" does turn by turn.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { DEFAULT_TOOL_BUDGET } from "../../../lib/contract-model/compiler/semantic/types";
import { testCompilerInput } from "./test-helpers";

function fakeMessage(content: Anthropic.ContentBlock[], usage: Partial<Anthropic.Usage> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    container: null,
    content,
    model: "claude-sonnet-5",
    role: "assistant",
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, ...usage } as Anthropic.Usage,
  } as Anthropic.Message;
}

function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}
function textBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text, citations: [] } as Anthropic.TextBlock;
}

/** A scripted client that returns each entry of `script` in order, one per `.stream().finalMessage()` call. */
function scriptedClient(script: Anthropic.Message[]): MinimalAnthropicClient {
  let i = 0;
  return {
    messages: {
      stream: () => ({
        finalMessage: async () => {
          const msg = script[Math.min(i, script.length - 1)]!;
          i++;
          return msg;
        },
      }),
    },
  };
}

describe("Phase 3B synthetic tests - tool-use loop orchestration", () => {
  it("happy path: model calls submit_compilation directly on the first turn", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [{ localRef: "r1", sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", capacityExpression: { kind: "MONEY", amount: 1 } }] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(result.submission?.rules).toHaveLength(1);
    expect(result.telemetry?.inputTokens).toBe(100);
  });

  it("18 (tool-use loop): model requests one evidence tool, then submits on the second turn", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "getInstrumentDocuments", {})]), fakeMessage([toolUseBlock("t2", "submit_compilation", { rules: [] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(result.toolCallLog).toHaveLength(1);
    expect(result.toolCallLog[0]?.toolName).toBe("getInstrumentDocuments");
  });

  it("20 (fabricated tool request rejected honestly): an unknown tool name is refused, and the loop continues rather than crashing", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "runArbitraryShellCommand", { cmd: "rm -rf /" })]), fakeMessage([toolUseBlock("t2", "submit_compilation", { rules: [] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBeNull();
    expect(result.toolCallLog[0]?.outputSummary).toMatch(/refused/);
  });

  it("model schema failure: submit_compilation input fails schema validation", async () => {
    const client = scriptedClient([fakeMessage([toolUseBlock("t1", "submit_compilation", { rules: [{ localRef: "r1", sourceSectionRef: "9.01", capacityExpression: { kind: "MONEY", amount: "not-a-number" } }] })])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBe("MODEL_SCHEMA_FAILURE");
  });

  it("corrective nudge: a plain-text turn gets exactly one reminder before failing honestly", async () => {
    const client = scriptedClient([fakeMessage([textBlock("I think the answer is complicated.")]), fakeMessage([textBlock("Still thinking...")])]);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const result = await caller.compile(testCompilerInput());
    expect(result.failureReason).toBe("MODEL_SCHEMA_FAILURE");
    expect(result.failureDetail).toMatch(/corrective reminder/);
  });

  it("19 (tool budget exhaustion -> TOOL_BUDGET_EXHAUSTED, never an infinite loop): a model that keeps requesting tools past its budget fails honestly rather than looping forever", async () => {
    const infiniteToolRequests = Array.from({ length: 20 }, (_, i) => fakeMessage([toolUseBlock(`t${i}`, "getInstrumentDocuments", {})]));
    const client = scriptedClient(infiniteToolRequests);
    const caller = new RealSemanticCaller("test", "test-model", client);
    const smallBudget = { ...DEFAULT_TOOL_BUDGET, maxToolCalls: 3 };
    const result = await caller.compile(testCompilerInput({ toolBudget: smallBudget }));
    expect(result.failureReason).toBe("TOOL_BUDGET_EXHAUSTED");
    // the loop terminated (did not hang) and logged every attempted call, including the ones refused after budget exhaustion
    expect(result.toolCallLog.length).toBeGreaterThan(0);
  });
});
