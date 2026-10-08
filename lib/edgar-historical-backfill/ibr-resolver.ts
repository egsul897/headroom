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
const FORM_DATE_RE = /\b((?:Form\s+)?(?:8-K|10-K|10-Q|S-1|S-3|S-4|20-F)(?:\/A)?)\b(?:[^.]{0,80}?)(?:filed|on)?\s*(?:on\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})?/i;

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
    const formDate = FORM_DATE_RE.exec(rawText);
    return {
      rawText,
      resolvedExhibitType,
      resolutionStatus: formDate ? "PARTIAL" : "UNRESOLVED",
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
