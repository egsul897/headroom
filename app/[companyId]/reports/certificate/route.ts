/**
 * GET /{companyId}/reports/certificate[?asOf=YYYY-MM-DD]
 * Certificate payload (#414 CertificateModel): period, required vs actual, headroom, PASS/FAIL else NOT EVALUATED, citation.
 * Tenant gate first; 403 with no data on failure.
 */
import { NextResponse } from "next/server";
import { requireTenantAction } from "@/lib/auth/guard";
import { loadComplianceReport } from "@/lib/reports/load";
import { toCertificateModel } from "@/lib/reports/build";
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
  const asOf = parseAsOf(new URL(req.url).searchParams.get("asOf"));
  if (asOf === "INVALID") return NextResponse.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  const r = await loadComplianceReport(companyId, asOf ?? undefined);
  return NextResponse.json(
    {
      companyId: r.companyId,
      asOfDate: r.asOfDate,
      status: r.status,
      blocker: r.blocker,
      authority: r.authority,
      disclaimer: r.disclaimer,
      /** #414 CertificateModel (strings, evaluated PASS/FAIL/null). */
      certificate: toCertificateModel(r),
      /** Numeric rows with status/reviewState/reason for audit. */
      rows: r.certificate,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
