/**
 * Map free-text document classes onto knowledge_debt_document_class.
 * Unknown labels become UNKNOWN — never a fabricated class.
 */

const DOCUMENT_CLASSES = new Set([
  "CREDIT_AGREEMENT",
  "REVOLVING_CREDIT_AGREEMENT",
  "TERM_LOAN_AGREEMENT",
  "ABL_AGREEMENT",
  "INDENTURE",
  "SUPPLEMENTAL_INDENTURE",
  "AMENDMENT",
  "RESTATEMENT",
  "WAIVER",
  "CONSENT",
  "SIDE_LETTER",
  "INTERCREDITOR_AGREEMENT",
  "SECURITY_AGREEMENT",
  "GUARANTEE_AGREEMENT",
  "OTHER_DEBT_RELATED",
  "UNKNOWN",
]);

const ALIASES: Record<string, string> = {
  ORIGINAL: "CREDIT_AGREEMENT",
  OMNIBUS_AMENDMENT: "AMENDMENT",
  RELATED_SECURITY: "OTHER_DEBT_RELATED",
  LOAN_AGREEMENT: "CREDIT_AGREEMENT",
  INTERCREDITOR: "INTERCREDITOR_AGREEMENT",
  GUARANTEE: "GUARANTEE_AGREEMENT",
  OTHER_DEBT_AGREEMENT: "OTHER_DEBT_RELATED",
};

export function sanitizeDocumentClass(raw: unknown, hint?: string): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const mapped = ALIASES[s] ?? s;
  if (DOCUMENT_CLASSES.has(mapped)) return mapped;
  const h = (hint ?? "").toLowerCase();
  if (/supplemental\s+indenture/.test(h)) return "SUPPLEMENTAL_INDENTURE";
  if (/\bindenture\b/.test(h)) return "INDENTURE";
  if (/\bwaiver\b/.test(h)) return "WAIVER";
  if (/\bconsent\b/.test(h)) return "CONSENT";
  if (/\bamendment\b/.test(h)) return "AMENDMENT";
  if (/restat/.test(h)) return "RESTATEMENT";
  if (/credit agreement|loan agreement|term loan/.test(h)) return "CREDIT_AGREEMENT";
  if (/security agreement/.test(h)) return "SECURITY_AGREEMENT";
  if (/intercreditor/.test(h)) return "INTERCREDITOR_AGREEMENT";
  return "UNKNOWN";
}

const ACCESSION_RE = /^\d{10}-\d{2}-\d{6}$/;

export function isRealAccession(value: string | null | undefined): value is string {
  return typeof value === "string" && ACCESSION_RE.test(value);
}

/** Pull CIK + dashed accession from a SEC archives URL. Returns null when absent. */
export function accessionFromSecUrl(url: string | null | undefined): { cik: string; accession: string } | null {
  if (!url) return null;
  const m = url.match(/\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//i);
  if (!m) return null;
  const digits = m[2]!;
  return {
    cik: m[1]!.padStart(10, "0"),
    accession: `${digits.slice(0, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`,
  };
}

export function padCik(raw: string | null | undefined): string {
  if (!raw) return "0000000000";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "0000000000";
  return digits.padStart(10, "0").slice(-10);
}
