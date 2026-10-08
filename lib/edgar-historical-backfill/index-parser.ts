/**
 * Filing-index HTML parser (same pragmatic regex discipline as EdgarConnector).
 */

import { classifyExhibit, isProseExhibitFilename } from "./exhibit-classifier";
import {
  absoluteSecUrl,
  archivesDocUrl,
  completeIbrFromOriginalIndex,
  looksLikeIncorporatedByReference,
  parseIncorporatedByReference,
} from "./ibr-resolver";
import type { ExhibitRef, FilingRef } from "./types";
import { agreementIdentityKey } from "./exhibit-classifier";

export interface IndexExhibitRow {
  description: string;
  type: string;
  href?: string;
  filename: string;
  documentCellText: string;
}

export function parseIndexExhibitRows(html: string): IndexExhibitRow[] {
  const rows: IndexExhibitRow[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1] ?? "";
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1] ?? "");
    }
    if (cells.length < 4) continue;
    // Common shapes: Seq|Description|Document|Type|Size  OR Description|Document|Type|Size
    let description: string;
    let documentCell: string;
    let type: string;
    if (cells.length >= 5) {
      description = cells[1] ?? "";
      documentCell = cells[2] ?? "";
      type = cells[3] ?? "";
    } else {
      description = cells[0] ?? "";
      documentCell = cells[1] ?? "";
      type = cells[2] ?? "";
    }
    const linkMatch = linkRegex.exec(documentCell);
    const href = linkMatch?.[1];
    const linkText = (linkMatch?.[2] ?? "").replace(/<[^>]+>/g, "").trim();
    const documentCellText = documentCell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const filename = href ? (href.split("/").pop() ?? linkText) : linkText || "unknown";
    rows.push({
      description: description.replace(/<[^>]+>/g, "").trim(),
      type: type.replace(/<[^>]+>/g, "").trim(),
      href,
      filename,
      documentCellText,
    });
  }
  return rows;
}

export function exhibitsFromIndexHtml(filing: FilingRef, html: string): ExhibitRef[] {
  const rows = parseIndexExhibitRows(html);
  const out: ExhibitRef[] = [];

  for (const row of rows) {
    const classified = classifyExhibit({
      filename: row.filename,
      description: row.description,
      exhibitType: row.type,
    });
    const ibrLike = looksLikeIncorporatedByReference(row.description, row.documentCellText, row.href);
    if (classified.relevanceScore < 20 && !ibrLike) continue;
    if (!ibrLike && !isProseExhibitFilename(row.filename) && classified.relevanceScore < 55) continue;

    let ibr = ibrLike
      ? parseIncorporatedByReference({
          description: row.description,
          documentCellText: row.documentCellText,
          href: row.href,
          cik: filing.cik,
        })
      : undefined;

    // Some IBR rows still include a relative link; prefer concrete URI when present.
    const sourceUri = row.href
      ? absoluteSecUrl(row.href)
      : !ibrLike && row.filename !== "unknown"
        ? archivesDocUrl(filing.cik, filing.accessionNumber, row.filename)
        : undefined;

    if (ibr && ibr.resolvedAccessionNumber && ibr.resolutionStatus !== "RESOLVED") {
      // Self-complete against this same index when the IBR points at a sibling exhibit (rare).
      ibr = completeIbrFromOriginalIndex(ibr, rows.map((r) => ({
        type: r.type,
        filename: r.filename,
        href: r.href ?? "",
        description: r.description,
      })), filing.cik);
    }

    const documentKind = classified.documentKind;
    const identity = agreementIdentityKey({
      cik: filing.cik,
      documentKind,
      description: row.description,
      filename: row.filename,
      filingDate: filing.filingDate,
      accessionNumber: filing.accessionNumber,
    });

    out.push({
      cik: filing.cik,
      accessionNumber: filing.accessionNumber,
      filingDate: filing.filingDate,
      form: filing.form,
      exhibitType: row.type,
      filename: row.filename,
      description: row.description,
      sourceUri: ibr?.resolvedSourceUri ?? sourceUri,
      documentKind,
      relevanceScore: classified.relevanceScore,
      isIncorporatedByReference: Boolean(ibrLike),
      ibr,
      agreementIdentityKey: identity,
      discoveryStatus: ibr && ibr.resolutionStatus === "UNRESOLVED" ? "IBR_UNRESOLVED" : "DISCOVERED",
    });
  }
  return out;
}
