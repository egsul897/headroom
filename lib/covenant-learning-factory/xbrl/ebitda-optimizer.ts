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
import { CAPPED, COST_LIKE, HEADER, QUALIFIED, STOP, TWO_SIDED, definitionSegments, markers, evaluateDefinition, mapEbitdaItem, type DefinitionEvaluation } from "./definition-items";

export type AddBackCategory = "INTEREST" | "TAXES" | "D&A" | "STOCK_COMP" | "IMPAIRMENT" | "RESTRUCTURING" | "SEVERANCE" | "TRANSACTION_COSTS" | "INTEGRATION"
  | "DEBT_EXTINGUISHMENT" | "RUN_RATE_SYNERGIES" | "NON_RECURRING" | "NON_CASH" | "OTHER";
export interface CapSpec { text: string; kind: "FIXED" | "PERCENT" | "GREATER_OF" | "LESSER_OF" | "UNKNOWN"; dollars: bigint[]; percents: Array<{ num: bigint; den: bigint }>; giving: "BEFORE" | "AFTER" | "UNSTATED"; sharedWith: string[] }
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

const CAP_RE = /\b(?:(?:shall|may|does|do|will)\s+)?not\s+(?:to\s+)?exceed(?:ing)?\b|\bin\s+an\s+(?:aggregate\s+)?amount\s+(?:not\s+(?:in\s+excess\s+of|to\s+exceed)|up\s+to)\b|\bcapped\s+at\b|\bmaximum\s+of\b/i;
const LABEL_LIST = /\bclauses?\s+((?:\([ivxlA-Za-z\d]{1,5}\)(?:\s*(?:,|and|or|through|to)\s*)*)+)/gi;

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

export function parseCap(t: string): CapSpec | null {
  const m = CAP_RE.exec(t);
  if (!m) return null;
  const pre = t.slice(Math.max(0, m.index - 300), m.index);
  let w = t.slice(m.index, m.index + 450);
  w = w.slice(0, (/;|\.\s+[A-Z]|,\s*\((?:[ivxl]{1,5}|[a-z]{1,2}|\d{1,2})\)\s/.exec(w.slice(m[0].length))?.index ?? w.length) + m[0].length);
  const sharedWith: string[] = [];
  const scope = `${/(?:pursuant\s+to|under|in\s+reliance\s+on)\s+(?:this\s+)?clauses?[^;]*$/i.exec(pre)?.[0] ?? ""} ${/together\s+with[^,;]{0,200}/i.exec(w)?.[0] ?? ""}`;
  for (const lm of scope.matchAll(LABEL_LIST)) for (const l of lm[1]!.matchAll(/\([ivxlA-Za-z\d]{1,5}\)/g)) sharedWith.push(l[0]);
  const body = w.replace(/together\s+with[^,;]{0,200}?,/i, " ");
  const giving: CapSpec["giving"] = /after\s+giving\s+effect/i.test(w) ? "AFTER" : /(?:before|prior\s+to|without)\s+giving\s+effect/i.test(w) ? "BEFORE" : "UNSTATED";
  const limbs = (s: string) => {
    const d = dollars(s), p = percentOfEbitda(s);
    return { dollars: d != null ? [d] : [], percents: p ? [p] : [], known: d != null || !!p };
  };
  const go = /the\s+(greater|lesser)\s+of\s+(.*)/i.exec(body);
  if (go) {
    const parts = go[2]!.split(/\s+and\s+(?=\(?(?:ii|b|2|y)\)|\$|\d)/i).slice(0, 2).map(limbs);
    const kind = go[1]!.toLowerCase() === "greater" ? "GREATER_OF" : "LESSER_OF";
    if (parts.length < 2 || parts.some((p) => !p.known)) return { text: w, kind: kind === "GREATER_OF" && parts.some((p) => p.known) ? "GREATER_OF" : "UNKNOWN", dollars: parts.flatMap((p) => p.dollars), percents: parts.flatMap((p) => p.percents), giving, sharedWith };
    return { text: w, kind, dollars: parts.flatMap((p) => p.dollars), percents: parts.flatMap((p) => p.percents), giving, sharedWith };
  }
  const l = limbs(body);
  if (/\[\s*\*+\s*\]/.test(body) || !l.known) return { text: w, kind: "UNKNOWN", dollars: [], percents: [], giving, sharedWith };
  return { text: w, kind: l.dollars.length ? "FIXED" : "PERCENT", ...l, giving, sharedWith };
}

/** Cap amount in USD given EBITDA before the capped add-backs (e0). AFTER: x ≤ p(e0 + x) ⇒ x ≤ p·e0 / (1 − p). */
export function capAmount(c: CapSpec, e0: bigint | null): { amount: bigint | null; note: string } {
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
  return addBacks.filter((l) => l.label === label).length > 1 ? `ADDBACK:${label}@${position}` : `ADDBACK:${label}`;
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
  const run = new Map<string, { last: number; len: number; best: number }>();
  for (const r of raw) {
    const st = style(r.it.label), o = ordinal(r.it.label), cur = run.get(st) ?? { last: 0, len: 0, best: 0 };
    cur.len = o === cur.last + 1 ? cur.len + 1 : o === 1 ? 1 : cur.len; cur.last = o === cur.last + 1 || o === 1 ? o : cur.last; cur.best = Math.max(cur.best, cur.len); run.set(st, cur);
  }
  const top = [...run.entries()].sort((a, b) => b[1].best - a[1].best)[0]?.[0];
  const signTail = /\b(?:plus|minus|less|(?:increased|reduced|decreased)\s+by)\W*$/i;
  const pairs: typeof raw = [];
  for (const r of raw) {
    const prev = pairs.at(-1);
    const emptyLabel = prev && prev.full.trim().length < 3; // "(e) (i) …": the item's text starts with its own sub-clauses
    if (prev && style(r.it.label) !== top && style(prev.it.label) === top && (prev.it.coverage !== "HEADER" || emptyLabel) && !signTail.test(prev.full)) {
      if (emptyLabel) prev.it = { ...r.it, label: prev.it.label, sign: prev.it.sign, coverage: r.it.coverage === "HEADER" ? "NONE" : r.it.coverage };
      prev.full = `${prev.full} ${r.it.label} ${r.full}`;
      if (r.it.coverage !== "HEADER" && r.it.coverage !== "FULL" && prev.it.coverage === "FULL") prev.it = { ...prev.it, coverage: "PARTIAL" };
      continue;
    }
    pairs.push(r);
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
  const lines: Array<AddBackLine & { evid: bigint; capSpec: CapSpec | null }> = [];
  // Input keys: ADDBACK:<label> when the label is unique among add-back lines; ADDBACK:<label>@<position> always works
  // and is required when the label repeats (a plain key for a repeated label is ambiguous and is not applied).
  const addPairs = pairs.filter((p) => p.it.coverage !== "HEADER" && p.it.sign !== "-");
  const labelCount = new Map<string, number>();
  for (const p of addPairs) labelCount.set(p.it.label, (labelCount.get(p.it.label) ?? 0) + 1);
  for (const [position, { it, full }] of addPairs.entries()) {
    const ambiguous = ambiguousAddBack({ it, full });
    const capSpec = CAPPED.test(full) ? parseCap(full) : null;
    const scopeText = capSpec ? full.replace(capSpec.text, " ") : full;
    const cat = categorize(scopeText);
    let concepts: Array<{ concept: string; value: bigint }> = [];
    let coverage: AddBackLine["coverage"] = "NONE";
    let mapNote = "";
    let ownFull = false; // the line is wholly the mapped filing item(s) (no unmapped remainder)
    // A borrower-supplied amount (with its source) answers the whole line, like a filing figure.
    const bi = borrowerInput(fin, [`ADDBACK:${it.label}@${position}`, (labelCount.get(it.label) ?? 0) > 1 ? "" : `ADDBACK:${it.label}`, cat === "OTHER" ? "" : `ADDBACK:${cat}`].filter((k) => k && !consumedInputs.has(k.toUpperCase())));
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
    const fresh = concepts.filter((c) => !used.has(c.concept));
    fresh.forEach((c) => used.add(c.concept));
    // Only charges that reduced net income can be added back: a net credit adds nothing (signed lines keep their sign).
    const evid = signed && fresh.length ? signed.value : fresh.reduce((a, c) => a + (c.value > 0n ? c.value : 0n), 0n);
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
    lines.push({ label: it.label, text: full.slice(0, 200), category: cat, evidenced: fresh.length ? usd(evid) : (concepts.length ? "0" : null), concepts: fresh.map((c) => ({ concept: c.concept, value: usd(c.value) })),
      coverage: covOut, cap: null, claimed: "0", status: "NEEDS_INPUT", headroomToCap: null,
      note: [it.note, mapNote, noteExtra].filter(Boolean).join("; ") || it.note, evid, capSpec });
  }

  // ---- totals ----
  const base = baseOk ? BigInt(ev.base!.value) : null;
  const deductions = baseOk ? pairs.filter((p) => p.it.sign === "-" && p.it.coverage !== "HEADER").reduce((a, p) => a + BigInt(p.it.value), 0n) : null;
  // Resolve each cap's named clauses to specific lines by position, not label alone: definitions reuse labels at
  // different nesting levels ("(i)" twice). A reference resolves to the nearest preceding line with that label (the
  // clause a proviso refers back to), else the nearest following one.
  const capMembers = new Map<(typeof lines)[number], Set<(typeof lines)[number]>>();
  lines.forEach((l, idx) => {
    if (!l.capSpec) return;
    const set = new Set<(typeof lines)[number]>();
    for (const lab of l.capSpec.sharedWith) {
      const cands = lines.map((o, j) => ({ o, j })).filter((x) => x.o !== l && x.o.label === lab);
      const before = cands.filter((x) => x.j < idx).pop(), after = cands.find((x) => x.j > idx);
      const pick = before ?? after;
      if (pick) set.add(pick.o);
    }
    capMembers.set(l, set);
  });
  const sharedMember = new Set([...capMembers.values()].flatMap((s) => [...s]));
  const uncapped = lines.filter((l) => !l.capSpec && !sharedMember.has(l));
  for (const l of uncapped) { l.claimed = usd(l.evid); l.status = l.coverage === "FULL" ? "CLAIMED" : "NEEDS_INPUT"; if (l.coverage !== "FULL") l.note = l.coverage === "PARTIAL" ? "partly evidenced; remainder needs input" : "not evidenced in filings"; }
  const e0 = base != null && deductions != null ? base + deductions + uncapped.reduce((a, l) => a + l.evid, 0n) : null;
  const capOpen = uncapped.some((l) => l.coverage !== "FULL");
  // Capped groups: a cap and every clause it names share one limit.
  const done = new Set<(typeof lines)[number]>();
  for (const l of lines.filter((x) => x.capSpec)) {
    if (done.has(l)) continue;
    const group = [l, ...[...(capMembers.get(l) ?? [])].filter((o) => !done.has(o))];
    group.forEach((g) => done.add(g));
    const { amount, note } = capAmount(l.capSpec!, e0);
    let room = amount;
    for (const g of group) {
      const take = room == null ? 0n : g.evid < room ? g.evid : room;
      if (room != null) room -= take;
      g.claimed = usd(take);
      g.cap = { text: l.capSpec!.text.slice(0, 200), amount: amount == null ? null : usd(amount), note: [note, capOpen && l.capSpec!.percents.length ? "cap base excludes add-backs that still need input (cap may be higher)" : "", group.length > 1 ? `shared with ${group.filter((x) => x !== g).map((x) => x.label).join(", ")}` : ""].filter(Boolean).join("; ") };
      g.status = amount == null ? "NEEDS_INPUT" : g.coverage === "FULL" && take === g.evid ? "CLAIMED" : take < g.evid ? "CAPPED" : "NEEDS_INPUT";
      if (g.coverage === "FULL" && take < g.evid) g.status = "CAPPED";
      g.note = amount == null ? note : g.status === "CAPPED" ? "evidenced amount exceeds the cap; cap applied" : g.coverage === "NONE" ? "not evidenced in filings" : g.coverage === "PARTIAL" ? "partly evidenced; remainder needs input" : "mapped";
    }
    // Cap reached: nothing more can be added under it, so the group's maximum is determined.
    if (room === 0n) for (const g of group) if (g.status === "NEEDS_INPUT") { g.status = BigInt(g.claimed) < g.evid ? "CAPPED" : "CLAIMED"; g.note = "cap reached"; }
    const left = room == null ? null : room;
    for (const g of group) g.headroomToCap = left == null ? null : g.status === "NEEDS_INPUT" ? usd(left) : "0";
    if (group.length > 1) { const labels = [...group].sort((a, b) => lines.indexOf(a) - lines.indexOf(b)).map((x) => x.label); for (const g of group) g.capGroup = labels;
      for (const g of group) g.capGroupAt = [...group].map((x) => lines.indexOf(x)).sort((a, b) => a - b); }
  }
  const addBacks: AddBackLine[] = lines.map(({ evid: _e, capSpec: _c, ...l }) => l);
  const open = addBacks.filter((l) => l.status === "NEEDS_INPUT");
  const needsInput = open.map((l) => `${l.label} ${l.category}${l.headroomToCap ? ` (up to ${l.headroomToCap} more under cap)` : l.cap ? "" : " (uncapped)"}`);
  if (!aligned && ev.base != null) return out({ addBacks, needsInput, reason: "definition items could not be aligned; refusing" });
  if (!baseOk) return out({ addBacks, needsInput: [`base/deductions: ${lowerReason}`, ...needsInput], reason: `NEEDS_INPUT: ${lowerReason}` });
  const supported = e0! + addBacks.filter((l) => uncapped.every((u) => u.label !== l.label)).reduce((a, l) => a + BigInt(l.claimed), 0n);
  const complete = !open.length && !ev.items.some((i) => i.label === "(base)" && i.coverage === "PARTIAL");
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
