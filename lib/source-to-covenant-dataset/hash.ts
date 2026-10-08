import { createHash } from "crypto";

/** Stable SHA-256 of UTF-8 text — used for source windows and fixture identity. */
export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Normalize legal text for near-duplicate comparison only.
 * Does NOT alter stored exact text — hashing of records uses raw windows.
 */
export function normalizeForNearDuplicate(text: string): string {
  return text
    .toLowerCase()
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9$%:.\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sha256NormalizedWindow(text: string): string {
  return sha256Text(normalizeForNearDuplicate(text));
}

/** Token Jaccard similarity on normalized windows — deterministic, no model. */
export function jaccardSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeForNearDuplicate(a).split(" ").filter((t) => t.length > 2));
  const tb = new Set(normalizeForNearDuplicate(b).split(" ").filter((t) => t.length > 2));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return inter / union;
}
