/**
 * Extract authentic restatement-authority evidence from source text.
 *
 * Generalized signals only — never WOR/issuer-specific shortcuts.
 * A newer filing is not automatically an operative replacement; every
 * checklist item must be backed by a real excerpt or an explicit absence.
 */

import type { DocumentIdentity, RelationshipCandidate } from "../package-graph/types";
import { excerptAt, toIsoDate, truncateExcerpt } from "./date-utils";
import type {
  FacilityIdentityEvidence,
  OperativeRestatementLanguageEvidence,
  PriorAgreementRecitalEvidence,
  RestatementAuthorityEvidence,
  RestatementScope,
  TextEvidenceHit,
} from "./types";

const CAPTION_AR_RE =
  /\b((?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|[0-9]+(?:st|nd|rd|th)?)\s+)?Amended\s+and\s+Restated\s+Credit\s+Agreement\b/i;

const DATED_AS_OF_RE = /\bdated\s+as\s+of\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4})/i;

/**
 * Prefer the recital that binds “Existing Credit Agreement” — never the
 * successor's own caption self-date. Real A&R drafting often inserts
 * "(as amended, restated, ... hereof, the “ Existing Credit Agreement ”)"
 * with spaced curly quotes after the prior agreement's dated-as-of clause.
 */
const PRIOR_EXISTING_CA_RE =
  /\b(?:that\s+certain\s+)?((?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|[0-9]+(?:st|nd|rd|th)?)\s+Amended\s+and\s+Restated\s+Credit\s+Agreement),?\s+dated\s+as\s+of\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4})(?:[^.;]{0,400}?(?:the|this)\s*[“"']\s*Existing\s+Credit\s+Agreement\s*[”"'])/i;

const EXISTING_DEFINED_RE = /(?:the|this)\s*[“"']\s*Existing\s+Credit\s+Agreement\s*[”"']/i;

const NOW_THEREFORE_RESTATE_RE =
  /\bNOW,?\s+THEREFORE\b[\s\S]{0,800}?\bExisting\s+Credit\s+Agreement\s+is\s+hereby\s+amended\s+and\s+restated\b/i;

const ARTICLE_RESTATE_RE =
  /\bSection\s+(\d+\.\d+)\.\s*Amendment\s+and\s+Restatement\s+of\s+Existing\s+Credit\s+Agreement[\s\S]{0,1200}?\bamended,?\s+superseded\s+and\s+restated\s+in\s+their\s+entirety\b/i;

const PARTIAL_RESTATE_SECTION_RE =
  /\bSection\s+(\d+(?:\.\d+)*)\s+(?:of\s+the\s+(?:Existing\s+Credit\s+Agreement|Credit\s+Agreement)\s+)?(?:is|are)\s+hereby\s+(?:amended\s+and\s+restated|restated)\b/gi;

const CP_RE =
  /\b(?:satisfaction\s*\(or\s+waiver[^)]*\)\s+of\s+the\s+)?conditions\s+precedent\s+set\s+forth\s+in\s+Section\s+(\d+\.\d+)\b/i;

const SIGNATURE_RE = /\bIN\s+WITNESS\s+WHEREOF\b|\bSignature\s+Page\s+to\b/i;

const NOVATION_RE = /\bshall\s+not\s+constitute\s+a\s+novation\b/i;

const AGGREGATE_COMMITMENT_RE = /\bAggregate\s+Commitment\s+is\s+\$[\d,]+/i;

function hit(present: boolean, excerpt: string | null, charStart: number | null): TextEvidenceHit {
  return { present, excerpt, charStart };
}

function extractCaption(text: string): RestatementAuthorityEvidence["captionRestatement"] {
  // Prefer the first caption-zone hit (first ~4k chars after dropping TOC-heavy prefixes is still fine —
  // ordinal label is taken from the earliest Amended-and-Restated Credit Agreement match).
  const m = CAPTION_AR_RE.exec(text.slice(0, 8000));
  if (!m) return { ...hit(false, null, null), ordinalLabel: null };
  const { excerpt, charStart } = excerptAt(text, m.index, m[0].length);
  return { present: true, excerpt, charStart, ordinalLabel: m[0].replace(/\s+/g, " ").trim() };
}

function extractExecutionDate(text: string, identity: DocumentIdentity | undefined): RestatementAuthorityEvidence["executionDate"] {
  const fromIdentity = identity?.executionDate ?? null;
  if (fromIdentity) {
    return {
      value: fromIdentity,
      isoDate: toIsoDate(fromIdentity),
      excerpt: identity?.evidenceByField?.executionDate?.text ?? fromIdentity,
    };
  }
  const m = DATED_AS_OF_RE.exec(text.slice(0, 12000));
  if (!m) return { value: null, isoDate: null, excerpt: null };
  return { value: m[1]!.replace(/\s+/g, " ").trim(), isoDate: toIsoDate(m[1]!), excerpt: truncateExcerpt(m[0]) };
}

function extractPriorRecital(text: string): PriorAgreementRecitalEvidence {
  const m = PRIOR_EXISTING_CA_RE.exec(text);
  if (!m) {
    // Defined-term binding without a recoverable ordinal+date in the same clause.
    const defOnly = EXISTING_DEFINED_RE.exec(text.slice(0, 20000));
    if (!defOnly) return { present: false, excerpt: null, charStart: null, namedAgreementLabel: null, namedExecutionDate: null, definedTerm: null };
    const { excerpt, charStart } = excerptAt(text, defOnly.index, defOnly[0].length);
    return {
      present: true,
      excerpt,
      charStart,
      namedAgreementLabel: null,
      namedExecutionDate: null,
      definedTerm: "Existing Credit Agreement",
    };
  }
  const label = m[1]!.replace(/\s+/g, " ").trim();
  const namedDate = m[2]!.replace(/\s+/g, " ").trim();
  const { excerpt, charStart } = excerptAt(text, m.index, m[0].length);
  return {
    present: true,
    excerpt,
    charStart,
    namedAgreementLabel: label,
    namedExecutionDate: namedDate,
    definedTerm: "Existing Credit Agreement",
  };
}

function extractOperativeLanguage(text: string): OperativeRestatementLanguageEvidence {
  const now = NOW_THEREFORE_RESTATE_RE.exec(text);
  const article = ARTICLE_RESTATE_RE.exec(text);
  const novation = NOVATION_RE.exec(text);
  const location =
    now && article ? "BOTH" : article ? "ARTICLE_RESTATEMENT_SECTION" : now ? "NOW_THEREFORE" : "NONE";
  const present = location !== "NONE";
  let excerpt: string | null = null;
  let charStart: number | null = null;
  if (article) {
    ({ excerpt, charStart } = excerptAt(text, article.index, Math.min(article[0].length, 400)));
  } else if (now) {
    ({ excerpt, charStart } = excerptAt(text, now.index, Math.min(now[0].length, 400)));
  }
  return {
    present,
    excerpt,
    charStart,
    location,
    supersedesEntirety: !!article || /\bin\s+its\s+entirety\b/i.test(now?.[0] ?? ""),
    novationDisclaimed: !!novation,
  };
}

function extractConditionsPrecedent(text: string): RestatementAuthorityEvidence["conditionsPrecedent"] {
  // Prefer the Article restatement clause's own CP reference when present.
  const articleWindow = ARTICLE_RESTATE_RE.exec(text);
  const searchIn = articleWindow ? articleWindow[0] : text;
  const baseOffset = articleWindow ? articleWindow.index : 0;
  const m = CP_RE.exec(searchIn);
  if (!m) {
    const global = CP_RE.exec(text);
    if (!global) return { present: false, excerpt: null, charStart: null, sectionRef: null };
    const { excerpt, charStart } = excerptAt(text, global.index, global[0].length);
    return { present: true, excerpt, charStart, sectionRef: global[1] ?? null };
  }
  const abs = baseOffset + m.index;
  const { excerpt, charStart } = excerptAt(text, abs, m[0].length);
  return { present: true, excerpt, charStart, sectionRef: m[1] ?? null };
}

function extractSignatures(text: string): TextEvidenceHit {
  const m = SIGNATURE_RE.exec(text);
  if (!m) return hit(false, null, null);
  const { excerpt, charStart } = excerptAt(text, m.index, m[0].length);
  return hit(true, excerpt, charStart);
}

function extractPartialProvisionRefs(text: string, fullRestatement: boolean): { scope: RestatementScope; refs: string[] } {
  if (fullRestatement) return { scope: "FULL_AGREEMENT", refs: [] };
  const refs = new Set<string>();
  const re = new RegExp(PARTIAL_RESTATE_SECTION_RE.source, PARTIAL_RESTATE_SECTION_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    refs.add(m[1]!);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (refs.size > 0) return { scope: "PARTIAL_PROVISIONS", refs: [...refs].sort() };
  return { scope: "UNKNOWN", refs: [] };
}

function facilityIdentity(
  successorText: string,
  successorIdentity: DocumentIdentity | undefined,
  predecessorIdentity: DocumentIdentity | undefined,
  predecessorText: string | undefined,
): FacilityIdentityEvidence {
  const mismatchReasons: string[] = [];
  const borrowerContinuitySignals: string[] = [];

  const succAgent = successorIdentity?.administrativeAgentOrTrustee?.toLowerCase() ?? null;
  const predAgent = predecessorIdentity?.administrativeAgentOrTrustee?.toLowerCase() ?? null;
  let administrativeAgentMatch: boolean | null = null;
  if (succAgent && predAgent) {
    administrativeAgentMatch = succAgent === predAgent || succAgent.includes(predAgent) || predAgent.includes(succAgent);
    if (!administrativeAgentMatch) mismatchReasons.push("Administrative agent / trustee identity differs between successor and predecessor.");
  }

  const succHasRevolver = AGGREGATE_COMMITMENT_RE.test(successorText) || /\bRevolving\s+Loans?\b/i.test(successorText);
  const predHasRevolver =
    predecessorText != null
      ? AGGREGATE_COMMITMENT_RE.test(predecessorText) || /\bRevolving\s+Loans?\b/i.test(predecessorText)
      : null;
  let revolvingFacilityContinuity: boolean | null = null;
  if (predHasRevolver != null) {
    revolvingFacilityContinuity = succHasRevolver && predHasRevolver;
    if (!revolvingFacilityContinuity) mismatchReasons.push("Revolving / Aggregate Commitment facility markers do not continue across the pair.");
  }

  if (/\bf\/k\/a\b/i.test(successorText.slice(0, 25000))) {
    borrowerContinuitySignals.push("Successor recitals include f/k/a borrower continuity language.");
  }
  const succBorrower = successorIdentity?.borrowerOrIssuer?.toLowerCase() ?? null;
  const predBorrower = predecessorIdentity?.borrowerOrIssuer?.toLowerCase() ?? null;
  if (succBorrower && predBorrower && succBorrower !== predBorrower && !/\bf\/k\/a\b/i.test(successorText.slice(0, 25000))) {
    // Different borrower names without f/k/a is a soft mismatch — recorded, not auto-fatal alone.
    mismatchReasons.push(`Borrower/issuer labels differ (${predecessorIdentity?.borrowerOrIssuer} vs ${successorIdentity?.borrowerOrIssuer}) without f/k/a continuity signal in successor text.`);
  }

  return { administrativeAgentMatch, revolvingFacilityContinuity, borrowerContinuitySignals, mismatchReasons };
}

function normalizeLabel(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function datesMatch(a: string | null, b: string | null): boolean {
  const ia = toIsoDate(a);
  const ib = toIsoDate(b);
  if (ia && ib) return ia === ib;
  if (!a || !b) return false;
  return normalizeLabel(a) === normalizeLabel(b);
}

/**
 * Resolve which in-package document the prior-agreement recital uniquely names.
 * Returns null when zero or multiple candidates match — never guesses.
 */
export function resolvePriorAgreementTargetDocumentId(
  prior: PriorAgreementRecitalEvidence,
  packageIdentities: DocumentIdentity[],
  successorDocumentId: string,
): { targetDocumentId: string | null; reason: string } {
  if (!prior.present || !prior.namedExecutionDate) {
    return { targetDocumentId: null, reason: "Prior-agreement recital does not name an execution date uniquely." };
  }
  const candidates = packageIdentities.filter((id) => {
    if (id.documentId === successorDocumentId) return false;
    const dateOk = datesMatch(id.executionDate, prior.namedExecutionDate);
    if (!dateOk) return false;
    if (!prior.namedAgreementLabel) return true;
    const title = normalizeLabel(id.title ?? id.agreementTypeLabel ?? id.facilityOrInstrumentName);
    const want = normalizeLabel(prior.namedAgreementLabel);
    // Require credit-agreement family + overlapping ordinal/amended-and-restated tokens.
    return title.includes("amended and restated credit agreement") && want.includes("amended and restated credit agreement");
  });
  if (candidates.length === 1) {
    return { targetDocumentId: candidates[0]!.documentId, reason: "Unique in-package type+execution-date match to prior-agreement recital." };
  }
  if (candidates.length === 0) {
    return { targetDocumentId: null, reason: "Named prior agreement is not present in this package (or dates/titles do not uniquely match)." };
  }
  return {
    targetDocumentId: null,
    reason: `Ambiguous prior-agreement match among ${candidates.map((c) => c.documentId).join(", ")}.`,
  };
}

export interface ExtractRestatementEvidenceInput {
  successorDocumentId: string;
  successorText: string;
  successorIdentity?: DocumentIdentity;
  predecessorDocumentId?: string | null;
  predecessorText?: string;
  predecessorIdentity?: DocumentIdentity;
  packageIdentities: DocumentIdentity[];
  /** Optional package-graph RESTATES edge for this successor — consumed, never mutated. */
  packageGraphRestatesEdge?: RelationshipCandidate | null;
}

/**
 * Build the authentic evidence checklist for one restatement successor document.
 */
export function extractRestatementAuthorityEvidence(input: ExtractRestatementEvidenceInput): RestatementAuthorityEvidence {
  const caption = extractCaption(input.successorText);
  const executionDate = extractExecutionDate(input.successorText, input.successorIdentity);
  const priorAgreementRecital = extractPriorRecital(input.successorText);
  const operativeRestatementLanguage = extractOperativeLanguage(input.successorText);
  const conditionsPrecedent = extractConditionsPrecedent(input.successorText);
  const signatureEvidence = extractSignatures(input.successorText);

  const resolved =
    input.predecessorDocumentId !== undefined
      ? { targetDocumentId: input.predecessorDocumentId, reason: "Caller-supplied predecessorDocumentId." }
      : resolvePriorAgreementTargetDocumentId(priorAgreementRecital, input.packageIdentities, input.successorDocumentId);

  const predecessorId = resolved.targetDocumentId;
  const predIdentity =
    input.predecessorIdentity ??
    (predecessorId ? input.packageIdentities.find((i) => i.documentId === predecessorId) : undefined);

  const full = operativeRestatementLanguage.present && operativeRestatementLanguage.supersedesEntirety;
  const { scope, refs } = extractPartialProvisionRefs(input.successorText, full);

  const edge = input.packageGraphRestatesEdge ?? null;

  return {
    successorDocumentId: input.successorDocumentId,
    predecessorDocumentId: predecessorId,
    captionRestatement: caption,
    executionDate,
    priorAgreementRecital,
    operativeRestatementLanguage,
    conditionsPrecedent,
    signatureEvidence,
    facilityIdentity: facilityIdentity(input.successorText, input.successorIdentity, predIdentity, input.predecessorText),
    restatementScope: scope,
    partialProvisionRefs: refs,
    packageGraphRelationshipStatus: edge?.status ?? null,
    packageGraphEvidenceClass: edge?.evidenceClass ?? null,
    packageGraphUnresolvedReason: edge?.unresolvedReason ?? null,
  };
}
