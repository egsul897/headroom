/**
 * Request-level tenant decision for the /[companyId] page tree — pure
 * (no imports, no I/O), so it is unit-testable without a request, a
 * session, or a database. The root middleware (middleware.ts) applies
 * it BEFORE anything renders.
 *
 * Why a request-level gate exists alongside the [companyId] layout gate
 * (requireTenantOrRedirect, lib/auth/guard.ts): Next renders a
 * segment's layout and its page CONCURRENTLY. The layout's redirect
 * does fire, but the page's server-rendered payload can already be in
 * the response body — an unauthenticated GET /<companyId>/covenants
 * answered 307 → /login with the tenant's full covenant analysis in a
 * ~564 KB body, and /<companyId>/documents/<id> leaked ~311 KB the
 * same way (reproduced over HTTP on staging and production,
 * 2026-10-17). A middleware redirect is decided before any rendering,
 * so its body is empty. The layout gate and every route's own check
 * stay in place — this is defense in depth, not a replacement.
 *
 * The redirect rules are exactly the layout gate's (tenantGate,
 * lib/auth/tenant.ts):
 *   - no session               → /login
 *   - session for ANOTHER      → the caller's OWN dashboard
 *     company                    (never the requested tenant, and never
 *                                a response that confirms the tenant
 *                                exists)
 *   - session for THIS company → pass
 * They are restated here rather than imported so this module — and the
 * middleware importing it — stays self-contained on any tree that has
 * the NextAuth JWT stack; tests/auth/tenant-path.test.ts pins the
 * parity with tenantGate so the two cannot drift silently.
 */

/**
 * First path segments that are NOT tenant ids in this app — the static
 * route roots sitting beside /[companyId] in app/. A path under one of
 * these can never be a tenant page (Next resolves a static segment
 * ahead of the dynamic [companyId] segment), so the middleware leaves
 * it to that subtree's own handling:
 *   ""          the public root (/)
 *   "login"     the NextAuth sign-in page
 *   "admin"     /admin — has its own requireAdminOrRedirect gate
 *   "companies" provisioning surfaces (/companies/new,
 *               /companies/[id]/delete) — admin-gated pages/actions
 *   "research"  /research/* — internal research surfaces
 *   "api"       route handlers — they carry their own gates (session
 *               checks, ERP bearer tokens, webhook signatures) and the
 *               middleware matcher excludes /api outright; reserved
 *               here as defense in depth
 *   "_next"     framework assets (also excluded by the matcher)
 *   plus the well-known static files below; any other segment
 *   containing a "." is treated as a static file the same way.
 */
export const NON_TENANT_SEGMENTS: ReadonlySet<string> = new Set([
  "",
  "login",
  "admin",
  "companies",
  "research",
  "api",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

/**
 * The tenant (company) segment of a pathname, or null when the path is
 * outside the tenant tree (a reserved root, a static file, the public
 * root) and the middleware must not invent tenant behavior for it — the
 * app's own routing/404 handling applies instead.
 */
export function tenantSegment(pathname: string): string | null {
  const raw = pathname.split("/")[1] ?? "";
  let seg = raw;
  try {
    seg = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding: keep the raw segment. It cannot equal
    // a real company id (ids are slugs/cuids, never %-escapes), so the
    // decision below fails closed (login / own dashboard) instead of
    // throwing inside middleware.
    seg = raw;
  }
  if (NON_TENANT_SEGMENTS.has(seg) || seg.includes(".")) return null;
  return seg;
}

export type TenantPathDecision =
  | { kind: "PASS" }
  | { kind: "REDIRECT"; to: string };

/** The one JWT claim the decision needs — defined locally on purpose. */
export interface TenantTokenClaims {
  companyId?: unknown;
}

/**
 * Decide a request path against the caller's NextAuth JWT claims.
 * `token` is null/undefined when there is no (valid) session token;
 * any companyId that is not a non-empty string is treated the same —
 * fail closed to /login for tenant paths.
 */
export function decideTenantPath(
  pathname: string,
  token: TenantTokenClaims | null | undefined,
): TenantPathDecision {
  const seg = tenantSegment(pathname);
  if (seg === null) return { kind: "PASS" };
  const own =
    typeof token?.companyId === "string" && token.companyId.length > 0
      ? token.companyId
      : null;
  if (own === null) return { kind: "REDIRECT", to: "/login" };
  if (own !== seg) return { kind: "REDIRECT", to: `/${own}/dashboard` };
  return { kind: "PASS" };
}
