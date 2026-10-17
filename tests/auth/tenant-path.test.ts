import { describe, expect, it } from "vitest";
import { decideTenantPath, tenantSegment } from "@/lib/auth/tenant-path";

describe("request-level tenant gate (middleware decision)", () => {
  it("reserved roots and static files are outside the tenant tree", () => {
    for (const p of ["/", "/login", "/admin", "/companies/new", "/research/corpus", "/dev/sample", "/favicon.ico", "/logo.svg"]) expect(tenantSegment(p)).toBeNull();
  });
  it("no session → /login for every tenant page and route", () => {
    for (const p of ["/c1/dashboard", "/c1/covenants", "/c1/documents/d1", "/c1/reports/compliance", "/c1/monitoring/brief", "/c1"]) expect(decideTenantPath(p, null)).toEqual({ kind: "REDIRECT", to: "/login" });
    expect(decideTenantPath("/c1/dashboard", { companyId: "" })).toEqual({ kind: "REDIRECT", to: "/login" });
    expect(decideTenantPath("/c1/dashboard", { companyId: 7 })).toEqual({ kind: "REDIRECT", to: "/login" });
  });
  it("another tenant → the caller's own dashboard (never the requested tenant)", () => {
    expect(decideTenantPath("/c2/covenants", { companyId: "c1" })).toEqual({ kind: "REDIRECT", to: "/c1/dashboard" });
  });
  it("own tenant passes", () => {
    expect(decideTenantPath("/c1/covenants", { companyId: "c1" })).toEqual({ kind: "PASS" });
  });
});
