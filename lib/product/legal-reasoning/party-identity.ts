/**
 * Issuer / borrower identity normalization for package graphs.
 * Discovery aid — does not authenticate parties for legal execution.
 */

export interface NormalizedPartyIdentity {
  canonicalName: string;
  aliases: string[];
  cik: string | null;
  ticker: string | null;
  roleHints: Array<"ISSUER" | "BORROWER" | "GUARANTOR" | "PARENT">;
}

const LEGAL_SUFFIX =
  /\b(?:inc\.?|incorporated|llc|l\.?l\.?c\.?|corp\.?|corporation|ltd\.?|limited|lp|l\.?p\.?|plc|co\.?|company)\b/gi;

export function normalizePartyName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function padCik(cik: string | null | undefined): string | null {
  if (!cik?.trim()) return null;
  const digits = cik.replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(10, "0");
}

export function buildPartyIdentity(input: {
  issuerName?: string | null;
  issuerCik?: string | null;
  issuerTicker?: string | null;
  borrowerNames?: string[];
  guarantorNames?: string[];
  parentName?: string | null;
}): NormalizedPartyIdentity {
  const canonical = normalizePartyName(input.issuerName ?? input.borrowerNames?.[0] ?? "unknown");
  const aliases = new Set<string>();
  if (input.issuerName) aliases.add(normalizePartyName(input.issuerName));
  for (const b of input.borrowerNames ?? []) aliases.add(normalizePartyName(b));
  for (const g of input.guarantorNames ?? []) aliases.add(normalizePartyName(g));
  if (input.parentName) aliases.add(normalizePartyName(input.parentName));

  const roleHints: NormalizedPartyIdentity["roleHints"] = [];
  if (input.issuerName || input.issuerCik) roleHints.push("ISSUER");
  if (input.borrowerNames?.length) roleHints.push("BORROWER");
  if (input.guarantorNames?.length) roleHints.push("GUARANTOR");
  if (input.parentName) roleHints.push("PARENT");

  return {
    canonicalName: canonical,
    aliases: [...aliases].filter(Boolean),
    cik: padCik(input.issuerCik),
    ticker: input.issuerTicker?.trim().toUpperCase() || null,
    roleHints,
  };
}

/** Same issuer when CIK matches, else fuzzy canonical name. */
export function partiesLikelySame(
  a: Pick<NormalizedPartyIdentity, "canonicalName" | "cik">,
  b: Pick<NormalizedPartyIdentity, "canonicalName" | "cik">,
): boolean {
  if (a.cik && b.cik) return a.cik === b.cik;
  if (!a.canonicalName || !b.canonicalName) return false;
  if (a.canonicalName === b.canonicalName) return true;
  return a.canonicalName.includes(b.canonicalName) || b.canonicalName.includes(a.canonicalName);
}
