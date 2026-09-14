/**
 * Phase 3 Chewy remediation F-1 - the provider tool-use protocol invariant,
 * stated once, generically, and checkable offline:
 *
 *   EVERY ASSISTANT tool_use THAT IS FOLLOWED BY ANOTHER CONVERSATION TURN
 *   MUST RECEIVE A CORRESPONDING tool_result IN THE IMMEDIATELY FOLLOWING
 *   USER CONTENT, BEFORE ANY ORDINARY USER TEXT OR SUBSEQUENT ASSISTANT TURN.
 *
 * This is the rule the Anthropic Messages API enforces server-side ("tool_use
 * ids were found without tool_result blocks immediately after"). The frozen
 * Chewy validation showed the semantic compiler caller violating it in its
 * retrieval-nudge branch (see caller.ts). The validator below is pure and
 * deterministic: it walks an outgoing `messages` array and reports every
 * violation, so tests (and any offline replay) can prove a message sequence
 * is protocol-valid without a provider call. It is intentionally NOT tied
 * to any tool name: submit_compilation is just another tool_use to the
 * protocol.
 */
import type Anthropic from "@anthropic-ai/sdk";

export interface ToolProtocolViolation {
  /** Index of the assistant message carrying the orphaned tool_use. */
  assistantMessageIndex: number;
  toolUseId: string;
  toolName: string;
  reason: "NO_FOLLOWING_USER_MESSAGE_BUT_CONVERSATION_CONTINUED" | "FOLLOWING_USER_CONTENT_IS_PLAIN_TEXT" | "TOOL_RESULT_MISSING_FOR_ID" | "NON_TOOL_RESULT_BLOCK_BEFORE_TOOL_RESULTS";
}

function toolUseBlocksOf(message: Anthropic.MessageParam): { id: string; name: string }[] {
  if (typeof message.content === "string") return [];
  return message.content.filter((b): b is Anthropic.ToolUseBlockParam => (b as { type?: string }).type === "tool_use").map((b) => ({ id: b.id, name: b.name }));
}

/**
 * Validates the outgoing message array as the provider would. `messages` is
 * the exact array about to be (or that was) sent; the trailing assistant
 * turn is allowed to end the conversation (a terminal tool_use, e.g. an
 * accepted submit_compilation, is never followed by anything), so only a
 * tool_use that IS followed by another message is checked.
 */
export function validateToolUseProtocol(messages: readonly Anthropic.MessageParam[]): ToolProtocolViolation[] {
  const violations: ToolProtocolViolation[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const uses = toolUseBlocksOf(m);
    if (uses.length === 0) continue;
    const next = messages[i + 1];
    if (!next) continue; // conversation ended on this assistant turn - nothing to satisfy
    if (next.role !== "user" || typeof next.content === "string") {
      for (const u of uses) violations.push({ assistantMessageIndex: i, toolUseId: u.id, toolName: u.name, reason: next.role !== "user" ? "NO_FOLLOWING_USER_MESSAGE_BUT_CONVERSATION_CONTINUED" : "FOLLOWING_USER_CONTENT_IS_PLAIN_TEXT" });
      continue;
    }
    const blocks = next.content as { type: string; tool_use_id?: string }[];
    const resultIds = new Set(blocks.filter((b) => b.type === "tool_result").map((b) => b.tool_use_id));
    const firstNonResult = blocks.findIndex((b) => b.type !== "tool_result");
    const lastResult = blocks.map((b) => b.type).lastIndexOf("tool_result");
    for (const u of uses) {
      if (!resultIds.has(u.id)) violations.push({ assistantMessageIndex: i, toolUseId: u.id, toolName: u.name, reason: resultIds.size === 0 ? "FOLLOWING_USER_CONTENT_IS_PLAIN_TEXT" : "TOOL_RESULT_MISSING_FOR_ID" });
      else if (firstNonResult !== -1 && firstNonResult < lastResult) violations.push({ assistantMessageIndex: i, toolUseId: u.id, toolName: u.name, reason: "NON_TOOL_RESULT_BLOCK_BEFORE_TOOL_RESULTS" });
    }
  }
  return violations;
}

/** Throws the same class of error the provider returns, for scripted clients that must behave like the real API. */
export class ToolProtocolViolationError extends Error {
  constructor(public readonly violations: ToolProtocolViolation[]) {
    super(`400 messages: \`tool_use\` ids were found without \`tool_result\` blocks immediately after: ${violations.map((v) => v.toolUseId).join(", ")}. Each \`tool_use\` block must have a corresponding \`tool_result\` block in the next message.`);
    this.name = "ToolProtocolViolationError";
  }
}
