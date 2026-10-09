import { NextResponse } from "next/server";
import { analyzeContemplatedTransaction } from "@/lib/product/north-star-workflow";

/**
 * Structured transaction-analysis endpoint (North-Star gated).
 * Corpus research remains on POST /api/ask.
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
  const result = await analyzeContemplatedTransaction({
    companyId: body.companyId.trim(),
    question: body.question ?? "",
    sourceId: body.sourceId,
    confirmed: body.confirmed === true,
    verifiedPackage: null,
  });
  return NextResponse.json(result);
}
