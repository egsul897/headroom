/**
 * Covenant Precedent Research Interface — source-backed research types.
 *
 * Results are retrieval hits over a source-backed corpus. They are never legal
 * opinions, capacity approvals, or transaction authorizations.
 */

import type { CovenantFamily, DocumentType } from "@prisma/client";
import type { ContractConditionType } from "../contract-model/types";

export const COVENANT_RESEARCH_SCHEMA_VERSION = "covenant-precedent-research.v1";

/** Required disclaimer on every response surface (CLI, JSON, future UI). */
export const RESEARCH_DISCLAIMER =
  "Research results are source-backed retrieval hits for comparison only. " +
  "They are not legal opinions, not approved capacity determinations, and not " +
  "advice that a proposed transaction is permitted.";

export type ResearchEntryKind = "RULE" | "DEFINITION" | "AMENDMENT_EFFECT";

export type OperativeVersionStatus =
  | "CURRENT_OPERATIVE"
  | "SUPERSEDED"
  | "AMENDED"
  | "HISTORICAL"
  | "UNKNOWN"
  | "UNKNOWN_EFFECTIVE_DATE"
  | "MISSING_AMENDMENT_AUTHORITY"
  | "UNRESOLVED_OPERATIVE_STATE";

export type ResearchVerificationStatus =
  | "UNVERIFIED"
  | "COMPILED"
  | "VERIFIED"
  | "REVIEW_REQUIRED"
  | "FIXTURE"
  | "HYPOTHESIS";

export interface ResearchIssuer {
  companyId: string;
  name: string;
  ticker: string | null;
  cik: string | null;
}

export interface ResearchInstrument {
  instrumentKey: string;
  name: string;
  agreementType: DocumentType | string;
}

export interface ResearchFiling {
  url: string | null;
  accession: string | null;
  filedOn: string | null;
  documentName: string | null;
}

export interface ResearchDefinitionRef {
  termName: string;
  excerpt: string | null;
  definitionEntryId: string | null;
}

export interface ResearchCondition {
  type: ContractConditionType | string;
  description: string;
}

export interface ResearchAmendmentRelationship {
  relationshipType: string;
  relatedEntryId: string | null;
  description: string;
}

/**
 * Structural features used by hybrid retrieval (no embeddings).
 * Kept explicit so tests can assert which lever fired.
 */
export interface ResearchStructuralFeatures {
  moneyAmountsUsd: number[];
  hasRatioGate: boolean;
  hasUnlimitedCapacity: boolean;
  conditionTypes: string[];
  entityScopeTags: string[];
  hasSharedCapacity: boolean;
  hasReclassification: boolean;
  hasSpringingTest: boolean;
  hasSynergyAddback: boolean;
  /** null = unknown / not applicable when hasSynergyAddback is false */
  synergyAddbackCapped: boolean | null;
  sharesWithJuniorDebtPrepay: boolean;
  isGeneralDebtBasket: boolean;
  amendmentReducesRpCapacity: boolean;
  hasOverlappingBaskets: boolean;
  unusualReclassification: boolean;
}

export interface ResearchMissingDependency {
  kind: string;
  description: string;
  /** Always true when surfaced — missing deps are disclosed, never filled. */
  disclosed: true;
}

export interface ResearchSourceSpan {
  charStart: number | null;
  charEnd: number | null;
  excerptHash: string;
}

export interface ResearchCorpusEntry {
  entryId: string;
  kind: ResearchEntryKind;
  issuer: ResearchIssuer;
  instrument: ResearchInstrument;
  filing: ResearchFiling;
  covenantFamily: CovenantFamily | string;
  ruleType: string | null;
  action: string | null;
  operativeVersion: {
    status: OperativeVersionStatus;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    supersededByEntryId: string | null;
  };
  /** Exact source excerpt — never a paraphrase. */
  sourceExcerpt: string;
  sourceCitation: string;
  sourceSectionRef: string | null;
  relevantDefinitions: ResearchDefinitionRef[];
  relatedConditions: ResearchCondition[];
  amendmentRelationships: ResearchAmendmentRelationship[];
  verificationStatus: ResearchVerificationStatus;
  structuralFeatures: ResearchStructuralFeatures;
  /** Lexical index text (excerpt + citation + definition terms + condition prose). */
  searchText: string;
  tags: string[];
  /** Canonical source document id within the package (e.g. doc-a). */
  sourceDocumentId?: string | null;
  extractionVersion?: string | null;
  covenantIdentity?: string;
  identityKey?: string;
  sourceSpan?: ResearchSourceSpan;
  missingDependencies?: ResearchMissingDependency[];
}

export type ResearchIntent =
  | "GENERAL_DEBT_BASKET_AMOUNT"
  | "EBITDA_UNCAPPED_SYNERGY"
  | "RP_NO_DEFAULT"
  | "INVESTMENT_SHARED_JUNIOR_PREPAY"
  | "RATIO_INCREMENTAL_DEBT"
  | "AMENDMENT_REDUCES_RP"
  | "SPRINGING_LEVERAGE"
  | "NON_GUARANTOR_SUBSIDIARY_DEBT"
  | "UNUSUAL_RECLASSIFICATION"
  | "OVERLAPPING_BASKETS"
  | "GENERIC_LEXICAL";

export interface ResearchFilters {
  issuers?: string[];
  agreementTypes?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  /** As-of date for amendment-aware operative filtering (ISO YYYY-MM-DD). */
  asOfDate?: string | null;
  covenantFamilies?: string[];
  operativeOnly?: boolean;
  moneyAmountUsd?: number | null;
  conditionTypes?: string[];
  intents?: ResearchIntent[];
}

export interface ParsedResearchQuery {
  raw: string;
  lexicalTerms: string[];
  phrases: string[];
  filters: ResearchFilters;
  intent: ResearchIntent | null;
  /** When set, the interface must refuse rather than invent an answer. */
  unsupportedReason: string | null;
}

export interface ResearchHit {
  entry: ResearchCorpusEntry;
  score: number;
  lexicalScore: number;
  structuralScore: number;
  matchedSignals: string[];
  /** Amendment-aware operative classification for this hit under the query as-of date. */
  operativeClassification?: OperativeVersionStatus;
  uncertaintyNotes?: string[];
}

export interface ResearchResponse {
  schemaVersion: typeof COVENANT_RESEARCH_SCHEMA_VERSION;
  disclaimer: typeof RESEARCH_DISCLAIMER;
  query: ParsedResearchQuery;
  hits: ResearchHit[];
  refused: boolean;
  refusalReason: string | null;
  resultCount: number;
  /** Read-only safety: always true for this interface. */
  readOnly?: true;
  missingDependencyDisclosures?: ResearchMissingDependency[];
}
