/**
 * Borrower → SEC CIK, deterministically: the borrower's legal name from the preamble (the party given the role
 * "Borrower" / "Parent Borrower" / "Company" / "Issuer"), matched exactly (case, whitespace and punctuation aside)
 * to EDGAR's company-name list. No name, several borrower names, or a name listed under several CIKs → null.
 */
import { readFileSync } from "node:fs";

const ROLES = String.raw`(?:Parent\s+Borrower|Lead\s+Borrower|Initial\s+Borrower|Borrower|Company|Issuer)`;

/** Uppercase, "&" → "AND", punctuation and repeated whitespace removed. */
export function normName(s: string): string {
  // EDGAR conformed names abbreviate the entity suffix ("CONMED CORP"); apply the same abbreviations to both sides.
  return s.toUpperCase().replace(/&/g, " AND ").replace(/[.,'’"“”]/g, "").replace(/\s+/g, " ").trim()
    .replace(/\bCORPORATION$/, "CORP").replace(/\bINCORPORATED$/, "INC").replace(/\bCOMPANY$/, "CO").replace(/\bLIMITED$/, "LTD");
}

/** Distinct legal names given a borrower role in the preamble (first 20,000 characters of plain text). */
export function preambleBorrowerNames(plain: string): string[] {
  const t = plain.replace(/\s+/g, " ").slice(0, 20000);
  const out = new Set<string>();
  const re = new RegExp(String.raw`(?:among|between|by|and|:|\(i\))\s+((?:[A-Z0-9][A-Za-z0-9&.'’\-]*,?\s+){0,8}?(?:Inc|INC|Incorporated|INCORPORATED|Corp|CORP|Corporation|CORPORATION|Company|COMPANY|Co|CO|LLC|L\.L\.C|LP|L\.P|Ltd|LTD|Limited|LIMITED|plc|PLC|N\.V|S\.A|AG|SE|Holdings|HOLDINGS|Trust|TRUST)\.?)\s*(?:\((?:f\/k\/a|formerly)[^)]{0,120}\)\s*)?,?\s*(?:(?:a|an)\s+[^()]{0,120}?)?\(\s*(?:together\s+with[^)]{0,80})?(?:the\s+)?[“"]\s*${ROLES}\s*[”"][^()]{0,200}\)`, "g");
  for (const m of t.matchAll(re)) {
    const name = m[1]!.replace(/,\s*$/, "").trim();
    if (/^(?:The|This|Each|Such)\b/.test(name)) continue;
    out.add(name);
  }
  return [...out];
}

let INDEX: Map<string, Set<string>> | null = null;
/** EDGAR cik-lookup-data.txt ("NAME:0000000000:" per line) as normalized name → CIKs. */
export function loadNameIndex(path: string): Map<string, Set<string>> {
  if (INDEX) return INDEX;
  const m = new Map<string, Set<string>>();
  for (const line of readFileSync(path, "latin1").split("\n")) {
    const k = /^(.*):(\d{10}):\s*$/.exec(line);
    if (!k || !k[1]) continue;
    // EDGAR appends state/series tags to conformed names ("LAWSON PRODUCTS INC/NEW/DE/"): drop them.
    const n = normName(k[1].replace(/(?:\s*\/[A-Z0-9 ]{1,12})+\/?\s*$/, ""));
    (m.get(n) ?? m.set(n, new Set()).get(n)!).add(k[2]!);
  }
  INDEX = m;
  return m;
}

export type CikResolution = { cik: string; name: string } | { cik: null; reason: string };

/** CIKs in SEC company_tickers.json (registrants with a listed ticker). */
export function loadTickerCiks(path: string): Set<string> {
  const j = JSON.parse(readFileSync(path, "utf8")) as Record<string, { cik_str: number }>;
  return new Set(Object.values(j).map((x) => String(x.cik_str).padStart(10, "0")));
}

export function resolveBorrowerCik(plain: string, index: Map<string, Set<string>>, tickerCiks?: Set<string>): CikResolution {
  const names = preambleBorrowerNames(plain);
  if (!names.length) return { cik: null, reason: "no borrower legal name in the preamble" };
  const norm = [...new Set(names.map(normName))];
  if (norm.length > 1) return { cik: null, reason: `several borrower names: ${names.join("; ")}` };
  const ciks = index.get(norm[0]!);
  if (!ciks || !ciks.size) return { cik: null, reason: `"${names[0]}" is not an EDGAR company name` };
  if (ciks.size === 1) return { cik: [...ciks][0]!, name: names[0]! };
  // Several filers share the conformed name: keep the one listed registrant, if exactly one is listed.
  const listed = tickerCiks ? [...ciks].filter((c) => tickerCiks.has(c)) : [];
  if (listed.length === 1) return { cik: listed[0]!, name: names[0]! };
  return { cik: null, reason: `"${names[0]}" matches several CIKs` };
}
