/**
 * GET /{companyId}/monitoring/bands — per covenant: {cutoffs (thresholds), band, previousBand,
 *   trendingToward, status}, live from the covenant overview + the CFO's cutoffs, plus history.
 *   No cutoffs ⇒ status NEEDS_INPUT "Band thresholds not set" (no default cutoffs exist).
 * PUT /{companyId}/monitoring/bands {covenantKey, healthyUntil, moderateUntil[, direction]} — ADMIN or a
 *   workspace finance member sets cutoffs for a real, engine-flagged maintenance covenant.
 * Tenant gate first on both.
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { bandFor, cutoffsFor, directionOf, NOT_MAINTENANCE_REASON, validateCutoffOrder, withHistory, type RatioRowInput } from "@/lib/monitoring/bands";

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
  let user: { id: string; role?: string };
  try {
    user = await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Role: platform ADMIN or a finance member of this workspace (Reviewer N3).
  let member: boolean;
  try {
    member = user.role === "ADMIN" || (await prisma.workspaceFinanceMember.count({ where: { companyId, userId: user.id } })) > 0;
  } catch {
    return NextResponse.json({ error: "BANDS_UNAVAILABLE" }, { status: 503 });
  }
  if (!member) return NextResponse.json({ error: "FINANCE_ROLE_REQUIRED" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { covenantKey?: unknown; direction?: unknown; healthyUntil?: unknown; moderateUntil?: unknown };
  const covenantKey = typeof body.covenantKey === "string" ? body.covenantKey.trim() : "";
  if (!covenantKey || covenantKey.length > 300) return NextResponse.json({ error: "covenantKey required (per covenant)" }, { status: 400 });

  // The key must be a real covenant row the engine flags as a maintenance covenant; direction and
  // limit come from that row, never from the request body.
  let row: RatioRowInput | undefined;
  try {
    const { getCovenantOverview } = await import("@/lib/covenant-overview-service");
    const o = await getCovenantOverview(companyId);
    for (const fam of o.covenantFamilies) for (const r of fam.rows) if (r.kind === "RATIO" && r.stableKey === covenantKey) row = r;
  } catch {
    return NextResponse.json({ error: "COVENANTS_UNAVAILABLE", status: "NOT_DETERMINABLE" }, { status: 503 });
  }
  if (!row) return NextResponse.json({ error: "UNKNOWN_COVENANT" }, { status: 422 });
  if (row.testKind !== "MAINTENANCE") return NextResponse.json({ error: "NOT_A_MAINTENANCE_COVENANT", detail: NOT_MAINTENANCE_REASON }, { status: 422 });
  const direction = directionOf(row.comparisonDirection);
  if (body.direction !== undefined && body.direction !== direction) {
    return NextResponse.json({ error: `direction must be ${direction} for this covenant (from its own test)` }, { status: 422 });
  }
  const t = validateCutoffOrder(direction, body.healthyUntil, body.moderateUntil);
  if (!t || !cutoffsFor(row, { covenantKey, ...t })) {
    return NextResponse.json(
      { error: direction === "lower-is-safer" ? "Need 0 < healthyUntil < moderateUntil <= limit" : "Need healthyUntil > moderateUntil >= limit > 0" },
      { status: 422 },
    );
  }
  const saved = await prisma.covenantBandThreshold.upsert({
    where: { companyId_covenantKey: { companyId, covenantKey } },
    create: { companyId, covenantKey, ...t, updatedBy: user.id },
    update: { ...t, updatedBy: user.id },
  });
  return NextResponse.json({ covenantKey: saved.covenantKey, direction, healthyUntil: saved.healthyUntil, moderateUntil: saved.moderateUntil });
}
