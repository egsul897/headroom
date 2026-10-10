/**
 * Shared LEGACY_ENGINE simulation bridge for Ask (and demos).
 * Calls the same covenant-engine functions as SimulateClient — never invents CERTIFIED.
 */

import {
  computeCovenantPosition,
  documentsWithRpWaterfall,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type CompanyCovenantData,
  type DebtIncurrenceSimulation,
  type RestrictedPaymentSimulation,
  type TransactionStatus,
} from "@/lib/covenant-engine";
import { loadCovenantDataOrEmpty } from "@/lib/covenant-overview-service";
import { buildSolverContext } from "@/lib/dashboard-service";
import {
  classifyCrossDocumentCompleteness,
  type CrossDocumentCompleteness,
} from "@/lib/product/unified-position/cross-document-completeness";
import {
  computeTransactionEffects,
  effectKindFromAskKind,
  type TransactionEffectsResult,
} from "@/lib/product/unified-position/transaction-effects";

export type LegacySimulateKind =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "DEBT_REPAYMENT"
  | "ELIGIBLE_EQUITY_CONTRIBUTION";

export interface LegacySimulateBridgeResult {
  authority: "LEGACY_ENGINE";
  authorityNote: string;
  kind: LegacySimulateKind;
  amountMillions: number;
  secured: boolean | null;
  preTransaction: {
    totalNetLeverage: number | null;
    seniorSecuredNetLeverage: number | null;
    financialAsOf: string | null;
  };
  overallStatus: TransactionStatus;
  debt?: {
    status: TransactionStatus;
    bindingDocumentIds: string[];
    perDocument: Array<{
      documentId: string;
      documentName: string;
      status: TransactionStatus;
      reason?: string;
      sectionRef?: string | null;
    }>;
  };
  restrictedPayment?: {
    documentId: string;
    documentName?: string;
    status: TransactionStatus;
    reason?: string;
    remaining?: number;
  };
  crossDocument: {
    documentsEvaluated: number;
    documentsNotTested: number;
    note: string;
  };
  /** Structured completeness — never overall-permit from a tested subset alone. */
  completeness: CrossDocumentCompleteness;
  /** Deterministic pre/post financials + basket deltas (LEGACY labeled). */
  effects: TransactionEffectsResult | { refused: true; reason: string } | null;
  postsToLedger: false;
}

function overallFromDebt(sim: DebtIncurrenceSimulation): TransactionStatus {
  return sim.status;
}

/**
 * Run the same deterministic covenant-engine simulation Simulate uses.
 * Does not write the ledger. Does not claim CERTIFIED / Phase 4E.
 */
export async function runLegacyEngineSimulation(args: {
  companyId: string;
  kind: LegacySimulateKind;
  amountMillions: number;
  secured?: boolean | null;
  asOfDate?: Date;
}): Promise<LegacySimulateBridgeResult | { refused: true; reason: string }> {
  if (!(args.amountMillions >= 0) || !Number.isFinite(args.amountMillions)) {
    return { refused: true, reason: "Amount must be a non-negative finite number (millions)." };
  }
  const asOf = args.asOfDate ?? new Date();
  const data: CompanyCovenantData = await loadCovenantDataOrEmpty(args.companyId, asOf);
  if (!data.financials) {
    return { refused: true, reason: "No financial snapshot for company — LEGACY simulation withheld (not invented)." };
  }
  const position = computeCovenantPosition(data);
  const financialAsOf = args.asOfDate ? args.asOfDate.toISOString().slice(0, 10) : null;

  const base = {
    authority: "LEGACY_ENGINE" as const,
    authorityNote:
      "LEGACY_ENGINE · NOT_CERTIFIED_4E — same covenant-engine path as Simulate. Not Phase 3 package CERTIFIED. Not certified Phase 4E. Hypothetical — does not post to the ledger.",
    kind: args.kind,
    amountMillions: args.amountMillions,
    secured: args.secured ?? null,
    preTransaction: {
      totalNetLeverage: position.metrics.totalNetLeverage ?? null,
      seniorSecuredNetLeverage: position.metrics.seniorSecuredNetLeverage ?? null,
      financialAsOf,
    },
    postsToLedger: false as const,
  };

  const effectsKind =
    args.kind === "DEBT_REPAYMENT"
      ? "DEBT_REPAYMENT"
      : args.kind === "ELIGIBLE_EQUITY_CONTRIBUTION"
        ? "ELIGIBLE_EQUITY_CONTRIBUTION"
        : effectKindFromAskKind(
            args.kind === "SECURED_DEBT" || args.kind === "UNSECURED_DEBT"
              ? args.kind
              : args.kind === "INVESTMENT"
                ? "INVESTMENT"
                : "RESTRICTED_PAYMENT",
          );
  const effects =
    effectsKind != null
      ? computeTransactionEffects({
          data,
          kind: effectsKind,
          amountMillions: args.amountMillions,
          secured: args.secured,
        })
      : null;

  if (args.kind === "DEBT_REPAYMENT" || args.kind === "ELIGIBLE_EQUITY_CONTRIBUTION") {
    const completeness = classifyCrossDocumentCompleteness({
      documentsOnFile: data.documents.map((d) => ({ id: d.id, name: d.name })),
      evaluated: [],
    });
    // Override empty-eval INSUFFICIENT when we have docs but no restriction model for repay/equity.
    const completenessAdjusted: CrossDocumentCompleteness =
      data.documents.length > 0
        ? {
            ...completeness,
            verdict: "NOT_FULLY_EVALUATED",
            summary: `${args.kind} pre/post financials computed; restriction enumeration for this effect kind is not fully configured across all documents.`,
            documentsOnFile: data.documents.length,
            documentsEvaluated: 0,
            documentsNotTested: data.documents.length,
            notTested: data.documents.map((d) => ({
              documentId: d.id,
              documentName: d.name,
              status: "not_configured" as const,
              reason: "No dedicated restriction test wired for this effect kind yet.",
            })),
            overallPermissionSupportable: false,
          }
        : completeness;
    return {
      ...base,
      overallStatus: "review_required",
      crossDocument: {
        documentsEvaluated: 0,
        documentsNotTested: data.documents.length,
        note: completenessAdjusted.summary,
      },
      completeness: completenessAdjusted,
      effects,
    };
  }

  if (args.kind === "SECURED_DEBT" || args.kind === "UNSECURED_DEBT") {
    const secured = args.kind === "SECURED_DEBT" ? true : args.secured === true ? true : false;
    const solverContext = await buildSolverContext(args.companyId, asOf);
    const sim = simulateDebtIncurrence(data, position, args.amountMillions, secured, solverContext);
    const completeness = classifyCrossDocumentCompleteness({
      documentsOnFile: data.documents.map((d) => ({ id: d.id, name: d.name })),
      evaluated: sim.perDocument.map((d) => ({
        documentId: d.documentId,
        documentName: d.documentName,
        status: d.status,
        reason: d.reason,
        sectionRef: d.bindingProvision?.sectionRef ?? null,
        binding: sim.binding?.documentId === d.documentId,
      })),
    });
    return {
      ...base,
      secured,
      overallStatus: overallFromDebt(sim),
      debt: {
        status: sim.status,
        bindingDocumentIds: sim.binding ? [sim.binding.documentId] : [],
        perDocument: sim.perDocument.map((d) => ({
          documentId: d.documentId,
          documentName: d.documentName,
          status: d.status,
          reason: d.reason,
          sectionRef: d.bindingProvision?.sectionRef ?? null,
        })),
      },
      crossDocument: {
        documentsEvaluated: completeness.documentsEvaluated,
        documentsNotTested: completeness.documentsNotTested,
        note: completeness.summary,
      },
      completeness,
      effects,
    };
  }

  const rpDocs = documentsWithRpWaterfall(data);
  const docId = rpDocs[0]?.id;
  if (!docId) {
    return {
      refused: true,
      reason: "No restricted-payment waterfall configured on any document — RP/investment simulation not tested.",
    };
  }
  const kind = args.kind === "INVESTMENT" ? "investment" : "dividend";
  const sim: RestrictedPaymentSimulation = simulateRestrictedPayment(
    data,
    position,
    docId,
    args.amountMillions,
    kind,
  );
  const completeness = classifyCrossDocumentCompleteness({
    documentsOnFile: data.documents.map((d) => ({ id: d.id, name: d.name })),
    evaluated: [
      {
        documentId: sim.documentId,
        documentName: sim.documentName ?? sim.documentId,
        status: sim.status,
        reason: sim.reason,
        sectionRef: null,
        binding: true,
      },
    ],
  });
  return {
    ...base,
    overallStatus: sim.status,
    restrictedPayment: {
      documentId: sim.documentId,
      documentName: sim.documentName,
      status: sim.status,
      reason: sim.reason,
      remaining: sim.remaining,
    },
    crossDocument: {
      documentsEvaluated: completeness.documentsEvaluated,
      documentsNotTested: completeness.documentsNotTested,
      note: completeness.summary,
    },
    completeness,
    effects,
  };
}
