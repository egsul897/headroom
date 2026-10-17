/**
 * Env-gated error tracking (Sentry-compatible envelope protocol, no SDK).
 *
 * OFF unless `HEADROOM_ERROR_DSN` (or `SENTRY_DSN`) is set to a valid
 * Sentry-style DSN (`https://<publicKey>@<host>/<projectId>`). When off, or
 * when the DSN is malformed, every call is a no-op that returns
 * `{ sent: false, reason }` — it never throws, never blocks the caller's
 * own error handling, and never invents a destination.
 *
 * Payloads are STRUCTURAL ONLY. Error messages and stack text in this app can
 * quote agreement language, borrower figures or connection strings, so none of
 * that free text leaves the process. An event carries: the error class name,
 * a fingerprint (sha256 prefix) of the message, stack frame locations
 * (function identifier, repo-relative file, line, column), the `where` label
 * and allowlisted tags (short identifier-like keys and values; anything else is
 * dropped). There is no free-form `extra`.
 *
 * No AI, no paid inference — plain HTTPS POST to whatever DSN the operator
 * configured.
 */

import { createHash } from "node:crypto";

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

/** The configured DSN string: HEADROOM_ERROR_DSN, else SENTRY_DSN. An empty/blank value counts as unset. */
export function configuredDsn(env: Env = process.env): string | null {
  for (const v of [env.HEADROOM_ERROR_DSN, env.SENTRY_DSN]) if (v && v.trim()) return v.trim();
  return null;
}

export function resolveErrorTrackingDsn(env: Env = process.env): ParsedDsn | null {
  return parseDsn(configuredDsn(env));
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

function randomEventId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CaptureContext {
  /** Short stable label for where the error happened, e.g. "upload.deferred-analysis". Must be identifier-like. */
  where: string;
  /** Structural tags only; keys/values that are not short identifier-like strings are dropped. */
  tags?: Record<string, string>;
}

export interface StackFrameLocation {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
}

const TAG_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,31}$/;
const TAG_VALUE = /^[A-Za-z0-9_.:-]{1,64}$/;
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$.<>]{0,99}$/;

/** sha256 prefix of the message: lets identical errors group without shipping their text. */
export function messageFingerprint(message: string): string {
  return createHash("sha256").update(message).digest("hex").slice(0, 16);
}

/** Keep only identifier-like tags (structural context); everything else is dropped, not scrubbed. */
export function structuralTags(where: string, tags: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = { where: TAG_VALUE.test(where) ? where : "invalid-where" };
  for (const [k, v] of Object.entries(tags).slice(0, 20)) {
    if (k === "where") continue;
    if (TAG_KEY.test(k) && typeof v === "string" && TAG_VALUE.test(v)) out[k] = v;
  }
  return out;
}

/**
 * Stack frame LOCATIONS from a V8 stack: function identifier, file (repo-relative when possible), line, column.
 * The header line (which repeats the message) and any frame that does not parse are dropped.
 */
export function stackFrameLocations(stack: string | undefined, message = "", cwd: string = process.cwd()): StackFrameLocation[] {
  if (!stack) return [];
  const frames: StackFrameLocation[] = [];
  // V8's header is "<name>: <message>"; skip every line the message spans so message text shaped like a frame is never parsed.
  const headerLines = message.split("\n").length;
  for (const line of stack.split("\n").slice(headerLines)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const [, fn, rawFile, ln, col] = m;
    let file = (rawFile ?? "").replace(/^file:\/\//, "");
    if (file.startsWith(cwd + "/")) file = file.slice(cwd.length + 1);
    const nm = file.lastIndexOf("node_modules/");
    if (nm >= 0) file = file.slice(nm);
    if (!/^[A-Za-z0-9_.\/@:\-[\]()]{1,300}$/.test(file)) file = "[unrecognised-path]";
    const frame: StackFrameLocation = { filename: file, lineno: Number(ln), colno: Number(col) };
    const name = fn?.replace(/^async /, "").replace(/^new /, "");
    if (name && IDENT.test(name)) frame.function = name;
    frames.push(frame);
    if (frames.length >= 50) break;
  }
  // Sentry wants innermost frame last.
  return frames.reverse();
}

function errorTypeName(err: unknown): string {
  if (err instanceof Error) return IDENT.test(err.name || "") ? err.name : "Error";
  return `NonError:${typeof err}`;
}

export function buildEnvelope(err: unknown, ctx: CaptureContext, dsn: ParsedDsn, eventId: string, now = new Date()): string {
  const message = err instanceof Error ? String(err.message ?? "") : "";
  const fingerprint = messageFingerprint(message);
  const type = errorTypeName(err);
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    tags: structuralTags(ctx.where, ctx.tags),
    fingerprint: [type, fingerprint],
    exception: {
      values: [
        {
          type,
          // Message text withheld (may quote agreement text / figures / secrets); only its fingerprint and length go out.
          value: `[message withheld] fp=${fingerprint} len=${message.length}`,
          stacktrace: err instanceof Error ? { frames: stackFrameLocations(err.stack, message) } : undefined,
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
  const raw = configuredDsn(env);
  if (!raw) return { sent: false, reason: "DISABLED" };
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
