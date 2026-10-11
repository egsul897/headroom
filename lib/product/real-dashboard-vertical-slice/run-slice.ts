/**
 * End-to-end authentic vertical slice orchestration (no Neon writes, no paid inference).
 *
 * Acceptance milestones (PR #304 independent review) are reported separately —
 * do not collapse them into a single REAL_DASHBOARD_VERTICAL_SLICE_PROVEN claim.
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

export type AcceptanceMilestoneVerdict = "PROVEN" | "PROVEN_WITH_DEFECTS" | "NOT_PROVEN";

export interface AcceptanceMilestones {
  FIXTURE_MODELED_DASHBOARD_PROVEN: AcceptanceMilestoneVerdict;
  GENERALIZED_CALCULATION_PIPELINE_PROVEN: AcceptanceMilestoneVerdict;
  AUTONOMOUS_COVENANT_COMPILATION_PROVEN: AcceptanceMilestoneVerdict;
  PRODUCTION_AUTHORITY_PROVEN: AcceptanceMilestoneVerdict;
}

export interface RealDashboardVerticalSliceResult {
  canonicalBaseNote: string;
  evaluation: VerticalSliceEvaluation;
  position: AuthenticPositionSlice;
  changePropagation: ChangePropagationResult;
  /**
   * Legacy aggregate label — after PR #304 independent acceptance this is at most
   * FIXTURE_MODELED_DASHBOARD_PARTIAL. Prefer `milestones`.
   */
  verdict: "FIXTURE_MODELED_DASHBOARD_PARTIAL" | "PARTIALLY_PROVEN" | "NOT_YET_PROVEN";
  milestones: AcceptanceMilestones;
  blockers: string[];
}

function decideMilestones(
  evaluation: VerticalSliceEvaluation,
  position: AuthenticPositionSlice,
): AcceptanceMilestones {
  const fixtureModeled =
    evaluation.verifiedCovenantsCount >= 5 &&
    position.connectedMetrics.length >= 5 &&
    position.productionRemainingPublished === false &&
    evaluation.productionHandoffRefused &&
    evaluation.securedCompositionAuthority === "HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION";

  return {
    FIXTURE_MODELED_DASHBOARD_PROVEN: fixtureModeled ? "PROVEN_WITH_DEFECTS" : "NOT_PROVEN",
    // Registry + evaluator are Matthews-only (see hasAuthenticPositionSlice / evaluateMatthews*).
    GENERALIZED_CALCULATION_PIPELINE_PROVEN: "NOT_PROVEN",
    // Provisions are hand-encoded literals; no compileFrozenDebtPackage / verified IR.
    AUTONOMOUS_COVENANT_COMPILATION_PROVEN: "NOT_PROVEN",
    // Trusted-issuer BLOCKED; completeness absent.
    PRODUCTION_AUTHORITY_PROVEN: "NOT_PROVEN",
  };
}

function decideVerdict(milestones: AcceptanceMilestones): RealDashboardVerticalSliceResult["verdict"] {
  if (milestones.FIXTURE_MODELED_DASHBOARD_PROVEN === "PROVEN_WITH_DEFECTS") {
    return "FIXTURE_MODELED_DASHBOARD_PARTIAL";
  }
  if (milestones.FIXTURE_MODELED_DASHBOARD_PROVEN === "PROVEN") {
    return "FIXTURE_MODELED_DASHBOARD_PARTIAL";
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
  const milestones = decideMilestones(evaluation, position);
  const blockers = [
    ...evaluation.missingEvidence,
    "D1: CovenantProvisionInput rows are manually encoded — not autonomously compiled.",
    "D4: Indenture secured composition is HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION (CA lien companion blocks NEW secured).",
    "D5: independentExpectedRemaining mirrors fixture thresholds — not independent legal proof.",
    "D6: Pathway is Matthews-only; second authentic package returns null.",
    "Verified IR / Phase-3 VEP path not bound to Position for this package (leaf evaluateProvision used).",
    "Production IdP / trusted-issuer activation BLOCKED by design.",
  ];

  return {
    canonicalBaseNote: `Separate branch off canonical #293 tip; companyId=${MATTHEWS_POSITION_COMPANY_ID}`,
    evaluation,
    position,
    changePropagation,
    milestones,
    verdict: decideVerdict(milestones),
    blockers,
  };
}
