/**
 * Tenant-gate structural rule (found by the RC integration HTTP probe, 2026-10-17).
 *
 * The /[companyId] tenant gate lives in app/[companyId]/layout.tsx (requireTenantOrRedirect). Next renders a
 * segment's layout and page in parallel; with a Suspense boundary (a loading.tsx) at or above that layout, the
 * shell is flushed first, the gate's redirect becomes a streamed client redirect (HTTP 200 + meta refresh), and the
 * page's server-rendered tenant data is streamed in the same response. Observed on the RC: an unauthenticated
 * GET /<companyId>/covenants returned 200 with the company name and covenant analysis in the body.
 *
 * Rule: no loading.tsx may sit at app/ or app/[companyId]/ while the gate is layout-only. A loading boundary is
 * fine BELOW a page-level gate, or anywhere once a request-level gate (middleware) enforces the tenant first.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tenant gate is not bypassed by a streaming boundary", () => {
  it("the [companyId] layout still calls requireTenantOrRedirect before reading company data", () => {
    const src = readFileSync("app/[companyId]/layout.tsx", "utf8");
    const gate = src.indexOf("await requireTenantOrRedirect(companyId)");
    const read = src.indexOf("getCompanySummary(companyId)");
    expect(gate).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(gate);
  });
  it("no loading.tsx at or above the layout-only gate unless a middleware gate exists", () => {
    const middlewareGate = ["middleware.ts", "src/middleware.ts"].some((p) => existsSync(p) && /companyId|tenant/i.test(readFileSync(p, "utf8")));
    if (middlewareGate) return;
    expect(existsSync("app/loading.tsx")).toBe(false);
    expect(existsSync("app/[companyId]/loading.tsx")).toBe(false);
  });
});
