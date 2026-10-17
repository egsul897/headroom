import { norm } from "./text";

/**
 * The full capitalized ratio term in the clause ("Total First Lien Leverage Ratio", "Consolidated Senior Secured
 * Leverage Ratio"), longest form. A ratio is linked only when that full term equals a catalog ratio (up to a leading
 * "Consolidated"), so "Total First Lien Leverage Ratio" never borrows the "First Lien Leverage Ratio" result.
 */
export function clauseRatioTerm(text: string): string | null {
  const m = /\b((?:[A-Z][A-Za-z\-]*\s+){0,6}(?:[A-Z][A-Za-z\-]*\s+)?Ratio)\b/.exec(norm(text));
  if (!m) return null;
  const words = m[1]!.split(/\s+/);
  while (words.length > 1 && !/^[A-Z]/.test(words[0]!)) words.shift();
  while (words.length > 2 && /^(?:The|If|So|Such|Any|Each|Its|Their|Our|Pro|Forma|Basis|Borrower(?:'s|’s)?)$/.test(words[0]!)) words.shift();
  return words.join(" ");
}

const THRESHOLD_FORMS: ReadonlyArray<[RegExp, "AT_LEAST" | "NO_GREATER_THAN" | "GREATER_THAN" | "LESS_THAN"]> = [
  [/\b(?:at\s+least|not\s+(?:be\s+)?less\s+than|no\s+less\s+than|(?:greater|more)\s+than\s+or\s+equal\s+to|equal\s+to\s+or\s+(?:greater|more)\s+than)\s+(\d+(?:\.\d+)?)\s*(?:to|:)\s*(\d+(?:\.\d+)?)\b/i, "AT_LEAST"],
  [/\b(?:no\s+greater\s+than|not\s+(?:be\s+)?(?:greater|more)\s+than|no\s+more\s+than|(?:less|lower)\s+than\s+or\s+equal\s+to|equal\s+to\s+or\s+less\s+than|(?:shall|would|will|does|do)\s+not\s+exceed|not\s+to\s+exceed|not\s+(?:be\s+)?in\s+excess\s+of)\s+(\d+(?:\.\d+)?)\s*(?:to|:)\s*(\d+(?:\.\d+)?)\b/i, "NO_GREATER_THAN"],
];

/** One stated threshold (with its raw text), or null when the clause states none or more than one distinct ratio threshold. */
export function clauseRatioThreshold(text: string): { comparator: "AT_LEAST" | "NO_GREATER_THAN" | "GREATER_THAN" | "LESS_THAN"; num: number; den: number; raw: string } | null {
  const t = norm(text);
  const stated = new Set([...t.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:to|:)\s*(1(?:\.0+)?)\b/g)].map((m) => Number(m[1]) / Number(m[2])));
  if (stated.size !== 1) return null;
  const hits = THRESHOLD_FORMS.map(([re, c]) => { const m = re.exec(t); return m ? { comparator: c, num: Number(m[1]), den: Number(m[2]), raw: m[0] } : null; }).filter((x) => x != null);
  return hits.length === 1 ? hits[0]! : null;
}


const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Maintenance-covenant thresholds for a ratio stated in the operative covenant text rather than in a basket:
 * "will not permit [the] <Ratio> ... to exceed 3.50 to 1.00" or "will not permit <Numerator> ... to exceed 35% of
 * <Denominator>" (and "maintain ... at least" forms). Only sentences that state an obligation ("will/shall not permit",
 * "will/shall maintain") count, so a closing condition ("evidence ... demonstrating a ratio of no greater than 35%")
 * does not. Returns every distinct threshold found; the caller uses it only when exactly one exists.
 */
export function covenantRatioThresholds(text: string, ratioName: string, numerator: readonly string[], denominator: readonly string[]): Array<{ comparator: "AT_LEAST" | "NO_GREATER_THAN"; num: number; den: number; raw: string; sentence: string }> {
  const t = norm(text);
  const out: Array<{ comparator: "AT_LEAST" | "NO_GREATER_THAN"; num: number; den: number; raw: string; sentence: string }> = [];
  const MAX = String.raw`(?:to\s+(?:exceed|be\s+(?:greater|more)\s+than)|in\s+excess\s+of|(?:greater|more)\s+than)`;
  const MIN = String.raw`(?:to\s+be\s+less\s+than|(?:of\s+)?(?:at\s+least|not\s+less\s+than|no\s+less\s+than))`;
  const LIM = String.raw`(\d+(?:\.\d+)?)\s*(%|\s*(?:to|:)\s*(\d+(?:\.\d+)?))`;
  const forms: Array<[string, "AT_LEAST" | "NO_GREATER_THAN"]> = [];
  forms.push([String.raw`(?:the\s+)?${esc(ratioName)}\b[^.;]{0,120}?${MAX}\s+${LIM}`, "NO_GREATER_THAN"], [String.raw`(?:the\s+)?${esc(ratioName)}\b[^.;]{0,120}?${MIN}\s+${LIM}`, "AT_LEAST"]);
  if (numerator.length === 1 && denominator.length === 1) {
    forms.push([String.raw`${esc(numerator[0]!)}\b[^.;]{0,80}?${MAX}\s+(\d+(?:\.\d+)?)\s*(%)()\s+of\s+(?:the\s+)?${esc(denominator[0]!)}\b`, "NO_GREATER_THAN"]);
    forms.push([String.raw`${esc(numerator[0]!)}\b[^.;]{0,80}?${MIN}\s+(\d+(?:\.\d+)?)\s*(%)()\s+of\s+(?:the\s+)?${esc(denominator[0]!)}\b`, "AT_LEAST"]);
  }
  for (const sentence of t.split(/(?<=[.;])\s+/)) {
    if (!/\b(?:will|shall)\s+not\s+permit\b|\b(?:will|shall)\s+(?:at\s+all\s+times\s+)?maintain\b/i.test(sentence)) continue;
    for (const [src, comparator] of forms) {
      const m = new RegExp(src, "i").exec(sentence);
      if (!m) continue;
      const pct = m[2] === "%";
      const num = Number(m[1]), den = pct ? 100 : Number(m[3]);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) continue;
      if (!out.some((o) => o.num / o.den === num / den && o.comparator === comparator)) out.push({ comparator, num, den, raw: m[0], sentence });
    }
  }
  return out;
}
