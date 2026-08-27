/**
 * Phase 3A - deterministic structural validation (task §30). Proves
 * structural/semantic well-formedness, NEVER legal correctness (task §30's
 * own explicit caveat, repeated here since it is the single most important
 * caveat about this module). At minimum validates: type correctness
 * (delegated to type-check.ts), expression arity, valid references, no
 * money-where-boolean/boolean-where-money style mixing, valid source
 * provenance references, valid rule dependency references, no illegal
 * unsupported-node execution status, cycle rules for relationship types
 * where a cycle is never legitimate, shared-cap references exist, and no
 * cross-company/instrument references (task §49 - mandatory isolation,
 * mirroring the same discipline already proven for the Phase 2A-2G
 * compiler pipeline's own tenant/instrument isolation tests).
 */
import type { IRCapacityExpression, IRCompilationUnit, IRDefinition, IRExpression, IRRule } from "./types";
import { validateCapacityExpressionTypes, validateExpressionTypes, type TypeIssue } from "./type-check";

export type ValidationIssueKind = "TYPE_ERROR" | "CROSS_INSTRUMENT_REFERENCE" | "DANGLING_REFERENCE" | "ILLEGAL_CYCLE" | "MALFORMED_UNSUPPORTED" | "MISSING_REQUIRED_FIELD";

export interface ValidationIssue {
  kind: ValidationIssueKind;
  ruleId?: string;
  exprId?: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
}

function typeIssuesToValidationIssues(ruleId: string, typeIssues: TypeIssue[]): ValidationIssue[] {
  return typeIssues.map((i) => ({ kind: "TYPE_ERROR" as const, ruleId, exprId: i.exprId, message: `[${i.kind}] ${i.message}` }));
}

/** Walks an expression tree collecting every reference node (METRIC_REFERENCE/DEFINED_TERM_REFERENCE/RULE_REFERENCE/LEDGER_USAGE_REFERENCE), so the caller can check each one's own companyId/instrumentKey against the owning rule's scope. */
function collectReferences(expr: IRExpression, out: IRExpression[] = []): IRExpression[] {
  out.push(expr);
  switch (expr.kind) {
    case "ADD":
    case "MULTIPLY":
    case "SUM":
    case "MAX":
    case "MIN":
    case "AND":
    case "OR":
      for (const op of expr.operands) collectReferences(op, out);
      return out;
    case "SUBTRACT":
      collectReferences(expr.left, out);
      collectReferences(expr.right, out);
      return out;
    case "DIVIDE":
      collectReferences(expr.numerator, out);
      collectReferences(expr.denominator, out);
      return out;
    case "COMPARE":
      collectReferences(expr.left, out);
      collectReferences(expr.right, out);
      return out;
    case "NOT":
      collectReferences(expr.operand, out);
      return out;
    case "IF":
      collectReferences(expr.condition, out);
      collectReferences(expr.then, out);
      if (expr.else) collectReferences(expr.else, out);
      return out;
    case "AS_OF":
    case "DURING_PERIOD":
      collectReferences(expr.value, out);
      return out;
    case "SCHEDULE":
      for (const c of expr.cases) collectReferences(c.value, out);
      if (expr.defaultValue) collectReferences(expr.defaultValue, out);
      return out;
    case "EVENT_ACTIVE":
      if (expr.triggerCondition) collectReferences(expr.triggerCondition, out);
      return out;
    default:
      return out;
  }
}

function collectCapacityReferences(capacity: IRCapacityExpression): IRExpression[] {
  if (capacity.kind === "UNLIMITED_CAPACITY") return capacity.gatedBy ? collectReferences(capacity.gatedBy) : [];
  return collectReferences(capacity);
}

/** Validates one rule in isolation: type-correctness of every expression it owns, and that every reference it makes stays inside its own company/instrument scope (task §49). Does not check cross-rule dependency existence - see validateCompilationUnit for that, which requires the full rule set. */
export function validateRule(rule: IRRule): ValidationReport {
  const issues: ValidationIssue[] = [];

  if (!rule.ruleId) issues.push({ kind: "MISSING_REQUIRED_FIELD", ruleId: rule.ruleId, message: "rule.ruleId is required" });
  if (!rule.companyId) issues.push({ kind: "MISSING_REQUIRED_FIELD", ruleId: rule.ruleId, message: "rule.companyId is required" });
  if (!rule.instrumentKey) issues.push({ kind: "MISSING_REQUIRED_FIELD", ruleId: rule.ruleId, message: "rule.instrumentKey is required" });

  const allReferences: IRExpression[] = [];
  if (rule.capacityExpression) {
    const typeIssues = validateCapacityExpressionTypes(rule.capacityExpression);
    issues.push(...typeIssuesToValidationIssues(rule.ruleId, typeIssues));
    allReferences.push(...collectCapacityReferences(rule.capacityExpression));
  }
  for (const condition of rule.conditions) {
    if (condition.expression) {
      const typeIssues = validateExpressionTypes(condition.expression);
      issues.push(...typeIssuesToValidationIssues(rule.ruleId, typeIssues));
      allReferences.push(...collectReferences(condition.expression));
    }
  }
  for (const exception of rule.exceptions) {
    for (const condition of exception.conditions) {
      if (condition.expression) {
        const typeIssues = validateExpressionTypes(condition.expression);
        issues.push(...typeIssuesToValidationIssues(rule.ruleId, typeIssues));
        allReferences.push(...collectReferences(condition.expression));
      }
    }
  }

  for (const ref of allReferences) {
    if (ref.kind === "METRIC_REFERENCE" || ref.kind === "DEFINED_TERM_REFERENCE" || ref.kind === "RULE_REFERENCE") {
      if (ref.companyId !== rule.companyId) {
        issues.push({ kind: "CROSS_INSTRUMENT_REFERENCE", ruleId: rule.ruleId, exprId: ref.exprId, message: `reference ${ref.kind} "${ref.kind === "METRIC_REFERENCE" ? ref.metricName : ref.kind === "DEFINED_TERM_REFERENCE" ? ref.termName : ref.ruleId}" has companyId "${ref.companyId}" but owning rule belongs to companyId "${rule.companyId}"` });
      } else if (ref.instrumentKey !== rule.instrumentKey) {
        issues.push({ kind: "CROSS_INSTRUMENT_REFERENCE", ruleId: rule.ruleId, exprId: ref.exprId, message: `reference ${ref.kind} "${ref.kind === "METRIC_REFERENCE" ? ref.metricName : ref.kind === "DEFINED_TERM_REFERENCE" ? ref.termName : ref.ruleId}" has instrumentKey "${ref.instrumentKey}" but owning rule belongs to instrumentKey "${rule.instrumentKey}"` });
      }
    }
    // `ref.type` is statically typed as literal `null` on IRUnsupportedExpression, so this can never fire from
    // well-typed construction code - it exists as a defensive check against data loaded from an external source
    // (JSON deserialized without going through the type system) where that guarantee cannot be assumed. Read
    // through `unknown` deliberately, since TS narrows `ref.type !== null` to `never` for the well-typed case.
    if (ref.kind === "UNSUPPORTED" && (ref as unknown as { type: unknown }).type !== null) {
      issues.push({ kind: "MALFORMED_UNSUPPORTED", ruleId: rule.ruleId, exprId: ref.exprId, message: "UnsupportedExpression.type must be null - it must never masquerade as a real, executable type" });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Validates one definition in isolation, mirroring validateRule's own type-correctness and cross-instrument-isolation checks for its calculationExpression - a definition's formalized mechanics (e.g. a builder basket's SUM/MAX tree, task §16) deserve the exact same structural scrutiny as a rule's capacityExpression, never a lesser standard just because the owning object is an IRDefinition rather than an IRRule. A null calculationExpression (an honestly-UNSUPPORTED/MISSING_CONTEXT definition, e.g. fixture 15) is valid and produces no issues - the absence of formalized mechanics is not itself a structural defect. */
export function validateDefinition(definition: IRDefinition): ValidationReport {
  const issues: ValidationIssue[] = [];

  if (!definition.definitionId) issues.push({ kind: "MISSING_REQUIRED_FIELD", message: "definition.definitionId is required" });
  if (!definition.companyId) issues.push({ kind: "MISSING_REQUIRED_FIELD", message: "definition.companyId is required" });
  if (!definition.instrumentKey) issues.push({ kind: "MISSING_REQUIRED_FIELD", message: "definition.instrumentKey is required" });

  if (definition.calculationExpression) {
    const typeIssues = validateExpressionTypes(definition.calculationExpression);
    issues.push(...typeIssues.map((i) => ({ kind: "TYPE_ERROR" as const, exprId: i.exprId, message: `[${i.kind}] ${i.message}` })));

    for (const ref of collectReferences(definition.calculationExpression)) {
      if (ref.kind === "METRIC_REFERENCE" || ref.kind === "DEFINED_TERM_REFERENCE" || ref.kind === "RULE_REFERENCE") {
        if (ref.companyId !== definition.companyId) {
          issues.push({ kind: "CROSS_INSTRUMENT_REFERENCE", exprId: ref.exprId, message: `reference ${ref.kind} has companyId "${ref.companyId}" but owning definition "${definition.definitionId}" belongs to companyId "${definition.companyId}"` });
        } else if (ref.instrumentKey !== definition.instrumentKey) {
          issues.push({ kind: "CROSS_INSTRUMENT_REFERENCE", exprId: ref.exprId, message: `reference ${ref.kind} has instrumentKey "${ref.instrumentKey}" but owning definition "${definition.definitionId}" belongs to instrumentKey "${definition.instrumentKey}"` });
        }
      }
      if (ref.kind === "UNSUPPORTED" && (ref as unknown as { type: unknown }).type !== null) {
        issues.push({ kind: "MALFORMED_UNSUPPORTED", exprId: ref.exprId, message: "UnsupportedExpression.type must be null - it must never masquerade as a real, executable type" });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Relationship types where a cycle is never legitimate (A requires B requires A is a logical contradiction; a basket cannot feed itself). SHARES_CAPACITY_WITH/ALTERNATIVE_TO/COMBINABLE are deliberately excluded - those are naturally symmetric/mutual relationships between real, independent baskets and a cycle there is not a modeling error. */
const ACYCLIC_RELATIONSHIP_TYPES = new Set(["REQUIRES", "LIMITED_BY", "BASKET_FEEDING", "RECLASSIFIABLE_TO", "REDESIGNATES_TO"]);

/** Validates a full compilation unit: every rule individually (validateRule), every definition individually (validateDefinition), plus cross-rule concerns that require the whole rule set - dangling dependsOn/sharedCap references, and illegal cycles in relationship types where a cycle is never legitimate. */
export function validateCompilationUnit(unit: IRCompilationUnit): ValidationReport {
  const issues: ValidationIssue[] = [];
  const ruleIds = new Set(unit.rules.map((r) => r.ruleId));
  const sharedCapIds = new Set(unit.sharedCapacities.map((s) => s.sharedCapId));
  const definitionIds = new Set(unit.definitions.map((d) => d.definitionId));

  for (const rule of unit.rules) {
    const report = validateRule(rule);
    issues.push(...report.issues);

    for (const dep of rule.dependsOn) {
      if (!ruleIds.has(dep.targetRuleId)) {
        issues.push({ kind: "DANGLING_REFERENCE", ruleId: rule.ruleId, message: `dependsOn references unknown ruleId "${dep.targetRuleId}" (relationshipType ${dep.relationshipType})` });
      }
    }

    if (rule.capacityExpression) {
      for (const ref of collectCapacityReferences(rule.capacityExpression)) {
        if (ref.kind === "LEDGER_USAGE_REFERENCE") {
          if (ref.sharedCapId && !sharedCapIds.has(ref.sharedCapId)) issues.push({ kind: "DANGLING_REFERENCE", ruleId: rule.ruleId, exprId: ref.exprId, message: `LEDGER_USAGE_REFERENCE points at unknown sharedCapId "${ref.sharedCapId}"` });
          if (ref.ruleId && !ruleIds.has(ref.ruleId)) issues.push({ kind: "DANGLING_REFERENCE", ruleId: rule.ruleId, exprId: ref.exprId, message: `LEDGER_USAGE_REFERENCE points at unknown ruleId "${ref.ruleId}"` });
          if (!ref.sharedCapId && !ref.ruleId) issues.push({ kind: "MISSING_REQUIRED_FIELD", ruleId: rule.ruleId, exprId: ref.exprId, message: "LEDGER_USAGE_REFERENCE must set exactly one of sharedCapId/ruleId" });
        }
        if (ref.kind === "METRIC_REFERENCE" && ref.resolvedDefinitionId && !definitionIds.has(ref.resolvedDefinitionId)) {
          issues.push({ kind: "DANGLING_REFERENCE", ruleId: rule.ruleId, exprId: ref.exprId, message: `METRIC_REFERENCE.resolvedDefinitionId "${ref.resolvedDefinitionId}" is not a definition in this compilation unit` });
        }
        if (ref.kind === "DEFINED_TERM_REFERENCE" && ref.resolvedDefinitionId && !definitionIds.has(ref.resolvedDefinitionId)) {
          issues.push({ kind: "DANGLING_REFERENCE", ruleId: rule.ruleId, exprId: ref.exprId, message: `DEFINED_TERM_REFERENCE.resolvedDefinitionId "${ref.resolvedDefinitionId}" is not a definition in this compilation unit` });
        }
      }
    }
  }

  for (const definition of unit.definitions) {
    const report = validateDefinition(definition);
    issues.push(...report.issues);
  }

  for (const sc of unit.sharedCapacities) {
    for (const memberId of sc.memberRuleIds) {
      if (!ruleIds.has(memberId)) issues.push({ kind: "DANGLING_REFERENCE", message: `sharedCapacity "${sc.sharedCapId}" references unknown member ruleId "${memberId}"` });
    }
  }

  // Cycle detection restricted to relationship types where a cycle is never legitimate (see ACYCLIC_RELATIONSHIP_TYPES comment).
  const adjacency = new Map<string, string[]>();
  for (const rule of unit.rules) {
    for (const dep of rule.dependsOn) {
      if (!ACYCLIC_RELATIONSHIP_TYPES.has(dep.relationshipType)) continue;
      if (!adjacency.has(rule.ruleId)) adjacency.set(rule.ruleId, []);
      adjacency.get(rule.ruleId)!.push(dep.targetRuleId);
    }
  }
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const cycleRoots = new Set<string>();
  function visit(node: string, stack: string[]): void {
    color.set(node, GRAY);
    for (const next of adjacency.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        cycleRoots.add(node);
      } else if (c === WHITE) {
        visit(next, [...stack, next]);
      }
    }
    color.set(node, BLACK);
  }
  for (const ruleId of adjacency.keys()) {
    if ((color.get(ruleId) ?? WHITE) === WHITE) visit(ruleId, [ruleId]);
  }
  for (const root of cycleRoots) {
    issues.push({ kind: "ILLEGAL_CYCLE", ruleId: root, message: `rule "${root}" participates in a dependency cycle through a relationship type (REQUIRES/LIMITED_BY/BASKET_FEEDING/RECLASSIFIABLE_TO/REDESIGNATES_TO) where a cycle is never legitimate` });
  }

  return { ok: issues.length === 0, issues };
}
