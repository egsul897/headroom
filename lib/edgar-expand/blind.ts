/**
 * Reserved blind packages that EDGAR expansion must never fetch or import.
 *
 * Knife River Corporation (NYSE: KNF, CIK 0001955520, formerly Knife River
 * Holding Co) is the reserved blind issuer. Exclusion is by CIK, ticker, and
 * issuer name — not by a passing mention of the name in an unrelated note.
 */

export const KNIFE_RIVER_CIK = "0001955520";

const BLIND_TICKERS = new Set(["KNF"]);

export type BlindIssuerFields = {
  cik?: string | null;
  ticker?: string | null;
  title?: string | null;
  name?: string | null;
};

export function normalizeCikDigits(cik: string | null | undefined): string {
  const digits = (cik ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(10, "0").slice(-10);
}

export function isReservedBlindIssuer(issuer: BlindIssuerFields): boolean {
  const cik = normalizeCikDigits(issuer.cik);
  if (cik && cik === KNIFE_RIVER_CIK) return true;
  const ticker = (issuer.ticker ?? "").trim().toUpperCase();
  if (BLIND_TICKERS.has(ticker)) return true;
  const name = `${issuer.title ?? ""} ${issuer.name ?? ""}`;
  return /\bknife\s+river\b/i.test(name);
}

/**
 * True when a URL, filename, or exhibit description points at the reserved
 * blind issuer. Short metadata fields only — do not run this on full bodies.
 */
export function isReservedBlindReference(text: string | null | undefined): boolean {
  if (!text) return false;
  if (/\bknife\s+river\b/i.test(text)) return true;
  if (/(?:^|[^0-9])1955520(?:[^0-9]|$)/.test(text)) return true;
  if (/(?:^|[^A-Za-z0-9])KNF(?:[^A-Za-z0-9]|$)/i.test(text)) return true;
  return false;
}
