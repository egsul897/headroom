import { NextResponse } from "next/server";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { renderCovenantReviewHtml } from "@/lib/product/customer-intelligence/export-docx";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params;
  if (!companyId?.trim()) return NextResponse.json({ error: "companyId required" }, { status: 400 });
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
