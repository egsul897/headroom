import { NextResponse } from "next/server";
import { loadPositionView } from "@/lib/product/unified-customer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId")?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const evaluationDate = url.searchParams.get("date");
  const view = await loadPositionView(companyId, { evaluationDate });
  return NextResponse.json(view);
}
