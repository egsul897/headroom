/**
 * Extensible taxonomies and structured-JSON schemas for the Phase B contract
 * model (docs/contract-model-foundation-phase-b.md). Fixed, closed
 * vocabularies (CovenantFamily, ContractRuleType, RuleEvaluationClass, etc.)
 * are real Postgres enums in prisma/schema.prisma - see that file. The
 * taxonomies the originating task explicitly calls out as needing to stay
 * extensible without a migration (ContractAction, calculation-rule kind)
 * live here instead, as a TS union validated by zod at write time - the
 * exact same choice this codebase already made for
 * lib/connectors/units.ts's FinancialUnit and every kind-discriminated JSON
 * payload in lib/extraction/schemas.ts.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Action ontology (task §7). Extensible: OTHER is always a safe fallback for
// an action verb not yet in this list, so a real Phase C extraction never
// hard-fails against this schema pending a code change - it lands as OTHER,
// flagged for review, rather than being silently dropped.
// ---------------------------------------------------------------------------
export const CONTRACT_ACTIONS = [
  "INCUR_DEBT",
  "INCUR_SECURED_DEBT",
  "CREATE_LIEN",
  "PAY_DIVIDEND",
  "REPURCHASE_EQUITY",
  "PAY_JUNIOR_DEBT",
  "MAKE_INVESTMENT",
  "ACQUIRE_BUSINESS",
  "SELL_ASSET",
  "TRANSFER_ASSET",
  "ENTER_AFFILIATE_TRANSACTION",
  "MERGE",
  "CONSOLIDATE",
  "DESIGNATE_UNRESTRICTED_SUBSIDIARY",
  "REDESIGNATE_RESTRICTED_SUBSIDIARY",
  "GUARANTEE_DEBT",
  "PREPAY_DEBT",
  "DELIVER_FINANCIALS",
  "DELIVER_COMPLIANCE_CERTIFICATE",
  "DELIVER_NOTICE",
  "MAINTAIN_LIQUIDITY",
  "SATISFY_RATIO",
  "MAKE_MANDATORY_PREPAYMENT",
  "GRANT_COLLATERAL",
  "ADD_GUARANTOR",
  "CHANGE_CONTROL",
  "AMEND_DOCUMENT",
  "OBTAIN_CONSENT",
  "OTHER",
] as const;
export type ContractAction = (typeof CONTRACT_ACTIONS)[number];
export const ContractActionSchema = z.enum(CONTRACT_ACTIONS);

export function isContractAction(value: unknown): value is ContractAction {
  return typeof value === "string" && (CONTRACT_ACTIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Calculation representability (task §23) - "representability first," no
// evaluator is implemented for any of these this phase. Extensible for the
// same reason as ContractAction above.
// ---------------------------------------------------------------------------
export const CALCULATION_RULE_KINDS = [
  "FIXED_AMOUNT",
  "GREATER_OF_FLAT_OR_PCT_EBITDA",
  "LESSER_OF",
  "RATIO_DERIVED_AMOUNT",
  "BUILDER_BASKET",
  "CUMULATIVE_AMOUNT",
  "ASSET_SALE_PROCEEDS",
  "CASH_SWEEP",
  "BORROWING_BASE",
  "PREPAYMENT_BASED_AVAILABILITY",
  "CONTRIBUTION_BASED_AVAILABILITY",
  "RECLASSIFICATION_BASED_CAPACITY",
  "SHARED_CAP",
  "EXTERNAL_CERTIFIED_METRIC",
  "OTHER",
] as const;
export type CalculationRuleKind = (typeof CALCULATION_RULE_KINDS)[number];
export const CalculationRuleKindSchema = z.enum(CALCULATION_RULE_KINDS);

// ---------------------------------------------------------------------------
// Input requirement declarations (task §24) - what a rule needs to actually
// evaluate, and that input's own state. This is representation only in
// Phase B; nothing yet resolves these against real financial data.
// ---------------------------------------------------------------------------
export const INPUT_REQUIREMENT_KEYS = [
  "COVENANT_EBITDA",
  "CASH",
  "NET_DEBT",
  "SECURED_DEBT",
  "FIRST_LIEN_DEBT",
  "CONSOLIDATED_NET_INCOME",
  "ASSET_SALE_PROCEEDS",
  "EXCESS_CASH_FLOW",
  "REINVESTMENT_AMOUNT",
  "RATINGS",
  "DATE",
  "FACILITY_BALANCE",
  "PREPAYMENT_HISTORY",
  "SUBSIDIARY_CLASSIFICATION",
  "OTHER",
] as const;
export type InputRequirementKey = (typeof INPUT_REQUIREMENT_KEYS)[number];

export const InputRequirementSchema = z.object({
  key: z.enum(INPUT_REQUIREMENT_KEYS),
  // Matches the Prisma InputRequirementState enum - kept in sync by hand,
  // asserted by tests/contract-model/coverage.test.ts's own tripwire test.
  state: z.enum(["AVAILABLE", "MISSING", "STALE", "CONFLICTING", "CERTIFIED", "ESTIMATED", "REVIEW_REQUIRED"]),
  note: z.string().optional(),
});
export type InputRequirement = z.infer<typeof InputRequirementSchema>;

// ---------------------------------------------------------------------------
// Conditions / exceptions (task §22) - stored as validated JSON on
// ContractRule.conditions/exceptions ("structured fields + validated JSON
// where appropriate" per task §6, rather than a table per condition - a
// rule's condition list is read as a whole, never queried across rules by
// its individual condition fields, so relational storage would add nothing).
// ---------------------------------------------------------------------------
export const CONTRACT_CONDITION_TYPES = [
  "NO_DEFAULT",
  "RATIO_SATISFIED",
  "MINIMUM_LIQUIDITY",
  "MATERIAL_ACQUISITION",
  "RATING_STATUS",
  "ENTITY_TYPE",
  "SECURITY_SCOPE",
  "PURPOSE",
  "ACQUISITION_CONTEXT",
  "REFINANCING_CONTEXT",
  "REINVESTMENT_PERIOD",
  "TIME_PERIOD",
  "AMOUNT_THRESHOLD",
  "OTHER_RULE_SATISFIED",
  // Preserves fail-closed behavior for a condition type this schema does not
  // yet recognize (task §22's own "preserve current fail-closed behavior for
  // unsupported condition types") - UNSUPPORTED is a real, valid value here,
  // never a parse failure that would drop the condition on the floor.
  "UNSUPPORTED",
] as const;
export type ContractConditionType = (typeof CONTRACT_CONDITION_TYPES)[number];

export const ContractConditionSchema = z.object({
  type: z.enum(CONTRACT_CONDITION_TYPES),
  description: z.string(),
  parameter: z.record(z.string(), z.unknown()).optional(),
});
export type ContractCondition = z.infer<typeof ContractConditionSchema>;

export const ContractExceptionSchema = z.object({
  description: z.string(),
  sourceSectionRef: z.string().optional(),
});
export type ContractException = z.infer<typeof ContractExceptionSchema>;

// ---------------------------------------------------------------------------
// Extraction/compiler origin metadata (task §6/§28/§63) - persisted on
// ContractRule.extractionOrigin. Never chain-of-thought; mirrors the same
// provider/model/promptVersion/schemaVersion shape ExtractionRun already
// records (lib/extraction/get-provider.ts), plus a link back to whichever
// ExtractionCandidate (if any) this rule was compiled from.
// ---------------------------------------------------------------------------
export const ExtractionOriginSchema = z.object({
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  candidateId: z.string().optional(),
});
export type ExtractionOrigin = z.infer<typeof ExtractionOriginSchema>;

// ---------------------------------------------------------------------------
// Candidate schemas (task §51) - the shapes a future Phase C compiler must
// emit to be mapped into this phase's real Prisma models. Domain schemas
// only; no LLM call, no compiler implementation, lives here.
// ---------------------------------------------------------------------------
export const CandidateContractRuleSchema = z.object({
  covenantFamily: z.string(),
  ruleType: z.string(),
  evaluationClass: z.string(),
  action: ContractActionSchema,
  entityScope: z.array(z.string()).default([]),
  entityScopeExcluded: z.array(z.string()).default([]),
  beneficiary: z.string().optional(),
  thresholdValue: z.number().optional(),
  thresholdUnit: z.string().optional(),
  formulaRef: CalculationRuleKindSchema.optional(),
  operator: z.string().optional(),
  conditions: z.array(ContractConditionSchema).default([]),
  exceptions: z.array(ContractExceptionSchema).default([]),
  sourceSectionRef: z.string(),
  definedTermRefs: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type CandidateContractRule = z.infer<typeof CandidateContractRuleSchema>;

export const CandidateDefinedTermSchema = z.object({
  termName: z.string().min(1),
  sourceSectionRef: z.string().optional(),
  definitionExcerpt: z.string().optional(),
});
export type CandidateDefinedTerm = z.infer<typeof CandidateDefinedTermSchema>;

export const CandidateContractReferenceSchema = z.object({
  referenceType: z.string(),
  referenceText: z.string().min(1),
  sourceSectionRef: z.string().optional(),
  targetSectionRef: z.string().optional(),
  targetTermName: z.string().optional(),
});
export type CandidateContractReference = z.infer<typeof CandidateContractReferenceSchema>;

export const CandidateRuleRelationshipSchema = z.object({
  relationshipType: z.string(),
  fromRuleRef: z.string(),
  toRuleRef: z.string(),
  notes: z.string().optional(),
});
export type CandidateRuleRelationship = z.infer<typeof CandidateRuleRelationshipSchema>;

export const CandidateAmendmentEffectSchema = z.object({
  effectType: z.string(),
  targetRef: z.string().optional(),
  description: z.string().min(1),
  effectiveDate: z.string().optional(),
});
export type CandidateAmendmentEffect = z.infer<typeof CandidateAmendmentEffectSchema>;
