import { describe, expect, it, vi } from "vitest";
import {
  buildEnvelope,
  captureError,
  configuredDsn,
  isErrorTrackingEnabled,
  messageFingerprint,
  parseDsn,
  scrubSecrets,
  stackFrameLocations,
  structuralTags,
} from "@/lib/platform/error-tracking";

const DSN = "https://abc123@o1.ingest.example.com/42";

describe("error tracking is env-gated", () => {
  it("is OFF when no DSN is set and sends nothing", async () => {
    const fetchImpl = vi.fn();
    expect(isErrorTrackingEnabled({})).toBe(false);
    expect(await captureError(new Error("x"), { where: "t" }, { env: {}, fetchImpl })).toEqual({ sent: false, reason: "DISABLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("fails closed on a malformed DSN (no guessed destination)", async () => {
    const fetchImpl = vi.fn();
    for (const bad of ["not a url", "https://example.com/42", "https://k@example.com/notnum", "ftp://k@example.com/1"]) {
      expect(parseDsn(bad)).toBeNull();
      expect(await captureError(new Error("x"), { where: "t" }, { env: { HEADROOM_ERROR_DSN: bad }, fetchImpl })).toEqual({ sent: false, reason: "INVALID_DSN" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("posts an envelope to the DSN's project when configured", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const r = await captureError(new Error("boom"), { where: "upload" }, { env: { SENTRY_DSN: DSN }, fetchImpl });
    expect(r.sent).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://o1.ingest.example.com/api/42/envelope/");
    expect(init.headers["X-Sentry-Auth"]).toContain("sentry_key=abc123");
    expect(init.body).toContain('"where":"upload"');
  });
  it("transport failure never throws", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("net"); });
    expect(await captureError(new Error("x"), { where: "t" }, { env: { SENTRY_DSN: DSN }, fetchImpl })).toEqual({ sent: false, reason: "TRANSPORT_ERROR" });
  });
});

describe("scrubbing", () => {
  it("redacts connection strings, bearer tokens, stripe keys and key=value secrets", () => {
    const s = scrubSecrets("db postgresql://u:p@host/db?sslmode=require Bearer abc.def sk_live_123abc token=xyz");
    expect(s).not.toContain("u:p@host");
    expect(s).not.toContain("abc.def");
    expect(s).not.toContain("sk_live_123abc");
    expect(s).not.toContain("xyz");
  });
  it("envelope carries no raw connection string from the error message or tags", () => {
    const env = buildEnvelope(new Error("connect postgres://user:pw@neon.example/db failed"), { where: "t", tags: { DATABASE_URL: "postgres://a:b@c/d" } }, parseDsn(DSN)!, "e1");
    expect(env).not.toMatch(/user:pw@|a:b@c|neon\.example/);
  });
});

describe("structural-only payload (no agreement text leaves the process)", () => {
  const AGREEMENT = "Consolidated Fixed Charge Coverage Ratio shall not be less than 1.25 to 1.00 for Borrower Acme Holdings";
  it("never ships the message text, extras or stack text; only type, fingerprint and frame locations", () => {
    const err = new TypeError(`${AGREEMENT}\n    at Leak (secret clause text:1:2)`);
    const body = buildEnvelope(err, { where: "upload.deferred-analysis", tags: { stage: "parse", note: AGREEMENT } }, parseDsn(DSN)!, "e1");
    expect(body).not.toContain("Fixed Charge");
    expect(body).not.toContain("Acme");
    expect(body).not.toContain("secret clause");
    expect(body).not.toContain("Leak");
    const event = JSON.parse(body.trim().split("\n")[2]!) as {
      tags: Record<string, string>;
      fingerprint: string[];
      exception: { values: { type: string; value: string; stacktrace?: { frames: { filename: string; lineno?: number; function?: string }[] } }[] };
      extra?: unknown;
    };
    expect(event.extra).toBeUndefined();
    expect(event.tags).toEqual({ where: "upload.deferred-analysis", stage: "parse" });
    const ex = event.exception.values[0]!;
    expect(ex.type).toBe("TypeError");
    expect(ex.value).toBe(`[message withheld] fp=${messageFingerprint(err.message)} len=${err.message.length}`);
    expect(event.fingerprint).toEqual(["TypeError", messageFingerprint(err.message)]);
    const frames = ex.stacktrace!.frames;
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((f) => f.filename === "tests/platform/error-tracking.test.ts")).toBe(true);
    for (const f of frames) expect(typeof f.lineno).toBe("number");
  });
  it("non-Error throws send only their JS type", () => {
    const body = buildEnvelope({ clause: AGREEMENT }, { where: "t" }, parseDsn(DSN)!, "e2");
    expect(body).not.toContain("Fixed Charge");
    expect(body).toContain('"type":"NonError:object"');
  });
  it("tags that are not identifier-like are dropped, and a free-text where is replaced", () => {
    expect(structuralTags("has spaces in it", { ok: "v1", "bad key": "x", long: "x".repeat(65), url: "postgres://a:b@c/d" })).toEqual({ where: "invalid-where", ok: "v1" });
  });
  it("frame parsing keeps only function identifiers and repo-relative paths", () => {
    const stack = ["Error: boom", "    at async runJob (/repo/lib/platform/background.ts:48:13)", "    at /repo/node_modules/x/index.js:1:2", "    at weird name with spaces (/repo/a.ts:1:1)"].join("\n");
    expect(stackFrameLocations(stack, "boom", "/repo")).toEqual([
      { filename: "a.ts", lineno: 1, colno: 1 },
      { filename: "node_modules/x/index.js", lineno: 1, colno: 2 },
      { filename: "lib/platform/background.ts", lineno: 48, colno: 13, function: "runJob" },
    ]);
  });
});

describe("DSN resolution", () => {
  it("an empty or blank HEADROOM_ERROR_DSN falls through to SENTRY_DSN", async () => {
    for (const blank of ["", "   "]) {
      expect(configuredDsn({ HEADROOM_ERROR_DSN: blank, SENTRY_DSN: DSN })).toBe(DSN);
      expect(isErrorTrackingEnabled({ HEADROOM_ERROR_DSN: blank, SENTRY_DSN: DSN })).toBe(true);
      const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
      expect((await captureError(new Error("x"), { where: "t" }, { env: { HEADROOM_ERROR_DSN: blank, SENTRY_DSN: DSN }, fetchImpl })).sent).toBe(true);
    }
  });
  it("a set HEADROOM_ERROR_DSN wins over SENTRY_DSN", () => {
    expect(configuredDsn({ HEADROOM_ERROR_DSN: "https://k@h.example/1", SENTRY_DSN: DSN })).toBe("https://k@h.example/1");
  });
});
