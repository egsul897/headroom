/**
 * Vercel Cron / GitHub Actions entrypoint for the standalone Headroom flywheel.
 * Protected by CRON_SECRET.
 *
 * ZERO AI/LLM API usage — fully deterministic code only.
 * No OpenAI/Anthropic/xAI/Vercel AI SDK. No AI API key required.
 *
 * Schedule (vercel.json): every 15 minutes.
 */

import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/flywheel/auth";
import {
  assertFlywheelDeterministic,
  FLYWHEEL_PAID_INFERENCE,
} from "@/lib/flywheel/deterministic-guard";
import { runFlywheelSlice } from "@/lib/flywheel/slice-runner";
import {
  createNeonHttpsExecutor,
  getNeonTransportMode,
  redactConnectionSecrets,
} from "@/lib/covenant-learning-factory/store/neon-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request): Promise<Response> {
  const auth = assertCronAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, detail: auth.detail }, { status: auth.status });
  }

  try {
    assertFlywheelDeterministic(process.env);
  } catch (err) {
    return NextResponse.json(
      { ok: false, detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ ok: false, detail: "DATABASE_URL unset" }, { status: 503 });
  }

  // Prefer HTTPS on serverless (no TCP 5432 dependency).
  if (!process.env.NEON_TRANSPORT) {
    process.env.NEON_TRANSPORT = "https";
  }

  const forced = new URL(req.url).searchParams.get("slice");

  try {
    const executor = await createNeonHttpsExecutor(url);
    const result = await runFlywheelSlice({
      executor,
      slice: forced,
    });
    return NextResponse.json({
      ok: result.status === "OK" || result.status === "SKIPPED_LOCKED" || result.status === "SKIPPED_CONFIG",
      transport: getNeonTransportMode(),
      result,
      paidInferenceUsed: FLYWHEEL_PAID_INFERENCE,
      authorityStatus: "COMPUTED_NOT_CERTIFIED",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        detail: redactConnectionSecrets(
          err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400),
        ),
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}
