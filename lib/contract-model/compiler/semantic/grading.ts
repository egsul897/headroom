/**
 * Phase 3B - IR-aware semantic grading + error taxonomy (task §43-49).
 * Deliberately NOT exact-JSON-equality grading (task §43's own "do not
 * grade only by exact JSON equality") - each dimension is compared
 * independently against a lightweight, hand-authored expectation shape,
 * and canonicalization treats operand order within MAX/MIN/AND/OR as
 * insignificant (task §44's own bounded equivalence example) while still
 * never attempting full symbolic equivalence.
 */
import { inferType } from "../../ir/type-check";
import type { IRExpression, IRRule } from "../../ir/types";
import type { SemanticCompilationResult } from "./types";

export type SemanticErrorCategory =
  | "MISSED_RULE"
  | "EXTRA_RULE"
  | "WRONG_ACTION"
  | "WRONG_POSTURE"
  | "WRONG_THRESHOLD"
  | "WRONG_PERCENT"
  | "WRONG_METRIC"
  | "WRONG_RATIO"
  | "WRONG_CONDITION"
  | "WRONG_EXCEPTION"
  | "WRONG_SCOPE"
  | "WRONG_LOGIC"
  | "WRONG_DEPENDENCY"
  | "WRONG_SHARED_CAP"
  | "WRONG_TIME_SCHEDULE"
  | "MISSING_PROVENANCE"
  | "FABRICATED_PROVENANCE"
  | "OVERCONFIDENT_COMPLETE"
  | "UNDERCONFIDENT_PARTIAL"
  | "UNSUPPORTED_BUT_FORCED"
  | "TOOL_RETRIEVAL_FAILURE"
  | "SOURCE_AMBIGUITY"
  | "GROUND_TRUTH_AMBIGUITY"
  | "OTHER";

/**
 * Task §46's own definition, applied mechanically: a material error is
 * "dangerous" exactly when the rule's own sufficiency does NOT honestly
 * surface it - i.e. the rule claims COMPLETE (or a validator found no
 * issue) while the underlying content is materially wrong. An error on a
 * rule the compiler ALREADY marked PARTIAL/AMBIGUOUS/MISSING_CONTEXT/
 * UNSUPPORTED/CONFLICTED is a real error but NOT a dangerous one - the
 * system already told the reader not to trust it.
 */
export function isDangerous(rule: IRRule | undefined, categoryIsMaterial: boolean): boolean {
  return categoryIsMaterial && rule?.sufficiency === "COMPLETE";
}

export interface SemanticErrorFinding {
  category: SemanticErrorCategory;
  /** Ground-truth identifier the finding relates to, or "compiled:<ruleId>" for an EXTRA_RULE with no ground-truth counterpart. */
  ref: string;
  detail: string;
  dangerous: boolean;
}

/** A bounded, hand-authored expectation - deliberately NOT a full IR tree (task §42 - do not force old ground truth into IR shape beyond what is semantically justified). Every field is optional; only populated fields are checked. */
export interface ExpectedRuleShape {
  ref: string;
  sourceSectionRef: string;
  expectedAction?: string;
  expectedPosture?: string;
  /** A flat dollar amount somewhere in the capacity expression, within tolerance. */
  expectedFlatAmount?: number;
  /** A percentage (fraction, e.g. 0.05) somewhere in the capacity expression. */
  expectedPercent?: number;
  /** Substring expected to appear in some METRIC_REFERENCE/DEFINED_TERM_REFERENCE name (case-insensitive). */
  expectedMetricNameContains?: string;
  /** A ratio threshold expected somewhere in the tree, within tolerance. */
  expectedRatio?: number;
  /** conditionType values expected to appear among the rule's own conditions. */
  expectedConditionTypes?: string[];
  /** True if the rule is expected to be UnlimitedCapacity (a real, uncapped-but-gated basket) rather than a dollar figure. */
  expectedUnlimitedCapacity?: boolean;
  /** True if the source is genuinely unsupported/missing-context in the ground truth itself - a COMPLETE compiled answer here is the adversarial-probe case task §46 is most worried about. */
  expectedGenuinelyUnsupported?: boolean;
}

const NUMERIC_TOLERANCE = 1e-6;

function collectLeaves(expr: IRExpression | null): IRExpression[] {
  if (!expr) return [];
  const out: IRExpression[] = [expr];
  switch (expr.kind) {
    case "ADD":
    case "MULTIPLY":
    case "SUM":
    case "MAX":
    case "MIN":
    case "AND":
    case "OR":
      for (const op of expr.operands) out.push(...collectLeaves(op));
      break;
    case "SUBTRACT":
      out.push(...collectLeaves(expr.left), ...collectLeaves(expr.right));
      break;
    case "DIVIDE":
      out.push(...collectLeaves(expr.numerator), ...collectLeaves(expr.denominator));
      break;
    case "COMPARE":
      out.push(...collectLeaves(expr.left), ...collectLeaves(expr.right));
      break;
    case "NOT":
      out.push(...collectLeaves(expr.operand));
      break;
    case "IF":
      out.push(...collectLeaves(expr.condition), ...collectLeaves(expr.then), ...(expr.else ? collectLeaves(expr.else) : []));
      break;
    case "AS_OF":
    case "DURING_PERIOD":
      out.push(...collectLeaves(expr.value));
      break;
    case "SCHEDULE":
      for (const c of expr.cases) out.push(...collectLeaves(c.value));
      if (expr.defaultValue) out.push(...collectLeaves(expr.defaultValue));
      break;
    case "EVENT_ACTIVE":
      if (expr.triggerCondition) out.push(...collectLeaves(expr.triggerCondition));
      break;
    default:
      break;
  }
  return out;
}

/** Compares one compiled IRRule against one hand-authored expectation, producing zero or more findings. Never throws on a missing field - only checks what the expectation actually specifies. */
export function gradeRule(compiled: IRRule | undefined, expected: ExpectedRuleShape): SemanticErrorFinding[] {
  const findings: SemanticErrorFinding[] = [];
  if (!compiled) {
    findings.push({ category: "MISSED_RULE", ref: expected.ref, detail: `no compiled rule found for expected §${expected.sourceSectionRef}`, dangerous: true });
    return findings;
  }

  if (expected.expectedGenuinelyUnsupported) {
    const capacityIsUnsupported = compiled.capacityExpression === null || (compiled.capacityExpression.kind === "UNSUPPORTED" && compiled.sufficiency !== "COMPLETE") || compiled.sufficiency === "UNSUPPORTED" || compiled.sufficiency === "MISSING_CONTEXT";
    if (!capacityIsUnsupported) {
      findings.push({ category: "OVERCONFIDENT_COMPLETE", ref: expected.ref, detail: `ground truth marks this a genuinely unsupported/missing-context provision, but the compiler produced sufficiency=${compiled.sufficiency}`, dangerous: isDangerous(compiled, true) });
    }
    return findings;
  }

  if (expected.expectedAction && compiled.action !== expected.expectedAction) {
    findings.push({ category: "WRONG_ACTION", ref: expected.ref, detail: `expected action ${expected.expectedAction}, got ${compiled.action}`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedPosture && compiled.posture !== expected.expectedPosture) {
    findings.push({ category: "WRONG_POSTURE", ref: expected.ref, detail: `expected posture ${expected.expectedPosture}, got ${compiled.posture}`, dangerous: isDangerous(compiled, true) });
  }

  const isUnlimited = compiled.capacityExpression?.kind === "UNLIMITED_CAPACITY";
  const leaves = collectLeaves(isUnlimited ? (compiled.capacityExpression as { gatedBy: IRExpression | null }).gatedBy : (compiled.capacityExpression as IRExpression | null));

  if (expected.expectedUnlimitedCapacity !== undefined && expected.expectedUnlimitedCapacity !== isUnlimited) {
    findings.push({ category: "WRONG_THRESHOLD", ref: expected.ref, detail: `expected UnlimitedCapacity=${expected.expectedUnlimitedCapacity}, got ${isUnlimited}`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedFlatAmount !== undefined) {
    const found = leaves.some((l) => l.kind === "MONEY" && Math.abs(l.amount - expected.expectedFlatAmount!) < NUMERIC_TOLERANCE);
    if (!found) findings.push({ category: "WRONG_THRESHOLD", ref: expected.ref, detail: `expected a MONEY leaf of ${expected.expectedFlatAmount}, none found`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedPercent !== undefined) {
    const found = leaves.some((l) => l.kind === "PERCENT" && Math.abs(l.value - expected.expectedPercent!) < NUMERIC_TOLERANCE);
    if (!found) findings.push({ category: "WRONG_PERCENT", ref: expected.ref, detail: `expected a PERCENT leaf of ${expected.expectedPercent}, none found`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedRatio !== undefined) {
    const found = leaves.some((l) => l.kind === "RATIO" && Math.abs(l.value - expected.expectedRatio!) < NUMERIC_TOLERANCE);
    if (!found) findings.push({ category: "WRONG_RATIO", ref: expected.ref, detail: `expected a RATIO leaf of ${expected.expectedRatio}, none found`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedMetricNameContains) {
    const needle = expected.expectedMetricNameContains.toLowerCase();
    const found = leaves.some((l) => (l.kind === "METRIC_REFERENCE" && l.metricName.toLowerCase().includes(needle)) || (l.kind === "DEFINED_TERM_REFERENCE" && l.termName.toLowerCase().includes(needle)));
    if (!found) findings.push({ category: "WRONG_METRIC", ref: expected.ref, detail: `expected a metric/defined-term reference containing "${expected.expectedMetricNameContains}", none found`, dangerous: isDangerous(compiled, true) });
  }
  if (expected.expectedConditionTypes) {
    for (const ct of expected.expectedConditionTypes) {
      if (!compiled.conditions.some((c) => c.conditionType === ct)) {
        findings.push({ category: "WRONG_CONDITION", ref: expected.ref, detail: `expected a condition of type ${ct}, none found`, dangerous: isDangerous(compiled, true) });
      }
    }
  }

  // Structural type-check sanity - a rule whose own capacityExpression does not type-check should never have been marked COMPLETE. normalize.ts's own enforceSufficiencyConsistency already guards this upstream (task §27), so this should never fire in practice - it exists as an independent regression check against that guarantee, not a new detection path.
  if (compiled.capacityExpression && compiled.capacityExpression.kind !== "UNLIMITED_CAPACITY" && inferType(compiled.capacityExpression) === "UNSUPPORTED" && compiled.sufficiency === "COMPLETE") {
    findings.push({ category: "OTHER", ref: expected.ref, detail: "capacityExpression does not type-check yet sufficiency is COMPLETE - the deterministic sufficiency-consistency guard should have caught this", dangerous: true });
  }

  return findings;
}

export interface GradingSummary {
  totalExpected: number;
  totalCompiled: number;
  findings: SemanticErrorFinding[];
  dangerousCount: number;
  byCategory: Record<string, number>;
  completePrecision: number | null; // of rules marked COMPLETE, what fraction had zero findings
  sufficiencyDistribution: Record<string, number>;
}

export function summarizeGrading(results: SemanticCompilationResult[], expectations: Map<string, ExpectedRuleShape>, findingsByRef: SemanticErrorFinding[]): GradingSummary {
  const allRules = results.flatMap((r) => r.rules);
  const sufficiencyDistribution: Record<string, number> = {};
  for (const rule of allRules) sufficiencyDistribution[rule.sufficiency] = (sufficiencyDistribution[rule.sufficiency] ?? 0) + 1;

  const byCategory: Record<string, number> = {};
  for (const f of findingsByRef) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;

  const completeRules = allRules.filter((r) => r.sufficiency === "COMPLETE");
  const completeRulesWithFindings = new Set(findingsByRef.filter((f) => f.dangerous).map((f) => f.ref));
  const completePrecision = completeRules.length > 0 ? (completeRules.length - completeRulesWithFindings.size) / completeRules.length : null;

  return {
    totalExpected: expectations.size,
    totalCompiled: allRules.length,
    findings: findingsByRef,
    dangerousCount: findingsByRef.filter((f) => f.dangerous).length,
    byCategory,
    completePrecision,
    sufficiencyDistribution,
  };
}
