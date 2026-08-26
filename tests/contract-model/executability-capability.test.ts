/**
 * Phase 1B - proves the corrected executability invariant (task §2/§10):
 * EXECUTABLE requires BOTH understanding AND a registered deterministic
 * evaluator with complete operands - never either alone, and never mere
 * field presence. All scenarios use invented section refs; nothing here is
 * FWRG/LSB-specific. Tests validate observable behavior (capability/
 * executability states and reasons), never internal implementation strings.
 */
import { describe, expect, it } from "vitest";
import { computeRuleExecutability } from "../../lib/contract-model/compiler/stage-promotion";
import { computeCalculationCapability } from "../../lib/contract-model/compiler/evaluator-registry";
import { computeCovenantPosition } from "../../lib/covenant-engine";
import { COHERENT_DATA } from "../../prisma/seed-data";
import type { CandidateContractRule } from "../../lib/contract-model/types";
import type { VerificationResult } from "../../lib/contract-model/compiler/stage-verification";
import type { ValidationReport } from "../../lib/contract-model/validators";

function rule(overrides: Partial<CandidateContractRule>): CandidateContractRule {
  return {
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    conditions: [],
    exceptions: [],
    definedTermRefs: [],
    sourceSectionRef: "9.01",
    ...overrides,
  };
}

const noVerification: VerificationResult = { finalRules: [], dispositions: [], basketCompletenessResults: [] };
const passingValidation: ValidationReport = { ok: true, issues: [] };

describe("Phase 1B executability capability invariant", () => {
  it("1. presence of a threshold alone does not imply executable", () => {
    const r = rule({ thresholdValue: 50_000_000, formulaRef: undefined });
    const decision = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(decision.executabilityState).not.toBe("EXECUTABLE");
    expect(decision.calculationCapability).toBe("MISSING_EVALUATOR");
  });

  it("2. presence of a formula enum alone does not imply executable", () => {
    // GREATER_OF_FLAT_OR_PCT_EBITDA is a real, named CalculationRuleKind, and
    // a threshold is present - but no evaluator is registered for this
    // shape (it needs a percentage + metric this schema cannot represent).
    const r = rule({ thresholdValue: 70_000_000, formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA" });
    const decision = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(decision.executabilityState).not.toBe("EXECUTABLE");
    expect(decision.calculationCapability).toBe("MISSING_EVALUATOR");
  });

  it("3. unsupported OTHER formula is not executable", () => {
    const r = rule({ thresholdValue: 70_000_000, formulaRef: "OTHER", notes: "Cap is greater of $70,000,000 and 5.5% of total consolidated assets." });
    const decision = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(decision.executabilityState).not.toBe("EXECUTABLE");
    expect(decision.calculationCapability).toBe("MISSING_EVALUATOR");
  });

  it("4. missing operands prevents executability even when a registered evaluator exists for the shape", () => {
    const r = rule({ formulaRef: "FIXED_AMOUNT", thresholdValue: undefined });
    const decision = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(decision.executabilityState).toBe("MISSING_OPERANDS");
    expect(decision.calculationCapability).toBe("MISSING_OPERANDS");
  });

  it("5. missing evaluator prevents executability for a wholly unregistered rule shape", () => {
    const r = rule({ ruleType: "QUALITATIVE_OBLIGATION", formulaRef: undefined, thresholdValue: undefined });
    const decision = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(decision.executabilityState).toBe("MISSING_EVALUATOR");
    expect(decision.calculationCapability).toBe("MISSING_EVALUATOR");
  });

  it("6. a supported deterministic rule (FIXED_AMOUNT) becomes executable once its required structured operand is present", () => {
    const r = rule({ formulaRef: "FIXED_AMOUNT", thresholdValue: 50_000_000 });
    const decision = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(decision.executabilityState).toBe("EXECUTABLE");
    expect(decision.calculationCapability).toBe("EXECUTABLE");
    expect(decision.understandingStatus).toBe("UNDERSTOOD");
  });

  it("7. missing financial input is distinguishable from missing evaluator capability", () => {
    // A maintenance ratio test: the comparison itself IS a registered,
    // deterministic evaluator, and its only structured operand (the
    // threshold) is present - but it requires a LIVE ratio value this
    // compiler-only context does not supply. This must be reported
    // differently from both MISSING_EVALUATOR and plain EXECUTABLE.
    const r = rule({ ruleType: "RATIO_TEST", action: "SATISFY_RATIO", formulaRef: undefined, thresholdValue: 3.5 });
    const decision = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(decision.calculationCapability).toBe("EXECUTABLE_WITH_FINANCIAL_INPUTS");
    expect(decision.executabilityState).not.toBe("EXECUTABLE");
    expect(decision.executabilityState).not.toBe("MISSING_EVALUATOR");
    expect(decision.executabilityState).toBe("BLOCKED_MISSING_INPUT");
  });

  it("8. a judgment-required rule cannot become trusted executable merely because a registered evaluator exists and operands are complete", () => {
    const r = rule({ evaluationClass: "JUDGMENT_REQUIRED", formulaRef: "FIXED_AMOUNT", thresholdValue: 50_000_000 });
    const decision = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(decision.executabilityState).not.toBe("EXECUTABLE");
    expect(decision.understandingStatus).toBe("JUDGMENT_REQUIRED");
    // capability is still computed/inspectable independently, but never used to promote.
    expect(computeCalculationCapability(r).state).toBe("NOT_APPLICABLE");
  });

  it("9. the existing Coherent hand-curated calculation path is untouched and still computes a real position", () => {
    // Phase 1B's changes are confined to lib/contract-model/compiler/ - the
    // solver-native covenant-engine.ts path Coherent/Matthews actually use
    // in production never imports or depends on stage-promotion.ts or
    // evaluator-registry.ts. This proves that path still runs end-to-end.
    const position = computeCovenantPosition(COHERENT_DATA);
    expect(position).toBeDefined();
    expect(Number.isFinite(position.metrics.totalNetLeverage)).toBe(true);
    expect(position.provisionCapacities.size).toBeGreaterThan(0);
  });

  it("10. capability computation is deterministic and idempotent", () => {
    const r = rule({ formulaRef: "FIXED_AMOUNT", thresholdValue: 25_000_000 });
    const first = computeRuleExecutability(r, noVerification, passingValidation, []);
    const second = computeRuleExecutability(r, noVerification, passingValidation, []);
    expect(second).toEqual(first);
    const capA = computeCalculationCapability(r);
    const capB = computeCalculationCapability(r);
    expect(capB).toEqual(capA);
  });
});
