export {
  MATTHEWS_PACKAGE_KEY,
  MATTHEWS_COMPANY_ID,
  MATTHEWS_POSITION_COMPANY_ID,
  MATTHEWS_GOVERNING_DOCUMENTS,
  loadMatthewsAuthenticFixture,
  matthewsCovenantProvisions,
  matthewsFinancialSnapshot,
} from "./package-matthews";

export {
  evaluateMatthewsVerticalSlice,
  independentExpectedRemaining,
  type VerifiedCovenantCalculation,
  type VerticalSliceEvaluation,
  type FinancialEvidenceCoverage,
  type UtilizationCoverage,
} from "./evaluate-covenants";

export {
  demonstrateChangePropagation,
  type ChangePropagationResult,
  type CapacityDeltaRow,
} from "./change-propagation";

export {
  connectSliceToPosition,
  hasAuthenticPositionSlice,
  type AuthenticPositionSlice,
  type DashboardConnectedMetric,
} from "./position-bridge";

export {
  loadAuthenticDashboardSlice,
  runRealDashboardVerticalSlice,
  type RealDashboardVerticalSliceResult,
  type AcceptanceMilestones,
  type AcceptanceMilestoneVerdict,
} from "./run-slice";
