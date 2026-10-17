/**
 * Structured transaction-analysis intake for Ask Headroom.
 * Preserves corpus research separately; this path is North-Star gated.
 */
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
  attemptVerifiedSimulate,
  summarizeVerifiedSimulate,
  type VerifiedSimulateResult,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import type { CrossDocumentCompleteness } from "@/lib/product/unified-position/cross-document-completeness";

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
import { parseTransactionDraft, type TransactionDraft } from "./parse-transaction-draft";
import { legacyKindFromQuestion } from "./legacy-kind";
export { parseTransactionDraft, type TransactionDraft };

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
      netWorth: null,
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

export interface TransactionAnalysisResult {
  draft: TransactionDraft;
  readiness: Awaited<ReturnType<typeof loadTransactionWorkflowReadiness>>;
  authoritative: Awaited<ReturnType<typeof loadAuthoritativeCapacity>>;
  /** Full verified-simulate attempt (gates intact; may be refusal-only). */
  verifiedSimulate: VerifiedSimulateResult;
  /** Compact verified summary for UI. */
  verifiedSummary: ReturnType<typeof summarizeVerifiedSimulate>;
  /** @deprecated Prefer verifiedSimulate.certified — kept for callers expecting certifiedAttempt. */
  certifiedAttempt: VerifiedSimulateResult["certified"];
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
   * Executable verified outcomes (when gates pass) vs correct refusals.
   * Separated so UI never conflates LEGACY figures with CERTIFIED execution.
   */
  executableOutcomes: {
    verifiedExecutable: boolean;
    verifiedBlockers: string[];
    legacyOverallStatus: string | null;
    completeness: CrossDocumentCompleteness | null;
  };
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

/**
 * Full transaction-analysis workflow for product Ask.
 * Does not treat AI pathways as certified. Does not bypass Phase 3 / 4E gates.
 * Ask never invents favorable capacity independently of the shared engine.
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

  const verifiedSimulate = await attemptVerifiedSimulate({
    companyId: args.companyId,
    evaluationDate: draft.evaluationDate ?? "",
    amountMillions: draft.amountMillions ?? 0,
    kind: draft.kind,
    secured: draft.secured,
    verifiedPackage: args.verifiedPackage ?? null,
  });
  const verifiedSummary = summarizeVerifiedSimulate(verifiedSimulate);

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
  // Rule 62: the repayment override lives in legacy-kind — a
  // "repay" mention that is only the use of proceeds (incur debt
  // TO repay notes) must not flip the simulation to repayment.
  const legacyKind = legacyKindFromQuestion(args.question, draft.kind);
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

  const completeness =
    legacySimulation && !("refused" in legacySimulation) ? legacySimulation.completeness : null;

  const executableOutcomes = {
    verifiedExecutable: verifiedSimulate.executable,
    verifiedBlockers: verifiedSummary.blockers,
    legacyOverallStatus:
      legacySimulation && !("refused" in legacySimulation) ? legacySimulation.overallStatus : null,
    completeness,
  };

  const base = {
    draft,
    readiness,
    authoritative,
    verifiedSimulate,
    verifiedSummary,
    certifiedAttempt: verifiedSimulate.certified,
    corpus,
    pathEnumeration,
    legacySimulation,
    simulateHref,
    executableOutcomes,
    crossDocumentVerdict,
    permissionLayers,
  };

  if (draft.missingConfirmations.length > 0 && !args.confirmed) {
    return {
      ...base,
      answer: {
        kind: "needs_confirmation",
        headline: "Confirm essential transaction details",
        detail: `Missing: ${draft.missingConfirmations.join("; ")}. Headroom will not assume today’s date, latest quarter, or an amount.`,
        limitations: [authoritative.certified.authorityNote, pathEnumeration.note, ...verifiedSummary.blockers],
      },
    };
  }

  if (verifiedSimulate.executable) {
    return {
      ...base,
      answer: {
        kind: "certified",
        headline: "Verified transaction simulation EXECUTED under REQUIRE",
        detail: [
          `Cutoff ${authoritative.cutoff.reportingPeriodKey ?? "—"} → snapshot ${authoritative.cutoff.approvedSnapshotId ?? "—"}`,
          `Path ${verifiedSimulate.selectedPathId ?? "—"}`,
          `Capacity ${verifiedSummary.capacityOutcome}; simulation ${verifiedSummary.simulationOutcome}`,
          completeness ? `Cross-doc: ${completeness.verdict}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        limitations: [verifiedSimulate.certified.authorityNote],
      },
    };
  }

  if (legacySimulation && !("refused" in legacySimulation)) {
    const leg: LegacySimulateBridgeResult = legacySimulation;
    const binding =
      leg.debt?.perDocument.find((d) => d.status === "blocked") ??
      (leg.debt?.bindingDocumentIds[0]
        ? leg.debt.perDocument.find((d) => d.documentId === leg.debt!.bindingDocumentIds[0])
        : null);
    return {
      ...base,
      answer: {
        kind: "legacy_labeled",
        headline: `LEGACY_ENGINE simulation: ${leg.overallStatus} (open Simulate for interactive slider)`,
        detail: [
          `Amount $${leg.amountMillions}M · ${leg.kind}`,
          binding
            ? `Binding restriction: ${binding.documentName}${binding.sectionRef ? ` (${binding.sectionRef})` : ""} — ${binding.status}`
            : null,
          leg.debt
            ? `Cross-document debt: ${leg.debt.perDocument.map((d) => `${d.documentName}=${d.status}`).join("; ")}`
            : null,
          leg.restrictedPayment
            ? `RP/investment on ${leg.restrictedPayment.documentName ?? leg.restrictedPayment.documentId}: ${leg.restrictedPayment.status}`
            : null,
          leg.effects && !("refused" in leg.effects)
            ? `Pre/post TNL ${leg.effects.pre.totalNetLeverage?.toFixed(2) ?? "—"}x → ${leg.effects.post.totalNetLeverage?.toFixed(2) ?? "—"}x`
            : null,
          completeness ? `Completeness: ${completeness.verdict} — ${completeness.summary}` : leg.crossDocument.note,
          `Verified path blocked: ${verifiedSummary.blockers.join(", ") || "see gates"} — LEGACY figures are not Phase 3 CERTIFIED / not Phase 4E.`,
        ]
          .filter(Boolean)
          .join(" · "),
        limitations: [
          leg.authorityNote,
          authoritative.certified.authorityNote,
          pathEnumeration.note,
          authoritative.legacy.note,
          ...verifiedSummary.blockers,
        ],
      },
    };
  }

  if (!readiness.canRunTransactionWorkflow || authoritative.status === "NEEDS_INPUT") {
    return {
      ...base,
      answer: {
        kind: "insufficient_evidence",
        headline: "Transaction inputs incomplete — capacity withheld",
        detail: [
          authoritative.cutoff.state !== "RESOLVED"
            ? `Cutoff: ${authoritative.cutoff.state}`
            : `Cutoff resolved: ${authoritative.cutoff.reportingPeriodKey}`,
          ...authoritative.missingInputs.map((m) => `Missing: ${m}`),
          ...verifiedSummary.blockers.map((b) => `Verified blocker: ${b}`),
          legacySimulation && "refused" in legacySimulation ? `Legacy simulate: ${legacySimulation.reason}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        limitations: [authoritative.certified.authorityNote, pathEnumeration.note, authoritative.legacy.note],
      },
    };
  }

  return {
    ...base,
    answer: {
      kind: "review_required",
      headline: "Source-backed analysis available; verified execution not available",
      detail:
        corpus?.kind === "answered"
          ? corpus.detail
          : `Verified blockers: ${verifiedSummary.blockers.join(", ") || "none listed"}. Open Simulate for the shared LEGACY_ENGINE slider, or approve NS-4 certificate + supply VerifiedExecutionPackage for verified capacity.`,
      limitations: [authoritative.certified.authorityNote, pathEnumeration.note, authoritative.legacy.note],
    },
  };
}
