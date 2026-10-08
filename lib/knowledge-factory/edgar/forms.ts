/** Priority form types for debt-document discovery. */

export const PRIORITY_FORM_TYPES = [
  "8-K",
  "10-K",
  "10-Q",
  "10-K/A",
  "10-Q/A",
  "20-F",
  "6-K",
  "S-1",
  "S-1/A",
  "S-3",
  "S-4",
  "424B5",
  "424B2",
  "F-1",
  "F-3",
] as const;

export type PriorityFormType = (typeof PRIORITY_FORM_TYPES)[number];

const PRIORITY_SET = new Set<string>(PRIORITY_FORM_TYPES);

export function isPriorityForm(form: string): boolean {
  return PRIORITY_SET.has(form.trim().toUpperCase()) || PRIORITY_SET.has(form.trim());
}

/**
 * Soft debt-exhibit signals from filename/description/type.
 * Does NOT assume every Exhibit 10 is a credit agreement.
 */
export const DEBT_EXHIBIT_SIGNALS: { name: string; re: RegExp }[] = [
  { name: "credit_agreement", re: /\bcredit\s+agreement\b/i },
  { name: "revolving", re: /\brevolving\s+credit\b/i },
  { name: "term_loan", re: /\bterm\s+loan\b/i },
  { name: "abl", re: /\b(?:ABL|asset[-\s]?based)\b/i },
  { name: "indenture", re: /\bindenture\b/i },
  { name: "supplemental_indenture", re: /\bsupplemental\s+indenture\b/i },
  { name: "intercreditor", re: /\bintercreditor\b/i },
  { name: "security_agreement", re: /\bsecurity\s+agreement\b|\bcollateral\s+agreement\b/i },
  { name: "guarantee", re: /\bguarant(?:y|ee)\b/i },
  { name: "waiver", re: /\bwaiver\b/i },
  // Debt-package consents only — exclude auditor/EX-23 consents.
  { name: "consent", re: /\bconsent\b(?!.*\b(?:independent\s+registered\s+public\s+accounting|pwc|ey|kpmg|deloit)\b)/i },
  { name: "side_letter", re: /\bside\s+letter\b/i },
  { name: "amendment_to_credit", re: /\bamendment\b.*\b(?:credit|loan|facility|indenture)\b|\b(?:credit|loan|facility|indenture)\b.*\bamendment\b/i },
  { name: "restatement", re: /\bamended\s+and\s+restated\b|\brestatement\b/i },
  { name: "loan_agreement", re: /\bloan\s+agreement\b/i },
  { name: "facility_agreement", re: /\bfacility\s+agreement\b/i },
  { name: "note_purchase", re: /\bnote\s+purchase\b/i },
];

export const PROSE_EXTENSIONS = new Set(["htm", "html", "txt", "pdf"]);

export function collectDebtSignals(haystack: string): string[] {
  // Hard negatives: auditor consents, employment agreements, bylaws, etc.
  if (
    /\b(?:consent of independent|independent registered public accounting|EX-23|employment agreement|bylaws?|certificate of incorporation|stock incentive|equity incentive|offer letter)\b/i.test(
      haystack,
    )
  ) {
    return [];
  }
  if (/\bEX-23\b/i.test(haystack) && /\bconsent\b/i.test(haystack)) {
    return [];
  }
  return DEBT_EXHIBIT_SIGNALS.filter((s) => s.re.test(haystack)).map((s) => s.name);
}

/** Exhibit-type codes that are often material contracts but not always debt. */
export function isMaterialContractExhibitType(exhibitType: string): boolean {
  const t = exhibitType.trim().toUpperCase();
  return /^EX-10(\.|$)/.test(t) || /^EX-4(\.|$)/.test(t) || t === "EX-99.1" || t.startsWith("EX-99");
}
