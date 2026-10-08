/**
 * SEC-compliant configurable rate limiter.
 * Never circumvents access restrictions; callers must await acquire().
 */

export interface RateLimiterConfig {
  /** Max requests per window. SEC fair-access guidance: keep well under burst. */
  maxRequests: number;
  /** Window length in ms. */
  windowMs: number;
  /** Minimum gap between consecutive requests (ms). */
  minIntervalMs: number;
}

export const DEFAULT_SEC_RATE_LIMIT: RateLimiterConfig = {
  maxRequests: 8,
  windowMs: 1000,
  minIntervalMs: 120,
};

export class RateLimiter {
  private readonly timestamps: number[] = [];
  private lastRequestAt = 0;
  private readonly config: RateLimiterConfig;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_SEC_RATE_LIMIT, ...config };
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (this.timestamps.length > 0 && now - this.timestamps[0]! >= this.config.windowMs) {
        this.timestamps.shift();
      }
      const sinceLast = now - this.lastRequestAt;
      const needGap = Math.max(0, this.config.minIntervalMs - sinceLast);
      if (this.timestamps.length < this.config.maxRequests && needGap === 0) {
        this.timestamps.push(now);
        this.lastRequestAt = now;
        return;
      }
      const waitForWindow =
        this.timestamps.length >= this.config.maxRequests
          ? Math.max(0, this.config.windowMs - (now - this.timestamps[0]!))
          : 0;
      await sleep(Math.max(needGap, waitForWindow, 10));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
