import { NextResponse } from "next/server";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { renderCovenantReviewMarkdown } from "@/lib/product/customer-intelligence/export-review";

export const dynamic = "force-dynamic";

/** Downloadable markdown covenant review from the same persisted analyses as the UI. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await ctx.params;
  if (!companyId?.trim()) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const review = await loadCovenantReviewWorkspace(companyId);
  const body = renderCovenantReviewMarkdown(review);
  const filename = `headroom-covenant-review-${companyId}.md`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
