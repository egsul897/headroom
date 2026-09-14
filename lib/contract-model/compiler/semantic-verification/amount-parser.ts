/**
 * F-3 (Phase 3 Chewy remediation) - the verifier's OWN deterministic parser for scale-bearing monetary amounts.
 *
 * Root cause it closes: source-inventory.ts's original parseMoney stripped every non-digit character from the matched
 * text, so a captured scale word was silently dropped ("$720.0 million" -> 720) and every scaled source figure was
 * compared against the compiler's canonical magnitude (720000000) as a mismatch - a large cluster of false
 * MATERIAL_DISCREPANCY findings wherever an agreement writes amounts in "million" form.
 *
 * Design (Independence Contract, mission section 10, design B): this is a FULLY INDEPENDENT implementation - the
 * verifier still reads the raw source text itself and never consumes the compiler's already-normalized number. The
 * scale vocabulary deliberately mirrors what the source system (semantic-accountability/quantitative.ts) already
 * accepts intentionally (thousand / million / billion and the unambiguous abbreviations mm / bn), so both sides agree
 * on the same generic grammar without sharing code; the ambiguous single-letter abbreviations (m, k, ...) are NOT
 * resolved here - they are reported as an UNRESOLVED scale so reconciliation routes them to review instead of
 * producing a confident wrong magnitude. Currency is carried explicitly and never converted (no FX).
 *
 * Exact arithmetic: the canonical magnitude is computed with integer (BigInt) arithmetic over the decimal digits, so
 * "$0.72 billion" is exactly 720000000 and "$720.0 million" is exactly 720000000 - never 0.72 * 1e9 in binary
 * floating point. Values within Number.MAX_SAFE_INTEGER (9.0e15) are returned exactly; larger magnitudes are returned
 * as the nearest double and flagged (exact: false). Contractual amounts are far below that bound.
 *
 * No company/package/section-specific logic (Architecture Invariants #29): every rule is generic legal-drafting
 * number grammar.
 */

export type ScaleStatus = "NONE" | "RESOLVED" | "UNRESOLVED";

export interface ParsedAmount {
  /** The text the amount was parsed from, verbatim. */
  rawText: string;
  /** The stated figure before any scale is applied (e.g. 720 for "$720.0 million"); null when no figure could be read. */
  parsedAmount: number | null;
  /** The scale token as written (e.g. "million", "MM"), or null. */
  scaleToken: string | null;
  scaleMultiplier: number | null;
  /** NONE = no scale word follows the figure; RESOLVED = a recognized scale applied; UNRESOLVED = a scale-like token follows that this grammar does not resolve (ambiguous/malformed) - the canonical value is withheld. */
  scaleStatus: ScaleStatus;
  /** ISO-4217-style code derived from the symbol / code / currency word ("USD", "GBP", "EUR", ...), or null when none is stated. */
  currency: string | null;
  /** The canonical magnitude in whole currency units (parsedAmount x scaleMultiplier), or null when withheld. */
  canonicalValue: number | null;
  /** True when canonicalValue was produced by exact integer arithmetic within Number's safe-integer range. */
  exact: boolean;
}

/** Recognized scale words (case-insensitive). Mirrors the source system's intentional vocabulary minus the ambiguous single letters. */
export const SCALE_MULTIPLIERS: Readonly<Record<string, number>> = { thousand: 1_000, million: 1_000_000, billion: 1_000_000_000, mm: 1_000_000, bn: 1_000_000_000 };
/** Scale-shaped abbreviations this grammar deliberately does NOT resolve (ambiguous: "m" is million to some drafters and thousand (mille) to others; "k" is informal). Their presence withholds the value. */
const UNRESOLVED_SCALE_TOKENS = new Set(["m", "k", "mn", "t", "tn", "b", "bb", "mln", "bln"]);
const SYMBOL_CURRENCY: Readonly<Record<string, string>> = { $: "USD", "£": "GBP", "€": "EUR" };
const WORD_CURRENCY: Readonly<Record<string, string>> = { dollar: "USD", dollars: "USD", euro: "EUR", euros: "EUR", pound: "GBP", pounds: "GBP", sterling: "GBP" };

/**
 * The AMOUNT grammar as one global regex (used by source-inventory.ts to locate candidates; parseScaledAmount then
 * interprets each match). Forms:
 *   [US]$ 720[.0] [million]            symbol-prefixed, optional recognized or unresolved scale token
 *   USD 720 million                     ISO-code-prefixed (any 3 capital letters)
 *   720 million dollars                 bare figure + recognized scale + currency word
 * Whitespace (including a line break) may separate the figure from the scale token. Scale tokens are matched only as
 * whole words (so "$5 in the aggregate" carries no scale and "$720 elephants" carries no scale - it is a plain $720
 * followed by prose, which any comparison against a scaled figure will report as a discrepancy).
 */
/** A figure, not followed by more digits or by a percent sign (so "AND 100%" / "$5,100%" never yield an AMOUNT). */
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?(?![\d.,]*%)`;
/** Case-insensitive spelling of a word, written letter-by-letter so the whole grammar can stay CASE-SENSITIVE (the ISO-code branch must only ever match three CAPITAL letters - "and 6.08" is prose, "USD 6.08" is a currency). */
const ci = (w: string) => w.split("").map((c) => (/[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c)).join("");
const SCALE_WORD = `(?:${["thousand", "million", "billion", "mln", "bln", "mm", "bn", "mn", "tn", "bb", "m", "k", "t", "b"].map(ci).join("|")})`;
const CURRENCY_WORD = `(?:${["dollars", "dollar", "euros", "euro", "pounds", "pound"].map(ci).join("|")})`;
export const AMOUNT_RE = new RegExp(String.raw`(?:(?:US\$|[$£€])\s?${NUMBER}(?:\s*${SCALE_WORD}\b)?(?:\s*${SCALE_WORD}\b)?)|(?:\b[A-Z]{3}\s?${NUMBER}(?:\s*${SCALE_WORD}\b)?(?:\s*${SCALE_WORD}\b)?)|(?:\b${NUMBER}\s*${SCALE_WORD}\s+${CURRENCY_WORD}\b)`, "g");

function exactScaled(digits: string, multiplier: number): { value: number; exact: boolean } {
  const [intPart, fracPart = ""] = digits.split(".");
  const scaled = BigInt(`${intPart}${fracPart}` || "0") * BigInt(multiplier);
  const divisor = BigInt(10) ** BigInt(fracPart.length);
  if (scaled % divisor === BigInt(0)) {
    const whole = scaled / divisor;
    if (whole <= BigInt(Number.MAX_SAFE_INTEGER)) return { value: Number(whole), exact: true };
    return { value: Number(whole), exact: false };
  }
  return { value: Number(digits) * multiplier, exact: false };
}

/** Interprets one AMOUNT_RE match. Never throws; a figure it cannot read safely yields canonicalValue null with the reason visible in scaleStatus/parsedAmount. */
export function parseScaledAmount(rawText: string): ParsedAmount {
  const base: ParsedAmount = { rawText, parsedAmount: null, scaleToken: null, scaleMultiplier: null, scaleStatus: "NONE", currency: null, canonicalValue: null, exact: false };
  const s = rawText.trim();
  // currency prefix
  let currency: string | null = null;
  let rest = s;
  const sym = rest.match(/^(US\$|[$£€])\s?/);
  if (sym) { currency = sym[1] === "US$" ? "USD" : SYMBOL_CURRENCY[sym[1]!] ?? null; rest = rest.slice(sym[0].length); }
  else { const iso = rest.match(/^([A-Z]{3})\s?/); if (iso) { currency = iso[1]!; rest = rest.slice(iso[0].length); } }
  const num = rest.match(/^(\d[\d,]*(?:\.\d+)?)/);
  if (!num) return base;
  const digits = num[1]!.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(digits)) return base;
  const parsedAmount = Number(digits);
  if (!Number.isFinite(parsedAmount)) return base;
  rest = rest.slice(num[0].length);
  // scale token(s)
  const tokens = [...rest.matchAll(/\b([A-Za-z]+)\b/g)].map((m) => m[1]!);
  const scaleLike = tokens.filter((t) => SCALE_MULTIPLIERS[t.toLowerCase()] !== undefined || UNRESOLVED_SCALE_TOKENS.has(t.toLowerCase()));
  const currencyWords = tokens.filter((t) => WORD_CURRENCY[t.toLowerCase()] !== undefined);
  if (currency === null && currencyWords.length > 0) currency = WORD_CURRENCY[currencyWords[0]!.toLowerCase()] ?? null;
  if (scaleLike.length === 0) {
    const { value, exact } = exactScaled(digits, 1);
    return { ...base, parsedAmount, currency, canonicalValue: value, exact, scaleStatus: "NONE" };
  }
  if (scaleLike.length > 1) {
    // "$720 million billion" - malformed: two scale tokens; withhold the value.
    return { ...base, parsedAmount, currency, scaleToken: scaleLike.join(" "), scaleStatus: "UNRESOLVED" };
  }
  const token = scaleLike[0]!;
  const mult = SCALE_MULTIPLIERS[token.toLowerCase()];
  if (mult === undefined) return { ...base, parsedAmount, currency, scaleToken: token, scaleStatus: "UNRESOLVED" };
  const { value, exact } = exactScaled(digits, mult);
  return { ...base, parsedAmount, currency, scaleToken: token, scaleMultiplier: mult, scaleStatus: "RESOLVED", canonicalValue: value, exact };
}
