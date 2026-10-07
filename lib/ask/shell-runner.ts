import { ASK_CASES, type AskCaseId } from "./copy";

/** Chunk A′ shell result. There is no answer variant. */
export interface AskShellResult {
  kind: "empty";
  caseId: AskCaseId;
  headline: string;
  detail: string;
}

export function askEmpty(caseId: AskCaseId): AskShellResult {
  const copy = ASK_CASES[caseId];
  return { kind: "empty", caseId, headline: copy.headline, detail: copy.detail };
}

/**
 * What the Ask page shows before a question is submitted.
 * A company route is not runnable in A′. A missing company is its own case.
 * This function does not read a question and does not map anything to Unsupported.
 */
export function resolveAskShell(input: { companyId: string | null | undefined }): AskShellResult {
  if (!input.companyId?.trim()) return askEmpty("NO_COMPANY");
  return askEmpty("NOT_AVAILABLE_ON_DEAL");
}

/**
 * A submitted question. The text is discarded. Chunk A′ does not answer,
 * does not call a model, and does not relabel the question as Unsupported.
 */
export function refuseAsk(input: { companyId: string | null | undefined; question: string }): AskShellResult {
  void input.question;
  if (!input.companyId?.trim()) return askEmpty("NO_COMPANY");
  return askEmpty("REFUSE_NOT_INVENT");
}
