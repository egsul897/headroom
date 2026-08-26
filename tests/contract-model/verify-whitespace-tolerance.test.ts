/**
 * Phase C fix (docs/phase-c-contract-compiler-v1.md) - real evidence from
 * the LSB Industries staged compiler run showed the deterministic citation
 * check failing on nearly every rule because the real SEC-filing source
 * text (HTML-derived, double-spaced "SECTION  6.01" headers) never matches
 * a model's own single-spaced citation string byte-for-byte. This is a
 * generic, non-FWRG/non-LSB-specific unit test proving the fix
 * (findCitationIndex's whitespace-tolerant fallback) resolves this
 * generally, without weakening detection of a genuinely wrong citation.
 */
import { describe, expect, it } from "vitest";
import { verifyRuleAgainstSource } from "../../lib/contract-model/analyzer/verify";
import type { CandidateContractRule } from "../../lib/contract-model/types";

function baseRule(overrides: Partial<CandidateContractRule>): CandidateContractRule {
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
    sourceSectionRef: "Section 6.01(i)",
    thresholdValue: 70000000,
    ...overrides,
  };
}

describe("verifyRuleAgainstSource whitespace-tolerant citation matching", () => {
  it("does not downgrade a rule whose citation matches modulo extra/irregular whitespace in the source text", () => {
    const sourceText = "some preamble text SECTION  6.01(i) other Indebtedness in an aggregate amount not to exceed the greater of $70,000,000 and 5.5% of assets";
    const rule = baseRule({});
    const result = verifyRuleAgainstSource(rule, sourceText);
    expect(result.evaluationClass).toBe("EXECUTABLE");
    expect(result.notes ?? "").not.toContain("VERIFICATION_FAILED");
  });

  it("still downgrades a rule whose citation genuinely does not appear anywhere in the source text", () => {
    const sourceText = "this document has no section 6 at all, only Section 9.03";
    const rule = baseRule({});
    const result = verifyRuleAgainstSource(rule, sourceText);
    expect(result.evaluationClass).toBe("JUDGMENT_REQUIRED");
    expect(result.notes ?? "").toContain("VERIFICATION_FAILED");
  });

  it("still downgrades a rule whose threshold does not appear near a correctly-matched citation", () => {
    const sourceText = "SECTION  6.01(i)  Indebtedness in an aggregate amount not to exceed $1,000.";
    const rule = baseRule({ thresholdValue: 70000000 });
    const result = verifyRuleAgainstSource(rule, sourceText);
    expect(result.evaluationClass).toBe("JUDGMENT_REQUIRED");
    expect(result.notes ?? "").toContain("VERIFICATION_FAILED");
  });
});
