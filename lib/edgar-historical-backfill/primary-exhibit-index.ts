/**
 * Parse Item 15 / exhibit-index rows from a 10-K/10-Q primary HTML document.
 *
 * Modern EDGAR indexes often list only newly filed exhibits; agreements
 * incorporated by reference appear in the primary form's exhibit list.
 * Fetching that primary document is still metadata discovery — not an
 * exhibit-body download.
 */

import { classifyExhibit, agreementIdentityKey } from "./exhibit-classifier";
import { parseIncorporatedByReference } from "./ibr-resolver";
import type { ExhibitRef, FilingRef } from "./types";

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&#8220;|&#8221;|&quot;/gi, '"')
    .replace(/&#8217;|&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a window around the exhibit index / Item 15 section when present. */
export function extractExhibitIndexWindow(html: string): string {
  const text = stripTags(html);
  // Prefer the LAST match — the TOC near the top also says "Item 15. Exhibits".
  const markers = [
    /Item\s*15[\.\s].{0,120}(Exhibits|Financial Statement Schedules)/gi,
    /EXHIBIT\s+INDEX/gi,
    /Index\s+to\s+Exhibits/gi,
  ];
  let start = -1;
  for (const re of markers) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      start = m.index;
    }
  }
  if (start === -1) {
    // Fallback: last 20% of the document often holds the exhibit list.
    start = Math.floor(text.length * 0.8);
  }
  return text.slice(start, start + 200_000);
}

/**
 * Match lines like:
 *  10.1 - Eighth Amended and Restated Credit Agreement ... Incorporated by reference to Exhibit 10.1 of ... Form 8-K filed ... June 16, 2025
 */
const EXHIBIT_LINE_RE =
  /\b((?:10|4)\.\d+[A-Za-z]?)\s*[-–—:]\s+(.{10,400}?)(?=(?:\b(?:10|4)\.\d+[A-Za-z]?\s*[-–—:]|\bItem\s*16\b|\bSIGNATURES\b|$))/gi;

export function parsePrimaryExhibitIndex(html: string): Array<{
  exhibitType: string;
  description: string;
  ibrText?: string;
}> {
  const window = extractExhibitIndexWindow(html);
  const out: Array<{ exhibitType: string; description: string; ibrText?: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = EXHIBIT_LINE_RE.exec(window)) !== null) {
    const num = m[1]!;
    const body = m[2]!.replace(/\s+/g, " ").trim();
    const ibrMatch = /incorporated by reference[\s\S]{0,240}/i.exec(body);
    out.push({
      exhibitType: `EX-${num}`,
      description: body.replace(/\s*incorporated by reference[\s\S]*/i, "").trim(),
      ibrText: ibrMatch?.[0],
    });
  }
  return out;
}

export function exhibitsFromPrimaryDocument(filing: FilingRef, html: string): ExhibitRef[] {
  const rows = parsePrimaryExhibitIndex(html);
  const out: ExhibitRef[] = [];
  for (const row of rows) {
    const classified = classifyExhibit({
      filename: `${row.exhibitType.toLowerCase()}.htm`,
      description: row.description,
      exhibitType: row.exhibitType,
    });
    if (classified.matchedSignals.includes("non_debt_false_positive")) continue;
    if (classified.relevanceScore < 55 && !row.ibrText) continue;

    const ibr = row.ibrText
      ? parseIncorporatedByReference({
          description: `${row.description} ${row.ibrText}`,
          documentCellText: row.ibrText,
          cik: filing.cik,
        })
      : undefined;

    out.push({
      cik: filing.cik,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      form: filing.form,
      exhibitType: row.exhibitType,
      filename: ibr?.resolvedFilename ?? `${row.exhibitType.toLowerCase().replace("ex-", "ex")}-ibr`,
      description: row.description,
      sourceUri: ibr?.resolvedSourceUri,
      documentKind: classified.documentKind,
      relevanceScore: classified.relevanceScore,
      isIncorporatedByReference: Boolean(row.ibrText),
      ibr,
      agreementIdentityKey: agreementIdentityKey({
        cik: filing.cik,
        documentKind: classified.documentKind,
        description: row.description,
        filename: row.exhibitType,
        filingDate: filing.filingDate,
        accessionNumber: filing.accessionNumber,
      }),
      discoveryStatus: ibr && ibr.resolutionStatus === "UNRESOLVED" ? "IBR_UNRESOLVED" : "DISCOVERED",
    });
  }
  return out;
}
