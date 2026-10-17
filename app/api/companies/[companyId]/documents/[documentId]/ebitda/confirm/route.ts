import { NextResponse } from "next/server";
import { handleEbitdaConfirm } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { ebitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-server";

type Ctx = { params: Promise<{ companyId: string; documentId: string }> };

/**
 * CFO confirms an add-back (authenticated; confirmedBy is the session principal):
 * { inputKey, value (non-negative integer USD), source, sourceKind?, sourceRef?,
 *   kind?: "AMOUNT" | "LENDER_APPROVAL", idempotencyKey? }
 * (or an Idempotency-Key header). sourceKind names the evidence behind the figure (SEC_FILING |
 * OFFICERS_CERTIFICATE | ERP | CFO_ENTERED, default CFO_ENTERED); sourceRef identifies it (filing accession,
 * certificate date/period, ERP reference). Appended to Neon; the box is recomputed and returned with the gain.
 */
export async function POST(req: Request, ctx: Ctx) {
  const r = await handleEbitdaConfirm(ebitdaApiDeps(), req, await ctx.params);
  return NextResponse.json(r.body, { status: r.status });
}
