/**
 * Phase 3D - deterministic SemanticSignature computation (task §11-§14).
 * Pure function of an IRRule's own structure - never touches
 * companyId/instrumentKey/sourceDocumentId/sourceSectionRef (those exist on
 * IRRule for identity/provenance, not as retrieval keys - task §9's own
 * mechanical anti-memorization requirement, enforced independently by
 * semantic-precedent-independence.test.ts's own field-absence check on the
 * SemanticSignature type itself).
 *
 * No company/package/section-specific logic anywhere in this file
 * (Architecture Invariant #29) - every signal is a generic structural walk
 * over the IR that behaves identically on a rule this module has never seen.
 */
import type { IRCapacityExpression, IRExpression, IRRule, IRSharedCapacity } from "../../ir/types";
import type { SemanticSignature } from "./types";

interface WalkAccumulator {
  operatorKinds: Set<string>;
  hasRatioGate: boolean;
  hasScheduledThreshold: boolean;
  hasEventActiveStepUp: boolean;
}

function isUnlimitedCapacity(expr: IRCapacityExpression): expr is Extract<IRCapacityExpression, { kind: "UNLIMITED_CAPACITY" }> {
  return expr.kind === "UNLIMITED_CAPACITY";
}

function walkExpression(expr: IRExpression, acc: WalkAccumulator): void {
  acc.operatorKinds.add(expr.kind);
  if (expr.kind === "RATIO") acc.hasRatioGate = true;
  if (expr.kind === "SCHEDULE") acc.hasScheduledThreshold = true;
  if (expr.kind === "EVENT_ACTIVE") acc.hasEventActiveStepUp = true;

  switch (expr.kind) {
    case "MONEY":
    case "NUMBER":
    case "PERCENT":
    case "RATIO":
    case "BOOLEAN_LITERAL":
    case "DATE_LITERAL":
    case "METRIC_REFERENCE":
    case "DEFINED_TERM_REFERENCE":
    case "RULE_REFERENCE":
    case "LEDGER_USAGE_REFERENCE":
    case "TRANSACTION_INPUT_REFERENCE":
    case "ENTITY_SCOPE_REFERENCE":
    case "UNSUPPORTED":
      return;
    case "ADD":
    case "MULTIPLY":
    case "MAX":
    case "MIN":
    case "SUM":
    case "AND":
    case "OR":
      for (const operand of expr.operands) walkExpression(operand, acc);
      return;
    case "SUBTRACT":
      walkExpression(expr.left, acc);
      walkExpression(expr.right, acc);
      return;
    case "DIVIDE":
      walkExpression(expr.numerator, acc);
      walkExpression(expr.denominator, acc);
      return;
    case "COMPARE":
      if (expr.left.kind === "RATIO" || expr.right.kind === "RATIO") acc.hasRatioGate = true;
      walkExpression(expr.left, acc);
      walkExpression(expr.right, acc);
      return;
    case "NOT":
      walkExpression(expr.operand, acc);
      return;
    case "IF":
      walkExpression(expr.condition, acc);
      walkExpression(expr.then, acc);
      if (expr.else) walkExpression(expr.else, acc);
      return;
    case "AS_OF":
      walkExpression(expr.value, acc);
      if (typeof expr.asOfDate !== "string") walkExpression(expr.asOfDate, acc);
      return;
    case "DURING_PERIOD":
      walkExpression(expr.value, acc);
      return;
    case "SCHEDULE":
      for (const c of expr.cases) walkExpression(c.value, acc);
      if (expr.defaultValue) walkExpression(expr.defaultValue, acc);
      return;
    case "EVENT_ACTIVE":
      if (expr.triggerCondition) walkExpression(expr.triggerCondition, acc);
      return;
    default: {
      const exhaustive: never = expr;
      throw new Error(`signature.ts walkExpression: unhandled IRExpression kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

function walkCapacityExpression(expr: IRCapacityExpression, acc: WalkAccumulator): void {
  if (isUnlimitedCapacity(expr)) {
    acc.operatorKinds.add("UNLIMITED_CAPACITY");
    if (expr.gatedBy) walkExpression(expr.gatedBy, acc);
    return;
  }
  walkExpression(expr, acc);
}

function isReclassificationRelationship(relationshipType: string): boolean {
  return relationshipType === "RECLASSIFIABLE_TO" || relationshipType === "REDESIGNATES_TO";
}

export interface ComputeSemanticSignatureOptions {
  /** Membership in a shared capacity is a rule-to-resource fact that lives on IRSharedCapacity.memberRuleIds, not on the rule itself - pass the compilation unit's shared capacities so this stays a pure, generic membership check (never a package-specific lookup). */
  sharedCapacities?: IRSharedCapacity[];
}

/**
 * Computes the retrieval-facing SemanticSignature for one IRRule (task §11).
 * Deliberately generic: two rules with entirely different metric names,
 * dollar amounts, and section numbers produce an IDENTICAL signature when
 * their compositional SHAPE matches (task §14's own "textual similarity
 * necessary but not sufficient" - this signature captures structure, never
 * literal values or identity fields).
 */
export function computeSemanticSignature(rule: IRRule, options: ComputeSemanticSignatureOptions = {}): SemanticSignature {
  const acc: WalkAccumulator = { operatorKinds: new Set(), hasRatioGate: false, hasScheduledThreshold: false, hasEventActiveStepUp: false };
  if (rule.capacityExpression) walkCapacityExpression(rule.capacityExpression, acc);
  for (const condition of rule.conditions) {
    if (condition.expression) walkExpression(condition.expression, acc);
  }

  const topLevelOperator = rule.capacityExpression ? (isUnlimitedCapacity(rule.capacityExpression) ? "UNLIMITED_CAPACITY" : rule.capacityExpression.kind) : null;

  const sharedCapacities = options.sharedCapacities ?? [];
  const hasSharedCapacity = sharedCapacities.some((sc) => sc.memberRuleIds.includes(rule.ruleId));
  const hasReclassificationDependency = rule.dependsOn.some((d) => isReclassificationRelationship(d.relationshipType));

  return {
    action: rule.action,
    posture: rule.posture,
    ruleType: rule.ruleType,
    covenantFamily: rule.covenantFamily,
    topLevelOperator,
    operatorSet: [...acc.operatorKinds].sort(),
    hasRatioGate: acc.hasRatioGate,
    hasScheduledThreshold: acc.hasScheduledThreshold,
    hasEventActiveStepUp: acc.hasEventActiveStepUp,
    conditionTypes: [...new Set(rule.conditions.map((c) => c.conditionType))].sort(),
    hasExceptions: rule.exceptions.length > 0,
    entityScopeTags: [...new Set(rule.entityScope)].sort(),
    hasSharedCapacity,
    hasReclassificationDependency,
    dependencyRelationshipTypes: [...new Set(rule.dependsOn.map((d) => d.relationshipType))].sort(),
  };
}
