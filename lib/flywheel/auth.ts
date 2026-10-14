/**
 * Fail-closed cron auth. Route handlers must call this before any work.
 */

export function assertCronAuthorized(
  req: Request,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): { ok: true } | { ok: false; status: number; detail: string } {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false, status: 503, detail: "CRON_SECRET unset — fail closed" };
  }
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const query =
    typeof URL !== "undefined"
      ? new URL(req.url).searchParams.get("secret")?.trim() ?? ""
      : "";
  const provided = bearer || query;
  if (!provided || provided !== secret) {
    return { ok: false, status: 401, detail: "unauthorized" };
  }
  return { ok: true };
}
