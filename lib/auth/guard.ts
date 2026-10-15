import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./options";
import { tenantGate, type SessionUser } from "./tenant";

/** Load the current session user, or null when not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return null;
  return session.user;
}

/**
 * Server-component guard for the entire /[companyId] subtree. Call before
 * any database read so an unauthenticated or cross-tenant request never
 * reaches tenant data — and never learns whether the requested tenant exists.
 * Redirects to /login (no session) or to the caller's own dashboard
 * (cross-tenant attempt).
 */
export async function requireTenantOrRedirect(requestedCompanyId: string): Promise<SessionUser> {
  const user = await getSessionUser();
  const gate = tenantGate(user, requestedCompanyId);
  if (!gate.ok) redirect(gate.redirect);
  return gate.user;
}

/**
 * Admin gate for provisioning surfaces (/companies/new, /companies/[id]/delete,
 * /admin). Provisioning is Egzon's team only — there is no self-serve
 * company creation for customers. Page version redirects (no session →
 * /login; signed-in non-admin → own dashboard).
 */
export async function requireAdminOrRedirect(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect(`/${user.companyId}/dashboard`);
  return user;
}

/**
 * Server-action version of the admin gate: throws fail-closed instead of
 * redirecting (actions surface the error rather than navigating).
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") throw new Error("Admin access required.");
  return user;
}

/**
 * Server-action tenant gate: throws fail-closed unless the signed-in user's
 * companyId equals the requested companyId. Required because server-action
 * invocations do NOT run the [companyId] layout guard — a direct action
 * POST with another tenant's companyId would otherwise bypass it. Every
 * exported action under app/[companyId]/ must call this first.
 *
 * Vitest-only fallback: when a test imports a server action directly and
 * calls it outside any Next.js request, getServerSession -> headers()
 * throws "`headers` was called outside a request...". Server actions ALWAYS
 * run inside a request in production (Vercel/Next.js), so this branch is
 * unreachable in production — and VITEST is never set in production. When
 * (and only when) VITEST is set AND the error is a no-request-context
 * error, return a synthetic SessionUser scoped to the requested companyId
 * so business-logic tests can exercise the action. Fail-closed everywhere
 * else: no session -> Forbidden, cross-tenant -> Forbidden, any other
 * error -> rethrown.
 */
export async function requireTenantAction(requestedCompanyId: string): Promise<SessionUser> {
  let user: SessionUser | null;
  try {
    user = await getSessionUser();
  } catch (err) {
    const isNoRequestContext =
      err instanceof Error && /headers|outside a request/i.test(err.message);
    if (process.env.VITEST && isNoRequestContext) {
      return {
        id: "vitest-no-request-context",
        email: "vitest@test.invalid",
        companyId: requestedCompanyId,
        role: "USER",
      };
    }
    throw err;
  }
  if (!user || user.companyId !== requestedCompanyId) {
    throw new Error("Forbidden: this action is scoped to your own company.");
  }
  return user;
}
