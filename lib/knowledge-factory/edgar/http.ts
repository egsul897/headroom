/**
 * Responsible SEC HTTP client: identifying User-Agent, rate limits, retries,
 * exponential backoff, caching, request logging, file-size limits.
 */

import { mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { RateLimiter, type RateLimiterConfig } from "./rate-limit";
import { ResponseCache } from "./cache";

export const DEFAULT_USER_AGENT =
  "HeadroomKnowledgeFactory/1.0 (research; contact: engineering@headroom-app.example)";

export interface SecHttpClientConfig {
  userAgent?: string;
  rateLimit?: Partial<RateLimiterConfig>;
  cacheDir?: string;
  logDir?: string;
  maxRetries?: number;
  maxBytes?: number;
  /** When true, prefer cache hits and never hit network for cached URLs. */
  cacheOnly?: boolean;
}

export interface SecHttpResponse {
  status: number;
  body: Buffer;
  url: string;
  fromCache: boolean;
  bytes: number;
}

export class SecHttpClient {
  readonly userAgent: string;
  private readonly limiter: RateLimiter;
  private readonly cache: ResponseCache | null;
  private readonly logPath: string | null;
  private readonly maxRetries: number;
  private readonly maxBytes: number;
  private readonly cacheOnly: boolean;
  private requestCount = 0;
  private downloadBytes = 0;

  constructor(config: SecHttpClientConfig = {}) {
    this.userAgent = config.userAgent ?? DEFAULT_USER_AGENT;
    this.limiter = new RateLimiter(config.rateLimit);
    this.cache = config.cacheDir ? new ResponseCache(config.cacheDir) : null;
    this.logPath = config.logDir ? path.join(config.logDir, "sec-requests.jsonl") : null;
    if (config.logDir) mkdirSync(config.logDir, { recursive: true });
    this.maxRetries = config.maxRetries ?? 5;
    this.maxBytes = config.maxBytes ?? 25 * 1024 * 1024;
    this.cacheOnly = config.cacheOnly ?? false;
  }

  metrics(): { requestCount: number; downloadBytes: number } {
    return { requestCount: this.requestCount, downloadBytes: this.downloadBytes };
  }

  async get(url: string, opts: { bypassCache?: boolean } = {}): Promise<SecHttpResponse> {
    if (!opts.bypassCache && this.cache) {
      const hit = this.cache.get(url);
      if (hit) {
        this.log({ url, status: hit.status, fromCache: true, bytes: hit.body.length });
        return { status: hit.status, body: hit.body, url, fromCache: true, bytes: hit.body.length };
      }
    }
    if (this.cacheOnly) {
      throw new Error(`SecHttpClient: cache-only mode and no cache entry for ${url}`);
    }

    let attempt = 0;
    let lastError: unknown;
    while (attempt <= this.maxRetries) {
      await this.limiter.acquire();
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": this.userAgent, Accept: "*/*" },
        });
        const contentLength = Number(res.headers.get("content-length") ?? "0");
        if (contentLength > this.maxBytes) {
          throw new Error(`SecHttpClient: content-length ${contentLength} exceeds maxBytes ${this.maxBytes} for ${url}`);
        }
        if (res.status === 429 || res.status === 503) {
          attempt += 1;
          await backoff(attempt);
          continue;
        }
        const ab = await res.arrayBuffer();
        if (ab.byteLength > this.maxBytes) {
          throw new Error(`SecHttpClient: body ${ab.byteLength} exceeds maxBytes ${this.maxBytes} for ${url}`);
        }
        const body = Buffer.from(ab);
        this.requestCount += 1;
        this.downloadBytes += body.length;
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        if (this.cache && res.status === 200) this.cache.put(url, res.status, body, headers);
        this.log({ url, status: res.status, fromCache: false, bytes: body.length, attempt });
        return { status: res.status, body, url, fromCache: false, bytes: body.length };
      } catch (err) {
        lastError = err;
        attempt += 1;
        if (attempt > this.maxRetries) break;
        await backoff(attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`SecHttpClient: failed ${url}: ${String(lastError)}`);
  }

  async getText(url: string): Promise<{ status: number; text: string; fromCache: boolean }> {
    const res = await this.get(url);
    return { status: res.status, text: res.body.toString("utf8"), fromCache: res.fromCache };
  }

  private log(entry: Record<string, unknown>): void {
    if (!this.logPath) return;
    appendFileSync(this.logPath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  }
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(30_000, 250 * 2 ** attempt) + Math.floor(Math.random() * 100);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
