import { NextResponse } from "next/server";
import {
  runUnifiedSimulation,
  type SimulateRequest,
  type StructuredTransactionKind,
} from "@/lib/product/unified-customer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<SimulateRequest>;
  if (!body.companyId?.trim()) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  if (body.amountMillions == null || !Number.isFinite(Number(body.amountMillions))) {
    return NextResponse.json({ error: "amountMillions required" }, { status: 400 });
  }
  const kind = (body.kind ?? "SECURED_DEBT") as StructuredTransactionKind;
  const result = await runUnifiedSimulation({
    companyId: body.companyId.trim(),
    kind,
    amountMillions: Number(body.amountMillions),
    secured: body.secured ?? null,
    evaluationDate: body.evaluationDate ?? null,
    documentId: body.documentId ?? null,
    currency: body.currency ?? "USD",
    reinvest: body.reinvest,
    expectedStateFingerprint: body.expectedStateFingerprint ?? null,
    priorRequestFingerprint: body.priorRequestFingerprint ?? null,
  });
  return NextResponse.json(result);
}
