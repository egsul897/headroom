import { NextResponse } from "next/server";
import { answerAsk } from "@/lib/ask/shell-runner";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    companyId?: string;
    question?: string;
    sourceId?: string;
  };
  const result = await answerAsk({
    companyId: body.companyId,
    question: body.question ?? "",
    sourceId: body.sourceId,
  });
  return NextResponse.json(result);
}
