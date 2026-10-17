/**
 * Neon DATABASE_URL helpers for Cloud Agent / dual-stack hosts.
 *
 * Prisma's Rust engine does not honor Node's `--dns-result-order=ipv4first`.
 * On dual-stack Neon endpoints it can fail with P1001 (IPv6) while node-pg
 * reaches auth over IPv4. Force an A-record host + sslaccept so auth errors
 * surface as P1010/28P01 instead of a false "unreachable".
 */

import dns from "node:dns/promises";

export type NeonProbeClass =
  | "unset"
  | "live"
  | "auth_failed"
  | "unreachable"
  | "error";

export function classifyNeonProbeError(message: string): NeonProbeClass {
  const m = message.toLowerCase();
  if (
    m.includes("28p01") ||
    m.includes("password authentication failed") ||
    m.includes("p1010") ||
    m.includes("was denied access") ||
    m.includes("authentication failed")
  ) {
    return "auth_failed";
  }
  if (
    m.includes("p1001") ||
    m.includes("can't reach database server") ||
    m.includes("cannot reach database server") ||
    m.includes("econnrefused") ||
    m.includes("etimedout") ||
    m.includes("enotfound")
  ) {
    return "unreachable";
  }
  return "error";
}

/**
 * Rewrite DATABASE_URL for Prisma on dual-stack Neon hosts.
 * Strips channel_binding (often unhelpful for Prisma), forces IPv4 host,
 * and relaxes cert name checks that break when connecting by address.
 */
export async function resolveNeonDatabaseUrlForPrisma(
  databaseUrl: string,
): Promise<{ url: string; ipv4: string | null; originalHost: string }> {
  const u = new URL(databaseUrl);
  const originalHost = u.hostname;
  u.searchParams.delete("channel_binding");
  if (!u.searchParams.has("sslmode")) {
    u.searchParams.set("sslmode", "require");
  }
  if (!u.searchParams.has("connect_timeout")) {
    u.searchParams.set("connect_timeout", "15");
  }

  let ipv4: string | null = null;
  try {
    const looked = await dns.lookup(originalHost, { family: 4 });
    ipv4 = looked.address;
    u.hostname = ipv4;
    // Cert is issued for *.neon.tech; IP host requires accept_invalid_certs for Prisma.
    u.searchParams.set("sslaccept", "accept_invalid_certs");
  } catch {
    // DNS failed — leave hostname unchanged.
  }

  return { url: u.toString(), ipv4, originalHost };
}
