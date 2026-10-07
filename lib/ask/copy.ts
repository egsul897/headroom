/**
 * Ask empty-state cases for Chunk A′.
 * Cases 1–5 are the prior interrogation empties. refuse-not-invent is the
 * submitted-question result. None of these is an answer.
 *
 * There is no prior Ask copy module in this repo. Headlines use the case
 * labels from the A′ grant. Details stay fail-closed and do not classify
 * an unrun question as Unsupported.
 */

export const ASK_CASES = {
  NO_COMPANY: {
    headline: "No company",
    detail: "There is no company to interrogate. Ask did not run.",
  },
  NOT_AVAILABLE_ON_DEAL: {
    headline: "Ask isn’t available on this deal yet",
    detail: "Ask did not run. No answer, path, or figure is available.",
  },
  UNSUPPORTED: {
    headline: "Unsupported",
    detail: "A coverage rule marked this unsupported. Headroom did not invent a substitute.",
  },
  NEED_ONE_MORE_INPUT: {
    headline: "Need one more input",
    detail: "One required input is missing. Headroom will not guess it.",
  },
  NEEDS_REVIEW: {
    headline: "Needs review",
    detail: "This needs review. Headroom will not treat it as settled.",
  },
  REFUSE_NOT_INVENT: {
    headline: "Headroom will not invent an answer",
    detail: "The question was not run. No figure, path, or status was produced.",
  },
} as const;

export type AskCaseId = keyof typeof ASK_CASES;
