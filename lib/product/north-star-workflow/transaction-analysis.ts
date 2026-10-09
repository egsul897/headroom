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
import {
  runLegacyEngineSimulation,
  type LegacySimulateBridgeResult,
} from "@/lib/product/unified-position/legacy-simulate-bridge";
import {
  buildSimulateHandoffHref,
  simulateActionFromAskKind,
} from "@/lib/product/unified-position/simulate-handoff";
import {
  evaluateCrossDocumentTransaction,
  type CrossDocumentCovenantVerdict,
  type OperativeProvisionFact,
} from "@/lib/product/covenant-intelligence/cross-document-covenant";
import {
  contemplatedFromAskDraft,
  CROSS_DOCUMENT_CAPACITY_VERSION,
  type CrossDocumentNumericalLayer,
} from "@/lib/product/covenant-intelligence/cross-document-capacity";
import {
  projectPermissionLayers,
  type CrossDocumentPermissionLayers,
} from "@/lib/product/covenant-intelligence/cross-document-permission-layers";

/** Ask does not invent a financial snapshot — numerical capacity stays labeled deferred. */
function deferredAskNumericalLayer(): CrossDocumentNumericalLayer {
  return {
    version: CROSS_DOCUMENT_CAPACITY_VERSION,
    authority: "LEGACY_ENGINE_CAPACITY",
    postsToLedger: false,
    financialsUsed: {
      ebitda: 0,
      totalDebt: 0,
      securedDebt: 0,
      cash: 0,
      totalAssets: null,
    },
    pathwayCapacities: [],
    documentSummaries: [],
    mostRestrictiveMillions: null,
    mostRestrictiveDocumentId: null,
    antiStackingNotes: [],
    conditionsSeparatelyEvaluated: true,
    nonNumericRestrictions: [],
    note:
      "Ask surface: numerical capacity deferred to Simulate/Position on the same draft — not treated as certified package permission.",
  };
}

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
  /**
   * Same LEGACY_ENGINE simulation Simulate uses (when amount/kind allow).
   * Never CERTIFIED. Never posts to the ledger.
   */
  legacySimulation: LegacySimulateBridgeResult | { refused: true; reason: string } | null;
  /** Deep-link into Simulate with the same structured draft fields. */
  simulateHref: string | null;
  /**
   * Cross-document covenant conjunction over optional operative facts.
   * Uses the same draft amount/kind/secured/asOf as Ask + Simulate.
   * Null when no operative provision facts were supplied (never invents a package).
   * Kept strictly separate from legacySimulation — never a certified package grant.
   */
  crossDocumentVerdict: CrossDocumentCovenantVerdict | null;
  /**
   * Honesty projection: numerical capacity vs legal restrictions vs conditions vs
   * certification. Present only when crossDocumentVerdict is evaluated.
   */
  permissionLayers: CrossDocumentPermissionLayers | null;
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
  // Check unsecured before secured — "unsecured" contains the substring "secured".
  if (/\bunsecured\b/.test(q) && /debt|borrow|incur|loan|notes?/.test(q)) return "UNSECURED_DEBT";
  if (/\bsecured\b|\blien\b|\bcollateral\b/.test(q) && /debt|borrow|incur|loan|notes?/.test(q)) return "SECURED_DEBT";
  if (/debt|borrow|incur|loan|notes?/.test(q)) return "UNSECURED_DEBT";
  return "UNKNOWN";
}

/** Parse a contemplated transaction into a structured draft (no inventing of missing fields). */
export function parseTransactionDraft(question: string): TransactionDraft {
  const evaluationDate = extractEvaluationDate(question);
  const amountMillions = extractAmountMillions(question);
  const kind = inferKind(question);
  const q = question.toLowerCase();
  const secured =
    kind === "SECURED_DEBT"
      ? true
      : kind === "UNSECURED_DEBT"
        ? false
        : kind === "ACQUISITION"
          ? /\bunsecured\b/.test(q)
            ? false
            : true
          : /\bunsecured\b/.test(q)
            ? false
            : /\bsecured\b|\blien\b/.test(q)
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
  /**
   * Optional operative provision facts for cross-document conjunction.
   * When omitted, crossDocumentVerdict is null (Ask does not invent a financing package).
   */
  crossDocumentProvisions?: OperativeProvisionFact[];
  requiredAbsentDocumentIds?: Array<{ documentId: string; label: string; reason: string }>;
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

  const simulateAction = simulateActionFromAskKind(draft.kind);
  const simulateHref =
    simulateAction && draft.amountMillions != null
      ? buildSimulateHandoffHref(args.companyId, {
          action: simulateAction,
          amountMillions: draft.amountMillions,
          secured: draft.secured,
          evaluationDate: draft.evaluationDate,
          source: "ask",
        })
      : null;

  let legacySimulation: TransactionAnalysisResult["legacySimulation"] = null;
  const legacyKind =
    draft.kind === "SECURED_DEBT" ||
    draft.kind === "UNSECURED_DEBT" ||
    draft.kind === "RESTRICTED_PAYMENT" ||
    draft.kind === "INVESTMENT"
      ? draft.kind
      : null;
  if (legacyKind && draft.amountMillions != null) {
    legacySimulation = await runLegacyEngineSimulation({
      companyId: args.companyId,
      kind: legacyKind,
      amountMillions: draft.amountMillions,
      secured: draft.secured,
      asOfDate: draft.evaluationDate ? new Date(`${draft.evaluationDate}T12:00:00.000Z`) : undefined,
    });
  }

  const crossDocumentVerdict =
    args.crossDocumentProvisions && args.crossDocumentProvisions.length > 0
      ? evaluateCrossDocumentTransaction({
          transaction: contemplatedFromAskDraft(draft),
          provisions: args.crossDocumentProvisions,
          requiredAbsentDocumentIds: args.requiredAbsentDocumentIds,
          verifiedPackage: args.verifiedPackage ?? null,
          verifiedRulebookHasTrustedUnits: false,
        })
      : null;

  const permissionLayers: CrossDocumentPermissionLayers | null = crossDocumentVerdict
    ? projectPermissionLayers({
        verdict: crossDocumentVerdict,
        numerical: deferredAskNumericalLayer(),
        pathEnumeration,
      })
    : null;

  if (draft.missingConfirmations.length > 0 && !args.confirmed) {
    return {
      draft,
      readiness,
      authoritative,
      certifiedAttempt,
      corpus,
      pathEnumeration,
      legacySimulation,
      simulateHref,
      crossDocumentVerdict,
      permissionLayers,
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
      legacySimulation,
      simulateHref,
      crossDocumentVerdict,
      permissionLayers,
      answer: {
        kind: "certified",
        headline: "Certified capacity evaluated under verified-execution REQUIRE",
        detail: `Cutoff ${authoritative.cutoff.reportingPeriodKey ?? "—"} → snapshot ${authoritative.cutoff.approvedSnapshotId ?? "—"}. Ledger usages applied: ${authoritative.activeLedgerUsageCount}.`,
        limitations: [authoritative.certified.authorityNote],
      },
    };
  }

  if (legacySimulation && !("refused" in legacySimulation)) {
    const leg: LegacySimulateBridgeResult = legacySimulation;
    return {
      draft,
      readiness,
      authoritative,
      certifiedAttempt,
      corpus,
      pathEnumeration,
      legacySimulation,
      simulateHref,
      crossDocumentVerdict,
      permissionLayers,
      answer: {
        kind: "legacy_labeled",
        headline: `LEGACY_ENGINE simulation: ${leg.overallStatus} (open Simulate for interactive slider)`,
        detail: [
          `Amount $${leg.amountMillions}M · ${leg.kind}`,
          leg.debt
            ? `Cross-document debt: ${leg.debt.perDocument.map((d) => `${d.documentName}=${d.status}`).join("; ")}`
            : null,
          leg.restrictedPayment
            ? `RP/investment on ${leg.restrictedPayment.documentName ?? leg.restrictedPayment.documentId}: ${leg.restrictedPayment.status}`
            : null,
          leg.crossDocument.note,
          "Certified path unavailable — LEGACY figures are not Phase 3 CERTIFIED / not Phase 4E.",
        ]
          .filter(Boolean)
          .join(" · "),
        limitations: [
          leg.authorityNote,
          authoritative.certified.authorityNote,
          pathEnumeration.note,
          authoritative.legacy.note,
        ],
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
      legacySimulation,
      simulateHref,
      crossDocumentVerdict,
      permissionLayers,
      answer: {
        kind: "insufficient_evidence",
        headline: "Transaction inputs incomplete — capacity withheld",
        detail: [
          authoritative.cutoff.state !== "RESOLVED"
            ? `Cutoff: ${authoritative.cutoff.state}`
            : `Cutoff resolved: ${authoritative.cutoff.reportingPeriodKey}`,
          ...authoritative.missingInputs.map((m) => `Missing: ${m}`),
          ...certifiedAttempt.blockers.map((b) => `Certified blocker: ${b}`),
          legacySimulation && "refused" in legacySimulation ? `Legacy simulate: ${legacySimulation.reason}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
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
    legacySimulation,
    simulateHref,
    crossDocumentVerdict,
    permissionLayers,
    answer: {
      kind: "review_required",
      headline: "Source-backed analysis available; certified execution not available",
      detail:
        corpus?.kind === "answered"
          ? corpus.detail
          : "Governing excerpts may be incomplete. Open Simulate for the shared LEGACY_ENGINE slider, or approve NS-4 certificate + supply VerifiedExecutionPackage for certified capacity.",
      limitations: [authoritative.certified.authorityNote, pathEnumeration.note, authoritative.legacy.note],
    },
  };
}
