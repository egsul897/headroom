/**
 * Identify issuer, obligor group, reporting period, fiscal date, currency,
 * and document role from financial-statement / certificate text.
 * Missing fields are listed — never invented.
 */

import { createHash } from "crypto";
import type { DocumentIdentity, DocumentRole } from "./types";

function roleFromHint(declaredType: string | null | undefined, text: string, filename?: string | null): DocumentRole {
  const t = (declaredType ?? "").toUpperCase();
  if (t === "COMPLIANCE_CERTIFICATE" || t === "OFFICER_CERTIFICATE") {
    return t === "OFFICER_CERTIFICATE" ? "OFFICER_CERTIFICATE" : "COMPLIANCE_CERTIFICATE";
  }
  if (t === "FINANCIAL_STATEMENT") return "FINANCIAL_STATEMENT";

  const head = text.slice(0, 2_500);
  if (/\bcompliance\s+certificate\b/i.test(head) || /\bofficer.?s?\s+certificate\b/i.test(head)) {
    return /\bofficer/i.test(head) && !/\bcompliance\s+certificate\b/i.test(head)
      ? "OFFICER_CERTIFICATE"
      : "COMPLIANCE_CERTIFICATE";
  }
  if (
    /\bconsolidated\s+statements?\s+of\s+operations\b/i.test(head) ||
    /\bcondensed\s+consolidated\s+(balance\s+sheet|statements?)\b/i.test(head) ||
    /\bform\s+10-[qk]\b/i.test(head) ||
    /\bfinancial\s+statements?\b/i.test(head)
  ) {
    return "FINANCIAL_STATEMENT";
  }
  if (filename && /\b(10-?[qk]|financial|statement)\b/i.test(filename)) return "FINANCIAL_STATEMENT";
  if (filename && /\b(compliance|certificate|cert)\b/i.test(filename)) return "COMPLIANCE_CERTIFICATE";
  return "UNKNOWN";
}

function parseFiscalDate(text: string): string | null {
  const labeled =
    text.match(
      /\b(?:as of|period ended|fiscal(?:\s+quarter)?\s+ended|quarter ended|year ended)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i,
    ) ?? text.match(/\bended\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  if (!labeled?.[1]) return null;
  const parsed = new Date(labeled[1]);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseReportingPeriod(text: string, fiscalDate: string | null): string | null {
  const fyq = text.match(/\b(?:FY|fiscal\s+year)\s*(\d{4})\s*[- ]?\s*Q([1-4])\b/i);
  if (fyq) return `FY${fyq[1]}-Q${fyq[2]}`;
  const qEnded = text.match(/\b(?:three|six|nine)\s+months\s+ended\b/i);
  if (fiscalDate && qEnded) {
    const d = new Date(fiscalDate);
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `FY${d.getUTCFullYear()}-Q${q}`;
  }
  if (fiscalDate) return `asOf=${fiscalDate}`;
  return null;
}

function parseIssuer(text: string): string | null {
  const patterns = [
    /\b(?:borrower|issuer|parent\s+borrower|company)\s*:\s*([A-Za-z0-9&.,'\- ]{2,80})/i,
    /\b([A-Z][A-Za-z0-9&.,'\- ]{1,60}(?:Corporation|Corp\.|Inc\.|LLC|L\.P\.|Company))\b/,
    /\bForm\s+10-[QK]\s+[^\n]{0,40}\n\s*([A-Z][A-Za-z0-9&.,'\- ]{1,60})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const name = m[1].trim().replace(/\s+/g, " ");
      if (name.length >= 3 && !/^(the|and|for|period)$/i.test(name)) return name;
    }
  }
  return null;
}

function parseObligorGroup(text: string): string | null {
  const m =
    text.match(/\b(?:restricted\s+group|obligor\s+group|loan\s+parties)\s*:\s*([^\n.]{3,100})/i) ??
    text.match(/\b(?:on a consolidated basis for the)\s+([^\n.]{3,80})\b/i);
  return m?.[1]?.trim() ?? null;
}

function parseCurrency(text: string): string | null {
  if (/\$|USD|U\.S\.\s*dollars?/i.test(text)) return "USD";
  if (/\bEUR\b|€/.test(text)) return "EUR";
  if (/\bGBP\b|£/.test(text)) return "GBP";
  return null;
}

function parseTitle(text: string): string | null {
  const first = text.split(/\n/).map((l) => l.trim()).find((l) => l.length > 4 && l.length < 120);
  return first ?? null;
}

export interface IdentifyDocumentParams {
  documentId: string;
  text: string;
  declaredType?: string | null;
  filename?: string | null;
  versionHash?: string | null;
}

export function identifyDocument(params: IdentifyDocumentParams): DocumentIdentity {
  const { documentId, text, declaredType, filename } = params;
  const versionHash =
    params.versionHash ?? `sha256:${createHash("sha256").update(text).digest("hex")}`;
  const documentRole = roleFromHint(declaredType, text, filename);
  const fiscalDate = parseFiscalDate(text);
  const reportingPeriod = parseReportingPeriod(text, fiscalDate);
  const issuerName = parseIssuer(text);
  const obligorGroup = parseObligorGroup(text);
  const currency = parseCurrency(text);
  const documentTitle = parseTitle(text);

  const missingIdentityFields: string[] = [];
  if (!issuerName) missingIdentityFields.push("issuerName");
  if (!fiscalDate) missingIdentityFields.push("fiscalDate");
  if (!reportingPeriod) missingIdentityFields.push("reportingPeriod");
  if (!currency) missingIdentityFields.push("currency");
  if (documentRole === "UNKNOWN") missingIdentityFields.push("documentRole");

  const confidenceNotes: string[] = [];
  if (documentRole === "UNKNOWN") {
    confidenceNotes.push("Document role could not be determined from declared type or text headers.");
  }
  if (!fiscalDate) {
    confidenceNotes.push("No fiscal / as-of date found; metric extraction will refuse to invent one.");
  }

  return {
    documentId,
    documentRole,
    issuerName,
    obligorGroup,
    reportingPeriod,
    fiscalDate,
    currency,
    documentTitle,
    versionHash,
    confidenceNotes,
    missingIdentityFields,
  };
}
