/**
 * Phase C0 Task 12 - a minimal, deterministic adversarial-verification pass.
 * Independent of the analyzer that produced a rule: given the rule and the
 * raw source text, checks whether the rule's OWN cited sourceSectionRef
 * actually appears in the text, and whether the rule's own thresholdValue
 * (rendered back out as a raw number) appears within a bounded window of
 * that citation. A rule that fails this check is not corrected (this pass
 * has no way to know the right answer) - it is DOWNGRADED to
 * JUDGMENT_REQUIRED with an explicit note, converting a confident-and-wrong
 * (dangerous-unflagged) result into a flagged-and-wrong one. This is
 * deliberately generalized (any CandidateContractRule against any source
 * text), not tuned to the FWRG fixture - see
 * tests/contract-model/adversarial-verification.test.ts for the measured
 * before/after effect on the one real analyzer run this spike has.
 */
import type { CandidateContractRule } from "../types";

const WINDOW = 400;

function numberVariants(n: number): string[] {
  const variants = new Set<string>([String(n)]);
  if (Number.isInteger(n) && n >= 1000) variants.add(n.toLocaleString("en-US"));
  if (!Number.isInteger(n)) variants.add(n.toFixed(2));
  return [...variants];
}

export function verifyRuleAgainstSource(rule: CandidateContractRule, sourceText: string): CandidateContractRule {
  if (!rule.sourceSectionRef) return rule;
  const sectionIdx = sourceText.indexOf(rule.sourceSectionRef);
  if (sectionIdx === -1) {
    return { ...rule, evaluationClass: "JUDGMENT_REQUIRED", notes: `${rule.notes ?? ""} VERIFICATION_FAILED: cited section "${rule.sourceSectionRef}" not found verbatim in source text.`.trim() };
  }
  if (typeof rule.thresholdValue !== "number") return rule;

  const windowText = sourceText.slice(Math.max(0, sectionIdx - WINDOW), sectionIdx + WINDOW);
  const found = numberVariants(rule.thresholdValue).some((v) => windowText.includes(v));
  if (!found) {
    return { ...rule, evaluationClass: "JUDGMENT_REQUIRED", notes: `${rule.notes ?? ""} VERIFICATION_FAILED: thresholdValue ${rule.thresholdValue} does not appear within ${WINDOW} characters of cited section "${rule.sourceSectionRef}".`.trim() };
  }
  return rule;
}

export function verifyAllRulesAgainstSource(rules: CandidateContractRule[], sourceText: string): CandidateContractRule[] {
  return rules.map((r) => verifyRuleAgainstSource(r, sourceText));
}
