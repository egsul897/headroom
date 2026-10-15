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
export function basketUsage(clause: string, facts: readonly FacilityFact[]): UsageDecision {
  const names = clauseFacilityNames(clause);
  if (!names.length) return { status: "NEEDS_INPUT", reason: "basket names no specific facility" };
  if (names.length > 1) return { status: "NEEDS_INPUT", reason: `basket names several facilities: ${names.join("; ")}` };
  const name = names[0]!;
  const hits = facts.filter((f) => words(f.name) === words(name));
  const members = [...new Set(hits.map((h) => h.member))];
  if (!members.length) return { status: "NEEDS_INPUT", reason: `no XBRL debt-axis member named exactly "${name}"` };
  if (members.length > 1) return { status: "NEEDS_INPUT", reason: `several XBRL members named "${name}"` };
  const principal = hits.filter((h) => h.principal);
  const values = [...new Set(principal.map((h) => h.value))];
  if (!principal.length) return { status: "NEEDS_INPUT", reason: `"${name}" is reported only as a carrying amount (${hits[0]!.concept}), not principal outstanding` };
  if (values.length > 1) return { status: "NEEDS_INPUT", reason: `"${name}" principal concepts disagree` };
  return { status: "COMPUTED", usage: values[0]!, fact: principal[0]!, facility: name };
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
