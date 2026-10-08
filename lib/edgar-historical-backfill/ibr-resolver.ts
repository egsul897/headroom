/**
 * Incorporated-by-reference (IBR) resolver.
 *
 * Resolves exhibit rows that point at earlier filings back to the original
 * accession number and, when present, exhibit type / filename / URL.
 * Operates on filing-index HTML text only — no exhibit body download.
 */

import type { IncorporatedByReference } from "./types";

const ACCESSION_RE = /\b(\d{10}-\d{2}-\d{6})\b/g;
const EXHIBIT_RE = /\b(?:Exhibit|Ex\.?)\s*([0-9]+(?:\.[0-9]+)?[A-Za-z]?)\b/i;
const FORM_RE = /\b(?:Form\s+)?(8-K|10-K|10-Q|S-1|S-3|S-4|20-F)(?:\/A)?\b/i;
const DATE_RE =
  /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/i;

export interface IbrParseInput {
  description: string;
  documentCellText: string;
  href?: string;
  /** Issuer CIK (10-digit) for URL construction when accession is known. */
  cik: string;
}

export function looksLikeIncorporatedByReference(description: string, documentCellText: string, href?: string): boolean {
  const blob = `${description} ${documentCellText}`.toLowerCase();
  if (/incorporated\s+by\s+reference/.test(blob)) return true;
  if (/incorporated\s+herein\s+by\s+reference/.test(blob)) return true;
  // Index rows sometimes omit a document link and only cite a prior filing.
  if (!href && ACCESSION_RE.test(blob)) return true;
  ACCESSION_RE.lastIndex = 0;
  return false;
}

export function parseIncorporatedByReference(input: IbrParseInput): IncorporatedByReference {
  const rawText = `${input.description} ${input.documentCellText}`.replace(/\s+/g, " ").trim();
  const accessions = [...rawText.matchAll(ACCESSION_RE)].map((m) => m[1]!);
  const exhibitMatch = EXHIBIT_RE.exec(rawText);
  const resolvedExhibitType = exhibitMatch ? `EX-${exhibitMatch[1]}` : undefined;

  if (accessions.length === 0) {
    const formHit = FORM_RE.exec(rawText);
    const dateHit = DATE_RE.exec(rawText);
    return {
      rawText,
      resolvedExhibitType,
      resolutionStatus: formHit || dateHit ? "PARTIAL" : "UNRESOLVED",
    };
  }

  const resolvedAccessionNumber = accessions[0]!;
  const resolvedFilename = undefined; // unknown until original index is fetched
  const resolvedSourceUri = resolvedExhibitType
    ? undefined // need original index filename
    : indexUrlFor(input.cik, resolvedAccessionNumber);

  return {
    rawText,
    resolvedAccessionNumber,
    resolvedExhibitType,
    resolvedFilename,
    resolvedSourceUri,
    resolutionStatus: resolvedExhibitType ? "PARTIAL" : "RESOLVED",
  };
}

/** Normalize common SEC date prose to YYYY-MM-DD. */
export function parseSecDateProse(raw: string): string | null {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdY = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdY) {
    const y = mdY[3]!.length === 2 ? `20${mdY[3]}` : mdY[3]!;
    return `${y}-${mdY[1]!.padStart(2, "0")}-${mdY[2]!.padStart(2, "0")}`;
  }
  const months: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  const named = raw.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  if (named) {
    return `${named[3]}-${months[named[1]!.toLowerCase()]}-${named[2]!.padStart(2, "0")}`;
  }
  return null;
}

export function extractIbrFormAndDate(rawText: string): { form?: string; date?: string } {
  const formHit = FORM_RE.exec(rawText);
  const dateHit = DATE_RE.exec(rawText);
  const form = formHit?.[1]?.toUpperCase();
  const date = dateHit?.[0] ? parseSecDateProse(dateHit[0]) ?? undefined : undefined;
  return { form, date };
}

/**
 * When IBR prose cites Form + date but not accession, resolve against the
 * issuer's already-loaded submissions catalog (no extra SEC call).
 */
export function resolveIbrAccessionFromFilings(
  ibr: IncorporatedByReference,
  filings: Array<{ form: string; filingDate: string; accessionNumber: string }>,
): IncorporatedByReference {
  if (ibr.resolvedAccessionNumber) return ibr;
  const { form, date } = extractIbrFormAndDate(ibr.rawText);
  if (!form || !date) return ibr;
  const hit = filings.find((f) => f.form.toUpperCase() === form && f.filingDate === date);
  if (!hit) {
    // Allow ±1 day (weekend/acceptance quirks).
    const nearby = filings.find((f) => {
      if (f.form.toUpperCase() !== form) return false;
      const a = Date.parse(f.filingDate);
      const b = Date.parse(date);
      return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 2 * 86_400_000;
    });
    if (!nearby) return ibr;
    return {
      ...ibr,
      resolvedAccessionNumber: nearby.accessionNumber,
      resolutionStatus: ibr.resolvedExhibitType ? "PARTIAL" : "RESOLVED",
    };
  }
  return {
    ...ibr,
    resolvedAccessionNumber: hit.accessionNumber,
    resolutionStatus: ibr.resolvedExhibitType ? "PARTIAL" : "RESOLVED",
  };
}

/**
 * Given the original filing's index rows, complete a PARTIAL IBR that knows
 * accession + exhibit type into a concrete filename/URL.
 */
export function completeIbrFromOriginalIndex(
  ibr: IncorporatedByReference,
  originalRows: Array<{ type: string; filename: string; href: string; description: string }>,
  cik: string,
): IncorporatedByReference {
  if (!ibr.resolvedAccessionNumber) return ibr;
  const want = (ibr.resolvedExhibitType ?? "").toUpperCase().replace(/\s+/g, "");
  if (!want) {
    return { ...ibr, resolutionStatus: ibr.resolutionStatus === "UNRESOLVED" ? "UNRESOLVED" : "PARTIAL" };
  }
  const match = originalRows.find((r) => {
    const t = r.type.toUpperCase().replace(/\s+/g, "");
    return t === want || t.startsWith(want) || want.startsWith(t);
  });
  if (!match) {
    return {
      ...ibr,
      resolvedSourceUri: indexUrlFor(cik, ibr.resolvedAccessionNumber),
      resolutionStatus: "PARTIAL",
    };
  }
  return {
    ...ibr,
    resolvedFilename: match.filename,
    resolvedExhibitType: match.type || ibr.resolvedExhibitType,
    resolvedSourceUri: absoluteSecUrl(match.href),
    resolutionStatus: "RESOLVED",
  };
}

export function indexUrlFor(cik: string, accessionNumber: string): string {
  const accNoDashes = accessionNumber.replace(/-/g, "");
  const cikNoLeadingZeros = String(Number(cik));
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accNoDashes}/${accessionNumber}-index.htm`;
}

export function absoluteSecUrl(href: string): string {
  if (href.startsWith("http")) return href;
  return `https://www.sec.gov${href.startsWith("/") ? "" : "/"}${href}`;
}

export function archivesDocUrl(cik: string, accessionNumber: string, filename: string): string {
  const accNoDashes = accessionNumber.replace(/-/g, "");
  const cikNoLeadingZeros = String(Number(cik));
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accNoDashes}/${filename}`;
}
