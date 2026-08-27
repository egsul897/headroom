/**
 * Phase C Stage 11 - REVIEW + PROMOTION, and the hard execution invariant
 * (task §4/§42-44). "EXTRACTED != EXECUTABLE": a rule may become EXECUTABLE
 * only after every required gate passes. This module is the single place
 * that decision is made - no other code in this compiler grants
 * executability.
 *
 * Phase 1B correction: Phase 1A found this invariant was label-based, not
 * capability-based - `EXECUTABLE` was granted merely because SOME
 * thresholdValue/formulaRef was present, never because any registered
 * deterministic evaluator actually existed for that rule's specific shape.
 * This module now asks two DIFFERENT questions, computed independently and
 * both exposed on RulePromotionDecision, because they are not the same
 * question (task §4):
 *
 *   understandingStatus - "did Headroom faithfully represent this
 *   provision's economics/dependencies?" (evaluationClass, verification,
 *   validation, dependency resolution - unchanged from before this phase).
 *
 *   calculationCapability - "does a REGISTERED deterministic evaluator
 *   exist for this rule's formula/rule shape, with every operand it needs
 *   present?" (new - see evaluator-registry.ts). Presence of a
 *   thresholdValue or a formulaRef is never sufficient on its own.
 *
 * `executabilityState` is kept as the existing combined/legacy field (its
 * three real consumers - orchestrator.ts, the recompute script, and the
 * promotion-invariant test - only ever check it against EXECUTABLE/
 * NON_EXECUTABLE_QUALITATIVE or scan reasons for substrings, so widening its
 * value set is additive, not breaking) but its EXECUTABLE value is now only
 * ever granted when BOTH dimensions above are satisfied - it can no longer
 * be true merely because a field happened to be non-empty.
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
import { computeCalculationCapability, type CalculationCapabilityState } from "./evaluator-registry";

export type ExecutabilityState =
  | "EXECUTABLE"
  | "NON_EXECUTABLE_QUALITATIVE"
  | "BLOCKED_MISSING_INPUT"
  | "BLOCKED_UNRESOLVED_DEPENDENCY"
  | "BLOCKED_REVIEW"
  | "UNSUPPORTED"
  | "MISSING_EVALUATOR"
  | "MISSING_OPERANDS";

/** Semantic-confidence dimension - "did Headroom understand this provision?" Independent of whether it can be calculated. */
export type UnderstandingStatus = "UNDERSTOOD" | "JUDGMENT_REQUIRED" | "UNSUPPORTED" | "UNRESOLVED_DEPENDENCY" | "NEEDS_REVIEW";

export interface RulePromotionDecision {
  sourceSectionRef: string;
  understandingStatus: UnderstandingStatus;
  calculationCapability: CalculationCapabilityState;
  executabilityState: ExecutabilityState;
  reviewStatus: "PENDING" | "REVIEW_REQUIRED";
  reasons: string[];
}

function normalize(ref: string): string {
  return ref.replace(/^§/, "").replace(/^Section\s+/i, "").replace(/\s+/g, "").trim();
}

/** "Did Headroom understand this provision?" - unchanged in substance from the pre-Phase-1B combined check, just no longer entangled with calculation capability. */
function computeUnderstandingStatus(rule: CandidateContractRule, verification: VerificationResult, validation: ValidationReport, unresolvedTermRefs: string[]): { status: UnderstandingStatus; reasons: string[] } {
  if (rule.evaluationClass === "UNSUPPORTED") {
    return { status: "UNSUPPORTED", reasons: ["evaluationClass is UNSUPPORTED - this rule's own semantic primitive is not representable"] };
  }
  if (rule.evaluationClass === "JUDGMENT_REQUIRED") {
    return { status: "JUDGMENT_REQUIRED", reasons: ["evaluationClass is JUDGMENT_REQUIRED - this rule requires legal judgment, not calculation"] };
  }
  if (unresolvedTermRefs.length > 0) {
    return { status: "UNRESOLVED_DEPENDENCY", reasons: [`unresolved required definition(s): ${unresolvedTermRefs.join(", ")}`] };
  }
  const norm = normalize(rule.sourceSectionRef);
  const disposition = verification.dispositions.find((d) => normalize(d.sourceSectionRef) === norm);
  const reasons: string[] = [];
  if (disposition?.llmVerdict === "REVIEW_REQUIRED" || disposition?.deterministicFlag) {
    reasons.push("failed structural or adversarial verification");
  }
  if (!validation.ok) {
    const relevantIssues = validation.issues.filter((i) => i.message.includes(rule.sourceSectionRef));
    if (relevantIssues.length > 0) reasons.push(`deterministic validation failed: ${relevantIssues.map((i) => i.rule).join(", ")}`);
  }
  if (reasons.length > 0) {
    return { status: "NEEDS_REVIEW", reasons };
  }
  return { status: "UNDERSTOOD", reasons: [] };
}

/** The hard invariant (task §4/Phase 1B §2), applied to one rule: EXECUTABLE requires BOTH understanding AND registered calculation capability - never either alone. */
export function computeRuleExecutability(rule: CandidateContractRule, verification: VerificationResult, validation: ValidationReport, unresolvedTermRefs: string[]): RulePromotionDecision {
  const understanding = computeUnderstandingStatus(rule, verification, validation, unresolvedTermRefs);
  const capability = computeCalculationCapability(rule);

  if (understanding.status === "UNSUPPORTED") {
    return { sourceSectionRef: rule.sourceSectionRef, understandingStatus: understanding.status, calculationCapability: capability.state, executabilityState: "UNSUPPORTED", reviewStatus: "REVIEW_REQUIRED", reasons: understanding.reasons };
  }
  if (understanding.status === "JUDGMENT_REQUIRED") {
    // Task §10 test 8: a registered evaluator + complete operands must never
    // override a JUDGMENT_REQUIRED classification - capability is computed
    // above for reporting/inspection, but it can never promote this rule.
    return { sourceSectionRef: rule.sourceSectionRef, understandingStatus: understanding.status, calculationCapability: capability.state, executabilityState: "NON_EXECUTABLE_QUALITATIVE", reviewStatus: "PENDING", reasons: understanding.reasons };
  }
  if (capability.state === "NOT_APPLICABLE") {
    // evaluationClass is EVENT_DRIVEN/MONITORABLE - a legitimately
    // understood non-calculation shape, unchanged from prior behavior.
    return { sourceSectionRef: rule.sourceSectionRef, understandingStatus: understanding.status, calculationCapability: capability.state, executabilityState: "NON_EXECUTABLE_QUALITATIVE", reviewStatus: "PENDING", reasons: [`evaluationClass is ${rule.evaluationClass}, not EXECUTABLE`] };
  }
  if (understanding.status === "UNRESOLVED_DEPENDENCY") {
    return { sourceSectionRef: rule.sourceSectionRef, understandingStatus: understanding.status, calculationCapability: capability.state, executabilityState: "BLOCKED_UNRESOLVED_DEPENDENCY", reviewStatus: "REVIEW_REQUIRED", reasons: understanding.reasons };
  }
  if (capability.state === "MISSING_EVALUATOR" || capability.state === "MISSING_OPERANDS") {
    return { sourceSectionRef: rule.sourceSectionRef, understandingStatus: understanding.status, calculationCapability: capability.state, executabilityState: capability.state, reviewStatus: "REVIEW_REQUIRED", reasons: [...understanding.reasons, capability.reason] };
  }
  if (understanding.status === "NEEDS_REVIEW") {
    return { sourceSectionRef: rule.sourceSectionRef, understandingStatus: understanding.status, calculationCapability: capability.state, executabilityState: "BLOCKED_REVIEW", reviewStatus: "REVIEW_REQUIRED", reasons: understanding.reasons };
  }
  if (capability.state === "EXECUTABLE_WITH_FINANCIAL_INPUTS") {
    return { sourceSectionRef: rule.sourceSectionRef, understandingStatus: understanding.status, calculationCapability: capability.state, executabilityState: "BLOCKED_MISSING_INPUT", reviewStatus: "REVIEW_REQUIRED", reasons: [capability.reason] };
  }
  // understanding.status === "UNDERSTOOD" && capability.state === "EXECUTABLE"
  return {
    sourceSectionRef: rule.sourceSectionRef,
    understandingStatus: understanding.status,
    calculationCapability: capability.state,
    executabilityState: "EXECUTABLE",
    reviewStatus: "PENDING",
    reasons: [`all gates passed: verification confirmed, deterministic validation passed, dependencies resolved, and a registered evaluator can calculate this rule (${capability.reason})`],
  };
}

export function runPromotionStage(rules: CandidateContractRule[], verification: VerificationResult, validation: ValidationReport, unresolvedByRule: Map<string, string[]>): RulePromotionDecision[] {
  return rules.map((rule) => computeRuleExecutability(rule, verification, validation, unresolvedByRule.get(rule.sourceSectionRef) ?? []));
}
