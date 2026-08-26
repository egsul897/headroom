/**
 * Phase C0 (docs/phase-c0-validation-spike.md) - the single structured-output
 * schema the analyzer vertical slice's real-LLM call targets. Reuses the
 * EXACT Candidate* zod schemas from lib/contract-model/types.ts (Phase B's
 * own "what a future Phase C compiler must emit" contract) - this spike
 * deliberately does not invent a parallel shape. One combined schema, one
 * call, because Task 4 asks for "the smallest real analyzer vertical slice,"
 * not a multi-stage pipeline like lib/extraction/provider.ts's six stages.
 */
import { z } from "zod";
import { CandidateContractRuleSchema, CandidateDefinedTermSchema, CandidateContractReferenceSchema, CandidateRuleRelationshipSchema } from "../types";

export const ContractAnalysisResultSchema = z.object({
  definedTerms: z.array(CandidateDefinedTermSchema).default([]),
  rules: z.array(CandidateContractRuleSchema).default([]),
  references: z.array(CandidateContractReferenceSchema).default([]),
  relationships: z.array(CandidateRuleRelationshipSchema).default([]),
});
export type ContractAnalysisResult = z.infer<typeof ContractAnalysisResultSchema>;

export interface ContractAnalyzerInput {
  /** Free text of the negative-covenants article (or equivalent) being analyzed. */
  documentText: string;
  /** Free text of the defined terms the document text depends on. */
  definitionsText: string;
}
