import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecAccessCoordinator, resetSharedSecAccessForTests } from "../../lib/edgar-historical-backfill/sec-access";

describe("SecAccessCoordinator fair-access", () => {
  it("sends identifying User-Agent on every live fetch", async () => {
    const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const sec = new SecAccessCoordinator({
      fetchImpl,
      cacheDir: null,
      maxRequestsPerSecond: 100,
      maxConcurrency: 1,
      sleep: async () => {},
    });
    await sec.getText("https://www.sec.gov/files/company_tickers.json");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const headers = calls[0]!.headers as Record<string, string>;
    expect(String(headers["User-Agent"] || headers["user-agent"])).toMatch(/Headroom/i);
  });

  it("caches successful responses and avoids a second network call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sec-cache-"));
    let hits = 0;
    const fetchImpl = vi.fn(async () => {
      hits++;
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const sec = new SecAccessCoordinator({
      fetchImpl,
      cacheDir: dir,
      maxRequestsPerSecond: 100,
      sleep: async () => {},
    });
    const a = await sec.getText("https://data.sec.gov/submissions/CIK0000000001.json");
    const b = await sec.getText("https://data.sec.gov/submissions/CIK0000000001.json");
    expect(a.fromCache).toBe(false);
    expect(b.fromCache).toBe(true);
    expect(hits).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("backs off on HTTP 429 before succeeding", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt++;
      if (attempt === 1) return new Response("slow down", { status: 429 });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const sleeps: number[] = [];
    const sec = new SecAccessCoordinator({
      fetchImpl,
      cacheDir: null,
      maxRequestsPerSecond: 100,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const r = await sec.getText("https://www.sec.gov/test");
    expect(r.status).toBe(200);
    expect(attempt).toBe(2);
    expect(sleeps.length).toBeGreaterThan(0);
  });

  it("caps concurrency across workers", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const fetchImpl = vi.fn(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent--;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const sec = new SecAccessCoordinator({
      fetchImpl,
      cacheDir: null,
      maxConcurrency: 2,
      maxRequestsPerSecond: 100,
      sleep: async () => {},
    });
    await Promise.all([
      sec.getText("https://www.sec.gov/a"),
      sec.getText("https://www.sec.gov/b"),
      sec.getText("https://www.sec.gov/c"),
      sec.getText("https://www.sec.gov/d"),
    ]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    resetSharedSecAccessForTests();
  });
});
