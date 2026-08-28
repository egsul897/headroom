/**
 * Phase 3D - reviewer-correction model (task §27-§32). Classifies what
 * changed between a compiler's proposed IR and a human reviewer's final
 * reviewed IR, by dimension (task §27's own explicit list: missing rule,
 * action, posture, amount, percent, metric, logic, condition, exception,
 * scope, dependency, shared cap, provenance, unsupported shape).
 *
 * NOT for fine-tuning or automated learning in this phase (task §27's own
 * explicit scope limit) - this module only CLASSIFIES and CAPTURES a
 * correction as a typed record. Nothing here feeds a correction back into
 * generalization.ts or retrieval automatically; that remains a future
 * question this phase deliberately does not answer.
 *
 * Reuses computeSemanticSignature (this module's own sibling) for the
 * structural dimensions (LOGIC/CONDITION/EXCEPTION/SCOPE/DEPENDENCY/
 * SHARED_CAP) rather than re-deriving them, since a signature diff IS
 * exactly a structural-shape diff; a small dedicated literal-value walk
 * (below) is added only for the AMOUNT/PERCENT/METRIC dimensions, which
 * computeSemanticSignature deliberately abstracts away (it is retrieval-
 * facing and identity/value-blind by design - see signature.ts's own
 * header) and so cannot answer "did the dollar amount change."
 */
import { computeSemanticSignature } from "./signature";
import type { CorrectionDimension, ReviewerCorrection } from "./types";
import type { IRCapacityExpression, IRExpression, IRRule, IRSharedCapacity } from "../../ir/types";

export interface LiteralExtraction {
  amounts: number[];
  percents: number[];
  metricNames: string[];
}

function walkForLiterals(expr: IRExpression, acc: LiteralExtraction): void {
  switch (expr.kind) {
    case "MONEY":
      acc.amounts.push(expr.amount);
      return;
    case "PERCENT":
      acc.percents.push(expr.value);
      return;
    case "METRIC_REFERENCE":
      acc.metricNames.push(expr.metricName);
      return;
    case "NUMBER":
    case "RATIO":
    case "BOOLEAN_LITERAL":
    case "DATE_LITERAL":
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
      for (const operand of expr.operands) walkForLiterals(operand, acc);
      return;
    case "SUBTRACT":
      walkForLiterals(expr.left, acc);
      walkForLiterals(expr.right, acc);
      return;
    case "DIVIDE":
      walkForLiterals(expr.numerator, acc);
      walkForLiterals(expr.denominator, acc);
      return;
    case "COMPARE":
      walkForLiterals(expr.left, acc);
      walkForLiterals(expr.right, acc);
      return;
    case "NOT":
      walkForLiterals(expr.operand, acc);
      return;
    case "IF":
      walkForLiterals(expr.condition, acc);
      walkForLiterals(expr.then, acc);
      if (expr.else) walkForLiterals(expr.else, acc);
      return;
    case "AS_OF":
      walkForLiterals(expr.value, acc);
      if (typeof expr.asOfDate !== "string") walkForLiterals(expr.asOfDate, acc);
      return;
    case "DURING_PERIOD":
      walkForLiterals(expr.value, acc);
      return;
    case "SCHEDULE":
      for (const c of expr.cases) walkForLiterals(c.value, acc);
      if (expr.defaultValue) walkForLiterals(expr.defaultValue, acc);
      return;
    case "EVENT_ACTIVE":
      if (expr.triggerCondition) walkForLiterals(expr.triggerCondition, acc);
      return;
    default: {
      const exhaustive: never = expr;
      throw new Error(`corrections.ts walkForLiterals: unhandled IRExpression kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Exported for reuse by semantic/precedent-integration.ts's own "source
 * always wins" mechanical grounding check (task §16/§65(B)) - the same
 * literal-value extraction this module already needed for AMOUNT/PERCENT/
 * METRIC correction classification is exactly what that check needs too,
 * so it is shared here rather than re-implemented a third time.
 */
export function extractCapacityLiterals(expr: IRCapacityExpression | null): LiteralExtraction {
  const acc: LiteralExtraction = { amounts: [], percents: [], metricNames: [] };
  if (!expr) return acc;
  if (expr.kind === "UNLIMITED_CAPACITY") {
    if (expr.gatedBy) walkForLiterals(expr.gatedBy, acc);
    return acc;
  }
  walkForLiterals(expr, acc);
  return acc;
}

function sortedNumbers(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}
function sortedStrings(values: string[]): string[] {
  return [...values].sort();
}
function summarizeNumbers(values: number[]): string {
  return values.length > 0 ? sortedNumbers(values).join(", ") : "(none)";
}
function summarizeStrings(values: string[]): string {
  return values.length > 0 ? sortedStrings(values).join(", ") : "(none)";
}

function pushIfDiffer(corrections: ReviewerCorrection[], dimension: CorrectionDimension, description: string, proposedValue: string, reviewedValue: string, differ: boolean): void {
  if (differ) corrections.push({ dimension, description, proposedValue, reviewedValue });
}

export interface DiffRuleOptions {
  proposedSharedCapacities?: IRSharedCapacity[];
  reviewedSharedCapacities?: IRSharedCapacity[];
}

/**
 * Diffs one proposed/reviewed IRRule pair (already matched by ruleId by the
 * caller - see computeReviewerCorrections) into zero or more classified
 * corrections. A rule with no reviewer changes at all produces an empty
 * array, which is itself meaningful (task's own "reviewer approval" quality
 * signal - a rule the reviewer approved unchanged is stronger evidence than
 * one that needed correction).
 */
export function diffRule(proposed: IRRule, reviewed: IRRule, options: DiffRuleOptions = {}): ReviewerCorrection[] {
  const corrections: ReviewerCorrection[] = [];

  pushIfDiffer(corrections, "ACTION", "the compiler's proposed action differs from the reviewer's final action", String(proposed.action), String(reviewed.action), proposed.action !== reviewed.action);
  pushIfDiffer(corrections, "POSTURE", "the compiler's proposed posture differs from the reviewer's final posture", proposed.posture, reviewed.posture, proposed.posture !== reviewed.posture);

  const proposedSig = computeSemanticSignature(proposed, { sharedCapacities: options.proposedSharedCapacities });
  const reviewedSig = computeSemanticSignature(reviewed, { sharedCapacities: options.reviewedSharedCapacities });

  pushIfDiffer(
    corrections,
    "LOGIC",
    "the compiled expression's top-level operator or operator set changed",
    `${proposedSig.topLevelOperator ?? "(none)"} [${proposedSig.operatorSet.join(", ")}]`,
    `${reviewedSig.topLevelOperator ?? "(none)"} [${reviewedSig.operatorSet.join(", ")}]`,
    proposedSig.topLevelOperator !== reviewedSig.topLevelOperator || JSON.stringify(proposedSig.operatorSet) !== JSON.stringify(reviewedSig.operatorSet)
  );
  pushIfDiffer(
    corrections,
    "CONDITION",
    "the set of condition types changed",
    summarizeStrings(proposedSig.conditionTypes),
    summarizeStrings(reviewedSig.conditionTypes),
    JSON.stringify(proposedSig.conditionTypes) !== JSON.stringify(reviewedSig.conditionTypes)
  );
  pushIfDiffer(corrections, "EXCEPTION", "presence of exceptions changed", String(proposedSig.hasExceptions), String(reviewedSig.hasExceptions), proposedSig.hasExceptions !== reviewedSig.hasExceptions);
  pushIfDiffer(
    corrections,
    "SCOPE",
    "the entity scope tags changed",
    summarizeStrings(proposedSig.entityScopeTags),
    summarizeStrings(reviewedSig.entityScopeTags),
    JSON.stringify(proposedSig.entityScopeTags) !== JSON.stringify(reviewedSig.entityScopeTags)
  );
  pushIfDiffer(
    corrections,
    "DEPENDENCY",
    "the rule-to-rule dependency relationship types changed",
    summarizeStrings(proposedSig.dependencyRelationshipTypes),
    summarizeStrings(reviewedSig.dependencyRelationshipTypes),
    JSON.stringify(proposedSig.dependencyRelationshipTypes) !== JSON.stringify(reviewedSig.dependencyRelationshipTypes)
  );
  pushIfDiffer(corrections, "SHARED_CAP", "shared-capacity membership changed", String(proposedSig.hasSharedCapacity), String(reviewedSig.hasSharedCapacity), proposedSig.hasSharedCapacity !== reviewedSig.hasSharedCapacity);

  const proposedLiterals = extractCapacityLiterals(proposed.capacityExpression);
  const reviewedLiterals = extractCapacityLiterals(reviewed.capacityExpression);
  pushIfDiffer(
    corrections,
    "AMOUNT",
    "one or more dollar amounts in the capacity expression changed",
    summarizeNumbers(proposedLiterals.amounts),
    summarizeNumbers(reviewedLiterals.amounts),
    JSON.stringify(sortedNumbers(proposedLiterals.amounts)) !== JSON.stringify(sortedNumbers(reviewedLiterals.amounts))
  );
  pushIfDiffer(
    corrections,
    "PERCENT",
    "one or more percentages in the capacity expression changed",
    summarizeNumbers(proposedLiterals.percents),
    summarizeNumbers(reviewedLiterals.percents),
    JSON.stringify(sortedNumbers(proposedLiterals.percents)) !== JSON.stringify(sortedNumbers(reviewedLiterals.percents))
  );
  pushIfDiffer(
    corrections,
    "METRIC",
    "the referenced metric name(s) changed",
    summarizeStrings(proposedLiterals.metricNames),
    summarizeStrings(reviewedLiterals.metricNames),
    JSON.stringify(sortedStrings(proposedLiterals.metricNames)) !== JSON.stringify(sortedStrings(reviewedLiterals.metricNames))
  );

  const proposedCitation = proposed.provenance?.sourceCitation ?? null;
  const reviewedCitation = reviewed.provenance?.sourceCitation ?? null;
  pushIfDiffer(corrections, "PROVENANCE", "the source citation this rule is grounded in changed", proposedCitation ?? "(none)", reviewedCitation ?? "(none)", proposedCitation !== reviewedCitation);

  return corrections;
}

function summarizeRuleForCorrection(rule: IRRule): string {
  return `${rule.ruleId} (${rule.action ?? "no action"}/${rule.posture}, sourceSectionRef=${rule.sourceSectionRef ?? "(none)"})`;
}

export interface ComputeReviewerCorrectionsOptions {
  proposedSharedCapacities?: IRSharedCapacity[];
  reviewedSharedCapacities?: IRSharedCapacity[];
}

/**
 * Top-level entry point: diffs a whole proposed-vs-reviewed rule set,
 * matched by ruleId. A reviewed rule with no matching proposed ruleId is a
 * MISSING_RULE correction (the compiler failed to propose something the
 * reviewer had to add - the LSB §6.13-shaped failure mode, generalized: no
 * package/section-specific logic here, only a generic id-based set diff).
 * A proposed rule with no matching reviewed ruleId is classified
 * UNSUPPORTED_SEMANTIC_SHAPE (the reviewer removed something the compiler
 * fabricated).
 */
export function computeReviewerCorrections(proposedRules: IRRule[], reviewedRules: IRRule[], options: ComputeReviewerCorrectionsOptions = {}): ReviewerCorrection[] {
  const corrections: ReviewerCorrection[] = [];
  const proposedById = new Map(proposedRules.map((r) => [r.ruleId, r] as const));
  const reviewedById = new Map(reviewedRules.map((r) => [r.ruleId, r] as const));

  for (const reviewedRule of reviewedRules) {
    const proposedRule = proposedById.get(reviewedRule.ruleId);
    if (!proposedRule) {
      corrections.push({ dimension: "MISSING_RULE", description: "the reviewer added a rule the compiler did not propose at all", proposedValue: "(absent from proposed IR)", reviewedValue: summarizeRuleForCorrection(reviewedRule) });
      continue;
    }
    corrections.push(...diffRule(proposedRule, reviewedRule, { proposedSharedCapacities: options.proposedSharedCapacities, reviewedSharedCapacities: options.reviewedSharedCapacities }));
  }

  for (const proposedRule of proposedRules) {
    if (!reviewedById.has(proposedRule.ruleId)) {
      corrections.push({ dimension: "UNSUPPORTED_SEMANTIC_SHAPE", description: "the reviewer removed a rule the compiler had proposed as unsupported/incorrect", proposedValue: summarizeRuleForCorrection(proposedRule), reviewedValue: "(absent from reviewed IR)" });
    }
  }

  return corrections;
}
