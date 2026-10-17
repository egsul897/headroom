/**
 * Consolidated EBITDA optimizer: the largest Consolidated EBITDA an agreement's own definition supports on the
 * borrower's public filings. General rules only (no per-issuer logic, no defaults, no AI):
 *   - Base and deductions come from evaluateDefinition (net income / EBIT base, exact deductions); any item that could
 *     lower the figure and is not in the filings keeps the whole result NEEDS_INPUT.
 *   - Every add-back the definition permits is claimed in full when the filings evidence it (TTM XBRL, same anchor as
 *     the base), capped by the definition's own cap: fixed dollars, % of Consolidated EBITDA (before or after giving
 *     effect to the add-back), greater-of / lesser-of, and shared caps across named clauses.
 *   - An add-back the filings do not evidence (run-rate synergies, non-recurring charges, sponsor fees …) is never filled
 *     in: it is NEEDS_INPUT, reported with the most it could add (its cap) when the cap is determinable.
 *   - "maximum" is set only when every add-back is fully evidenced; otherwise "supported" is the evidenced figure and
 *     "needsInput" lists what would raise it.
 */
import { borrowerInput, type IssuerFinancials } from "./companyfacts";
import { solveCapLp } from "./cap-lp";
import { CAP_ADVERB, IN_NO_EVENT, isInNoEventSubject } from "./cap-verb";
import { nonUsdCurrency } from "@/lib/contract-model/covenant-computation/currency";
import { CAPPED, COST_LIKE, HEADER, labelStyle, QUALIFIED, STOP, TWO_SIDED, definitionSegments, markers, evaluateDefinition, mapEbitdaItem, type DefinitionEvaluation } from "./definition-items";

export type AddBackCategory = "INTEREST" | "TAXES" | "D&A" | "STOCK_COMP" | "IMPAIRMENT" | "RESTRUCTURING" | "SEVERANCE" | "TRANSACTION_COSTS" | "INTEGRATION"
  | "DEBT_EXTINGUISHMENT" | "RUN_RATE_SYNERGIES" | "NON_RECURRING" | "NON_CASH" | "OTHER";
export interface CapSpec { text: string; kind: "FIXED" | "PERCENT" | "GREATER_OF" | "LESSER_OF" | "UNKNOWN"; dollars: bigint[]; percents: Array<{ num: bigint; den: bigint }>; giving: "BEFORE" | "AFTER" | "UNSTATED"; sharedWith: string[]; tiers?: Array<{ through: string | null; amount: bigint }>; escalation?: { base: bigint; baseYear: number; step: bigint };
  /** Cumulative cap over the life of the agreement ("during the term of this Agreement"): the room left depends on usage in prior periods, so the per-period amount is not determinable from the text. */
  lifetime?: boolean;
  /** Clause references the cap names that could not be bound to exactly one line: the cap's scope is unresolved (capped by an unknown amount, never uncapped). */
  unresolved?: string[] }
export interface AddBackLine {
  label: string; text: string; category: AddBackCategory;
  /** Filing evidence for the item (USD, TTM); null when nothing in the filings maps. */
  evidenced: string | null; concepts: Array<{ concept: string; value: string }>;
  coverage: "FULL" | "PARTIAL" | "NONE";
  cap: { text: string; amount: string | null; note: string } | null;
  /** Amount counted in the supported figure. */
  claimed: string;
  status: "CLAIMED" | "CAPPED" | "NEEDS_INPUT";
  /** The most this line could still add once evidenced (its cap less what is claimed); null when uncapped or unknown. */
  headroomToCap: string | null;
  /** The add-back needs lender/agent approval or consent: not counted unless a borrower input confirms it. */
  conditional?: "LENDER_APPROVAL"; conditionText?: string;
  /** Clauses sharing this line's cap (one limit across all of them), including this line; null when uncapped / sole. */
  capGroup?: string[] | null;
  /** Positions (indices in addBacks) of the clauses sharing the cap — labels can repeat across nesting levels. */
  capGroupAt?: number[] | null;
  note: string;
}
export interface EbitdaOptimization {
  term: string; periodEnd: string | null;
  status: "MAXIMIZED" | "NEEDS_INPUT";
  /** Labels of open add-backs that could lower the total (two-sided / income-like). Set on a supported result; empty = floor is a safe lower bound. */
  omittedTwoSided?: string[];
  /** Set when the definition came from a package-bound base agreement (CONFIRMED / LOWER_CONFIDENCE link). */
  bindingTier?: "CONFIRMED" | "LOWER_CONFIDENCE";
  /** Maximum Consolidated EBITDA; only when every add-back is evidenced and every cap determinable. */
  maximum: string | null;
  /** Base + exact deductions + evidenced (capped) add-backs; null when the base or a deduction is not derivable. */
  supported: string | null;
  base: { concept: string; value: string } | null; deductions: string | null;
  addBacks: AddBackLine[]; needsInput: string[]; reason: string;
  /** Sourced borrower-input keys the product can collect (CNI:… / ADDBACK:…); empty when none are named. */
  needsBorrowerInput: string[];
}

const EXTRA: Array<{ cat: AddBackCategory; re: RegExp; concepts: string[] }> = [
  { cat: "INTEGRATION", re: /\bintegration\b/i, concepts: ["BusinessCombinationIntegrationRelatedCosts"] },
  { cat: "TRANSACTION_COSTS", re: /\b(?:transactions?|acquisitions?|mergers?)\b[^;]{0,200}\b(?:costs?|fees|expenses?|charges?)\b|\b(?:costs?|fees|expenses?|charges?)\b[^;]{0,200}\b(?:transactions?|acquisitions?|mergers?)\b/i, concepts: ["BusinessCombinationAcquisitionRelatedCosts"] },
  { cat: "SEVERANCE", re: /\bseverance\b/i, concepts: ["SeveranceCosts1"] },
];

/** True when the head add-back is reduced by (other than|excluding|except …): claiming the full XBRL line would overstate. */
export function hardAddBackCarveOut(t: string): boolean {
  return /\b(?:interest\s+(?:expense|charges?)|(?:consolidated\s+)?depreciation(?:\s+and\s+amortization)?(?:\s+expense)?|(?:consolidated\s+)?amortization(?:\s+expense)?|fixed\s+charges)\b[^.;]{0,100}\(\s*(?:other\s+than|excluding|except)/i.test(t);
}

export function categorize(t: string): AddBackCategory {
  if (/run[- ]rate|cost\s+savings|synerg|operating\s+expense\s+reductions/i.test(t)) return "RUN_RATE_SYNERGIES";
  if (/(?:stock|equity|share)[- ]based\s+compensation|stock\s+options?|equity\s+awards?|non-?cash\s+(?:stock\s+)?compensation|stock\s+compensation/i.test(t)) return "STOCK_COMP";
  // "minority / non-controlling interest" (incl. "minority interest expense") is equity attribution, not borrowing cost.
  const minorityInterest = /\b(?:minority|non-?controlling)\s+interest\b/i.test(t);
  // Interest expense lines often say "inclusive of amortization of premiums / deferred financing" — that is INTEREST, not D&A.
  if (!minorityInterest && (/\binterest\s+(?:expense|charges?)\b/i.test(t) || /\bFixed\s+Charges\b/i.test(t) || /\b(?:net\s+)?finance\s+charges?\b/i.test(t))) return "INTEREST";
  // Strip "(other than depreciation/amortization…)" so transaction-cost lines are not miscategorized as D&A.
  const withoutOtherThanDa = t.replace(/\(\s*(?:other\s+than|excluding|except(?:\s+for)?)[^)]*(?:depreciation|amortization)[^)]*\)/gi, " ");
  if (/depreciation|amortization(?!\s+of\s+(?:deferred\s+)?(?:financing|debt|premiums?|discount|OID))/i.test(withoutOtherThanDa) && !/non-?cash\s+charges/i.test(t)) return "D&A";
  // "penalties and interest relating to such taxes" is TAXES, not INTEREST.
  if (/\btax(?:es)?\b/i.test(t) && !/\binterest\s+(?:expense|charges?)\b/i.test(t)) return "TAXES";
  if (!minorityInterest && /\binterest\b/i.test(t)) return "INTEREST";
  if (/\btax(?:es)?\b/i.test(t)) return "TAXES";
  if (/extinguishment/i.test(t)) return "DEBT_EXTINGUISHMENT";
  if (/restructuring/i.test(t)) return "RESTRUCTURING";
  if (/severance/i.test(t)) return "SEVERANCE";
  if (/integration/i.test(t)) return "INTEGRATION";
  if (/impairment|write-?(?:offs?|downs?)/i.test(t) && !/non-?cash\s+charges/i.test(t)) return "IMPAIRMENT";
  if (/non-?recurring|unusual|extraordinary|one-?time/i.test(t)) return "NON_RECURRING";
  if (/transaction|acquisition|merger|offering|issuance/i.test(t)) return "TRANSACTION_COSTS";
  if (/non-?cash/i.test(t)) return "NON_CASH";
  return "OTHER";
}

const CAP_RE = new RegExp(String.raw`${IN_NO_EVENT}|\b(?:(?:shall|may|does|do|will)\s+)?not\s*(?:to\s+)?${CAP_ADVERB}exceed(?:ing)?\b|` + /\bin\s+an\s+(?:aggregate\s+)?amount\s+(?:not\s+(?:in\s+excess\s+of|to\s+exceed)|up\s+to)\b|\bcapped\s+at\b|\bmaximum\s+of\b/.source, "i");
/**
 * Clause-reference grammar shared by every cap scope: label paths ("(b)(vii)"), lists joined by commas / and / or,
 * repeated "clause" words ("clause (b)(ix) and clause (b)(x)") and ranges ("(A) through (F)", "(d)–(f)", "(d) to (f)").
 */
const REF_LABEL = String.raw`\([ivxlA-Za-z\d]{1,5}\)`;
const REF_RUN = String.raw`(?:${REF_LABEL})+`;
const CLAUSE_WORD = String.raw`(?:sub-?)?(?:clauses?|paragraphs?)`;
const REF_SEP = String.raw`\s*(?:,\s*(?:and\s+|or\s+)?|and\/or\s+|and\s+|or\s+|through\s+|to\s+|[–—-]\s*)(?:${CLAUSE_WORD}\s+)?`;
export const REF_LIST_SOURCE = String.raw`${REF_RUN}(?:${REF_SEP}${REF_RUN})*`;
const LABEL_LIST = new RegExp(String.raw`\b${CLAUSE_WORD}\s+(${REF_LIST_SOURCE})`, "gi");

const ROMAN_SEQ = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx", "xxi", "xxii", "xxiii", "xxiv", "xxv", "xxvi", "xxvii", "xxviii", "xxix", "xxx", "xxxi", "xxxii", "xxxiii", "xxxiv", "xxxv"];
/**
 * Readings of the labels strictly between a and b (exclusive), one array per reading: digits; roman numerals; letters
 * ((a)…(z), then doubled (aa)…(zz)). "(i) through (v)" or "(v) through (x)" can be read either as roman numerals or as
 * letters, so both readings are returned and the caller keeps the one the definition's own labels support.
 */
function labelsBetween(a: string, b: string): string[][] {
  const x = a.slice(1, -1), y = b.slice(1, -1);
  if (/^\d+$/.test(x) && /^\d+$/.test(y)) { const n = +x, m = +y; return m > n && m - n <= 40 ? [Array.from({ length: m - n - 1 }, (_, k) => `(${n + k + 1})`)] : []; }
  const up = x !== x.toLowerCase();
  if (up !== (y !== y.toLowerCase())) return [];
  const out: string[][] = [];
  const rx = ROMAN_SEQ.indexOf(x.toLowerCase()), ry = ROMAN_SEQ.indexOf(y.toLowerCase());
  if (rx >= 0 && ry > rx) out.push(ROMAN_SEQ.slice(rx + 1, ry).map((r) => `(${up ? r.toUpperCase() : r})`));
  const run = (s: string) => /^[a-z]+$/i.test(s) && new Set(s.toLowerCase()).size === 1;
  if (run(x) && run(y)) {
    const ord = (s: string) => s.toLowerCase().charCodeAt(0) - 96 + 26 * (s.length - 1);
    const lab = (n: number) => { const s = String.fromCharCode(96 + ((n - 1) % 26) + 1).repeat(Math.floor((n - 1) / 26) + 1); return `(${up ? s.toUpperCase() : s})`; };
    const n = ord(x), m = ord(y);
    if (m > n && m - n <= 40) out.push(Array.from({ length: m - n - 1 }, (_, k) => lab(n + k + 1)));
  }
  return out;
}

/**
 * Clause references in a reference list, as label paths ("(b)(vii)" → ["(b)", "(vii)"]), with ranges expanded (expanded
 * labels inherit the first end's outer path). `has` tells whether a label exists in the definition: of several readings
 * of a range, the one whose labels all exist is kept. A range with no single supported reading is reported in
 * `unresolvedRanges` (the caller treats the cap's scope as unresolved).
 */
export function clauseRefPaths(list: string, has: (label: string) => boolean = () => true): { paths: string[][]; unresolvedRanges: string[] } {
  const paths: string[][] = [];
  const unresolvedRanges: string[] = [];
  let pendingRange = false;
  for (const m of list.matchAll(new RegExp(String.raw`(${REF_RUN})|\b(through|to)\b|([–—-])`, "gi"))) {
    if (m[2] || m[3]) { if (paths.length) pendingRange = true; continue; }
    const path = [...m[1]!.matchAll(/\([^)]+\)/g)].map((x) => x[0]);
    if (pendingRange) {
      pendingRange = false;
      const prev = paths.at(-1)!;
      const readings = labelsBetween(prev.at(-1)!, path.at(-1)!);
      const supported = readings.filter((r) => r.every(has));
      const pick = supported.length === 1 ? supported[0]! : null;
      if (pick) { const outer = path.length > 1 ? path.slice(0, -1) : prev.slice(0, -1); for (const l of pick) paths.push([...outer, l]); }
      else unresolvedRanges.push(`${prev.join("")}–${path.join("")}`);
    }
    paths.push(path);
  }
  return { paths, unresolvedRanges };
}

function decimal(s: string): { num: bigint; den: bigint } {
  const [a, b = ""] = s.replace(/,/g, "").split(".");
  return { num: BigInt(`${a}${b}`), den: 10n ** BigInt(b.length) };
}
function dollars(s: string): bigint | null {
  const m = /\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand)?/i.exec(s);
  if (!m) return null;
  const d = decimal(m[1]!);
  const mult = { billion: 1_000_000_000n, million: 1_000_000n, thousand: 1_000n }[(m[2] ?? "").toLowerCase() as "million"] ?? 1n;
  return (d.num * mult) / d.den;
}
/** "15.0% of Consolidated EBITDA", "twenty-five percent (25%) of such Person's Consolidated EBITDA". Other bases → null. */
function percentOfEbitda(s: string): { num: bigint; den: bigint } | null {
  const m = /(\d+(?:\.\d+)?)\s*%\s*\)?\s*of\s+(?:such\s+Person[’']s\s+|the\s+)?(?:Consolidated\s+)?(?:Adjusted\s+)?EBITDA\b/i.exec(s);
  if (!m) return null;
  const d = decimal(m[1]!);
  return { num: d.num, den: d.den * 100n };
}

const MONTHS: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
const isoDate = (d: string): string | null => { const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(d); const mo = m && MONTHS[m[1]!.toLowerCase()]; return m && mo ? `${m[3]}-${mo}-${m[2]!.padStart(2, "0")}` : null; };
const DATE = "[A-Z][a-z]+\\s+\\d{1,2},\\s*\\d{4}";
/** Date-tiered amounts ("… ending on or prior to June 30, 2026, $1,000,000, … ending after June 30, 2026 but on or prior to January 31, 2027, $900,000, and … ending thereafter, $750,000"). */
export function parseCapTiers(s: string): Array<{ through: string | null; amount: bigint }> | null {
  // Pair the i-th period phrase with the i-th amount; works whether amounts precede or follow their dates. Tiers may be
  // stated in any order; capAmount orders them by date. "fiscal year 2026" (fiscal year end not stated) is ambiguous.
  const pre = new RegExp([
    `(?:ending|ended)\\s+after\\s+${DATE}\\s+(?:but|and)\\s+on\\s+or\\s+(?:prior\\s+to|before)\\s+(${DATE})`,
    `(?:ending|ended)\\s+(?:on\\s+or\\s+(?:prior\\s+to|before)|before|through)\\s+(${DATE})`,
    `(?:fiscal\\s+(?:year|quarter)|period|Test\\s+Period)s?\\s+(?:ending|ended)\\s+(?:on\\s+)?(${DATE})`,
    `fiscal\\s+year\\s+(\\d{4})\\b`,
    `(?:ending|ended)\\s+after\\s+${DATE}|(?:ending\\s+)?thereafter`,
  ].join("|"), "gi");
  const periods = [...s.matchAll(pre)].map((m) => { const d = m[1] ?? m[2] ?? m[3]; return d ? isoDate(d) : m[4] ? `FY${m[4]}` : null; });
  const amts = [...s.matchAll(/\$\s*[\d,]+(?:\.\d+)?(?:\s*(?:billion|million|thousand))?/gi)].map((m) => dollars(m[0]));
  if (amts.length < 2 || amts.some((a) => a == null)) return null;
  const dated = periods.length > 0 || new RegExp(DATE).test(s);
  if (!dated) return null;
  // Periods and amounts do not pair up: keep the amounts with no usable period (capAmount then takes the lowest).
  if (periods.length !== amts.length) return amts.map((amount) => ({ through: "?", amount: amount! }));
  return periods.map((through, k) => ({ through, amount: amts[k]! }));
}

const MONEY = String.raw`\$\s*[\d,]+(?:\.\d+)?(?:\s*(?:billion|million|thousand))?`;
/** "$2.0 million during the 2024 Fiscal Year and increasing by $200,000 for each Fiscal Year thereafter". */
export function parseCapEscalation(s: string): { base: bigint; baseYear: number; step: bigint } | null {
  const m = new RegExp(`(${MONEY})\\s+(?:during|for|in)\\s+(?:the\\s+)?(?:(?:Borrower'?s?|Company'?s?)\\s+)?(?:(\\d{4})\\s+Fiscal\\s+Year|Fiscal\\s+Year\\s+(?:ending\\s+in\\s+)?(\\d{4}))\\s*,?\\s+(?:and\\s+)?(?:increasing|increased|to\\s+increase)\\s+by\\s+(${MONEY})\\s+(?:for|in|during)\\s+each\\s+(?:subsequent\\s+)?Fiscal\\s+Year(?:\\s+thereafter)?`, "i").exec(s);
  if (!m) return null;
  const base = dollars(m[1]!), step = dollars(m[4]!);
  return base != null && step != null ? { base, baseYear: +(m[2] ?? m[3])!, step } : null;
}

export function parseCap(t: string, from = 0): CapSpec | null {
  const c = parseCap0(t, from);
  if (!c) return c;
  const m0 = CAP_RE.exec(t.slice(from));
  const esc = m0 ? parseCapEscalation(t.slice(from + m0.index, from + m0.index + 400).split(/;/)[0]!) : null;
  if (esc) return { ...c, kind: "FIXED", dollars: [esc.base], percents: [], escalation: esc };
  const tiers = m0 ? parseCapTiers(t.slice(from + m0.index, from + m0.index + 700).split(/;|\.\s+[A-Z“"]/)[0]!) : null;
  return tiers ? { ...c, kind: "FIXED", dollars: tiers.map((x) => x.amount), percents: [], tiers } : c;
}

function parseCap0(t: string, from = 0): CapSpec | null {
  const m0 = CAP_RE.exec(t.slice(from));
  if (!m0) return null;
  const m = Object.assign([...m0], { index: m0.index + from }) as unknown as RegExpExecArray;
  const pre = t.slice(Math.max(0, m.index - 300), m.index);
  // "in no event shall <subject> exceed X": the amount follows the verb; the subject stays in the cap text (it is the
  // cap's scope, never part of what the clause adds back).
  const verbAt = isInNoEventSubject(m[0]) ? m[0].toLowerCase().lastIndexOf("exceed") : 0;
  let w = t.slice(m.index, m.index + verbAt + 450);
  w = w.slice(0, (/;|\.\s+[A-Z]|,\s*\((?:[ivxl]{1,5}|[a-z]{1,2}|\d{1,2})\)\s/.exec(w.slice(m[0].length))?.index ?? w.length) + m[0].length);
  const sharedWith: string[] = [];
  const scope = `${/(?:pursuant\s+to|under|in\s+reliance\s+on)\s+(?:this\s+)?clauses?[^;]*$/i.exec(pre)?.[0] ?? ""} ${/together\s+with[^,;]{0,200}/i.exec(w)?.[0] ?? ""}`;
  for (const lm of scope.matchAll(LABEL_LIST)) for (const p of clauseRefPaths(lm[1]!).paths) sharedWith.push(p.at(-1)!);
  const body = w.slice(verbAt).replace(/together\s+with[^,;]{0,200}?,/i, " ");
  const giving: CapSpec["giving"] = /after\s+giving\s+effect/i.test(w) ? "AFTER" : /(?:before|prior\s+to|without)\s+giving\s+effect/i.test(w) ? "BEFORE" : "UNSTATED";
  const limbs = (s: string) => {
    const d = dollars(s), p = percentOfEbitda(s);
    return { dollars: d != null ? [d] : [], percents: p ? [p] : [], known: d != null || !!p };
  };
  const go = /the\s+(greater|lesser)\s+of\s+(.*)/i.exec(body);
  if (go && nonUsdCurrency(body)) return { text: w, kind: "UNKNOWN", dollars: [], percents: [], giving, sharedWith };
  if (go) {
    const parts = go[2]!.split(/\s+and\s+(?=\(?(?:ii|b|2|y)\)|\$|\d)/i).slice(0, 2).map(limbs);
    const kind = go[1]!.toLowerCase() === "greater" ? "GREATER_OF" : "LESSER_OF";
    if (parts.length < 2 || parts.some((p) => !p.known)) return { text: w, kind: kind === "GREATER_OF" && parts.some((p) => p.known) ? "GREATER_OF" : "UNKNOWN", dollars: parts.flatMap((p) => p.dollars), percents: parts.flatMap((p) => p.percents), giving, sharedWith };
    return { text: w, kind, dollars: parts.flatMap((p) => p.dollars), percents: parts.flatMap((p) => p.percents), giving, sharedWith };
  }
  const l = limbs(body);
  // A cap stated in another currency ("A$5.0 million", "€4,000,000") is held: it is never read as US dollars.
  if (nonUsdCurrency(body)) return { text: w, kind: "UNKNOWN", dollars: [], percents: [], giving, sharedWith };
  if (/\[\s*\*+\s*\]/.test(body) || !l.known) return { text: w, kind: "UNKNOWN", dollars: [], percents: [], giving, sharedWith };
  return { text: w, kind: l.dollars.length ? "FIXED" : "PERCENT", ...l, giving, sharedWith };
}

/** One cap condition in a clause: its amount and the clauses it names (empty = the clause that states it). */
export interface CapCondition { spec: CapSpec; labels: string[]; withHost: boolean; at: number;
  /** The raw clause-reference lists the condition names ("(d) through (f)", "(b)(ix) and clause (b)(x)"), resolved against the definition's lines by the optimizer. */
  refLists?: string[];
  /** Same lists, flagged when written deictically ("this clause (i)"): the reference is to the clause that contains the statement. */
  refs?: Array<{ list: string; deictic: boolean }>;
  /** References into another definition or section named alongside this definition's clauses: the cap is shared with amounts outside this definition. */
  externalShare?: string[] }
const SCOPE_RE = new RegExp(String.raw`(?:pursuant\s+to|under|in\s+reliance\s+on|in\s+respect\s+of|made\s+under|by\s+reference\s+to|in\s+accordance\s+with|(?:described|set\s+forth|referred\s+to|specified|listed)\s+in|contemplated\s+by|permitted\s+by)\s+(this\s+|such\s+|the\s+foregoing\s+|each\s+of\s+)?${CLAUSE_WORD}\s+(${REF_LIST_SOURCE})`, "gi");
/** A reference into another definition, section or document ("clause (4) of the definition of 'Permitted Debt'", "clause (c) of Section 6.02"): never a line of this definition. */
const EXTERNAL_TAIL = /^\s*(?:above|below|hereof)?\s*,?\s*(?:of|in|under|contained\s+in|set\s+forth\s+in)\s+(?:the\s+)?(?:definition\s+of\b(?!\s*(?:the\s+)?[“"'‘]?(?:Consolidated\s+|Adjusted\s+)*EBITDA[”"'’]?)|defined\s+term\b|Sections?\s+\d|Articles?\s+[\dIVXL]|Schedules?\b|Exhibits?\b|[“"'‘])/i;
/**
 * Cumulative cap over the life of the agreement: "during the term of this Agreement", "over the life of the facility",
 * "for all periods", "in the aggregate since the Closing Date". Its per-period room depends on prior usage.
 */
export const PER_PERIOD_CAP = /\b(?:for|in|during|with\s+respect\s+to)\s+(?:any|each|such|the\s+applicable|a\s+single)\s+(?:such\s+)?(?:(?:four|4)[- ](?:consecutive\s+)?(?:fiscal\s+)?quarters?\s+)?(?:Test\s+|Measurement\s+|Reference\s+|Calculation\s+|Relevant\s+)?(?:period|fiscal\s+(?:year|quarter)|year|quarter)s?\b|\bper\s+(?:fiscal\s+)?(?:year|annum|quarter|period)\b|\bin\s+any\s+(?:fiscal\s+)?year\b/i;
export const LIFETIME_CAP = /\b(?:during|over|throughout)\s+the\s+(?:term|life)\s+(?:hereof\b|of\s+(?:this|the)\s+(?:(?:Credit|Loan)\s+)?(?:Agreement|Facility|Facilities|Credit\s+Facilit(?:y|ies)|Loans?|Term\s+Loans?|Commitments?)\b)|\bfor\s+all\s+(?:such\s+)?(?:Test\s+|fiscal\s+|Measurement\s+)?periods\b|\bfrom\s+and\s+after\s+the\s+(?:Closing|Effective|Restatement|Amendment)\s+(?:Effective\s+)?Date\b|\bin\s+the\s+aggregate\s+(?:since|after|from)\s+the\s+(?:Closing|Effective|Restatement|Amendment)\s+(?:Effective\s+)?Date\b|\bcumulative(?:ly)?\b(?=[^.;]{0,80}\b(?:shall\s+not|not\s+to)\s+exceed)|\bnot\s+(?:to\s+)?cumulatively\s+exceed\b/i;
/**
 * Every cap condition in a clause, each extracted on its own wherever it is written ("… clauses (d) and (e) shall not
 * exceed $100M and … clauses (e) and (f) shall not exceed $50M"). A condition's scope is the "pursuant to clauses …"
 * phrase written since the previous condition; "together with amounts under clause (e)" adds (e) to the stating clause;
 * no named clause means the stating clause itself.
 */
const MEASURE_PAREN = /\((?:[^()]|\([^()]*\))*?\b(?:giving\s+effect|calculated|determined|computed|measured|before|prior\s+to|after)\b(?:[^()]|\([^()]*\))*\)/gi;
export function extractCaps(full: string, ownLabel: string): CapCondition[] {
  const out: CapCondition[] = [];
  const g = new RegExp(CAP_RE.source, "gi");
  let prevEnd = 0;
  for (let m = g.exec(full); m && out.length < 8; m = g.exec(full)) {
    const spec = parseCap(full, m.index);
    if (!spec) break;
    let seg = full.slice(prevEnd, m.index);
    const clauseSeg = seg.slice(seg.lastIndexOf(";") + 1);
    seg = clauseSeg.slice(-300);
    // The deictic self-reference ("this clause (c)(ix) (other than … a long carve-out …) … shall not exceed") is never
    // dropped by the window: the last one in the condition, however far back, is kept (blanked out of the window copy).
    const farSelf = clauseSeg.length > 300 ? [...clauseSeg.slice(0, -300).matchAll(new RegExp(SCOPE_RE.source, "gi"))].filter((sm) => /^this\b/i.test(sm[1] ?? "")).pop() : undefined;
    // The scope is the cap's subject. A parenthetical that only says how the cap base is measured (a "computed before
    // / after giving effect to …" aside, even one that mentions a clause) names no scope.
    seg = seg.replace(MEASURE_PAREN, (x) => " ".repeat(x.length));
    // A carve-out names what the cap does not cover ("(other than amounts under clause (k), which do not count against
    // the limit)"): never the cap's scope.
    seg = seg.replace(/\((?:other\s+than|excluding|not\s+including|except)\b[^()]*(?:\([^()]*\)[^()]*)*\)/gi, (x) => " ".repeat(x.length));
    // Every scope phrase since the previous condition ("pursuant to this clause (1)(l), together with … pursuant to clauses
    // (1)(k) and (1)(q)"). "clause (b)(viii)" is one path: keep the innermost label of each adjacent run.
    const found: Array<{ list: string; deictic: boolean; external: boolean; at?: number }> = [...seg.matchAll(SCOPE_RE)].map((sm) => ({ list: sm[2]!, deictic: /^this\b/i.test(sm[1] ?? ""), external: EXTERNAL_TAIL.test(seg.slice(sm.index! + sm[0].length)), at: sm.index! }));
    if (farSelf && !found.some((r) => r.deictic)) found.unshift({ list: farSelf[2]!, deictic: true, external: false, at: 0 });
    // "in no event shall <subject> exceed": every clause list in the subject is the scope, whatever word introduces it.
    if (isInNoEventSubject(m[0])) {
      const subj = m[0].replace(MEASURE_PAREN, (x) => " ".repeat(x.length));
      for (const lm of subj.matchAll(new RegExp(String.raw`(this\s+|such\s+)?\b${CLAUSE_WORD}\s+(${REF_LIST_SOURCE})`, "gi"))) found.push({ list: lm[2]!, deictic: /^this\b/i.test(lm[1] ?? ""), external: EXTERNAL_TAIL.test(subj.slice(lm.index! + lm[0].length)), at: seg.length });
    }
    // A reference into another definition or section is not a line here. Alone it names what the line adds back, so the
    // cap is the stating line's own; next to references to this definition's clauses it means the cap is shared with
    // amounts outside this definition, so the room left here is not determinable (capped-unknown).
    // Only an outside reference inside the cap condition itself (after its "provided that") shares the cap; one in the
    // text describing what the line adds back ("as described in clause (4) of the definition of …") does not.
    const lead = Math.max(seg.search(/provided(?:,\s*however,?)?\s+(?:further\s+)?that(?![\s\S]*provided)/i), 0);
    const external = found.filter((r) => r.external && (r.at ?? 0) >= lead).map((r) => r.list);
    const refs = found.filter((r) => !r.external).map(({ list, deictic }) => ({ list, deictic }));
    const refLists = refs.map((r) => r.list);
    let labels = refLists.flatMap((l) => clauseRefPaths(l).paths.map((p) => p.at(-1)!));
    let withHost = !labels.length;
    const tw = /together\s+with[^,;]{0,200}/i.exec(full.slice(m.index, m.index + 450));
    if (tw) { for (const lm of tw[0].matchAll(LABEL_LIST)) { if (EXTERNAL_TAIL.test(tw[0].slice(lm.index! + lm[0].length))) { external.push(lm[1]!); continue; } refLists.push(lm[1]!); refs.push({ list: lm[1]!, deictic: false }); for (const p of clauseRefPaths(lm[1]!).paths) labels.push(p.at(-1)!); } withHost = true; }
    if (labels.some((l) => l.toUpperCase() === ownLabel.toUpperCase())) withHost = true;
    labels = [...new Set(labels.filter((l) => l.toUpperCase() !== ownLabel.toUpperCase()))];
    // Lifetime language in the scope phrase or the cap itself ("… pursuant to this clause (v) during the term of this
    // Agreement shall not exceed $1,000,000").
    const window = `${seg.slice(-250)} ${spec.text}`;
    // "… $15.0 million for any such period during the term of this Agreement" is a per-period cap: a per-period phrase
    // in the same condition wins.
    const lifetime = LIFETIME_CAP.test(window) && !PER_PERIOD_CAP.test(window);
    out.push({ spec: { ...spec, sharedWith: labels, ...(lifetime ? { lifetime: true } : {}) }, labels, withHost, at: m.index, refLists, refs, ...(external.length && (refs.length || tw) ? { externalShare: external } : {}) });
    prevEnd = m.index + m[0].length;
  }
  return out;
}

/** Cap amount in USD given EBITDA before the capped add-backs (e0). AFTER: x ≤ p(e0 + x) ⇒ x ≤ p·e0 / (1 − p). */
/**
 * Fiscal year label of a period end from the agreement's "Fiscal Year" definition: only when it states a fixed calendar
 * year end (e.g. "December 31") and how years are numbered (calendar year ending December 31 is unambiguous; otherwise a
 * clause tying a numbered Fiscal Year to the calendar year in which it ends). Else null.
 */
/** Lower of two fiscal-year readings (either may be absent). */
const minYear = (a: number | null, b: number | null): number | null => (a == null ? b : b == null ? a : Math.min(a, b));

export function agreementFiscalYear(text: string, periodEnd: string | null): number | null {
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return null;
  const def = /[“"]Fiscal\s+Year[”"]\s+(?:means|shall\s+mean)([^.;]{0,300})/i.exec(text)?.[1];
  if (!def || /\b(?:closest|nearest|last\s+(?:Sunday|Saturday|Friday))\b|52|53/i.test(def)) return null;
  const m = new RegExp(`end(?:ing|s)?\\s+(?:on\\s+)?([A-Z][a-z]+\\s+\\d{1,2})\\b`).exec(def);
  const iso = m ? isoDate(`${m[1]}, 2000`) : null;
  if (!iso) return null;
  const endMd = iso.slice(5), y = +periodEnd.slice(0, 4);
  const endsInYear = endMd === "12-31" || /(?:Fiscal\s+Year\s+(?:ending|ended)\s+(?:in|during)|corresponding\s+to)[^.;]{0,80}calendar\s+year|calendar\s+year\s+in\s+which\s+(?:such\s+)?Fiscal\s+Year\s+ends/i.test(text);
  if (!endsInYear) return null;
  return periodEnd.slice(5) <= endMd ? y : y + 1;
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx", "xxi", "xxii", "xxiii", "xxiv", "xxv"];
/** Position of an enumerator in its own sequence ("(c)" 3, "(iv)" 4, "(12)" 12); -1 when unreadable. */
function ordinalOf(label: string): number {
  const x = label.slice(1, -1).toLowerCase();
  if (/^\d+$/.test(x)) return +x;
  if (ROMAN.includes(x)) return ROMAN.indexOf(x) + 1;
  return /^[a-z]$/.test(x) ? x.charCodeAt(0) - 96 : /^([a-z])\1$/.test(x) ? x.charCodeAt(0) - 70 : -1;
}

export function capAmount(c: CapSpec, e0: bigint | null, periodEnd: string | null = null, fiscalYear: number | null = null): { amount: bigint | null; note: string; ceiling?: bigint } {
  // Unresolved scope or a cumulative (life-of-agreement) cap: the room needs an input the text does not give (usage under
  // the other clauses, or in prior periods), so it is never counted. The stated amount is still read and shown as the
  // ceiling: room is at most that amount, less the missing usage.
  if (c.unresolved?.length || c.lifetime) {
    const inner = capAmount({ ...c, unresolved: undefined, lifetime: undefined }, e0, periodEnd, fiscalYear).amount;
    const at = inner != null ? `at most $${inner.toLocaleString("en-US")}, ` : "";
    const why = c.unresolved?.length
      ? `less any usage under ${c.unresolved.join(", ")} (cap scope unresolved: not bound to exactly one clause of this definition; needs input)`
      : "less amounts added back in prior periods (cumulative cap over the term of the agreement; needs input)";
    return { amount: null, note: `${at}${why}`, ...(inner != null ? { ceiling: inner } : {}) };
  }
  // Date-tiered cap: the tier covering the measured period end; unknown period end → the lowest tier (safe).
  // Escalating cap: base amount in the base fiscal year plus the step for each later fiscal year. The fiscal year is the
  // filer's XBRL fiscal-year focus for the measured period, else one derived from the agreement's Fiscal Year definition;
  // otherwise the lowest year the period end could be labelled (the year before its calendar year). Unknown period → base.
  if (c.escalation) {
    const { base, baseYear, step } = c.escalation;
    const fy = fiscalYear ?? (periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? +periodEnd.slice(0, 4) - 1 : null);
    if (fy == null) return { amount: base, note: "escalating cap: fiscal year not determinable; base amount used" };
    const n = BigInt(Math.max(0, fy - baseYear));
    return { amount: base + step * n, note: `escalating cap: fiscal year ${fy}${fiscalYear == null ? " (lowest candidate)" : ""}; ${baseYear} base + ${n} step(s)` };
  }
  if (c.tiers?.length) {
    const lowest = () => ({ amount: c.tiers!.reduce((a, x) => (x.amount < a ? x.amount : a), c.tiers![0]!.amount), note: "date-tiered cap: tier not determinable; lowest tier used" });
    const iso = (x: string | null) => x != null && /^\d{4}-\d{2}-\d{2}$/.test(x);
    const open = c.tiers.filter((x) => x.through == null);
    if (!periodEnd || !iso(periodEnd) || c.tiers.some((x) => x.through != null && !iso(x.through)) || open.length > 1) return lowest();
    // Any stated order: dated tiers ascending, the "thereafter" tier last.
    const ordered = c.tiers.filter((x) => x.through != null).sort((a, b) => (a.through! < b.through! ? -1 : a.through! > b.through! ? 1 : 0));
    if (new Set(ordered.map((x) => x.through)).size !== ordered.length) return lowest();
    const tier = ordered.find((x) => periodEnd <= x.through!) ?? open[0];
    if (!tier) return lowest();
    return { amount: tier.amount, note: `date-tiered cap: tier for period ending ${periodEnd}` };
  }
  if (c.kind === "UNKNOWN" && !c.dollars.length && !c.percents.length) return { amount: null, note: "cap amount not determinable from the definition" };
  const pcts = c.percents.map((p) => {
    if (e0 == null) return null;
    if (e0 <= 0n) return 0n;
    return c.giving === "AFTER" ? (p.num * e0) / (p.den - p.num) : (p.num * e0) / p.den;
  });
  if (pcts.some((x) => x == null)) {
    if (c.kind === "GREATER_OF" && c.dollars.length) return { amount: c.dollars.reduce((a, b) => (a > b ? a : b)), note: "greater-of: % limb needs EBITDA; fixed limb used (cap may be higher)" };
    return { amount: null, note: "% of Consolidated EBITDA cap needs a determinable EBITDA" };
  }
  const all = [...c.dollars, ...(pcts as bigint[])];
  const amt = c.kind === "LESSER_OF" ? all.reduce((a, b) => (a < b ? a : b)) : all.reduce((a, b) => (a > b ? a : b));
  const note = c.kind === "UNKNOWN" ? "greater-of with an undeterminable limb: known limb used (cap may be higher)"
    : c.percents.length && c.giving === "UNSTATED" ? "% cap: computed before giving effect to the capped add-backs (conservative)" : "";
  return { amount: amt, note };
}

const usd = (n: bigint) => n.toString();
/** Add-back conditioned on lender / agent approval or consent. */
export const NEEDS_APPROVAL = new RegExp(String.raw`\b(?:approved|consented\s+to|verified)\b(?:\s+(?:and|or)\s+(?:approved|verified))?(?:\s+(?:in\s+advance|in\s+writing|in\s+(?:its|their)\s+(?:reasonable\s+|sole\s+)?discretion|prior\s+to\s+(?:such\s+)?\w+))*\s+by\s+(?:the\s+|each\s+|all\s+)?(?:(?:Administrative|Collateral)\s+)?(?:Agent|(?:(?:Required|Majority|Requisite|Supermajority|Super-Majority)\s+)?(?:Revolving\s+|Term\s+)?Lenders?)\b(?:\s+(?:in\s+advance|in\s+writing|in\s+(?:its|their)\s+(?:reasonable\s+|sole\s+)?discretion|prior\s+to\s+(?:such\s+)?\w+))*|\b(?:with|subject\s+to|upon|requires?|requiring)\s+(?:the\s+)?(?:prior\s+)?(?:written\s+)?(?:consent|approval)\s+of\s+(?:the\s+|each\s+|all\s+)?(?:(?:Administrative|Collateral)\s+)?(?:Agent|(?:(?:Required|Majority|Requisite|Supermajority|Super-Majority)\s+)?(?:Revolving\s+|Term\s+)?Lenders?)\b|\b(?:reasonably\s+)?(?:mutually\s+)?(?:acceptable|satisfactory)\s+to\s+(?:the\s+Borrower\s+and\s+)?(?:the\s+|each\s+|all\s+)?(?:(?:Administrative|Collateral)\s+)?(?:Agent|(?:(?:Required|Majority|Requisite|Supermajority|Super-Majority)\s+)?(?:Revolving\s+|Term\s+)?Lenders?)\b|\b(?:the\s+|each\s+|all\s+)?(?:(?:Administrative|Collateral)\s+)?(?:Agent|(?:(?:Required|Majority|Requisite|Supermajority|Super-Majority)\s+)?(?:Revolving\s+|Term\s+)?Lenders?)\s+(?:has|have|shall\s+have)\s+(?:(?:previously|expressly)\s+)?(?:consented|approved|agreed)\b(?:\s+(?:thereto|to\s+such|in\s+writing))?|\b(?:the\s+|each\s+|all\s+)?(?:(?:Administrative|Collateral)\s+)?(?:Agent|(?:(?:Required|Majority|Requisite|Supermajority|Super-Majority)\s+)?(?:Revolving\s+|Term\s+)?Lenders?)\s+(?:has|have|shall\s+have|did|do|does)\s+not\s+(?:objected|object|disapproved|disapprove)\b(?:\s+(?:thereto|to\s+such))?|\bnot\s+(?:been\s+)?(?:objected\s+to|disapproved)\s+by\s+(?:the\s+|each\s+|all\s+)?(?:(?:Administrative|Collateral)\s+)?(?:Agent|(?:(?:Required|Majority|Requisite|Supermajority|Super-Majority)\s+)?(?:Revolving\s+|Term\s+)?Lenders?)\b|\bunless\s+(?:the\s+|each\s+|all\s+)?(?:(?:Administrative|Collateral)\s+)?(?:Agent|(?:(?:Required|Majority|Requisite|Supermajority|Super-Majority)\s+)?(?:Revolving\s+|Term\s+)?Lenders?)\s+(?:has|have|shall\s+have)\s+(?:(?:reasonably|timely)\s+)?(?:objected|disapproved)\b|\bnot\s+(?:been\s+)?objected\s+to\s+by\s+any\s+(?:(?:Required|Majority)\s+)?Lenders?\b|\bunless\s+(?:the\s+|each\s+|all\s+|any\s+)?(?:(?:Administrative|Collateral)\s+)?(?:Agent|(?:(?:Required|Majority|Requisite|Supermajority|Super-Majority)\s+)?(?:Revolving\s+|Term\s+)?Lenders?)\s+(?:objects?|shall\s+object|reasonably\s+objects?)\b`, "gi");
/** First approval condition on the add-back itself (not on a third party, e.g. an accounting firm acceptable to the Agent). */
export function approvalCondition(full: string): string | null {
  // Only the clause's own sentence; an alternative route ("… or (E) approved by the Agent", "otherwise acceptable to the
  // Agent") or an evidentiary standard ("evidence reasonably satisfactory to the Agent") is not an approval requirement.
  const own = full.slice(0, /\.\s+(?:[A-Z(“"]|For\b)/.exec(full)?.index ?? full.length);
  for (const m of own.matchAll(NEEDS_APPROVAL)) {
    const before = own.slice(Math.max(0, m.index! - 100), m.index!);
    if (/(?:\bor|\botherwise)\s+(?:\([A-Za-z\d]{1,4}\)\s*)?(?:(?:in\s+a\s+manner\s+)?otherwise\s+)?(?:as\s+)?(?:reasonably\s+)?$/i.test(before)) continue;
    if (/\b(?:evidence|documentation|support)\b[^;]{0,30}$/i.test(before)) continue;
    // A third party qualified by the phrase ("any other accounting firm reasonably acceptable to the Agent"); a separate
    // requirement after a verification step ("verified by the Borrower's accountants and approved by the Lenders") binds.
    const third = /\b(?:firm|accountants?|auditors?|consultants?|advisors?|appraisers?|report|person|institution|bank|provider)s?\b([^;]{0,60})$/i.exec(before);
    if (third && !/\b(?:and|but)\s+(?:(?:has|have|shall\s+have|is|are|shall\s+be)\s+(?:been\s+)?)?$/i.test(third[1]!)) continue;
    return own.slice(Math.max(0, m.index! - 150), m.index! + m[0].length).replace(/\s+/g, " ").trim();
  }
  return null;
}

/** Group sign per enumerated item, by the same rules as evaluateDefinition (used when the base fails and no items come back). */
function itemSigns(segs: Array<{ text: string }>): Array<{ sign: "+" | "-"; header: boolean }> {
  let sign: "+" | "-" | "?" = "+";
  const lead0 = segs[0]!.text;
  for (const m of markers(lead0)) sign = m;
  if (/\bincreas/i.test(lead0) && !/\bdecreas|deducted/i.test(lead0)) sign = "-";
  if (/net\s+income/i.test(lead0) && /\bexcluding\s+the\s+following\b/i.test(lead0) && /to\s+the\s+extent\s+included/i.test(lead0)) sign = "+";
  return segs.slice(1).map((s) => {
    const t = s.text;
    const header = /\bthe\s+following\b|:\s*$/.test(t) && t.length < 300;
    if (header) { for (const m of markers(t)) sign = m; if (/\bto\s+the\s+extent\s+(?:increasing|included\s+in)/i.test(t)) sign = "-"; }
    const g = sign === "-" ? "-" : "+";
    if (!header) for (const m of markers(t.slice(-30))) sign = m;
    const descr = t.replace(HEADER, "").trim();
    return { sign: g, header: header || descr.length < 3 || (!COST_LIKE.test(descr) && HEADER.test(t)) };
  });
}

/** Pull CNI:/ADDBACK: keys named in optimizer reasons (product path when filings lack the figure). */
export function borrowerInputKeysFromText(...parts: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (!p) continue;
    for (const m of p.matchAll(/\b((?:CNI|ADDBACK):[A-Za-z0-9_()<-][A-Za-z0-9_()<>-]*)/g)) {
      const k = m[1]!.replace(/<clause>/gi, "").replace(/<>/g, "").replace(/_+$/, "");
      if (!k.includes(":") || k.endsWith(":") || seen.has(k.toUpperCase())) continue;
      // Drop placeholder forms like CNI:<clause>
      if (/[<>]/.test(k)) continue;
      seen.add(k.toUpperCase());
      out.push(k);
    }
  }
  return out;
}

// "income" counts only as a tax base inside a pure tax phrase ("foreign income and franchise taxes", "income, franchise
// and similar taxes", "based on income"); anything else naming income or gains stays open (fail closed).
const TAX_BASE = /\bincome(?:,?\s+(?:and|or|franchise|withholding|excise|capital|gross\s+receipts|similar|other|foreign|state|local|federal|provincial))*\s+tax(?:es)?\b(?!\s+(?:receivable|equity))/gi;
// Mentions that do not make an add-back line two-sided:
//  - a recapture condition ("cash receipts … to the extent non-cash gains relating to such income were deducted … for
//    any previous period") — the add-back is the receipt, conditioned on prior gains;
//  - "losses on <instrument> … net of … gains on such <instrument>" — a net-losses add-back on the same instrument.
const NON_OPERATIVE_GAIN = [
  /\bto\s+the\s+extent\b[^;]{0,40}\bgains?\b[^;]{0,120}?\b(?:were|was)\s+(?:deducted|excluded)\b[^;]{0,160}?\b(?:previous|prior)\s+(?:fiscal\s+)?periods?\b/gi,
  /\bnet\s+of\b(?:(?!\bincome\b)[^;]){0,80}?\bgains?\s+on\s+such\s+(?:[A-Za-z]+\s+){0,3}?(?:Obligations?|instruments?|agreements?|arrangements?|contracts?)\b/gi,
];
export const namesGainOrIncome = (s: string): boolean => /\bgains?\b|\bincome\b/i.test(NON_OPERATIVE_GAIN.reduce((a, re) => (re.test(a) && /\blosses?\b|cash\s+receipts/i.test(a) ? a.replace(re, " ") : a), s).replace(TAX_BASE, " ").replace(/\b(?:Consolidated\s+)?Net\s+Income\b|\bbased\s+on\s+income\b|\bnet\s+income\s+\(loss\)/gi, " "));

/** The input key for an add-back line: plain when its label is unique in the schedule, position-specific otherwise. */
export function addBackInputKey(addBacks: ReadonlyArray<{ label: string }>, position: number): string {
  const label = addBacks[position]!.label;
  return addBacks.filter((l) => l.label.toUpperCase() === label.toUpperCase()).length > 1 ? `ADDBACK:${label}@${position}` : `ADDBACK:${label}`;
}

export function optimizeConsolidatedEbitda(term: string, text: string, fin: IssuerFinancials): EbitdaOptimization {
  const ev: DefinitionEvaluation = evaluateDefinition("EBITDA", term, text, fin);
  const segs = definitionSegments("EBITDA", term, text);
  const out = (o: Partial<EbitdaOptimization>): EbitdaOptimization => {
    const merged = { term, periodEnd: fin.anchor ?? null, status: "NEEDS_INPUT" as const, maximum: null, supported: null, base: ev.base, deductions: null, addBacks: [], needsInput: [] as string[], reason: ev.reason, needsBorrowerInput: [] as string[], ...o };
    if (!o.needsBorrowerInput) merged.needsBorrowerInput = borrowerInputKeysFromText(merged.reason, ...merged.needsInput);
    return merged;
  };
  if (!segs) return out({ needsInput: [`"${term}" definition`] });
  // Meta items ((base)/(net)/(cap)/(formula)) are not enumerated schedule lines — exclude from alignment.
  const lineItems = ev.items.filter((i) => !/^\((?:base|net|cap|formula)\)$/i.test(i.label));
  const aligned = lineItems.length === segs.length - 1;
  const signs = itemSigns(segs);
  const raw = segs.slice(1).map((s, i) => ({ full: s.text, it: aligned ? { ...lineItems[i]! } : { label: s.label, text: s.text, sign: signs[i]!.sign, coverage: signs[i]!.header ? "HEADER" as const : "NONE" as const, concepts: [] as Array<{ concept: string; value: string }>, value: "0", note: "" } }));
  // Sub-clauses inside a line item ("provided that (A) … (C) the aggregate … shall not exceed", "including (i) … (ii)")
  // belong to that item: an enumerator of a different style from the item list, not introduced by a sign connector.
  const style = (l: string) => /^\((?:[ivxl]+)\)$/.test(l) ? "roman" : /^\([a-z]{1,2}\)$/.test(l) ? "lower" : /^\([A-Z]{1,2}\)$/.test(l) ? "upper" : "digit";
  // The item list is the style with the longest strictly increasing ordinal run ((a)…(f) beats repeated (i),(ii)).
  const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50 };
  const ordinal = (l: string) => { const x = l.slice(1, -1); if (/^\d+$/.test(x)) return +x; if (style(l) === "roman") { let n = 0; for (let k = 0; k < x.length; k++) { const v = ROMAN[x[k]!]!, nx = ROMAN[x[k + 1] ?? ""] ?? 0; n += v < nx ? -v : v; } return n; } return x.toLowerCase().charCodeAt(0) - 96 + 26 * (x.length - 1); };
  // Letter vs roman by sequence context: "(i)" right after "(h)" (or "(v)" after "(u)", "(x)" after "(w)", "(l)" after
  // "(k)"), or followed by the next letter ("(x)" then "(y)"), is a letter, unless the following label continues a roman run ("(i)" then "(ii)").
  const ROMAN_NEXT: Record<string, string> = { "(i)": "(ii)", "(v)": "(vi)", "(x)": "(xi)", "(l)": "(li)" };
  const meta = new Map<(typeof raw)[number], { st: string; ord: number }>();
  let lastLower = 0;
  raw.forEach((r, i) => {
    const l = r.it.label;
    let st = style(l), ord = ordinal(l);
    if (/^\([ivxl]\)$/.test(l)) {
      const letter = l.charCodeAt(1) - 96;
      const nextLetter = `(${String.fromCharCode(l.charCodeAt(1) + 1)})`;
      if ((lastLower === letter - 1 || raw[i + 1]?.it.label === nextLetter) && raw[i + 1]?.it.label !== ROMAN_NEXT[l]) { st = "lower"; ord = letter; }
    }
    // Only labels continuing the item sequence move it ("(x)"/"(y)" sub-lists inside an item do not).
    if (st === "lower" && (ord === 1 || (ord > lastLower && ord <= lastLower + 2))) lastLower = ord;
    meta.set(r, { st, ord });
  });
  const stOf = (r: (typeof raw)[number]) => meta.get(r)!.st, ordOf = (r: (typeof raw)[number]) => meta.get(r)!.ord;
  const run = new Map<string, { last: number; len: number; best: number }>();
  for (const r of raw) {
    const st = stOf(r), o = ordOf(r), cur = run.get(st) ?? { last: 0, len: 0, best: 0 };
    const step = o > cur.last && o <= cur.last + 2; cur.len = step ? cur.len + 1 : o === 1 ? 1 : cur.len; cur.last = step || o === 1 ? o : cur.last; cur.best = Math.max(cur.best, cur.len); run.set(st, cur);
  }
  const top = [...run.entries()].sort((a, b) => b[1].best - a[1].best)[0]?.[0];
  const signTail = /\b(?:plus|minus|less|(?:increased|reduced|decreased)\s+by)\W*$/i;
  const pairs: typeof raw = [];
  for (const r of raw) {
    const prev = pairs.at(-1);
    // "the limitation in subclause (ii) above …": a cross-reference, not a new clause — part of the previous segment.
    // A compound reference "clause (1)(l)" / "clauses (1)(k), (1)(q)" splits at its inner label: rejoin it.
    const compound = prev && /\b(?:sub-?)?clauses?\b[^;]{0,400}\(\d{1,2}\)\s*$/i.test(prev.full.trim()) && /^\([a-zA-Z]{1,4}\)$/.test(r.it.label);
    if (prev && (compound || (/\b(?:sub-?)?(?:clauses?|paragraphs?|sections?)\s*$/i.test(prev.full.trim()) && /^\s*(?:above|below|hereof|of\s+this|shall|does|is|are|and|or|,|\))/i.test(r.full)))) { prev.full = `${prev.full}${r.it.label} ${r.full}`.replace(/\((\d{1,2})\)\s+(\([a-zA-Z]{1,4}\))/g, "($1)$2"); continue; }
    // "(d) (x) … and (y) …": a label of the item style that jumps ahead of the item sequence and continues an enumeration
    // already open inside the previous item ((x) → (y)), or opens an (x)/(y)/(z) list, is that item's sub-clause.
    if (prev && stOf(r) === top && stOf(prev) === top && ordOf(r) > ordOf(prev) + 2) {
      const before = `(${String.fromCharCode(r.it.label.charCodeAt(1) - 1)}${r.it.label.slice(2, -1)})`;
      const opened = new RegExp(`(?<!clauses?\\s{1,3})${before.replace(/[()]/g, "\\$&")}`).test(`${prev.it.label} ${prev.full}`);
      if (r.it.label.length === 3 && (opened || r.it.label === "(x)")) { if (prev.full.trim().length < 3) prev.it = { ...r.it, label: prev.it.label, sign: prev.it.sign, coverage: r.it.coverage === "HEADER" ? "NONE" : r.it.coverage, concepts: [], value: "0" }; prev.full = `${prev.full} ${r.it.label} ${r.full}`; if (r.it.concepts.length && r.it.coverage !== "HEADER") prev.it = { ...prev.it, concepts: [...prev.it.concepts, ...r.it.concepts.filter((c) => !prev.it.concepts.some((x) => x.concept === c.concept))], value: String(BigInt(prev.it.value) + r.it.concepts.filter((c) => !prev.it.concepts.some((x) => x.concept === c.concept)).reduce((a, c) => a + BigInt(c.value), 0n)) }; if (r.it.coverage !== "HEADER" && r.it.coverage !== "FULL" && prev.it.coverage === "FULL") prev.it = { ...prev.it, coverage: "PARTIAL" }; continue; }
    }
    const emptyLabel = prev && prev.full.trim().length < 3; // "(e) (i) …": the item's text starts with its own sub-clauses
    if (prev && stOf(r) !== top && stOf(prev) === top && (prev.it.coverage !== "HEADER" || emptyLabel) && !signTail.test(prev.full)) {
      if (emptyLabel) prev.it = { ...r.it, label: prev.it.label, sign: prev.it.sign, coverage: r.it.coverage === "HEADER" ? "NONE" : r.it.coverage };
      prev.full = `${prev.full} ${r.it.label} ${r.full}`;
      if (r.it.coverage !== "HEADER" && r.it.coverage !== "FULL" && prev.it.coverage === "FULL") prev.it = { ...prev.it, coverage: "PARTIAL" };
      continue;
    }
    pairs.push(r);
  }

  // A clause the segmenter missed: the sequence skips one label ("(i) … (iii)") and the skipped label appears in the
  // previous clause's text as a fresh enumerator (after "," / ";" / a sign word, followed by a capitalised term, not a
  // cross-reference such as "Section 6.06(b)(ii)"). Split it off as its own line. The new line starts unevidenced
  // (claims 0 unless mapped from its own text), so this can only under-count.
  const ROMANS = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx", "xxi", "xxii", "xxiii", "xxiv", "xxv"];
  const labelAt = (st: string, n: number, like: string) => st === "roman" ? (ROMANS[n] ? `(${ROMANS[n]})` : null) : st === "digit" ? `(${n})` : st === "upper" ? `(${String.fromCharCode(64 + n)})` : n <= 26 ? `(${String.fromCharCode(96 + n)})` : like && null;
  for (let k = 0; k + 1 < pairs.length; k++) {
    const a = pairs[k]!, b = pairs[k + 1]!;
    if (!meta.has(a) || !meta.has(b) || stOf(a) !== stOf(b) || ordOf(b) !== ordOf(a) + 2) continue;
    const miss = labelAt(stOf(a), ordOf(a) + 1, a.it.label);
    if (!miss) continue;
    const m = new RegExp(`(?:[,;]|\\b(?:plus|and|or))\\s*${miss.replace(/[()]/g, "\\$&")}\\s+(?=[A-Z“"])`).exec(a.full);
    if (!m || /(?:Section|clause|paragraph)s?\s*[\d.]*\s*(?:\([a-zA-Z\d]{1,5}\))*\s*$/i.test(a.full.slice(0, m.index + 1))) continue;
    const rest = a.full.slice(m.index + m[0].length);
    a.full = a.full.slice(0, m.index + 1);
    const nr = { full: rest, it: { label: miss, text: rest, sign: a.it.sign, coverage: "NONE" as const, concepts: [] as Array<{ concept: string; value: string }>, value: "0", note: "split from the preceding clause: label skipped by the enumerated sequence" } } as unknown as (typeof raw)[number];
    meta.set(nr, { st: stOf(a), ord: ordOf(a) + 1 });
    pairs.splice(k + 1, 0, nr);
    k++;
  }

  // Base must be derivable. Unmapped deductions (sign "-") block the floor — omitting them would overstate.
  // Two-sided / unknown add-backs (sign "?" or gains-or-losses language) do not: omit them (claim 0, NEEDS_INPUT) and
  // still report a supported floor from the base + evidenced add-backs. Invent-absence: never fill those lines.
  const blockingDeduction = pairs.filter((p) => p.it.coverage !== "HEADER" && p.it.sign === "-" && p.it.coverage !== "FULL");
  const ambiguousAddBack = (p: (typeof pairs)[number]) =>
    p.it.coverage !== "HEADER" && p.it.sign !== "-" && (p.it.sign === "?" || TWO_SIDED.test(p.full.replace(CAPPED.test(p.full) ? (parseCap(p.full)?.text ?? "") : "", " ")));
  const baseOk = aligned && ev.base != null && !blockingDeduction.length;
  const lowerReason = ev.base == null ? ev.reason
    : blockingDeduction.length ? `items that could lower the total are not in filings: ${blockingDeduction.slice(0, 3).map((p) => `${p.it.label} ${p.full.slice(0, 60)}`).join("; ")}`
    : ev.reason;

  // ---- add-backs: evidence and caps per line ----
  const used = new Set<string>(), consumedInputs = new Set<string>();
  const lines: Array<AddBackLine & { evid: bigint; capSpec: CapSpec | null; caps: CapCondition[]; full: string }> = [];
  // Input keys: ADDBACK:<label> when the label is unique among add-back lines; ADDBACK:<label>@<position> always works
  // and is required when the label repeats (a plain key for a repeated label is ambiguous and is not applied).
  const addPairs = pairs.filter((p) => p.it.coverage !== "HEADER" && p.it.sign !== "-");
  const labelCount = new Map<string, number>();
  for (const p of addPairs) labelCount.set(p.it.label.toUpperCase(), (labelCount.get(p.it.label.toUpperCase()) ?? 0) + 1);
  const isTop = new Map<object, boolean>();
  const lineRaw = new Map<object, (typeof raw)[number]>();
  for (const [position, pr] of addPairs.entries()) {
    const { it, full } = pr;
    const ambiguous = ambiguousAddBack({ it, full });
    const capSpec0 = CAPPED.test(full) ? parseCap(full) : null;
    // "the limitation … shall not apply … if … does not exceed $X": a conditional exemption, not a cap with known room.
    const exempt = /\bshall\s+not\s+apply\b|\bdisregarded\b/i.test(full);
    const unknownIfExempt = (c: CapSpec): CapSpec => (exempt ? { ...c, kind: "UNKNOWN" as const, dollars: [], percents: [] } : c);
    const capSpec = capSpec0 ? unknownIfExempt(capSpec0) : null;
    // Further caps in the same clause (an own cap plus a shared aggregate cap) all bind; a later cap that names no other
    // clause and repeats the first is the same limit restated.
    // A cap phrase whose amount cannot be parsed is still a cap: indeterminate, never unlimited (claims 0, NEEDS_INPUT).
    const parsedCaps = capSpec ? extractCaps(full, it.label).map((c) => ({ ...c, spec: unknownIfExempt(c.spec) })) : [];
    const caps: CapCondition[] = parsedCaps.length || !CAPPED.test(full) ? parsedCaps : [{ spec: { text: "", kind: "UNKNOWN", dollars: [], percents: [], giving: "UNSTATED", sharedWith: [] }, labels: [], withHost: true, at: 0 }];
    let scopeText = full; for (const c of caps) scopeText = scopeText.replace(c.spec.text, " ");
    const cat = categorize(scopeText);
    let concepts: Array<{ concept: string; value: bigint }> = [];
    let coverage: AddBackLine["coverage"] = "NONE";
    let mapNote = "";
    let ownFull = false; // the line is wholly the mapped filing item(s) (no unmapped remainder)
    // A borrower-supplied amount (with its source) answers the whole line, like a filing figure.
    const bi = borrowerInput(fin, [`ADDBACK:${it.label}@${position}`, (labelCount.get(it.label.toUpperCase()) ?? 0) > 1 ? "" : `ADDBACK:${it.label}`, cat === "OTHER" ? "" : `ADDBACK:${cat}`].filter((k) => k && !consumedInputs.has(k.toUpperCase())));
    if (bi) { consumedInputs.add(bi.key.toUpperCase()); concepts = [{ concept: `borrower:${bi.key} [${bi.source}]`, value: BigInt(bi.value) }]; coverage = "FULL"; }
    else if (!capSpec && (it.coverage === "FULL" || it.coverage === "PARTIAL") && it.concepts.length) {
      concepts = it.concepts.map((c) => ({ concept: c.concept, value: BigInt(c.value) }));
      coverage = it.coverage === "FULL" ? "FULL" : "PARTIAL";
    } else if (!capSpec && it.coverage === "FULL" && !it.concepts.length) {
      // evaluateDefinition: fully covered with nothing new (e.g. amort already in prior D&A total).
      coverage = "FULL";
      mapNote = "already included in a prior add-back (same filing concept); no double count";
    } else if (!hardAddBackCarveOut(scopeText)) {
      const m = mapEbitdaItem(scopeText, fin, text, 0);
      // Head carve-outs (interest expense (other than …)) stay fail-closed; definitional
      // "including … but excluding prepaid amort" still maps (evaluateDefinition may have zeroed them
      // under QUALIFIED.excluding — rematerialize from mapEbitdaItem here).
      // Even when the line also has two-sided language (e.g. hedge gains/losses), claim mapped one-sided
      // filing evidence (interest / tax / D&A); the indeterminate residue stays NEEDS_INPUT.
      if (m && m !== "TWO_SIDED") {
        let rest = scopeText; for (const re of m.residueStop) rest = rest.replace(re, " ");
        ownFull = !QUALIFIED.test(scopeText) && rest.replace(/\([^)]*\)/g, " ").replace(STOP, " ").replace(/[^A-Za-z]+/g, " ").trim().length <= 12;
        concepts = m.concepts; coverage = "PARTIAL"; if (ambiguous || QUALIFIED.test(scopeText)) mapNote = "qualified/two-sided residue omitted; filing-supported core claimed"; }
      else if (m === "TWO_SIDED" && ambiguous) mapNote = "two-sided or indeterminate add-back; omitted from supported floor";
    } else {
      mapNote = "hard carve-out (other than / excluding / except) — full filing line would overstate; NEEDS_INPUT";
    }
    if (!bi && !concepts.length && !QUALIFIED.test(scopeText)) {
      for (const x of EXTRA) if (x.re.test(scopeText)) for (const c of x.concepts) { const v = fin.values.find((f) => f.metric === "item" && f.concept === c); if (v) { concepts.push({ concept: c, value: BigInt(v.value) }); coverage = "PARTIAL"; } }
    }
    // Two-sided line that is exactly one filed, signed figure (equity-method income, FX gain/loss, NCI share):
    // the adjustment is that exact figure with its sign. Absent fact or compound line → stays NEEDS_INPUT.
    const signed = !bi && !capSpec && (ambiguous || it.sign === "?") ? signedTwoSided(scopeText, fin) : null;
    if (signed) { concepts = [signed]; coverage = "FULL"; mapNote = "two-sided line signed from the exact filed figure"; }
    // Interest named only inside a parenthetical ("fees … (including any interest expense) related to a receivables
    // financing") is a slice of interest, never the total interest figure.
    if (!bi && /\binterest\b/i.test(scopeText) && !/\binterest\b/i.test(scopeText.replace(/\([^()]*\)/g, " "))) concepts = concepts.filter((c) => !/^Interest/i.test(c.concept));
    const fresh = concepts.filter((c) => !used.has(c.concept));
    fresh.forEach((c) => used.add(c.concept));
    // Only charges that reduced net income can be added back: a net credit adds nothing (signed lines keep their sign).
    let evid = signed && fresh.length ? signed.value : fresh.reduce((a, c) => a + (c.value > 0n ? c.value : 0n), 0n);
    // Mapped concepts already claimed on an earlier line (e.g. amort after full D&A): covered, not a gap.
    let covOut: AddBackLine["coverage"] = fresh.length ? coverage : "NONE";
    let noteExtra = "";
    if (!fresh.length && concepts.length) {
      // Deduplicated against a prior line: covered only if this line's own mapping was complete; a partly mapped
      // line stays open (one-sided remainder needs input).
      covOut = coverage === "FULL" || ownFull ? "FULL" : "PARTIAL";
      noteExtra = "already included in a prior add-back (same filing concept); no double count";
    } else if (!fresh.length && coverage === "FULL") {
      covOut = "FULL";
      noteExtra = mapNote || "already included in a prior add-back (same filing concept); no double count";
    } else if (!fresh.length && ambiguous) {
      noteExtra = "two-sided or indeterminate add-back; omitted from supported floor";
    }
    // A line naming income or gains beyond a pure tax base (tax receivable agreements, "net of any income therefrom",
    // "other income items", tax equity income) is never closed by a mapped/deduplicated tax figure: it stays open.
    if (covOut === "FULL" && fresh.some((c) => /\(losses only\)/.test(c.concept))) { covOut = "PARTIAL"; noteExtra = [noteExtra, "losses-only figure from a net fact: floor, not exact"].filter(Boolean).join("; "); }
    if (covOut === "FULL" && !signed && !bi && namesGainOrIncome(scopeText)) { covOut = "PARTIAL"; noteExtra = [noteExtra, "names income/gains beyond a pure tax base; stays open"].filter(Boolean).join("; "); }
    // Lender/agent approval or consent: neither the filing figure nor a CFO amount proves the add-back was approved — it
    // is counted only when the CFO amount AND a separate, sourced confirmation of the approval itself (APPROVAL:<key>,
    // value 1) are both present.
    const approvalNeeded = approvalCondition(full);
    const approved = approvalNeeded != null && bi != null && borrowerInput(fin, [bi.key.replace(/^ADDBACK:/i, "APPROVAL:")])?.value === "1";
    const apm = approved ? null : approvalNeeded;
    const conditional = apm != null;
    if (conditional) { for (const c of fresh) used.delete(c.concept); evid = 0n; if (covOut === "FULL") covOut = "PARTIAL"; noteExtra = [noteExtra, `requires lender/agent approval (\"${apm!.slice(-80)}\"); not counted without confirmation`].filter(Boolean).join("; "); }
    lines.push({ label: it.label, text: full.slice(0, 200), category: cat, evidenced: fresh.length ? usd(evid) : (concepts.length ? "0" : null), concepts: conditional ? [] : fresh.map((c) => ({ concept: c.concept, value: usd(c.value) })),
      coverage: conditional && covOut === "FULL" ? "PARTIAL" : covOut, cap: null, claimed: "0", status: "NEEDS_INPUT", headroomToCap: null, ...(conditional ? { conditional: "LENDER_APPROVAL" as const, conditionText: apm! } : {}),
      note: [it.note, mapNote, noteExtra].filter(Boolean).join("; ") || it.note, evid, capSpec, caps, full });
    isTop.set(lines.at(-1)!, meta.has(pr) && stOf(pr) === top);
    lineRaw.set(lines.at(-1)!, pr);
  }

  // ---- totals ----
  const base = baseOk ? BigInt(ev.base!.value) : null;
  const deductions = baseOk ? pairs.filter((p) => p.it.sign === "-" && p.it.coverage !== "HEADER").reduce((a, p) => a + BigInt(p.it.value), 0n) : null;
  // Resolve each cap's named clauses to specific lines by position, not label alone: definitions reuse labels at
  // different nesting levels ("(i)" twice). A label that is a sub-clause of the stating clause ("(d) (x) … and (y) …;
  // … this clause (y) shall not exceed $10M") is that part of the clause; otherwise a reference resolves to the nearest
  // preceding line with that label, else the nearest following one.
  type Ln = (typeof lines)[number];
  type Cap = { owner: Ln; spec: CapSpec; members: Ln[]; amount: bigint | null; note: string; subOf: string | null };
  const capRaw: Array<Omit<Cap, "amount" | "note"> & { subText: string | null }> = [];
  // ---- clause references → lines ----
  // A reference binds to exactly one line or it is unresolved. Unresolved scope never leaves a named line uncapped and
  // never silently drops it: the cap becomes capped-unknown (amount undetermined) on every line it does bind.
  const escRe = (lab: string) => new RegExp(`(?<![A-Za-z\\d])${lab.replace(/[()]/g, "\\$&")}`);
  // "(B)" and "(b)" are different clauses when the definition uses both letter cases; otherwise case is not significant.
  const caseSignificant = (() => { const ls = raw.map((r) => r.it.label); return ls.some((x) => /^\([a-z]{1,2}\)$/.test(x) && !/^\([ivxl]+\)$/.test(x)) && ls.some((x) => /^\([A-Z]{1,2}\)$/.test(x)); })();
  const sameLabel = (a: string, b: string) => a === b || (!caseSignificant && a.toUpperCase() === b.toUpperCase());
  const parentTop = (o: Ln): string | null => { for (let j = lines.indexOf(o); j >= 0; j--) if (isTop.get(lines[j]!)) return lines[j]!.label; return null; };
  const isTopLabel = (lab: string) => lines.some((o) => isTop.get(o) && sameLabel(o.label, lab));
  // A heading-only enumerator ("(m) (P) <item> … (R) <item>; (n) (P) <item> …") is not a line of
  // its own: a reference to it is a reference to every line under it, up to its next sibling or a higher-level label.
  const childrenOf = (lab: string, deictic: boolean, boundary: number): Ln[] | null => {
    const heads = raw.map((r, k) => ({ r, k })).filter((x) => sameLabel(x.r.it.label, lab) && x.r.full.trim().length < 3);
    if (!heads.length) return null;
    const lineAt = (k: number) => lines.find((o) => lineRaw.get(o) === raw[k]);
    const kids = heads.map(({ k }) => {
      const out: Ln[] = [];
      // Sub-items in the heading's own style restart the count ("(vi) (i) … (ii) …" inside a roman list): they run while
      // the count climbs from one, and end at the label that continues the heading's sequence.
      const lab = (j: number) => raw[j]!.it.label.slice(1, -1).toLowerCase();
      const ordOfLab = (x: string) => ordinalOf(`(${x})`);
      const restart = k + 1 < raw.length && ordOfLab(lab(k + 1)) === 1 && ordOfLab(lab(k)) > 1 && labelStyle(raw[k + 1]!.it.label) === labelStyle(raw[k]!.it.label);
      if (restart) {
        for (let j = k + 1, n = 1; j < raw.length && ordOfLab(lab(j)) === n && labelStyle(raw[j]!.it.label) === labelStyle(raw[k]!.it.label); j++, n++) { const o = lineAt(j); if (o) out.push(o); }
        return out;
      }
      for (let j = k + 1; j < raw.length; j++) {
        const st = meta.get(raw[j]!)?.st;
        if (st === meta.get(raw[k]!)?.st || st === top) break;
        const o = lineAt(j); if (o) out.push(o);
      }
      return out;
    }).filter((x) => x.length);
    if (kids.length === 1) return kids[0]!;
    if (kids.length > 1 && deictic) { const pre = kids.filter((x) => lines.indexOf(x[0]!) < boundary).pop(); if (pre) return pre; }
    return kids.length ? kids.flat() : null;
  };
  // A reference resolves to one line (or a heading's lines), or it is ambiguous: then every candidate is capped-unknown.
  type Res = { host: string } | { line: Ln } | { lines: Ln[]; ambiguous: boolean } | null;
  const resolveRef = (path: string[], deictic: boolean, l: Ln | null, boundary: number, hostText: string): Res => {
    const lab = path.at(-1)!;
    if (l && escRe(lab).test(hostText)) return { host: lab };
    const cands = lines.map((o, j) => ({ o, j })).filter((x) => x.o !== l && sameLabel(x.o.label, lab));
    if (path.length > 1) {
      // "clause (a)(v)": the (v) under (a).
      const outer = path.at(-2)!;
      const q = cands.filter((x) => { const pt = parentTop(x.o); return pt != null && sameLabel(pt, outer) && !isTop.get(x.o); });
      if (q.length === 1) return { line: q[0]!.o };
    }
    if (cands.length === 1) return { line: cands[0]!.o };
    if (cands.length > 1) {
      // "this clause (i)": the clause containing the statement — the nearest preceding line with that label.
      if (deictic) { const pre = cands.filter((x) => x.j < boundary).pop(); if (pre) return { line: pre.o }; }
      // One candidate on the definition's item level, the others nested sub-clauses split out as lines.
      const tops = cands.filter((x) => isTop.get(x.o));
      if (path.length === 1 && tops.length === 1) return { line: tops[0]!.o };
      return { lines: cands.map((x) => x.o), ambiguous: true };
    }
    const kids = childrenOf(lab, deictic, boundary);
    if (kids) return { lines: kids, ambiguous: false };
    // "clause (d)(i)" where (i) is inside line (d) (not a line of its own): the cap binds part of (d); bounding the whole
    // line by it can only under-count.
    if (path.length > 1) { const outer = path.at(-2)!; const oc = lines.filter((o) => o !== l && sameLabel(o.label, outer) && escRe(lab).test(o.full)); if (oc.length === 1) return { line: oc[0]! }; }
    // The label exists only as a sub-clause folded into other lines: the cap binds every line that carries it, and since
    // which part is meant cannot be told, it is capped-unknown on each.
    const folded = lines.filter((o) => o !== l && escRe(lab).test(o.full.replace(new RegExp(LABEL_LIST.source, "gi"), (x) => " ".repeat(x.length))));
    if (folded.length) return { lines: folded, ambiguous: true };
    return null;
  };
  // "pursuant to this clause (b)(vi)" written in line (vi): the stating line itself, unless the outer label names a
  // different item-level clause than the one the stating line sits under.
  // Is `inner` inside the clause that starts at line `outer`? True when every line between them is lower in the
  // enumeration than `outer` (no sibling or higher label of `outer` intervenes).
  const within = (outer: Ln, inner: Ln): boolean => {
    const a0 = lines.indexOf(outer), b0 = lines.indexOf(inner), st = labelStyle(outer.label);
    if (a0 < 0 || b0 <= a0) return false;
    // Lines in another style are sub-items; lines in outer's own style are sub-items only as a run restarting at one
    // ("(vi) (i) … (ii) …"). Outer's next sibling ends the clause.
    let n = 0;
    for (let j = a0 + 1; j <= b0; j++) {
      const o = lines[j]!;
      if (labelStyle(o.label) !== st) continue;
      const k = ordinalOf(o.label);
      if (k === n + 1) { n = k; continue; }
      return false;
    }
    return true;
  };
  const subItems = (o: Ln): Ln[] => {
    const out: Ln[] = [], st = labelStyle(o.label);
    for (let j = lines.indexOf(o) + 1; j > 0 && j < lines.length; j++) {
      const x = lines[j]!;
      if (isTop.get(x) || labelStyle(x.label) === st) break;
      // Sub-clauses start their own count at one; "(c)" right after a clause continues an outer list instead.
      if (!out.length && ordinalOf(x.label) !== 1) break;
      if (out.length && labelStyle(x.label) === labelStyle(out[0]!.label) && ordinalOf(x.label) !== ordinalOf(out.at(-1)!.label) + 1) break;
      out.push(x);
    }
    return out;
  };
  const selfRef = (path: string[], l: Ln): boolean => {
    if (!sameLabel(path.at(-1)!, l.label)) return false;
    if (path.length === 1) return true;
    const outer = path.at(-2)!, pt = parentTop(l);
    if (isTop.get(l)) return !isTopLabel(outer) || sameLabel(outer, l.label);
    return pt == null || sameLabel(pt, outer) || !isTopLabel(outer);
  };
  const unboundCaps: string[] = [];
  const bindCondition = (c: CapCondition, l: Ln | null, boundary: number, hostFull: string) => {
    // The stating line is bound unless the cap names only other clauses and every one of them resolves (a trailing
    // proviso on the last item that limits earlier items). A self-reference that does not resolve elsewhere ("this
    // clause …", even a parent path such as "this clause (b)(vii)") or any unresolved reference binds it.
    const set = new Set<Ln>(c.withHost && l ? [l] : []);
    const unresolved: string[] = [];
    let subOf: string | null = null, subText: string | null = null, subN = 0;
    // Cross-references ("clauses (d) and (e)") are blanked to equal length so positions are kept.
    const hostText = hostFull.slice(0, c.at).replace(new RegExp(LABEL_LIST.source, "gi"), (x) => " ".repeat(x.length));
    const has = (lab: string) => lines.some((o) => sameLabel(o.label, lab)) || raw.some((r) => sameLabel(r.it.label, lab)) || escRe(lab).test(hostText);
    const refs = c.refs?.length ? c.refs : c.labels.map((x) => ({ list: x, deictic: false }));
    for (const r of refs) {
      const { paths, unresolvedRanges } = clauseRefPaths(r.list, has);
      unresolved.push(...unresolvedRanges);
      for (const path of paths) {
        if (l && selfRef(path, l)) { set.add(l); continue; }
        const res = resolveRef(path, r.deictic, l, boundary, hostText);
        // "this clause …" that names nothing findable is the statement's own clause: the stating line, already bound.
        if (!res) { if (r.deictic && l) set.add(l); else unresolved.push(path.join("")); continue; }
        if ("lines" in res) { for (const o of res.lines) set.add(o); if (res.ambiguous) unresolved.push(path.join("")); continue; }
        if ("host" in res) { subN++; subOf = res.host; const k = escRe(res.host).exec(hostText)!.index; subText = hostFull.slice(k + res.host.length, c.at); set.add(l!); continue; }
        set.add(res.line);
        // A reference to a clause includes its sub-clauses split out as lines ("clause (b)(1)" covers (1)(A) and (1)(B)).
        for (const o of subItems(res.line)) set.add(o);
        // "this clause (a)(vi)(y)" written in a later line: the statement sits inside the clause it names, so every line
        // from the named clause through the stating line is part of it (the sub-items split out under it included).
        if (r.deictic && l) { const a0 = lines.indexOf(res.line), b0 = lines.indexOf(l); if (a0 >= 0 && b0 > a0 && within(res.line, l)) for (let j = a0 + 1; j <= b0; j++) set.add(lines[j]!); }
      }
    }
    if (l && unresolved.length) set.add(l);
    // A share with clauses outside this definition does not implicate the line the sentence sits in; it only makes the
    // room here depend on usage out there.
    if (c.externalShare?.length) unresolved.push(...c.externalShare.map((x) => `${x} (outside this definition)`));
    if (!set.size && l) set.add(l);
    if (!set.size) { unboundCaps.push(`cap "${c.spec.text.slice(0, 80)}" names ${unresolved.join(", ") || "clauses"} not found in the definition`); return; }
    const spec = unresolved.length ? { ...c.spec, unresolved: [...new Set(unresolved)] } : c.spec;
    const members = [...set].sort((x, y) => lines.indexOf(x) - lines.indexOf(y));
    capRaw.push({ owner: l && set.has(l) ? l : members[0]!, spec, members, subOf: subOf && subN === 1 && set.size === 1 ? subOf : null, subText });
  };
  lines.forEach((l, idx) => { for (const c of l.caps) bindCondition(c, l, idx, l.full); });
  // Caps written outside an add-back line — in a deduction, a header, or a trailing "Notwithstanding the foregoing …"
  // sentence — that name the clauses they limit.
  {
    let boundary = 0;
    for (const p of pairs) {
      if (addPairs.includes(p)) { boundary++; continue; }
      if (!CAPPED.test(p.full)) continue;
      for (const c of extractCaps(p.full, p.it.label)) if (c.refs?.length) bindCondition({ ...c, withHost: false }, null, boundary, p.full);
    }
  }
  // A clause that only states a cap on other clauses ("(d) the aggregate amount of add-backs pursuant to clauses (e) and
  // (f) below, which shall not exceed $100M") adds nothing itself.
  // (The stating line is always a member of its own caps, so this is read from the text: every cap names other clauses
  // and none refers to the stating clause itself.)
  const capOnly = new Set(lines.filter((l) => l.caps.length && l.caps.every((c) => (c.refs?.length ?? 0) > 0 && !c.refs!.some((r) => r.deictic) && !c.labels.some((x) => sameLabel(x, l.label))) && /^\W*(?:in\s+no\s+event\s+(?:shall|will|may)\s+)?(?:the\s+)?(?:aggregate\s+)?amount\s+of\s+(?:[\w-]+\s+){0,4}?(?:add-?backs|adjustments|added(?:\s+back)?\s+pursuant)\b/i.test(l.full)));
  for (const l of capOnly) { l.claimed = "0"; l.status = "CLAIMED"; l.coverage = "FULL"; l.evid = 0n; l.note = "states a cap on other clauses; no add-back of its own"; }
  const inCap = new Set(capRaw.flatMap((c) => c.members).filter((l) => !capOnly.has(l)));
  const uncapped = lines.filter((l) => !inCap.has(l) && !capOnly.has(l));
  for (const l of uncapped) { l.claimed = usd(l.evid); l.status = l.coverage === "FULL" ? "CLAIMED" : "NEEDS_INPUT"; if (l.coverage !== "FULL") l.note = l.coverage === "PARTIAL" ? "partly evidenced; remainder needs input" : "not evidenced in filings"; }
  const e0 = base != null && deductions != null ? base + deductions + uncapped.reduce((a, l) => a + l.evid, 0n) : null;
  const capOpen = uncapped.some((l) => l.coverage !== "FULL");
  // A sub-clause cap ("(d) (x) … and (y) …; … this clause (y) shall not exceed $10M") bounds only that part: the clause
  // is split into parts (one per capped sub-clause plus the rest), each part bounded by its own evidence; whole-clause
  // and shared caps bound the sum of the parts. Part evidence = the clause's filed concepts that the sub-clause names.
  const all: Cap[] = capRaw.map((c) => { const { amount, note } = capAmount(c.spec, e0, fin.anchor ?? null, minYear(fin.fiscalYear ?? null, agreementFiscalYear(text, fin.anchor ?? null))); return { owner: c.owner, spec: c.spec, members: c.members.filter((x) => !capOnly.has(x)), amount, note: c.subOf ? [note, `limits sub-clause ${c.subOf} only`].filter(Boolean).join("; ") : note, subOf: c.subOf }; }).filter((c) => c.members.length);
  const subText = new Map(capRaw.filter((c) => c.subOf).map((c) => [c.spec, c.subText ?? ""]));
  const capsOf = (g: Ln) => all.filter((c) => c.members.includes(g));
  const lnVars = [...inCap].sort((x, y) => lines.indexOf(x) - lines.indexOf(y));
  const blocked = new Set(lnVars.filter((g) => capsOf(g).some((c) => c.amount == null)));
  type V = { line: Ln; part: Cap | null; u: bigint };
  const restless = new Set<Ln>();
  const vars: V[] = [];
  for (const g of lnVars) {
    const total = blocked.has(g) || g.evid < 0n ? 0n : g.evid;
    let rest = total;
    for (const c of all.filter((x) => x.subOf && x.members[0] === g)) {
      const m = mapEbitdaItem(subText.get(c.spec) ?? "", fin, text, 0);
      const names = new Set(m && m !== "TWO_SIDED" ? m.concepts.map((x) => x.concept) : []);
      let pe = (g.concepts ?? []).filter((x) => names.has(x.concept)).reduce((a, x) => a + BigInt(x.value), 0n);
      if (pe > rest) pe = rest;
      rest -= pe;
      vars.push({ line: g, part: c, u: pe });
    }
    // The rest of the clause exists unless the clause is wholly its capped sub-clauses ("(d) (x) … ≤ $2.5M and (y) … ≤ $1M").
    const subs = all.filter((x) => x.subOf && x.members[0] === g).map((x) => x.subOf!.toUpperCase());
    // … i.e. nothing of substance precedes the first capped sub-clause and no uncapped sibling sub-clause ((ii) next to (i),
    // (y) next to (x)) exists.
    const plain = g.full.replace(new RegExp(LABEL_LIST.source, "gi"), (x) => " ".repeat(x.length));
    const firstAt = Math.min(...subs.map((sl) => { const k = plain.toUpperCase().indexOf(sl); return k < 0 ? Infinity : k; }));
    const pre = Number.isFinite(firstAt) ? plain.slice(0, firstAt).replace(/\[\s*reserved\s*\]|-?\d+-?/gi, " ") : "x";
    const sib = (lab: string, d: number) => { const x = lab.slice(1, -1); if (/^[ivxl]+$/i.test(x)) { const R = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]; const k = R.indexOf(x.toLowerCase()); return k >= 0 && R[k + d] ? `(${R[k + d]})` : null; } return x.length === 1 ? `(${String.fromCharCode(x.charCodeAt(0) + d)})` : null; };
    const siblings = subs.flatMap((sl) => [sib(sl, 1), sib(sl, -1)]).filter((x): x is string => !!x).map((x) => x.toUpperCase()).filter((x) => !subs.includes(x));
    const wholly = subs.length > 0 && !/[A-Za-z]{2}/.test(pre) && !siblings.some((x) => plain.toUpperCase().includes(x));
    vars.push({ line: g, part: null, u: wholly ? 0n : rest });
    if (wholly) restless.add(g);
  }
  const known = all.filter((c) => c.amount != null);
  const lpCaps = known.map((c) => ({ members: c.subOf ? vars.flatMap((v, i) => (v.part === c ? [i] : [])) : vars.flatMap((v, i) => (c.members.includes(v.line) ? [i] : [])), amount: c.amount! }));
  const upper = vars.map((v) => v.u);
  const sol = solveCapLp(upper, lpCaps);
  let capProven = sol.integral;
  const claimedOf = (g: Ln, x: bigint[]) => vars.reduce((a, v, i) => (v.line === g ? a + x[i]! : a), 0n);
  for (const g of lnVars) g.claimed = usd(claimedOf(g, sol.x));
  const BIG = known.reduce((a, c) => a + c.amount!, 0n) + upper.reduce((a, b) => a + b, 0n) + 1n;
  // Connected shared caps form one cap group (the tracker counts a group's room once).
  const comp = new Map<Ln, Set<Ln>>();
  for (const c of all) if (c.members.length > 1) {
    const merged = new Set<Ln>(c.members);
    for (const m of c.members) for (const x of comp.get(m) ?? []) merged.add(x);
    for (const m of merged) comp.set(m, merged);
  }
  lnVars.forEach((g) => {
    const cs = capsOf(g);
    const unknown = cs.find((c) => c.amount == null);
    const take = claimedOf(g, sol.x);
    const shown = cs.find((c) => c.owner === g && c.members.length === 1 && !c.subOf) ?? cs.find((c) => !c.subOf) ?? cs[0]!;
    const others = cs.filter((c) => c !== shown);
    const peers = [...new Set(cs.flatMap((c) => c.members))].filter((x) => x !== g);
    g.cap = { text: shown.spec.text.slice(0, 200), amount: shown.amount == null ? null : usd(shown.amount), note: [shown.note, capOpen && cs.some((c) => c.spec.percents.length) ? "cap base excludes add-backs that still need input (cap may be higher)" : "", peers.length ? `shared with ${peers.map((x) => x.label).join(", ")}` : "", ...others.map((c) => `also under: ${c.spec.text.slice(0, 80)}${c.amount == null ? "" : ` (${usd(c.amount)})`}`)].filter(Boolean).join("; ") };
    g.headroomToCap = null;
    if (unknown) { g.status = "NEEDS_INPUT"; g.note = unknown.note; return; }
    if (take < g.evid) { g.status = "CAPPED"; g.note = "evidenced amount exceeds the cap; cap applied"; g.headroomToCap = "0"; return; }
    if (g.coverage === "FULL") { g.status = "CLAIMED"; g.note = "mapped"; g.headroomToCap = "0"; return; }
    // More of this add-back (beyond the filed figure): how much could it still raise the optimum under every cap?
    const more = solveCapLp(upper.map((u, j) => (vars[j]!.line === g && (vars[j]!.part || !restless.has(g)) ? BIG : u)), lpCaps);
    if (!more.integral) capProven = false;
    const gain = more.value - sol.value;
    if (more.value >= BIG) { g.status = "NEEDS_INPUT"; g.note = "part of this clause is not under any cap; remainder needs input"; return; }
    if (gain <= 0n && more.integral) { g.status = "CAPPED"; g.note = "cap reached: more of this add-back cannot raise the total under its caps"; g.headroomToCap = "0"; }
    else { g.status = "NEEDS_INPUT"; g.note = g.coverage === "NONE" ? "not evidenced in filings" : "partly evidenced; remainder needs input"; g.headroomToCap = usd(gain > 0n ? gain : 0n); }
  });
  for (const g of lnVars) {
    const grp = comp.get(g);
    if (grp) { const sorted = [...grp].sort((a, b) => lines.indexOf(a) - lines.indexOf(b)); g.capGroup = sorted.map((x) => x.label); g.capGroupAt = sorted.map((x) => lines.indexOf(x)); }
  }
  const addBacks: AddBackLine[] = lines.map(({ evid: _e, capSpec: _c, caps: _cs, full: _f, ...l }) => l);
  const open = addBacks.filter((l) => l.status === "NEEDS_INPUT");
  const needsInput = [...open.map((l) => `${l.label} ${l.category}${l.headroomToCap ? ` (up to ${l.headroomToCap} more under cap)` : l.cap ? "" : " (uncapped)"}`), ...unboundCaps];
  if (!aligned && ev.base != null) return out({ addBacks, needsInput, reason: "definition items could not be aligned; refusing" });
  if (!baseOk) return out({ addBacks, needsInput: [`base/deductions: ${lowerReason}`, ...needsInput], reason: `NEEDS_INPUT: ${lowerReason}` });
  const uncappedAt = new Set(uncapped.map((u) => lines.indexOf(u)));
  const supported = e0! + addBacks.filter((_, i) => !uncappedAt.has(i)).reduce((a, l) => a + BigInt(l.claimed), 0n);
  const complete = capProven && !open.length && !unboundCaps.length && !ev.items.some((i) => i.label === "(base)" && i.coverage === "PARTIAL");
  // Lines that could lower the total, so the supported figure is not a safe lower bound:
  //  - open two-sided / income-like add-backs;
  //  - open lines that name gains or income ("gains, losses … from the sale of …");
  //  - any deduction ("minus … non-cash income") not fully modelled from filings (from the evaluator or the schedule).
  const ambiguousOpen = [...new Set([
    ...pairs.filter((p) => (ambiguousAddBack(p) || p.it.sign === "?") && open.some((l) => l.label === p.it.label)).map((p) => p.it.label),
    ...open.filter((l) => namesGainOrIncome(l.text)).map((l) => l.label),
    ...pairs.filter((p) => p.it.sign === "-" && p.it.coverage !== "HEADER" && p.it.coverage !== "FULL").map((p) => p.it.label),
    ...ev.items.filter((i) => i.sign === "-" && i.coverage !== "HEADER" && i.coverage !== "FULL").map((i) => i.label),
  ])];
  return out({ status: complete ? "MAXIMIZED" : "NEEDS_INPUT", maximum: complete ? usd(supported) : null, supported: usd(supported), deductions: usd(deductions!), addBacks, needsInput, omittedTwoSided: ambiguousOpen,
    reason: complete ? "every permitted add-back is evidenced and every cap applied" : `${open.length} add-back(s) not evidenced in filings; supported figure is what the filings prove` });
}


// ---------------- debt capacity from Consolidated EBITDA ----------------
export interface LeverageCapacity {
  status: "COMPUTED" | "NEEDS_INPUT";
  /** MAXIMUM: every add-back evidenced (exact). SUPPORTED: filings/inputs prove at least this EBITDA (capacity is a floor). */
  ebitdaBasis: "MAXIMUM" | "SUPPORTED" | null;
  ebitda: string | null; maxLeverage: string; debt: string | null; debtSource: string | null;
  /** maxLeverage × EBITDA − debt, USD (floored). Negative = over the limit. */
  capacity: string | null; bound: "EXACT" | "AT_LEAST" | null; reason: string;
  bindingTier?: "CONFIRMED" | "LOWER_CONFIDENCE";
}

/**
 * Additional debt the leverage covenant allows: maxLeverage × Consolidated EBITDA − current debt. Uses the optimizer's
 * maximum when available (EXACT), else its supported figure (AT_LEAST: more evidenced add-backs can only raise it).
 * Debt must be an exact figure (a lower-bound debt caption would overstate capacity → NEEDS_INPUT).
 */
export function leverageDebtCapacity(opt: EbitdaOptimization, maxLeverage: string, debt: { value: string; source: string; lowerBound?: boolean } | null): LeverageCapacity {
  const base = { maxLeverage, ebitda: opt.maximum ?? opt.supported, ebitdaBasis: opt.maximum ? "MAXIMUM" as const : opt.supported ? "SUPPORTED" as const : null, debt: debt?.value ?? null, debtSource: debt?.source ?? null };
  if (!/^\d+(?:\.\d+)?$/.test(maxLeverage)) return { ...base, status: "NEEDS_INPUT", capacity: null, bound: null, reason: "maximum leverage ratio not determinable" };
  if (!base.ebitda) return { ...base, status: "NEEDS_INPUT", capacity: null, bound: null, reason: `Consolidated EBITDA: ${opt.reason}` };
  if (!debt || !/^-?\d+$/.test(debt.value) || debt.lowerBound) return { ...base, status: "NEEDS_INPUT", capacity: null, bound: null, reason: debt?.lowerBound ? "debt figure is only a lower bound" : "current debt not determinable" };
  const [i, f = ""] = maxLeverage.split(".");
  const room = (BigInt(i! + f) * BigInt(base.ebitda)) / 10n ** BigInt(f.length) - BigInt(debt.value);
  const bound = opt.maximum ? "EXACT" as const : "AT_LEAST" as const;
  const basisNote = opt.maximum ? "exact maximum (every add-back evidenced)" : "supported floor (more evidenced add-backs can only raise capacity)";
  return { ...base, status: "COMPUTED", capacity: room.toString(), bound, reason: `${maxLeverage}x × ${base.ebitdaBasis} EBITDA ${base.ebitda} − debt ${debt.value} [${bound}: ${basisNote}]` };
}

/** Current total debt from filings for leverageDebtCapacity (lower-bound captions are flagged). */
export function debtFromFinancials(fin: IssuerFinancials): { value: string; source: string; lowerBound: boolean } | null {
  const d = fin.values.find((v) => v.metric === "totalDebt");
  return d ? { value: d.value, source: `${d.concept} ${d.periodEnd} accn ${d.accession}`, lowerBound: /lower\s+bound/i.test(d.derivation) } : null;
}

/** The single maximum-leverage limit among the pipeline's ratio rows (null when none or ambiguous). */
export function maxLeverageLimit(rows: ReadonlyArray<{ kind: string; name: string; direction: string | null; limit: string | null }>): string | null {
  const limits = new Set(rows.filter((r) => r.kind === "RATIO" && /leverage/i.test(r.name) && !/secured|senior|first\s+lien|interest/i.test(r.name) && r.direction === "MAX" && r.limit && /^\d+(?:\.\d+)?$/.test(r.limit)).map((r) => r.limit!));
  return limits.size === 1 ? [...limits][0]! : null;
}

/**
 * EBITDA as a metric input for baskets / ratios. MAXIMUM → BOUND (exact). SUPPORTED → LOWER_BOUND only when no
 * omitted line could lower the total (no two-sided / indeterminate add-back left out); otherwise null (NEEDS_INPUT).
 */
export function optimizerMetricBound(opt: EbitdaOptimization): { status: "BOUND" | "LOWER_BOUND"; basis: "MAXIMUM" | "SUPPORTED"; value: string; reason: string; missing: string[] } | null {
  if (opt.maximum) return { status: "BOUND", basis: "MAXIMUM", value: opt.maximum, reason: opt.reason, missing: [] };
  if (!opt.supported) return null;
  // Omitted lines that could lower the total (two-sided / income-like): the supported figure is not a safe lower bound.
  if (opt.omittedTwoSided == null || opt.omittedTwoSided.length) return null;
  return { status: "LOWER_BOUND", basis: "SUPPORTED", value: opt.supported, reason: opt.reason, missing: opt.needsInput.slice(0, 6) };
}

// ---------------- ratio-based incurrence capacity ----------------
export interface RatioCapacity {
  name: string; kind: "LEVERAGE" | "COVERAGE"; limit: string; status: "COMPUTED" | "NEEDS_INPUT";
  /** LEVERAGE: additional numerator (debt) before limit×EBITDA. COVERAGE: additional interest expense before EBITDA/limit. */
  capacity: string | null; capacityOf: "DEBT" | "INTEREST_EXPENSE"; bound: "EXACT" | "AT_LEAST" | null; reason: string;
  bindingTier?: "CONFIRMED" | "LOWER_CONFIDENCE";
}

/**
 * Capacity before an incurrence ratio is hit, from EBITDA (optimizer-backed decision) and the other operand.
 * LEVERAGE (debt / EBITDA ≤ L): L × EBITDA − debt. COVERAGE (EBITDA / interest ≥ C): EBITDA / C − interest.
 * The non-EBITDA operand must be exact (a lower-bound debt or interest would overstate capacity). EBITDA exact →
 * EXACT; EBITDA lower bound → AT_LEAST (capacity rises with EBITDA in both forms).
 */
export function ratioCapacity(args: { name: string; kind: "LEVERAGE" | "COVERAGE"; limit: string;
  ebitda: { status: "BOUND" | "LOWER_BOUND" | "NEEDS_INPUT"; value: string | null } | null;
  other: { status: "BOUND" | "LOWER_BOUND" | "NEEDS_INPUT"; value: string | null } | null }): RatioCapacity {
  const capacityOf = args.kind === "LEVERAGE" ? "DEBT" as const : "INTEREST_EXPENSE" as const;
  const na = (reason: string): RatioCapacity => ({ name: args.name, kind: args.kind, limit: args.limit, status: "NEEDS_INPUT", capacity: null, capacityOf, bound: null, reason });
  if (!/^\d+(?:\.\d+)?$/.test(args.limit) || Number(args.limit) <= 0) return na("ratio limit not determinable");
  const e = args.ebitda;
  if (!e || e.status === "NEEDS_INPUT" || !e.value || !/^-?\d+$/.test(e.value)) return na("EBITDA operand not derivable");
  if (BigInt(e.value) <= 0n) return na("EBITDA not positive; capacity not meaningful");
  const o = args.other;
  if (!o || o.status !== "BOUND" || !o.value || !/^-?\d+$/.test(o.value)) return na(o?.status === "LOWER_BOUND" ? `${capacityOf.toLowerCase()} operand is only a lower bound (would overstate capacity)` : `${capacityOf.toLowerCase()} operand not derivable`);
  const [i, f = ""] = args.limit.split(".");
  const L = BigInt(i! + f), s = 10n ** BigInt(f.length);
  const cap = args.kind === "LEVERAGE" ? (L * BigInt(e.value)) / s - BigInt(o.value) : (BigInt(e.value) * s) / L - BigInt(o.value);
  const bound = e.status === "BOUND" ? "EXACT" as const : "AT_LEAST" as const;
  return { name: args.name, kind: args.kind, limit: args.limit, status: "COMPUTED", capacity: cap.toString(), capacityOf, bound,
    reason: args.kind === "LEVERAGE" ? `${args.limit}x × EBITDA ${e.value} − debt ${o.value} [${bound}]` : `EBITDA ${e.value} / ${args.limit}x − interest ${o.value} [${bound}]` };
}

/**
 * A two-sided EBITDA line that names exactly one filed, signed figure. Returns the adjustment to add (signed):
 *  - equity in (net) income (loss) of joint ventures / unconsolidated / equity-method investees → −IncomeLossFromEquityMethodInvestments
 *  - (gains) losses from foreign currency transactions / exchange → −ForeignCurrencyTransactionGainLossBeforeTax
 *  - minority / noncontrolling interest (expense) → +NetIncomeLossAttributableToNoncontrollingInterest
 * The whole line must be that item (no other operative words); otherwise null.
 */
export function signedTwoSided(t: string, fin: IssuerFinancials): { concept: string; value: bigint } | null {
  const v = (c: string) => { const x = fin.values.find((f) => f.metric === "item" && f.concept === c); return x ? BigInt(x.value) : null; };
  const flat = t.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const rest = (re: RegExp) => flat.replace(re, " ").replace(/\b(?:any|all|the|of|its|such|Person|Person's|for|period|and|or|in|each|case|plus|minus|to|extent|included|deducted|calculating|determining|computing|Consolidated|Net|Income|Borrower|Company|Issuer|Subsidiaries|Restricted|Parent|amount|aggregate|net|loss|losses|gain|gains|income)\b|[^A-Za-z]+/gi, " ").trim();
  const EQ = /\bequity\s+in\s+(?:the\s+)?(?:net\s+)?(?:income|earnings|\(?loss(?:es)?\)?)[^;]{0,40}?\b(?:Joint\s+Ventures?|unconsolidated\s+(?:affiliates?|subsidiaries|entities|investees)|equity[- ]method\s+investees?)\b/i;
  if (EQ.test(flat) && !rest(EQ)) { const x = v("IncomeLossFromEquityMethodInvestments"); return x == null ? null : { concept: "IncomeLossFromEquityMethodInvestments (signed, excluded)", value: -x }; }
  const FX = /\b(?:losses?|gains?)\s*(?:\(?\s*(?:or|and|\/)\s*(?:gains?|losses?)\s*\)?)?\s+(?:arising\s+from|from|on|resulting\s+from|attributable\s+to)\s+(?:fluctuations\s+in\s+)?foreign\s+(?:currency|exchange)(?:\s+(?:transactions?|translation|rates?|exchange))?\b/i;
  if (FX.test(flat) && !/translation/i.test(flat) && !rest(FX).replace(/\b(?:fluctuations|currency|exchange|foreign|transactions?|rates?|arising|from|on)\b/gi, "").trim()) {
    const x = v("ForeignCurrencyTransactionGainLossBeforeTax"); if (x == null) return null;
    const losses = /\blosses?\b/i.test(flat), gains = /\bgains?\b/i.test(flat);
    // Losses only: add back the loss (a net gain adds nothing). Gains only: not an add-back line → null. Both: signed.
    // Losses-only vs a net filed figure: gross losses not filed → a floor; the optimizer keeps the line PARTIAL (open).
    if (losses && !gains) return { concept: "ForeignCurrencyTransactionGainLossBeforeTax (losses only)", value: x < 0n ? -x : 0n };
    if (gains && !losses) return null;
    return { concept: "ForeignCurrencyTransactionGainLossBeforeTax (signed, excluded)", value: -x };
  }
  const g = gainLossItem(flat, fin);
  if (g) {
    const losses = /\blosses?\b/i.test(flat), gains = /\bgains?\b/i.test(flat);
    // One-sided line vs a net filed figure: gross gains/losses are not filed → not exact (fail closed).
    if (gains && losses) return { concept: `${g.concept} (signed, excluded)`, value: -g.value };
    return null;
  }
  const NCI = /\b(?:minority|non-?controlling)\s+interests?(?:\s+(?:expense|income))?\b/i;
  if (NCI.test(flat) && !rest(NCI).replace(/\b(?:minority|non-?controlling|interests?|expense)\b/gi, "").trim()) { const x = v("NetIncomeLossAttributableToNoncontrollingInterest"); return x == null ? null : { concept: "NetIncomeLossAttributableToNoncontrollingInterest (signed)", value: x }; }
  return null;
}

/**
 * A line that is exactly one filed gain/(loss) item: sale / disposition of assets or property, or extinguishment of
 * debt. Returns the filed signed figure (positive = gain). Any other operative word (extraordinary, non-cash,
 * non-operating, unusual, …) → null: the filed figure would not be the whole line.
 */
export function gainLossItem(flat: string, fin: IssuerFinancials): { concept: string; value: bigint } | null {
  const v = (cs: string[]) => { for (const c of cs) { const x = fin.values.find((f) => f.metric === "item" && f.concept === c); if (x) return { concept: c, value: BigInt(x.value) }; } return null; };
  const s = flat.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ");
  if (/extraordinary|non-?cash|non-?operating|unusual|non-?recurring|infrequent|other\s+than|including|write|impair|casualty|discontinued|hedg|currency|equity\s+in/i.test(s)) return null;
  const residue = (re: RegExp) => s.replace(re, " ").replace(/\b(?:any|all|the|of|its|such|Person|for|period|and|or|in|each|case|plus|minus|less|to|extent|included|deducted|added|calculating|determining|computing|Consolidated|Net|Income|Borrower|Company|Issuer|Subsidiaries|Restricted|amount|aggregate|net|realized|resulting|from|on|with|respect|thereto|attributable|arising|other|gains?|loss(?:es)?|\(?or\)?|\/|outside|ordinary|course|business)\b|[^A-Za-z]+/gi, " ").trim();
  const SALE = /\b(?:sales?|dispositions?|disposals?|transfers?)\s+(?:of\s+)?(?:any\s+)?(?:assets?|property|properties|real\s+estate|investments?|fixed\s+assets|capital\s+assets|property,?\s+plant\s+(?:and|&)\s+equipment)\b/i;
  if (SALE.test(s) && !residue(SALE)) return v(["GainLossOnDispositionOfAssets", "GainLossOnDispositionOfAssets1", "GainLossOnSaleOfPropertyPlantEquipment"]);
  const EXT = /\b(?:early\s+)?(?:extinguishment|retirement|repurchase|redemption)\s+of\s+(?:any\s+)?(?:debt|Indebtedness)\b/i;
  if (EXT.test(s) && !residue(EXT)) return v(["GainsLossesOnExtinguishmentOfDebt"]);
  return null;
}

/**
 * Deduction line ("minus gains on sales of assets") that is exactly one filed gain item: the amount deducted is the
 * filed gain (0 when the filing shows a net loss — a loss is not a gain to deduct). Equity-method income likewise.
 */
export function gainDeduction(_t: string, _fin: IssuerFinancials): { concept: string; value: bigint } | null {
  // A "gains only" deduction cannot be closed from a net gain/(loss) fact: gross gains may exceed the net figure (a net
  // gain understates the deduction; a net loss does not mean zero gains). Neither is exact or lower-bound safe → open.
  return null;
}
