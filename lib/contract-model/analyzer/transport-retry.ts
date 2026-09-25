/**
 * THE one transport retry owner for the certified path.
 *
 * Every other retry layer is disabled or semantic:
 *   - the Anthropic client is constructed with maxRetries: 0 (no SDK-internal retries);
 *   - the legacy withRetry (telemetry.ts) is not used by certified callers;
 *   - shard re-execution and candidate re-attempts are explicit, separately counted decisions.
 *
 * Policy: retry only a ProviderError whose kind is RATE_LIMITED, SERVER_ERROR or NETWORK, at most
 * `maxAttempts` attempts in total, with exponential backoff that honours the abort signal. A 402,
 * any other 4xx, an abort, a schema failure and an unknown error are never retried here.
 */
import { normalizeProviderError, ProviderError, type ProviderErrorKind } from "./provider-error";
import { throwIfAborted } from "./deadline";

export interface TransportRetryPolicy {
  /** Total attempts including the first. The certified default is 2: one request, one retry. */
  maxAttempts: number;
  baseDelayMs: number;
  retryOn: readonly ProviderErrorKind[];
}

export const CERTIFIED_TRANSPORT_RETRY_POLICY: TransportRetryPolicy = { maxAttempts: 2, baseDelayMs: 500, retryOn: ["RATE_LIMITED", "SERVER_ERROR", "NETWORK"] };
export const TRANSPORT_RETRY_POLICY_VERSION = "headroom-transport-retry.v1";

export interface TransportAttemptRecord { attempt: number; outcome: "OK" | "RETRIED" | "FAILED"; kind: ProviderErrorKind | null; httpStatus: number | null; latencyMs: number }

export interface TransportOutcome<T> { value: T; attempts: TransportAttemptRecord[]; transportAttempts: number; retries: number; rateLimitFailures: number }

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new Error("aborted")); return; }
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal?.reason ?? new Error("aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runWithTransportRetry<T>(fn: (attempt: number) => Promise<T>, ctx: { provider: string; model: string; signal?: AbortSignal; policy?: TransportRetryPolicy; stage?: string }): Promise<TransportOutcome<T>> {
  const policy = ctx.policy ?? CERTIFIED_TRANSPORT_RETRY_POLICY;
  const attempts: TransportAttemptRecord[] = [];
  let rateLimitFailures = 0;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    throwIfAborted(ctx.signal, ctx.stage ?? "provider request");
    const started = Date.now();
    try {
      const value = await fn(attempt);
      attempts.push({ attempt, outcome: "OK", kind: null, httpStatus: null, latencyMs: Date.now() - started });
      return { value, attempts, transportAttempts: attempt, retries: attempt - 1, rateLimitFailures };
    } catch (err) {
      const pe: ProviderError = normalizeProviderError(err, ctx);
      if (pe.kind === "RATE_LIMITED") rateLimitFailures++;
      const canRetry = policy.retryOn.includes(pe.kind) && attempt < policy.maxAttempts && !ctx.signal?.aborted;
      attempts.push({ attempt, outcome: canRetry ? "RETRIED" : "FAILED", kind: pe.kind, httpStatus: pe.httpStatus, latencyMs: Date.now() - started });
      if (!canRetry) throw pe;
      await sleep(policy.baseDelayMs * 2 ** (attempt - 1), ctx.signal);
    }
  }
  throw new Error("unreachable: transport retry loop exited without a result");
}
