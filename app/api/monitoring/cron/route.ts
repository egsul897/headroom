/**
 * Vercel Cron entrypoint for filings monitoring + covenant band alerts.
 * CRON_SECRET-protected (fail closed). ZERO AI/LLM usage. HEADROOM_MONITORING=0 disables.
 */
import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/flywheel/auth";
import { prisma } from "@/lib/prisma";
import { createPrismaMonitoringDeps } from "@/lib/monitoring/prisma-deps";
import { runMonitoringSweep } from "@/lib/monitoring/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request): Promise<Response> {
  const auth = assertCronAuthorized(req);
  if (!auth.ok) return NextResponse.json({ ok: false, detail: auth.detail }, { status: auth.status });
  if (process.env.HEADROOM_MONITORING === "0") return NextResponse.json({ ok: true, skipped: "HEADROOM_MONITORING=0" });
  try {
    const results = await runMonitoringSweep(createPrismaMonitoringDeps(prisma));
    return NextResponse.json({ ok: true, companies: results.length, results, paidInferenceUsed: false });
  } catch (err) {
    return NextResponse.json({ ok: false, detail: err instanceof Error ? err.name : "error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
