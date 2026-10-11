/**
 * HEADROOM Agent #7 — operative restatement / amendment authority types.
 *
 * This layer answers: which agreement, restatement, amendment, waiver, or
 * supplement governs a covenant as of a requested date?
 *
 * It is ADDITIVE. It never mutates package-graph relationship status, never
 * assigns Document.instrumentId, and never treats a newer filing as an
 * automatic operative replacement without authentic evidence.
 */

import type { ResolutionStatus, TargetEvidenceClass } from "../package-graph/types";

/** Fail-closed authority outcomes for restatement / amendment resolution. */
export type OperativeAuthorityStatus =
  | "OPERATIVE_AUTHORITY_CONFIRMED"
  | "NOT_YET_EFFECTIVE"
  | "REVIEW_REQUIRED"
  | "AMBIGUOUS"
  | "UNSUPPORTED"
  | "PROVISIONAL_IDENTITY_BLOCKED";

export type InstrumentRole =
  | "ORIGINAL_AGREEMENT"
  | "RESTATEMENT"
  | "AMENDMENT"
  | "SUPPLEMENT"
  | "WAIVER"
  | "SIDE_LETTER"
  | "UNKNOWN";

export type RestatementScope = "FULL_AGREEMENT" | "PARTIAL_PROVISIONS" | "UNKNOWN";

export type EffectivenessInference =
  | "EXPLICIT_UNCONDITIONAL"
  | "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION"
  | "CONDITIONAL_UNRESOLVED"
  | "UNKNOWN";

export type ConditionsPrecedentSatisfaction =
  | "INDEPENDENTLY_PROVEN"
  | "NOT_INDEPENDENTLY_PROVEN"
  | "NOT_STATED"
  | "NOT_APPLICABLE";

/** Optional confirmed-identity surface from HEADROOM-3 (#274) when available. */
export interface ConfirmedInstrumentIdentityView {
  instrumentKey: string;
  /** Trusted / confirmed membership only — never provisionalDocumentIds. */
  confirmedDocumentIds: string[];
  provisionalDocumentIds: string[];
  mayConsolidateOperative: boolean;
  associationKind?: string;
  bridgeBlockers?: Array<{ sourceDocumentId: string; targetDocumentId: string; reason: string }>;
}

export interface TextEvidenceHit {
  present: boolean;
  excerpt: string | null;
  charStart: number | null;
}

export interface PriorAgreementRecitalEvidence extends TextEvidenceHit {
  namedAgreementLabel: string | null;
  namedExecutionDate: string | null;
  definedTerm: string | null;
}

export interface OperativeRestatementLanguageEvidence extends TextEvidenceHit {
  location: "NOW_THEREFORE" | "ARTICLE_RESTATEMENT_SECTION" | "BOTH" | "NONE";
  supersedesEntirety: boolean;
  novationDisclaimed: boolean;
}

export interface FacilityIdentityEvidence {
  administrativeAgentMatch: boolean | null;
  revolvingFacilityContinuity: boolean | null;
  borrowerContinuitySignals: string[];
  mismatchReasons: string[];
}

/**
 * Authentic evidence checklist for one successor → predecessor restatement
 * candidate. Every boolean is backed by a source excerpt or an explicit null.
 */
export interface RestatementAuthorityEvidence {
  successorDocumentId: string;
  predecessorDocumentId: string | null;
  captionRestatement: TextEvidenceHit & { ordinalLabel: string | null };
  executionDate: { value: string | null; isoDate: string | null; excerpt: string | null };
  priorAgreementRecital: PriorAgreementRecitalEvidence;
  operativeRestatementLanguage: OperativeRestatementLanguageEvidence;
  conditionsPrecedent: TextEvidenceHit & { sectionRef: string | null };
  signatureEvidence: TextEvidenceHit;
  facilityIdentity: FacilityIdentityEvidence;
  restatementScope: RestatementScope;
  partialProvisionRefs: string[];
  /** Consumed from package graph when present — never rewritten here. */
  packageGraphRelationshipStatus: ResolutionStatus | null;
  packageGraphEvidenceClass: TargetEvidenceClass | null;
  packageGraphUnresolvedReason: string | null;
}

export interface RestatementAuthorityResolution {
  status: OperativeAuthorityStatus;
  successorDocumentId: string;
  predecessorDocumentId: string | null;
  /** ISO YYYY-MM-DD when an effectiveness date can be inferred or stated. */
  effectiveDateIso: string | null;
  effectivenessInference: EffectivenessInference;
  conditionsPrecedentSatisfaction: ConditionsPrecedentSatisfaction;
  evidence: RestatementAuthorityEvidence;
  reasons: string[];
  /** Non-blocking disclosures that consumers MUST surface (e.g. unproven CPs). */
  caveats: string[];
  /** Hard invariant — this module never mutates package-graph edges. */
  doesNotMutatePackageGraphRelationship: true;
}

export type GoverningAuthorityClassification =
  | "CONFIRMED_OPERATIVE"
  | "CONFIRMED_OPERATIVE_WITH_CAVEATS"
  | "NOT_YET_EFFECTIVE"
  | "SUPERSEDED_SOURCE"
  | "PROVISIONAL_IDENTITY_BLOCKED"
  | "AMBIGUOUS"
  | "REVIEW_REQUIRED"
  | "UNSUPPORTED";

export interface GoverningInstrumentLink {
  documentId: string;
  role: InstrumentRole;
  relationshipToGoverning: "GOVERNING" | "SUPERSEDED_PREDECESSOR" | "NOT_YET_EFFECTIVE_SUCCESSOR" | "INAPPLICABLE" | "CONFLICTING";
  restatementAuthorityStatus: OperativeAuthorityStatus | null;
}

export interface GoverningProvisionResolution {
  asOfDate: string;
  provisionKey: string;
  kind: "SECTION" | "DEFINITION" | "WHOLE_AGREEMENT";
  sectionRef: string | null;
  definedTermRef: string | null;
  authorityClassification: GoverningAuthorityClassification;
  governingDocumentId: string | null;
  supersededDocumentIds: string[];
  instrumentLinks: GoverningInstrumentLink[];
  applicableAuthorityChain: RestatementAuthorityResolution[];
  unresolvedConflicts: string[];
  caveats: string[];
  reasons: string[];
  provenance: {
    usedConfirmedInstrumentIdentity: boolean;
    packageGraphRestatesStatus: ResolutionStatus | null;
    effectivenessInference: EffectivenessInference | null;
    conditionsPrecedentSatisfaction: ConditionsPrecedentSatisfaction | null;
  };
}

/** Additive handoff bundle for Agent #6 (retrieval) and Agent #10 (execution). */
export interface OperativeAuthorityHandoffBundle {
  companyId: string;
  packageKey: string;
  asOfDate: string;
  startingMainSha: string;
  packageGraphAuthorityPr: "https://github.com/egsul897/headroom/pull/274";
  worHoldoutPr: "https://github.com/egsul897/headroom/pull/276";
  restatementAuthorities: RestatementAuthorityResolution[];
  provisions: GoverningProvisionResolution[];
  unsupportedCases: string[];
  verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_VERIFIED" | "OPERATIVE_RESTATEMENT_AUTHORITY_PARTIAL" | "OPERATIVE_RESTATEMENT_AUTHORITY_BLOCKED";
  verdictReasons: string[];
}
