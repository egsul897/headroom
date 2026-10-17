import { NextResponse } from "next/server";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { renderCovenantReviewHtml } from "@/lib/product/customer-intelligence/export-docx";
import { requireTenantAction } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params;
  if (!companyId?.trim()) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  // Rule 94: route handlers do NOT run the [companyId] layout
  // guard — without this, the export was downloadable by anyone
  // who knew a companyId. Fail closed with 403, no data.
  try {
    await requireTenantAction(companyId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const review = await loadCovenantReviewWorkspace(companyId);
  const body = renderCovenantReviewHtml(review);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="headroom-covenant-review-${companyId}.html"`,
      "Cache-Control": "no-store",
    },
  });
}
