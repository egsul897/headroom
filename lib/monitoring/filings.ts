/**
 * EDGAR new-filing detection. Uses SEC's public submissions JSON with the
 * operator's declared User-Agent (SEC_EDGAR_USER_AGENT, SEC fair-access
 * policy). Unset UA ⇒ SKIPPED (no anonymous scraping). No paid data, no AI.
 */
export interface SecFiling {
  accessionNumber: string;
  form: string;
  filingDate: string;
}

export type FetchJson = (url: string, init: { headers: Record<string, string> }) => Promise<{ status: number; json(): Promise<unknown> }>;

/** Forms that change the financial inputs or the debt documents a CFO cares about. */
export const MONITORED_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "20-F", "40-F", "6-K"]);
export const FINANCIAL_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "40-F"]);

export function normalizeCik(cik: string | null | undefined): string | null {
  if (!cik) return null;
  const d = cik.replace(/\D/g, "");
  if (!d || d.length > 10) return null;
  return d.padStart(10, "0");
}

export type SubmissionsResult =
  | { ok: true; filings: SecFiling[] }
  | { ok: false; reason: "SEC_UA_UNSET" | "INVALID_CIK" | "SEC_HTTP_ERROR" | "SEC_MALFORMED"; status?: number };

export async function fetchRecentFilings(
  cik: string | null,
  opts: { userAgent: string | undefined; fetchImpl?: FetchJson },
): Promise<SubmissionsResult> {
  const ua = opts.userAgent?.trim();
  if (!ua || !/@/.test(ua)) return { ok: false, reason: "SEC_UA_UNSET" };
  const padded = normalizeCik(cik);
  if (!padded) return { ok: false, reason: "INVALID_CIK" };
  const f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchJson);
  let res: { status: number; json(): Promise<unknown> };
  try {
    res = await f(`https://data.sec.gov/submissions/CIK${padded}.json`, { headers: { "User-Agent": ua, Accept: "application/json" } });
  } catch {
    return { ok: false, reason: "SEC_HTTP_ERROR" };
  }
  if (res.status !== 200) return { ok: false, reason: "SEC_HTTP_ERROR", status: res.status };
  const body = (await res.json().catch(() => null)) as { filings?: { recent?: { form?: unknown; accessionNumber?: unknown; filingDate?: unknown } } } | null;
  const r = body?.filings?.recent;
  if (!r || !Array.isArray(r.form) || !Array.isArray(r.accessionNumber) || !Array.isArray(r.filingDate)) return { ok: false, reason: "SEC_MALFORMED" };
  const n = Math.min(r.form.length, r.accessionNumber.length, r.filingDate.length);
  const filings: SecFiling[] = [];
  for (let i = 0; i < n; i++) {
    const form = String(r.form[i]);
    if (!MONITORED_FORMS.has(form)) continue;
    filings.push({ accessionNumber: String(r.accessionNumber[i]), form, filingDate: String(r.filingDate[i]) });
  }
  return { ok: true, filings };
}

/** Filings not yet seen. On a company's first sweep everything is baseline (recorded, not alerted). */
export function diffNewFilings(current: SecFiling[], seenAccessions: ReadonlySet<string>): SecFiling[] {
  return current.filter((f) => !seenAccessions.has(f.accessionNumber));
}
