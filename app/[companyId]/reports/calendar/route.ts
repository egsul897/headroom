/**
 * GET /{companyId}/reports/calendar — read-only covenant calendar from the
 * obligations already persisted by extraction. Tenant gate first.
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { buildCovenantCalendar } from "@/lib/reports/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params;
  if (!companyId?.trim()) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const rows = await prisma.contractEventObligation.findMany({ where: { companyId }, orderBy: { stableKey: "asc" } });
    return NextResponse.json(buildCovenantCalendar(companyId, rows), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Infrastructure failure is NOT "nothing due".
    return NextResponse.json({ error: "CALENDAR_UNAVAILABLE", status: "NOT_DETERMINABLE" }, { status: 503 });
  }
}
