/**
 * Position view — ratios, thresholds, baskets, utilization, remaining capacity,
 * shared constraints, evidence and financial dates. Built only from verified state.
 */

import { simulateDebtIncurrence } from "@/lib/covenant-engine";
import { classifyCustomerOutcome } from "./outcome";
import { capacitySidesFromState, type VerifiedCustomerState } from "./state";
import type { ControllingCitation, EngineAuthorityLabel, OutcomeClassification } from "./types";

export interface PositionRatioRow {
  key: string;
  label: string;
  value: string | null;
  threshold: string | null;
  documentName: string | null;
  sectionRef: string | null;
  status: "AVAILABLE" | "NOT_AVAILABLE" | "BREACH_RISK";
}

export interface PositionBasketRow {
  documentId: string;
  documentName: string;
  sectionRef: string;
  basketName: string;
  code: string;
  capacityMillions: number | null;
  status: string;
  utilizationNote: string | null;
}

export interface PositionView {
  companyId: string;
  asOfDateIso: string;
  stateFingerprint: string;
  authority: EngineAuthorityLabel;
  readinessHeadline: string;
  canEvaluate: boolean;
  financialDates: {
    asOfDateIso: string;
    hasFinancialSnapshot: boolean;
    ns4ApprovedSnapshotCount: number;
    ebitdaMillions: number | null;
    totalDebtMillions: number | null;
    cashMillions: number | null;
  };
  ratios: PositionRatioRow[];
  covenantThresholds: PositionRatioRow[];
  baskets: PositionBasketRow[];
  utilization: {
    securedRemainingMillions: number | null;
    unsecuredRemainingMillions: number | null;
    securedStatus: string;
    unsecuredStatus: string;
  };
  remainingCapacity: {
    secured: number | null;
    unsecured: number | null;
  };
  sharedConstraints: ControllingCitation[];
  evidence: ControllingCitation[];
  outcome: OutcomeClassification;
}

function fmtX(n: number | null | undefined): string | null {
  return n !== null && n !== undefined && Number.isFinite(n) ? `${n.toFixed(2)}x` : null;
}

export function buildPositionView(state: VerifiedCustomerState): PositionView {
  const sides = capacitySidesFromState(state);
  const fin = state.covenantData.financials;
  const hasSnap = Number.isFinite(fin.ebitda) && fin.ebitda > 0;
  const metrics = state.covenantPosition.metrics;

  const ratios: PositionRatioRow[] = [
    {
      key: "tnl",
      label: "Total net leverage",
      value: hasSnap ? fmtX(metrics.totalNetLeverage) : null,
      threshold: null,
      documentName: null,
      sectionRef: null,
      status: hasSnap ? "AVAILABLE" : "NOT_AVAILABLE",
    },
    {
      key: "ssnl",
      label: "Senior secured net leverage",
      value: hasSnap ? fmtX(metrics.seniorSecuredNetLeverage) : null,
      threshold: null,
      documentName: null,
      sectionRef: null,
      status: hasSnap ? "AVAILABLE" : "NOT_AVAILABLE",
    },
    {
      key: "fccr",
      label: "Fixed charge coverage",
      value: hasSnap && fin.interestExpense > 0 ? fmtX(metrics.fixedChargeCoverage) : null,
      threshold: null,
      documentName: null,
      sectionRef: null,
      status: hasSnap && fin.interestExpense > 0 ? "AVAILABLE" : "NOT_AVAILABLE",
    },
  ];

  const covenantThresholds: PositionRatioRow[] = [];
  const baskets: PositionBasketRow[] = [];
  const evidence: ControllingCitation[] = [];
  const sharedConstraints: ControllingCitation[] = [];

  for (const p of state.covenantData.provisions) {
    const doc = state.covenantData.documents.find((d) => d.id === p.documentId);
    const docName = doc?.name ?? p.documentId;
    const cap = state.covenantPosition.provisionCapacities.get(`${p.documentId}:${p.code}`);

    if (p.formulaType === "LEVERAGE_RATIO_ROOM" || p.formulaType === "COVERAGE_RATIO_ROOM") {
      covenantThresholds.push({
        key: `${p.documentId}:${p.code}`,
        label: p.basketName,
        value: hasSnap
          ? fmtX(
              p.formulaType === "LEVERAGE_RATIO_ROOM"
                ? metrics.totalNetLeverage
                : metrics.fixedChargeCoverage,
            )
          : null,
        threshold: p.thresholdValue != null ? `${p.thresholdValue.toFixed(2)}x` : null,
        documentName: docName,
        sectionRef: p.sectionRef,
        status: hasSnap ? "AVAILABLE" : "NOT_AVAILABLE",
      });
      evidence.push({
        documentId: p.documentId,
        documentName: docName,
        sectionRef: p.sectionRef,
        provisionCode: p.code,
        basketName: p.basketName,
        note: "Ratio covenant threshold",
      });
    } else {
      baskets.push({
        documentId: p.documentId,
        documentName: docName,
        sectionRef: p.sectionRef,
        basketName: p.basketName,
        code: p.code,
        capacityMillions: cap?.status === "modeled" ? (cap.capacity ?? null) : null,
        status: cap?.status ?? "not_tested",
        utilizationNote: cap?.reason ?? null,
      });
      evidence.push({
        documentId: p.documentId,
        documentName: docName,
        sectionRef: p.sectionRef,
        provisionCode: p.code,
        basketName: p.basketName,
        note: "Basket / capacity provision",
      });
    }
  }

  // Binding citations from the same simulateDebtIncurrence path Simulate uses (amount=0).
  if (state.canEvaluate && state.solverContext) {
    for (const secured of [true, false]) {
      const sim = simulateDebtIncurrence(
        state.covenantData,
        state.covenantPosition,
        0,
        secured,
        state.solverContext,
      );
      if (sim.binding?.bindingProvision) {
        sharedConstraints.push({
          documentId: sim.binding.documentId,
          documentName: sim.binding.documentName,
          sectionRef: sim.binding.bindingProvision.sectionRef,
          provisionCode: sim.binding.bindingProvision.code,
          basketName: sim.binding.bindingProvision.basketName,
          note: secured ? "Binding secured capacity constraint" : "Binding unsecured capacity constraint",
        });
      }
      for (const r of sim.ratioTests.filter((t) => t.applies)) {
        evidence.push({
          documentId: r.documentId,
          documentName: r.documentName,
          sectionRef: r.sectionRef,
          provisionCode: r.provisionId,
          basketName: r.basketName,
          note: "Applicable ratio test",
        });
      }
    }
  }

  const securedRem = sides.secured?.remainingCapacity ?? null;
  const unsecuredRem = sides.unsecured?.remainingCapacity ?? null;

  // Position is a capacity snapshot, not a contemplated transaction.
  // Never surface SUPPORTED_PERMISSION here merely because remaining capacity is modeled.
  const outcome = !state.canEvaluate
    ? classifyCustomerOutcome([{ missingEvidence: true, label: "capacity readiness" }])
    : securedRem == null && unsecuredRem == null
      ? classifyCustomerOutcome([
          { unsupported: true, status: "not_tested", label: "remaining capacity not determinable" },
        ])
      : {
          kind: "CONDITIONAL_OR_REVIEW_REQUIRED" as const,
          label: "Conditional / review required",
          rationale:
            "Position shows modeled capacity and thresholds from the shared engine. Affirmative permission requires a Simulate/Ask transaction with every applicable constraint clearing — not capacity figures alone.",
          isAffirmativePermission: false,
        };

  return {
    companyId: state.companyId,
    asOfDateIso: state.asOfDateIso,
    stateFingerprint: state.stateFingerprint,
    authority: state.authority,
    readinessHeadline: state.readiness.headline,
    canEvaluate: state.canEvaluate,
    financialDates: {
      asOfDateIso: state.asOfDateIso,
      hasFinancialSnapshot: state.readiness.hasFinancialSnapshot,
      ns4ApprovedSnapshotCount: state.readiness.ns4ApprovedSnapshotCount,
      ebitdaMillions: hasSnap ? fin.ebitda : null,
      totalDebtMillions: hasSnap ? fin.totalDebt : null,
      cashMillions: hasSnap ? fin.cash : null,
    },
    ratios,
    covenantThresholds,
    baskets,
    utilization: {
      securedRemainingMillions: securedRem,
      unsecuredRemainingMillions: unsecuredRem,
      securedStatus: securedRem != null ? "modeled" : "not_determinable",
      unsecuredStatus: unsecuredRem != null ? "modeled" : "not_determinable",
    },
    remainingCapacity: {
      secured: securedRem,
      unsecured: unsecuredRem,
    },
    sharedConstraints,
    evidence,
    outcome,
  };
}

export async function loadPositionView(
  companyId: string,
  opts?: { evaluationDate?: string | null },
): Promise<PositionView> {
  const { loadVerifiedCustomerState } = await import("./state");
  const state = await loadVerifiedCustomerState(companyId, opts);
  return buildPositionView(state);
}
