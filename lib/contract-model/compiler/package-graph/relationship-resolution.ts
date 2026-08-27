/**
 * Phase 2C §6/§9/§12/§14 - resolves package-level document relationships,
 * modification-candidate targets, and cross-document reference leads
 * against the OTHER documents in the same package. Deterministic only
 * (task §8/§15): title-type + execution-date matching against each
 * document's own extracted identity (document-identity.ts) - never a
 * semantic/model call in this V1, since every required scenario (including
 * the deliberately ambiguous one) resolves or correctly stays unresolved
 * from these cheap signals alone. See pipeline.ts's own header for the
 * cost-justification writeup task §15 requires before any paid call.
 *
 * "Do not guess based solely on similar titles" (task §12) is honored by
 * requiring a TYPE match (Credit Agreement vs Indenture vs...) as the
 * primary signal, using an execution-date match only to raise confidence
 * from REVIEW_REQUIRED to RESOLVED, and by returning UNRESOLVED - never an
 * arbitrary pick - the moment more than one candidate remains after both
 * signals are applied.
 */
import type { DocumentType } from "@prisma/client";
import type { CrossDocumentReferenceLead, DocumentClassification, DocumentIdentity, ModificationCandidate, PackageDocumentInput, PackageRelationshipType, RelationshipCandidate, ResolutionStatus } from "./types";

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`(?:${MONTHS})\\s+\\d{1,2},\\s*\\d{4}`, "i");
// "the X dated as of Y" AND "that certain X dated as of Y" - real filed
// documents use both determiners (task §17's own real-LSB-Joinder evidence:
// "to that certain INTERCREDITOR AGREEMENT dated as of August 7, 2013").
// Label set extended beyond Credit Agreement/Indenture/Loan Agreement to
// also recognize Intercreditor Agreement/Security Agreement/Guaranty -
// every classification this module maps a relationshipType onto (task §6)
// can legitimately target one of these, not only a Credit Agreement or
// Indenture.
//
// Phase 2F.3 §7/§8/§11 root-cause fix: real CONMED Document D's own text
// references its base facility as "the Eighth Amended and Restated Credit
// Agreement, dated as of June 10, 2025" and its collateral document as
// "the Amended and Restated Guarantee and Collateral Agreement, dated as
// of the June 10, 2025" - the ORIGINAL prefix alternation (First/Second
// Lien, Senior, Subordinated only) could match neither: an ordinal-
// numbered "Amended and Restated" restatement is the single most common
// real-world way a leveraged-finance document refers to its own base
// facility (not CONMED-specific - "Third Amended and Restated Credit
// Agreement" etc. is standard across the industry), and "Guarantee and
// Collateral Agreement"/"Guaranty and Security Agreement" is the standard
// composite collateral-document name. Both are added generically below.
// The date clause is also tolerant of a stray "the" ("dated as of the
// June 10, 2025") - a real, observed SEC-filing text-extraction artifact,
// not a drafting convention, but one date-parsing must survive rather
// than silently fail to match at all.
//
// `ws()` below converts every literal space in a phrase to `\s+` before it
// is spliced into the final regex source - real filed-document text
// extraction (HTML/PDF -> text) routinely wraps mid-phrase ("...Restated
// Credit\nAgreement, dated...", confirmed real in CONMED Document D's own
// extracted text), so a literal single-space match is not durable; every
// multi-word phrase in this module goes through it, not only the ones
// evidence happened to catch.
function ws(phrase: string): string {
  return phrase.replace(/ /g, "\\s+");
}

const RESTATEMENT_PREFIX = `(?:(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)${ws(" Amended and Restated ")}|${ws("Amended and Restated ")}|${ws("First Lien ")}|${ws("Second Lien ")}|Senior\\s+|Subordinated\\s+)?`;
const AGREEMENT_LABEL_ALTERNATION = [ws("Credit Agreement"), "Indenture", ws("Loan Agreement"), ws("Intercreditor Agreement"), ws("Guarantee and Collateral Agreement"), ws("Guaranty and Collateral Agreement"), ws("Guarantee and Security Agreement"), ws("Guaranty and Security Agreement"), ws("Pledge and Security Agreement"), ws("Pledge, Guaranty and Security Agreement"), ws("Security Agreement"), ws("Collateral Agreement"), `Guaranty(?:${ws(" Agreement")})?`, ws("Guarantee Agreement")].join("|");
const AGREEMENT_REF_RE = new RegExp(`(?:the|that certain)\\s+(${RESTATEMENT_PREFIX}(?:${AGREEMENT_LABEL_ALTERNATION}))\\s*,?\\s*dated\\s+(?:as\\s+of\\s+)?(?:the\\s+)?(${DATE_RE.source})`, "gi");

type AgreementTypeHint = "CREDIT_AGREEMENT" | "INDENTURE" | "INTERCREDITOR_AGREEMENT" | "SECURITY_AGREEMENT" | "GUARANTEE" | "GUARANTEE_AND_SECURITY_AGREEMENT";

interface AgreementReference {
  typeHint: AgreementTypeHint;
  date: string;
  charStart: number;
  rawText: string;
}

const TARGET_TYPES_BY_HINT: Record<AgreementTypeHint, DocumentType[]> = {
  CREDIT_AGREEMENT: ["CREDIT_AGREEMENT", "AMENDED_AND_RESTATED_AGREEMENT"],
  INDENTURE: ["INDENTURE"],
  INTERCREDITOR_AGREEMENT: ["INTERCREDITOR_AGREEMENT"],
  SECURITY_AGREEMENT: ["SECURITY_AGREEMENT", "GUARANTEE_AND_SECURITY_AGREEMENT"],
  GUARANTEE: ["GUARANTEE", "GUARANTEE_AND_SECURITY_AGREEMENT"],
  GUARANTEE_AND_SECURITY_AGREEMENT: ["GUARANTEE_AND_SECURITY_AGREEMENT", "GUARANTEE", "SECURITY_AGREEMENT"],
};

// A composite label ("Guarantee and Collateral Agreement") is classified
// as its own hint - not folded into plain GUARANTEE - so a reference to it
// can resolve against a composite-typed document just as readily as a
// plain guarantee/security one (see TARGET_TYPES_BY_HINT above, which
// still lets a composite reference reach a plain GUARANTEE/SECURITY_AGREEMENT
// document too - a package may reasonably have either).
function classifyAgreementLabel(label: string): AgreementTypeHint {
  if (/indenture/i.test(label)) return "INDENTURE";
  if (/intercreditor/i.test(label)) return "INTERCREDITOR_AGREEMENT";
  if (/guarant(?:y|ee)\s+and\s+(?:collateral|security)\s+agreement|pledge,?\s+guarant(?:y|ee)\s+and\s+security\s+agreement/i.test(label)) return "GUARANTEE_AND_SECURITY_AGREEMENT";
  if (/security\s+agreement|collateral\s+agreement/i.test(label)) return "SECURITY_AGREEMENT";
  if (/guarant/i.test(label)) return "GUARANTEE";
  return "CREDIT_AGREEMENT";
}

function findAllAgreementReferences(text: string, windowChars: number): AgreementReference[] {
  const window = text.slice(0, windowChars);
  const out: AgreementReference[] = [];
  const re = new RegExp(AGREEMENT_REF_RE.source, AGREEMENT_REF_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) {
    const label = m[1]!;
    out.push({ typeHint: classifyAgreementLabel(label), date: m[2]!.replace(/\s+/g, " ").trim(), charStart: m.index, rawText: m[0] });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

function normalizeDate(d: string | null): string | null {
  return d ? d.replace(/\s+/g, " ").trim().toLowerCase() : null;
}

/** Resolves ONE agreement reference against the rest of the package - the one shared resolution rule every relationship/modification/cross-reference target uses, so "ambiguous stays unresolved" is enforced in exactly one place. */
function resolveAgreementReference(ref: AgreementReference, sourceDocumentId: string, classifications: DocumentClassification[], identities: DocumentIdentity[]): { targetDocumentId: string | null; confidence: number; status: ResolutionStatus; unresolvedReason: string | null; resolutionMethod: string } {
  const targetTypes = new Set(TARGET_TYPES_BY_HINT[ref.typeHint]);
  const typeMatches = classifications.filter((c) => c.documentId !== sourceDocumentId && targetTypes.has(c.type));
  if (typeMatches.length === 0) {
    return { targetDocumentId: null, confidence: 0, status: "UNRESOLVED", unresolvedReason: `no document in this package is classified as ${[...targetTypes].join("/")}`, resolutionMethod: "DETERMINISTIC_NO_CANDIDATE" };
  }
  const identityById = new Map(identities.map((i) => [i.documentId, i] as const));
  const dateMatches = typeMatches.filter((c) => normalizeDate(identityById.get(c.documentId)?.executionDate ?? null) === normalizeDate(ref.date));
  if (dateMatches.length === 1) {
    return { targetDocumentId: dateMatches[0]!.documentId, confidence: 0.95, status: "RESOLVED", unresolvedReason: null, resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH" };
  }
  if (dateMatches.length > 1) {
    return { targetDocumentId: null, confidence: 0.2, status: "UNRESOLVED", unresolvedReason: `${dateMatches.length} candidate target documents share the same type and execution date ("${ref.date}") - cannot disambiguate deterministically`, resolutionMethod: "DETERMINISTIC_AMBIGUOUS" };
  }
  // No date match at all - fall back to type-only match, but only when it is unique.
  if (typeMatches.length === 1) {
    return { targetDocumentId: typeMatches[0]!.documentId, confidence: 0.55, status: "REVIEW_REQUIRED", unresolvedReason: `type matches but execution date "${ref.date}" does not match the candidate's own executionDate - resolved provisionally, needs human confirmation`, resolutionMethod: "DETERMINISTIC_TYPE_ONLY_MATCH" };
  }
  return { targetDocumentId: null, confidence: 0.1, status: "UNRESOLVED", unresolvedReason: `${typeMatches.length} candidate documents of type ${ref.typeHint} exist in this package and none matches the referenced execution date ("${ref.date}") - never guessed from title similarity alone`, resolutionMethod: "DETERMINISTIC_AMBIGUOUS" };
}

// Maps a source document's own classification onto the real
// DocumentRelationshipType enum (see types.ts's own PackageRelationshipType
// comment for the full reuse rationale) - AMENDS_AND_RESTATES maps to the
// real enum's RESTATES, INTERCREDITOR_RELATIONSHIP to INTERCREDITOR_WITH.
//
// Phase 2F.3 §6 - VALUES ARE ARRAYS, not a single relationship type: this
// is the "document type vs document function" separation the task asks
// for, applied minimally (reusing the existing edge architecture rather
// than a parallel model) - a document's PRIMARY type may correspond to
// more than one real relationship FUNCTION toward its target(s). The
// clearest real case: a composite GUARANTEE_AND_SECURITY_AGREEMENT both
// guarantees AND secures the obligations it references - one relationship
// candidate is generated per (relationshipType x reference) pair below,
// never silently collapsing the two into one.
const RELATIONSHIP_TYPES_BY_SOURCE_CLASSIFICATION: Partial<Record<DocumentType, PackageRelationshipType[]>> = {
  AMENDMENT: ["AMENDS"],
  AMENDED_AND_RESTATED_AGREEMENT: ["RESTATES"],
  SUPPLEMENTAL_INDENTURE: ["SUPPLEMENTS"],
  JOINDER: ["JOINS"],
  COMPLIANCE_CERTIFICATE: ["CERTIFIES_COMPLIANCE_WITH"],
  INTERCREDITOR_AGREEMENT: ["INTERCREDITOR_WITH"],
  GUARANTEE: ["GUARANTEES"],
  SECURITY_AGREEMENT: ["SECURES"],
  GUARANTEE_AND_SECURITY_AGREEMENT: ["GUARANTEES", "SECURES"],
};

export interface RelationshipResolutionResult {
  relationshipCandidates: RelationshipCandidate[];
  resolvedModificationCandidates: ModificationCandidate[];
  resolvedCrossDocumentReferenceLeads: CrossDocumentReferenceLead[];
}

export function resolvePackageRelationships(documents: PackageDocumentInput[], classifications: DocumentClassification[], identities: DocumentIdentity[], modificationCandidates: ModificationCandidate[], crossDocumentReferenceLeads: CrossDocumentReferenceLead[]): RelationshipResolutionResult {
  const classById = new Map(classifications.map((c) => [c.documentId, c] as const));
  const relationshipCandidates: RelationshipCandidate[] = [];

  // §6/§9: explicit "the X dated as of Y" self-references drive document-to-document relationship edges.
  for (const doc of documents) {
    const classification = classById.get(doc.documentId);
    if (!classification) continue;
    const relationshipTypes = RELATIONSHIP_TYPES_BY_SOURCE_CLASSIFICATION[classification.type];
    if (!relationshipTypes || relationshipTypes.length === 0) continue;

    const bigWindowTypes: DocumentType[] = ["INTERCREDITOR_AGREEMENT", "GUARANTEE", "SECURITY_AGREEMENT", "GUARANTEE_AND_SECURITY_AGREEMENT"];
    const references = findAllAgreementReferences(doc.text, bigWindowTypes.includes(classification.type) ? 8000 : 4000);
    if (references.length === 0) {
      for (const relationshipType of relationshipTypes) {
        relationshipCandidates.push({
          sourceDocumentId: doc.documentId,
          targetDocumentId: null,
          targetHint: null,
          relationshipType,
          sourceCitation: doc.label,
          confidence: 0,
          status: "UNRESOLVED",
          unresolvedReason: "no explicit reference to another agreement (by name + execution date) was found in this document's own text",
          resolutionMethod: "DETERMINISTIC_NO_SIGNAL",
        });
      }
      continue;
    }
    // §11 multi-target amendments: every distinct reference this document's
    // own text supports gets its own candidate, for every relationship
    // function this document's type implies - a document that both
    // references two different target agreements (multi-target) AND has
    // more than one real function (composite type) produces the full
    // cross-product, never forcing a single choice.
    for (const ref of references) {
      const resolution = resolveAgreementReference(ref, doc.documentId, classifications, identities);
      for (const relationshipType of relationshipTypes) {
        relationshipCandidates.push({
          sourceDocumentId: doc.documentId,
          targetDocumentId: resolution.targetDocumentId,
          targetHint: ref.rawText,
          relationshipType,
          sourceCitation: ref.rawText,
          confidence: resolution.confidence,
          status: resolution.status,
          unresolvedReason: resolution.unresolvedReason,
          resolutionMethod: resolution.resolutionMethod,
        });
      }
    }
  }

  // §9: resolve each modification candidate's target the same way, using its OWN source document's agreement references (a modification candidate targets whatever agreement its own containing document amends).
  const referencesByDocument = new Map<string, AgreementReference[]>();
  for (const doc of documents) referencesByDocument.set(doc.documentId, findAllAgreementReferences(doc.text, 4000));
  const resolvedModificationCandidates = modificationCandidates.map((mc): ModificationCandidate => {
    const refs = referencesByDocument.get(mc.sourceDocumentId) ?? [];
    if (refs.length === 0) return { ...mc, status: "UNRESOLVED", unresolvedReason: "the source document itself has no resolvable reference to another agreement" };
    // A modification candidate targets whichever single agreement its own
    // document amends - if the source document itself resolved unambiguously
    // (exactly one reference), reuse that; multiple distinct referenced
    // agreements in one amending document is a real but rarer case this V1
    // leaves REVIEW_REQUIRED rather than guessing which one a given clause targets.
    if (refs.length > 1) return { ...mc, status: "REVIEW_REQUIRED", unresolvedReason: "the source document references more than one other agreement - which one this specific modification targets was not disambiguated" };
    const resolution = resolveAgreementReference(refs[0]!, mc.sourceDocumentId, classifications, identities);
    return { ...mc, targetDocumentId: resolution.targetDocumentId, targetHint: refs[0]!.rawText, status: resolution.status, unresolvedReason: resolution.unresolvedReason, confidence: Math.min(mc.confidence, resolution.confidence) };
  });

  // §12: resolve cross-document reference leads the same way, but by TYPE hint alone (no date attached to a bare "the Indenture" mention) - unique-type-match only, otherwise left unresolved (never guessed from name similarity).
  const resolvedCrossDocumentReferenceLeads = crossDocumentReferenceLeads.map((lead): CrossDocumentReferenceLead => {
    // Reuses the same generic label->type classifier findAllAgreementReferences
    // already applies to a dated self-reference (task §17's own real-LSB-
    // Joinder fix) - a bare named mention with no attached date deserves
    // the identical type vocabulary, not a narrower Indenture/Credit-
    // Agreement-only guess (a real, previously-dormant gap Phase 2D's own
    // real testing surfaced: "subject to the Intercreditor Agreement"
    // could never resolve even when a real Intercreditor Agreement
    // document was present in the package).
    const targetTypes: DocumentType[] = TARGET_TYPES_BY_HINT[classifyAgreementLabel(lead.namedAgreementHint)];
    const candidates = classifications.filter((c) => c.documentId !== lead.sourceDocumentId && targetTypes.includes(c.type));
    if (candidates.length === 1) return { ...lead, targetDocumentId: candidates[0]!.documentId, status: "REVIEW_REQUIRED", unresolvedReason: "resolved by unique type match alone (no execution date in a bare named-agreement mention) - needs confirmation" };
    if (candidates.length === 0) return { ...lead, status: "UNRESOLVED", unresolvedReason: `no document of type ${targetTypes.join("/")} exists in this package` };
    return { ...lead, status: "UNRESOLVED", unresolvedReason: `${candidates.length} candidate documents of type ${targetTypes.join("/")} exist - never resolved from a bare named mention alone` };
  });

  return { relationshipCandidates, resolvedModificationCandidates, resolvedCrossDocumentReferenceLeads };
}
