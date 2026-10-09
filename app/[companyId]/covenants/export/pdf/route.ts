import { NextResponse } from "next/server";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { renderCovenantReviewPdf } from "@/lib/product/customer-intelligence/export-pdf";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params;
  if (!companyId?.trim()) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  const review = await loadCovenantReviewWorkspace(companyId);
  const body = renderCovenantReviewPdf(review);
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="headroom-covenant-review-${companyId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
