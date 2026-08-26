/**
 * Phase C.1 - deterministic, section-level basket-completeness check.
 *
 * Real evidence motivating this (docs/phase-c-1-multi-basket-verification.md):
 * re-examining the 8 provisions Phase C's own report called "dangerous
 * unflagged multi-basket errors" against the FULL set of rules extracted
 * from each section (not just the one rule the evaluator happened to match)
 * showed the real thresholds ($500K, $35M, $5M, etc.) were NOT lost, merged,
 * or misassigned - they were correctly captured as separate, correctly-
 * thresholded sub-clause rules. The actual gap is that neither the
 * evaluator NOR the existing per-rule adversarial verifier ever looks at a
 * SECTION AS A WHOLE: `verifyRuleAgainstSource` (lib/contract-model/analyzer/verify.ts)
 * only checks one rule's own citation/threshold in isolation, so it cannot
 * express "does every real dollar/percentage figure in this section appear
 * SOMEWHERE in the rules extracted from it" - the one question that
 * actually tells you whether a real multi-basket LOSS occurred.
 *
 * This module answers exactly that question, deterministically, with no
 * company/document-specific logic: given one section's own source text and
 * every candidate rule citing a sub-clause of it, it (1) finds every real
 * numeric/percentage/ratio expression per lettered sub-clause, (2) checks
 * each such number appears in SOME rule's thresholdValue or notes for that
 * exact sub-clause (an omitted/lost basket if not), and (3) checks two
 * DIFFERENT sub-clauses with two DIFFERENT real source numbers were never
 * both assigned the SAME extracted threshold (a duplicated/misassigned
 * threshold). A section with only one basket (no lettered sub-clauses, or
 * only one) is checked the same way and never flagged merely for having a
 * single basket - task's own explicit "no blanket false positives"
 * requirement.
 */
import type { CandidateContractRule } from "../types";

export interface SectionClauseSegment {
  /** The lettered sub-clause ("a", "b", ...) or null when the section has no lettered sub-clauses at all (single-basket section). */
  letter: string | null;
  text: string;
}

export interface UnmatchedBasketNumber {
  letter: string | null;
  value: number;
  raw: string;
}

export interface DuplicatedThreshold {
  letterA: string;
  letterB: string;
  value: number;
}

export interface BasketCompletenessResult {
  sectionPrefix: string;
  totalBasketsDetected: number;
  unmatchedNumbers: UnmatchedBasketNumber[];
  duplicatedThresholds: DuplicatedThreshold[];
  flagged: boolean;
}

const CLAUSE_MARKER = /(?<=[;.:]\s)\([a-z]\)(?!\()/g;

/** Splits section text into per-lettered-sub-clause segments; a section with no lettered markers becomes one segment with letter=null. */
export function splitByLetteredClauses(sectionText: string): SectionClauseSegment[] {
  const markers: { letter: string; index: number }[] = [];
  const re = new RegExp(CLAUSE_MARKER.source, CLAUSE_MARKER.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(sectionText)) !== null) {
    const letter = m[0].slice(1, -1);
    markers.push({ letter, index: m.index });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (markers.length === 0) {
    return [{ letter: null, text: sectionText }];
  }
  const segments: SectionClauseSegment[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]!.index;
    const end = markers[i + 1] ? markers[i + 1]!.index : sectionText.length;
    segments.push({ letter: markers[i]!.letter, text: sectionText.slice(start, end) });
  }
  return segments;
}

/** Real dollar/percentage/ratio numeric expressions - deliberately narrow (this is a completeness check, not a general-purpose number extractor) so a stray page number or defined-term cross-reference number doesn't produce noise. */
function extractRealNumbers(text: string): { value: number; raw: string }[] {
  const out: { value: number; raw: string }[] = [];
  for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)) {
    out.push({ value: Number((m[1] ?? "").replace(/,/g, "")), raw: m[0] });
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) {
    out.push({ value: Number(m[1]), raw: m[0] });
  }
  for (const m of text.matchAll(/(\d+\.\d{2}):1\.00/g)) {
    out.push({ value: Number(m[1]), raw: m[0] });
  }
  return out.filter((n) => !Number.isNaN(n.value));
}

function normalizeSectionRef(ref: string): string {
  return ref.replace(/^§/, "").replace(/^Section\s+/i, "").replace(/\s+/g, "");
}

/** True if `value` appears (within 1% relative tolerance, matching evaluator.ts's own convention) in a rule's thresholdValue or as a raw figure in its notes. */
function ruleCarriesNumber(rule: CandidateContractRule, value: number): boolean {
  if (typeof rule.thresholdValue === "number" && Math.abs(rule.thresholdValue - value) / Math.max(value, 1) < 0.01) return true;
  if (rule.notes) {
    for (const n of extractRealNumbers(rule.notes)) {
      if (Math.abs(n.value - value) / Math.max(value, 1) < 0.01) return true;
    }
  }
  return false;
}

/** Rules whose sourceSectionRef falls under this exact sub-clause, or (for letter=null / no lettered sub-clauses detected in the source) anywhere under the bare section prefix. */
function rulesForClause(rules: CandidateContractRule[], sectionPrefix: string, letter: string | null): CandidateContractRule[] {
  const target = letter ? `${sectionPrefix}(${letter})` : sectionPrefix;
  return rules.filter((r) => normalizeSectionRef(r.sourceSectionRef ?? "").startsWith(target));
}

export function checkSectionBasketCompleteness(sectionPrefix: string, sectionText: string, rules: CandidateContractRule[]): BasketCompletenessResult {
  const segments = splitByLetteredClauses(sectionText);
  const perClauseNumbers = segments.map((seg) => ({ letter: seg.letter, numbers: extractRealNumbers(seg.text) }));

  const unmatchedNumbers: UnmatchedBasketNumber[] = [];
  const clauseAssignedValue = new Map<string, number>(); // letter -> the (single) real number that clause's own text carries, when unambiguous

  for (const { letter, numbers } of perClauseNumbers) {
    if (numbers.length === 0) continue;
    const clauseRules = rulesForClause(rules, sectionPrefix, letter);
    for (const { value, raw } of numbers) {
      const covered = clauseRules.some((r) => ruleCarriesNumber(r, value));
      if (!covered) unmatchedNumbers.push({ letter, value, raw });
    }
    if (numbers.length >= 1 && letter) clauseAssignedValue.set(letter, numbers[0]!.value);
  }

  // Duplicated-threshold detection: two DIFFERENT lettered clauses, each with
  // its own DIFFERENT real source number, whose extracted rules both ended
  // up carrying the SAME threshold value (one of them necessarily wrong).
  const duplicatedThresholds: DuplicatedThreshold[] = [];
  const letters = [...clauseAssignedValue.keys()];
  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      const letterA = letters[i]!;
      const letterB = letters[j]!;
      const valueA = clauseAssignedValue.get(letterA)!;
      const valueB = clauseAssignedValue.get(letterB)!;
      if (Math.abs(valueA - valueB) / Math.max(valueA, valueB, 1) < 0.01) continue; // same real source number in both clauses - not a duplication error.
      const rulesA = rulesForClause(rules, sectionPrefix, letterA);
      const rulesB = rulesForClause(rules, sectionPrefix, letterB);
      const aGotB = rulesA.some((r) => ruleCarriesNumber(r, valueB)) && !rulesA.some((r) => ruleCarriesNumber(r, valueA));
      const bGotA = rulesB.some((r) => ruleCarriesNumber(r, valueA)) && !rulesB.some((r) => ruleCarriesNumber(r, valueB));
      if (aGotB || bGotA) duplicatedThresholds.push({ letterA, letterB, value: aGotB ? valueB : valueA });
    }
  }

  return {
    sectionPrefix,
    totalBasketsDetected: segments.filter((s) => s.letter !== null).length || 1,
    unmatchedNumbers,
    duplicatedThresholds,
    flagged: unmatchedNumbers.length > 0 || duplicatedThresholds.length > 0,
  };
}

/** Groups a document's rules by top-level section prefix (e.g. "6.13(h)" -> "6.13") and runs the completeness check against each section that has real structural text available. */
export function checkAllSectionsBasketCompleteness(documentText: string, rules: CandidateContractRule[], sectionBoundaries: { sectionPrefix: string; charStart: number; charEnd: number }[]): BasketCompletenessResult[] {
  return sectionBoundaries.map((b) => checkSectionBasketCompleteness(b.sectionPrefix, documentText.slice(b.charStart, b.charEnd), rules));
}
