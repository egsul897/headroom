/**
 * Cap-verb grammar shared by the definition evaluator and the EBITDA optimizer (kept in its own module: those two
 * import each other, so a constant defined in either can be undefined while the other initializes).
 */
// An adverbial between "not" and "exceed" ("shall not cumulatively exceed", "shall not in the aggregate exceed",
// "does not at any time exceed") is still the cap verb.
const ADVERBS = String.raw`(?:cumulatively|collectively|together|in\s+the\s+aggregate|in\s+aggregate|in\s+total|at\s+any\s+(?:one\s+)?time|in\s+any\s+event|individually\s+or\s+in\s+the\s+aggregate|when\s+taken\s+together|taken\s+together)`;
// Also set off by commas: "shall not, in the aggregate, exceed", "shall not, individually or in the aggregate, exceed".
export const CAP_ADVERB = String.raw`(?:${ADVERBS}\s+|,\s*${ADVERBS}\s*,\s*)?`;
/**
 * "in no event shall <subject> exceed …" and "… shall in no event exceed …": the subject (which may name the clauses the
 * cap limits) sits between the negation and the verb. Periods inside numbers ("Section 1.01", "$1.5 million") do not end
 * the subject; a sentence end or a semicolon does.
 */
export const IN_NO_EVENT = String.raw`\bin\s+no\s+event\s+(?:shall|will|may|can|is|are)\b(?:[^.;]|\.(?=\d)){0,300}?\bexceed\b|\b(?:shall|will|may|is\s+to|are\s+to)\s+in\s+no\s+event\s+exceed\b`;
/** True when a cap-verb match is the subject-first "in no event shall <subject> exceed" form. */
export const isInNoEventSubject = (m: string): boolean => /^in\s+no\s+event\b/i.test(m);
