/**
 * Content-addressed hashing for institutional persistence artifacts.
 * Reuses the same sha256 discipline as connectors/dedup and compiler hashing.
 */
import { createHash } from "node:crypto";

/** Stable JSON stringify with sorted object keys (arrays preserve order). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

export function contentHashOf(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function fingerprintParts(parts: Record<string, string | null | undefined>): string {
  return contentHashOf(parts);
}
