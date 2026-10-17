/**
 * Request-level tenant decision for the /[companyId] page tree (pure; used by middleware.ts).
 *
 * Why a request-level gate: Next renders a segment's layout and its page concurrently. The [companyId] layout gate
 * (requireTenantOrRedirect) does redirect, but the page's server-rendered payload can already be in the response
 * body — observed on the RC: an unauthenticated GET /<companyId>/documents/<id> answered 307 with the agreement text
 * in the body, and /<companyId>/covenants answered 200 with the company's covenant analysis. Deciding before any
 * rendering closes that for every page, including ones added later.
 */
export const NON_TENANT_SEGMENTS: ReadonlySet<string> = new Set(["", "login", "admin", "api", "companies", "dev", "research", "_next", "favicon.ico", "robots.txt", "sitemap.xml"]);

export type TenantPathDecision = { kind: "PASS" } | { kind: "REDIRECT"; to: string };

/** First path segment, or null for paths outside the tenant tree (reserved roots, static files). */
export function tenantSegment(pathname: string): string | null {
  const seg = decodeURIComponent(pathname.split("/")[1] ?? "");
  if (NON_TENANT_SEGMENTS.has(seg) || seg.includes(".")) return null;
  return seg;
}

/** Same rules as tenantGate (lib/auth/tenant.ts): no session → /login; another tenant → the caller's own dashboard. */
export function decideTenantPath(pathname: string, token: { companyId?: unknown } | null): TenantPathDecision {
  const seg = tenantSegment(pathname);
  if (seg === null) return { kind: "PASS" };
  const own = typeof token?.companyId === "string" && token.companyId.length > 0 ? token.companyId : null;
  if (!own) return { kind: "REDIRECT", to: "/login" };
  if (own !== seg) return { kind: "REDIRECT", to: `/${encodeURIComponent(own)}/dashboard` };
  return { kind: "PASS" };
}
