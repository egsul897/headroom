/**
 * Stripe webhook signature verification (Stripe-Signature: t=…,v1=…).
 * HMAC-SHA256 over `${t}.${rawBody}` with the endpoint secret, constant-time
 * compare, timestamp tolerance (default 300 s). No SDK.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureResult = { ok: true; timestamp: number } | { ok: false; reason: "MISSING_HEADER" | "MALFORMED_HEADER" | "TIMESTAMP_OUT_OF_TOLERANCE" | "SIGNATURE_MISMATCH" };

export function signStripePayload(rawBody: string, secret: string, timestamp: number): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  opts: { toleranceSec?: number; nowSec?: number } = {},
): SignatureResult {
  if (!header) return { ok: false, reason: "MISSING_HEADER" };
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x?.trim());
    if (k === "t" && v && /^\d+$/.test(v)) t = Number(v);
    else if (k === "v1" && v && /^[0-9a-f]{64}$/.test(v)) v1.push(v);
  }
  if (t === null || v1.length === 0) return { ok: false, reason: "MALFORMED_HEADER" };
  const tolerance = opts.toleranceSec ?? 300;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > tolerance) return { ok: false, reason: "TIMESTAMP_OUT_OF_TOLERANCE" };
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex"), "utf8");
  for (const candidate of v1) {
    const b = Buffer.from(candidate, "utf8");
    if (b.length === expected.length && timingSafeEqual(b, expected)) return { ok: true, timestamp: t };
  }
  return { ok: false, reason: "SIGNATURE_MISMATCH" };
}
