/**
 * Definition-sourced capacity kill-switch accountability (pkg-K / Available Amount pattern).
 *
 * When a permission's capacity is a DEFINED_TERM_REFERENCE (builder basket), and the
 * retrieved definition text zeros that amount while a Default continues, the compiled
 * rule must carry a NO_DEFAULT (or equivalent) condition. Dropping that condition while
 * keeping the capacity term certifies a false availability during Default.
 *
 * General mechanism — no package names, no expected amounts. Scans definition texts
 * supplied by the verifier (compiled definitions + authenticated/context definition excerpts).
 */
import type { IRCapacityExpression, IRExpression, IRRule } from "../../ir/types";
import { computeSemanticVerificationFindingId } from "./identity";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, type SemanticVerificationFinding } from "./types";

/** Definition text that zeros the named basket while a Default continues. */
const ZERO_DURING_DEFAULT_RE =
  /\bshall be zero\b[\s\S]{0,160}\bDefault\b|\bDefault\b[\s\S]{0,160}\bshall be zero\b/i;

export type DefinitionText = { termName: string; text: string };

export type KillSwitchIssue = { ruleId: string; termName: string; detail: string };

function collectDefinedTermNames(expr: IRExpression | IRCapacityExpression | null | undefined, out: Set<string>): void {
  if (!expr || typeof expr !== "object") return;
  if (expr.kind === "DEFINED_TERM_REFERENCE" && "termName" in expr && typeof expr.termName === "string" && expr.termName.trim()) {
    out.add(expr.termName.trim());
  }
  if (expr.kind === "UNLIMITED_CAPACITY") {
    collectDefinedTermNames(expr.gatedBy ?? null, out);
    return;
  }
  if ("operands" in expr && Array.isArray(expr.operands)) for (const op of expr.operands) collectDefinedTermNames(op, out);
  if ("left" in expr && expr.left) collectDefinedTermNames(expr.left, out);
  if ("right" in expr && expr.right) collectDefinedTermNames(expr.right, out);
  if ("operand" in expr && expr.operand) collectDefinedTermNames(expr.operand, out);
}

function ruleCapacityTermNames(rule: IRRule): string[] {
  const names = new Set<string>();
  collectDefinedTermNames(rule.capacityExpression, names);
  return [...names];
}

function ruleCarriesNoDefaultCondition(rule: IRRule): boolean {
  return rule.conditions.some((c) => {
    if (c.conditionType === "NO_DEFAULT") return true;
    const hay = `${c.description ?? ""} ${c.provenance?.excerpt ?? ""}`;
    return /\bNO_DEFAULT\b/i.test(hay) || /\bshall be zero\b[\s\S]{0,80}\bDefault\b/i.test(hay) || /\bno Default\b/i.test(hay);
  });
}

export function definitionHasZeroDuringDefault(text: string): boolean {
  return ZERO_DURING_DEFAULT_RE.test(text);
}

/**
 * For each permission rule whose capacity references a defined term that
 * (in supplied definition texts) zeros during Default, require a NO_DEFAULT condition.
 */
export function definitionKillSwitchIssues(rules: readonly IRRule[], definitions: readonly DefinitionText[]): KillSwitchIssue[] {
  const byTerm = new Map<string, string[]>();
  for (const d of definitions) {
    const key = d.termName.trim().toLowerCase();
    if (!key) continue;
    const list = byTerm.get(key) ?? [];
    list.push(d.text);
    byTerm.set(key, list);
  }
  const issues: KillSwitchIssue[] = [];
  for (const rule of rules) {
    if (rule.posture !== "PERMISSION") continue;
    if (ruleCarriesNoDefaultCondition(rule)) continue;
    for (const term of ruleCapacityTermNames(rule)) {
      const texts = byTerm.get(term.toLowerCase()) ?? [];
      if (!texts.some((t) => definitionHasZeroDuringDefault(t))) continue;
      issues.push({
        ruleId: rule.ruleId,
        termName: term,
        detail: `capacity references "${term}" whose definition zeros the amount while a Default continues, but this rule carries no NO_DEFAULT condition`,
      });
      break;
    }
  }
  return issues;
}

export function definitionKillSwitchFindings(
  rules: readonly IRRule[],
  definitions: readonly DefinitionText[],
  ctx: { companyId: string; instrumentKey: string; sourceDocumentId: string; candidateRef: string; sourceSectionRef?: string | null },
): SemanticVerificationFinding[] {
  const citation = ctx.sourceSectionRef ?? "(unknown)";
  return definitionKillSwitchIssues(rules, definitions).map((issue) => ({
    findingId: computeSemanticVerificationFindingId(
      ctx.companyId,
      ctx.instrumentKey,
      ctx.candidateRef,
      "MISSING_CONDITION",
      issue.ruleId,
      "conditions.NO_DEFAULT",
      citation,
      SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    ),
    companyId: ctx.companyId,
    instrumentKey: ctx.instrumentKey,
    sourceDocumentId: ctx.sourceDocumentId,
    candidateRef: ctx.candidateRef,
    ruleOrDefinitionId: issue.ruleId,
    irPath: "conditions.NO_DEFAULT",
    findingType: "MISSING_CONDITION",
    severity: "MATERIAL",
    sourceEvidence: issue.detail,
    sourceCitation: citation,
    proposedIrEvidence: issue.detail,
    verifierReasoning: issue.detail,
    deterministicSignals: ["DEFINITION_ZERO_DURING_DEFAULT_CONDITION_MISSING"],
    verificationMethod: "DETERMINISTIC_ONLY",
    provider: "deterministic",
    model: "definition-kill-switch",
    verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    verifierPromptVersion: "definition-kill-switch.v1",
    resolutionStatus: "OPEN",
    createdAt: new Date().toISOString(),
  }));
}
