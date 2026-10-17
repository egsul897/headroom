import { NextResponse } from "next/server";
import { latestEbitdaBox } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { ebitdaBoxStore, refreshEbitdaBox } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-server";

type Ctx = { params: Promise<{ companyId: string; documentId: string }> };

/** Latest EBITDA box for an uploaded agreement. ?refresh=1 recomputes (filings + stored CFO confirmations) first. */
export async function GET(req: Request, ctx: Ctx) {
  const { companyId, documentId } = await ctx.params;
  if (new URL(req.url).searchParams.get("refresh") === "1") {
    const r = await refreshEbitdaBox(companyId, documentId);
    if (!r) return NextResponse.json({ error: "document not found for this company" }, { status: 404 });
    return NextResponse.json({ ...r.box, id: r.id });
  }
  const box = await latestEbitdaBox(ebitdaBoxStore(), { companyId, documentId });
  if (!box) return NextResponse.json({ error: "no EBITDA box yet for this document" }, { status: 404 });
  return NextResponse.json(box);
}
