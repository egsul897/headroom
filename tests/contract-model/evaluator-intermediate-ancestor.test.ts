/**
 * Phase 1A - generic (non-LSB-specific) regression tests for evaluator.ts's
 * two-level exact-structural-ancestry fix (findUnambiguousIntermediateAncestor).
 *
 * This resolves the lsb-6.08-subordinated-debt-payments gap: ground truth
 * targets a bare section ("6.08") with no exact extracted rule, but the
 * real economics live two structural levels down (e.g. "6.08(a)(vi)")
 * beneath a single unambiguous exact intermediate container ("6.08(a)").
 * All scenarios here use invented section refs, never FWRG/LSB-specific
 * numbers or text.
 */
import { describe, expect, it } from "vitest";
import { evaluateProvision, type GroundTruthProvisionLike } from "../../lib/contract-model/analyzer/evaluator";
import type { CandidateContractRule } from "../../lib/contract-model/types";

function rule(overrides: Partial<CandidateContractRule>): CandidateContractRule {
  return {
    covenantFamily: "INDEBTEDNESS",
    ruleType: "PROHIBITION",
    evaluationClass: "EXECUTABLE",
    action: "PREPAY_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    conditions: [],
    exceptions: [],
    definedTermRefs: [],
    sourceSectionRef: "9.08",
    ...overrides,
  };
}

describe("evaluateProvision two-level exact-structural-ancestry fix (task's own §2 requirement)", () => {
  it("1. positive: resolves a real figure two structural levels below ground truth's bare target through a single unambiguous exact intermediate container", () => {
    const ground: GroundTruthProvisionLike = { id: "g1", sourceSectionRef: "9.08", realFigures: ["$500,000"], family: "INDEBTEDNESS", formulaRef: "FIXED_AMOUNT", conditionTypes: [] };
    const rules = [
      rule({ sourceSectionRef: "9.08(a)" }), // general prohibition - no exact "9.08" rule exists at all
      rule({ sourceSectionRef: "9.08(a)(i)", evaluationClass: "JUDGMENT_REQUIRED" }), // sibling exception under the container, wrong number
      rule({ sourceSectionRef: "9.08(a)(vi)", thresholdValue: 500000, formulaRef: "FIXED_AMOUNT", evaluationClass: "JUDGMENT_REQUIRED" }), // the real basket, two levels down
      rule({ sourceSectionRef: "9.08(b)", action: "AMEND_DOCUMENT" }), // an unrelated LEAF sibling one level deep - has no children of its own, so it never competes as an "intermediate ancestor"
    ];
    const result = evaluateProvision(ground, rules);
    expect(result.outcome).toBe("MATCHED_CORRECT");
    expect(result.matchedRule?.sourceSectionRef).toBe("9.08(a)(vi)");
  });

  it("2. negative: does NOT resolve when two different one-level-deeper rules both qualify as containers (real structural ambiguity)", () => {
    const ground: GroundTruthProvisionLike = { id: "g2", sourceSectionRef: "9.08", realFigures: ["$500,000"], family: "INDEBTEDNESS", conditionTypes: [] };
    const rules = [
      rule({ sourceSectionRef: "9.08(a)" }),
      rule({ sourceSectionRef: "9.08(a)(i)", thresholdValue: 250000 }), // container 1 has children too
      rule({ sourceSectionRef: "9.08(c)" }),
      rule({ sourceSectionRef: "9.08(c)(i)", thresholdValue: 500000 }), // container 2 ALSO has children - genuinely ambiguous which branch is "the" decomposition
    ];
    const result = evaluateProvision(ground, rules);
    // must not guess between the two containers - stays unresolved/incorrect, never silently credited
    expect(result.outcome).not.toBe("MATCHED_CORRECT");
    expect(result.mismatchReasons.some((r) => r.includes("no real figure matched"))).toBe(true);
  });

  it("3. negative: does NOT resolve when the only reachable candidate is a DIFFERENT section number that merely shares a textual prefix with ground truth's target (a loose/fuzzy match), not a genuine structural descendant", () => {
    const ground: GroundTruthProvisionLike = { id: "g3", sourceSectionRef: "9.08", realFigures: ["$500,000"], family: "INDEBTEDNESS", conditionTypes: [] };
    const rules = [
      // "9.080(a)" is a DIFFERENT section ("9.080", not "9.08") that happens
      // to share "9.08" as a textual prefix - findMatch's own bare
      // startsWith fallback can still pick it as `match`, but it must never
      // be usable as this fix's intermediate ancestor, since structural
      // component parsing correctly distinguishes "9.08" from "9.080".
      rule({ sourceSectionRef: "9.080(a)" }),
      rule({ sourceSectionRef: "9.080(a)(vi)", thresholdValue: 500000 }),
    ];
    const result = evaluateProvision(ground, rules);
    expect(result.outcome).not.toBe("MATCHED_CORRECT");
    expect(result.mismatchReasons.some((r) => r.includes("no real figure matched"))).toBe(true);
  });

  it("4. existing one-level exact-match behavior (ground truth's own target IS an exact rule) remains unchanged", () => {
    const ground: GroundTruthProvisionLike = { id: "g4", sourceSectionRef: "9.08", realFigures: ["$500,000"], family: "INDEBTEDNESS", formulaRef: "FIXED_AMOUNT", conditionTypes: [] };
    const rules = [rule({ sourceSectionRef: "9.08" }), rule({ sourceSectionRef: "9.08(d)", thresholdValue: 500000, formulaRef: "FIXED_AMOUNT", evaluationClass: "JUDGMENT_REQUIRED" })];
    const result = evaluateProvision(ground, rules);
    expect(result.outcome).toBe("MATCHED_CORRECT");
    expect(result.matchedRule?.sourceSectionRef).toBe("9.08(d)");
  });

  it("5. an unrelated leaf sibling of the resolved intermediate ancestor cannot steal the match even when it coincidentally carries the right number", () => {
    const ground: GroundTruthProvisionLike = { id: "g5", sourceSectionRef: "9.08", realFigures: ["$500,000"], family: "INDEBTEDNESS", conditionTypes: [] };
    const rules = [
      rule({ sourceSectionRef: "9.08(a)" }), // the unique container - qualifies because it has a child below
      rule({ sourceSectionRef: "9.08(a)(i)", thresholdValue: 250000 }), // its real (wrong-number) child
      rule({ sourceSectionRef: "9.08(z)", thresholdValue: 500000 }), // unrelated LEAF sibling, no children of its own - never a container candidate, must not be searched
    ];
    const result = evaluateProvision(ground, rules);
    expect(result.outcome).not.toBe("MATCHED_CORRECT");
    expect(result.matchedRule?.sourceSectionRef).not.toBe("9.08(z)");
  });
});
