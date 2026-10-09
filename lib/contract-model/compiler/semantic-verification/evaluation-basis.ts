/**
 * IPV-24 — pro forma / evaluation-basis accountability.
 *
 * When operative source text requires a ratio (or other) test "after giving
 * pro forma effect" (or equivalent temporal predicate), the compiled rule that
 * carries that ratio gate must also carry `evaluationBasis.proForma` on a
 * condition. A submission that keeps the ratio COMPARE on capacity.gatedBy but
 * drops every condition node silently tests the ratio on historical figures —
 * a material condition omission. No package names and no expected amounts.
 */
import type { IRCapacityExpression, IRExpression, IRRule } from "../../ir/types";
import { computeSemanticVerificationFindingId } from "./identity";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, type SemanticVerificationFinding } from "./types";

/** Same closed vocabulary as condition-suspicion PRO_FORMA_TEMPORAL (source-only). */
const PRO_FORMA_TEMPORAL_RE =
  /\b(?:giving\s+effect\s+(?:to|thereto)|pro\s+forma\s+(?:basis|compliance|effect)|(?:immediately\s+)?(?:before|prior\s+to)\s+and\s+(?:immediately\s+)?after)\b/i;

function expressionHasRatioCompare(expr: IRExpression | null | undefined): boolean {
  if (!expr) return false;
  if (expr.kind === "COMPARE") {
    const sides = [expr.left, expr.right];
    return sides.some((side) => side?.kind === "RATIO" || side?.kind === "DEFINED_TERM_REFERENCE");
  }
  if (expr.kind === "AND" || expr.kind === "OR") {
    return (expr.operands ?? []).some((op) => expressionHasRatioCompare(op));
  }
  if (expr.kind === "NOT") return expressionHasRatioCompare(expr.operand);
  return false;
}

function capacityHasRatioGate(capacity: IRCapacityExpression | null | undefined): boolean {
  if (!capacity) return false;
  if (capacity.kind === "UNLIMITED_CAPACITY") return expressionHasRatioCompare(capacity.gatedBy);
  return expressionHasRatioCompare(capacity as IRExpression);
}

function ruleHasRatioGate(rule: IRRule): boolean {
  if (capacityHasRatioGate(rule.capacityExpression)) return true;
  return rule.conditions.some((c) => expressionHasRatioCompare(c.expression));
}

function ruleCarriesProFormaBasis(rule: IRRule): boolean {
  return rule.conditions.some((c) => c.evaluationBasis?.proForma === true);
}

export function sourceRequiresProFormaBasis(sourceText: string): boolean {
  return PRO_FORMA_TEMPORAL_RE.test(sourceText);
}

export type EvaluationBasisIssue = {
  ruleId: string;
  detail: string;
};

/**
 * For each permission rule with a ratio gate, if the candidate's operative
 * source text requires a pro forma evaluation basis and no condition on that
 * rule carries evaluationBasis.proForma, emit an issue.
 */
export function evaluationBasisIssues(sourceText: string, rules: readonly IRRule[]): EvaluationBasisIssue[] {
  if (!sourceRequiresProFormaBasis(sourceText)) return [];
  const issues: EvaluationBasisIssue[] = [];
  for (const rule of rules) {
    if (rule.posture !== "PERMISSION") continue;
    if (!ruleHasRatioGate(rule)) continue;
    if (ruleCarriesProFormaBasis(rule)) continue;
    issues.push({
      ruleId: rule.ruleId,
      detail: "source requires a pro forma / giving-effect evaluation basis on the ratio test, but no condition on this rule carries evaluationBasis.proForma",
    });
  }
  return issues;
}

export function evaluationBasisFindings(
  sourceText: string,
  rules: readonly IRRule[],
  ctx: { companyId: string; instrumentKey: string; sourceDocumentId: string; candidateRef: string; sourceSectionRef?: string | null },
): SemanticVerificationFinding[] {
  const citation = ctx.sourceSectionRef ?? "(unknown)";
  return evaluationBasisIssues(sourceText, rules).map((issue) => ({
    findingId: computeSemanticVerificationFindingId(
      ctx.companyId,
      ctx.instrumentKey,
      ctx.candidateRef,
      "MISSING_CONDITION",
      issue.ruleId,
      "evaluationBasis.proForma",
      citation,
      SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    ),
    companyId: ctx.companyId,
    instrumentKey: ctx.instrumentKey,
    sourceDocumentId: ctx.sourceDocumentId,
    candidateRef: ctx.candidateRef,
    ruleOrDefinitionId: issue.ruleId,
    irPath: "evaluationBasis.proForma",
    findingType: "MISSING_CONDITION",
    severity: "MATERIAL",
    sourceEvidence: issue.detail,
    sourceCitation: citation,
    proposedIrEvidence: issue.detail,
    verifierReasoning: issue.detail,
    deterministicSignals: ["PRO_FORMA_EVALUATION_BASIS_MISSING"],
    verificationMethod: "DETERMINISTIC_ONLY",
    provider: "deterministic",
    model: "evaluation-basis",
    verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    verifierPromptVersion: "evaluation-basis.v1",
    resolutionStatus: "OPEN",
    createdAt: new Date().toISOString(),
  }));
}
