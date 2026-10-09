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

export type LegacySimulateKind = "SECURED_DEBT" | "UNSECURED_DEBT" | "RESTRICTED_PAYMENT" | "INVESTMENT";

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

  if (args.kind === "SECURED_DEBT" || args.kind === "UNSECURED_DEBT") {
    const secured = args.kind === "SECURED_DEBT" ? true : args.secured === true ? true : false;
    const solverContext = await buildSolverContext(args.companyId, asOf);
    const sim = simulateDebtIncurrence(data, position, args.amountMillions, secured, solverContext);
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
        })),
      },
      crossDocument: {
        documentsEvaluated: sim.perDocument.length,
        documentsNotTested: Math.max(0, data.documents.length - sim.perDocument.length),
        note:
          "Debt incurrence evaluates each governing document independently, then combines. Permission under one agreement does not override a prohibition under another.",
      },
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
  const others = data.documents.filter((d) => d.id !== docId).length;
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
      documentsEvaluated: 1,
      documentsNotTested: others,
      note:
        others > 0
          ? `RP/investment tested on one configured document only. ${others} other document(s) may separately restrict this transaction — open Simulate for the caveat banners.`
          : "Single governing document with RP waterfall on file.",
    },
  };
}
