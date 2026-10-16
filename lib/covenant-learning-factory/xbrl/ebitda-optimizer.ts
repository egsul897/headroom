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
import { CAPPED, COST_LIKE, HEADER, QUALIFIED, TWO_SIDED, definitionSegments, markers, evaluateDefinition, mapEbitdaItem, type DefinitionEvaluation } from "./definition-items";

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
  note: string;
}
export interface EbitdaOptimization {
  term: string; periodEnd: string | null;
  status: "MAXIMIZED" | "NEEDS_INPUT";
  /** Maximum Consolidated EBITDA; only when every add-back is evidenced and every cap determinable. */
  maximum: string | null;
  /** Base + exact deductions + evidenced (capped) add-backs; null when the base or a deduction is not derivable. */
  supported: string | null;
  base: { concept: string; value: string } | null; deductions: string | null;
  addBacks: AddBackLine[]; needsInput: string[]; reason: string;
}

const EXTRA: Array<{ cat: AddBackCategory; re: RegExp; concepts: string[] }> = [
  { cat: "INTEGRATION", re: /\bintegration\b/i, concepts: ["BusinessCombinationIntegrationRelatedCosts"] },
  { cat: "TRANSACTION_COSTS", re: /\b(?:transactions?|acquisitions?|mergers?)\b[^;]{0,200}\b(?:costs?|fees|expenses?|charges?)\b|\b(?:costs?|fees|expenses?|charges?)\b[^;]{0,200}\b(?:transactions?|acquisitions?|mergers?)\b/i, concepts: ["BusinessCombinationAcquisitionRelatedCosts"] },
  { cat: "SEVERANCE", re: /\bseverance\b/i, concepts: ["SeveranceCosts1"] },
];

export function categorize(t: string): AddBackCategory {
  if (/run[- ]rate|cost\s+savings|synerg|operating\s+expense\s+reductions/i.test(t)) return "RUN_RATE_SYNERGIES";
  if (/(?:stock|equity|share)[- ]based\s+compensation|stock\s+options?|equity\s+awards?/i.test(t)) return "STOCK_COMP";
  if (/depreciation|amortization(?!\s+of\s+(?:deferred\s+)?(?:financing|debt))/i.test(t) && !/non-?cash\s+charges/i.test(t)) return "D&A";
  if (/\binterest\b/i.test(t)) return "INTEREST";
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
  for (const m of markers(segs[0]!.text)) sign = m;
  if (/\bincreas/i.test(segs[0]!.text) && !/\bdecreas|deducted/i.test(segs[0]!.text)) sign = "-";
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

export function optimizeConsolidatedEbitda(term: string, text: string, fin: IssuerFinancials): EbitdaOptimization {
  const ev: DefinitionEvaluation = evaluateDefinition("EBITDA", term, text, fin);
  const segs = definitionSegments("EBITDA", term, text);
  const out = (o: Partial<EbitdaOptimization>): EbitdaOptimization => ({ term, periodEnd: fin.anchor ?? null, status: "NEEDS_INPUT", maximum: null, supported: null, base: ev.base, deductions: null, addBacks: [], needsInput: [], reason: ev.reason, ...o });
  if (!segs) return out({ needsInput: [`"${term}" definition`] });
  const aligned = ev.items.length === segs.length - 1;
  const signs = itemSigns(segs);
  const raw = segs.slice(1).map((s, i) => ({ full: s.text, it: aligned ? { ...ev.items[i]! } : { label: s.label, text: s.text, sign: signs[i]!.sign, coverage: signs[i]!.header ? "HEADER" as const : "NONE" as const, concepts: [] as Array<{ concept: string; value: string }>, value: "0", note: "" } }));
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

  // Base must be derivable; every top-level item that could lower the figure must be exact. Sub-clauses merged into an
  // add-back (provisos, cap limbs) do not count as separate items; the merged add-back itself is checked for two-sidedness.
  const lowering = pairs.filter((p) => p.it.coverage !== "HEADER" && (p.it.sign === "-" ? p.it.coverage !== "FULL" : p.it.sign === "?" || TWO_SIDED.test(p.full.replace(CAPPED.test(p.full) ? (parseCap(p.full)?.text ?? "") : "", " "))));
  const baseOk = aligned && ev.base != null && !lowering.length;
  const lowerReason = ev.base == null ? ev.reason : lowering.length ? `items that could lower the total are not in filings: ${lowering.slice(0, 3).map((p) => `${p.it.label} ${p.full.slice(0, 60)}`).join("; ")}` : ev.reason;

  // ---- add-backs: evidence and caps per line ----
  const used = new Set<string>(), consumedInputs = new Set<string>();
  const lines: Array<AddBackLine & { evid: bigint; capSpec: CapSpec | null }> = [];
  for (const { it, full } of pairs) {
    if (it.coverage === "HEADER" || it.sign === "-" || (it.sign === "?" && !aligned)) continue;
    const capSpec = CAPPED.test(full) ? parseCap(full) : null;
    const scopeText = capSpec ? full.replace(capSpec.text, " ") : full;
    const cat = categorize(scopeText);
    let concepts: Array<{ concept: string; value: bigint }> = [];
    let coverage: AddBackLine["coverage"] = "NONE";
    // A borrower-supplied amount (with its source) answers the whole line, like a filing figure.
    const bi = borrowerInput(fin, [`ADDBACK:${it.label}`, cat === "OTHER" ? "" : `ADDBACK:${cat}`].filter((k) => k && !consumedInputs.has(k.toUpperCase())));
    if (bi) { consumedInputs.add(bi.key.toUpperCase()); concepts = [{ concept: `borrower:${bi.key} [${bi.source}]`, value: BigInt(bi.value) }]; coverage = "FULL"; }
    else if (!capSpec && (it.coverage === "FULL" || it.coverage === "PARTIAL")) {
      concepts = it.concepts.map((c) => ({ concept: c.concept, value: BigInt(c.value) }));
      coverage = it.coverage === "FULL" ? "FULL" : concepts.length ? "PARTIAL" : "NONE";
    } else if (!QUALIFIED.test(scopeText)) {
      const m = mapEbitdaItem(scopeText, fin, text, 0);
      if (m && m !== "TWO_SIDED") { concepts = m.concepts; coverage = "PARTIAL"; }
    }
    if (!bi && !concepts.length && !QUALIFIED.test(scopeText)) {
      for (const x of EXTRA) if (x.re.test(scopeText)) for (const c of x.concepts) { const v = fin.values.find((f) => f.metric === "item" && f.concept === c); if (v) { concepts.push({ concept: c, value: BigInt(v.value) }); coverage = "PARTIAL"; } }
    }
    const fresh = concepts.filter((c) => !used.has(c.concept));
    fresh.forEach((c) => used.add(c.concept));
    // Only charges that reduced net income can be added back: a net credit adds nothing.
    const evid = fresh.reduce((a, c) => a + (c.value > 0n ? c.value : 0n), 0n);
    lines.push({ label: it.label, text: full.slice(0, 200), category: cat, evidenced: fresh.length ? usd(evid) : null, concepts: fresh.map((c) => ({ concept: c.concept, value: usd(c.value) })),
      coverage: fresh.length ? coverage : "NONE", cap: null, claimed: "0", status: "NEEDS_INPUT", headroomToCap: null, note: it.note, evid, capSpec });
  }

  // ---- totals ----
  const base = baseOk ? BigInt(ev.base!.value) : null;
  const deductions = baseOk ? pairs.filter((p) => p.it.sign === "-" && p.it.coverage !== "HEADER").reduce((a, p) => a + BigInt(p.it.value), 0n) : null;
  const uncapped = lines.filter((l) => !l.capSpec && !lines.some((o) => o.capSpec?.sharedWith.includes(l.label)));
  for (const l of uncapped) { l.claimed = usd(l.evid); l.status = l.coverage === "FULL" ? "CLAIMED" : "NEEDS_INPUT"; if (l.coverage !== "FULL") l.note = l.coverage === "PARTIAL" ? "partly evidenced; remainder needs input" : "not evidenced in filings"; }
  const e0 = base != null && deductions != null ? base + deductions + uncapped.reduce((a, l) => a + l.evid, 0n) : null;
  const capOpen = uncapped.some((l) => l.coverage !== "FULL");
  // Capped groups: a cap and every clause it names share one limit.
  const done = new Set<string>();
  for (const l of lines.filter((x) => x.capSpec)) {
    if (done.has(l.label)) continue;
    const group = [l, ...lines.filter((o) => o !== l && l.capSpec!.sharedWith.includes(o.label))];
    group.forEach((g) => done.add(g.label));
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
  }
  const addBacks: AddBackLine[] = lines.map(({ evid: _e, capSpec: _c, ...l }) => l);
  const open = addBacks.filter((l) => l.status === "NEEDS_INPUT");
  const needsInput = open.map((l) => `${l.label} ${l.category}${l.headroomToCap ? ` (up to ${l.headroomToCap} more under cap)` : l.cap ? "" : " (uncapped)"}`);
  if (!aligned && ev.base != null) return out({ addBacks, needsInput, reason: "definition items could not be aligned; refusing" });
  if (!baseOk) return out({ addBacks, needsInput: [`base/deductions: ${lowerReason}`, ...needsInput], reason: `NEEDS_INPUT: ${lowerReason}` });
  const supported = e0! + addBacks.filter((l) => uncapped.every((u) => u.label !== l.label)).reduce((a, l) => a + BigInt(l.claimed), 0n);
  const complete = !open.length && !ev.items.some((i) => i.label === "(base)" && i.coverage === "PARTIAL");
  return out({ status: complete ? "MAXIMIZED" : "NEEDS_INPUT", maximum: complete ? usd(supported) : null, supported: usd(supported), deductions: usd(deductions!), addBacks, needsInput,
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
  return { ...base, status: "COMPUTED", capacity: room.toString(), bound: opt.maximum ? "EXACT" : "AT_LEAST", reason: `${maxLeverage}x × ${base.ebitdaBasis} EBITDA ${base.ebitda} − debt ${debt.value}` };
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
