/**
 * Bounded retry for transient Neon HTTPS failures (fetch/network).
 * Never retries auth failures. Used by createNeonHttpsExecutor and rules-store wraps.
 */

export type NeonHttpsRetryOptions = {
  /** Total attempts including the first (default 5). */
  maxAttempts?: number;
  /** Base delay before first retry (default 100ms); doubles each attempt. */
  baseDelayMs?: number;
  /** Cap on delay between attempts (default 2000ms). */
  maxDelayMs?: number;
  /** Injected sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional observer (attempts are 1-based). */
  onRetry?: (info: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: unknown;
  }) => void;
};

export function neonHttpsErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** True for transient HTTPS/network blips; false for auth and other permanent errors. */
export function isTransientNeonHttpsError(err: unknown): boolean {
  const m = neonHttpsErrorMessage(err).toLowerCase();
  if (
    m.includes("password authentication failed") ||
    m.includes("authentication failed") ||
    m.includes("28p01") ||
    m.includes("p1010") ||
    m.includes("was denied access") ||
    m.includes("unauthorized") ||
    m.includes("permission denied") ||
    m.includes("database_url unset")
  ) {
    return false;
  }
  return (
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("etimedout") ||
    m.includes("eai_again") ||
    m.includes("enotfound") ||
    m.includes("socket hang up") ||
    m.includes("und_err") ||
    m.includes("other side closed") ||
    m.includes("temporarily unavailable") ||
    m.includes("503") ||
    m.includes("502") ||
    m.includes("504") ||
    m.includes("error connecting to database")
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` with up to `maxAttempts` tries on transient Neon HTTPS errors.
 * Auth / non-transient errors fail immediately.
 */
export async function withNeonHttpsRetry<T>(
  fn: () => Promise<T>,
  opts: NeonHttpsRetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 100;
  const maxDelayMs = opts.maxDelayMs ?? 2000;
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientNeonHttpsError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      opts.onRetry?.({ attempt, maxAttempts, delayMs, error: err });
      await sleep(delayMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
