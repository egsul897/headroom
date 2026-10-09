/**
 * Structured transaction-analysis intake for Ask Headroom.
 * Preserves corpus research separately; this path is North-Star gated.
 */
import { attemptCertifiedTransaction } from "./certified-transaction";
import { loadAuthoritativeCapacity } from "./authoritative-capacity";
import { loadTransactionWorkflowReadiness } from "./transaction-readiness";
import { enumerateCertifiedPaths, type CertifiedPathEnumeration } from "./verified-path-enumeration";
import { answerFromCorpus } from "@/lib/product/covenant-intelligence/ask-retrieve";
import type { VerifiedExecutionPackage } from "@/lib/contract-model/verified-execution";

export interface TransactionDraft {
  rawQuestion: string;
  evaluationDate: string | null;
  amountMillions: number | null;
  kind: "SECURED_DEBT" | "UNSECURED_DEBT" | "RESTRICTED_PAYMENT" | "INVESTMENT" | "ACQUISITION" | "UNKNOWN";
  secured: boolean | null;
  missingConfirmations: string[];
}

export interface TransactionAnalysisResult {
  draft: TransactionDraft;
  readiness: Awaited<ReturnType<typeof loadTransactionWorkflowReadiness>>;
  authoritative: Awaited<ReturnType<typeof loadAuthoritativeCapacity>>;
  certifiedAttempt: Awaited<ReturnType<typeof attemptCertifiedTransaction>>;
  corpus: Awaited<ReturnType<typeof answerFromCorpus>> | null;
  /** Neutral Phase 4E path enumeration over verified package (or truthful incomplete state). */
  pathEnumeration: CertifiedPathEnumeration;
  answer: {
    kind: "needs_confirmation" | "insufficient_evidence" | "review_required" | "certified" | "legacy_labeled";
    headline: string;
    detail: string;
    limitations: string[];
  };
}

function extractEvaluationDate(question: string): string | null {
  const m = question.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return m?.[1] ?? null;
}

function extractAmountMillions(question: string): number | null {
  const m = question.match(/\$?\s*(\d+(?:\.\d+)?)\s*(million|m)\b/i);
  if (m) return Number(m[1]);
  const b = question.match(/\$?\s*(\d+(?:\.\d+)?)\s*(billion|bn)\b/i);
  if (b) return Number(b[1]) * 1000;
  return null;
}

function inferKind(question: string): TransactionDraft["kind"] {
  const q = question.toLowerCase();
  if (/acquisit|purchase.*target|buy.*company/.test(q)) return "ACQUISITION";
  if (/dividend|restricted payment|repurchase|buyback/.test(q)) return "RESTRICTED_PAYMENT";
  if (/investment|contribute|equity infusion/.test(q)) return "INVESTMENT";
  if (/secured|lien|collateral/.test(q) && /debt|borrow|incur|loan|notes?/.test(q)) return "SECURED_DEBT";
  if (/debt|borrow|incur|loan|notes?|unsecured/.test(q)) return "UNSECURED_DEBT";
  return "UNKNOWN";
}

/** Parse a contemplated transaction into a structured draft (no inventing of missing fields). */
export function parseTransactionDraft(question: string): TransactionDraft {
  const evaluationDate = extractEvaluationDate(question);
  const amountMillions = extractAmountMillions(question);
  const kind = inferKind(question);
  const secured =
    kind === "SECURED_DEBT" || kind === "ACQUISITION"
      ? true
      : /unsecured/.test(question.toLowerCase())
        ? false
        : /secured|lien/.test(question.toLowerCase())
          ? true
          : null;
  const missingConfirmations: string[] = [];
  if (!evaluationDate) missingConfirmations.push("evaluationDate (YYYY-MM-DD)");
  if (amountMillions == null) missingConfirmations.push("transaction amount");
  if (kind === "UNKNOWN") missingConfirmations.push("transaction kind (debt / RP / investment / acquisition)");
  if (secured == null && (kind === "SECURED_DEBT" || kind === "UNSECURED_DEBT" || kind === "ACQUISITION")) {
    missingConfirmations.push("secured vs unsecured");
  }
  return {
    rawQuestion: question,
    evaluationDate,
    amountMillions,
    kind,
    secured,
    missingConfirmations,
  };
}

/**
 * Full transaction-analysis workflow for product Ask.
 * Does not treat AI pathways as certified. Does not bypass Phase 3 / 4E gates.
 */
export async function analyzeContemplatedTransaction(args: {
  companyId: string;
  question: string;
  sourceId?: string;
  confirmed?: boolean;
  verifiedPackage?: VerifiedExecutionPackage | null;
}): Promise<TransactionAnalysisResult> {
  const draft = parseTransactionDraft(args.question);
  const readiness = await loadTransactionWorkflowReadiness(args.companyId, {
    evaluationDate: draft.evaluationDate ?? undefined,
    selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
  });
  const authoritative = await loadAuthoritativeCapacity({
    companyId: args.companyId,
    evaluationDate: draft.evaluationDate ?? undefined,
    verifiedPackage: args.verifiedPackage ?? null,
  });
  const certifiedAttempt = await attemptCertifiedTransaction({
    companyId: args.companyId,
    evaluationDate: draft.evaluationDate ?? undefined,
    verifiedPackage: args.verifiedPackage ?? null,
  });

  const pathEnumeration = enumerateCertifiedPaths({
    verifiedPackage: args.verifiedPackage ?? null,
    transactionKind: draft.kind,
    secured: draft.secured,
  });

  let corpus: Awaited<ReturnType<typeof answerFromCorpus>> | null = null;
  try {
    corpus = await answerFromCorpus({
      question: args.question,
      companyId: args.companyId,
      sourceId: args.sourceId,
      limit: 8,
    });
  } catch {
    corpus = null;
  }

  if (draft.missingConfirmations.length > 0 && !args.confirmed) {
    return {
      draft,
      readiness,
      authoritative,
      certifiedAttempt,
      corpus,
      pathEnumeration,
      answer: {
        kind: "needs_confirmation",
        headline: "Confirm essential transaction details",
        detail: `Missing: ${draft.missingConfirmations.join("; ")}. Headroom will not assume today’s date, latest quarter, or an amount.`,
        limitations: [authoritative.certified.authorityNote, pathEnumeration.note],
      },
    };
  }

  if (certifiedAttempt.capacity?.outcome === "EXECUTED") {
    return {
      draft,
      readiness,
      authoritative,
      certifiedAttempt,
      corpus,
      pathEnumeration,
      answer: {
        kind: "certified",
        headline: "Certified capacity evaluated under verified-execution REQUIRE",
        detail: `Cutoff ${authoritative.cutoff.reportingPeriodKey ?? "—"} → snapshot ${authoritative.cutoff.approvedSnapshotId ?? "—"}. Ledger usages applied: ${authoritative.activeLedgerUsageCount}.`,
        limitations: [authoritative.certified.authorityNote],
      },
    };
  }

  if (!readiness.canRunTransactionWorkflow || authoritative.status === "NEEDS_INPUT") {
    return {
      draft,
      readiness,
      authoritative,
      certifiedAttempt,
      corpus,
      pathEnumeration,
      answer: {
        kind: "insufficient_evidence",
        headline: "Transaction inputs incomplete — capacity withheld",
        detail: [
          authoritative.cutoff.state !== "RESOLVED"
            ? `Cutoff: ${authoritative.cutoff.state}`
            : `Cutoff resolved: ${authoritative.cutoff.reportingPeriodKey}`,
          ...authoritative.missingInputs.map((m) => `Missing: ${m}`),
          ...certifiedAttempt.blockers.map((b) => `Certified blocker: ${b}`),
        ].join(" · "),
        limitations: [authoritative.certified.authorityNote, pathEnumeration.note, authoritative.legacy.note],
      },
    };
  }

  return {
    draft,
    readiness,
    authoritative,
    certifiedAttempt,
    corpus,
    pathEnumeration,
    answer: {
      kind: "review_required",
      headline: "Source-backed analysis available; certified execution not available",
      detail:
        corpus?.kind === "answered"
          ? corpus.detail
          : "Governing excerpts may be incomplete. Open Intelligence for LEGACY multipath (NOT_CERTIFIED_4E) or approve NS-4 certificate + supply VerifiedExecutionPackage for certified capacity.",
      limitations: [authoritative.certified.authorityNote, pathEnumeration.note, authoritative.legacy.note],
    },
  };
}
