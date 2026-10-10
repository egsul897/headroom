/**
 * Numerical capacity layer for cross-document reasoning.
 *
 * Composes Agent 3 / legacy covenant-engine mathematics and Phase 4D
 * simulateVerifiedTransaction — does not invent a parallel calculator.
 *
 * Legal conjunction remains in cross-document-covenant.ts. Numerical capacity
 * is attached per pathway / document; the most restrictive applicable
 * constraint governs when every side is modeled — without claiming every
 * legal restriction reduces to a single MIN.
 */

import {
  computeCovenantPosition,
  computeLeverageMetrics,
  evaluateProvision,
  simulateDebtIncurrence,
  type CompanyCovenantData,
  type CovenantProvisionInput,
  type DocumentInput,
  type FinancialSnapshotInput,
  type FormulaType,
} from "@/lib/covenant-engine";
import type { VerifiedTransactionResult } from "@/lib/contract-model/verified-execution";
import type {
  ContemplatedTransaction,
  CrossDocumentCovenantVerdict,
  OperativeProvisionFact,
} from "./cross-document-covenant";

export const CROSS_DOCUMENT_CAPACITY_VERSION = "product.cross-document-capacity.v1";

export interface PathwayCapacity {
  documentId: string;
  sectionRef: string;
  formulaType: FormulaType;
  status: "modeled" | "review_required" | "not_tested" | "blocked";
  capacityMillions: number | null;
  remainingVsAmount: "SUFFICIENT" | "INSUFFICIENT" | "UNKNOWN";
  note: string;
}

export interface DocumentCapacitySummary {
  documentId: string;
  documentName: string;
  securedStatus: string;
  unsecuredStatus: string;
  securedCapacityMillions: number | null;
  unsecuredCapacityMillions: number | null;
  bindingCode?: string;
}

export interface CrossDocumentNumericalLayer {
  version: typeof CROSS_DOCUMENT_CAPACITY_VERSION;
  authority: "LEGACY_ENGINE_CAPACITY" | "VERIFIED_4D_SIMULATION" | "MIXED";
  postsToLedger: false;
  financialsUsed: {
    ebitda: number;
    totalDebt: number;
    securedDebt: number;
    cash: number;
    totalAssets: number | null;
  };
  pathwayCapacities: PathwayCapacity[];
  documentSummaries: DocumentCapacitySummary[];
  /** Tightest modeled cross-document capacity on the relevant side, when all docs modeled. */
  mostRestrictiveMillions: number | null;
  mostRestrictiveDocumentId: string | null;
  antiStackingNotes: string[];
  conditionsSeparatelyEvaluated: true;
  /** Legal restrictions that are not reduced to a number. */
  nonNumericRestrictions: string[];
  prePost?: {
    preLeverage: number | null;
    postLeverage: number | null;
    debtSimulationStatus: string;
    ratioTestsClear: boolean | null;
    note: string;
  };
  verifiedSimulation?: {
    outcome: VerifiedTransactionResult["outcome"];
    selectedPathResult?: string;
    simulationStatus?: string;
    note: string;
  };
  note: string;
}

function factToProvision(fact: OperativeProvisionFact, index: number): CovenantProvisionInput | null {
  if (fact.capacityUsd == null || fact.posture !== "PERMISSION") return null;
  if (fact.family !== "DEBT_INCURRENCE" && fact.family !== "LIENS" && fact.family !== "INVESTMENTS" && fact.family !== "RESTRICTED_PAYMENTS" && fact.family !== "SHARED_CAPACITY") {
    return null;
  }
  const millions = fact.capacityUsd / 1_000_000;
  return {
    id: `xd-cap-${fact.documentId}-${fact.sectionRef}-${index}`,
    documentId: fact.documentId,
    code: fact.sectionRef.replace(/[^\w]/g, "_"),
    basketName: `${fact.documentLabel} §${fact.sectionRef}`,
    sectionRef: fact.sectionRef,
    formulaType: "FLAT_AMOUNT",
    thresholdValue: millions,
    params: null,
  };
}

function buildCompanyData(
  provisions: OperativeProvisionFact[],
  financials: FinancialSnapshotInput,
  txn: ContemplatedTransaction,
): CompanyCovenantData {
  const mapped = provisions
    .map((f, i) => factToProvision(f, i))
    .filter((p): p is CovenantProvisionInput => p != null);

  const docIds = [...new Set(provisions.map((p) => p.documentId))];
  const documents: DocumentInput[] = docIds.map((id) => {
    const label = provisions.find((p) => p.documentId === id)?.documentLabel ?? id;
    const debtFamilies = new Set(["DEBT_INCURRENCE", "LIENS", "SHARED_CAPACITY"]);
    const debtCodes = mapped
      .filter((p) => {
        if (p.documentId !== id) return false;
        const fact = provisions.find((f) => f.sectionRef === p.sectionRef && f.documentId === id);
        return fact ? debtFamilies.has(fact.family) : true;
      })
      .map((p) => p.code);
    const expr =
      debtCodes.length === 0
        ? undefined
        : debtCodes.length === 1
          ? { op: "REF" as const, code: debtCodes[0]! }
          : { op: "MAX" as const, items: debtCodes.map((c) => ({ op: "REF" as const, code: c })) };
    return {
      id,
      name: label,
      type: "CREDIT_AGREEMENT",
      capacityFormulas: expr
        ? {
            secured: txn.secured === false ? undefined : expr,
            unsecured: expr,
          }
        : undefined,
    };
  });

  return {
    companyId: "cross-document-capacity-eval",
    documents,
    provisions: mapped,
    financials,
    ledger: [],
  };
}

/**
 * Attach numerical capacity evaluation to an existing cross-document verdict.
 * Does not alter overallResult conjunction logic.
 */
export function attachNumericalCapacity(params: {
  verdict: CrossDocumentCovenantVerdict;
  provisions: OperativeProvisionFact[];
  financials: FinancialSnapshotInput;
  /**
   * Optional precomputed Phase 4D result (e.g. from runFixtureCertifiedPath).
   * Caller owns VEP + resolver wiring — this layer never posts a ledger.
   */
  verifiedSimulationResult?: VerifiedTransactionResult | null;
}): CrossDocumentNumericalLayer {
  const txn = params.verdict.transaction;
  const data = buildCompanyData(params.provisions, params.financials, txn);
  const metrics = computeLeverageMetrics(params.financials);
  const position = computeCovenantPosition(data);

  const pathwayCapacities: PathwayCapacity[] = [];
  const antiStackingNotes: string[] = [...params.verdict.antiStackingNotes];
  const nonNumeric: string[] = [];

  for (const fact of params.provisions) {
    if (fact.conditions.length > 0 && fact.capacityUsd != null) {
      // Conditions stay separate from the number.
    }
    if (fact.posture === "PERMISSION" && fact.capacityUsd == null) {
      nonNumeric.push(`${fact.documentLabel} §${fact.sectionRef}: qualitative/ratio permission — not reduced to a flat number.`);
      continue;
    }
    if (fact.family === "INTERCREDITOR" || fact.family === "SUBSIDIARY_GUARANTOR") {
      nonNumeric.push(`${fact.documentLabel} §${fact.sectionRef}: ${fact.family} restriction is not a capacity number.`);
      continue;
    }
    const prov = factToProvision(fact, pathwayCapacities.length);
    if (!prov) continue;
    const ev = evaluateProvision(prov, params.financials, metrics);
    const amountM = txn.amountUsd != null ? txn.amountUsd / 1_000_000 : null;
    let remainingVsAmount: PathwayCapacity["remainingVsAmount"] = "UNKNOWN";
    if (ev.status === "modeled" && ev.capacity != null && amountM != null) {
      remainingVsAmount = ev.capacity + 1e-9 >= amountM ? "SUFFICIENT" : "INSUFFICIENT";
    }
    pathwayCapacities.push({
      documentId: fact.documentId,
      sectionRef: fact.sectionRef,
      formulaType: prov.formulaType,
      status: ev.status === "modeled" ? "modeled" : ev.status === "review_required" ? "review_required" : "not_tested",
      capacityMillions: ev.capacity ?? null,
      remainingVsAmount,
      note:
        ev.status === "modeled"
          ? `FLAT_AMOUNT capacity $${ev.capacity}M via evaluateProvision (Agent 3 / covenant-engine).`
          : ev.reason ?? ev.status,
    });
    if (fact.sharedCapacityPeers?.length) {
      antiStackingNotes.push(
        `${fact.sectionRef} shares capacity with ${fact.sharedCapacityPeers.join(", ")} — do not double-count.`,
      );
    }
  }

  const documentSummaries: DocumentCapacitySummary[] = position.documents.map((d) => ({
    documentId: d.documentId,
    documentName: d.documentName,
    securedStatus: d.securedStatus,
    unsecuredStatus: d.unsecuredStatus,
    securedCapacityMillions: d.securedCapacity ?? null,
    unsecuredCapacityMillions: d.unsecuredCapacity ?? null,
    bindingCode: d.securedBindingCode ?? d.unsecuredBindingCode,
  }));

  const side = txn.secured === true ? "secured" : "unsecured";
  const cross = side === "secured" ? position.crossDocumentSecured : position.crossDocumentUnsecured;
  const mostRestrictiveMillions = cross.status === "modeled" ? (cross.capacity ?? null) : null;
  const mostRestrictiveDocumentId = cross.bindingDocumentId ?? null;

  let prePost: CrossDocumentNumericalLayer["prePost"];
  if (txn.amountUsd != null && (txn.kind === "SECURED_DEBT" || txn.kind === "UNSECURED_DEBT")) {
    const sim = simulateDebtIncurrence(
      data,
      position,
      txn.amountUsd / 1_000_000,
      txn.secured === true,
    );
    prePost = {
      preLeverage: metrics.totalNetLeverage,
      postLeverage: sim.proForma.totalNetLeverage,
      debtSimulationStatus: sim.status,
      ratioTestsClear: sim.ratioTests.length === 0 ? null : sim.ratioTests.every((t) => t.status === "clear"),
      note: "Hypothetical debt incurrence via simulateDebtIncurrence — postsToLedger=false; package reevaluated in memory only.",
    };
  }

  let verifiedSimulation: CrossDocumentNumericalLayer["verifiedSimulation"];
  if (params.verifiedSimulationResult) {
    const result = params.verifiedSimulationResult;
    verifiedSimulation = {
      outcome: result.outcome,
      selectedPathResult:
        result.outcome === "EXECUTED"
          ? String(result.simulation?.selectedPathResult ?? "")
          : undefined,
      simulationStatus:
        result.outcome === "EXECUTED" ? String(result.simulation?.simulationStatus ?? "") : undefined,
      note:
        result.outcome === "REFUSED"
          ? `Phase 4D simulation REFUSED — boundary/gate refusal (not posted).`
          : "Phase 4D simulateVerifiedTransaction executed in memory; proposed ledger effects only (not posted).",
    };
  }

  return {
    version: CROSS_DOCUMENT_CAPACITY_VERSION,
    authority: verifiedSimulation ? "MIXED" : "LEGACY_ENGINE_CAPACITY",
    postsToLedger: false,
    financialsUsed: {
      ebitda: params.financials.ebitda,
      totalDebt: params.financials.totalDebt,
      securedDebt: params.financials.securedDebt,
      cash: params.financials.cash,
      totalAssets: params.financials.totalAssets ?? null,
    },
    pathwayCapacities,
    documentSummaries,
    mostRestrictiveMillions,
    mostRestrictiveDocumentId,
    antiStackingNotes: [...new Set(antiStackingNotes)],
    conditionsSeparatelyEvaluated: true,
    nonNumericRestrictions: nonNumeric,
    prePost,
    verifiedSimulation,
    note:
      "Numerical capacity composed from covenant-engine evaluateProvision / computeCovenantPosition / simulateDebtIncurrence. Legal conjunction and non-numeric restrictions are preserved separately — not collapsed into a single MIN when unsupported.",
  };
}

/** Map Ask TransactionDraft fields onto ContemplatedTransaction amounts. */
export function contemplatedFromAskDraft(draft: {
  rawQuestion: string;
  evaluationDate: string | null;
  amountMillions: number | null;
  kind: ContemplatedTransaction["kind"];
  secured: boolean | null;
}): ContemplatedTransaction {
  return {
    description: draft.rawQuestion,
    kind: draft.kind,
    amountUsd: draft.amountMillions != null ? draft.amountMillions * 1_000_000 : null,
    secured: draft.secured,
    asOfDate: draft.evaluationDate ?? "1970-01-01",
  };
}
