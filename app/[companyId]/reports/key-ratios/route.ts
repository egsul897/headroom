/** GET /{companyId}/reports/key-ratios[?asOf=YYYY-MM-DD] — #414 KeyRatioModel[]. Tenant gate first. */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { parseAsOf } from "@/lib/reports/params";
import { buildKeyRatios, type RatioRowLike } from "@/lib/reports/key-ratios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params;
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const asOf = parseAsOf(new URL(req.url).searchParams.get("asOf"));
  if (asOf === "INVALID") return NextResponse.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  const [{ getCompanyDashboard }, { getCovenantOverview }] = await Promise.all([import("@/lib/dashboard-service"), import("@/lib/covenant-overview-service")]);
  const [dash, overview] = await Promise.allSettled([getCompanyDashboard(companyId, asOf ?? undefined), getCovenantOverview(companyId, asOf ?? undefined)]);
  const metrics = dash.status === "fulfilled" ? dash.value.financialPosition.metrics : null;
  const rows: RatioRowLike[] = [];
  if (overview.status === "fulfilled") for (const f of overview.value.covenantFamilies) for (const r of f.rows) if (r.kind === "RATIO") rows.push(r);
  return NextResponse.json(
    {
      companyId,
      status: metrics || rows.length ? "OK" : "NOT_DETERMINABLE",
      positionLoaded: metrics !== null,
      covenantsLoaded: overview.status === "fulfilled",
      keyRatios: buildKeyRatios(metrics, rows),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
