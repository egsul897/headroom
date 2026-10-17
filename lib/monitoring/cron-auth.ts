/**
 * Cron auth for the monitoring sweep: Authorization: Bearer <CRON_SECRET> only (Vercel Cron
 * sends exactly this), constant-time comparison, no ?secret= query (it leaks into logs).
 * CRON_SECRET unset ⇒ 503 fail closed. The shared lib/flywheel/auth.ts helper is left as is.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function assertMonitoringCronAuthorized(
  req: Request,
  env: Record<string, string | undefined> = process.env,
): { ok: true } | { ok: false; status: number; detail: string } {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return { ok: false, status: 503, detail: "CRON_SECRET unset — fail closed" };
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // Hash both sides so lengths match and timingSafeEqual never throws.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  if (!provided || !timingSafeEqual(a, b)) return { ok: false, status: 401, detail: "unauthorized" };
  return { ok: true };
}
