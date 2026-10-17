/**
 * Env-gated error tracking (Sentry-compatible envelope protocol, no SDK).
 *
 * OFF unless `HEADROOM_ERROR_DSN` (or `SENTRY_DSN`) is set to a valid
 * Sentry-style DSN (`https://<publicKey>@<host>/<projectId>`). When off, or
 * when the DSN is malformed, every call is a no-op that returns
 * `{ sent: false, reason }` — it never throws, never blocks the caller's
 * own error handling, and never invents a destination.
 *
 * Payloads are scrubbed before they leave the process: database connection
 * strings, bearer tokens, and `key=value` secrets are redacted, so a Neon
 * URL inside an error message is never shipped to a third party.
 *
 * No AI, no paid inference — plain HTTPS POST to whatever DSN the operator
 * configured.
 */

export interface ParsedDsn {
  publicKey: string;
  host: string;
  protocol: "https:" | "http:";
  projectId: string;
  pathPrefix: string;
}

export type CaptureResult =
  | { sent: true; eventId: string }
  | { sent: false; reason: "DISABLED" | "INVALID_DSN" | "TRANSPORT_ERROR" };

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

export function parseDsn(dsn: string | undefined | null): ParsedDsn | null {
  if (!dsn || !dsn.trim()) return null;
  let u: URL;
  try {
    u = new URL(dsn.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.username) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const projectId = parts.pop();
  if (!projectId || !/^\d+$/.test(projectId)) return null;
  return {
    publicKey: decodeURIComponent(u.username),
    host: u.host,
    protocol: u.protocol,
    projectId,
    pathPrefix: parts.length ? `/${parts.join("/")}` : "",
  };
}

export function resolveErrorTrackingDsn(env: Env = process.env): ParsedDsn | null {
  return parseDsn(env.HEADROOM_ERROR_DSN ?? env.SENTRY_DSN);
}

export function isErrorTrackingEnabled(env: Env = process.env): boolean {
  return resolveErrorTrackingDsn(env) !== null;
}

/** Redact credentials and tokens from free text before it leaves the process. */
export function scrubSecrets(text: string): string {
  return text
    .replace(/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s'"]+/gi, "$1://[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/\b(sk|pk|rk|whsec)_(live|test)_[A-Za-z0-9]+/g, "$1_$2_[REDACTED]")
    .replace(/\b((?:api[_-]?key|token|secret|password|passwd|pwd)\s*[=:]\s*)[^\s&'",;]+/gi, "$1[REDACTED]");
}

function scrubValue(v: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof v === "string") return scrubSecrets(v).slice(0, 4000);
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => scrubValue(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 50)) {
      out[k] = /secret|password|token|authorization|cookie|dsn|database_url/i.test(k) ? "[REDACTED]" : scrubValue(val, depth + 1);
    }
    return out;
  }
  return v;
}

function randomEventId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CaptureContext {
  /** Short stable label for where the error happened, e.g. "upload.deferred-analysis". */
  where: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export function buildEnvelope(err: unknown, ctx: CaptureContext, dsn: ParsedDsn, eventId: string, now = new Date()): string {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(scrubValue(err)));
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    tags: { where: ctx.where, ...(ctx.tags ?? {}) },
    extra: scrubValue(ctx.extra ?? {}),
    exception: {
      values: [
        {
          type: e.name || "Error",
          value: scrubSecrets(e.message ?? "").slice(0, 2000),
          stacktrace: e.stack ? { frames: [{ filename: "stack", function: scrubSecrets(e.stack).slice(0, 4000) }] } : undefined,
        },
      ],
    },
  };
  const header = { event_id: eventId, sent_at: now.toISOString(), dsn: `${dsn.protocol}//${dsn.publicKey}@${dsn.host}${dsn.pathPrefix}/${dsn.projectId}` };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
}

/**
 * Report an error. Never throws. Resolves `{ sent: false, reason: "DISABLED" }`
 * when no DSN is configured.
 */
export async function captureError(
  err: unknown,
  ctx: CaptureContext,
  opts: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<CaptureResult> {
  const env = opts.env ?? process.env;
  const raw = env.HEADROOM_ERROR_DSN ?? env.SENTRY_DSN;
  if (!raw || !raw.trim()) return { sent: false, reason: "DISABLED" };
  const dsn = parseDsn(raw);
  if (!dsn) return { sent: false, reason: "INVALID_DSN" };
  const eventId = randomEventId();
  const url = `${dsn.protocol}//${dsn.host}${dsn.pathPrefix}/api/${dsn.projectId}/envelope/`;
  try {
    const f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    const res = await f(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=headroom/1.0`,
      },
      body: buildEnvelope(err, ctx, dsn, eventId),
    });
    if (!res.ok) return { sent: false, reason: "TRANSPORT_ERROR" };
    return { sent: true, eventId };
  } catch {
    return { sent: false, reason: "TRANSPORT_ERROR" };
  }
}
