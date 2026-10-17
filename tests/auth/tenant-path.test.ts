import { describe, expect, it } from "vitest";
import {
  decideTenantPath,
  tenantSegment,
  type TenantTokenClaims,
} from "@/lib/auth/tenant-path";
import { tenantGate, type SessionUser } from "@/lib/auth/tenant";

const OWN = "acme-corp";
const OTHER = "globex-inc";

function token(companyId?: unknown): TenantTokenClaims {
  return { companyId };
}

function user(companyId: string): SessionUser {
  return { id: "u1", email: "cfo@acme.example", companyId, role: "USER" };
}

describe("tenantSegment", () => {
  it("extracts the company segment of tenant paths, shallow and deep", () => {
    expect(tenantSegment(`/${OWN}`)).toBe(OWN);
    expect(tenantSegment(`/${OWN}/dashboard`)).toBe(OWN);
    expect(tenantSegment(`/${OWN}/documents/doc-123`)).toBe(OWN);
    expect(tenantSegment(`/${OWN}/covenants/export/pdf`)).toBe(OWN);
  });

  it("returns null for the public root and every reserved root", () => {
    for (const p of [
      "/",
      "/login",
      "/admin",
      "/companies/new",
      "/companies/some-id/delete",
      "/research",
      "/research/corpus",
      "/api/ask",
      "/api/auth/session",
      "/_next/static/chunks/main.js",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      expect(tenantSegment(p), p).toBeNull();
    }
  });

  it("treats any dotted first segment as a static file, not a tenant", () => {
    expect(tenantSegment("/logo.svg")).toBeNull();
    expect(tenantSegment("/some-file.css")).toBeNull();
  });

  it("still treats a dotted single-segment path as a static file, trailing slash included", () => {
    expect(tenantSegment("/site.webmanifest")).toBeNull();
    expect(tenantSegment("/x.y")).toBeNull();
    expect(tenantSegment("/x.y/")).toBeNull();
  });

  it("returns a dotted first segment when deeper path parts follow it (a tenant-route attempt)", () => {
    expect(tenantSegment("/x.y/covenants")).toBe("x.y");
    expect(tenantSegment("/x.y/dashboard")).toBe("x.y");
    // The dot check runs on the DECODED segment, so a %2E-encoded dot
    // is seen as a dot too.
    expect(tenantSegment("/acme%2Ecorp/covenants")).toBe("acme.corp");
  });

  it("decodes percent-encoded segments so encoded ids match the JWT claim", () => {
    expect(tenantSegment("/acme%20corp/covenants")).toBe("acme corp");
  });

  it("never throws on malformed percent-encoding", () => {
    expect(() => tenantSegment("/%/covenants")).not.toThrow();
    expect(tenantSegment("/%/covenants")).toBe("%");
  });
});

describe("decideTenantPath — tenant paths", () => {
  const tenantPaths = [
    `/${OWN}`,
    `/${OWN}/dashboard`,
    `/${OWN}/covenants`,
    `/${OWN}/documents/doc-123`,
    `/${OWN}/covenants/export/pdf`,
    `/${OWN}/onboarding/financials`,
  ];

  it("redirects unauthenticated requests to /login (no session variants)", () => {
    for (const p of tenantPaths) {
      expect(decideTenantPath(p, null), p).toEqual({ kind: "REDIRECT", to: "/login" });
      expect(decideTenantPath(p, undefined), p).toEqual({ kind: "REDIRECT", to: "/login" });
      expect(decideTenantPath(p, token(undefined)), p).toEqual({ kind: "REDIRECT", to: "/login" });
      expect(decideTenantPath(p, token("")), p).toEqual({ kind: "REDIRECT", to: "/login" });
    }
  });

  it("fails closed when the companyId claim is not a string", () => {
    for (const bad of [42, null, {}, [], true]) {
      expect(decideTenantPath(`/${OWN}/covenants`, token(bad))).toEqual({
        kind: "REDIRECT",
        to: "/login",
      });
    }
  });

  it("passes a same-tenant session through, shallow and deep", () => {
    for (const p of tenantPaths) {
      expect(decideTenantPath(p, token(OWN)), p).toEqual({ kind: "PASS" });
    }
  });

  it("redirects a cross-tenant session to its OWN dashboard, never the requested tenant", () => {
    for (const p of tenantPaths) {
      expect(decideTenantPath(p, token(OTHER)), p).toEqual({
        kind: "REDIRECT",
        to: `/${OTHER}/dashboard`,
      });
    }
    expect(decideTenantPath(`/${OTHER}/covenants`, token(OWN))).toEqual({
      kind: "REDIRECT",
      to: `/${OWN}/dashboard`,
    });
  });

  it("matches an encoded path segment against the decoded JWT claim", () => {
    expect(decideTenantPath("/acme%20corp/covenants", token("acme corp"))).toEqual({
      kind: "PASS",
    });
  });

  it("fails closed (never passes) on malformed or encoded-slash segments", () => {
    expect(decideTenantPath("/%/covenants", null)).toEqual({ kind: "REDIRECT", to: "/login" });
    expect(decideTenantPath("/%/covenants", token(OWN))).toEqual({
      kind: "REDIRECT",
      to: `/${OWN}/dashboard`,
    });
    // "%2F" decodes to a slash INSIDE the segment — it must not become
    // a pass or a nested path, just a segment that matches no tenant.
    expect(decideTenantPath("/acme%2Fevil/covenants", token(OWN))).toEqual({
      kind: "REDIRECT",
      to: `/${OWN}/dashboard`,
    });
    expect(decideTenantPath("/acme%2Fevil/covenants", null)).toEqual({
      kind: "REDIRECT",
      to: "/login",
    });
  });
});

describe("decideTenantPath — dotted first segments (N1 hardening)", () => {
  it("gates a dotted first segment with deeper parts: no session → /login", () => {
    expect(decideTenantPath("/x.y/covenants", null)).toEqual({
      kind: "REDIRECT",
      to: "/login",
    });
    expect(decideTenantPath("/x.y/dashboard", undefined)).toEqual({
      kind: "REDIRECT",
      to: "/login",
    });
  });

  it("gates a dotted first segment with deeper parts: cross-tenant session → its OWN dashboard", () => {
    expect(decideTenantPath("/x.y/covenants", token(OWN))).toEqual({
      kind: "REDIRECT",
      to: `/${OWN}/dashboard`,
    });
    expect(decideTenantPath("/x.y/covenants", token(OTHER))).toEqual({
      kind: "REDIRECT",
      to: `/${OTHER}/dashboard`,
    });
  });

  it("gates percent-encoded dots (%2E) in a multi-segment path the same way", () => {
    expect(decideTenantPath("/acme%2Ecorp/covenants", null)).toEqual({
      kind: "REDIRECT",
      to: "/login",
    });
    expect(decideTenantPath("/acme%2Ecorp/covenants", token(OWN))).toEqual({
      kind: "REDIRECT",
      to: `/${OWN}/dashboard`,
    });
  });

  it("still passes dotted single-segment paths (static files) for any session state", () => {
    for (const p of ["/x.y", "/x.y/", "/site.webmanifest", "/logo.svg"]) {
      expect(decideTenantPath(p, null), p).toEqual({ kind: "PASS" });
      expect(decideTenantPath(p, token(OTHER)), p).toEqual({ kind: "PASS" });
    }
  });
});

describe("decideTenantPath — non-tenant paths always pass", () => {
  const nonTenantPaths = [
    "/",
    "/login",
    "/admin",
    "/companies/new",
    "/companies/some-id/delete",
    "/research",
    "/research/corpus/src-1",
    "/api/ask",
    "/api/auth/callback/credentials",
    "/api/integrations/erp/conn-1/financial-facts",
    "/_next/static/chunks/main.js",
    "/favicon.ico",
    "/robots.txt",
    "/logo.svg",
  ];

  it("passes them with no session at all", () => {
    for (const p of nonTenantPaths) {
      expect(decideTenantPath(p, null), p).toEqual({ kind: "PASS" });
    }
  });

  it("passes them for any session, including a cross-tenant one", () => {
    for (const p of nonTenantPaths) {
      expect(decideTenantPath(p, token(OTHER)), p).toEqual({ kind: "PASS" });
    }
  });
});

describe("parity with tenantGate (the layout gate's redirect rules)", () => {
  it("agrees on the no-session target", () => {
    const gate = tenantGate(null, OWN);
    expect(gate).toEqual({ ok: false, redirect: "/login" });
    expect(decideTenantPath(`/${OWN}/covenants`, null)).toEqual({
      kind: "REDIRECT",
      to: gate.ok ? "" : gate.redirect,
    });
  });

  it("agrees on the cross-tenant target (caller's own dashboard)", () => {
    const gate = tenantGate(user(OTHER), OWN);
    expect(gate.ok).toBe(false);
    expect(decideTenantPath(`/${OWN}/covenants`, token(OTHER))).toEqual({
      kind: "REDIRECT",
      to: gate.ok ? "" : gate.redirect,
    });
  });

  it("agrees on the same-tenant outcome (pass)", () => {
    expect(tenantGate(user(OWN), OWN).ok).toBe(true);
    expect(decideTenantPath(`/${OWN}/covenants`, token(OWN))).toEqual({ kind: "PASS" });
  });
});
