/**
 * Phase 2G §4 - effective-date resolution. Never assumes execution date
 * always equals effective date (task's own explicit instruction): an
 * amendment's own text is checked FIRST for an explicit effective-date
 * statement distinct from its self-identifying "dated as of" clause, or
 * for a conditional-effective-date construction that cannot be resolved
 * to a concrete date from text alone. Only when neither is found does
 * this fall back to treating the document's own execution date as the
 * effective date - an inference, honestly labeled as such, not asserted
 * as certain.
 */
import type { EffectiveDateResult } from "./types";

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`(?:${MONTHS})\\s+\\d{1,2},\\s*\\d{4}`, "i");

// "shall become effective as of/on [DATE]" / "the effective date of this
// Amendment is [DATE]" / "effective as of [DATE]" - explicit statements
// naming a concrete effective date. Deliberately distinct from a bare
// "dated as of [DATE]" self-identification (document-identity.ts's own
// concern), which names when the document was EXECUTED, not necessarily
// when it becomes EFFECTIVE - the two are usually, but not always, the
// same date, and this module never assumes they are.
const EXPLICIT_EFFECTIVE_DATE_RE = new RegExp(`(?:shall\\s+become\\s+effective|effective\\s+date\\s+of\\s+this\\s+\\w+\\s+is|is\\s+effective)\\s+(?:as\\s+of\\s+|on\\s+)?(${DATE_RE.source})`, "i");

// A conditional/contingent effective-date construction with NO concrete
// date attached - "shall become effective upon satisfaction of the
// conditions set forth in Section X", "subject to the occurrence of the
// Effective Date" (a defined term whose own trigger is a future event,
// not a fixed calendar date), or "shall become effective as of the date
// (the "Amendment Effective Date") on which each of the following
// conditions precedent shall have been satisfied" - the last of these is
// a very common credit-agreement drafting convention (a defined
// "Effective Date" term whose own trigger clause immediately follows,
// possibly parenthetically naming the term first) confirmed real on
// CONMED Document D's own text, which the first two alternatives alone
// did not cover. Generalized phrasing throughout, not package-specific.
const CONDITIONAL_EFFECTIVE_RE = /\b(?:shall\s+become\s+effective\s+upon|subject\s+to\s+the\s+(?:occurrence|satisfaction)\s+of|upon\s+satisfaction\s+of\s+the\s+conditions|effective\s+(?:as\s+of\s+|on\s+)?the\s+date\s+(?:\([^)]{1,120}\)\s+)?(?:on|upon)\s+which)\b/i;

export interface EffectiveDateInput {
  amendmentText: string;
  /** The amendment document's own execution date, per document-identity.ts's own extraction - the fallback inference source. */
  executionDate: string | null;
}

// Phase 3F.1.4 §P1-4 - a sentence/clause boundary between an explicit date
// and nearby conditions-precedent language means they do NOT condition the
// SAME effectiveness statement (e.g. unrelated boilerplate appearing later
// in the amendment) - a period/semicolon followed by a capitalized word, or
// a blank-line paragraph break, both count as a real boundary. Deliberately
// conservative (a real sentence break, not merely "some text between them")
// so this never suppresses a genuinely unconditional explicit date merely
// because unrelated conditions-precedent language exists somewhere else in
// the same amendment (e.g. conditions to a lender's funding obligation,
// unrelated to the amendment's own effectiveness).
function isSameClause(between: string): boolean {
  return !/[.;]\s+[A-Z]|\n\s*\n/.test(between);
}

const SAME_CLAUSE_SEARCH_WINDOW_CHARS = 400;

export function resolveEffectiveDate(input: EffectiveDateInput): EffectiveDateResult {
  const window = input.amendmentText.slice(0, 6000);

  const explicitMatch = EXPLICIT_EFFECTIVE_DATE_RE.exec(window);
  if (explicitMatch) {
    // Phase 3F.1.4 §P1-4 (real defect, tests/foundation-audit/effective-
    // dating-adversarial.test.ts "2a"): a very common real credit-
    // agreement drafting pattern states an explicit effective date AND,
    // in the very same sentence/clause, conditions that same
    // effectiveness on the satisfaction of stated conditions precedent -
    // "This Amendment shall become effective as of December 1, 2023,
    // subject to the satisfaction of the following conditions precedent:
    // ...". The OLD code returned EXPLICIT_EFFECTIVE_DATE immediately on
    // the first match, never checking for this. Fixed by checking BOTH
    // directions (conditions-precedent language stated either before or
    // after the explicit date within the same clause) before accepting
    // the date as unconditionally applicable - the identical conditional
    // language is already correctly caught as CONDITIONAL_UNRESOLVED when
    // no date is present at all; this closes the gap for when a date IS
    // present but the same clause still makes it conditional.
    const matchStart = explicitMatch.index;
    const matchEnd = matchStart + explicitMatch[0].length;
    const forwardSearchArea = window.slice(matchEnd, matchEnd + SAME_CLAUSE_SEARCH_WINDOW_CHARS);
    const forwardConditional = CONDITIONAL_EFFECTIVE_RE.exec(forwardSearchArea);
    const backwardSearchStart = Math.max(0, matchStart - SAME_CLAUSE_SEARCH_WINDOW_CHARS);
    const backwardSearchArea = window.slice(backwardSearchStart, matchStart);
    const backwardConditional = CONDITIONAL_EFFECTIVE_RE.exec(backwardSearchArea);

    const sameClauseForward = forwardConditional && isSameClause(window.slice(matchEnd, matchEnd + forwardConditional.index));
    const sameClauseBackward = backwardConditional && isSameClause(window.slice(backwardSearchStart + backwardConditional.index + backwardConditional[0].length, matchStart));

    if (sameClauseForward || sameClauseBackward) {
      const conditionalEvidence = sameClauseForward ? forwardConditional![0] : backwardConditional![0];
      return {
        date: null,
        status: "CONDITIONAL_UNRESOLVED",
        evidence: `${explicitMatch[0]} ... ${conditionalEvidence}`,
        reason: "The amendment's own text states an explicit date, but the SAME sentence/clause also conditions that effectiveness on the satisfaction of stated conditions precedent - an explicit date alone is not sufficient evidence that this amendment is unconditionally effective as of that date; the effective date cannot be safely established from text alone.",
      };
    }

    return { date: explicitMatch[1]!.replace(/\s+/g, " ").trim(), status: "EXPLICIT_EFFECTIVE_DATE", evidence: explicitMatch[0], reason: "An explicit effective-date statement (distinct from the document's own execution-date self-reference) was found in the amendment's own text, with no conditions-precedent language conditioning the same clause's effectiveness." };
  }

  const conditionalMatch = CONDITIONAL_EFFECTIVE_RE.exec(window);
  if (conditionalMatch) {
    return { date: null, status: "CONDITIONAL_UNRESOLVED", evidence: conditionalMatch[0], reason: "The amendment's own text conditions its effectiveness on a future event or the satisfaction of stated conditions, with no concrete calendar date given - the effective date cannot be safely established from text alone." };
  }

  if (input.executionDate) {
    return { date: input.executionDate, status: "INFERRED_FROM_EXECUTION_DATE", evidence: null, reason: "No explicit or conditional effective-date statement was found in the amendment's own text; the document's own execution date is used as the best-available inference, not asserted as certain." };
  }

  return { date: null, status: "UNKNOWN", evidence: null, reason: "Neither an explicit effective-date statement nor the document's own execution date could be established from available evidence." };
}
