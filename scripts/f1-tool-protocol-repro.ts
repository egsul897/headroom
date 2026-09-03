/**
 * F-1 deterministic reproduction (zero paid calls). Drives RealSemanticCaller with a scripted client that
 * enforces the provider tool-use protocol exactly as the API does (validateToolUseProtocol) and replays the
 * state that produced the Chewy Section 1.01 failure: a first-turn submit_compilation whose sufficiency triggers
 * the retrieval nudge, with zero ordinary tool calls. Prints the outgoing message sequence and the caller result.
 * Run: npx tsx scripts/f1-tool-protocol-repro.ts
 */
import type Anthropic from "@anthropic-ai/sdk";
import { RealSemanticCaller, type MinimalAnthropicClient } from "../lib/contract-model/compiler/semantic/caller";
import { validateToolUseProtocol, ToolProtocolViolationError } from "../lib/contract-model/compiler/semantic/tool-protocol";
import { testCompilerInput } from "../tests/contract-model/semantic-compiler/test-helpers";

const CHEWY_TOOL_USE_ID = "toolu_01XVmzaisBtgfjUX3Q2qNCs4"; // recorded in unit-1.01.json telemetry.error
function msg(content: Anthropic.ContentBlock[]): Anthropic.Message {
  return { id: "msg", container: null, content, model: "m", role: "assistant", stop_reason: "tool_use", stop_sequence: null, type: "message", usage: { input_tokens: 312143, output_tokens: 60318 } as Anthropic.Usage } as Anthropic.Message;
}
const submit = (id: string, sufficiency: string) => ({ type: "tool_use", id, name: "submit_compilation", input: { definitions: [{ localRef: "d1", termName: "Available Amount", sufficiency, sufficiencyReasons: ["defined by cross-reference to Section 6.08(a)(3), not in the supplied text"] }] } }) as Anthropic.ToolUseBlock;

function protocolEnforcingClient(script: Anthropic.Message[]) {
  let i = 0; const sent: Anthropic.MessageParam[][] = [];
  const client: MinimalAnthropicClient & { sent: Anthropic.MessageParam[][] } = {
    sent,
    messages: { stream: (params) => ({ finalMessage: async () => {
      sent.push(JSON.parse(JSON.stringify(params.messages)));
      const v = validateToolUseProtocol(params.messages);
      if (v.length > 0) throw new ToolProtocolViolationError(v);
      return script[Math.min(i++, script.length - 1)]!;
    } }) },
  };
  return client;
}

async function main() {
  const client = protocolEnforcingClient([msg([submit(CHEWY_TOOL_USE_ID, "MISSING_CONTEXT")]), msg([submit("toolu_resubmit", "MISSING_CONTEXT")])]);
  const caller = new RealSemanticCaller("repro", "repro-model", client);
  const result = await caller.compile(testCompilerInput());
  const seq = client.sent.map((m, turn) => ({ turn: turn + 1, messages: m.map((x) => ({ role: x.role, content: typeof x.content === "string" ? "<text>" : (x.content as { type: string; name?: string; id?: string; tool_use_id?: string }[]).map((b) => b.type === "tool_use" ? `tool_use(${b.name}:${b.id})` : b.type === "tool_result" ? `tool_result(${b.tool_use_id})` : b.type) })) }));
  const violations = client.sent.map((m) => validateToolUseProtocol(m));
  console.log(JSON.stringify({ turnsSent: client.sent.length, sequence: seq, violationsPerTurn: violations, result: { failureReason: result.failureReason, failureDetail: result.failureDetail?.slice(0, 160) ?? null, submissionPresent: result.submission !== null, submissionDefinitions: result.submission?.definitions.map((d) => ({ term: d.termName, sufficiency: d.sufficiency })) ?? null, rawSubmissionPresent: result.rawSubmission !== null, toolCalls: result.toolCallLog.length } }, null, 2));
}
main();
