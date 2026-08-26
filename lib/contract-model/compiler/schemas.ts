/**
 * Phase C per-stage structured-output schemas. Each stage gets its own
 * narrow schema (never the C0 combined ContractAnalysisResultSchema) so a
 * bounded call only asks the model for what that stage actually needs -
 * the direct fix for C0's own "single call doesn't scale" finding
 * (docs/phase-c0-analyzer-validation.md §V).
 */
import { z } from "zod";
import { CandidateDefinedTermSchema, CandidateContractRuleSchema, CandidateContractReferenceSchema, CandidateRuleRelationshipSchema } from "../types";

export const DefinitionsStageSchema = z.object({
  definedTerms: z.array(CandidateDefinedTermSchema).default([]),
});
export type DefinitionsStageOutput = z.infer<typeof DefinitionsStageSchema>;

export const PROVISION_INVENTORY_CLASSES = ["MATERIAL_RULE_CANDIDATE", "DEFINITION", "QUALITATIVE_OBLIGATION", "BOILERPLATE_NOT_APPLICABLE", "UNCERTAIN", "UNHANDLED"] as const;

export const InventoryItemSchema = z.object({
  sourceSectionRef: z.string(),
  classification: z.enum(PROVISION_INVENTORY_CLASSES),
  covenantFamilyGuess: z.string().nullable().default(null),
  summary: z.string(),
});
export const InventoryStageSchema = z.object({
  items: z.array(InventoryItemSchema).default([]),
});
export type InventoryStageOutput = z.infer<typeof InventoryStageSchema>;

export const RuleExtractionStageSchema = z.object({
  rules: z.array(CandidateContractRuleSchema).default([]),
});
export type RuleExtractionStageOutput = z.infer<typeof RuleExtractionStageSchema>;

export const ReferenceResolutionStageSchema = z.object({
  references: z.array(CandidateContractReferenceSchema).default([]),
});
export type ReferenceResolutionStageOutput = z.infer<typeof ReferenceResolutionStageSchema>;

export const RelationshipStageSchema = z.object({
  relationships: z.array(CandidateRuleRelationshipSchema).default([]),
});
export type RelationshipStageOutput = z.infer<typeof RelationshipStageSchema>;

/** Adversarial-verification verdict (task §33) - CONFIRMED / CORRECTION_PROPOSED / REVIEW_REQUIRED, never a silent mutation. */
export const VerificationVerdictSchema = z.object({
  ruleSourceSectionRef: z.string(),
  verdict: z.enum(["CONFIRMED", "CORRECTION_PROPOSED", "REVIEW_REQUIRED"]),
  reasons: z.array(z.string()).default([]),
  correctedRule: CandidateContractRuleSchema.optional(),
});
export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;

export const BatchVerificationStageSchema = z.object({
  results: z.array(VerificationVerdictSchema).default([]),
});
export type BatchVerificationStageOutput = z.infer<typeof BatchVerificationStageSchema>;
