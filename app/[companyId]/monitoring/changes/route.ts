/** GET /{companyId}/monitoring/changes?since=ISO — morning-brief feed. Tenant gate first. */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { loadChangesSince, parseSince } from "@/lib/monitoring/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params;
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const since = parseSince(new URL(req.url).searchParams.get("since"));
  if (since === "INVALID") return NextResponse.json({ error: "since must be an ISO date/time" }, { status: 400 });
  try {
    return NextResponse.json(await loadChangesSince(prisma, companyId, since), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // A store failure is not "nothing changed".
    return NextResponse.json({ error: "FEED_UNAVAILABLE", status: "NOT_DETERMINABLE" }, { status: 503 });
  }
}
