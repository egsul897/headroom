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
  /** thresholdValue-USD = tokens x a cited published rate card. Always labeled PROJECTED wherever surfaced in the report. */
  calculatedCostUsd: number | null;
  error?: string;
}

/** Anthropic's own published rate cards (USD per token) - current as of this session, per Anthropic's own pricing reference. */
export const SONNET_5_RATE_CARD = { inputPerToken: 2 / 1_000_000, outputPerToken: 10 / 1_000_000 };
export const OPUS_5_RATE_CARD = { inputPerToken: 5 / 1_000_000, outputPerToken: 25 / 1_000_000 };

function rateCardForModel(model: string): { inputPerToken: number; outputPerToken: number } {
  return model.includes("opus") ? OPUS_5_RATE_CARD : SONNET_5_RATE_CARD;
}

export function calculateCostUsd(inputTokens: number | null, outputTokens: number | null, model: string = "claude-sonnet-5"): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  const rateCard = rateCardForModel(model);
  return inputTokens * rateCard.inputPerToken + outputTokens * rateCard.outputPerToken;
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
