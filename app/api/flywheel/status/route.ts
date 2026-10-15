/**
 * Ops status for the standalone flywheel.
 * Optional CRON_SECRET: when set, require it; when unset, read-only is open
 * but still never exposes connection strings.
 */

import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/flywheel/auth";
import { getFlywheelStatus } from "@/lib/flywheel/status";
import {
  createNeonHttpsExecutor,
  redactConnectionSecrets,
} from "@/lib/covenant-learning-factory/store/neon-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // If CRON_SECRET is configured, require it for status too (fail closed on bad secret).
  if (process.env.CRON_SECRET?.trim()) {
    const auth = assertCronAuthorized(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, detail: auth.detail }, { status: auth.status });
    }
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ ok: false, detail: "DATABASE_URL unset" }, { status: 503 });
  }
  if (!process.env.NEON_TRANSPORT) {
    process.env.NEON_TRANSPORT = "https";
  }

  try {
    const executor = await createNeonHttpsExecutor(url);
    const status = await getFlywheelStatus(executor);
    return NextResponse.json({ ok: true, status });
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
