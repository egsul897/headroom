/**
 * Compatibility mapping (task §33) - projects Coherent/Matthews' existing
 * solver-native Permission/PermissionRelationship rows into Phase B's
 * generalized ContractRule/ContractRuleRelationship SHAPE, read-only, at
 * query time. This is deliberately an ADAPTER, not a migration: "do not
 * migrate production rows prematurely if adapters/views can preserve
 * compatibility... choose the safest path" (task §33). Zero Permission rows
 * are read, written, or altered by anything in prisma/migrations/ - this
 * file only reshapes what Prisma already returns.
 *
 * See docs/contract-model-foundation-phase-b.md §U for the full value-by-
 * value mapping table this file implements.
 */
import type { ContractRuleRelationshipType, CovenantFamily, EntityClassTag, FormulaType, GrantType, ModelingStatus, Permission, PermissionRelationship, RuleActivationEffect, StackingRelationshipType, StatePredicateKind } from "@prisma/client";
import type { ContractCondition } from "./types";

/** Permission.grantType -> the CovenantFamily its projected ContractRule carries. */
export function grantTypeToCovenantFamily(grantType: GrantType): CovenantFamily {
  return grantType === "DEBT_INCURRENCE" ? "INDEBTEDNESS" : "LIENS";
}

/** Every Permission is, by construction, a QUANTITATIVE_PERMISSION under this model - it is the solver-native debt/lien capacity primitive, never a prohibition/obligation/reporting rule (those are exactly the covenant families Phase B adds that Permission never modeled). */
export const PERMISSION_RULE_TYPE = "QUANTITATIVE_PERMISSION" as const;
export const PERMISSION_EVALUATION_CLASS = "EXECUTABLE" as const;
export const PERMISSION_POSTURE = "PERMISSION" as const;

/** ModelingStatus.KNOWN_NOT_MODELED means the coverage gap is already known and flagged - projects to REVIEW_REQUIRED, never a fabricated FULLY_MODELED. */
export function modelingStatusToCoverageStatus(status: ModelingStatus): "FULLY_MODELED" | "REVIEW_REQUIRED" {
  return status === "MODELED" ? "FULLY_MODELED" : "REVIEW_REQUIRED";
}

/**
 * StackingRelationshipType -> ContractRuleRelationshipType. Preserves every
 * existing tested semantic (task §21 - "do not delete existing tested
 * semantics. Map them cleanly") rather than collapsing several old values
 * into one new one where a distinct new value exists.
 */
export const STACKING_TO_CONTRACT_RULE_RELATIONSHIP: Record<StackingRelationshipType, ContractRuleRelationshipType> = {
  CONCURRENT_DISREGARDED: "CONCURRENT_DISREGARDED",
  CONCURRENT_COUNTED: "CONCURRENT_COUNTED",
  ALTERNATIVE: "ALTERNATIVE_TO",
  MUTUALLY_EXCLUSIVE: "EXCLUDED_FROM",
  AUTOMATIC_LINKED_PERMISSION: "AUTOMATIC_LINKED_PERMISSION",
  EQUAL_AND_RATABLE_PULLUP: "ACTIVATES",
  PARAMETER_ADJUSTMENT_TRIGGER: "PARAMETER_ADJUSTMENT_TRIGGER",
  SHARED_CONSTRAINT_PARTICIPATION: "SHARES_CAPACITY_WITH",
  // UNKNOWN has no more-specific projection - stays exactly as ambiguous in
  // the new taxonomy as it was in the old one, never guessed into a
  // specific relationship the original candidate never actually asserted.
  UNKNOWN: "REQUIRES",
};

/** RuleActivationCondition.predicateKind -> the ContractConditionType its projected condition object carries. */
export function statePredicateKindToConditionType(kind: StatePredicateKind): ContractCondition["type"] {
  switch (kind) {
    case "POINT_IN_TIME":
      return "TIME_PERIOD";
    case "CONTINUITY_WINDOW":
      return "TIME_PERIOD";
    case "EVENT_TRIGGERED":
      return "OTHER_RULE_SATISFIED";
    case "USAGE_LIMITED":
      return "AMOUNT_THRESHOLD";
  }
}

/** RuleActivationEffect, unchanged in meaning, restated for documentation completeness in the compatibility table (task §33 asks for RuleActivationCondition -> ContractCondition specifically). */
export function ruleActivationEffectDescription(effect: RuleActivationEffect): string {
  switch (effect) {
    case "APPLICABILITY":
      return "Turns the associated rule on/off entirely.";
    case "PARAMETER_VALUE":
      return "Changes a parameter (e.g. a threshold) of the associated rule without changing whether it applies.";
    case "RETROACTIVE_REEXAMINATION":
      return "Requires re-examining prior determinations once triggered.";
  }
}

/** A read-only, in-memory projection of one Permission row into the shape a ContractRule for it would have - never written to the database. `sourceDocumentId`/`sourceSectionRef`/`entityScope`/`action`/`thresholdValue` all come straight from the existing row; nothing is recalculated. */
export interface ProjectedContractRuleView {
  sourceId: string;
  companyId: string;
  sourceDocumentId: string;
  covenantFamily: CovenantFamily;
  ruleType: typeof PERMISSION_RULE_TYPE;
  evaluationClass: typeof PERMISSION_EVALUATION_CLASS;
  posture: typeof PERMISSION_POSTURE;
  action: string;
  entityScope: EntityClassTag[];
  thresholdValue: number;
  formulaRef: FormulaType;
  sourceSectionRef: string;
  definedTermRefs: string[];
  coverageStatus: "FULLY_MODELED" | "REVIEW_REQUIRED";
}

export function projectPermissionAsContractRuleView(permission: Permission): ProjectedContractRuleView {
  return {
    sourceId: permission.id,
    companyId: permission.companyId,
    sourceDocumentId: permission.documentId,
    covenantFamily: grantTypeToCovenantFamily(permission.grantType),
    ruleType: PERMISSION_RULE_TYPE,
    evaluationClass: PERMISSION_EVALUATION_CLASS,
    posture: PERMISSION_POSTURE,
    action: permission.action,
    entityScope: permission.entityScope,
    thresholdValue: permission.thresholdValue.toNumber(),
    formulaRef: permission.formulaType,
    sourceSectionRef: permission.sectionRef,
    definedTermRefs: permission.definedTermRefs,
    coverageStatus: modelingStatusToCoverageStatus(permission.modelingStatus),
  };
}

export interface ProjectedContractRuleRelationshipView {
  sourceId: string;
  companyId: string;
  fromRuleSourceId: string;
  toRuleSourceId: string;
  relationshipType: ContractRuleRelationshipType;
  sourceSectionRef: string;
}

export function projectPermissionRelationshipAsContractRuleRelationshipView(relationship: PermissionRelationship): ProjectedContractRuleRelationshipView {
  return {
    sourceId: relationship.id,
    companyId: relationship.companyId,
    fromRuleSourceId: relationship.fromPermissionId,
    toRuleSourceId: relationship.toPermissionId,
    relationshipType: STACKING_TO_CONTRACT_RULE_RELATIONSHIP[relationship.relationshipType],
    sourceSectionRef: relationship.sourceSectionRef,
  };
}
