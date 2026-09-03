/**
 * SEMANTIC ACCOUNTABILITY - deterministic quantitative-value scanner
 * (mission §6/§10). Pass A's own ZERO-COST layer: every material number in a
 * source unit must be accountable, so a value the model never inventoried can
 * never be invisible. This scanner finds VALUE CANDIDATES by generic UNIT
 * SHAPE only (money, percent, ratio, day counts, calendar periods, dates,
 * multipliers) - it never decides materiality (the semantic inventory model
 * does, per §6: "this does NOT mean every number in an agreement is
 * material"), never interprets, never carries a covenant concept or a
 * package-specific figure.
 *
 * Source-only (independence contract in types.ts): imports nothing from the
 * compiler, IR, or verifier.
 */
import type { QuantitativeKind, QuantitativeValue } from "./types";

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, forty_five: 45, sixty: 60, ninety: 90, one_hundred: 100, one_hundred_twenty: 120, one_hundred_eighty: 180 };

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseMoney(raw: string): number | null {
  const m = raw.match(/(\d[\d,]*(?:\.\d+)?)\s*(million|billion|thousand|mm|bn|m|k)?/i);
  if (!m) return null;
  const base = parseNumber(m[1]!);
  if (base === null) return null;
  const suffix = (m[2] ?? "").toLowerCase();
  const mult = suffix === "billion" || suffix === "bn" ? 1_000_000_000 : suffix === "million" || suffix === "mm" || suffix === "m" ? 1_000_000 : suffix === "thousand" || suffix === "k" ? 1_000 : 1;
  return base * mult;
}

interface PatternDef {
  kind: QuantitativeKind;
  re: RegExp;
  normalize: (m: RegExpExecArray) => { value: number | null; unit: string | null };
}

const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";

/**
 * Ordered by precedence: an earlier pattern's match claims its span, and a
 * later pattern may not overlap it (so "$5,000,000" is one MONEY value, never
 * also a NUMBER; "4.50 to 1.00" is one RATIO, never two numbers).
 */
const PATTERNS: PatternDef[] = [
  { kind: "MONEY", re: /(?:US\$|USD\s?|[$£€])\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|thousand|mm|bn))?\b/gi, normalize: (m) => ({ value: parseMoney(m[0]), unit: /£/.test(m[0]) ? "GBP" : /€/.test(m[0]) ? "EUR" : "USD" }) },
  { kind: "PERCENT", re: /\d+(?:\.\d+)?\s?(?:%|percent\b|per cent\b|basis points?\b|bps\b)/gi, normalize: (m) => { const n = parseNumber(m[0].replace(/[^\d.]/g, "")); const isBps = /basis|bps/i.test(m[0]); return { value: n === null ? null : isBps ? n / 10_000 : n / 100, unit: "%" }; } },
  { kind: "RATIO", re: /\d+(?:\.\d+)?\s*(?:to\s*1(?:\.0+)?\b|:\s*1(?:\.0+)?\b|x\b)/gi, normalize: (m) => ({ value: parseNumber((m[0].match(/^\d+(?:\.\d+)?/) ?? ["0"])[0]), unit: "x" }) },
  { kind: "DAYS", re: /\b(?:(?:[a-z]+(?:-[a-z]+)?)\s*\(\s*(\d+)\s*\)|(\d+))\s*(business|calendar)?\s*days?\b/gi, normalize: (m) => ({ value: parseNumber(m[1] ?? m[2] ?? ""), unit: m[3] ? `${m[3].toLowerCase()} days` : "days" }) },
  { kind: "PERIOD", re: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:consecutive\s+)?(?:full\s+)?(?:fiscal\s+|calendar\s+)?(quarters?|months?|years?|weeks?)\b/gi, normalize: (m) => { const w = m[1]!.toLowerCase(); const n = WORD_NUMBERS[w] ?? parseNumber(w); return { value: n ?? null, unit: m[2]!.toLowerCase().replace(/s$/, "") }; } },
  { kind: "DATE", re: new RegExp(`\\b${MONTH}\\s+\\d{1,2},\\s+\\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b`, "g"), normalize: (m) => ({ value: null, unit: m[0] }) },
  { kind: "MULTIPLIER", re: /\b\d+(?:\.\d+)?\s?times\b/gi, normalize: (m) => ({ value: parseNumber((m[0].match(/^\d+(?:\.\d+)?/) ?? ["0"])[0]), unit: "times" }) },
  // Generic ISO-style currency-code money: an uppercase three-letter code immediately followed by an amount
  // ("CHF 2,000,000", "SGD 5.5 million"). The symbol/USD pattern above already carried ONE hardcoded code, USD;
  // this generalises that shape rather than adding a currency list, and keeps the code in `unit` exactly as
  // the symbol pattern keeps USD/GBP/EUR. It is deliberately LAST: every more specific unit shape (percent,
  // ratio, days, ...) claims its span first, so "LTV 65%" stays a PERCENT and only a code+amount that nothing
  // else explains becomes MONEY. Case-sensitive on purpose - "chf 2,000,000" is not a code.
  //
  // Why (closure remediation V1): the original red-team scenario V1 put a CHF cap inside a child-descent
  // lead-in. Its USD twin surfaced because the value guard saw a MONEY value; V1 completed silently because
  // this scanner returned nothing, and the value guard is only as strong as the scanner. Recognition here
  // makes the guard fire; nothing about descent changes.
  { kind: "MONEY", re: /\b[A-Z]{3}\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|thousand|mm|bn))?\b/g, normalize: (m) => ({ value: parseMoney(m[0].slice(3)), unit: m[0].slice(0, 3) }) },
];

function overlaps(a: { charStart: number; charEnd: number }, b: { charStart: number; charEnd: number }): boolean {
  return a.charStart < b.charEnd && b.charStart < a.charEnd;
}

/** Scans one region text for quantitative value candidates. Deterministic, ordered by position. */
export function scanQuantitativeValues(text: string): QuantitativeValue[] {
  const out: QuantitativeValue[] = [];
  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags.includes("g") ? pattern.re.flags : `${pattern.re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const span = { charStart: m.index, charEnd: m.index + m[0].length };
      if (m[0].trim().length === 0) {
        re.lastIndex++;
        continue;
      }
      if (out.some((v) => overlaps(v, span))) continue;
      const { value, unit } = pattern.normalize(m);
      out.push({ kind: pattern.kind, rawText: m[0], normalizedValue: value, unit, charStart: span.charStart, charEnd: span.charEnd });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out.sort((a, b) => a.charStart - b.charStart);
}

/** Two values are the same source fact when their kind matches and their normalized values agree (or, when neither normalizes, their raw text agrees). */
export function quantitativeValuesEquivalent(a: { kind: QuantitativeKind; normalizedValue: number | null; rawText: string }, b: { kind: QuantitativeKind; normalizedValue: number | null; rawText: string }): boolean {
  if (a.kind !== b.kind) return false;
  if (a.normalizedValue !== null && b.normalizedValue !== null) return numbersMatch(a.normalizedValue, b.normalizedValue);
  return a.rawText.replace(/\s+/g, " ").trim().toLowerCase() === b.rawText.replace(/\s+/g, " ").trim().toLowerCase();
}

export function numbersMatch(a: number, b: number): boolean {
  if (a === 0 || b === 0) return Math.abs(a - b) < 1e-9;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) < 1e-6;
}
