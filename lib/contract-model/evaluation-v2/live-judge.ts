/**
 * Evaluation Methodology V2 — real, network-calling Layer 2 semantic judge,
 * transported over Vercel AI Gateway (mirrors lib/extraction/vercel-ai-gateway-provider.ts's
 * transport pattern exactly: an `Anthropic` SDK client pointed at
 * https://ai-gateway.vercel.sh with AI_GATEWAY_API_KEY, `client.messages.parse()`
 * with `output_config.format: zodOutputFormat(schema)` for structured output).
 *
 * Phase 3F.1.5.1 (live rerun). This is the first real implementation of the
 * `respond()` callback `createBoundedJudge` (./adjudication.ts) has always
 * accepted but which no runner in this codebase has ever supplied with a
 * live model before now — every prior run used DETERMINISTIC_ONLY_JUDGE
 * because no authorized credential was available in the sandbox that built
 * this evaluator.
 *
 * The prompt is UNCHANGED from ./adjudication.ts's SEMANTIC_CORRESPONDENCE_SYSTEM_PROMPT
 * and buildJudgeUserPrompt — this file supplies transport and parsing only,
 * never a different prompt or a different judge contract, exactly the same
 * "transport swap only" discipline lib/extraction/vercel-ai-gateway-provider.ts
 * already established for extraction.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { SEMANTIC_CORRESPONDENCE_SYSTEM_PROMPT, buildJudgeUserPrompt, createBoundedJudge, type BoundedJudge, type JudgeCache, type JudgeRequest } from "./adjudication";
import type { SemanticJudgeOutput } from "./types";

export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";

const JudgeResponseSchema = z.object({
  corresponds: z.enum(["YES", "PARTIAL", "NO", "AMBIGUOUS"]),
  supportingEvidence: z.array(z.string()),
  conflictingEvidence: z.array(z.string()),
  missingDimensions: z.array(z.string()),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  rationale: z.string(),
});

export interface LiveCallLogEntry {
  gtUnitId: string;
  candidateId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  stopReason: string | null;
}

export interface LiveJudgeHandle {
  judge: BoundedJudge;
  callLog: LiveCallLogEntry[];
  totalInputTokens: () => number;
  totalOutputTokens: () => number;
}

/**
 * `estimatedCostPerCallUsd` is a planning-time estimate only (used by
 * createBoundedJudge's totalCostUsd() for a quick running total); the
 * authoritative cost figure for reporting is derived from real per-call
 * token counts in `callLog` against the model's published per-token price,
 * computed by the caller once the run finishes.
 */
export function createVercelGatewaySemanticJudge(options: {
  apiKey: string;
  model: string;
  maxCalls: number;
  estimatedCostPerCallUsd: number;
  cache?: JudgeCache;
}): LiveJudgeHandle {
  const client = new Anthropic({ apiKey: options.apiKey, baseURL: AI_GATEWAY_BASE_URL });
  const callLog: LiveCallLogEntry[] = [];

  const judge = createBoundedJudge({
    provider: "VERCEL_AI_GATEWAY",
    model: options.model,
    estimatedCostPerCallUsd: options.estimatedCostPerCallUsd,
    maxCalls: options.maxCalls,
    cache: options.cache,
    async respond(request: JudgeRequest, prompts: { system: string; user: string }) {
      const startedAt = Date.now();
      let message;
      try {
        message = await client.messages.parse({
          model: options.model,
          max_tokens: 1024,
          system: prompts.system,
          messages: [{ role: "user", content: prompts.user }],
          output_config: { format: zodOutputFormat(JudgeResponseSchema) },
        });
      } catch (firstErr) {
        // One retry after a short backoff for a transient network/rate-limit
        // hiccup over what may be a long sequential run; a second failure on
        // the same pair is reported, not silently swallowed.
        await new Promise((r) => setTimeout(r, 2000));
        try {
          message = await client.messages.parse({
            model: options.model,
            max_tokens: 1024,
            system: prompts.system,
            messages: [{ role: "user", content: prompts.user }],
            output_config: { format: zodOutputFormat(JudgeResponseSchema) },
          });
        } catch (secondErr) {
          callLog.push({ gtUnitId: request.gt.gtUnitId, candidateId: request.candidate.candidateId, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startedAt, stopReason: `ERROR: ${String(secondErr)}` });
          throw secondErr instanceof Error ? secondErr : new Error(String(secondErr));
        }
      }
      const latencyMs = Date.now() - startedAt;

      callLog.push({
        gtUnitId: request.gt.gtUnitId,
        candidateId: request.candidate.candidateId,
        inputTokens: message.usage?.input_tokens ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
        latencyMs,
        stopReason: message.stop_reason ?? null,
      });

      if (!message.parsed_output) {
        throw new Error(`live semantic judge: model response did not parse against the expected schema (stop_reason=${message.stop_reason})`);
      }
      const parsed = message.parsed_output;
      const out: Omit<SemanticJudgeOutput, "rawModelOutput" | "provider" | "model" | "promptVersion" | "cacheKey" | "cached"> = {
        corresponds: parsed.corresponds,
        supportingEvidence: parsed.supportingEvidence,
        conflictingEvidence: parsed.conflictingEvidence,
        missingDimensions: parsed.missingDimensions,
        confidence: parsed.confidence,
        rationale: parsed.rationale,
      };
      return { raw: JSON.stringify(parsed), parsed: out };
    },
  });

  return {
    judge,
    callLog,
    totalInputTokens: () => callLog.reduce((s, c) => s + c.inputTokens, 0),
    totalOutputTokens: () => callLog.reduce((s, c) => s + c.outputTokens, 0),
  };
}

export { SEMANTIC_CORRESPONDENCE_SYSTEM_PROMPT, buildJudgeUserPrompt };
