/**
 * GET  /{companyId}/monitoring/notifications[?unread=1] — in-app notifications.
 * POST /{companyId}/monitoring/notifications {ids: string[]} — mark read (own workspace only).
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const unread = new URL(req.url).searchParams.get("unread") === "1";
  try {
    const rows = await prisma.workspaceNotification.findMany({ where: { companyId, ...(unread ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
    const unreadCount = await prisma.workspaceNotification.count({ where: { companyId, readAt: null } });
    return NextResponse.json({ unreadCount, notifications: rows.map(({ dedupeKey: _k, ...r }) => r) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "NOTIFICATIONS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
  // companyId in the WHERE: another workspace's ids are silently not matched.
  const r = await prisma.workspaceNotification.updateMany({ where: { companyId, id: { in: ids }, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ marked: r.count });
}
