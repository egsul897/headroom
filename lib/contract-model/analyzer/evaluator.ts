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
import type { CandidateContractRule } from "../types";

export type ProvisionOutcome = "MATCHED_CORRECT" | "MATCHED_INCORRECT_FLAGGED" | "MATCHED_INCORRECT_UNFLAGGED" | "MISSING";

export interface GroundTruthProvisionLike {
  id: string;
  sourceSectionRef: string;
  realFigures: string[];
  family: string;
  formulaRef?: string;
  conditionTypes: string[];
}

export interface ProvisionEvalResult {
  provisionId: string;
  sourceSectionRef: string;
  family: string;
  outcome: ProvisionOutcome;
  matchedRule?: CandidateContractRule;
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

function ruleIsSelfFlagged(rule: CandidateContractRule): boolean {
  if (rule.evaluationClass === "JUDGMENT_REQUIRED" || rule.evaluationClass === "UNSUPPORTED") return true;
  if (rule.action === "OTHER") return true;
  if (rule.notes && HEDGE_WORDS.test(rule.notes)) return true;
  return false;
}

/** Finds the extracted rule whose sourceSectionRef best matches (exact, or one is a prefix of the other). */
function findMatch(ground: GroundTruthProvisionLike, rules: CandidateContractRule[]): CandidateContractRule | undefined {
  const target = normalizeRef(ground.sourceSectionRef.split(/[\s(]/)[0] + (ground.sourceSectionRef.match(/\([a-z]+\)/gi)?.join("") ?? ""));
  const targetNorm = normalizeRef(ground.sourceSectionRef);
  let best: CandidateContractRule | undefined;
  for (const rule of rules) {
    const ruleRef = normalizeRef(rule.sourceSectionRef ?? "");
    if (!ruleRef) continue;
    if (ruleRef === targetNorm || ruleRef === target) return rule;
    if (targetNorm.startsWith(ruleRef) || ruleRef.startsWith(targetNorm)) best = best ?? rule;
  }
  return best;
}

export function evaluateProvision(ground: GroundTruthProvisionLike, extractedRules: CandidateContractRule[]): ProvisionEvalResult {
  const match = findMatch(ground, extractedRules);
  if (!match) {
    return { provisionId: ground.id, sourceSectionRef: ground.sourceSectionRef, family: ground.family, outcome: "MISSING", mismatchReasons: ["no extracted rule cites this section"] };
  }

  const reasons: string[] = [];
  if (match.covenantFamily !== ground.family) reasons.push(`family mismatch: expected ${ground.family}, got ${match.covenantFamily}`);
  if (ground.formulaRef && match.formulaRef !== ground.formulaRef) reasons.push(`formula mismatch: expected ${ground.formulaRef}, got ${match.formulaRef ?? "(none)"}`);

  const groundNumbers = extractNumbers(ground.realFigures);
  if (groundNumbers.length > 0) {
    const matchNumbers = [match.thresholdValue, ...extractNumbers([match.notes ?? ""])].filter((n): n is number => typeof n === "number");
    const anyNumberMatches = groundNumbers.some((gn) => matchNumbers.some((mn) => Math.abs(mn - gn) / Math.max(gn, 1) < 0.01));
    if (!anyNumberMatches) reasons.push(`no real figure matched: expected one of [${groundNumbers.join(", ")}], extracted thresholdValue=${match.thresholdValue ?? "(none)"}`);
  }

  if (ground.conditionTypes.includes("RATIO_SATISFIED")) {
    const hasRatioCondition = match.conditions.some((c) => c.type === "RATIO_SATISFIED") || /ratio/i.test(match.notes ?? "");
    if (!hasRatioCondition) reasons.push("ground truth requires a ratio-gate condition that the extracted rule does not carry");
  }
  if (ground.conditionTypes.includes("NO_DEFAULT")) {
    const hasNoDefault = match.conditions.some((c) => c.type === "NO_DEFAULT");
    if (!hasNoDefault) reasons.push("ground truth requires a no-default condition that the extracted rule does not carry");
  }

  if (reasons.length === 0) {
    return { provisionId: ground.id, sourceSectionRef: ground.sourceSectionRef, family: ground.family, outcome: "MATCHED_CORRECT", matchedRule: match, mismatchReasons: [] };
  }
  const outcome: ProvisionOutcome = ruleIsSelfFlagged(match) ? "MATCHED_INCORRECT_FLAGGED" : "MATCHED_INCORRECT_UNFLAGGED";
  return { provisionId: ground.id, sourceSectionRef: ground.sourceSectionRef, family: ground.family, outcome, matchedRule: match, mismatchReasons: reasons };
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

export function evaluateAll(groundTruth: GroundTruthProvisionLike[], extractedRules: CandidateContractRule[]): EvaluationSummary {
  const results = groundTruth.map((g) => evaluateProvision(g, extractedRules));
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
