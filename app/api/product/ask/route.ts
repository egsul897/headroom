import { NextResponse } from "next/server";
import { analyzeAskForSimulate } from "@/lib/product/unified-customer";

export const dynamic = "force-dynamic";

/**
 * Unified Ask transaction endpoint — returns structured handoff for Simulate
 * plus North-Star gated analysis. Corpus research remains on POST /api/ask.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    companyId?: string;
    question?: string;
    sourceId?: string;
    confirmed?: boolean;
  };
  if (!body.companyId?.trim()) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  if (!body.question?.trim()) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  const result = await analyzeAskForSimulate({
    companyId: body.companyId.trim(),
    question: body.question,
    sourceId: body.sourceId,
    confirmed: body.confirmed === true,
  });
  return NextResponse.json(result);
}
