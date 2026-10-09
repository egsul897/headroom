import { ASK_CASES, type AskCaseId } from "./copy";
import { answerFromCorpus, type AskRetrieveAnswer } from "../product/covenant-intelligence/ask-retrieve";
import { loadTransactionWorkflowReadiness } from "@/lib/product/north-star-workflow";
import { prisma } from "@/lib/prisma";
import { summarizeFromStoredMetadata } from "../product/covenant-intelligence/summarize";
import {
  buildTransactionAnalysisScaffold,
  inferTransactionKind,
} from "../product/legal-reasoning";

/** Chunk A′ shell result, extended with retrieval-grounded answers. */
export interface AskShellResult {
  kind: "empty" | "answered" | "insufficient_evidence" | "refused";
  caseId: AskCaseId | "RETRIEVED" | "INSUFFICIENT_EVIDENCE" | "TRANSACTION_READINESS";
  headline: string;
  detail: string;
  citations?: AskRetrieveAnswer["citations"];
  limitations?: string[];
  restrictions?: string[];
  permissions?: string[];
  unresolved?: string[];
  /** Present when the question looks like a contemplated transaction. */
  transactionWorkflow?: {
    canRun: boolean;
    cutoffState?: string;
    reportingPeriodKey?: string | null;
    approvedSnapshotId?: string | null;
    nextActions: Array<{ label: string; href: string }>;
    authorityNote: string;
  };
}

const TRANSACTION_HINT =
  /\b(incur|borrow|issue|dividend|restricted payment|investment|acquisition|secured|unsecured|lien|capacity|can we)\b/i;

/** Extract an explicit ISO date from the question when present; never invent "today". */
function extractEvaluationDate(question: string): string | undefined {
  const m = question.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return m?.[1];
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
  const companyId = input.companyId.trim();

  // Transaction-shaped questions: resolve North-Star readiness (cutoff + APPROVED snapshot) before retrieval.
  if (TRANSACTION_HINT.test(input.question)) {
    const evaluationDate = extractEvaluationDate(input.question);
    const workflow = await loadTransactionWorkflowReadiness(companyId, {
      evaluationDate,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    });
    const tw = {
      canRun: workflow.canRunTransactionWorkflow,
      cutoffState: workflow.cutoff?.state,
      reportingPeriodKey: workflow.cutoff?.reportingPeriodKey,
      approvedSnapshotId: workflow.cutoff?.snapshotId ?? workflow.northStar.approvedSnapshotIds[0] ?? null,
      nextActions: workflow.nextActions,
      authorityNote: workflow.authorityNote,
    };
    if (!workflow.canRunTransactionWorkflow) {
      return {
        kind: "insufficient_evidence",
        caseId: "TRANSACTION_READINESS",
        headline: "Transaction inputs incomplete — Headroom will not invent capacity",
        detail: [
          "This looks like a contemplated transaction. Before enumerating legal paths or capacity, Headroom needs an APPROVED periodic financial snapshot and a resolvable contractual cutoff.",
          evaluationDate
            ? null
            : "Provide an explicit transaction date (YYYY-MM-DD) — Headroom does not assume today’s date or the latest quarter.",
          workflow.cutoff?.reason ? `Cutoff: ${workflow.cutoff.reason}` : null,
          ...workflow.blockers.slice(0, 4),
        ]
          .filter(Boolean)
          .join(" "),
        limitations: [workflow.authorityNote],
        unresolved: [
          ...(evaluationDate ? [] : ["evaluationDate"]),
          ...workflow.blockers,
        ],
        transactionWorkflow: tw,
      };
    }
    // Ready: still retrieve corpus citations; multipath numbers stay on Intelligence (LEGACY label).
    const result = await answerFromCorpus({
      question: input.question,
      sourceId: input.sourceId,
      companyId,
      limit: 8,
    });
    const cutoffLine = `Applicable cutoff ${workflow.cutoff?.reportingPeriodKey ?? "—"} asOf ${workflow.cutoff?.asOf ?? "—"} → snapshot ${workflow.cutoff?.snapshotId ?? "—"}.`;
    const dependencyNote = await buildTransactionDependencyNote(companyId, input.question);
    if (result.kind === "answered") {
      return {
        kind: "answered",
        caseId: "TRANSACTION_READINESS",
        headline: result.headline,
        detail: `${cutoffLine} ${result.detail} Review neutral paths on Intelligence (LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E).${dependencyNote ? ` ${dependencyNote}` : ""}`,
        citations: result.citations,
        limitations: [...(result.limitations ?? []), workflow.authorityNote],
        restrictions: result.restrictions,
        permissions: result.permissions,
        unresolved: result.unresolved,
        transactionWorkflow: tw,
      };
    }
    return {
      kind: "insufficient_evidence",
      caseId: "TRANSACTION_READINESS",
      headline: "Cutoff resolved; provision retrieval incomplete",
      detail: `${cutoffLine} ${result.kind === "insufficient_evidence" ? result.detail : "No governing excerpts retrieved."} Open Intelligence for multipath analysis when Permissions exist.`,
      limitations: [workflow.authorityNote],
      unresolved: result.kind === "insufficient_evidence" ? result.unresolved : workflow.blockers,
      transactionWorkflow: tw,
    };
  }

  const result = await answerFromCorpus({
    question: input.question,
    sourceId: input.sourceId,
    companyId,
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
      restrictions: result.restrictions,
      permissions: result.permissions,
      unresolved: result.unresolved,
    };
  }
  if (result.kind === "insufficient_evidence") {
    return {
      kind: "insufficient_evidence",
      caseId: "INSUFFICIENT_EVIDENCE",
      headline: result.headline,
      detail: result.detail,
      limitations: result.limitations,
      unresolved: result.unresolved,
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

/**
 * Attach dependency-traversal summary for transaction Ask answers.
 * Structural hypotheses only — never executable capacity.
 */
async function buildTransactionDependencyNote(companyId: string, question: string): Promise<string | null> {
  if (!inferTransactionKind(question)) return null;
  try {
    const rows = await prisma.knowledgeSource.findMany({
      where: { companyId },
      select: { sourceId: true, documentTitle: true, metadata: true },
      take: 40,
    });
    const items = [];
    for (const row of rows) {
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const summary = summarizeFromStoredMetadata(meta);
      if (!summary?.items?.length) continue;
      for (const item of summary.items) {
        items.push({
          ...item,
          sourceId: row.sourceId,
          documentTitle: row.documentTitle || summary.governingAgreement,
        });
      }
    }
    if (!items.length) return null;
    const scaffold = buildTransactionAnalysisScaffold({ question, items });
    if (!scaffold) return null;
    const addressed = scaffold.steps.filter((s) => s.status === "ADDRESSED").length;
    const missing = scaffold.steps.filter((s) => s.status === "MISSING").length;
    return `Dependency scaffold (${scaffold.transactionKind}): ${addressed}/10 steps addressed, ${missing} missing; ${scaffold.dependencyBundle.provisions.length} provisions / ${scaffold.dependencyBundle.traversedEdges.length} edges (DISCOVERED ≠ certified).`;
  } catch {
    return null;
  }
}
