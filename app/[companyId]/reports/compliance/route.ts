/**
 * GET /{companyId}/reports/compliance?format=json|csv|pdf[&asOf=YYYY-MM-DD]
 * CFO compliance & capacity report built on the existing covenant overview.
 * Tenant gate first (route handlers do not run the [companyId] layout
 * guard — same rule as the covenant export routes, 35f687d3): 403, no data.
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { loadComplianceReport } from "@/lib/reports/load";
import { renderComplianceCsv } from "@/lib/reports/render-csv";
import { renderComplianceReportPdf } from "@/lib/reports/render-pdf";
import { parseAsOf } from "@/lib/reports/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params;
  if (!companyId?.trim()) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const asOf = parseAsOf(url.searchParams.get("asOf"));
  if (asOf === "INVALID") return NextResponse.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  const report = await loadComplianceReport(companyId, asOf ?? undefined);
  const stem = `headroom-compliance-${companyId}-${report.asOfDate ?? "not-determinable"}`;
  const headers = { "Cache-Control": "no-store" };
  if (format === "csv") {
    return new NextResponse(renderComplianceCsv(report), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${stem}.csv"` },
    });
  }
  if (format === "pdf") {
    return new NextResponse(new Uint8Array(renderComplianceReportPdf(report)), {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${stem}.pdf"` },
    });
  }
  if (format !== "json") return NextResponse.json({ error: "format must be json, csv or pdf" }, { status: 400 });
  return NextResponse.json(report, { headers });
}
