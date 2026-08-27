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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whitespace-tolerant citation search (Phase C fix,
 * docs/phase-c-contract-compiler-v1.md). Real evidence this matters: the C0
 * era's plain `sourceText.indexOf(rule.sourceSectionRef)` requires a
 * byte-for-byte match, which is fragile against real-world source-text
 * formatting variance a model's own citation string never reproduces
 * exactly - the real LSB Industries SEC filing (HTML-derived, double-spaced
 * "SECTION  6.01" headers) caused this exact check to fail for nearly every
 * rule, downgrading otherwise-correct extractions to JUDGMENT_REQUIRED en
 * masse (a real, previously-undetected robustness gap; FWRG's cleaner
 * fixture text never exposed it). Matches by collapsing all whitespace runs
 * in the citation to a flexible `\s+` gap, so "Section 6.01(i)",
 * "Section  6.01(i)", and "SECTION 6.01(i)\n" all resolve to the same
 * citation - genuinely more permissive, never more strict than the
 * original exact-match, so a real miscitation still fails exactly as before.
 */
function findCitationIndex(sourceText: string, citation: string): number {
  const exact = sourceText.indexOf(citation);
  if (exact !== -1) return exact;
  const pattern = citation
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  const match = new RegExp(pattern, "i").exec(sourceText);
  return match ? match.index : -1;
}

export function verifyRuleAgainstSource(rule: CandidateContractRule, sourceText: string): CandidateContractRule {
  if (!rule.sourceSectionRef) return rule;
  const sectionIdx = findCitationIndex(sourceText, rule.sourceSectionRef);
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
