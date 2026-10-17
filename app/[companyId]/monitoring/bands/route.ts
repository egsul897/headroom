/**
 * GET /{companyId}/monitoring/bands — per covenant: {cutoffs (thresholds), band, previousBand,
 *   trendingToward, status}, live from the covenant overview + the CFO's cutoffs, plus history.
 *   No cutoffs ⇒ status NEEDS_INPUT "Band thresholds not set" (no default cutoffs exist).
 * PUT /{companyId}/monitoring/bands {covenantKey, direction, healthyUntil, moderateUntil} — CFO sets cutoffs.
 * Tenant gate first on both.
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { bandFor, validateCutoffOrder, withHistory, type RatioRowInput } from "@/lib/monitoring/bands";

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
  let thresholds: Array<{ covenantKey: string; healthyUntil: number; moderateUntil: number }> = [];
  let history: Array<{ covenantKey: string; toBand: string; actual: number | null }> = [];
  try {
    [thresholds, history] = await Promise.all([
      prisma.covenantBandThreshold.findMany({ where: { companyId }, select: { covenantKey: true, healthyUntil: true, moderateUntil: true } }),
      prisma.covenantBandEvent.findMany({ where: { companyId }, orderBy: { observedAt: "desc" }, take: 500 }),
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
    bands = rows.map((r) => withHistory(bandFor(r, thresholds), history.filter((e) => e.covenantKey === r.stableKey)));
  } catch {
    status = "NOT_DETERMINABLE";
  }
  return NextResponse.json({ companyId, status, asOfDate, bands, history: history.slice(0, 200) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  let user: { id: string };
  try {
    user = await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { covenantKey?: unknown; direction?: unknown; healthyUntil?: unknown; moderateUntil?: unknown };
  const covenantKey = typeof body.covenantKey === "string" ? body.covenantKey.trim() : "";
  if (!covenantKey || covenantKey.length > 300 || covenantKey === "*") return NextResponse.json({ error: "covenantKey required (per covenant)" }, { status: 400 });
  if (body.direction !== "lower-is-safer" && body.direction !== "higher-is-safer") {
    return NextResponse.json({ error: "direction must be lower-is-safer or higher-is-safer" }, { status: 400 });
  }
  const t = validateCutoffOrder(body.direction, body.healthyUntil, body.moderateUntil);
  if (!t) {
    return NextResponse.json(
      { error: body.direction === "lower-is-safer" ? "Need 0 < healthyUntil < moderateUntil" : "Need healthyUntil > moderateUntil > 0" },
      { status: 422 },
    );
  }
  const row = await prisma.covenantBandThreshold.upsert({
    where: { companyId_covenantKey: { companyId, covenantKey } },
    create: { companyId, covenantKey, ...t, updatedBy: user.id },
    update: { ...t, updatedBy: user.id },
  });
  return NextResponse.json({ covenantKey: row.covenantKey, healthyUntil: row.healthyUntil, moderateUntil: row.moderateUntil });
}
