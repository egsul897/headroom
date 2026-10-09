/**
 * IPV-22 — figure role and comparator direction.
 *
 * Deterministic gates historically verified that a figure appears in the
 * operative text, not whether it is a basket CAP versus a THRESHOLD
 * ("in excess of $X", "less than $X") or whether a ratio COMPARE operator
 * matches the source comparator ("does not exceed" → LTE, "at least" → GTE).
 */

export type SourceFigureRole = "CAP" | "THRESHOLD" | "AMBIGUOUS" | "ABSENT";

const CAP_INTRODUCERS = /\b(?:not\s+to\s+exceed|shall\s+not\s+exceed|not\s+exceeding|in\s+an\s+aggregate\s+(?:principal\s+)?amount\s+(?:not\s+to\s+exceed|of\s+up\s+to)|up\s+to)\b/i;
const THRESHOLD_INTRODUCERS = /\b(?:in\s+excess\s+of|greater\s+than|less\s+than|at\s+least|not\s+less\s+than|below|above|if\s+[\s\S]{0,60}?(?:less|greater)\s+than|would\s+be\s+less\s+than)\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Canonical integer digits of a money/ratio figure (commas/currency stripped). */
function figureDigits(figureRaw: string): string {
  const cleaned = figureRaw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  // Drop trailing .0* so 3.50 and 3.5 compare equal for ratio lookup.
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return cleaned.replace(/\D/g, "");
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return cleaned.replace(/\.?0+$/, "");
}

/** Build a regex that matches $5,000,000 / 5000000 / 5,000,000.00 equally. */
function moneyFigureRe(digits: string): RegExp {
  // Allow optional thousands separators between digit groups.
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "[,]?");
  return new RegExp(String.raw`\$?\s*${withCommas}(?:\.\d+)?(?:\s*(?:million|billion))?`, "i");
}

function ratioFigureRe(value: number): RegExp {
  // 3.5 matches 3.50 / 3.5 / 3.500
  const head = String(value).replace(/\.?0+$/, "");
  const [intPart, frac = ""] = head.split(".");
  const fracPat = frac.length > 0 ? `\\.${frac}0*` : `(?:\\.0+)?`;
  return new RegExp(String.raw`\b${escapeRegExp(intPart!)}${fracPat}\s*(?:to\s*1(?:\.0*)?|:1(?:\.0*)?)\b`, "i");
}

/** Locate a dollar/ratio figure in `text` and classify its local drafting role. */
export function classifyFigureRoleInText(figureRaw: string, text: string): SourceFigureRole {
  const digits = figureDigits(figureRaw);
  if (!digits) return "ABSENT";
  const n = Number(digits);
  const looksRatio = Number.isFinite(n) && n > 0 && n < 100 && !/\$/.test(figureRaw) && /\d+\.\d+/.test(figureRaw);
  const re = looksRatio ? ratioFigureRe(n) : moneyFigureRe(digits);
  const m = re.exec(text);
  if (!m) {
    // Fallback: digit-only search allowing commas for money.
    const loose = moneyFigureRe(digits).exec(text);
    if (!loose) return "ABSENT";
    return roleAround(text, loose.index, loose[0].length);
  }
  return roleAround(text, m.index, m[0].length);
}

function roleAround(text: string, index: number, len: number): SourceFigureRole {
  const window = text.slice(Math.max(0, index - 100), Math.min(text.length, index + len + 50));
  const isCap = CAP_INTRODUCERS.test(window);
  const isThreshold = THRESHOLD_INTRODUCERS.test(window);
  // "shall not / will not / may not … in excess of $X" is a prohibition
  // ceiling (the maximum that may be incurred), not a permission-basket
  // threshold. Without this, IPV-22 incorrectly strips MONEY capacity from
  // duplicate-section drafting like package G's second 7.01.
  if (/\b(?:shall|will|may)\s+not\b/i.test(window) && /\bin\s+excess\s+of\b/i.test(window)) {
    return "CAP";
  }
  if (isThreshold && !isCap) return "THRESHOLD";
  if (isCap && !isThreshold) return "CAP";
  return "AMBIGUOUS";
}

/**
 * Map source ratio comparator phrasing near a ratio figure to the IR COMPARE
 * operator that represents the *satisfied* covenant test (not the surface
 * violation wording).
 *
 * Financial-covenant drafting often prohibits a state ("shall not permit the
 * Interest Coverage Ratio to be less than 2.50"); the IR condition that must
 * hold is the opposite (GTE). Bare "less than" / "greater than" without that
 * permit/allow framing stay LT/GT for conditional gates.
 */
export function sourceRatioOperatorNear(text: string, ratioValue: number): "LTE" | "GTE" | "LT" | "GT" | null {
  const re = ratioFigureRe(ratioValue);
  const m = re.exec(text);
  if (!m) return null;
  const window = text.slice(Math.max(0, m.index - 120), Math.min(text.length, m.index + m[0].length + 20));
  // Explicit satisfied-direction phrases (permission gates / maintenance floors).
  if (/\b(?:does\s+not\s+exceed|not\s+to\s+exceed|shall\s+not\s+exceed|no\s+more\s+than|at\s+most)\b/i.test(window)) return "LTE";
  if (/\b(?:at\s+least|not\s+less\s+than|equal\s+to\s+or\s+greater\s+than|no\s+less\s+than)\b/i.test(window)) return "GTE";
  // "shall not … permit/allow … to exceed|be greater than" → maintain ≤
  if (/\b(?:permit|allow)\b[\s\S]{0,100}?\b(?:to\s+)?(?:exceed|be\s+greater\s+than)\b/i.test(window)) return "LTE";
  // "shall not … permit/allow … to be less than|below" → maintain ≥
  if (/\b(?:permit|allow)\b[\s\S]{0,100}?\b(?:to\s+be\s+)?(?:less\s+than|below)\b/i.test(window)) return "GTE";
  if (/\bless\s+than\b/i.test(window) && !/\bnot\s+less\s+than\b/i.test(window)) return "LT";
  if (/\bgreater\s+than\b/i.test(window)) return "GT";
  return null;
}

export function oppositeRatioOperator(op: string): string | null {
  switch (op) {
    case "LTE": return "GTE";
    case "GTE": return "LTE";
    case "LT": return "GT";
    case "GT": return "LT";
    default: return null;
  }
}
