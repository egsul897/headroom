import { NextResponse } from "next/server";
import { handleEbitdaGet } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-api";
import { ebitdaApiDeps } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-server";

type Ctx = { params: Promise<{ companyId: string; documentId: string }> };

/** Latest EBITDA box for an uploaded agreement (tenant-gated read). ?refresh=1 recomputes and requires an authenticated, authorized principal. */
export async function GET(req: Request, ctx: Ctx) {
  const r = await handleEbitdaGet(ebitdaApiDeps(), req, await ctx.params);
  return NextResponse.json(r.body, { status: r.status });
}
