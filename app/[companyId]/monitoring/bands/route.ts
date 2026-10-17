/**
 * GET /{companyId}/monitoring/bands — current band per tested covenant (live from the
 *   covenant overview + thresholds) and the recorded band history.
 * PUT /{companyId}/monitoring/bands {covenantKey|"*", moderateBelow, dangerBelow} — set thresholds.
 * Tenant gate first on both.
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { bandFor, PRODUCT_DEFAULT_THRESHOLDS, validateThresholds, type RatioRowInput } from "@/lib/monitoring/bands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let thresholds: Array<{ covenantKey: string; moderateBelow: number; dangerBelow: number }> = [];
  let history: unknown[] = [];
  try {
    [thresholds, history] = await Promise.all([
      prisma.covenantBandThreshold.findMany({ where: { companyId }, select: { covenantKey: true, moderateBelow: true, dangerBelow: true } }),
      prisma.covenantBandEvent.findMany({ where: { companyId }, orderBy: { observedAt: "desc" }, take: 200 }),
    ]);
  } catch {
    return NextResponse.json({ error: "BANDS_UNAVAILABLE", status: "NOT_DETERMINABLE" }, { status: 503 });
  }
  let asOfDate: string | null = null;
  let bands: ReturnType<typeof bandFor>[] = [];
  let status: "OK" | "NOT_DETERMINABLE" = "OK";
  try {
    const { getCovenantOverview } = await import("@/lib/covenant-overview-service");
    const o = await getCovenantOverview(companyId);
    asOfDate = o.asOfDate.toISOString().slice(0, 10);
    const rows: RatioRowInput[] = [];
    for (const fam of o.covenantFamilies) for (const r of fam.rows) if (r.kind === "RATIO") rows.push(r);
    bands = rows.map((r) => bandFor(r, thresholds));
  } catch {
    status = "NOT_DETERMINABLE";
  }
  return NextResponse.json(
    { companyId, status, asOfDate, productDefaultThresholds: PRODUCT_DEFAULT_THRESHOLDS, thresholds, bands, history },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  let user: { id: string };
  try {
    user = await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { covenantKey?: unknown; moderateBelow?: unknown; dangerBelow?: unknown };
  const covenantKey = typeof body.covenantKey === "string" ? body.covenantKey.trim() : "";
  if (!covenantKey || covenantKey.length > 300) return NextResponse.json({ error: "covenantKey required" }, { status: 400 });
  const t = validateThresholds({ moderateBelow: body.moderateBelow, dangerBelow: body.dangerBelow });
  if (!t) return NextResponse.json({ error: "Thresholds must satisfy 0 < dangerBelow < moderateBelow <= 1" }, { status: 422 });
  const row = await prisma.covenantBandThreshold.upsert({
    where: { companyId_covenantKey: { companyId, covenantKey } },
    create: { companyId, covenantKey, ...t, updatedBy: user.id },
    update: { ...t, updatedBy: user.id },
  });
  return NextResponse.json({ covenantKey: row.covenantKey, moderateBelow: row.moderateBelow, dangerBelow: row.dangerBelow });
}
