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
  hasMatthewsLeafPositionSlice,
  type AuthenticPositionSlice,
  type DashboardConnectedMetric,
} from "./position-bridge";

export {
  loadAuthenticDashboardSlice,
  hasAuthenticPositionSlice,
  runRealDashboardVerticalSlice,
  type RealDashboardVerticalSliceResult,
  type AcceptanceMilestones,
  type AcceptanceMilestoneVerdict,
} from "./run-slice";

export {
  loadVePositionSlice,
  connectVePipelineToPosition,
  hasVePositionPackage,
  VE_POSITION_PACKAGES,
} from "./ve-position-feed";

export {
  compileMatthewsPhase3DashboardBridge,
  type Phase3CompileBridgeResult,
  type CompiledCovenantCandidate,
} from "./phase3-compile-bridge";

export {
  compileMatthewsVerifiedExecutableBridge,
  matthewsVerifiedExecutableCandidates,
  bindMatthewsProvisionsFromVerifiedExecutable,
  type VerifiedExecutableCompileBridgeResult,
  type VerifiedExecutableCompileUnit,
  type OperativeClauseCandidate,
} from "./verified-executable-compile-bridge";

export { compileVerifiedFixedDollarBridge } from "./verified-executable-compile-core";

export {
  compileMhkVerifiedExecutableBridge,
  mhkVerifiedExecutableCandidates,
  extractMhk703fReceivablesCandidate,
  MHK_VE_COMPANY_ID,
} from "./package-mhk-ve-candidates";

export {
  runAutonomousCompilationPipeline,
  runAutonomousCompilationPipelineFromDocuments,
  runMatthewsAutonomousPipeline,
  runMhkAutonomousPipeline,
  type AutonomousCompilationPipelineResult,
  type PipelinePublicationClass,
  type PipelinePositionMetric,
} from "./autonomous-compilation-pipeline";

export {
  discoverFixedDollarCandidatesFromText,
  discoverFixedDollarCandidatesFromDocuments,
  selectSoleCapDiscoveryCandidates,
  type DiscoveredFixedDollarCandidate,
} from "./fixed-dollar-candidate-discovery";

export {
  matthewsCompilerPackageDocuments,
  MATTHEWS_INDENTURE_SOURCE,
} from "./source-excerpts-matthews";
