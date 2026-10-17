import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { decideTenantPath } from "@/lib/auth/tenant-path";

/**
 * Request-level tenant gate for /[companyId]/** (pages, route handlers and server-action POSTs), decided from the
 * signed NextAuth JWT before anything renders. Fail closed: a missing/invalid token or any error → /login.
 * The [companyId] layout gate and each route's own check stay in place (defense in depth).
 */
export async function middleware(req: NextRequest) {
  let token: { companyId?: unknown } | null = null;
  try { token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as { companyId?: unknown } | null; } catch { token = null; }
  const d = decideTenantPath(req.nextUrl.pathname, token);
  if (d.kind === "PASS") return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = d.to; url.search = "";
  return NextResponse.redirect(url, 307);
}

export const config = { matcher: ["/((?!_next/|api/|favicon.ico).*)"] };
