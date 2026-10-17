import { NextResponse } from "next/server";
import { handleEbitdaPropose } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { ebitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-server";

type Ctx = { params: Promise<{ companyId: string; documentId: string }> };

/**
 * CFO proposes a new add-back item, or edits one by re-proposing the same label (authenticated; proposedBy is the
 * session principal): { label, value (non-negative integer USD), source, sourceKind, sourceRef?, idempotencyKey? }
 * (or an Idempotency-Key header). Appended to Neon; the box is recomputed and returned. A proposal never counts
 * toward EBITDA by itself: it counts only if its label maps to a permitted category in this agreement's EBITDA
 * definition and the amount is then confirmed via ../confirm.
 */
export async function POST(req: Request, ctx: Ctx) {
  const r = await handleEbitdaPropose(ebitdaApiDeps(), req, await ctx.params);
  return NextResponse.json(r.body, { status: r.status });
}
