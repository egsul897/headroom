/**
 * Phase 1B - the deterministic evaluator registry (task §5). Answers a
 * question Phase 1A found the compiler was never actually asking: "is there
 * REGISTERED CODE that can calculate this rule's specific formula/rule
 * shape, and does the structured rule carry every operand that code needs?"
 *
 * This is deliberately NOT the future full formula system (no expression
 * trees, no generic operators, no new schema fields, no migration). It is
 * only enough infrastructure to make the executability invariant truthful
 * for the rule shapes actually supported today - which, as of this phase,
 * is exactly two: a static fixed amount, and a maintenance ratio
 * comparison. Every other formula/rule shape - including both LSB
 * "greater of flat $ or % of a metric" cases found in Phase 1A - correctly
 * has NO registered evaluator, and this module says so honestly rather than
 * pretending support exists.
 *
 * Adding a new shape later means adding one more EvaluatorDefinition here;
 * it never requires touching the calling code in stage-promotion.ts.
 */
import type { CandidateContractRule } from "../types";

export type CalculationCapabilityState =
  /** Evaluator registered, every required operand present, no external live input needed - a number can be produced right now from the rule alone. */
  | "EXECUTABLE"
  /** Evaluator registered, every required operand present, but the evaluator needs a live financial/transaction input this compiler-only context does not supply - distinguishable from a missing evaluator or a missing operand. */
  | "EXECUTABLE_WITH_FINANCIAL_INPUTS"
  /** No deterministic evaluator is registered for this rule's formula/rule shape at all - the honest answer for GREATER_OF_FLAT_OR_PCT_EBITDA, RATIO_DERIVED_AMOUNT, OTHER, and everything else not listed in EVALUATOR_REGISTRY below. */
  | "MISSING_EVALUATOR"
  /** An evaluator IS registered for this shape, but the structured rule itself lacks a field that evaluator requires to run. */
  | "MISSING_OPERANDS"
  /** The rule's own evaluationClass is not a calculation shape at all (e.g. MONITORABLE, EVENT_DRIVEN) - the capability question does not apply, independent of whether the rule is well understood. */
  | "NOT_APPLICABLE";

export interface CalculationCapabilityResult {
  state: CalculationCapabilityState;
  evaluatorKey?: string;
  reason: string;
}

interface EvaluatorDefinition {
  key: string;
  description: string;
  appliesTo: (rule: CandidateContractRule) => boolean;
  operandsComplete: (rule: CandidateContractRule) => boolean;
  /** True when a correct final number additionally requires a live company/transaction input beyond what the rule itself carries (e.g. an actual ratio value) - distinct from the rule's own structured completeness. */
  requiresLiveFinancialInput: boolean;
}

/**
 * The complete set of rule/formula shapes this compiler can actually
 * calculate deterministically today. Anything not listed here has NO
 * registered evaluator - full stop. Do not add an entry "for" a shape this
 * schema cannot yet fully represent (e.g. a percentage-of-a-metric basket)
 * merely to make a benchmark case pass; that would misrepresent capability
 * exactly as the old presence-based check did.
 */
const EVALUATOR_REGISTRY: EvaluatorDefinition[] = [
  {
    key: "FIXED_AMOUNT",
    description: "A static fixed-dollar (or fixed-unit) threshold that requires no external metric - the permitted amount is the threshold itself.",
    appliesTo: (rule) => rule.formulaRef === "FIXED_AMOUNT",
    operandsComplete: (rule) => rule.thresholdValue !== undefined,
    requiresLiveFinancialInput: false,
  },
  {
    key: "RATIO_TEST",
    description: "A maintenance-covenant ratio comparison (an actual computed ratio against a fixed threshold) - the comparison itself is fully deterministic once the actual ratio value is supplied; it does not derive a permitted dollar amount.",
    appliesTo: (rule) => rule.ruleType === "RATIO_TEST",
    operandsComplete: (rule) => rule.thresholdValue !== undefined,
    requiresLiveFinancialInput: true,
  },
];

/** Evaluates a FIXED_AMOUNT rule's own permitted amount - the one shape this compiler can fully calculate with zero external input. Callers must confirm capability is EXECUTABLE before trusting this. */
export function evaluateFixedAmount(rule: CandidateContractRule): number {
  if (rule.thresholdValue === undefined) throw new Error("evaluateFixedAmount called on a rule with no thresholdValue");
  return rule.thresholdValue;
}

/** Evaluates a RATIO_TEST rule against an externally-supplied actual ratio value. `notExceed` mirrors the covenant's own direction (true for a maximum-ratio covenant, false for a minimum-ratio covenant); the comparison itself is fully deterministic. */
export function evaluateRatioTest(rule: CandidateContractRule, actualRatioValue: number, notExceed: boolean): boolean {
  if (rule.thresholdValue === undefined) throw new Error("evaluateRatioTest called on a rule with no thresholdValue");
  return notExceed ? actualRatioValue <= rule.thresholdValue : actualRatioValue >= rule.thresholdValue;
}

/**
 * The capability invariant (task §2): a rule may be reported EXECUTABLE
 * only if a deterministic evaluator is registered for its shape AND every
 * operand that evaluator needs is present in the structured rule. Presence
 * of *some* thresholdValue or formulaRef is never sufficient on its own.
 */
export function computeCalculationCapability(rule: CandidateContractRule): CalculationCapabilityResult {
  if (rule.evaluationClass !== "EXECUTABLE") {
    return { state: "NOT_APPLICABLE", reason: `evaluationClass is ${rule.evaluationClass}, not a calculation shape` };
  }
  const evaluator = EVALUATOR_REGISTRY.find((e) => e.appliesTo(rule));
  if (!evaluator) {
    const shapeDescription = rule.formulaRef ? `formulaRef ${rule.formulaRef}` : `ruleType ${rule.ruleType} with no formulaRef`;
    return { state: "MISSING_EVALUATOR", reason: `no deterministic evaluator is registered for ${shapeDescription} - the rule may be correctly understood, but this compiler cannot calculate it` };
  }
  if (!evaluator.operandsComplete(rule)) {
    return { state: "MISSING_OPERANDS", evaluatorKey: evaluator.key, reason: `evaluator "${evaluator.key}" is registered for this shape, but the structured rule is missing a required operand for it` };
  }
  if (evaluator.requiresLiveFinancialInput) {
    return { state: "EXECUTABLE_WITH_FINANCIAL_INPUTS", evaluatorKey: evaluator.key, reason: `evaluator "${evaluator.key}" is registered and all structured operands are present, but a live financial input is required to produce a final result` };
  }
  return { state: "EXECUTABLE", evaluatorKey: evaluator.key, reason: `evaluator "${evaluator.key}" is registered, all required operands are present, and no external input is required` };
}
