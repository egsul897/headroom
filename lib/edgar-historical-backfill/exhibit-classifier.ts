/**
 * Deterministic exhibit classification for debt-agreement discovery.
 * Metadata-only (filename / description / exhibit type) — no body download, no LLM.
 */

import type { DebtDocumentKind } from "./types";

const PROSE_EXTENSIONS = new Set(["htm", "html", "txt", "pdf"]);

/** Forms that commonly carry debt agreements or IBR pointers to them. */
export const QUALIFYING_FORMS = new Set([
  "8-K",
  "8-K/A",
  "10-K",
  "10-K/A",
  "10-Q",
  "10-Q/A",
  "S-1",
  "S-1/A",
  "S-3",
  "S-3/A",
  "S-4",
  "S-4/A",
  "424B2",
  "424B3",
  "424B5",
  "20-F",
  "20-F/A",
  "6-K",
]);

export interface ClassifyInput {
  filename: string;
  description: string;
  exhibitType: string;
}

export interface ClassifyResult {
  documentKind: DebtDocumentKind;
  relevanceScore: number;
  matchedSignals: string[];
}

function haystackOf(input: ClassifyInput): string {
  return `${input.filename} ${input.description} ${input.exhibitType}`.toLowerCase();
}

export function isProseExhibitFilename(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return PROSE_EXTENSIONS.has(ext);
}

export function isDebtExhibitType(exhibitType: string): boolean {
  const t = exhibitType.toUpperCase().replace(/\s+/g, "");
  // Material contracts / instruments defining rights of security holders.
  return /^EX-10(\.|$)/.test(t) || /^EX-4(\.|$)/.test(t) || t === "EX-10" || t === "EX-4";
}

/**
 * Classify an exhibit from index metadata. Amendments/restatements/waivers/
 * consents are first-class kinds so dedupe can keep distinct versions.
 */
export function classifyExhibit(input: ClassifyInput): ClassifyResult {
  const h = haystackOf(input);
  const signals: string[] = [];

  if (!isProseExhibitFilename(input.filename) && !isDebtExhibitType(input.exhibitType)) {
    return { documentKind: "UNKNOWN", relevanceScore: 0, matchedSignals: [] };
  }

  // Known non-debt false positives (Ford Tax Benefit Preservation Plan, equity awards, etc.).
  if (/(tax\s+benefit|preservation\s+plan|restricted\s+stock|stock\s+unit|equity\s+incentive|employment\s+agreement|offer\s+letter|compensation\s+plan|bonus\s+plan)/i.test(h)) {
    return { documentKind: "UNKNOWN", relevanceScore: 5, matchedSignals: ["non_debt_false_positive"] };
  }

  // Order is specificity-first: amendment/restatement beats a nested "credit agreement" token.
  const rules: Array<{ kind: DebtDocumentKind; re: RegExp; score: number; signal: string }> = [
    { kind: "RESTATEMENT", re: /amended\s+and\s+restated|a&r\b|restated\s+(credit|loan|indenture)/i, score: 96, signal: "restatement" },
    { kind: "SUPPLEMENTAL_INDENTURE", re: /supplemental\s+indenture/i, score: 94, signal: "supplemental_indenture" },
    { kind: "AMENDMENT", re: /\bamendment\b|amendatory/i, score: 93, signal: "amendment" },
    { kind: "WAIVER", re: /\bwaiver\b/i, score: 88, signal: "waiver" },
    { kind: "CONSENT", re: /\bconsent\b(?!.*solicitation)/i, score: 86, signal: "consent" },
    { kind: "INTERCREDITOR", re: /intercreditor|inter-creditor/i, score: 90, signal: "intercreditor" },
    { kind: "CREDIT_AGREEMENT", re: /credit\s+agreement|loan\s+agreement|credit\s+and\s+guaranty|term\s+loan\s+agreement|revolving\s+credit/i, score: 95, signal: "credit_agreement" },
    { kind: "INDENTURE", re: /\bindenture\b/i, score: 92, signal: "indenture" },
    { kind: "GUARANTEE", re: /guarantee\s+and\s+(collateral|security)|guarantee\s+agreement/i, score: 82, signal: "guarantee" },
    { kind: "SECURITY_AGREEMENT", re: /security\s+agreement|pledge\s+and\s+security|collateral\s+agreement/i, score: 82, signal: "security_agreement" },
  ];

  // First matching rule wins (specificity order), but CREDIT_AGREEMENT/INDENTURE
  // may still win when no amendment/waiver/consent/restatement signal fired.
  for (const rule of rules) {
    if (rule.re.test(h)) {
      signals.push(rule.signal);
      return { documentKind: rule.kind, relevanceScore: rule.score, matchedSignals: signals };
    }
  }

  // Weak signal: EX-10 / EX-4 with debt-ish tokens.
  if (isDebtExhibitType(input.exhibitType) && /(facility|lender|note\b|senior|subordinated|borrower)/i.test(h)) {
    return { documentKind: "OTHER_DEBT_AGREEMENT", relevanceScore: 55, matchedSignals: ["ex10_or_ex4_debtish"] };
  }

  if (isDebtExhibitType(input.exhibitType)) {
    return { documentKind: "UNKNOWN", relevanceScore: 20, matchedSignals: ["ex10_or_ex4_unclassified"] };
  }

  return { documentKind: "UNKNOWN", relevanceScore: 0, matchedSignals: [] };
}

/** 8-K Item 1.01 / 2.03 etc. are strong debt-agreement signals before opening the index. */
export function filingDebtSignalScore(form: string, items?: string, primaryDocDescription?: string): number {
  let score = 0;
  const f = form.toUpperCase();
  if (f === "8-K" || f === "8-K/A") {
    score += 10;
    const itemText = items ?? "";
    if (/\b1\.01\b/.test(itemText)) score += 50;
    if (/\b2\.03\b/.test(itemText)) score += 35;
    if (/\b8\.01\b/.test(itemText)) score += 5;
  } else if (f.startsWith("10-K")) {
    score += 25; // exhibit index / IBR tables
  } else if (f.startsWith("10-Q")) {
    score += 15;
  } else if (f.startsWith("S-") || f.startsWith("424B")) {
    score += 20;
  } else if (QUALIFYING_FORMS.has(f)) {
    score += 5;
  }
  const desc = (primaryDocDescription ?? "").toLowerCase();
  if (/credit agreement|indenture|loan agreement/.test(desc)) score += 40;
  return score;
}

/**
 * Stable agreement-identity key for dedupe: keeps distinct amendments/versions
 * by incorporating document kind + normalized title tokens + filing date when
 * the description encodes a version number.
 */
export function agreementIdentityKey(params: {
  cik: string;
  documentKind: DebtDocumentKind;
  description: string;
  filename: string;
  filingDate: string;
  accessionNumber: string;
}): string {
  const title = normalizeAgreementTitle(params.description || params.filename);
  const version = extractVersionToken(params.description) ?? extractVersionToken(params.filename);
  // Distinct amendments/restatements must NOT collapse: version + kind + title.
  if (version || params.documentKind === "AMENDMENT" || params.documentKind === "RESTATEMENT" || params.documentKind === "SUPPLEMENTAL_INDENTURE" || params.documentKind === "WAIVER" || params.documentKind === "CONSENT") {
    return `${params.cik}|${params.documentKind}|${title}|${version ?? params.filingDate}|${params.accessionNumber}`;
  }
  // Identical re-filed copies of the same base agreement can share identity.
  return `${params.cik}|${params.documentKind}|${title}`;
}

export function normalizeAgreementTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(exhibit|ex)\s*\d+(\.\d+)?\b/g, " ")
    .replace(/\b(dated|as of|by and among|among|between)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function extractVersionToken(text: string): string | null {
  const m =
    text.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)?)\s+amendment\b/i) ||
    text.match(/\bamendment\s+no\.?\s*(\d+)\b/i) ||
    text.match(/\b(amended\s+and\s+restated)\b/i) ||
    text.match(/\bsupplemental\s+indenture\s+no\.?\s*(\d+)\b/i);
  if (!m) return null;
  return m[0]!.toLowerCase().replace(/\s+/g, "_");
}
