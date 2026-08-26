/**
 * Phase C evaluator fix (task §38/§48) - generic, non-FWRG-specific unit
 * test proving evaluateProvision no longer scores a definition-shaped
 * ground-truth item MISSING when the model correctly extracted it into
 * definedTerms[] with zero corresponding rules[] entry (the real C0 gap,
 * docs/phase-c0-analyzer-validation.md §M). Uses a synthetic fixture, not
 * the real FWRG ground truth, so this proves the FIX generalizes rather
 * than merely re-confirming one already-observed case.
 */
import { describe, expect, it } from "vitest";
import { evaluateProvision, type GroundTruthProvisionLike } from "../../lib/contract-model/analyzer/evaluator";
import type { CandidateDefinedTerm } from "../../lib/contract-model/types";

const GROUND: GroundTruthProvisionLike = {
  id: "synthetic-def-1",
  sourceSectionRef: "Article 1 (Widget Amount)",
  realFigures: [],
  family: "DEFINITIONS_CALCULATION_RULES",
  conditionTypes: [],
  expectedDefinedTermName: "Widget Amount",
};

describe("evaluateProvision definedTerms[] fallback (generic, task §38/§48)", () => {
  it("scores MATCHED_CORRECT via definedTerm when no rule cites the section but a matching defined term exists", () => {
    const definedTerms: CandidateDefinedTerm[] = [{ termName: "Widget Amount", sourceSectionRef: "1.01", definitionExcerpt: "means the amount of widgets." }];
    const result = evaluateProvision(GROUND, [], definedTerms);
    expect(result.outcome).toBe("MATCHED_CORRECT");
    expect(result.matchedVia).toBe("definedTerm");
  });

  it("still scores MISSING when no rule and no matching defined term exist", () => {
    const result = evaluateProvision(GROUND, [], [{ termName: "Unrelated Term", sourceSectionRef: "1.02" }]);
    expect(result.outcome).toBe("MISSING");
  });

  it("is case-insensitive on term name matching", () => {
    const result = evaluateProvision(GROUND, [], [{ termName: "widget amount", sourceSectionRef: "1.01" }]);
    expect(result.outcome).toBe("MATCHED_CORRECT");
  });

  it("does not apply the fallback when expectedDefinedTermName is unset (a real rule-shaped provision genuinely missing stays MISSING)", () => {
    const ruleGround: GroundTruthProvisionLike = { ...GROUND, expectedDefinedTermName: undefined };
    const result = evaluateProvision(ruleGround, [], [{ termName: "Widget Amount", sourceSectionRef: "1.01" }]);
    expect(result.outcome).toBe("MISSING");
  });
});
