/**
 * Neon suspends compute after about five minutes. Prisma 5's default
 * `connect_timeout` is 5 seconds, so the first homepage query loses the
 * race and throws PrismaClientInitializationError ("Can't reach database
 * server"). These parameters are appended only when the deployed
 * DATABASE_URL does not already set them — Vercel env vars are not changed.
 *
 * Applied when absent:
 * - connect_timeout=20 — wait long enough for a cold compute to accept TCP
 * - pool_timeout=20 — Prisma's pool wait must not be shorter than connect
 * - pgbouncer=true — Neon pooler hosts (`-pooler` in the endpoint) speak
 *   PgBouncer transaction mode; Prisma must disable prepared statements
 * - connection_limit=1 — only when VERCEL=1 and the URL is pooled, so a
 *   serverless instance does not open a multi-connection pool
 */

export const COLD_START_CONNECT_TIMEOUT_SECONDS = "20";
export const COLD_START_POOL_TIMEOUT_SECONDS = "20";

const PARAM = (key: string) => new RegExp(`(?:^|[?&])${key}=([^&#]*)`, "i");

export function databaseHostname(connectionString: string): string {
  const withoutProto = connectionString.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const at = withoutProto.lastIndexOf("@");
  const hostAndRest = at >= 0 ? withoutProto.slice(at + 1) : withoutProto;
  const hostPort = hostAndRest.split(/[/?]/)[0] ?? "";
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    return end >= 0 ? hostPort.slice(1, end) : hostPort;
  }
  return hostPort.split(":")[0] ?? "";
}

/** Neon pooled endpoints look like `ep-floral-forest-…-pooler….neon.tech`. */
export function isPooledDatabaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.includes("-pooler") || host.startsWith("pooler.") || host.includes(".pooler.");
}

function paramValue(url: string, key: string): string | undefined {
  const match = PARAM(key).exec(url);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function appendParam(url: string, key: string, value: string): string {
  if (paramValue(url, key) !== undefined) return url;
  const hash = url.indexOf("#");
  const base = hash >= 0 ? url.slice(0, hash) : url;
  const frag = hash >= 0 ? url.slice(hash) : "";
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}${key}=${value}${frag}`;
}

export function augmentDatabaseUrl(connectionString: string, options?: { serverless?: boolean }): string {
  let next = appendParam(connectionString, "connect_timeout", COLD_START_CONNECT_TIMEOUT_SECONDS);
  next = appendParam(next, "pool_timeout", COLD_START_POOL_TIMEOUT_SECONDS);
  const pooled = isPooledDatabaseHost(databaseHostname(connectionString)) || paramValue(connectionString, "pgbouncer") === "true";
  if (pooled) {
    next = appendParam(next, "pgbouncer", "true");
    if (options?.serverless) next = appendParam(next, "connection_limit", "1");
  }
  return next;
}

/** Undefined when DATABASE_URL is unset, so Prisma keeps its env-based error. */
export function resolvePrismaDatasourceUrl(raw: string | undefined, env?: { VERCEL?: string }): string | undefined {
  if (!raw) return undefined;
  const vercel = env ? env.VERCEL : process.env.VERCEL;
  return augmentDatabaseUrl(raw, { serverless: vercel === "1" });
}
