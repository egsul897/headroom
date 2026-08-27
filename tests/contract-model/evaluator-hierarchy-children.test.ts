/**
 * Phase C.1 - generic (non-FWRG/LSB-specific) regression tests for
 * evaluator.ts's hierarchy-children real-figure fallback and its guard
 * against a real false-positive this fix's first draft actually produced:
 * crediting a ground-truth entry against a completely unrelated sibling
 * basket that merely shares the same coarse section number. Both behaviors
 * are proven here with invented section refs and invented rules.
 */
import { describe, expect, it } from "vitest";
import { evaluateProvision, type GroundTruthProvisionLike } from "../../lib/contract-model/analyzer/evaluator";
import type { CandidateContractRule } from "../../lib/contract-model/types";

function rule(overrides: Partial<CandidateContractRule>): CandidateContractRule {
  return {
    covenantFamily: "RESTRICTED_PAYMENTS",
    ruleType: "PROHIBITION",
    evaluationClass: "EXECUTABLE",
    action: "PAY_DIVIDEND",
    entityScope: [],
    entityScopeExcluded: [],
    conditions: [],
    exceptions: [],
    definedTermRefs: [],
    sourceSectionRef: "9.05",
    ...overrides,
  };
}

describe("evaluateProvision hierarchy-children fallback (task's own §7 demonstrable-scoring-bug allowance)", () => {
  it("credits a grouped ground-truth entry when the exact-matched general-prohibition rule has no threshold but a genuine child sub-clause does", () => {
    const ground: GroundTruthProvisionLike = { id: "g1", sourceSectionRef: "9.05", realFigures: ["$500,000"], family: "RESTRICTED_PAYMENTS", conditionTypes: [] };
    const rules = [
      rule({ sourceSectionRef: "9.05" }), // the general prohibition - exact match, no threshold of its own
      rule({ sourceSectionRef: "9.05(d)", thresholdValue: 500000, formulaRef: "FIXED_AMOUNT", evaluationClass: "JUDGMENT_REQUIRED" }), // the real exception basket
    ];
    const result = evaluateProvision(ground, rules);
    expect(result.outcome).toBe("MATCHED_CORRECT");
  });

  it("does NOT credit a ground-truth entry against an unrelated sibling basket sharing only a coarse section number when match itself is not an exact target match", () => {
    // Ground truth targets a SPECIFIC lettered clause; the "match" found is
    // only a coarse bare-section fallback (not an exact match) - this must
    // never search for "children" of that coarse fallback, since any
    // other lettered clause under the same bare number is an unrelated
    // basket, not a genuine decomposition of the ground truth's own target.
    const ground: GroundTruthProvisionLike = { id: "g2", sourceSectionRef: "9.05(k)", realFigures: ["$9,000,000"], family: "RESTRICTED_PAYMENTS", conditionTypes: [] };
    const rules = [
      rule({ sourceSectionRef: "9.05" }), // only a coarse fallback match for "9.05(k)" - not exact
      rule({ sourceSectionRef: "9.05(z)", thresholdValue: 9000000 }), // a totally unrelated basket that happens to carry a coincidentally-matching number
    ];
    const result = evaluateProvision(ground, rules);
    expect(result.outcome).not.toBe("MATCHED_CORRECT");
    expect(result.mismatchReasons.some((r) => r.includes("no real figure matched"))).toBe(true);
  });

  it("still reports MATCHED_INCORRECT_UNFLAGGED when no child anywhere carries the real figure", () => {
    const ground: GroundTruthProvisionLike = { id: "g3", sourceSectionRef: "9.05", realFigures: ["$500,000"], family: "RESTRICTED_PAYMENTS", conditionTypes: [] };
    const rules = [rule({ sourceSectionRef: "9.05" }), rule({ sourceSectionRef: "9.05(d)", thresholdValue: 250000 })]; // wrong number even in the child
    const result = evaluateProvision(ground, rules);
    expect(result.outcome).toBe("MATCHED_INCORRECT_UNFLAGGED");
  });

  it("classifies as FLAGGED (not unflagged) when the child that resolves the real figure still has its own genuine formula mismatch and is itself self-flagged", () => {
    const ground: GroundTruthProvisionLike = { id: "g4", sourceSectionRef: "9.05", realFigures: ["$500,000"], family: "RESTRICTED_PAYMENTS", formulaRef: "FIXED_AMOUNT", conditionTypes: [] };
    // Once the child resolves the number, all remaining checks (including
    // formula) run against the CHILD, not the parent - so the child's own
    // formulaRef must genuinely mismatch for this to stay MATCHED_INCORRECT.
    const rules = [rule({ sourceSectionRef: "9.05" }), rule({ sourceSectionRef: "9.05(d)", thresholdValue: 500000, formulaRef: "OTHER", evaluationClass: "JUDGMENT_REQUIRED" })];
    const result = evaluateProvision(ground, rules);
    // the number resolves via the self-flagged child, and the child's own
    // formula still genuinely mismatches, so this must be the FLAGGED
    // bucket, never UNFLAGGED.
    expect(result.outcome).toBe("MATCHED_INCORRECT_FLAGGED");
  });
});
