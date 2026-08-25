/**
 * Extraction-provider abstraction (docs/document-onboarding-pipeline-foundation.md).
 *
 * `ContractExtractionProvider` is the ONE interface every caller
 * (lib/extraction/run-stage.ts) programs against. Two implementations:
 *  - SyntheticExtractionProvider (./synthetic-provider.ts) - deterministic,
 *    fixture-driven, zero network calls. Used by this repo's own tests and
 *    by whatever later phase builds a "synthetic company" acceptance test.
 *  - AnthropicExtractionProvider (./anthropic-provider.ts) - the real,
 *    production implementation, calling the actual Claude API.
 *
 * Each stage's input intentionally includes BOTH this document's own
 * DocumentChunks (with full provenance) AND the prior stage's
 * already-extracted context - this is the staged pipeline the task
 * requires, never one giant single-shot prompt for a whole document.
 * RELATIONSHIPS and COVERAGE additionally take company-wide context
 * (candidates from the company's OTHER extraction runs too), since a
 * cross-document stacking relationship or a coverage gap can only be
 * detected by looking beyond a single document.
 */

import type {
  CoverageStageResult,
  DefinedTermProposal,
  DefinitionsStageResult,
  ExternalInputRequirementProposal,
  FinancialInputsStageResult,
  PermissionProposal,
  PermissionsStageResult,
  RelationshipsStageResult,
  StructureStageResult,
} from "./schemas";

/** A DocumentChunk's provenance-bearing fields, as the provider sees them - never the raw Prisma row. */
export interface ChunkRef {
  id: string;
  page: number | null;
  articleRef: string | null;
  sectionRef: string | null;
  heading: string | null;
  text: string;
}

interface BaseStageInput {
  companyId: string;
  documentId: string;
  chunks: ChunkRef[];
}

/** A minimal, already-extracted-elsewhere summary of one candidate - what COVERAGE reads across the whole company without re-fetching full proposedValue payloads. */
export interface CandidateSummary {
  kind: string;
  sectionRef: string | null;
  excerpt: string | null;
}

export interface StructureExtractionInput extends BaseStageInput {}
export type StructureExtractionResult = StructureStageResult;

export interface DefinitionExtractionInput extends BaseStageInput {
  /** This document's own STRUCTURE-stage output (article/section outline), for section-boundary context. */
  structure: StructureStageResult;
}
export type DefinitionExtractionResult = DefinitionsStageResult;

export interface PermissionExtractionInput extends BaseStageInput {
  /** This document's own already-extracted defined terms. */
  definitions: DefinedTermProposal[];
}
export type PermissionExtractionResult = PermissionsStageResult;

export interface RelationshipExtractionInput extends BaseStageInput {
  /** This run's own permission proposals. */
  permissions: PermissionProposal[];
  /** Every permission candidate already persisted for this company across ALL its extraction runs (not just this one) - needed to detect a cross-document stacking relationship (e.g. a credit agreement permission and an indenture permission that share a basket). */
  companyPermissions: PermissionProposal[];
}
export type RelationshipExtractionResult = RelationshipsStageResult;

export interface CoverageGapInput extends BaseStageInput {
  /** Every candidate already persisted for this company across ALL its extraction runs, summarized - what COVERAGE cross-references to decide whether a section this document contains was actually modeled by any stage/run. */
  companyCandidateSummaries: CandidateSummary[];
}
export type CoverageGapResult = CoverageStageResult;

export interface FinancialInputExtractionInput extends BaseStageInput {
  definitions: DefinedTermProposal[];
}
export type FinancialInputExtractionResult = FinancialInputsStageResult;

export interface ContractExtractionProvider {
  extractDocumentStructure(input: StructureExtractionInput): Promise<StructureExtractionResult>;
  extractDefinitions(input: DefinitionExtractionInput): Promise<DefinitionExtractionResult>;
  extractPermissions(input: PermissionExtractionInput): Promise<PermissionExtractionResult>;
  extractRelationships(input: RelationshipExtractionInput): Promise<RelationshipExtractionResult>;
  extractCoverageGaps(input: CoverageGapInput): Promise<CoverageGapResult>;
  extractFinancialInputs(input: FinancialInputExtractionInput): Promise<FinancialInputExtractionResult>;
}

export type { ExternalInputRequirementProposal };
