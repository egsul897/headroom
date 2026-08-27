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
const AGREEMENT_REF_RE = new RegExp(`(?:the|that certain)\\s+((?:First Lien|Second Lien|Senior|Subordinated)?\\s*(?:Credit Agreement|Indenture|Loan Agreement|Intercreditor Agreement|Security Agreement|Guaranty(?: Agreement)?|Guarantee Agreement))\\s*,?\\s*dated (?:as of )?(${DATE_RE.source})`, "gi");

type AgreementTypeHint = "CREDIT_AGREEMENT" | "INDENTURE" | "INTERCREDITOR_AGREEMENT" | "SECURITY_AGREEMENT" | "GUARANTEE";

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
  SECURITY_AGREEMENT: ["SECURITY_AGREEMENT"],
  GUARANTEE: ["GUARANTEE"],
};

function classifyAgreementLabel(label: string): AgreementTypeHint {
  if (/indenture/i.test(label)) return "INDENTURE";
  if (/intercreditor/i.test(label)) return "INTERCREDITOR_AGREEMENT";
  if (/security agreement/i.test(label)) return "SECURITY_AGREEMENT";
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
const RELATIONSHIP_TYPE_BY_SOURCE_CLASSIFICATION: Partial<Record<DocumentType, PackageRelationshipType>> = {
  AMENDMENT: "AMENDS",
  AMENDED_AND_RESTATED_AGREEMENT: "RESTATES",
  SUPPLEMENTAL_INDENTURE: "SUPPLEMENTS",
  JOINDER: "JOINS",
  COMPLIANCE_CERTIFICATE: "CERTIFIES_COMPLIANCE_WITH",
  INTERCREDITOR_AGREEMENT: "INTERCREDITOR_WITH",
  GUARANTEE: "GUARANTEES",
  SECURITY_AGREEMENT: "SECURES",
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
    const relationshipType = RELATIONSHIP_TYPE_BY_SOURCE_CLASSIFICATION[classification.type];
    if (!relationshipType) continue;

    const references = findAllAgreementReferences(doc.text, classification.type === "INTERCREDITOR_AGREEMENT" || classification.type === "GUARANTEE" || classification.type === "SECURITY_AGREEMENT" ? 8000 : 4000);
    if (references.length === 0) {
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
      continue;
    }
    for (const ref of references) {
      const resolution = resolveAgreementReference(ref, doc.documentId, classifications, identities);
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
