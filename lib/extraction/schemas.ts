/**
 * Zod schemas for staged-extraction output (docs/document-onboarding-pipeline-foundation.md).
 *
 * Every ContractExtractionProvider method (lib/extraction/provider.ts) MUST
 * have its output validated against the matching *StageResultSchema below
 * BEFORE a single ExtractionCandidate row is persisted - a schema violation
 * fails that pipeline stage loudly (ExtractionStage.status = FAILED, a clear
 * `error`), never gets silently coerced, and never crashes the run (sibling
 * stages/other documents are unaffected) - see lib/extraction/run-stage.ts.
 *
 * `proposedValue` shapes below are deliberately close to, but not identical
 * with, the real Permission/PermissionRelationship/etc. DB rows they will
 * eventually become in Phase 2: they use human-readable `*Ref` strings
 * (declared by the model itself, e.g. a permission's own short label) to
 * cross-reference other candidates from the SAME extraction run instead of
 * real foreign-key ids, because those ids don't exist until Phase 2's
 * promotion step creates the real rows. Phase 2's promotion logic resolves
 * these refs.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared provenance - every proposal carries this, regardless of kind.
// ---------------------------------------------------------------------------

export const SourceProvenanceSchema = z.object({
  /** DocumentChunk ids this proposal was read from - always at least one. */
  sourceChunkIds: z.array(z.string().min(1)).min(1),
  sourcePage: z.number().int().positive().optional(),
  sourceSectionRef: z.string().min(1).optional(),
  /** A short quoted snippet for display without re-fetching the chunk. */
  sourceExcerpt: z.string().max(600).optional(),
  confidence: z.number().min(0).max(1).optional(),
  /**
   * Short, structured justification ONLY. Never a raw chain-of-thought
   * trace - lib/extraction/anthropic-provider.ts discards any extended
   * reasoning content before this field is ever populated, and this length
   * cap is a second line of defense against a runaway reasoning dump
   * landing in the persisted row.
   */
  rationale: z.string().max(1000).optional(),
});
export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;

// ---------------------------------------------------------------------------
// Kind-specific proposedValue shapes (prisma/schema.prisma's
// ExtractionCandidateKind enum, one schema per member).
// ---------------------------------------------------------------------------

export const DefinedTermValueSchema = z.object({
  termName: z.string().min(1),
  sectionRef: z.string().min(1),
  fullText: z.string().min(1),
});

const GRANT_TYPES = ["DEBT_INCURRENCE", "LIEN"] as const;
const AMOUNT_KINDS = ["FIXED", "INCURRENCE_BASED"] as const;
const FORMULA_TYPES = ["FLAT_AMOUNT", "FLAT_NET_OF_DEBT", "GREATER_OF_FLAT_OR_PCT_EBITDA", "LEVERAGE_RATIO_ROOM", "COVERAGE_RATIO_ROOM", "BUILDER_BASKET", "RATIO_GATE"] as const;
const MEASUREMENT_BASES = ["CUMULATIVE_INCURRED", "CURRENTLY_OUTSTANDING", "NET_OF_REPAYMENT", "PREPAYMENT_CREDIT"] as const;
const MODELING_STATUSES = ["MODELED", "KNOWN_NOT_MODELED"] as const;
const PRIORITY_TIERS = ["FIRST", "SECOND", "PARI_PASSU", "UNSECURED"] as const;
const AGGREGATION_RULES = ["NAMED_MEMBER_CLAUSES", "EXTERNAL_INSTRUMENT_BALANCE", "ENTITY_CLASS_FILTER"] as const;
const STACKING_RELATIONSHIP_TYPES = [
  "CONCURRENT_DISREGARDED",
  "CONCURRENT_COUNTED",
  "ALTERNATIVE",
  "MUTUALLY_EXCLUSIVE",
  "AUTOMATIC_LINKED_PERMISSION",
  "EQUAL_AND_RATABLE_PULLUP",
  "PARAMETER_ADJUSTMENT_TRIGGER",
  "SHARED_CONSTRAINT_PARTICIPATION",
  "UNKNOWN",
] as const;
const PREDICATE_KINDS = ["POINT_IN_TIME", "CONTINUITY_WINDOW", "EVENT_TRIGGERED", "USAGE_LIMITED"] as const;
const RULE_ACTIVATION_EFFECTS = ["APPLICABILITY", "PARAMETER_VALUE", "RETROACTIVE_REEXAMINATION"] as const;
const DOCUMENT_TYPES = ["CREDIT_AGREEMENT", "INDENTURE", "OTHER", "AMENDMENT", "INTERCREDITOR_AGREEMENT", "COMPLIANCE_CERTIFICATE"] as const;
const EXTERNAL_INPUT_KINDS = ["COMPUTABLE_FORMULA", "CERTIFIED_EXTERNAL_INPUT", "PUBLIC_FILING_RECONSTRUCTION", "DISCRETIONARY_CATCH_ALL", "HUMAN_CLASSIFICATION"] as const;

export const PermissionValueSchema = z.object({
  /** A short, run-local label this proposal (and RELATIONSHIPS-stage proposals in the same run) refer to it by - not a database id. */
  permissionRef: z.string().min(1),
  action: z.string().min(1),
  grantType: z.enum(GRANT_TYPES),
  amountKind: z.enum(AMOUNT_KINDS),
  entityScope: z.array(z.string()).default([]),
  formulaType: z.enum(FORMULA_TYPES),
  thresholdValue: z.number(),
  params: z.record(z.string(), z.unknown()).optional(),
  eligibilityConditions: z.array(z.record(z.string(), z.unknown())).optional(),
  termConditions: z.array(z.record(z.string(), z.unknown())).optional(),
  measurementBasis: z.enum(MEASUREMENT_BASES),
  sectionRef: z.string().min(1),
  definedTermRefs: z.array(z.string()).default([]),
  /** MODELED for a normal PERMISSIONS-stage proposal; KNOWN_NOT_MODELED for a COVERAGE-stage gap placeholder. */
  modelingStatus: z.enum(MODELING_STATUSES).default("MODELED"),
});

export const CollateralScopeValueSchema = z.object({
  permissionRef: z.string().min(1),
  collateralPoolName: z.string().min(1),
  priorityTier: z.enum(PRIORITY_TIERS),
  pariPassuWithGroupId: z.string().optional(),
  intercreditorAgreementName: z.string().optional(),
  sourceSectionRef: z.string().min(1),
});

export const RelationshipValueSchema = z.object({
  relationshipType: z.enum(STACKING_RELATIONSHIP_TYPES),
  fromPermissionRef: z.string().min(1),
  toPermissionRef: z.string().min(1),
  groupKey: z.string().optional(),
  parameter: z.record(z.string(), z.unknown()).optional(),
  sourceSectionRef: z.string().min(1),
});

export const SharedConstraintValueSchema = z.object({
  name: z.string().min(1),
  capAmount: z.number().optional(),
  capFormulaType: z.enum(FORMULA_TYPES).optional(),
  capParams: z.record(z.string(), z.unknown()).optional(),
  aggregationRule: z.enum(AGGREGATION_RULES),
  measurementBasis: z.enum(MEASUREMENT_BASES),
  followsRefinancing: z.boolean().default(false),
  sourceSectionRef: z.string().min(1),
  memberPermissionRefs: z.array(z.string()).default([]),
});

export const ActivationConditionValueSchema = z.object({
  permissionRef: z.string().optional(),
  covenantSectionRefs: z.array(z.string()).default([]),
  companyWide: z.boolean().default(false),
  predicateKind: z.enum(PREDICATE_KINDS),
  predicateConfig: z.record(z.string(), z.unknown()),
  effect: z.enum(RULE_ACTIVATION_EFFECTS),
  parameterName: z.string().optional(),
  reversionPredicateConfig: z.record(z.string(), z.unknown()).optional(),
  sourceSectionRef: z.string().min(1),
});

export const DocumentRelationshipValueSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  /** A human-readable reference to the document this one supersedes (e.g. its name), not a database id - Phase 2's review UI resolves it. */
  supersedesDocumentRef: z.string().optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  articleOutline: z
    .array(
      z.object({
        articleRef: z.string().optional(),
        sectionRef: z.string().optional(),
        heading: z.string().min(1),
      })
    )
    .default([]),
});

export const ExternalInputRequirementValueSchema = z.object({
  kind: z.enum(EXTERNAL_INPUT_KINDS),
  name: z.string().min(1),
  description: z.string().min(1),
  sourceRef: z.string().optional(),
  maxAgeDays: z.number().int().positive().optional(),
});

// Autonomous information retrieval, Phase A
// (docs/autonomous-retrieval-phase-a-foundation.md). A financial fact
// discovered/uploaded through a source connector (lib/connectors/**) becomes
// an ExtractionCandidate of kind FINANCIAL_FACT with a proposedValue matching
// this shape - the same reuse-the-ontology decision every other candidate
// kind above already follows: no parallel review/audit table, no bespoke
// promotion path. `metricName` is a free string (not an enum) matching
// SourcePriorityRule.metricName's own free-string convention - the set of
// financial metrics this pipeline cares about is expected to grow without a
// schema change.
export const FinancialFactValueSchema = z.object({
  metricName: z.string().min(1),
  value: z.number(),
  asOfDate: z.string().min(1),
  unit: z.string().optional(),
  sourceRecordRef: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Proposal = provenance + kind-tagged proposedValue. One per
// ExtractionCandidateKind.
// ---------------------------------------------------------------------------

function proposalSchema<Kind extends string, Value extends z.ZodTypeAny>(kind: Kind, valueSchema: Value) {
  return SourceProvenanceSchema.extend({
    kind: z.literal(kind),
    proposedValue: valueSchema,
  });
}

export const DefinedTermProposalSchema = proposalSchema("DEFINED_TERM", DefinedTermValueSchema);
export const PermissionProposalSchema = proposalSchema("PERMISSION", PermissionValueSchema);
export const CollateralScopeProposalSchema = proposalSchema("COLLATERAL_SCOPE", CollateralScopeValueSchema);
export const RelationshipProposalSchema = proposalSchema("RELATIONSHIP", RelationshipValueSchema);
export const SharedConstraintProposalSchema = proposalSchema("SHARED_CONSTRAINT", SharedConstraintValueSchema);
export const ActivationConditionProposalSchema = proposalSchema("ACTIVATION_CONDITION", ActivationConditionValueSchema);
export const DocumentRelationshipProposalSchema = proposalSchema("DOCUMENT_RELATIONSHIP", DocumentRelationshipValueSchema);
export const ExternalInputRequirementProposalSchema = proposalSchema("EXTERNAL_INPUT_REQUIREMENT", ExternalInputRequirementValueSchema);

export type DefinedTermProposal = z.infer<typeof DefinedTermProposalSchema>;
export type PermissionProposal = z.infer<typeof PermissionProposalSchema>;
export type CollateralScopeProposal = z.infer<typeof CollateralScopeProposalSchema>;
export type RelationshipProposal = z.infer<typeof RelationshipProposalSchema>;
export type SharedConstraintProposal = z.infer<typeof SharedConstraintProposalSchema>;
export type ActivationConditionProposal = z.infer<typeof ActivationConditionProposalSchema>;
export type DocumentRelationshipProposal = z.infer<typeof DocumentRelationshipProposalSchema>;
export type ExternalInputRequirementProposal = z.infer<typeof ExternalInputRequirementProposalSchema>;

// ---------------------------------------------------------------------------
// Per-stage result envelopes - what each ContractExtractionProvider method
// must return, and what lib/extraction/run-stage.ts validates against before
// persisting anything. See prisma/schema.prisma's ExtractionCandidate model
// comment for the stage -> candidate-kind mapping this mirrors.
// ---------------------------------------------------------------------------

export const StructureStageResultSchema = z.object({
  candidates: z.array(DocumentRelationshipProposalSchema),
});
export const DefinitionsStageResultSchema = z.object({
  candidates: z.array(DefinedTermProposalSchema),
});
export const PermissionsStageResultSchema = z.object({
  candidates: z.array(z.union([PermissionProposalSchema, CollateralScopeProposalSchema])),
});
export const RelationshipsStageResultSchema = z.object({
  candidates: z.array(z.union([RelationshipProposalSchema, SharedConstraintProposalSchema, ActivationConditionProposalSchema])),
});
/** COVERAGE-stage output reuses the PERMISSION shape - see the ExtractionCandidate schema comment (KNOWN_NOT_MODELED placeholders). */
export const CoverageStageResultSchema = z.object({
  candidates: z.array(PermissionProposalSchema),
});
export const FinancialInputsStageResultSchema = z.object({
  candidates: z.array(ExternalInputRequirementProposalSchema),
});

export type StructureStageResult = z.infer<typeof StructureStageResultSchema>;
export type DefinitionsStageResult = z.infer<typeof DefinitionsStageResultSchema>;
export type PermissionsStageResult = z.infer<typeof PermissionsStageResultSchema>;
export type RelationshipsStageResult = z.infer<typeof RelationshipsStageResultSchema>;
export type CoverageStageResult = z.infer<typeof CoverageStageResultSchema>;
export type FinancialInputsStageResult = z.infer<typeof FinancialInputsStageResultSchema>;

/** Maps a proposal's `kind` discriminant to the prisma ExtractionCandidateKind enum value - both vocabularies are deliberately identical strings, this just documents/asserts that at the type level. */
export type ExtractionCandidateKindValue = z.infer<typeof DefinedTermProposalSchema>["kind"] | z.infer<typeof PermissionProposalSchema>["kind"] | z.infer<typeof CollateralScopeProposalSchema>["kind"] | z.infer<typeof RelationshipProposalSchema>["kind"] | z.infer<typeof SharedConstraintProposalSchema>["kind"] | z.infer<typeof ActivationConditionProposalSchema>["kind"] | z.infer<typeof DocumentRelationshipProposalSchema>["kind"] | z.infer<typeof ExternalInputRequirementProposalSchema>["kind"];
