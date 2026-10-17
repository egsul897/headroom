import { NextResponse } from "next/server";
import { confirmEbitdaItem } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { ebitdaBoxStore, pipelineArgsFor } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-server";

type Ctx = { params: Promise<{ companyId: string; documentId: string }> };

/**
 * CFO confirms an add-back figure: { inputKey, value (integer USD), source (document it comes from), confirmedBy? }.
 * Persisted to Neon; the box is recomputed with every confirmation and returned with this item's capacity gain.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { companyId, documentId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { inputKey?: string; value?: string | number; source?: string; confirmedBy?: string } | null;
  if (!body) return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  const value = typeof body.value === "number" ? (Number.isSafeInteger(body.value) ? String(body.value) : "") : String(body.value ?? "");
  const args = await pipelineArgsFor(companyId, documentId);
  if (!args) return NextResponse.json({ error: "document not found for this company" }, { status: 404 });
  const out = await confirmEbitdaItem(ebitdaBoxStore(), { companyId, documentId }, args, { inputKey: String(body.inputKey ?? ""), value, source: String(body.source ?? ""), confirmedBy: body.confirmedBy ?? null });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ id: out.boxId, box: out.box, gain: out.gain });
}
