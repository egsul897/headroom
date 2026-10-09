/**
 * Stable instrument / agreement-version identity hints from metadata + title.
 * Discovery aid only — not legal authentication of operative instruments.
 */

import { createHash } from "node:crypto";
import type { DebtDocumentClass, KnowledgeSourceRecord } from "../types";

export function computeInstrumentIdentity(input: {
  issuerCik: string;
  documentClass: DebtDocumentClass;
  documentTitle: string;
  filingDate?: string;
}): string {
  const title = normalizeTitle(input.documentTitle);
  const version = extractVersionToken(title);
  const base = `${input.issuerCik}|${mapFamily(input.documentClass)}|${stripVersionNoise(title)}|${version ?? "unversioned"}`;
  return `inst:${createHash("sha256").update(base).digest("hex").slice(0, 24)}`;
}

export function attachInstrumentIdentity(source: KnowledgeSourceRecord): KnowledgeSourceRecord {
  if (source.instrumentIdentity) return source;
  return {
    ...source,
    instrumentIdentity: computeInstrumentIdentity({
      issuerCik: source.issuerCik,
      documentClass: source.documentClass,
      documentTitle: source.documentTitle,
      filingDate: source.filingDate,
    }),
  };
}

function mapFamily(c: DebtDocumentClass): string {
  switch (c) {
    case "AMENDMENT":
    case "RESTATEMENT":
    case "WAIVER":
    case "CONSENT":
    case "SIDE_LETTER":
      return "CREDIT_FAMILY";
    case "SUPPLEMENTAL_INDENTURE":
      return "INDENTURE_FAMILY";
    default:
      return c;
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function extractVersionToken(title: string): string | null {
  const m =
    title.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+(omnibus\s+)?amendment\b/) ||
    title.match(/\bamendment\s+no\.?\s*(\d+)\b/) ||
    title.match(/\b(amended and restated)\b/);
  return m ? m[0]!.replace(/\s+/g, "_") : null;
}

function stripVersionNoise(title: string): string {
  return title
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+(omnibus\s+)?amendment\b/g, " ")
    .replace(/\bamendment\s+no\.?\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
