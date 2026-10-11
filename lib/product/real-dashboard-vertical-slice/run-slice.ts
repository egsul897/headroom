/**
 * End-to-end authentic vertical slice orchestration (no Neon writes, no paid inference).
 *
 * Acceptance milestones (PR #304 independent review) are reported separately —
 * do not collapse them into a single REAL_DASHBOARD_VERTICAL_SLICE_PROVEN claim.
 *
 * Phase 3 compile is connected for dashboard display (source → OA → extraction).
 * Verified fixed-dollar compile feeds Position as SOURCE_BACKED_COMPILED_GROSS when
 * evidence supports it (fail-closed otherwise). Leaf evaluateProvision still drives
 * the five modeled covenant rows — AUTONOMOUS_COVENANT_COMPILATION_PROVEN remains
 * NOT_PROVEN until all Position capacity leaves hand-encoded CovenantProvisionInput.
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
import type { Phase3CompileBridgeResult } from "./phase3-compile-bridge";
import type { VerifiedExecutableCompileBridgeResult } from "./verified-executable-compile-bridge";
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
  phase3Compile: Phase3CompileBridgeResult;
  autonomouslyCompiledDisplayedCount: number;
  verifiedExecutableCompile: VerifiedExecutableCompileBridgeResult;
  verifiedExecutableUnitsFeedingPosition: number;
  /**
   * Legacy aggregate label — after PR #304 independent acceptance this is at most
   * FIXTURE_MODELED_DASHBOARD_PARTIAL. Prefer `milestones`.
   */
  verdict: "FIXTURE_MODELED_DASHBOARD_PARTIAL" | "PARTIALLY_PROVEN" | "NOT_YET_PROVEN";
  milestones: AcceptanceMilestones;
  blockers: string[];
  /**
   * Numerical honesty partition — source-backed compiled gross vs modeled leaf.
   * Never conflate these in reports.
   */
  numericalHonesty: {
    sourceBackedCompiledGrossMm: Array<{ code: string; amountMm: number }>;
    modeledLeafCapacityMm: Array<{ code: string; amountMm: number | null; authorityStatus: string }>;
    hypotheticalUnverifiedSecuredCompositionMm: number | null;
  };
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
    // Fixed-dollar VE compile feeds Position for supporting clauses, but the five
    // dashboard covenant rows still use hand-encoded CovenantProvisionInput /
    // evaluateProvision — not full autonomous IR→capacity replacement.
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
  const phase3Compile = position.phase3Compile;
  const verifiedExecutableCompile = position.verifiedExecutableCompile;
  const milestones = decideMilestones(evaluation, position);
  const blockers = [
    ...evaluation.missingEvidence,
    ...phase3Compile.limitations,
    ...verifiedExecutableCompile.limitations,
    "D1: Five CovenantProvisionInput rows remain manually encoded for leaf modeled capacity.",
    "D4: Indenture secured composition is HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION (CA lien companion blocks NEW secured).",
    "D5: independentExpectedRemaining mirrors fixture thresholds — not independent legal proof.",
    "D6: Pathway is Matthews-only; second authentic package returns null.",
    "Fixed-dollar VE compile feeds Position as SOURCE_BACKED_COMPILED_GROSS only; ratio/structural rows still leaf evaluateProvision.",
    "Production IdP / trusted-issuer activation BLOCKED by design.",
  ];

  return {
    canonicalBaseNote: `Post-#293 main; companyId=${MATTHEWS_POSITION_COMPANY_ID}; phase3CompileDisplayed=${phase3Compile.autonomouslyCompiledDisplayedCount}; veFeedingPosition=${position.verifiedExecutableUnitsFeedingPosition}`,
    evaluation,
    position,
    changePropagation,
    phase3Compile,
    autonomouslyCompiledDisplayedCount: position.autonomouslyCompiledDisplayedCount,
    verifiedExecutableCompile,
    verifiedExecutableUnitsFeedingPosition: position.verifiedExecutableUnitsFeedingPosition,
    milestones,
    verdict: decideVerdict(milestones),
    blockers,
    numericalHonesty: {
      sourceBackedCompiledGrossMm: position.verifiedExecutableMetrics
        .filter((m) => m.amountMillions != null)
        .map((m) => ({ code: m.code, amountMm: m.amountMillions! })),
      modeledLeafCapacityMm: evaluation.covenants.map((c) => ({
        code: c.code,
        amountMm: c.modeledCapacityMm,
        authorityStatus: c.authorityStatus,
      })),
      hypotheticalUnverifiedSecuredCompositionMm: evaluation.indentureSecuredCompositionMm,
    },
  };
}
