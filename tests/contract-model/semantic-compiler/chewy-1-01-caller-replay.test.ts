/**
 * Phase 3 Chewy remediation F-1 - deterministic replay of the recorded Section 1.01 caller state through the
 * corrected transition. Uses the committed paid-run record (tests/fixtures/unseen-packages/phase-3-validation-
 * chwy-paid-run/unit-1.01.json): the real 353,523-char operative unit, the frozen Pass A inventory (109 items),
 * the recorded submit tool_use id and the recorded telemetry shape. The frozen caller discarded the 60,318-token
 * submission body before returning (finish(null, null, ...) on PROVIDER_FAILURE), so its IR content is not
 * recoverable; the replay reconstructs the STATE that the record proves (submit tool_use -> nudge-triggering
 * sufficiency -> zero tool calls) and drives the caller transition. No provider call.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../../../lib/contract-model/compiler/semantic/caller";
import { validateToolUseProtocol, ToolProtocolViolationError } from "../../../lib/contract-model/compiler/semantic/tool-protocol";
import { compileCovenantToIR } from "../../../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../../../lib/contract-model/compiler/semantic/cache";
import { testCompilerInput } from "./test-helpers";

const RECORD = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-1.01.json";
const describeIf = existsSync(RECORD) ? describe : describe.skip;

describeIf("F-1 Chewy Section 1.01 caller replay (recorded state, corrected transition, no provider call)", () => {
  const record = JSON.parse(readFileSync(RECORD, "utf-8"));
  const recordedToolUseId = (record.compile.telemetry.error as string).match(/toolu_[A-Za-z0-9]+/)![0];
  const operativeText: string = record.compile.sourceContext.regions[0].text;
  const recordedUsage = { input_tokens: record.compile.telemetry.inputTokens as number, output_tokens: record.compile.telemetry.outputTokens as number };
  // A provisional definitions submission of the kind the recorded state proves (nudge-triggering sufficiency, zero tool calls).
  const provisional = { definitions: [{ localRef: "d1", termName: "Available Amount", sufficiency: "MISSING_CONTEXT", sufficiencyReasons: ["has the meaning assigned in Section 6.08(a)(3) - not in the supplied definitions text"] }, { localRef: "d2", termName: "Threshold Amount", covenantFamily: "DEFINITIONS_CALCULATION_RULES", sufficiency: "COMPLETE", calculationExpression: { kind: "MAX", operands: [{ kind: "MONEY", amount: 324000000 }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.45 }, { kind: "DEFINED_TERM_REFERENCE", termName: "Consolidated EBITDA" }] }] } }] };
  const msg = (content: Anthropic.ContentBlock[]): Anthropic.Message => ({ id: "gen_01M1M6DRDCYQ8HTEEB26Q3SAY5", container: null, content, model: record.compile.model, role: "assistant", stop_reason: "tool_use", stop_sequence: null, type: "message", usage: recordedUsage as Anthropic.Usage } as Anthropic.Message);
  const submit = (id: string) => ({ type: "tool_use", id, name: "submit_compilation", input: provisional }) as Anthropic.ToolUseBlock;
  function client(script: Anthropic.Message[], failTurn?: number): MinimalAnthropicClient & { sent: Anthropic.MessageParam[][] } {
    let i = 0; const sent: Anthropic.MessageParam[][] = [];
    return { sent, messages: { stream: (params) => ({ finalMessage: async () => { sent.push(params.messages.map((m) => ({ ...m }))); const v = validateToolUseProtocol(params.messages); if (v.length > 0) throw new ToolProtocolViolationError(v); i++; if (failTurn === i) throw new Error("Upstream stream ended before terminal chunk (gateway_stream_terminated)"); return script[Math.min(i - 1, script.length - 1)]!; } }) } };
  }
  const input = () => testCompilerInput({ candidateRef: record.candidateRef, sourceSectionRef: "1.01", operativeSourceText: operativeText, operativeCharStart: record.unit.charStart });

  it("recorded state confirms the F-1 preconditions: PROVIDER_FAILURE, zero tool calls, orphaned submit id at messages.2, submission body discarded", () => {
    expect(record.compile.status).toBe("FAILED");
    expect(record.compile.failureReasons).toEqual(["PROVIDER_FAILURE"]);
    expect(record.compile.toolCallLog).toEqual([]);
    expect(record.compile.rawModelOutput).toBeNull();
    expect(record.compile.telemetry.error).toMatch(/messages\.2: `tool_use` ids were found without `tool_result`/);
    expect(recordedToolUseId).toBe("toolu_01XVmzaisBtgfjUX3Q2qNCs4");
    expect(operativeText.length).toBe(353523);
  });

  it("replay: the same state drives a protocol-valid sequence, no PROVIDER_FAILURE is manufactured, the submission is not discarded, and sufficiency is exactly what was submitted", async () => {
    const c = client([msg([submit(recordedToolUseId)]), msg([submit("toolu_resubmit")])]);
    const result = await new RealSemanticCaller("vercel-ai-gateway", record.compile.model, c).compile(input());
    expect(result.failureReason).toBeNull();
    expect(c.sent).toHaveLength(2);
    for (const turn of c.sent) expect(validateToolUseProtocol(turn)).toEqual([]);
    const reply = c.sent[1]![2]!.content as Anthropic.ToolResultBlockParam[];
    expect(reply.map((b) => b.tool_use_id)).toEqual([recordedToolUseId]);
    expect(result.submission?.definitions.map((d) => [d.termName, d.sufficiency])).toEqual([["Available Amount", "MISSING_CONTEXT"], ["Threshold Amount", "COMPLETE"]]);
    expect(result.telemetry?.inputTokens).toBe(recordedUsage.input_tokens * 2);
  });

  it("replay through compile.ts (accountability off - Pass A needs a model): status is REVIEW_REQUIRED for MISSING_CONTEXT, never FAILED and never COMPLETED, definitions preserved", async () => {
    const c = client([msg([submit(recordedToolUseId)]), msg([submit("toolu_resubmit")])]);
    const compiled = await compileCovenantToIR(input(), { caller: new RealSemanticCaller("vercel-ai-gateway", record.compile.model, c), cache: new InMemorySemanticCompilationCache(), accountability: false });
    expect(compiled.status).toBe("REVIEW_REQUIRED");
    expect(compiled.failureReasons).not.toContain("PROVIDER_FAILURE");
    expect(compiled.failureReasons).toContain("MISSING_CONTEXT");
    expect(compiled.definitions).toHaveLength(2);
  });

  it("replay with the gateway failing the continuation turn (the run's real infrastructure failure mode): the provisional 1.01 submission is retained under PROVIDER_FAILURE instead of being lost", async () => {
    const c = client([msg([submit(recordedToolUseId)])], 2);
    const compiled = await compileCovenantToIR(input(), { caller: new RealSemanticCaller("vercel-ai-gateway", record.compile.model, c), cache: new InMemorySemanticCompilationCache(), accountability: false });
    expect(compiled.status).toBe("REVIEW_REQUIRED");
    expect(compiled.failureReasons).toContain("PROVIDER_FAILURE");
    expect(compiled.definitions).toHaveLength(2);
    expect(compiled.unresolvedIssues.join(" ")).toMatch(/RETAINED/);
  });
});
