/**
 * Pure money parsing for the counsel-compile path (accepted items
 * become executable Permissions that drive capacity). Kept free of
 * prisma imports so it is unit-testable in isolation.
 */

/**
 * Parse a dollar amount from text into $M (millions). Units:
 * million → as-is; billion → ×1000; thousand → ÷1000. The
 * unambiguous abbreviations the codebase's contract-model
 * parsers already accept (semantic-verification SCALE_MULTIPLIERS)
 * count too: mm = million, bn = billion — "$30MM" is $30M, and
 * dropping the suffix would misread it as bare $30 (the P4
 * unit-misread class). A bare "M"/"k" is NOT accepted (ambiguous).
 * A BARE amount (no unit) is raw dollars → ÷1e6, never assumed
 * millions: "$5,000" is $0.005M, not $5,000M. A missing unit must
 * never be read as "million" (the PR 391 unit-loss lesson).
 */
export function parseMoneyMillions(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion|thousand|mm|bn)?/i);
  if (!m) return null;
  let n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (/billion/i.test(m[2] ?? "") || /^bn$/i.test(m[2] ?? "")) n *= 1000;
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
export function parsePctOf(text: string, base: "EBITDA" | "TOTAL_ASSETS" | "CNI" | "NET_WORTH"): number | null {
  // Credit agreements write the percentage words-first with the
  // numeral in parentheses — "ten percent (10%) of Consolidated
  // Net Worth" — so the % token matches BOTH the bare form
  // ("10% of X") and the parenthesized form ("(10%) of X").
  const pct = String.raw`(?:(\d+(?:\.\d+)?)\s*%|\(\s*(\d+(?:\.\d+)?)\s*%\s*\))\s*of\s+`;
  const re =
    base === "EBITDA"
      ? new RegExp(pct + String.raw`(?:[A-Za-z]+\s+){0,2}EBITDA`, "i")
      : base === "CNI"
        // "Consolidated Net Income" is three words, so the gap
        // allows up to two qualifier words ("the Borrower's").
        ? new RegExp(pct + String.raw`(?:[A-Za-z]+(?:'s)?\s+){0,2}?(?:Consolidated\s+Net\s+Income|CNI)\b`, "i")
        : base === "NET_WORTH"
          // "Consolidated Net Worth" — the defined term is Net
          // Worth, never Net Income (a separate base).
          ? new RegExp(pct + String.raw`(?:[A-Za-z]+(?:'s)?\s+){0,2}?(?:Consolidated\s+)?Net\s+Worth\b`, "i")
          : new RegExp(pct + String.raw`(?:[A-Za-z]+\s+){0,2}Total\s+Assets`, "i");
  const m = text.match(re);
  if (!m) return null;
  const raw = m[1] ?? m[2];
  const n = Number(raw) / 100;
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a leverage ratio from text. The "4.00 to 1.00" form is
 * leverage-specific and wins. The "4.5x" form only counts in a
 * sentence that mentions leverage — otherwise an interest-coverage
 * multiple ("Coverage Ratio of at least 2.00x") would become the
 * leverage ratio. The old code took the first "Xx" anywhere.
 */
export function parseRatio(text: string): number | null {
  const to1 = text.match(/(\d+(?:\.\d+)?)\s*(?:to|:)\s*1(?:\.0+)?/i);
  if (to1) {
    const n = Number(to1[1]);
    return Number.isFinite(n) ? n : null;
  }
  for (const sentence of text.split(/[.;]\s+/)) {
    if (!/leverage/i.test(sentence)) continue;
    const m = sentence.match(/(\d+(?:\.\d+)?)\s*x\b/i);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}
