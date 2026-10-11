/**
 * End-to-end authentic vertical slice orchestration (no Neon writes, no paid inference).
 */

import {
  demonstrateChangePropagation,
  type ChangePropagationResult,
} from "./change-propagation";
import {
  evaluateMatthewsVerticalSlice,
  type VerticalSliceEvaluation,
} from "./evaluate-covenants";
import {
  connectSliceToPosition,
  hasAuthenticPositionSlice,
  type AuthenticPositionSlice,
} from "./position-bridge";
import { MATTHEWS_POSITION_COMPANY_ID } from "./package-matthews";

export interface RealDashboardVerticalSliceResult {
  canonicalBaseNote: string;
  evaluation: VerticalSliceEvaluation;
  position: AuthenticPositionSlice;
  changePropagation: ChangePropagationResult;
  verdict: "REAL_DASHBOARD_VERTICAL_SLICE_PROVEN" | "PARTIALLY_PROVEN" | "NOT_YET_PROVEN";
  blockers: string[];
}

function decideVerdict(
  evaluation: VerticalSliceEvaluation,
  position: AuthenticPositionSlice,
): RealDashboardVerticalSliceResult["verdict"] {
  const numericOk =
    evaluation.verifiedCovenantsCount >= 5 &&
    evaluation.covenants.every((c) => {
      if (c.independentExpectedMm == null) return true;
      // Notes grandfather: independent expectation is NEW remaining ($0), not FLAT_AMOUNT gross.
      if (c.code === "ind_permitted_debt_2_notes") {
        return c.remainingCapacityMm === c.independentExpectedMm;
      }
      if (c.modeledCapacityMm == null) return false;
      return Math.abs(c.modeledCapacityMm - c.independentExpectedMm) < 0.05;
    });
  const positionOk =
    position.connectedMetrics.length >= 5 &&
    position.productionRemainingPublished === false &&
    position.positionView.remainingAuthoritative === false;
  const evidenceOk =
    evaluation.financialEvidence.metricsPresent.length >= 5 &&
    evaluation.utilization.attributedEventCount >= 1 &&
    evaluation.utilization.supportsRemainingClaim === false;

  if (numericOk && positionOk && evidenceOk && evaluation.productionHandoffRefused) {
    return "REAL_DASHBOARD_VERTICAL_SLICE_PROVEN";
  }
  if (evaluation.verifiedCovenantsCount >= 3 && position.connectedMetrics.length >= 3) {
    return "PARTIALLY_PROVEN";
  }
  return "NOT_YET_PROVEN";
}

/**
 * Load authentic slice for a Position companyId, or null when unsupported.
 * Pure / fixture-backed — does not query Neon.
 */
export function loadAuthenticDashboardSlice(companyId: string): AuthenticPositionSlice | null {
  if (!hasAuthenticPositionSlice(companyId)) return null;
  const evaluation = evaluateMatthewsVerticalSlice();
  return connectSliceToPosition(evaluation);
}

export function runRealDashboardVerticalSlice(): RealDashboardVerticalSliceResult {
  const evaluation = evaluateMatthewsVerticalSlice();
  const position = connectSliceToPosition(evaluation);
  const changePropagation = demonstrateChangePropagation();
  const blockers = [
    ...evaluation.missingEvidence,
    "Verified IR / Phase-3 VEP path not bound to Position for this package (leaf evaluateProvision used).",
    "Production IdP / trusted-issuer activation BLOCKED by design.",
    "AutoNation / WOR / CONMED authentic packages lack financial+utilization corpus for a parallel 5-covenant demo.",
  ];

  return {
    canonicalBaseNote: `Separate branch off canonical #293 tip; companyId=${MATTHEWS_POSITION_COMPANY_ID}`,
    evaluation,
    position,
    changePropagation,
    verdict: decideVerdict(evaluation, position),
    blockers,
  };
}
