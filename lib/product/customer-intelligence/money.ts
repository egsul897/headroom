/**
 * Pure money parsing for the counsel-compile path (accepted items
 * become executable Permissions that drive capacity). Kept free of
 * prisma imports so it is unit-testable in isolation.
 */

/**
 * Parse a dollar amount from text into $M (millions). Units:
 * million → as-is; billion → ×1000; thousand → ÷1000. A BARE
 * amount (no unit) is raw dollars → ÷1e6, never assumed millions:
 * "$5,000" is $0.005M, not $5,000M. A missing unit must never be
 * read as "million" (the #391 unit-loss lesson).
 */
export function parseMoneyMillions(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|thousand)?/i);
  if (!m) return null;
  let n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (/billion/i.test(m[2] ?? "")) n *= 1000;
  else if (/thousand/i.test(m[2] ?? "")) n /= 1000;
  else if (!m[2]) n /= 1_000_000; // bare = raw dollars
  return n;
}

/**
 * Parse the grower % attached to a base: "10.0% of Consolidated
 * EBITDA" → 0.10, "7.5% of Total Assets" → 0.075. The old code took
 * the FIRST % anywhere in the text, so an unrelated "50% ownership"
 * in the same section became the greater-of grower instead of the
 * true "10% of EBITDA". The % must be the one modifying the base.
 */
export function parsePctOf(text: string, base: "EBITDA" | "TOTAL_ASSETS"): number | null {
  const re =
    base === "EBITDA"
      ? /(\d+(?:\.\d+)?)\s*%\s*of\s+(?:[A-Za-z]+\s+){0,2}EBITDA/i
      : /(\d+(?:\.\d+)?)\s*%\s*of\s+(?:[A-Za-z]+\s+){0,2}Total\s+Assets/i;
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]) / 100;
  return Number.isFinite(n) ? n : null;
}
