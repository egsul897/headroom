/**
 * Phase C Stage 11 - REVIEW + PROMOTION, and the hard execution invariant
 * (task §4/§42-44). "EXTRACTED != EXECUTABLE": a rule may become EXECUTABLE
 * only after every required gate passes. This module is the single place
 * that decision is made - no other code in this compiler grants
 * executability.
 *
 * Executability is a READ-TIME computed value (computeRuleExecutability),
 * not a new persisted column - the same "computed, read-time aggregation"
 * choice Phase B already made deliberately for ContractualState
 * (docs/contract-model-foundation-phase-b.md §Q: "this will later plug into
 * CanonicalCompanyState - do not duplicate financial state"). What IS
 * persisted, on the real ContractRule row, are its existing
 * reviewStatus/coverageStatus columns (task §43 - "should not silently
 * weaken governance": promotion here only ever SETS these to a more
 * conservative state than PENDING/NOT_TESTED when a gate fails; it never
 * auto-approves past the product's existing REVIEW_REQUIRED / PENDING
 * default for anything execution-relevant).
 */
import type { ValidationReport } from "../validators";
import type { VerificationResult } from "./stage-verification";
import type { CandidateContractRule } from "../types";

export type ExecutabilityState = "EXECUTABLE" | "NON_EXECUTABLE_QUALITATIVE" | "BLOCKED_MISSING_INPUT" | "BLOCKED_UNRESOLVED_DEPENDENCY" | "BLOCKED_REVIEW" | "UNSUPPORTED";

export interface RulePromotionDecision {
  sourceSectionRef: string;
  executabilityState: ExecutabilityState;
  reviewStatus: "PENDING" | "REVIEW_REQUIRED";
  reasons: string[];
}

function normalize(ref: string): string {
  return ref.replace(/^§/, "").replace(/^Section\s+/i, "").replace(/\s+/g, "").trim();
}

/** The hard invariant (task §4), applied to one rule. */
export function computeRuleExecutability(rule: CandidateContractRule, verification: VerificationResult, validation: ValidationReport, unresolvedTermRefs: string[]): RulePromotionDecision {
  const reasons: string[] = [];
  const norm = normalize(rule.sourceSectionRef);
  const disposition = verification.dispositions.find((d) => normalize(d.sourceSectionRef) === norm);

  if (rule.evaluationClass === "UNSUPPORTED") {
    return { sourceSectionRef: rule.sourceSectionRef, executabilityState: "UNSUPPORTED", reviewStatus: "REVIEW_REQUIRED", reasons: ["evaluationClass is UNSUPPORTED - this rule's own semantic primitive is not representable"] };
  }
  if (rule.evaluationClass !== "EXECUTABLE") {
    return { sourceSectionRef: rule.sourceSectionRef, executabilityState: "NON_EXECUTABLE_QUALITATIVE", reviewStatus: "PENDING", reasons: [`evaluationClass is ${rule.evaluationClass}, not EXECUTABLE`] };
  }

  if (disposition?.llmVerdict === "REVIEW_REQUIRED" || disposition?.deterministicFlag) {
    reasons.push("failed structural or adversarial verification");
  }
  if (!validation.ok) {
    const relevantIssues = validation.issues.filter((i) => i.message.includes(rule.sourceSectionRef));
    if (relevantIssues.length > 0) reasons.push(`deterministic validation failed: ${relevantIssues.map((i) => i.rule).join(", ")}`);
  }
  if (unresolvedTermRefs.length > 0) {
    return { sourceSectionRef: rule.sourceSectionRef, executabilityState: "BLOCKED_UNRESOLVED_DEPENDENCY", reviewStatus: "REVIEW_REQUIRED", reasons: [...reasons, `unresolved required definition(s): ${unresolvedTermRefs.join(", ")}`] };
  }
  if (rule.thresholdValue === undefined && rule.formulaRef === undefined) {
    return { sourceSectionRef: rule.sourceSectionRef, executabilityState: "BLOCKED_MISSING_INPUT", reviewStatus: "REVIEW_REQUIRED", reasons: [...reasons, "EXECUTABLE evaluationClass but no thresholdValue or formulaRef present to actually execute against"] };
  }
  if (reasons.length > 0) {
    return { sourceSectionRef: rule.sourceSectionRef, executabilityState: "BLOCKED_REVIEW", reviewStatus: "REVIEW_REQUIRED", reasons };
  }
  return { sourceSectionRef: rule.sourceSectionRef, executabilityState: "EXECUTABLE", reviewStatus: "PENDING", reasons: ["all gates passed: verification confirmed, deterministic validation passed, dependencies resolved, formula/threshold present"] };
}

export function runPromotionStage(rules: CandidateContractRule[], verification: VerificationResult, validation: ValidationReport, unresolvedByRule: Map<string, string[]>): RulePromotionDecision[] {
  return rules.map((rule) => computeRuleExecutability(rule, verification, validation, unresolvedByRule.get(rule.sourceSectionRef) ?? []));
}
