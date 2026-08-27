/**
 * Phase 2C - Multi-Document Debt Package Graph V1 (docs/phase-2c-debt-package-graph.md).
 * Shared types for the package-graph module. This layer establishes
 * document-relationship TOPOLOGY (what a document is, which instrument it
 * belongs to, which other documents it relates to, where a modification
 * MIGHT target) - it never constructs final amended covenant text (that
 * remains lib/contract-model/service.ts's existing getOperativeContractualState,
 * fed by real AmendmentEffect rows a LATER phase would populate from these
 * candidates once a human or a future phase confirms them).
 */
import type { CovenantFamily, DocumentRelationshipType, DocumentType } from "@prisma/client";

/** One package document as this module's own input shape - deliberately NOT CompilerDocumentInput (lib/contract-model/compiler/types.ts), since a package-graph run may legitimately happen before/without a full compiler run over the same documents (e.g. classification-only, or a package still missing some documents' structural parse). */
export interface PackageDocumentInput {
  documentId: string;
  /** Short, human-meaningful label - never baked into a prompt as a company/deal name (same discipline as CompilerDocumentInput.label). */
  label: string;
  text: string;
  /** Human-declared type at upload time, if any - a hint the classifier prefers evidence over, per task §4's own "do not force uncertain classification" applied to a stale/wrong human guess as much as a missing one. */
  declaredType?: DocumentType;
}

export type ResolutionStatus = "RESOLVED" | "REVIEW_REQUIRED" | "UNRESOLVED";

// ---------------------------------------------------------------------------
// §4/§5 - document classification + identity
// ---------------------------------------------------------------------------

export interface DocumentClassification {
  documentId: string;
  type: DocumentType;
  confidence: number;
  /** The literal matched text/signal that produced this classification - never invented, always a real substring or a named deterministic rule. */
  evidence: string[];
  resolutionMethod: "DETERMINISTIC_SELF_REFERENTIAL_TITLE" | "DETERMINISTIC_TITLE_PATTERN" | "DETERMINISTIC_DECLARED_TYPE_CONFIRMED" | "UNKNOWN_NO_SIGNAL";
}

export interface DocumentIdentity {
  documentId: string;
  title: string | null;
  agreementTypeLabel: string | null;
  executionDate: string | null;
  effectiveDate: string | null;
  parties: string[];
  borrowerOrIssuer: string | null;
  administrativeAgentOrTrustee: string | null;
  facilityOrInstrumentName: string | null;
  /** Raw text of "the Credit Agreement dated as of..." style self-reference to the ORIGINAL agreement this document amends/supplements, before any cross-document resolution (§12) - kept here since it is part of THIS document's own identity, not a separate edge yet. */
  originalAgreementReferenceHint: string | null;
  amendmentNumber: number | null;
  supplementNumber: number | null;
  /** Every field above with a real evidence string and char offset, never fabricated for a field the text does not actually support (task §5 - "do not hallucinate missing metadata"). */
  evidenceByField: Record<string, { text: string; charStart: number } | undefined>;
}

// ---------------------------------------------------------------------------
// §6 - package-level document relationships
// ---------------------------------------------------------------------------

// Task §6's own conceptual list (AMENDS/AMENDS_AND_RESTATES/SUPPLEMENTS/
// JOINS/GOVERNS/GUARANTEES/SECURES/INTERCREDITOR_RELATIONSHIP/
// CERTIFIES_COMPLIANCE_WITH/REFERENCES/RELATED_TO/SUPERSEDES_CANDIDATE)
// maps onto the REAL, already-existing DocumentRelationshipType Prisma
// enum (task's own "exact naming is your decision") rather than a second,
// parallel vocabulary: AMENDS_AND_RESTATES -> RESTATES,
// INTERCREDITOR_RELATIONSHIP -> INTERCREDITOR_WITH, REFERENCES/RELATED_TO
// -> INCORPORATES_BY_REFERENCE, SUPERSEDES_CANDIDATE -> SUPERSEDES (the
// "_CANDIDATE" distinction is expressed by this type's own
// status/confidence fields, not a separate enum value). JOINS and
// CERTIFIES_COMPLIANCE_WITH were the only two genuinely missing from the
// real enum and were added to it (additive migration) rather than forced
// onto an imprecise existing value.
export type PackageRelationshipType = DocumentRelationshipType;

export interface RelationshipCandidate {
  sourceDocumentId: string;
  /** Null when the target could not be resolved with adequate confidence (§14) - targetHint always preserved either way. */
  targetDocumentId: string | null;
  targetHint: string | null;
  relationshipType: PackageRelationshipType;
  sourceCitation: string;
  confidence: number;
  status: ResolutionStatus;
  unresolvedReason: string | null;
  resolutionMethod: string;
}

// ---------------------------------------------------------------------------
// §9 - modification candidates (pre-application amendment targets)
// ---------------------------------------------------------------------------

export type ModificationOperation = "REPLACE" | "ADD" | "DELETE" | "MODIFY" | "RESTATE" | "UNKNOWN_CHANGE";

export interface ModificationCandidate {
  /** The amendment-like document this candidate was found in. */
  sourceDocumentId: string;
  sourceNodeCitation: string;
  sourceText: string;
  operation: ModificationOperation;
  /** Which OTHER document this modification targets, when resolvable - never guessed from title similarity alone (§12/§14). */
  targetDocumentId: string | null;
  targetHint: string | null;
  targetSectionRef: string | null;
  targetDefinedTermRef: string | null;
  status: ResolutionStatus;
  unresolvedReason: string | null;
  confidence: number;
}

// ---------------------------------------------------------------------------
// §12 - cross-document reference leads
// ---------------------------------------------------------------------------

export interface CrossDocumentReferenceLead {
  sourceDocumentId: string;
  referenceText: string;
  charStart: number;
  /** The named-agreement phrase itself, e.g. "the Indenture", "the First Lien Credit Agreement". */
  namedAgreementHint: string;
  targetDocumentId: string | null;
  status: ResolutionStatus;
  unresolvedReason: string | null;
}

// ---------------------------------------------------------------------------
// §7 - instrument grouping
// ---------------------------------------------------------------------------

export interface InstrumentGroupingResult {
  /** Stable, content-derived key for this instrument within the package - not a DB id (assigned at persistence time). */
  instrumentKey: string;
  name: string;
  documentIds: string[];
  baseDocumentId: string | null;
  confidence: number;
  reviewStatus: "RESOLVED" | "REVIEW_REQUIRED";
}

// ---------------------------------------------------------------------------
// §11 - covenant-to-instrument association (Phase 2B discovery candidates,
// associated without flattening provenance)
// ---------------------------------------------------------------------------

export interface CovenantInstrumentAssociation {
  discoveryId: string;
  documentId: string;
  instrumentKey: string | null;
  families: CovenantFamily[];
}

// ---------------------------------------------------------------------------
// Top-level package graph result
// ---------------------------------------------------------------------------

export interface PackageGraphResult {
  companyId: string;
  packageKey: string;
  classifications: DocumentClassification[];
  identities: DocumentIdentity[];
  relationshipCandidates: RelationshipCandidate[];
  modificationCandidates: ModificationCandidate[];
  crossDocumentReferenceLeads: CrossDocumentReferenceLead[];
  instruments: InstrumentGroupingResult[];
  performance: PackageGraphPerformance;
}

export interface PackageGraphPerformance {
  documentCount: number;
  totalCharsScanned: number;
  relationshipCandidatesGenerated: number;
  relationshipsResolved: number;
  relationshipsUnresolved: number;
  modificationCandidatesGenerated: number;
  crossDocumentReferenceLeadsGenerated: number;
  wallClockMs: number;
  semanticCallsUsed: number;
}
