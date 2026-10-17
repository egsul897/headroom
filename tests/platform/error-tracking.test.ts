import { describe, expect, it, vi } from "vitest";
import { buildEnvelope, captureError, isErrorTrackingEnabled, parseDsn, scrubSecrets } from "@/lib/platform/error-tracking";

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
  it("envelope carries no raw connection string from the error message or extras", () => {
    const env = buildEnvelope(new Error("connect postgres://user:pw@neon.example/db failed"), { where: "t", extra: { DATABASE_URL: "postgres://a:b@c/d", note: "postgres://a:b@c/d" } }, parseDsn(DSN)!, "e1");
    expect(env).not.toMatch(/user:pw@|a:b@c/);
  });
});
