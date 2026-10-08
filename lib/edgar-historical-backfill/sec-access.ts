/**
 * Shared SEC fair-access coordinator for historical discovery workers.
 *
 * Enforces SEC.gov fair-access expectations across all workers in this process:
 * identifying User-Agent, response caching, 429/5xx backoff with jitter, and
 * concurrency / request-rate caps. Does not evade SEC restrictions.
 *
 * CKF acquisition agents should route SEC traffic through the same coordinator
 * (or an equivalent shared limiter) so discovery + download share one budget.
 *
 * This is NOT a second source registry — it is transport only.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_SEC_USER_AGENT =
  "HeadroomHistoricalBackfill/1.0 (contact: engineering@headroom-app.example; research; respectful fair-access)";

export interface SecAccessOptions {
  userAgent?: string;
  /** Max concurrent in-flight SEC requests (default 2). */
  maxConcurrency?: number;
  /** Target max requests per second across workers (default 8; SEC ceiling is 10). */
  maxRequestsPerSecond?: number;
  /** On-disk cache directory; set null to disable. */
  cacheDir?: string | null;
  /** Cache TTL for successful GETs in ms (default 24h). */
  cacheTtlMs?: number;
  /** Injected fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Clock for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface SecFetchResult {
  status: number;
  text: string;
  fromCache: boolean;
  url: string;
}

type CacheEntry = { status: number; text: string; fetchedAt: number; etag?: string };

export class SecAccessCoordinator {
  private readonly userAgent: string;
  private readonly maxConcurrency: number;
  private readonly minIntervalMs: number;
  private readonly cacheDir: string | null;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private inFlight = 0;
  private lastRequestAt = 0;
  private readonly waiters: Array<() => void> = [];
  private requestCount = 0;

  constructor(opts: SecAccessOptions = {}) {
    this.userAgent = opts.userAgent ?? DEFAULT_SEC_USER_AGENT;
    this.maxConcurrency = Math.max(1, opts.maxConcurrency ?? 2);
    const rps = Math.min(10, Math.max(0.2, opts.maxRequestsPerSecond ?? 8));
    this.minIntervalMs = Math.ceil(1000 / rps);
    this.cacheDir = opts.cacheDir === null ? null : (opts.cacheDir ?? join(process.cwd(), ".cache", "sec-edgar"));
    this.cacheTtlMs = opts.cacheTtlMs ?? 24 * 60 * 60 * 1000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    if (this.cacheDir) mkdirSync(this.cacheDir, { recursive: true });
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  getUserAgent(): string {
    return this.userAgent;
  }

  async getText(url: string, opts?: { bypassCache?: boolean; maxAttempts?: number }): Promise<SecFetchResult> {
    if (!opts?.bypassCache) {
      const cached = this.readCache(url);
      if (cached) return { status: cached.status, text: cached.text, fromCache: true, url };
    }

    await this.acquireSlot();
    try {
      const maxAttempts = opts?.maxAttempts ?? 5;
      let lastStatus = 0;
      let lastText = "";
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await this.throttle();
        this.requestCount++;
        const res = await this.fetchImpl(url, {
          headers: {
            "User-Agent": this.userAgent,
            Accept: "application/json,text/html,*/*",
          },
        });
        lastStatus = res.status;
        lastText = await res.text();
        if (res.status === 200) {
          this.writeCache(url, { status: 200, text: lastText, fetchedAt: this.now() });
          return { status: 200, text: lastText, fromCache: false, url };
        }
        if (res.status === 404) {
          return { status: 404, text: lastText, fromCache: false, url };
        }
        // Fair-access / transient: backoff, never hammer.
        if (res.status === 429 || res.status === 503 || res.status >= 500) {
          const backoff = Math.min(60_000, 500 * 2 ** (attempt - 1));
          const jitter = Math.floor(Math.random() * backoff * 0.4);
          await this.sleep(backoff + jitter);
          continue;
        }
        return { status: lastStatus, text: lastText, fromCache: false, url };
      }
      return { status: lastStatus, text: lastText, fromCache: false, url };
    } finally {
      this.releaseSlot();
    }
  }

  async getJson<T>(url: string): Promise<{ status: number; data: T | null; fromCache: boolean }> {
    const r = await this.getText(url);
    if (r.status !== 200) return { status: r.status, data: null, fromCache: r.fromCache };
    try {
      return { status: 200, data: JSON.parse(r.text) as T, fromCache: r.fromCache };
    } catch {
      return { status: 200, data: null, fromCache: r.fromCache };
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.inFlight < this.maxConcurrency) {
      this.inFlight++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.inFlight++;
  }

  private releaseSlot(): void {
    this.inFlight--;
    const next = this.waiters.shift();
    if (next) next();
  }

  private async throttle(): Promise<void> {
    const elapsed = this.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await this.sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestAt = this.now();
  }

  private cachePath(url: string): string | null {
    if (!this.cacheDir) return null;
    const key = createHash("sha256").update(url).digest("hex");
    return join(this.cacheDir, `${key}.json`);
  }

  private readCache(url: string): CacheEntry | null {
    const p = this.cachePath(url);
    if (!p || !existsSync(p)) return null;
    try {
      const entry = JSON.parse(readFileSync(p, "utf8")) as CacheEntry;
      if (this.now() - entry.fetchedAt > this.cacheTtlMs) return null;
      if (entry.status !== 200) return null;
      return entry;
    } catch {
      return null;
    }
  }

  private writeCache(url: string, entry: CacheEntry): void {
    const p = this.cachePath(url);
    if (!p) return;
    try {
      writeFileSync(p, JSON.stringify(entry));
    } catch {
      // Cache is best-effort; discovery must continue if disk is full/readonly.
    }
  }
}

/** Process-wide default coordinator so workers share one fair-access budget. */
let sharedCoordinator: SecAccessCoordinator | null = null;

export function getSharedSecAccess(opts?: SecAccessOptions): SecAccessCoordinator {
  if (!sharedCoordinator) sharedCoordinator = new SecAccessCoordinator(opts);
  return sharedCoordinator;
}

export function resetSharedSecAccessForTests(): void {
  sharedCoordinator = null;
}
