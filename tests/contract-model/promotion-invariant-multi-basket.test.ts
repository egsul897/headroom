/**
 * Phase C.1 task §10 - explicit regression coverage proving a multi-basket
 * rule that fails the new section-level basket-completeness check cannot
 * be promoted to EXECUTABLE. Generic, invented section/rules - never
 * FWRG/LSB-specific.
 *
 * This test exercises the real integration point directly: the section-
 * level completeness check (lib/contract-model/compiler/basket-completeness.ts)
 * feeding stage-promotion.ts's real computeRuleExecutability - the exact
 * same wiring runVerificationStage/orchestrator.ts uses (see that file's
 * own "Phase C.1 - deterministic, section-level basket-completeness pass"
 * block, which downgrades evaluationClass to JUDGMENT_REQUIRED and appends
 * a MULTI_BASKET_COMPLETENESS_FAILED note on a flagged section's rules,
 * exactly reproduced here). A separate, full-orchestrator-level test would
 * additionally need a real or mocked LLM call; this test isolates the
 * PROMOTION invariant itself, which does not depend on how a rule came to
 * carry JUDGMENT_REQUIRED.
 */
import { describe, expect, it } from "vitest";
import { checkSectionBasketCompleteness } from "../../lib/contract-model/compiler/basket-completeness";
import { runPromotionStage } from "../../lib/contract-model/compiler/stage-promotion";
import { validateContractModel } from "../../lib/contract-model/validators";
import type { VerificationResult } from "../../lib/contract-model/compiler/stage-verification";
import type { CandidateContractRule } from "../../lib/contract-model/types";

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
    sourceSectionRef: "9.02",
    ...overrides,
  };
}

/** Reproduces orchestrator.ts's own "flagged section downgrades every EXECUTABLE rule under it" step, exactly, for direct testing without a full compiler run. */
function applyBasketCompletenessDowngrade(rules: CandidateContractRule[], sectionPrefix: string, sourceText: string): CandidateContractRule[] {
  const result = checkSectionBasketCompleteness(sectionPrefix, sourceText, rules);
  if (!result.flagged) return rules;
  return rules.map((r) => {
    const ref = (r.sourceSectionRef ?? "").replace(/^§/, "").replace(/^Section\s+/i, "").replace(/\s+/g, "");
    const belongs = ref === result.sectionPrefix || ref.startsWith(`${result.sectionPrefix}(`);
    if (belongs && r.evaluationClass === "EXECUTABLE") {
      return { ...r, evaluationClass: "JUDGMENT_REQUIRED", notes: `${r.notes ?? ""} MULTI_BASKET_COMPLETENESS_FAILED: section ${result.sectionPrefix} has ${result.unmatchedNumbers.length} unmatched real figure(s) and ${result.duplicatedThresholds.length} possible duplicated threshold(s).`.trim() };
    }
    return r;
  });
}

function noVerification(finalRules: CandidateContractRule[]): VerificationResult {
  return { finalRules, dispositions: [], basketCompletenessResults: [] };
}

describe("Promotion invariant: a multi-basket rule failing basket-completeness cannot be promoted (task §10)", () => {
  it("a swapped-threshold multi-basket section is downgraded and cannot be promoted to EXECUTABLE", async () => {
    const sourceText = "Section 9.02. Widgets. The Company will not, except: (a) debt not to exceed $1,000,000; (b) debt not to exceed $2,000,000.";
    // (a) and (b) swapped - a real multi-basket error the new check must catch.
    const rules: CandidateContractRule[] = [rule({ sourceSectionRef: "9.02(a)", thresholdValue: 2000000, formulaRef: "FIXED_AMOUNT" }), rule({ sourceSectionRef: "9.02(b)", thresholdValue: 1000000, formulaRef: "FIXED_AMOUNT" })];

    const downgraded = applyBasketCompletenessDowngrade(rules, "9.02", sourceText);
    expect(downgraded.every((r) => r.evaluationClass === "JUDGMENT_REQUIRED")).toBe(true);
    expect(downgraded.every((r) => (r.notes ?? "").includes("MULTI_BASKET_COMPLETENESS_FAILED"))).toBe(true);

    const validation = await validateContractModel("test-noop-company-does-not-exist");
    const decisions = runPromotionStage(downgraded, noVerification(downgraded), validation, new Map());
    expect(decisions.every((d) => d.executabilityState !== "EXECUTABLE")).toBe(true);
    expect(decisions.every((d) => d.reasons.some((r) => r.includes("JUDGMENT_REQUIRED")))).toBe(true);
  });

  it("a correctly-extracted multi-basket section is NOT downgraded and both rules remain eligible for EXECUTABLE (no false positive from the new check)", async () => {
    const sourceText = "Section 9.02. Widgets. The Company will not, except: (a) debt not to exceed $1,000,000; (b) debt not to exceed $2,000,000.";
    const rules: CandidateContractRule[] = [rule({ sourceSectionRef: "9.02(a)", thresholdValue: 1000000, formulaRef: "FIXED_AMOUNT" }), rule({ sourceSectionRef: "9.02(b)", thresholdValue: 2000000, formulaRef: "FIXED_AMOUNT" })];

    const unchanged = applyBasketCompletenessDowngrade(rules, "9.02", sourceText);
    expect(unchanged.every((r) => r.evaluationClass === "EXECUTABLE")).toBe(true);

    const validation = await validateContractModel("test-noop-company-does-not-exist");
    const decisions = runPromotionStage(unchanged, noVerification(unchanged), validation, new Map());
    expect(decisions.every((d) => d.executabilityState === "EXECUTABLE")).toBe(true);
  });
});
