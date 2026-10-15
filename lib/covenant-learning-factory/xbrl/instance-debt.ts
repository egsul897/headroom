/**
 * Per-facility debt outstanding from a filing's XBRL instance (dimensioned facts on the debt axes), used as basket
 * usage only on an exact name match between the facility the basket names and one debt-axis member. Anything else
 * (no instance, no debt axis, no match, several matches, only a carrying amount) leaves usage NEEDS_INPUT.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolveSecUserAgentFromEnv } from "../../edgar-historical-backfill/sec-identity";

export const DEBT_AXES = ["us-gaap:DebtInstrumentAxis", "us-gaap:LongTermDebtTypeAxis", "us-gaap:LineOfCreditFacilityAxis", "us-gaap:ShortTermDebtTypeAxis", "us-gaap:CreditFacilityAxis"];
/** Concepts that state the amount borrowed and outstanding (principal) under a facility. */
export const PRINCIPAL_CONCEPTS = ["us-gaap:LineOfCredit", "us-gaap:LongTermLineOfCredit", "us-gaap:LineOfCreditFacilityAmountOutstanding", "us-gaap:ShortTermBorrowings", "us-gaap:LongTermDebtGross", "us-gaap:SecuredDebtGross"];
/** Carrying amounts (net of discount/premium/costs): never used as usage. */
export const CARRYING_CONCEPTS = ["us-gaap:LongTermDebt", "us-gaap:DebtInstrumentCarryingAmount", "us-gaap:LongTermDebtNoncurrent", "us-gaap:SecuredDebt"];

export interface FacilityFact { member: string; name: string; axis: string; concept: string; value: bigint; instant: string; accession: string; principal: boolean }

/** "us-gaap:RevolvingCreditFacilityMember" → "Revolving Credit Facility"; "abc:SeniorNotesDue2028Member" → "Senior Notes Due 2028". */
export function memberName(qname: string): string {
  const local = qname.replace(/^[^:]*:/, "").replace(/Member$/, "");
  return local.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/([0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim();
}

export function parseInstanceDebt(xml: string, accession: string): FacilityFact[] {
  const ctx = new Map<string, { dims: Array<[string, string]>; instant: string | null }>();
  for (const m of xml.matchAll(/<(?:xbrli:)?context\s+id="([^"]+)"\s*>([\s\S]*?)<\/(?:xbrli:)?context>/g)) {
    const dims = [...m[2]!.matchAll(/dimension="([^"]+)"\s*>\s*([^<\s]+)\s*</g)].map((d) => [d[1]!, d[2]!] as [string, string]);
    const inst = /<(?:xbrli:)?instant>\s*([^<\s]+)/.exec(m[2]!);
    ctx.set(m[1]!, { dims, instant: inst ? inst[1]! : null });
  }
  const out: FacilityFact[] = [];
  const concepts = [...PRINCIPAL_CONCEPTS, ...CARRYING_CONCEPTS];
  for (const m of xml.matchAll(/<((?:us-gaap):[A-Za-z]+)\s([^>]*?)contextRef="([^"]+)"([^>]*)>\s*(-?\d+)\s*</g)) {
    if (!concepts.includes(m[1]!)) continue;
    const c = ctx.get(m[3]!);
    // Exactly one dimension, on a debt axis: a facility total, not a slice of it (by maturity, by segment, …).
    if (!c?.instant || c.dims.length !== 1 || !DEBT_AXES.includes(c.dims[0]![0])) continue;
    out.push({ member: c.dims[0]![1], name: memberName(c.dims[0]![1]), axis: c.dims[0]![0], concept: m[1]!, value: BigInt(m[5]!), instant: c.instant, accession, principal: PRINCIPAL_CONCEPTS.includes(m[1]!) });
  }
  const latest = out.reduce((a, f) => (f.instant > a ? f.instant : a), "");
  return out.filter((f) => f.instant === latest);
}

const words = (s: string) => s.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9%.]+/g, " ").trim();

/**
 * The capitalized facility names the clause refers to ("the Existing Term Loan Documents", "the 2028 Senior Notes").
 * Trailing document words (Documents, Agreement, Indenture) are dropped: "Indebtedness under the Existing Term Loan
 * Documents" is debt under the Existing Term Loan.
 */
export function clauseFacilityNames(clause: string): string[] {
  const out = new Set<string>();
  for (const m of clause.matchAll(/\b(?:under|pursuant\s+to|in\s+respect\s+of|evidenced\s+by|constituting|of)\s+(?:the|any|such)?\s*((?:(?:\d+(?:\.\d+)?%|[A-Z0-9][A-Za-z0-9\-]*)\s+){0,7}(?:Facility|Facilities|Loans?|Notes|Debentures|Bonds|Documents|Agreement|Indenture))\b/g)) {
    let n = m[1]!.trim().replace(/\s+(?:Documents|Agreement|Indenture)$/, "");
    if (!/[A-Z]/.test(n[0] ?? "")) continue;
    if (/^(?:Loan|Credit|This|Such)$/i.test(n)) continue;
    out.add(n);
  }
  return [...out];
}

export type UsageDecision = { status: "COMPUTED"; usage: bigint; fact: FacilityFact; facility: string } | { status: "NEEDS_INPUT"; reason: string };

/** Usage under a basket from the facility it names: exactly one name, exactly one member equal to it, a principal concept. */
export function basketUsage(clause: string, facts: readonly FacilityFact[], docText?: string): UsageDecision {
  const names = clauseFacilityNames(clause);
  if (!names.length) return { status: "NEEDS_INPUT", reason: "basket names no specific facility" };
  if (names.length > 1) return { status: "NEEDS_INPUT", reason: `basket names several facilities: ${names.join("; ")}` };
  const name = names[0]!;
  const hits = facts.filter((f) => words(f.name) === words(name));
  const members = [...new Set(hits.map((h) => h.member))];
  let via: string | null = null;
  if (!members.length && docText) {
    const r = resolveByDefinition(name, docText, facts);
    if ("reason" in r) return { status: "NEEDS_INPUT", reason: `no XBRL debt-axis member named exactly "${name}"; ${r.reason}` };
    members.push(r.member);
    hits.push(...facts.filter((f) => f.member === r.member));
    via = r.definition;
  }
  if (!members.length) return { status: "NEEDS_INPUT", reason: `no XBRL debt-axis member named exactly "${name}"` };
  if (members.length > 1) return { status: "NEEDS_INPUT", reason: `several XBRL members named "${name}"` };
  const principal = hits.filter((h) => h.principal);
  const values = [...new Set(principal.map((h) => h.value))];
  if (!principal.length) return { status: "NEEDS_INPUT", reason: `"${name}" is reported only as a carrying amount (${hits[0]!.concept}), not principal outstanding` };
  if (values.length > 1) return { status: "NEEDS_INPUT", reason: `"${name}" principal concepts disagree` };
  return { status: "COMPUTED", usage: values[0]!, fact: principal[0]!, facility: via ? `${name} = ${via.slice(0, 160)}` : name };
}

async function secGet(url: string): Promise<string | null> {
  const ua = resolveSecUserAgentFromEnv();
  if (!ua) throw new Error("SEC_EDGAR_USER_AGENT is required");
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const res = await fetch(url, { headers: { "User-Agent": ua } });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue; }
    if (!res.ok) throw new Error(`SEC ${res.status} for ${url}`);
    return await res.text();
  }
  return null;
}

/** Latest 10-Q/10-K (report date on or before asOf) instance, cached under cacheDir. Null when there is none. */
export async function latestInstanceFacts(cik: string, asOf: string, cacheDir: string): Promise<FacilityFact[] | null> {
  const n = cik.replace(/^0+/, "");
  const f = `${cacheDir}/instance-${n}.json`;
  if (existsSync(f)) { const j = JSON.parse(readFileSync(f, "utf8")); return j ? (j as Array<FacilityFact & { value: string }>).map((x) => ({ ...x, value: BigInt(x.value) })) : null; }
  let facts: FacilityFact[] | null = null;
  try {
    const sub = await secGet(`https://data.sec.gov/submissions/CIK${n.padStart(10, "0")}.json`);
    const r = sub ? JSON.parse(sub).filings.recent : null;
    const i = r ? (r.form as string[]).findIndex((form, k) => (form === "10-Q" || form === "10-K") && r.reportDate[k] <= asOf) : -1;
    if (r && i >= 0) {
      const acc = r.accessionNumber[i] as string;
      const dir = `https://www.sec.gov/Archives/edgar/data/${n}/${acc.replace(/-/g, "")}`;
      const idx = await secGet(`${dir}/index.json`);
      const names = idx ? (JSON.parse(idx).directory.item as Array<{ name: string }>).map((x) => x.name) : [];
      const inst = names.find((x) => /_htm\.xml$/.test(x)) ?? names.find((x) => /\.xml$/.test(x) && !/(_cal|_def|_lab|_pre|FilingSummary)/.test(x));
      const xml = inst ? await secGet(`${dir}/${inst}`) : null;
      if (xml) facts = parseInstanceDebt(xml, acc);
    }
  } catch { facts = null; }
  writeFileSync(f, JSON.stringify(facts ? facts.map((x) => ({ ...x, value: x.value.toString() })) : null));
  return facts;
}

// ---- Defined term → instrument (coupon, maturity year, type), matched to one filing debt line ----

const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Spelled-out numbers in XBRL member names → digits: "Five Point Two Five Zero" → "5.250", "Two Thousand Twenty Seven" → "2027". */
export function digitsFromWords(s: string): string {
  let t = s.replace(/\b(Two\s+Thousand)((?:\s+(?:Twenty|Thirty|Forty|Fifty)(?:\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine))?|\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen)))\b/g, (_, __, rest: string) => {
    const w = rest.trim().toLowerCase().split(/\s+/);
    return String(2000 + (TENS[w[0]!] ?? ONES[w[0]!] ?? 0) + (w[1] ? ONES[w[1]] ?? 0 : 0));
  });
  t = t.replace(/\b((?:Zero|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen)\s+Point(?:\s+(?:Zero|One|Two|Three|Four|Five|Six|Seven|Eight|Nine))+)\b/g, (m) => {
    const [a, b] = m.split(/\s+Point\s+/);
    return `${ONES[a!.toLowerCase()]}.${b!.split(/\s+/).map((x) => ONES[x.toLowerCase()]).join("")}`;
  });
  return t;
}

export interface Instrument { type: "NOTES" | "TERM_LOAN" | "REVOLVER"; coupon: number | null; year: number | null }

function instrumentType(s: string): Instrument["type"] | null {
  const n = /\b(?:Notes|Debentures|Bonds)\b/i.test(s), tl = /\bTerm\s+Loans?\b/i.test(s), rv = /\bRevolv/i.test(s);
  return [n, tl, rv].filter(Boolean).length !== 1 ? null : n ? "NOTES" : tl ? "TERM_LOAN" : "REVOLVER";
}

/** The one instrument a phrase names, or null when it names none or several (two coupons, two maturities, two types). */
export function instrumentOf(phrase: string): Instrument | null {
  const s = digitsFromWords(phrase);
  const type = instrumentType(s);
  if (!type) return null;
  const coupons = [...new Set([...s.matchAll(/(\d{1,2}(?:\.\d{1,4})?)\s*(?:%|Percent(?:age)?\b)/gi)].map((m) => Number(m[1])))];
  const years = [...new Set([...s.matchAll(/\bDue\s+(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:\d{1,2},?\s+)?)?(20\d\d)\b/gi)].map((m) => Number(m[1])))];
  if (coupons.length > 1 || years.length > 1) return null;
  return { type, coupon: coupons[0] ?? null, year: years[0] ?? null };
}

/**
 * Every definition of the term: `"Term" means …` (to the end of its sentence) and the parenthetical form
 * `… 9.200% Senior Secured Second Lien Notes due 2028 (the "Notes")` (the phrase before it, within its clause).
 */
export function definitionTexts(doc: string, term: string): string[] {
  const t = doc.replace(/\s+/g, " ");
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const out: string[] = [];
  for (const m of t.matchAll(new RegExp(`[“"]\\s*${esc}\\s*[”"]\\s*(?:shall\\s+mean|means|:)\\s*([^;]{0,400}?)(?:\\.\\s|;|$)`, "g"))) out.push(m[1]!);
  for (const m of t.matchAll(new RegExp(`([^;():]{0,250})\\(\\s*(?:together|collectively)?[^()“"]{0,40}?\\bthe\\s+[“"]\\s*${esc}\\s*[”"]\\s*\\)`, "g"))) out.push(m[1]!);
  return out;
}

/**
 * Usage via the agreement's definition: the term must be defined once, the definition must name exactly one instrument
 * with a coupon and a maturity year, and exactly one filing debt member must carry the same type, coupon and year.
 */
export function resolveByDefinition(name: string, docText: string, facts: readonly FacilityFact[]): { member: string; instrument: Instrument; definition: string } | { reason: string } {
  const defs = definitionTexts(docText, name);
  if (!defs.length) return { reason: `"${name}" is not defined` };
  const all = defs.map(instrumentOf);
  const keys = new Set(all.map((i) => (i && i.coupon != null && i.year != null ? `${i.type}|${i.coupon}|${i.year}` : "none")));
  if (keys.has("none") || keys.size !== 1) return { reason: `definition of "${name}" does not name one instrument with coupon and maturity` };
  const ins = all[0]!;
  const def = defs[0]!;
  const members = [...new Set(facts.map((f) => f.member))].filter((m) => {
    const fi = instrumentOf(memberName(m));
    return fi && fi.type === ins.type && fi.coupon === ins.coupon && fi.year === ins.year;
  });
  if (members.length !== 1) return { reason: members.length ? `several filing debt lines match "${name}"` : `no filing debt line is ${ins.coupon}% ${ins.type} due ${ins.year}` };
  return { member: members[0]!, instrument: ins, definition: def };
}
