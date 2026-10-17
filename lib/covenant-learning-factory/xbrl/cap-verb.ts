/**
 * Cap-verb grammar shared by the definition evaluator and the EBITDA optimizer (kept in its own module: those two
 * import each other, so a constant defined in either can be undefined while the other initializes).
 */
// An adverbial between "not" and "exceed" ("shall not cumulatively exceed", "shall not in the aggregate exceed",
// "does not at any time exceed") is still the cap verb.
export const CAP_ADVERB = String.raw`(?:(?:cumulatively|collectively|together|in\s+the\s+aggregate|in\s+aggregate|in\s+total|at\s+any\s+(?:one\s+)?time|in\s+any\s+event|individually\s+or\s+in\s+the\s+aggregate|when\s+taken\s+together)\s+)?`;
