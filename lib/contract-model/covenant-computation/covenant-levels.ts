/**
 * Unified covenant-level grammar (PR #383 design 6240146575, semantics
 * rulings 6240192569, cross-review brief 2026-10-17).
 *
 * One parser for financial-covenant LEVELS (leverage / coverage ratio
 * thresholds, their step schedules, and their modifiers), consumed by
 * every reader that used to carry its own partial regex. Pure: no I/O,
 * no issuer data, no ambient dates — the caller supplies the text, the
 * enclosing section's identity, and optionally a test date.
 *
 * Binding semantics (never negotiable in this module):
 *  - testKind is a SECTION-ROLE + FRAME decision, never a ratio-shape
 *    decision. A pro-forma / incurrence proviso is INCURRENCE even when
 *    the level looks exactly like a maintenance level; such a level is
 *    never returned as MAINTENANCE.
 *  - Modifiers are DATA (modifiers[] with trigger text), never silently
 *    dropped. A modifier that cannot be resolved from the text
 *    (relative level with a dangling reference, step change with no
 *    amount) makes the parse NEEDS_INPUT naming the modifier — the
 *    unmodified level is never asserted flat in its place.
 *  - A step schedule keeps EVERY row. If the governing row cannot be
 *    chosen (no test date, gap, overlap, unparseable row date), the
 *    parse is NEEDS_INPUT naming the missing input; the first or last
 *    row is never returned alone as the level.
 *  - NEEDS_INPUT is reserved for inputs outside the document or genuine
 *    ambiguity; every blocking reason names the exact missing input.
 *    Determined parts (schedule, direction, metric, citation) are
 *    still returned alongside.
 *  - Levels are exact: NUM SEP NUM is normalized with BigInt rational
 *    arithmetic (runtime/decimal), never float division. A denominator
 *    other than 1 (e.g. 4.50:2.00) is reduced exactly to 9/4 = "2.25".
 *  - No default level, ever. Text with no readable level returns
 *    level: null with a named reason.
 */

import { rational, rationalFromString, toCanonicalString, type Rational } from "../runtime/decimal";

export type CovenantLevelStatus = "DETERMINED" | "NEEDS_INPUT";
export type CovenantTestKind = "MAINTENANCE" | "INCURRENCE";
export type CovenantLevelDirection = "MAX" | "MIN";
export type CovenantLevelMetric =
  | "GROSS_LEVERAGE"
  | "NET_LEVERAGE"
  | "SECURED_LEVERAGE"
  | "INTEREST_COVERAGE"
  | "FIXED_CHARGE_COVERAGE";

export interface CovenantLevelScheduleRow {
  /** ISO date (YYYY-MM-DD) the row starts governing, or null when the text leaves the start open. */
  effectiveFrom: string | null;
  /** ISO date (YYYY-MM-DD) the row stops governing (exclusive bound), or null when open-ended ("thereafter"). */
  effectiveTo: string | null;
  /** The row's own period language, as written. */
  periodText: string;
  /** Canonical exact level for this row. */
  level: string;
  /** The ratio token as written. */
  raw: string;
  /** True when the caller's testDate selects this row as governing. */
  selected: boolean;
}

export interface CovenantLevelModifier {
  kind: "STEP_UP" | "STEP_DOWN" | "PLUS" | "RELATIVE" | "HOLIDAY" | "OTHER";
  /** Canonical exact amount of the step / relative offset, when the text states one. */
  amount: string | null;
  /** The trigger language (event / condition) the modifier is tied to, as written. */
  trigger: string;
  /** False when the modifier cannot be applied from this text (dangling relative reference, missing amount). */
  resolved: boolean;
  raw: string;
}

export interface CovenantLevel {
  status: CovenantLevelStatus;
  /** Machine-named issues found. Blocking issues also appear in `missing`. */
  reasons: string[];
  /** Blocking missing inputs / unresolved items, by name (e.g. "testDate"). Empty when DETERMINED. */
  missing: string[];
  testKind: CovenantTestKind | null;
  direction: CovenantLevelDirection | null;
  /** Canonical exact governing level, or null when none can be asserted. */
  level: string | null;
  schedule: CovenantLevelScheduleRow[];
  modifiers: CovenantLevelModifier[];
  metric: CovenantLevelMetric | null;
  ratioName: string | null;
  /** The sentence the governing level was read from. */
  citation: string | null;
}

export interface ParseCovenantLevelInput {
  text: string;
  sectionHeading?: string | null;
  articleHeading?: string | null;
  /** Checklist family, summary category, or taxonomy family of the enclosing section (any known vocabulary). */
  sectionFamily?: string | null;
  ratioName?: string | null;
  /** ISO date (YYYY-MM-DD) the level is tested as of; selects the governing schedule row. */
  testDate?: string | null;
}

// ---------------------------------------------------------------------------
// Ratio tokens — the canonical NUM SEP NUM reader.
// Union-verified against figure-role's RATIO_RE (colon + "X to 1" with a
// 1-form denominator) and money.parseRatio ("X to 1"; "NUM x" inside
// leverage sentences): every form those readers accept is accepted
// here, plus non-1 denominators (0–2 decimals) normalized exactly, and
// bare "NUM x" / "NUM times" (= NUM:1). The union is pinned in tests.
// ---------------------------------------------------------------------------

export interface RatioToken {
  raw: string;
  numeratorRaw: string;
  denominatorRaw: string;
  /** Exact value (numerator / denominator, BigInt GCD-reduced). */
  value: Rational;
  /** Canonical exact string (finite decimal when terminating, else "num/den"). */
  canonical: string;
  /** Display-grade float of the exact value, for schema fields that are JS numbers. */
  numericValue: number;
  index: number;
  /** True for the bare "NUM x" / "NUM times" form (= NUM:1). */
  bare: boolean;
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const SEP_TOKEN_RE = new RegExp(String.raw`(${NUM})\s*(?::|\bto\b)\s*(\d+(?:\.\d{1,2})?)\b`, "gi");
const BARE_TOKEN_RE = new RegExp(String.raw`(${NUM})\s*(x|times)\b`, "gi");

function tokenFromParts(numeratorRaw: string, denominatorRaw: string, raw: string, index: number, bare: boolean): RatioToken | null {
  try {
    const num = rationalFromString(numeratorRaw.replace(/,/g, ""));
    const den = rationalFromString(denominatorRaw.replace(/,/g, ""));
    if (den.num === 0n) return null;
    const value = rational(num.num * den.den, den.num * num.den);
    return {
      raw,
      numeratorRaw,
      denominatorRaw,
      value,
      canonical: toCanonicalString(value),
      numericValue: Number(value.num) / Number(value.den),
      index,
      bare,
    };
  } catch {
    return null;
  }
}

/**
 * True when a token is shaped like a covenant ratio rather than a
 * time-of-day or section-style colon number: it carries a decimal
 * point, or its (exactly reduced) denominator is 1 — "10:30" is
 * neither. Consumers that scan raw prose for ratio figures use this
 * one filter so the grammar stays unified.
 */
export function isRatioShapedToken(t: RatioToken): boolean {
  return t.numeratorRaw.includes(".") || t.denominatorRaw.includes(".") || t.value.den === 1n;
}

/** Every ratio token in the text (SEP forms and bare x/times forms), in document order. */
export function findRatioTokens(text: string): RatioToken[] {
  const out: RatioToken[] = [];
  const spans: Array<{ start: number; end: number }> = [];
  SEP_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEP_TOKEN_RE.exec(text)) !== null) {
    const tok = tokenFromParts(m[1]!, m[2]!, m[0], m.index, false);
    if (tok) {
      out.push(tok);
      spans.push({ start: m.index, end: m.index + m[0].length });
    }
    if (m.index === SEP_TOKEN_RE.lastIndex) SEP_TOKEN_RE.lastIndex++;
  }
  BARE_TOKEN_RE.lastIndex = 0;
  while ((m = BARE_TOKEN_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    const tok = tokenFromParts(m[1]!, "1", m[0], start, true);
    if (tok) out.push(tok);
    if (m.index === BARE_TOKEN_RE.lastIndex) BARE_TOKEN_RE.lastIndex++;
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// Sentences (decimal points are not boundaries)
// ---------------------------------------------------------------------------

interface SentenceSpan { start: number; end: number; text: string }

function sentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n") {
      if (i > start) spans.push({ start, end: i, text: text.slice(start, i) });
      start = i + 1;
      continue;
    }
    if (ch === "." || ch === ";" || ch === "!") {
      if (ch === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")) continue;
      const rest = text.slice(i + 1);
      const trimmed = rest.trimStart();
      const nextNonSpace = trimmed[0];
      if (nextNonSpace === undefined || /[A-Z“"'(]/.test(nextNonSpace) || /^\(\w{1,4}\)/.test(trimmed)) {
        spans.push({ start, end: i + 1, text: text.slice(start, i + 1) });
        start = i + 1;
      }
    }
  }
  if (start < text.length) spans.push({ start, end: text.length, text: text.slice(start) });
  // start/end index into the (whitespace-normalized) text; only the
  // display text is trimmed, so token offsets stay valid.
  return spans
    .map((s) => ({ ...s, text: s.text.trim() }))
    .filter((s) => s.text.length > 0);
}

function sentenceAt(spans: SentenceSpan[], index: number): SentenceSpan {
  return spans.find((s) => index >= s.start && index < s.end) ?? spans[spans.length - 1] ?? { start: 0, end: 0, text: "" };
}

// ---------------------------------------------------------------------------
// Direction — comparator lexicon in negative and affirmative frames.
// The direction is the REQUIREMENT the covenant imposes
// (MAX = the ratio must be at or below the level; MIN = at or above).
// ---------------------------------------------------------------------------

const MAX_PHRASES: readonly RegExp[] = [
  /\b(?:shall|will)\s+not\s+permit\b[^.;]{0,120}?\bto\s+exceed\b/i,
  /\b(?:shall|will)\s+not\s+permit\b[^.;]{0,120}?\bto\s+be\s+greater\s+than\b/i,
  /\b(?:shall|will)\s+not\s+permit\b[^.;]{0,120}?\bgreater\s+than\b/i,
  /\bnot\s+permit\b[^.;]{0,120}?\bexceed/i,
  /\bshall\s+not\s+exceed\b/i,
  /\bdoes\s+not\s+exceed\b/i,
  /\bnot\s+to\s+exceed\b/i,
  /\bnot\s+exceeding\b/i,
  /\bnot\s+in\s+excess\s+of\b/i,
  /\bno\s+greater\s+than\b/i,
  /\bnot\s+greater\s+than\b/i,
  /\bequal\s+to\s+or\s+less\s+than\b/i,
  /\bno\s+more\s+than\b/i,
  /\bnot\s+more\s+than\b/i,
  /\bwould\s+be\s+no\s+greater\s+than\b/i,
  /\bwould\s+not\s+exceed\b/i,
  /\bwould\s+exceed\b/i,
];

/**
 * "at least" is a MIN comparator only when it binds the ratio. Followed
 * by a quantity and a time unit ("for at least two consecutive fiscal
 * quarters", "at least 30 days") it is a DURATION phrase — reading it
 * as a comparator inverts the covenant's direction (caught on a real
 * dev-set clause whose step-up proviso carries exactly that phrase).
 */
const AT_LEAST_COMPARATOR_RE =
  /\bat\s+least\b(?!\s+(?:\d[\d,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:\w+\s+){0,2}?(?:quarters?|months?|years?|weeks?|days?|periods?)\b)/i;

const MIN_PHRASES: readonly RegExp[] = [
  /\b(?:shall|will)\s+not\s+permit\b[^.;]{0,120}?\bto\s+be\s+less\s+than\b/i,
  /\b(?:shall|will)\s+not\s+permit\b[^.;]{0,120}?\bless\s+than\b/i,
  /\bequal\s+to\s+or\s+greater\s+than\b/i,
  /\bno\s+less\s+than\b/i,
  /\bnot\s+less\s+than\b/i,
  /\bwould\s+be\s+at\s+least\b/i,
  /\bwould\s+be\s+no\s+less\s+than\b/i,
];

function hasMinPhrase(sentence: string): boolean {
  return MIN_PHRASES.some((re) => re.test(sentence)) || AT_LEAST_COMPARATOR_RE.test(sentence);
}

function directionIn(sentence: string): CovenantLevelDirection | null {
  const prohibition = /\b(?:shall|will|may)\s+not\s+permit\b|\bshall\s+not\b|\bmay\s+not\b/i.test(sentence);
  let max = MAX_PHRASES.some((re) => re.test(sentence));
  let min = hasMinPhrase(sentence);
  // Under a prohibition, "would be greater/less than" states the forbidden
  // outcome; the requirement is the opposite bound.
  if (prohibition && /\bwould\s+be\s+greater\s+than\b/i.test(sentence)) max = true;
  if (prohibition && /\bwould\s+be\s+less\s+than\b/i.test(sentence)) min = true;
  if (max === min) return null;
  return max ? "MAX" : "MIN";
}

// ---------------------------------------------------------------------------
// Incurrence proviso guard — always wins over section role and shape.
// ---------------------------------------------------------------------------

const AFTER_GIVING_EFFECT_RE = /\bafter\s+giving\s+(?:pro\s+forma\s+)?effect\b/i;
/**
 * "Pro forma" marks an incurrence test only when it attaches to a
 * TRANSACTION being tested (giving effect to an incurrence, an
 * acquisition, a disposition...). The same words as a CALCULATION
 * CONVENTION inside a maintenance covenant ("the Total Leverage Ratio
 * ... calculated on a Pro Forma Basis") do NOT make the covenant an
 * incurrence test — maintenance ratios are routinely computed pro
 * forma for period transactions. (Both shapes occur in the dev set;
 * the distinction is the guard's whole job.)
 */
const PRO_FORMA_TRANSACTION_RE =
  /\bpro\s+forma\b[^.;]{0,100}?\b(?:incurrence|incur|acquisition|transaction|investment|borrowing|disposition|payment|dividend)\b|\b(?:incurrence|incur|acquisition|transaction|investment|borrowing|disposition|payment|dividend)\b[^.;]{0,100}?\bpro\s+forma\b/i;
const WOULD_TEST_RE = /\bwould\s+(?:be|exceed|not\s+exceed|be\s+no\s+greater\s+than|be\s+at\s+least|be\s+less\s+than|be\s+greater\s+than)\b/i;
const INCURRENCE_CONDITION_RE = /\b(?:incur|create|assume|guarantee|consummate|effect)\b[^.;]{0,160}?\b(?:if|unless|so\s+long\s+as|provided)\b/i;

function incurrenceGuard(text: string, sentence: string): boolean {
  if (AFTER_GIVING_EFFECT_RE.test(sentence)) return true;
  if (PRO_FORMA_TRANSACTION_RE.test(sentence)) return true;
  if (/\bprovided\s+(?:further\s+)?that\b[^.;]*\bpro\s+forma\b/i.test(text)) return true;
  // A hypothetical ("would be / would exceed") ratio test is an incurrence
  // test formulation, never a standing maintenance covenant.
  if (WOULD_TEST_RE.test(sentence) && /\bratio\b|\bcoverage\b|\bleverage\b/i.test(sentence)) return true;
  if (INCURRENCE_CONDITION_RE.test(sentence)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Section role — vocabulary translation across the three family systems
// in the codebase (checklist families, summary categories, taxonomy).
// ---------------------------------------------------------------------------

const MAINTENANCE_FAMILIES = new Set([
  "FINANCIAL_RATIOS",
  "FINANCIAL_MAINTENANCE",
  "FINANCIAL_MAINTENANCE_COVENANTS",
  "FINANCIAL_COVENANTS",
]);

const INCURRENCE_FAMILIES = new Set([
  "DEBT",
  "INDEBTEDNESS",
  "DEBT_INCURRENCE",
  "LIENS",
  "LIENS_SECURED_DEBT",
  "RESTRICTED_PAYMENTS",
  "RESTRICTED_PAYMENTS_INVESTMENTS",
  "INVESTMENTS",
  "ASSET_SALES",
  "ASSET_SALE",
  "DISPOSITIONS",
  "MERGERS",
  "MERGERS_FUNDAMENTAL_CHANGES",
  "FUNDAMENTAL_CHANGES",
  "AFFILIATE_TRANSACTIONS",
]);

function roleFromHeading(heading: string | null | undefined): CovenantTestKind | null {
  if (!heading) return null;
  if (/\bfinancial\s+covenants?\b/i.test(heading)) return "MAINTENANCE";
  if (/\b(?:maximum|minimum)\b[^:]{0,60}\bratio\b/i.test(heading)) return "MAINTENANCE";
  return null;
}

function roleFromFamily(family: string | null | undefined): CovenantTestKind | null {
  if (!family) return null;
  const key = family.toUpperCase().replace(/[\s-]+/g, "_");
  if (MAINTENANCE_FAMILIES.has(key)) return "MAINTENANCE";
  if (INCURRENCE_FAMILIES.has(key)) return "INCURRENCE";
  return null;
}

const MAINTENANCE_FRAME_RE =
  /\bshall\s+(?:maintain|have)\b|\bwill\s+(?:maintain|have)\b|\bmaintain\b[^.;]{0,80}?\b(?:ratio|coverage|leverage)\b|\bas\s+of\s+the\s+last\s+day\s+of\s+(?:any|each)\s+fiscal\s+(?:quarter|period)\b|\bfor\s+any\s+Test\s+Period\b/i;

// ---------------------------------------------------------------------------
// Metric identity — from the ratio name, or an inline "ratio of A to B".
// Never guessed: an unmapped name yields null (and a named reason).
// ---------------------------------------------------------------------------

const RATIO_NAME_RE =
  /\b((?:Consolidated\s+)?(?:Fixed\s+Charge\s+Coverage|Interest\s+Coverage|(?:Total\s+|Secured\s+|First\s+Lien\s+|Senior\s+)?(?:Net\s+)?Leverage)\s+Ratio)\b/i;

export function metricForRatioName(name: string | null | undefined): CovenantLevelMetric | null {
  if (!name) return null;
  const n = name.replace(/\s+/g, " ").trim();
  if (/\bfixed\s+charge\s+coverage\b/i.test(n)) return "FIXED_CHARGE_COVERAGE";
  if (/\binterest\s+coverage\b/i.test(n)) return "INTEREST_COVERAGE";
  if (/\bleverage\b/i.test(n)) {
    if (/\b(?:secured|first\s+lien)\b/i.test(n)) return "SECURED_LEVERAGE";
    if (/\bnet\b/i.test(n)) return "NET_LEVERAGE";
    return "GROSS_LEVERAGE";
  }
  return null;
}

function metricFromInlineRatioOf(text: string): CovenantLevelMetric | null {
  const m = /\bratio\s+of\s+([^.;]{3,140}?)\s+to\s+([^.;]{3,100})/i.exec(text);
  if (!m) return null;
  const a = m[1]!;
  const b = m[2]!;
  if (/\bfixed\s+charges?\b/i.test(b)) return "FIXED_CHARGE_COVERAGE";
  if (/\binterest\b/i.test(b)) return "INTEREST_COVERAGE";
  if (/\bEBITDA\b/i.test(b) || /\bdebt\b|\bindebtedness\b/i.test(a)) {
    // "Debt minus Unrestricted Cash" IS the net measure, name or no name.
    if (/\b(?:minus|less)\b/i.test(a) && /\bunrestricted\s+cash\b/i.test(a)) return "NET_LEVERAGE";
    if (/\bnet\b/i.test(a)) return "NET_LEVERAGE";
    if (/\bsecured\b|\bfirst\s+lien\b/i.test(a)) return "SECURED_LEVERAGE";
    return "GROSS_LEVERAGE";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function parseDate(raw: string): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const named = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(raw);
  if (named) {
    const mm = MONTHS[named[1]!.toLowerCase()];
    if (mm) return `${named[3]}-${mm}-${named[2]!.padStart(2, "0")}`;
  }
  return null;
}

function addDays(iso: string, days: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y!, mo! - 1, d!) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

const DATE_TEXT = String.raw`(?:\d{4}-\d{2}-\d{2}|[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})`;
const PERIOD_MARKER_RE = new RegExp(
  String.raw`from\s+the\s+Test\s+Period\s+ending\s+on\s+(${DATE_TEXT})\s+to\s+and\s+including\s+the\s+Test\s+Period\s+ending\s+on\s+(${DATE_TEXT})` +
  String.raw`|from\s+the\s+Test\s+Period\s+ending\s+on\s+(${DATE_TEXT})\s+and\s+each\s+Test\s+Period\s+ending\s+thereafter` +
  String.raw`|fiscal\s+quarter\s+ending\s+(${DATE_TEXT})` +
  String.raw`|Test\s+Period\s+ending\s+on\s+or\s+after\s+(${DATE_TEXT})\s+and\s+(?:prior\s+to|before)\s+(${DATE_TEXT})` +
  String.raw`|on\s+or\s+after\s+(${DATE_TEXT})\s+and\s+(?:prior\s+to|before)\s+(${DATE_TEXT})` +
  String.raw`|from\s+(${DATE_TEXT})\s+(?:through|until|to)\s+(${DATE_TEXT})` +
  String.raw`|on\s+or\s+after\s+(${DATE_TEXT})` +
  String.raw`|(thereafter)\b`,
  "gi",
);

// ---------------------------------------------------------------------------
// Modifiers — with source spans, so a step amount written in ratio form
// ("increased by 0.25:1.00") is never mistaken for a base level.
// ---------------------------------------------------------------------------

const MODIFIER_TOKEN = String.raw`(\d+(?:\.\d+)?)\s*(?::\s*(\d+(?:\.\d{1,2})?)|\bto\s+(\d+(?:\.\d{1,2})?)|(x|times)\b)?`;

function modifierAmount(num: string, den: string | undefined, bare: string | undefined): string | null {
  const tok = tokenFromParts(num, den ?? "1", "", 0, Boolean(bare));
  return tok ? tok.canonical : null;
}

interface ModifierHit extends CovenantLevelModifier { start: number; end: number }

function findModifiers(text: string): ModifierHit[] {
  const out: ModifierHit[] = [];
  const push = (mod: ModifierHit) => {
    if (!out.some((o) => o.raw === mod.raw && o.kind === mod.kind && o.start === mod.start)) out.push(mod);
  };
  const stepRe = new RegExp(String.raw`\b(increased|decreased)\s+by\s+${MODIFIER_TOKEN}`, "gi");
  let m: RegExpExecArray | null;
  while ((m = stepRe.exec(text)) !== null) {
    const amount = modifierAmount(m[2]!, m[3] ?? m[4], m[5]);
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 140);
    const trigger = (tail.match(/^\s*(?:upon|in\s+connection\s+with|following|after|during)\b[^.;]*/i)?.[0] ?? "").trim();
    push({
      kind: m[1]!.toLowerCase() === "increased" ? "STEP_UP" : "STEP_DOWN",
      amount,
      trigger,
      resolved: amount !== null,
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
    if (m.index === stepRe.lastIndex) stepRe.lastIndex++;
  }
  const plusRe = new RegExp(String.raw`\bplus\s+${MODIFIER_TOKEN}`, "gi");
  while ((m = plusRe.exec(text)) !== null) {
    const amount = modifierAmount(m[1]!, m[2] ?? m[3], m[4]);
    push({ kind: "PLUS", amount, trigger: "", resolved: amount !== null, raw: m[0], start: m.index, end: m.index + m[0].length });
    if (m.index === plusRe.lastIndex) plusRe.lastIndex++;
  }
  const relRe = /\b(\d+(?:\.\d+)?)\s*(?:x\s+)?(less|greater)\s+than\s+the\s+(maximum|minimum)\b[^.;]*/gi;
  while ((m = relRe.exec(text)) !== null) {
    push({
      kind: "RELATIVE",
      amount: modifierAmount(m[1]!, undefined, undefined),
      trigger: m[0],
      resolved: false,
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
    if (m.index === relRe.lastIndex) relRe.lastIndex++;
  }
  const holidayRe = /\b(?:step[-\s]?up|increase)\b[^.;]{0,80}?\b(?:shall\s+not\s+apply|suspended|deferred)\b[^.;]*/gi;
  while ((m = holidayRe.exec(text)) !== null) {
    push({ kind: "HOLIDAY", amount: null, trigger: m[0], resolved: true, raw: m[0], start: m.index, end: m.index + m[0].length });
    if (m.index === holidayRe.lastIndex) holidayRe.lastIndex++;
  }
  if (/\bMaterial\s+Acquisition\b/i.test(text)) {
    for (const mod of out) {
      if ((mod.kind === "STEP_UP" || mod.kind === "STEP_DOWN") && !mod.trigger) mod.trigger = "Material Acquisition";
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

interface RowDraft {
  effectiveFrom: string | null;
  effectiveTo: string | null;
  periodText: string;
  tokens: RatioToken[];
}

function scheduleDrafts(text: string, tokens: RatioToken[]): RowDraft[] | null {
  PERIOD_MARKER_RE.lastIndex = 0;
  const markers: Array<{ index: number; from: string | null; to: string | null; quarterEnd: boolean; raw: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = PERIOD_MARKER_RE.exec(text)) !== null) {
    if (m[1]) {
      // "from the Test Period ending on D1 to and including the Test Period
      // ending on D2": D2 is INCLUSIVE, so the exclusive bound is D2 + 1 day.
      const to = parseDate(m[2]!);
      markers.push({ index: m.index, from: parseDate(m[1]), to: to ? addDays(to, 1) : null, quarterEnd: false, raw: m[0] });
    }
    else if (m[3]) markers.push({ index: m.index, from: parseDate(m[3]), to: null, quarterEnd: false, raw: m[0] });
    else if (m[4]) markers.push({ index: m.index, from: null, to: parseDate(m[4]), quarterEnd: true, raw: m[0] });
    else if (m[5]) markers.push({ index: m.index, from: parseDate(m[5]), to: parseDate(m[6]!), quarterEnd: false, raw: m[0] });
    else if (m[7]) markers.push({ index: m.index, from: parseDate(m[7]), to: parseDate(m[8]!), quarterEnd: false, raw: m[0] });
    else if (m[9]) markers.push({ index: m.index, from: parseDate(m[9]), to: parseDate(m[10]!), quarterEnd: false, raw: m[0] });
    else if (m[11]) markers.push({ index: m.index, from: parseDate(m[11]), to: null, quarterEnd: false, raw: m[0] });
    else if (m[12]) markers.push({ index: m.index, from: null, to: null, quarterEnd: false, raw: m[0] });
    if (m.index === PERIOD_MARKER_RE.lastIndex) PERIOD_MARKER_RE.lastIndex++;
  }
  if (markers.length < 2) return null;
  const drafts: RowDraft[] = markers.map((mk, i) => {
    const segEnd = markers[i + 1]?.index ?? text.length;
    return {
      effectiveFrom: mk.from,
      effectiveTo: mk.to,
      periodText: mk.raw,
      tokens: tokens.filter((t) => t.index >= mk.index && t.index < segEnd),
    };
  });
  // Normalize to uniform [from, to) selection semantics, in text order:
  // a "fiscal quarter ending D" row governs test dates in (prevD, D];
  // "thereafter" starts where the previous row stops.
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    if (markers[i]!.quarterEnd) {
      const prevTo = i > 0 ? drafts[i - 1]!.effectiveTo : null;
      if (d.effectiveTo) d.effectiveTo = addDays(d.effectiveTo, 1);
      d.effectiveFrom = prevTo;
    } else if (/thereafter/i.test(d.periodText) && d.effectiveFrom === null && i > 0) {
      d.effectiveFrom = drafts[i - 1]!.effectiveTo;
    }
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

export function parseCovenantLevel(input: ParseCovenantLevelInput): CovenantLevel {
  const text = (input.text ?? "").replace(/\s+/g, " ").trim();
  const reasons: string[] = [];
  const missing: string[] = [];
  const note = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const block = (reason: string, missingName: string) => {
    note(reason);
    if (!missing.includes(missingName)) missing.push(missingName);
  };

  const spans = sentenceSpans(text);
  const modifierHits = findModifiers(text);
  const modifiers: CovenantLevelModifier[] = modifierHits.map(({ start: _s, end: _e, ...mod }) => mod);
  const allTokens = findRatioTokens(text);
  // A token inside a modifier's own span is the modifier's amount, not a level.
  const tokens = allTokens.filter(
    (t) => !modifierHits.some((h) => t.index >= h.start && t.index < h.end),
  );

  const nameInText = RATIO_NAME_RE.exec(text)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const ratioName = input.ratioName ?? nameInText;
  const metric = metricForRatioName(ratioName) ?? metricFromInlineRatioOf(text);
  if (ratioName && metric === null) note("METRIC_IDENTITY_UNRESOLVED");

  const roleKind =
    roleFromFamily(input.sectionFamily) ??
    roleFromHeading(input.sectionHeading) ??
    roleFromHeading(input.articleHeading);

  if (tokens.length === 0) {
    if (modifierHits.some((h) => h.kind === "RELATIVE")) {
      block("RELATIVE_LEVEL_UNRESOLVED", "modifier: relative level reference");
    } else if (modifierHits.length > 0) {
      block("MODIFIER_WITHOUT_BASE_LEVEL", "baseLevel");
    }
    block("NO_RATIO_LEVEL_IN_TEXT", "level");
    return {
      status: "NEEDS_INPUT",
      reasons,
      missing,
      testKind: roleKind,
      direction: null,
      level: null,
      schedule: [],
      modifiers,
      metric,
      ratioName,
      citation: null,
    };
  }

  // ---- testKind: proviso guard > section role > wording fallback. ----
  let testKind: CovenantTestKind | null;
  if (spans.some((s) => incurrenceGuard(text, s.text))) {
    testKind = "INCURRENCE";
  } else if (roleKind) {
    testKind = roleKind;
  } else if (spans.some((s) => MAINTENANCE_FRAME_RE.test(s.text))) {
    testKind = "MAINTENANCE";
  } else {
    testKind = null;
    block("TEST_KIND_UNDETERMINED", "testKind");
  }

  // ---- level: schedule path or single-level path. ----
  const drafts = scheduleDrafts(text, tokens);
  const distinctValues = new Set(tokens.map((t) => t.canonical));
  let schedule: CovenantLevelScheduleRow[] = [];
  let level: string | null = null;
  let governing: RatioToken | null = null;
  let direction: CovenantLevelDirection | null = null;

  if (drafts && drafts.some((d) => d.tokens.length > 0) && distinctValues.size > 1) {
    const bound = new Set<RatioToken>();
    schedule = drafts.map((d) => {
      for (const t of d.tokens) bound.add(t);
      const first = d.tokens[0];
      if (!first) block("SCHEDULE_ROW_WITHOUT_LEVEL", "scheduleRowLevel");
      if (new Set(d.tokens.map((t) => t.canonical)).size > 1) block("SCHEDULE_ROW_AMBIGUOUS", "scheduleRowLevel");
      return {
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo,
        periodText: d.periodText,
        level: first?.canonical ?? "",
        raw: first?.raw ?? "",
        selected: false,
      };
    });
    const rowLevels = new Set(schedule.map((r) => r.level).filter(Boolean));
    for (const t of tokens) {
      if (!bound.has(t) && !rowLevels.has(t.canonical)) block("SCHEDULE_UNBOUND_RATIO", "scheduleRowLevel");
    }
    for (let i = 0; i < schedule.length; i++) {
      for (let j = i + 1; j < schedule.length; j++) {
        const a = schedule[i]!;
        const b = schedule[j]!;
        const aFrom = a.effectiveFrom ?? "0000-01-01";
        const aTo = a.effectiveTo ?? "9999-12-31";
        const bFrom = b.effectiveFrom ?? "0000-01-01";
        const bTo = b.effectiveTo ?? "9999-12-31";
        if (aFrom < bTo && bFrom < aTo) block("SCHEDULE_OVERLAP", "testDate");
      }
    }
    if (!missing.includes("scheduleRowLevel") && !missing.includes("testDate")) {
      if (!input.testDate) {
        block("TEST_DATE_REQUIRED_FOR_SCHEDULE", "testDate");
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.testDate)) {
        block("TEST_DATE_UNPARSEABLE", "testDate");
      } else {
        const d = input.testDate;
        const hitIdx = schedule.findIndex(
          (r) => (r.effectiveFrom === null || d >= r.effectiveFrom) && (r.effectiveTo === null || d < r.effectiveTo),
        );
        if (hitIdx < 0) {
          block("TEST_DATE_OUTSIDE_SCHEDULE", "testDate");
        } else {
          schedule[hitIdx]!.selected = true;
          level = schedule[hitIdx]!.level;
          governing = drafts[hitIdx]!.tokens[0] ?? null;
        }
      }
    }
    direction =
      (governing ? directionIn(sentenceAt(spans, governing.index).text) : null) ?? directionIn(text);
  } else {
    if (distinctValues.size > 1) {
      block("MULTIPLE_DISTINCT_LEVELS", "level");
    } else {
      governing = tokens[0]!;
      level = governing.canonical;
    }
    direction = governing ? directionIn(sentenceAt(spans, governing.index).text) : null;
  }

  if (direction === null) block("DIRECTION_UNDETERMINED", "direction");

  // ---- modifiers: an unresolvable one blocks, naming the modifier; a
  // relative level is never asserted as its base. ----
  for (const mod of modifiers) {
    if (mod.resolved) continue;
    if (mod.kind === "RELATIVE") {
      block("RELATIVE_LEVEL_UNRESOLVED", "modifier: relative level reference");
      level = null;
    } else {
      block("MODIFIER_UNRESOLVED", `modifier: ${mod.raw}`);
    }
  }

  return {
    status: missing.length > 0 ? "NEEDS_INPUT" : "DETERMINED",
    reasons,
    missing,
    testKind,
    direction,
    level,
    schedule,
    modifiers,
    metric,
    ratioName,
    citation: governing ? sentenceAt(spans, governing.index).text : null,
  };
}
