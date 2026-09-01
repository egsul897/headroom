/**
 * Phase 2C §5 - deterministic document identity extraction from a
 * document's own preamble text. Every field is either a real regex match
 * (with its evidence text + char offset preserved) or null - never a
 * fabricated guess (task §5's own "do not hallucinate missing metadata").
 */
import type { DocumentIdentity } from "./types";
import type { PackageDocumentInput } from "./types";

const PREAMBLE_WINDOW = 4000;

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`(?:${MONTHS})\\s+\\d{1,2},\\s*\\d{4}`, "i");

const NUMBER_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

function parseOrdinalNumber(raw: string): number | null {
  const digit = /^\d+$/.exec(raw.trim());
  if (digit) return parseInt(raw, 10);
  const word = NUMBER_WORDS[raw.trim().toLowerCase()];
  return word ?? null;
}

function firstMatch(text: string, re: RegExp): { text: string; charStart: number } | null {
  const m = re.exec(text);
  if (!m) return null;
  return { text: m[0], charStart: m.index };
}

export function extractDocumentIdentity(doc: PackageDocumentInput): DocumentIdentity {
  const preamble = doc.text.slice(0, PREAMBLE_WINDOW);
  const evidenceByField: DocumentIdentity["evidenceByField"] = {};

  const titleMatch = /^\s*([A-Z][A-Za-z0-9 ,.'&-]{4,120}(?:AGREEMENT|INDENTURE|CERTIFICATE|LETTER|JOINDER))/m.exec(preamble);
  const title = titleMatch ? titleMatch[1]!.trim() : null;
  if (titleMatch) evidenceByField.title = { text: titleMatch[0], charStart: titleMatch.index };

  const executionDateMatch = firstMatch(preamble, new RegExp(`dated\\s+(?:as\\s+of\\s+)?(${DATE_RE.source})`, "i"));
  const executionDate = executionDateMatch ? executionDateMatch.text.replace(/^dated\s+(?:as\s+of\s+)?/i, "") : null;
  if (executionDateMatch) evidenceByField.executionDate = executionDateMatch;

  const amendmentNumMatch = firstMatch(preamble, /Amendment\s+(?:No\.?\s*(\d+)|(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth))/i);
  const amendmentNumber = amendmentNumMatch ? parseOrdinalNumber(amendmentNumMatch.text.replace(/^Amendment\s+(?:No\.?\s*)?/i, "")) : null;
  if (amendmentNumMatch) evidenceByField.amendmentNumber = amendmentNumMatch;

  const supplementNumMatch = firstMatch(preamble, /(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|\d+(?:st|nd|rd|th))\s+Supplemental Indenture/i);
  const supplementNumber = supplementNumMatch ? parseOrdinalNumber(supplementNumMatch.text.split(/\s+Supplemental/i)[0]!) : null;
  if (supplementNumMatch) evidenceByField.supplementNumber = supplementNumMatch;

  // "the Credit Agreement dated as of March 1, 2021" / "the Indenture dated as of..." -
  // the ORIGINAL-agreement self-reference a well-formed amendment/supplement
  // always opens with. Captured here as a raw hint; §12 resolves it against
  // other package documents.
  const originalAgreementRefMatch = firstMatch(
    preamble,
    new RegExp(`the\\s+([A-Z][A-Za-z0-9 ]{2,60}?(?:Credit Agreement|Indenture|Loan Agreement))\\s*,?\\s*dated (?:as of )?(?:${DATE_RE.source})`, "i")
  );
  const originalAgreementReferenceHint = originalAgreementRefMatch ? originalAgreementRefMatch.text : null;
  if (originalAgreementRefMatch) evidenceByField.originalAgreementReferenceHint = originalAgreementRefMatch;

  const borrowerMatch = firstMatch(preamble, /([A-Z][A-Za-z0-9 .,&'-]{2,80}),?\s+as\s+(?:the\s+)?Borrower\b/);
  const borrowerOrIssuer = borrowerMatch ? borrowerMatch.text.replace(/,?\s+as\s+(?:the\s+)?Borrower\b.*/i, "").trim() : null;
  if (borrowerMatch) evidenceByField.borrowerOrIssuer = borrowerMatch;

  const agentMatch = firstMatch(preamble, /([A-Z][A-Za-z0-9 .,&'-]{2,80}),?\s+as\s+(?:Administrative Agent|Trustee|Collateral Agent)\b/);
  const administrativeAgentOrTrustee = agentMatch ? agentMatch.text.replace(/,?\s+as\s+(?:Administrative Agent|Trustee|Collateral Agent)\b.*/i, "").trim() : null;
  if (agentMatch) evidenceByField.administrativeAgentOrTrustee = agentMatch;

  const parties: string[] = [];
  if (borrowerOrIssuer) parties.push(borrowerOrIssuer);

  return {
    documentId: doc.documentId,
    title,
    agreementTypeLabel: title,
    executionDate,
    effectiveDate: executionDate,
    parties,
    borrowerOrIssuer,
    administrativeAgentOrTrustee,
    facilityOrInstrumentName: title,
    originalAgreementReferenceHint,
    amendmentNumber,
    supplementNumber,
    evidenceByField,
  };
}

export function extractPackageDocumentIdentities(documents: PackageDocumentInput[]): DocumentIdentity[] {
  return documents.map(extractDocumentIdentity);
}
