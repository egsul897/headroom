/**
 * Phase C0 Task 8/9 - a blind evaluator. "Blind" means: this module never
 * imports tests/fixtures/unseen-packages/**\/human-ground-truth.ts itself -
 * the ground truth is passed in by the CALLER (the test file), so the
 * evaluator's own matching/scoring logic is written and can be unit-tested
 * against synthetic fixtures without ever looking at the real answer key,
 * exactly mirroring how a legal reviewer's own answer key is kept separate
 * from the tool being graded.
 *
 * Does real semantic-field comparison per provision - covenant family,
 * formula kind, the actual dollar/percentage/ratio NUMBERS, and whether a
 * ground-truth condition (e.g. "ratio-gated") is reflected in the extracted
 * rule's conditions - not just "a rule exists that cites this section,"
 * which the task explicitly calls out as insufficient credit.
 *
 * The headline distinction (task's own core safety framing): among
 * PROVISION_MATCHED_INCORRECT outcomes, DANGEROUS_UNFLAGGED (confidently
 * wrong: EXECUTABLE evaluation class, no low-confidence signal) is reported
 * SEPARATELY from DANGEROUS_FLAGGED (wrong but the rule's own evaluationClass/
 * action/notes already say "uncertain" - JUDGMENT_REQUIRED, UNSUPPORTED,
 * action OTHER, or a notes string containing an explicit hedge). These two
 * rates are NEVER averaged together anywhere in this file.
 */
import type { CandidateContractRule, CandidateDefinedTerm } from "../types";

export type ProvisionOutcome = "MATCHED_CORRECT" | "MATCHED_INCORRECT_FLAGGED" | "MATCHED_INCORRECT_UNFLAGGED" | "MISSING";

export interface GroundTruthProvisionLike {
  id: string;
  sourceSectionRef: string;
  realFigures: string[];
  family: string;
  formulaRef?: string;
  conditionTypes: string[];
  /**
   * Phase C fix (task §38/§48) for a real, previously-measured evaluator gap
   * (docs/phase-c0-analyzer-validation.md §M): a ground-truth item that is
   * itself a defined-term definition (typically family
   * DEFINITIONS_CALCULATION_RULES) can be correctly extracted into the
   * model's definedTerms[] output with zero corresponding rules[] entry -
   * that is not a real miss. Set this to the expected term name so
   * evaluateProvision checks BOTH output arrays before declaring MISSING,
   * generalized across any document, not just FWRG.
   */
  expectedDefinedTermName?: string;
}

export interface ProvisionEvalResult {
  provisionId: string;
  sourceSectionRef: string;
  family: string;
  outcome: ProvisionOutcome;
  matchedRule?: CandidateContractRule;
  /** Which real output array actually satisfied this ground-truth item - "definedTerm" is the case task §38 requires this evaluator to no longer mis-score. */
  matchedVia?: "rule" | "definedTerm";
  mismatchReasons: string[];
}

const HEDGE_WORDS = /uncertain|not confident|ambiguous|unclear|review required|not sure|approximat/i;

function normalizeRef(ref: string): string {
  return ref
    .replace(/^§/, "")
    .replace(/^Section\s+/i, "")
    .replace(/\s+/g, "")
    .replace(/\(chapeau\)$/i, "")
    .trim();
}

function extractNumbers(strings: string[]): number[] {
  const nums: number[] = [];
  for (const s of strings) {
    for (const m of s.matchAll(/\$?([\d,]+(?:\.\d+)?)/g)) {
      const n = Number((m[1] ?? "").replace(/,/g, ""));
      if (!Number.isNaN(n) && n > 0) nums.push(n);
    }
  }
  return nums;
}

/**
 * Extracted rules that are a genuine CHILD of the ground truth's own
 * targeted provision hierarchy - i.e. their own normalized ref starts with
 * `targetPrefix` (e.g. targetPrefix "6.08" matches "6.08(a)" and
 * "6.08(a)(vi)", a real parent -> child decomposition), never merely a
 * same-bare-section-number sibling. This distinction matters: an earlier,
 * broader version of this fix matched ANY rule sharing the same leading
 * section number (e.g. "6.01"), which for a section with many unrelated
 * lettered baskets (a)-(t) could credit ground truth "6.01(j)" against a
 * completely different basket "6.01(g)"'s number by coincidence - a real
 * false-positive risk this narrower, target-anchored version avoids by
 * construction, since two distinct specific sub-clauses are never a prefix
 * of one another.
 */
function findHierarchyChildren(targetPrefix: string, rules: CandidateContractRule[]): CandidateContractRule[] {
  if (!targetPrefix) return [];
  return rules.filter((r) => {
    const ref = normalizeRef(r.sourceSectionRef ?? "");
    return ref !== targetPrefix && ref.startsWith(targetPrefix);
  });
}

function ruleIsSelfFlagged(rule: CandidateContractRule): boolean {
  if (rule.evaluationClass === "JUDGMENT_REQUIRED" || rule.evaluationClass === "UNSUPPORTED") return true;
  if (rule.action === "OTHER") return true;
  if (rule.notes && HEDGE_WORDS.test(rule.notes)) return true;
  return false;
}

/** How many optional-but-substantive fields a candidate rule actually populated - used only to break ties between two candidates citing the SAME section (see findMatch's own comment for why this arises for real). */
function completenessScore(rule: CandidateContractRule): number {
  let score = 0;
  if (rule.thresholdValue !== undefined) score++;
  if (rule.formulaRef !== undefined) score++;
  if (rule.conditions.length > 0) score++;
  if (rule.notes && rule.notes.length > 10) score++;
  return score;
}

/**
 * Finds the extracted rule whose sourceSectionRef best matches (exact, or
 * one is a prefix of the other). A real analyzer run against the unseen
 * FWRG package showed the model sometimes emits TWO candidate rules citing
 * the identical section - one a near-empty "placeholder" (no thresholdValue/
 * formulaRef, notes: "placeholder") and one fully populated with the real
 * figures - a real, generalizable analyzer-output-quality finding (see
 * docs/phase-c0-analyzer-validation.md), not unique to this document. Among
 * multiple EXACT ref matches, this prefers the more complete one rather than
 * whichever happened to appear first in the array, so a genuinely correct
 * extraction isn't graded wrong just because an emptier duplicate sorted
 * earlier.
 */
function groundTruthTargets(ground: GroundTruthProvisionLike): { target: string; targetNorm: string } {
  const target = normalizeRef(ground.sourceSectionRef.split(/[\s(]/)[0] + (ground.sourceSectionRef.match(/\([a-z]+\)/gi)?.join("") ?? ""));
  const targetNorm = normalizeRef(ground.sourceSectionRef);
  return { target, targetNorm };
}

function findMatch(ground: GroundTruthProvisionLike, rules: CandidateContractRule[]): CandidateContractRule | undefined {
  const { target, targetNorm } = groundTruthTargets(ground);
  const exactMatches: CandidateContractRule[] = [];
  let best: CandidateContractRule | undefined;
  for (const rule of rules) {
    const ruleRef = normalizeRef(rule.sourceSectionRef ?? "");
    if (!ruleRef) continue;
    if (ruleRef === targetNorm || ruleRef === target) {
      exactMatches.push(rule);
      continue;
    }
    if (targetNorm.startsWith(ruleRef) || ruleRef.startsWith(targetNorm)) best = best ?? rule;
  }
  if (exactMatches.length > 0) {
    return exactMatches.reduce((a, b) => (completenessScore(b) > completenessScore(a) ? b : a));
  }
  return best;
}

export function evaluateProvision(ground: GroundTruthProvisionLike, extractedRules: CandidateContractRule[], extractedDefinedTerms: CandidateDefinedTerm[] = []): ProvisionEvalResult {
  const match = findMatch(ground, extractedRules);
  if (!match) {
    if (ground.expectedDefinedTermName) {
      const termMatch = extractedDefinedTerms.find((t) => t.termName.toLowerCase() === ground.expectedDefinedTermName!.toLowerCase());
      if (termMatch) {
        return { provisionId: ground.id, sourceSectionRef: ground.sourceSectionRef, family: ground.family, outcome: "MATCHED_CORRECT", matchedVia: "definedTerm", mismatchReasons: [] };
      }
    }
    return { provisionId: ground.id, sourceSectionRef: ground.sourceSectionRef, family: ground.family, outcome: "MISSING", mismatchReasons: ["no extracted rule cites this section, and no matching defined term either"] };
  }

  // Phase C.1 fix (task's own §7 "demonstrable scoring bug" allowance) - a
  // real, demonstrated evaluator bug: a grouped ground-truth entry spanning
  // a real multi-clause section (e.g. "the Restricted Payments section") is
  // matched to ONE rule by findMatch, but a genuinely correct extraction
  // often DECOMPOSES a multi-basket section into several sub-clause rules -
  // a general-prohibition rule (no threshold) plus one or more correctly-
  // thresholded exception rules. Re-examining the raw persisted output for
  // every case this evaluator previously called MATCHED_INCORRECT_UNFLAGGED
  // (docs/phase-c-1-multi-basket-verification.md) showed the real dollar
  // figures, formulas, AND families were NOT lost - they were sitting in a
  // CHILD sub-clause rule (a real, generalized parent -> child decomposition,
  // e.g. ground truth "6.11" -> exact match "Section 6.11" -> child
  // "6.11(d)") the single-match design never checked. This does not touch
  // any ground-truth expected value and does not widen WHICH values count
  // as correct - it only widens WHERE in the real, already-extracted output
  // this evaluator looks for the ground truth's own already-expected data.
  //
  // Only searched when `match` is an EXACT match to the ground truth's own
  // full target reference (findMatch's own exactMatches bucket), never when
  // match came from findMatch's looser "one ref is a prefix of the other"
  // fallback. This distinction is load-bearing, proven by real evidence:
  // without it, a ground-truth entry whose own target is already more
  // specific than what the extractor found (match itself only a coarse
  // prefix guess) could spuriously credit a totally unrelated sibling
  // basket that merely shares the same coarse section number - exactly the
  // false-positive this narrowing was added to close (two distinct specific
  // sub-clauses are never a prefix of one another, so this can't recur).
  //
  // Once a genuine child is found (via a real-figure match), it becomes the
  // comparison target for family/formula/conditions too, not just the
  // number check - grading the parent's family/formula while crediting the
  // child's number would otherwise leave a real, correct decomposition
  // scored as "formula mismatch" merely because the general-prohibition
  // rule itself (correctly) carries no formula of its own.
  let comparisonRule = match;
  const groundNumbers = extractNumbers(ground.realFigures);
  if (groundNumbers.length > 0) {
    const matchNumbers = [match.thresholdValue, ...extractNumbers([match.notes ?? ""])].filter((n): n is number => typeof n === "number");
    const matchHasNumber = groundNumbers.some((gn) => matchNumbers.some((mn) => Math.abs(mn - gn) / Math.max(gn, 1) < 0.01));
    const { target, targetNorm } = groundTruthTargets(ground);
    const matchRef = normalizeRef(match.sourceSectionRef ?? "");
    const matchIsExact = matchRef === target || matchRef === targetNorm;
    if (!matchHasNumber && matchIsExact) {
      for (const child of findHierarchyChildren(matchRef, extractedRules)) {
        const childNumbers = [child.thresholdValue, ...extractNumbers([child.notes ?? ""])].filter((n): n is number => typeof n === "number");
        if (groundNumbers.some((gn) => childNumbers.some((mn) => Math.abs(mn - gn) / Math.max(gn, 1) < 0.01))) {
          comparisonRule = child;
          break;
        }
      }
    }
  }

  const reasons: string[] = [];
  if (comparisonRule.covenantFamily !== ground.family) reasons.push(`family mismatch: expected ${ground.family}, got ${comparisonRule.covenantFamily}`);
  if (ground.formulaRef && comparisonRule.formulaRef !== ground.formulaRef) reasons.push(`formula mismatch: expected ${ground.formulaRef}, got ${comparisonRule.formulaRef ?? "(none)"}`);
  if (groundNumbers.length > 0) {
    const comparisonNumbers = [comparisonRule.thresholdValue, ...extractNumbers([comparisonRule.notes ?? ""])].filter((n): n is number => typeof n === "number");
    const anyNumberMatches = groundNumbers.some((gn) => comparisonNumbers.some((mn) => Math.abs(mn - gn) / Math.max(gn, 1) < 0.01));
    if (!anyNumberMatches) reasons.push(`no real figure matched: expected one of [${groundNumbers.join(", ")}], extracted thresholdValue=${comparisonRule.thresholdValue ?? "(none)"} (checked ${match.sourceSectionRef} and its own more-specific sub-clause rules, if any)`);
  }

  if (ground.conditionTypes.includes("RATIO_SATISFIED")) {
    const hasRatioCondition = comparisonRule.conditions.some((c) => c.type === "RATIO_SATISFIED") || /ratio/i.test(comparisonRule.notes ?? "");
    if (!hasRatioCondition) reasons.push("ground truth requires a ratio-gate condition that the extracted rule does not carry");
  }
  if (ground.conditionTypes.includes("NO_DEFAULT")) {
    const hasNoDefault = comparisonRule.conditions.some((c) => c.type === "NO_DEFAULT");
    if (!hasNoDefault) reasons.push("ground truth requires a no-default condition that the extracted rule does not carry");
  }

  if (reasons.length === 0) {
    return { provisionId: ground.id, sourceSectionRef: ground.sourceSectionRef, family: ground.family, outcome: "MATCHED_CORRECT", matchedRule: comparisonRule, matchedVia: "rule", mismatchReasons: [] };
  }
  // The flag/no-flag determination tracks whichever rule actually supplied
  // the risk-relevant economic data (comparisonRule) - if that came from a
  // child sub-clause rule rather than the primary match, its own
  // evaluationClass/notes are the real signal a downstream consumer of the
  // persisted output would actually see for this real economic entity.
  const outcome: ProvisionOutcome = ruleIsSelfFlagged(comparisonRule) ? "MATCHED_INCORRECT_FLAGGED" : "MATCHED_INCORRECT_UNFLAGGED";
  return { provisionId: ground.id, sourceSectionRef: ground.sourceSectionRef, family: ground.family, outcome, matchedRule: comparisonRule, matchedVia: "rule", mismatchReasons: reasons };
}

export interface EvaluationSummary {
  total: number;
  matchedCorrect: number;
  matchedIncorrectFlagged: number;
  matchedIncorrectUnflagged: number;
  missing: number;
  dangerousUnflaggedErrorRate: number;
  dangerousFlaggedErrorRate: number;
  missingRate: number;
  precisionRecallF1ByFamily: Record<string, { truePositives: number; total: number; precision: number; recall: number; f1: number }>;
  results: ProvisionEvalResult[];
}

export function evaluateAll(groundTruth: GroundTruthProvisionLike[], extractedRules: CandidateContractRule[], extractedDefinedTerms: CandidateDefinedTerm[] = []): EvaluationSummary {
  const results = groundTruth.map((g) => evaluateProvision(g, extractedRules, extractedDefinedTerms));
  const total = results.length;
  const matchedCorrect = results.filter((r) => r.outcome === "MATCHED_CORRECT").length;
  const matchedIncorrectFlagged = results.filter((r) => r.outcome === "MATCHED_INCORRECT_FLAGGED").length;
  const matchedIncorrectUnflagged = results.filter((r) => r.outcome === "MATCHED_INCORRECT_UNFLAGGED").length;
  const missing = results.filter((r) => r.outcome === "MISSING").length;

  const byFamily: Record<string, { truePositives: number; total: number; precision: number; recall: number; f1: number }> = {};
  for (const family of new Set(groundTruth.map((g) => g.family))) {
    const familyResults = results.filter((r) => r.family === family);
    const tp = familyResults.filter((r) => r.outcome === "MATCHED_CORRECT").length;
    const fam_total = familyResults.length;
    // recall: correct / total ground-truth provisions in this family.
    // precision here is measured against the SAME denominator (matched attempts, correct or not) since
    // this evaluator only scores rules the analyzer itself proposed against a known provision set - a
    // fuller precision measure (extractor rules with NO ground-truth counterpart at all) is out of scope
    // for this bounded spike and called out as a known limitation in docs/phase-c0-validation-spike.md.
    const attempted = familyResults.filter((r) => r.outcome !== "MISSING").length;
    const precision = attempted === 0 ? 0 : tp / attempted;
    const recall = fam_total === 0 ? 0 : tp / fam_total;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    byFamily[family] = { truePositives: tp, total: fam_total, precision, recall, f1 };
  }

  return {
    total,
    matchedCorrect,
    matchedIncorrectFlagged,
    matchedIncorrectUnflagged,
    missing,
    dangerousUnflaggedErrorRate: total === 0 ? 0 : matchedIncorrectUnflagged / total,
    dangerousFlaggedErrorRate: total === 0 ? 0 : matchedIncorrectFlagged / total,
    missingRate: total === 0 ? 0 : missing / total,
    precisionRecallF1ByFamily: byFamily,
    results,
  };
}
