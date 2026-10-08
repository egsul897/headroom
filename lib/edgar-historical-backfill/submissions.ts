/**
 * SEC submissions metadata loader — recent + historical archive shards.
 */

import type { SecAccessCoordinator } from "./sec-access";
import type { FilingRef, IssuerRef } from "./types";
import { QUALIFYING_FORMS, filingDebtSignalScore } from "./exhibit-classifier";

const SUBMISSIONS_PREFIX = "https://data.sec.gov/submissions/CIK";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

interface SubmissionsRecent {
  form: string[];
  accessionNumber: string[];
  filingDate: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
  items?: string[];
  size?: number[];
}

interface SubmissionsFile {
  name: string;
  filingCount: number;
  filingFrom: string;
  filingTo: string;
}

interface SubmissionsJson {
  cik?: string | number;
  name?: string;
  tickers?: string[];
  filings?: {
    recent?: SubmissionsRecent;
    files?: SubmissionsFile[];
  };
}

export async function loadCompanyTickers(
  sec: SecAccessCoordinator,
): Promise<Array<{ cik: string; ticker: string; title: string }>> {
  const { status, data } = await sec.getJson<Record<string, { cik_str: number; ticker: string; title: string }>>(
    TICKERS_URL,
  );
  if (status !== 200 || !data) {
    throw new Error(`Failed to load company_tickers.json (HTTP ${status})`);
  }
  return Object.values(data).map((e) => ({
    cik: String(e.cik_str).padStart(10, "0"),
    ticker: e.ticker.toUpperCase(),
    title: e.title,
  }));
}

/**
 * Deterministic pilot universe: first N tickers by CIK ascending from SEC's
 * company_tickers.json (stable, reproducible, no paid data).
 */
export async function selectIssuerUniverse(
  sec: SecAccessCoordinator,
  count: number,
  opts?: { preferTickers?: string[] },
): Promise<IssuerRef[]> {
  const all = await loadCompanyTickers(sec);
  const byTicker = new Map(all.map((a) => [a.ticker, a]));
  // One row per CIK (company_tickers.json often repeats CIKs across share classes).
  const byCik = new Map<string, IssuerRef>();
  for (const a of all) {
    if (!byCik.has(a.cik)) byCik.set(a.cik, { cik: a.cik, ticker: a.ticker, title: a.title });
  }
  const preferred: IssuerRef[] = [];
  const preferredCiks = new Set<string>();
  for (const t of opts?.preferTickers ?? []) {
    const hit = byTicker.get(t.toUpperCase());
    if (hit && !preferredCiks.has(hit.cik)) {
      preferred.push({ cik: hit.cik, ticker: hit.ticker, title: hit.title });
      preferredCiks.add(hit.cik);
    }
  }
  const rest = [...byCik.values()]
    .filter((a) => !preferredCiks.has(a.cik))
    .sort((a, b) => a.cik.localeCompare(b.cik));
  return [...preferred, ...rest].slice(0, count);
}

function flattenRecent(cik: string, recent: SubmissionsRecent): FilingRef[] {
  const out: FilingRef[] = [];
  const n = recent.form?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const form = recent.form[i]!;
    if (!QUALIFYING_FORMS.has(form)) continue;
    out.push({
      cik,
      accessionNumber: recent.accessionNumber[i]!,
      form,
      filingDate: recent.filingDate[i]!,
      primaryDocument: recent.primaryDocument?.[i],
      primaryDocDescription: recent.primaryDocDescription?.[i],
      items: recent.items?.[i],
      size: recent.size?.[i],
    });
  }
  return out;
}

export async function loadIssuerFilings(
  sec: SecAccessCoordinator,
  issuer: IssuerRef,
  opts?: { includeHistoricalArchives?: boolean; maxArchiveFiles?: number },
): Promise<{ issuer: IssuerRef; filings: FilingRef[] }> {
  const cik = issuer.cik.padStart(10, "0");
  const url = `${SUBMISSIONS_PREFIX}${cik}.json`;
  const { status, data } = await sec.getJson<SubmissionsJson>(url);
  if (status !== 200 || !data?.filings?.recent) {
    throw new Error(`submissions unavailable for CIK ${cik} (HTTP ${status})`);
  }

  const enrichedIssuer: IssuerRef = {
    cik,
    ticker: issuer.ticker ?? data.tickers?.[0],
    title: issuer.title ?? data.name,
  };

  const filings = flattenRecent(cik, data.filings.recent);

  if (opts?.includeHistoricalArchives !== false) {
    const files = data.filings.files ?? [];
    const limit = opts?.maxArchiveFiles ?? files.length;
    for (const file of files.slice(0, limit)) {
      const archiveUrl = `https://data.sec.gov/submissions/${file.name}`;
      const archived = await sec.getJson<{ filings?: SubmissionsRecent } & SubmissionsRecent>(archiveUrl);
      if (archived.status !== 200 || !archived.data) continue;
      // Archive shards are either { filings: {...arrays} } or the arrays at top level.
      const recent = (archived.data as { filings?: SubmissionsRecent }).filings
        ? (archived.data as { filings: SubmissionsRecent }).filings
        : (archived.data as unknown as SubmissionsRecent);
      if (recent?.form) filings.push(...flattenRecent(cik, recent));
    }
  }

  // Deduplicate by accession (archives can overlap edges).
  const byAcc = new Map<string, FilingRef>();
  for (const f of filings) byAcc.set(f.accessionNumber, f);
  const unique = [...byAcc.values()].sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  return { issuer: enrichedIssuer, filings: unique };
}

export function rankFilingsForIndexFetch(filings: FilingRef[], maxPerIssuer: number): FilingRef[] {
  const scored = [...filings]
    .map((f) => ({ f, score: filingDebtSignalScore(f.form, f.items, f.primaryDocDescription) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.f.filingDate.localeCompare(a.f.filingDate));

  // Reserve ~1/3 of the index budget for 10-K/10-Q so IBR exhibit tables are
  // discovered, not only inline 8-K Item 1.01 attachments.
  const reserved = Math.max(1, Math.floor(maxPerIssuer / 3));
  const periodic = scored.filter((x) => /^(10-K|10-Q)/i.test(x.f.form)).slice(0, reserved);
  const restBudget = maxPerIssuer - periodic.length;
  const rest = scored.filter((x) => !periodic.includes(x)).slice(0, restBudget);
  const picked = [...rest, ...periodic];
  // Stable unique by accession, newest first within score order.
  const byAcc = new Map<string, FilingRef>();
  for (const x of picked) byAcc.set(x.f.accessionNumber, x.f);
  return [...byAcc.values()].slice(0, maxPerIssuer);
}
