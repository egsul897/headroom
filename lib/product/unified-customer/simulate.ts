/**
 * Unified Simulate — runs the shared covenant engine against verified state.
 * No calculation lives in the UI; clients POST params and receive classified results.
 */

import {
  documentsWithAssetSale,
  documentsWithRpWaterfall,
  simulateAssetSale,
  simulateDebtIncurrence,
  simulateRestrictedPayment,
  type DebtIncurrenceSimulation,
  type RestrictedPaymentKind,
} from "@/lib/covenant-engine";
import { fingerprintSimulationRequest } from "./fingerprint";
import { classifyCustomerOutcome, type ConstraintSignal } from "./outcome";
import { loadVerifiedCustomerState, type VerifiedCustomerState } from "./state";
import type {
  ControllingCitation,
  CustomerOutcomeKind,
  EngineAuthorityLabel,
  OutcomeClassification,
  StructuredTransaction,
  StructuredTransactionKind,
} from "./types";

export interface SimulateRequest {
  companyId: string;
  kind: StructuredTransactionKind;
  amountMillions: number;
  secured?: boolean | null;
  evaluationDate?: string | null;
  documentId?: string | null;
  currency?: string;
  /** When reinvesting asset-sale proceeds. */
  reinvest?: boolean;
  /**
   * Client must echo the stateFingerprint from the last Position/Simulate load.
   * Mismatch → stale state rejected (no reused evidence).
   */
  expectedStateFingerprint?: string | null;
  /**
   * Prior request fingerprint. If the amount/kind changed, the server refuses
   * to attach prior evidence — client must clear stale panels.
   */
  priorRequestFingerprint?: string | null;
}

export interface SimulateProForma {
  totalNetLeverage?: number;
  seniorSecuredNetLeverage?: number;
  fixedChargeCoverage?: number;
  cashDelta?: number;
  grossDebtDelta?: number;
}

export interface SimulateBasketStep {
  code: string;
  basketName: string;
  sectionRef: string;
  allocatedMillions: number;
}

export interface UnifiedSimulateResult {
  ok: boolean;
  stale: boolean;
  staleReason?: string;
  companyId: string;
  stateFingerprint: string;
  requestFingerprint: string;
  asOfDateIso: string;
  authority: EngineAuthorityLabel;
  kind: StructuredTransactionKind;
  amountMillions: number;
  secured: boolean | null;
  currency: string;
  outcome: OutcomeClassification;
  engineStatus: string;
  reason?: string;
  overallCapacityMillions?: number;
  proForma: SimulateProForma;
  prePostRatios: Array<{
    label: string;
    pre: number | null;
    post: number | null;
    threshold: number | null;
    sectionRef: string | null;
    documentName: string | null;
    status: string;
  }>;
  basketConsumption: SimulateBasketStep[];
  bindingConstraints: ControllingCitation[];
  crossDocumentRestrictions: ControllingCitation[];
  explanations: Array<{ text: string; citation?: ControllingCitation }>;
  /** Raw engine status retained for debugging — never treat as permission alone. */
  perDocument: Array<{
    documentId: string;
    documentName: string;
    status: string;
    capacityMillions?: number;
    sectionRef?: string;
    basketName?: string;
    reason?: string;
  }>;
}

function signalsFromDebtSim(sim: DebtIncurrenceSimulation): ConstraintSignal[] {
  const signals: ConstraintSignal[] = sim.perDocument.map((d) => ({
    status: d.status,
    tested: d.status === "clear" || d.status === "blocked",
    unsupported: d.status === "not_tested",
    label: d.documentName,
  }));
  for (const r of sim.ratioTests.filter((t) => t.applies)) {
    signals.push({
      status: r.status,
      tested: r.status === "clear" || r.status === "blocked",
      ratioClearedInIsolation: r.status === "clear",
      unsupported: r.status === "not_tested",
      label: `${r.documentName} ${r.sectionRef}`,
    });
  }
  return signals;
}

function classifyDebt(sim: DebtIncurrenceSimulation): OutcomeClassification {
  // Hard rule: a single clearing ratio never becomes SUPPORTED_PERMISSION.
  const signals = signalsFromDebtSim(sim);
  const ratioClears = sim.ratioTests.filter((r) => r.applies && r.status === "clear");
  const docsClear = sim.perDocument.filter((d) => d.status === "clear");
  const docsBlocked = sim.perDocument.some((d) => d.status === "blocked");
  const ratioBlocked = sim.ratioTests.some((r) => r.applies && r.status === "blocked");

  if (docsBlocked || ratioBlocked) {
    return classifyCustomerOutcome(signals);
  }

  if (sim.status === "not_tested") {
    return classifyCustomerOutcome([{ unsupported: true, label: sim.reason ?? "not tested" }]);
  }
  if (sim.status === "review_required") {
    return classifyCustomerOutcome([{ status: "review_required", label: sim.reason ?? "review" }]);
  }

  // Affirmative permission only when EVERY tested doc clears AND every applicable ratio clears,
  // and there is at least one non-ratio document constraint (or multiple ratio tests).
  if (sim.status === "clear") {
    if (docsClear.length === 0 && ratioClears.length === 1) {
      return {
        kind: "CONDITIONAL_OR_REVIEW_REQUIRED",
        label: "Conditional / review required",
        rationale:
          "A single ratio cleared in isolation. Affirmative permission requires every applicable document and basket constraint to clear — not one ratio alone.",
        isAffirmativePermission: false,
      };
    }
    return classifyCustomerOutcome(signals);
  }

  return classifyCustomerOutcome(signals);
}

function buildDebtResult(
  state: VerifiedCustomerState,
  req: SimulateRequest,
  requestFingerprint: string,
): UnifiedSimulateResult {
  const secured = req.secured !== false;
  if (!state.solverContext) {
    return baseFail(state, req, requestFingerprint, "MISSING_EVIDENCE", "Solver context unavailable.");
  }
  const sim = simulateDebtIncurrence(
    state.covenantData,
    state.covenantPosition,
    req.amountMillions,
    secured,
    state.solverContext,
  );
  const outcome = classifyDebt(sim);
  const bindingConstraints: ControllingCitation[] = [];
  if (sim.binding?.bindingProvision) {
    bindingConstraints.push({
      documentId: sim.binding.documentId,
      documentName: sim.binding.documentName,
      sectionRef: sim.binding.bindingProvision.sectionRef,
      provisionCode: sim.binding.bindingProvision.code,
      basketName: sim.binding.bindingProvision.basketName,
      note: "Binding capacity constraint",
    });
  }
  for (const r of sim.ratioTests.filter((t) => t.applies && t.status === "blocked")) {
    bindingConstraints.push({
      documentId: r.documentId,
      documentName: r.documentName,
      sectionRef: r.sectionRef,
      basketName: r.basketName,
      note: "Failed ratio test",
    });
  }

  const crossDocumentRestrictions: ControllingCitation[] = sim.perDocument
    .filter((d) => d.status === "not_tested" || d.status === "review_required")
    .map((d) => ({
      documentId: d.documentId,
      documentName: d.documentName,
      sectionRef: d.bindingProvision?.sectionRef ?? "—",
      note: d.reason ?? "Not tested / review required for this transaction type",
    }));

  const prePostRatios = sim.ratioTests.map((r) => ({
    label: r.basketName,
    pre: r.preTransactionRatio ?? null,
    post: r.postTransactionRatio ?? null,
    threshold: r.threshold ?? null,
    sectionRef: r.sectionRef,
    documentName: r.documentName,
    status: r.applies ? r.status : "n/a",
  }));

  const explanations: UnifiedSimulateResult["explanations"] = [
    {
      text: outcome.rationale,
      citation: bindingConstraints[0],
    },
  ];
  if (sim.reason) explanations.push({ text: sim.reason });

  return {
    ok: true,
    stale: false,
    companyId: state.companyId,
    stateFingerprint: state.stateFingerprint,
    requestFingerprint,
    asOfDateIso: state.asOfDateIso,
    authority: state.authority,
    kind: req.kind,
    amountMillions: req.amountMillions,
    secured,
    currency: req.currency ?? "USD",
    outcome,
    engineStatus: sim.status,
    reason: sim.reason,
    overallCapacityMillions: sim.overallCapacity,
    proForma: {
      totalNetLeverage: sim.proForma.totalNetLeverage,
      seniorSecuredNetLeverage: sim.proForma.seniorSecuredNetLeverage,
      fixedChargeCoverage: sim.proForma.fixedChargeCoverage,
      grossDebtDelta: req.amountMillions,
    },
    prePostRatios,
    basketConsumption: [],
    bindingConstraints,
    crossDocumentRestrictions,
    explanations,
    perDocument: sim.perDocument.map((d) => ({
      documentId: d.documentId,
      documentName: d.documentName,
      status: d.status,
      capacityMillions: d.capacity,
      sectionRef: d.bindingProvision?.sectionRef,
      basketName: d.bindingProvision?.basketName,
      reason: d.reason,
    })),
  };
}

function baseFail(
  state: VerifiedCustomerState,
  req: SimulateRequest,
  requestFingerprint: string,
  kind: CustomerOutcomeKind,
  reason: string,
): UnifiedSimulateResult {
  return {
    ok: false,
    stale: false,
    companyId: state.companyId,
    stateFingerprint: state.stateFingerprint,
    requestFingerprint,
    asOfDateIso: state.asOfDateIso,
    authority: state.authority,
    kind: req.kind,
    amountMillions: req.amountMillions,
    secured: req.secured ?? null,
    currency: req.currency ?? "USD",
    outcome: {
      kind,
      label:
        kind === "MISSING_EVIDENCE"
          ? "Missing evidence"
          : kind === "UNSUPPORTED_CALCULATION"
            ? "Unsupported calculation"
            : "Conditional / review required",
      rationale: reason,
      isAffirmativePermission: false,
    },
    engineStatus: "not_tested",
    reason,
    proForma: {},
    prePostRatios: [],
    basketConsumption: [],
    bindingConstraints: [],
    crossDocumentRestrictions: [],
    explanations: [{ text: reason }],
    perDocument: [],
  };
}

function buildRpResult(
  state: VerifiedCustomerState,
  req: SimulateRequest,
  requestFingerprint: string,
  kind: RestrictedPaymentKind,
): UnifiedSimulateResult {
  const candidates = documentsWithRpWaterfall(state.covenantData);
  const doc =
    candidates.find((d) => d.id === req.documentId) ?? candidates[0];
  if (!doc) {
    return baseFail(
      state,
      req,
      requestFingerprint,
      "UNSUPPORTED_CALCULATION",
      "No document has a restricted-payment basket configuration entered.",
    );
  }
  const sim = simulateRestrictedPayment(
    state.covenantData,
    state.covenantPosition,
    doc.id,
    req.amountMillions,
    kind,
  );
  const outcome = classifyCustomerOutcome([
    {
      status: sim.status,
      tested: sim.status === "clear" || sim.status === "blocked",
      unsupported: sim.status === "not_tested",
      label: doc.name,
    },
  ]);
  const citation: ControllingCitation = {
    documentId: doc.id,
    documentName: doc.name,
    sectionRef: sim.steps[0]?.sectionRef ?? "RP waterfall",
    note: "Restricted-payment waterfall",
  };
  const others = state.documents
    .filter((d) => d.id !== doc.id)
    .map((d) => ({
      documentId: d.id,
      documentName: d.name,
      sectionRef: "—",
      note: d.notes ?? "May separately restrict this transaction type — not tested here.",
    }));

  return {
    ok: true,
    stale: false,
    companyId: state.companyId,
    stateFingerprint: state.stateFingerprint,
    requestFingerprint,
    asOfDateIso: state.asOfDateIso,
    authority: state.authority,
    kind: req.kind,
    amountMillions: req.amountMillions,
    secured: null,
    currency: req.currency ?? "USD",
    outcome,
    engineStatus: sim.status,
    reason: sim.reason,
    proForma: {
      totalNetLeverage: sim.proFormaTotalNetLeverage,
    },
    prePostRatios: [],
    basketConsumption: sim.steps.map((s) => ({
      code: s.code,
      basketName: s.basketName,
      sectionRef: s.sectionRef,
      allocatedMillions: s.allocated,
    })),
    bindingConstraints: sim.status === "blocked" || sim.status === "clear" ? [citation] : [],
    crossDocumentRestrictions: others,
    explanations: [
      { text: outcome.rationale, citation },
      ...(sim.reason ? [{ text: sim.reason, citation }] : []),
    ],
    perDocument: [
      {
        documentId: doc.id,
        documentName: doc.name,
        status: sim.status,
        reason: sim.reason,
        sectionRef: citation.sectionRef,
      },
    ],
  };
}

function buildAssetSaleResult(
  state: VerifiedCustomerState,
  req: SimulateRequest,
  requestFingerprint: string,
): UnifiedSimulateResult {
  const candidates = documentsWithAssetSale(state.covenantData);
  const doc = candidates.find((d) => d.id === req.documentId) ?? candidates[0];
  if (!doc) {
    return baseFail(
      state,
      req,
      requestFingerprint,
      "UNSUPPORTED_CALCULATION",
      "No document has an asset-sale threshold configuration entered.",
    );
  }
  const sim = simulateAssetSale(
    state.covenantData,
    state.covenantPosition,
    doc.id,
    req.amountMillions,
    req.reinvest !== false,
  );
  const outcome = classifyCustomerOutcome([
    {
      status:
        sim.status === "clear" && !sim.offerTriggered
          ? "clear"
          : sim.status === "clear" && sim.offerTriggered
            ? "review_required"
            : sim.status,
      tested: sim.status === "clear",
      unsupported: sim.status === "not_tested",
      label: doc.name,
    },
  ]);
  const citation: ControllingCitation = {
    documentId: doc.id,
    documentName: doc.name,
    sectionRef: doc.assetSale?.thresholdCode ?? "Asset sale",
    note: "Asset-sale excess proceeds threshold",
  };
  return {
    ok: true,
    stale: false,
    companyId: state.companyId,
    stateFingerprint: state.stateFingerprint,
    requestFingerprint,
    asOfDateIso: state.asOfDateIso,
    authority: state.authority,
    kind: req.kind,
    amountMillions: req.amountMillions,
    secured: null,
    currency: req.currency ?? "USD",
    outcome,
    engineStatus: sim.offerTriggered ? "review_required" : sim.status,
    reason: sim.reason,
    proForma: { cashDelta: req.amountMillions },
    prePostRatios: [],
    basketConsumption: [],
    bindingConstraints: [citation],
    crossDocumentRestrictions: state.documents
      .filter((d) => d.id !== doc.id)
      .map((d) => ({
        documentId: d.id,
        documentName: d.name,
        sectionRef: "—",
        note: d.notes ?? "May separately restrict asset-sale proceeds — not tested here.",
      })),
    explanations: [
      {
        text: sim.offerTriggered
          ? "Asset Sale Offer required — Excess Proceeds exceed the threshold."
          : outcome.rationale,
        citation,
      },
    ],
    perDocument: [
      {
        documentId: doc.id,
        documentName: doc.name,
        status: sim.status,
        reason: sim.reason,
        sectionRef: citation.sectionRef,
      },
    ],
  };
}

/**
 * Run a simulation against the shared verified engine.
 * Rejects stale state fingerprints and refuses to reuse prior request evidence
 * when the amount (or kind) changed.
 */
export async function runUnifiedSimulation(req: SimulateRequest): Promise<UnifiedSimulateResult> {
  const state = await loadVerifiedCustomerState(req.companyId, {
    evaluationDate: req.evaluationDate,
  });

  const requestFingerprint = fingerprintSimulationRequest({
    stateFingerprint: state.stateFingerprint,
    kind: req.kind,
    amountMillions: req.amountMillions,
    secured: req.secured ?? null,
    evaluationDate: req.evaluationDate ?? null,
    documentId: req.documentId,
    currency: req.currency,
  });

  if (
    req.expectedStateFingerprint &&
    req.expectedStateFingerprint !== state.stateFingerprint
  ) {
    return {
      ...baseFail(
        state,
        req,
        requestFingerprint,
        "MISSING_EVIDENCE",
        "Verified state changed since this panel loaded — prior evidence discarded. Re-run the scenario.",
      ),
      stale: true,
      staleReason: "STATE_FINGERPRINT_MISMATCH",
    };
  }

  if (
    req.priorRequestFingerprint &&
    req.priorRequestFingerprint !== requestFingerprint
  ) {
    // Amount/kind changed: do not attach prior evidence. Caller should have cleared UI;
    // we still compute fresh results under the new fingerprint.
    // (No early return — fresh recompute is required.)
  }

  if (!Number.isFinite(req.amountMillions) || req.amountMillions < 0) {
    return baseFail(state, req, requestFingerprint, "MISSING_EVIDENCE", "Transaction amount is required.");
  }

  if (!state.canEvaluate && (req.kind === "SECURED_DEBT" || req.kind === "UNSECURED_DEBT" || req.kind === "SECURED_NOTE" || req.kind === "REVOLVER_DRAW" || req.kind === "HYBRID_SECURITY")) {
    // Still attempt engine run — readiness blockers are surfaced in outcome when empty.
  }

  switch (req.kind) {
    case "SECURED_DEBT":
    case "UNSECURED_DEBT":
    case "SECURED_NOTE":
    case "REVOLVER_DRAW":
    case "HYBRID_SECURITY":
    case "REFINANCING":
    case "ACQUISITION":
      return buildDebtResult(
        state,
        {
          ...req,
          secured:
            req.kind === "UNSECURED_DEBT"
              ? false
              : req.secured ?? (req.kind === "SECURED_DEBT" || req.kind === "SECURED_NOTE" || req.kind === "ACQUISITION" ? true : req.secured),
        },
        requestFingerprint,
      );
    case "RESTRICTED_PAYMENT":
      return buildRpResult(state, req, requestFingerprint, "dividend");
    case "INVESTMENT":
      return buildRpResult(state, req, requestFingerprint, "investment");
    case "ASSET_SALE":
      return buildAssetSaleResult(state, req, requestFingerprint);
    default:
      return baseFail(
        state,
        req,
        requestFingerprint,
        "UNSUPPORTED_CALCULATION",
        `Transaction kind ${req.kind} is not supported by the unified simulate path.`,
      );
  }
}

/** Build Simulate deep-link query from a structured Ask handoff. */
export function simulateHrefFromStructured(
  companyId: string,
  txn: StructuredTransaction,
): string {
  const params = new URLSearchParams();
  params.set("kind", txn.kind);
  if (txn.amountMillions != null) params.set("amount", String(txn.amountMillions));
  if (txn.secured != null) params.set("secured", txn.secured ? "1" : "0");
  if (txn.evaluationDate) params.set("date", txn.evaluationDate);
  if (txn.currency) params.set("currency", txn.currency);
  if (txn.entityLabel) params.set("entity", txn.entityLabel);
  params.set("handoff", txn.handoffId);
  if (txn.stateFingerprint) params.set("stateFp", txn.stateFingerprint);
  if (txn.rawQuestion) params.set("q", txn.rawQuestion.slice(0, 200));
  return `/${companyId}/simulate?${params.toString()}`;
}
