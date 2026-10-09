import { ASK_CASES, type AskCaseId } from "./copy";
import { answerFromCorpus, type AskRetrieveAnswer } from "../product/covenant-intelligence/ask-retrieve";

/** Chunk A′ shell result, extended with retrieval-grounded answers. */
export interface AskShellResult {
  kind: "empty" | "answered" | "insufficient_evidence" | "refused";
  caseId: AskCaseId | "RETRIEVED" | "INSUFFICIENT_EVIDENCE";
  headline: string;
  detail: string;
  citations?: AskRetrieveAnswer["citations"];
  limitations?: string[];
}

export function askEmpty(caseId: AskCaseId): AskShellResult {
  const copy = ASK_CASES[caseId];
  return { kind: "empty", caseId, headline: copy.headline, detail: copy.detail };
}

/**
 * What the Ask page shows before a question is submitted.
 */
export function resolveAskShell(input: { companyId: string | null | undefined }): AskShellResult {
  if (!input.companyId?.trim()) return askEmpty("NO_COMPANY");
  return {
    kind: "empty",
    caseId: "NOT_AVAILABLE_ON_DEAL",
    headline: ASK_CASES.NOT_AVAILABLE_ON_DEAL.headline,
    detail:
      "Submit a question to retrieve matching covenant excerpts from this workspace’s uploaded financing documents. Answers cite specific provisions. Headroom will not invent permissions, capacity, or amendment conclusions. Public precedents are not used as governing authority.",
  };
}

/**
 * Answer from retrieved Neon corpus text with citations.
 * Falls back to refuse-not-invent when no evidence is found.
 */
export async function answerAsk(input: {
  companyId: string | null | undefined;
  question: string;
  sourceId?: string;
}): Promise<AskShellResult> {
  if (!input.companyId?.trim()) return askEmpty("NO_COMPANY");
  const result = await answerFromCorpus({
    question: input.question,
    sourceId: input.sourceId,
    companyId: input.companyId,
    limit: 8,
  });
  if (result.kind === "answered") {
    return {
      kind: "answered",
      caseId: "RETRIEVED",
      headline: result.headline,
      detail: result.detail,
      citations: result.citations,
      limitations: result.limitations,
    };
  }
  if (result.kind === "insufficient_evidence") {
    return {
      kind: "insufficient_evidence",
      caseId: "INSUFFICIENT_EVIDENCE",
      headline: result.headline,
      detail: result.detail,
      limitations: result.limitations,
    };
  }
  return askEmpty("REFUSE_NOT_INVENT");
}

/** @deprecated use answerAsk — kept for client safety net */
export function refuseAsk(input: { companyId: string | null | undefined; question: string }): AskShellResult {
  void input.question;
  if (!input.companyId?.trim()) return askEmpty("NO_COMPANY");
  return askEmpty("REFUSE_NOT_INVENT");
}
