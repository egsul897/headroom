import { priceUsage } from "./pricing";
/**
 * Phase C0 (task "PROVE THE CONTRACT ANALYZER BEFORE PHASE C" §25-28) - per
 * model-call telemetry and rate-limit resilience for the analyzer vertical
 * slice. Not persisted to a new Postgres table (that would be
 * production-schema work the task explicitly scopes out of a validation
 * spike - "DO NOT build the full Phase C compiler"); instead this module
 * returns structured telemetry alongside every `analyze()` call, and
 * `lib/contract-model/analyzer/run-and-log.ts` persists it to a plain JSON
 * file next to the fixture as this spike's real, inspectable record - the
 * production version of this (a real telemetry table, mirroring
 * ExtractionRun/ExtractionStage's existing pattern) is listed as required
 * follow-up work in the final report, not built here.
 *
 * Cost is NEVER invented (task §27 - "Never invent cost"): `calculatedCost`
 * is populated only from real, returned token counts multiplied by a cited
 * published rate card; `providerCost` is left undefined because neither the
 * Anthropic SDK's nor the Vercel AI Gateway's per-call response exposes a
 * billed-dollar figure (confirmed by inspecting the SDK's own `Usage` type,
 * `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`) - only
 * token counts, which this module reports honestly instead of a fabricated
 * dollar amount.
 */

export interface AnalyzerCallTelemetry {
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  stage: string;
  timestamp: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  attemptCount: number;
  retryCount: number;
  rateLimitFailures: number;
  latencyMs: number;
  /** Real, returned by the provider's own billing API. Not exposed per-call by the SDK today - always undefined, never fabricated. */
  providerCost: number | undefined;
  /** Pricing identity of calculatedCostUsd (pricing.ts). Absent on legacy records. */
  pricing?: { pricingVersion: string; pricingStatus: "PRICED" | "UNKNOWN_MODEL" | "CACHED_UNKNOWN" | "NO_USAGE" };
  /** Transport attempts under the single retry owner (transport-retry.ts). Absent on legacy records. */
  transport?: { attempts: number; retries: number; policyVersion: string };
  /** thresholdValue-USD = tokens x a cited published rate card. Always labeled PROJECTED wherever surfaced in the report. */
  calculatedCostUsd: number | null;
  error?: string;
  /** P3-E14 (additive): the provider's stop reason, the requested output ceiling and reasoning policy, and the reasoning/visible split when the provider reports it (Anthropic usage.output_tokens_details.thinking_tokens). */
  stopReason?: string | null;
  requestedMaxOutputTokens?: number;
  reasoningPolicy?: "DISABLED" | "MINIMAL" | "PROVIDER_DEFAULT";
  thinkingTokens?: number | null;
  visibleOutputTokens?: number | null;
  /** The usage object exactly as received (a gateway may add fields the SDK type does not declare). */
  rawUsage?: Record<string, unknown> | null;
}

/** Anthropic's own published rate cards (USD per token) - current as of this session, per Anthropic's own pricing reference. */
export const SONNET_5_RATE_CARD = { inputPerToken: 2 / 1_000_000, outputPerToken: 10 / 1_000_000 };
export const OPUS_5_RATE_CARD = { inputPerToken: 5 / 1_000_000, outputPerToken: 25 / 1_000_000 };

/** @deprecated legacy: kept for the two named Anthropic cards; every other model goes through pricing.ts. */
export function rateCardForModel(model: string): { inputPerToken: number; outputPerToken: number } {
  return model.includes("opus") ? OPUS_5_RATE_CARD : SONNET_5_RATE_CARD;
}

/**
 * Cost through the provider/model pricing adapter (pricing.ts). A model without a rate card prices
 * to null - never to another vendor's rate. (The pre-cleanse rate card priced every non-Opus model
 * as Sonnet, which recorded a DeepSeek call at ~17x its real cost.)
 */
export function calculateCostUsd(inputTokens: number | null, outputTokens: number | null, model: string = "claude-sonnet-5"): number | null {
  return priceUsage({ inputTokens, outputTokens }, model).costUsd;
}

/** True for a real Anthropic SDK rate-limit error (HTTP 429) - narrow, not a catch-all for any failure. */
export function isRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  return status === 429;
}

/**
 * Retry with exponential backoff + full jitter (task §25 - "retry,
 * exponential backoff, jitter"). Only retries real 429s - any other error
 * (a parse failure, a 4xx validation error, a network error the caller
 * should see immediately) propagates on the first attempt, since blindly
 * retrying a non-rate-limit failure risks masking a real bug rather than a
 * transient condition.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: { maxAttempts?: number; baseDelayMs?: number } = {}): Promise<{ value: T; attemptCount: number; retryCount: number; rateLimitFailures: number }> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 2000;
  let rateLimitFailures = 0;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn();
      return { value, attemptCount: attempt, retryCount: attempt - 1, rateLimitFailures };
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === maxAttempts) throw err;
      rateLimitFailures++;
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * backoff * 0.5;
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }
  throw lastErr;
}
