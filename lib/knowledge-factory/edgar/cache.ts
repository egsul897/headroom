/**
 * Response cache for SEC requests — reduces repeat traffic; never bypasses rate limits.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface CacheEntry {
  url: string;
  status: number;
  headers: Record<string, string>;
  bodyPath: string;
  cachedAt: string;
  etag?: string;
}

export class ResponseCache {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = rootDir;
    mkdirSync(this.root, { recursive: true });
  }

  keyFor(url: string): string {
    return createHash("sha256").update(url).digest("hex");
  }

  get(url: string): { status: number; body: Buffer; entry: CacheEntry } | null {
    const metaPath = path.join(this.root, `${this.keyFor(url)}.json`);
    if (!existsSync(metaPath)) return null;
    const entry = JSON.parse(readFileSync(metaPath, "utf8")) as CacheEntry;
    if (!existsSync(entry.bodyPath)) return null;
    return { status: entry.status, body: readFileSync(entry.bodyPath), entry };
  }

  put(url: string, status: number, body: Buffer, headers: Record<string, string> = {}): CacheEntry {
    const key = this.keyFor(url);
    const bodyPath = path.join(this.root, `${key}.bin`);
    const entry: CacheEntry = {
      url,
      status,
      headers,
      bodyPath,
      cachedAt: new Date().toISOString(),
      etag: headers.etag ?? headers.ETag,
    };
    writeFileSync(bodyPath, body);
    writeFileSync(path.join(this.root, `${key}.json`), JSON.stringify(entry, null, 2));
    return entry;
  }
}
