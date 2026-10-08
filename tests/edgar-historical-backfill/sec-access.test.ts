import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecAccessCoordinator, resetSharedSecAccessForTests } from "../../lib/edgar-historical-backfill/sec-access";
import { assertAuthorizedSecUserAgent, SecUserAgentConfigError } from "../../lib/edgar-historical-backfill/sec-identity";
import { evaluateSecAccessPolicy } from "../../lib/edgar-historical-backfill/fleet-sec-budget";

const TEST_UA = "VitestSecAccess/1.0 (contact: vitest-sec-access@headroom.dev; research)";

function mockSec(fetchImpl: typeof fetch, extra: ConstructorParameters<typeof SecAccessCoordinator>[0] = {}) {
  return new SecAccessCoordinator({
    userAgent: TEST_UA,
    fetchImpl,
    cacheDir: null,
    maxRequestsPerSecond: 100,
    maxConcurrency: 1,
    sleep: async () => {},
    bypassFleetPolicyForTests: true,
    ...extra,
  });
}

describe("SEC User-Agent identity", () => {
  it("rejects placeholder / example.com contacts", () => {
    expect(() => assertAuthorizedSecUserAgent("Headroom/1.0 (contact: engineering@headroom-app.example)")).toThrow(
      SecUserAgentConfigError,
    );
    expect(() => assertAuthorizedSecUserAgent("Headroom/1.0 (no email here)")).toThrow(SecUserAgentConfigError);
  });

  it("accepts a configured non-placeholder contact", () => {
    expect(assertAuthorizedSecUserAgent(TEST_UA)).toContain("@headroom.dev");
  });
});

describe("fleet access policy honesty", () => {
  it("denies live network when no owner and no shared budget", () => {
    const policy = evaluateSecAccessPolicy({
      role: "WS-EHB",
      userAgent: TEST_UA,
      env: { HEADROOM_SEC_FETCH_OWNER: "NONE" },
    });
    expect(policy.liveNetworkAllowed).toBe(false);
    expect(policy.processLocalLimiterOnly).toBe(true);
  });

  it("allows live only for the designated owner", () => {
    const ehb = evaluateSecAccessPolicy({
      role: "WS-EHB",
      userAgent: TEST_UA,
      env: { HEADROOM_SEC_FETCH_OWNER: "WS-EHB" },
    });
    const ckf = evaluateSecAccessPolicy({
      role: "WS-CKF",
      userAgent: TEST_UA,
      env: { HEADROOM_SEC_FETCH_OWNER: "WS-EHB" },
    });
    expect(ehb.liveNetworkAllowed).toBe(true);
    expect(ckf.liveNetworkAllowed).toBe(false);
  });
});

describe("SecAccessCoordinator fair-access", () => {
  it("sends identifying User-Agent on every live fetch", async () => {
    const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const sec = mockSec(fetchImpl);
    await sec.getText("https://www.sec.gov/files/company_tickers.json");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const headers = calls[0]!.headers as Record<string, string>;
    expect(String(headers["User-Agent"] || headers["user-agent"])).toMatch(/VitestSecAccess/i);
  });

  it("caches successful responses and avoids a second network call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sec-cache-"));
    let hits = 0;
    const fetchImpl = vi.fn(async () => {
      hits++;
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const sec = mockSec(fetchImpl, { cacheDir: dir });
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
    const sec = mockSec(fetchImpl, {
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
    const sec = mockSec(fetchImpl, { maxConcurrency: 2 });
    await Promise.all([
      sec.getText("https://www.sec.gov/a"),
      sec.getText("https://www.sec.gov/b"),
      sec.getText("https://www.sec.gov/c"),
      sec.getText("https://www.sec.gov/d"),
    ]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    resetSharedSecAccessForTests();
  });

  it("refuses live network when fleet policy denies and cache misses", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const sec = new SecAccessCoordinator({
      userAgent: TEST_UA,
      fetchImpl,
      cacheDir: null,
      bypassFleetPolicyForTests: false,
      env: { HEADROOM_SEC_FETCH_OWNER: "NONE" },
      maxRequestsPerSecond: 100,
      sleep: async () => {},
    });
    await expect(sec.getText("https://www.sec.gov/x")).rejects.toThrow(/live SEC network denied/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
