/**
 * Tenant isolation — pure, fail-closed access decisions.
 *
 * The SaaS model is one company per account: a logged-in user may access
 * exactly their own company's workspace. There is no company chooser, no
 * cross-tenant view, and no role that grants cross-tenant dashboard access
 * (ADMIN users provision accounts via the offline script, never by opening
 * another tenant's dashboard).
 *
 * These functions are pure so they are unit-testable without a database or
 * a NextAuth session. The server guard (lib/auth/guard.ts) loads the
 * session and applies them; API routes apply canAccessTenant directly.
 */

export interface SessionUser {
  id: string;
  email: string;
  companyId: string;
  role: "USER" | "ADMIN";
}

export function canAccessTenant(sessionUser: SessionUser | null | undefined, requestedCompanyId: string): boolean {
  if (!sessionUser) return false;
  if (!requestedCompanyId) return false;
  return sessionUser.companyId === requestedCompanyId;
}

export type TenantGateResult =
  | { ok: true; user: SessionUser }
  | { ok: false; redirect: string };

/**
 * Server-page gate outcome. Cross-tenant attempts redirect to the caller's
 * OWN dashboard (never to the requested tenant, and never leaking whether
 * the requested tenant exists). No session redirects to /login.
 */
export function tenantGate(sessionUser: SessionUser | null | undefined, requestedCompanyId: string): TenantGateResult {
  if (!sessionUser) return { ok: false, redirect: "/login" };
  if (sessionUser.companyId !== requestedCompanyId) {
    return { ok: false, redirect: `/${sessionUser.companyId}/dashboard` };
  }
  return { ok: true, user: sessionUser };
}
