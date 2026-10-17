import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { decideTenantPath } from "@/lib/auth/tenant-path";

/**
 * Request-level tenant gate for the /[companyId] tree — pages, the
 * route handlers under it (covenants export), and server-action POSTs
 * to its pages — decided from the signed NextAuth JWT BEFORE anything
 * renders.
 *
 * Why this exists: Next renders a segment's layout and its page
 * concurrently, so the [companyId] layout gate (requireTenantOrRedirect)
 * redirected an unauthenticated request but could not stop the page's
 * payload from streaming into the response body — an unauthenticated
 * GET /<companyId>/covenants answered 307 → /login carrying the
 * tenant's full covenant analysis (~564 KB; documents ~311 KB),
 * reproduced over HTTP on staging and production, 2026-10-17. A
 * middleware redirect renders nothing, so its body is empty.
 *
 * Fail closed: a missing/invalid token — or any error reading it —
 * counts as "no session" (→ /login for tenant paths), never as a pass.
 * The layout gate and every route's own check (requireTenantAction
 * etc.) stay in place; this is defense in depth, not a replacement.
 *
 * Session reading: getToken with the app's NEXTAUTH_SECRET. Its
 * secure-cookie default derives from NEXTAUTH_URL / VERCEL exactly the
 * way the NextAuth route handler sets the cookie, so the token is read
 * identically in every deployment of this stack.
 *
 * Matcher scope: every path EXCEPT /api/* (route handlers carry their
 * own gates — session checks, the ERP bearer-token ingest, signed
 * webhooks — and must never wait on a browser session), /_next/*
 * (framework assets), and /favicon.ico. The non-tenant page roots
 * (/, /login, /admin, /companies/*, /research/*) do pass through this
 * function but are reserved segments in decideTenantPath and continue
 * immediately, untouched.
 */
export async function middleware(req: NextRequest) {
  let companyId: unknown = null;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    companyId = token?.companyId ?? null;
  } catch {
    companyId = null;
  }
  const decision = decideTenantPath(req.nextUrl.pathname, { companyId });
  if (decision.kind === "PASS") return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = decision.to;
  url.search = "";
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico).*)"],
};
