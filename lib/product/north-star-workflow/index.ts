export {
  loadTransactionWorkflowReadiness,
  type TransactionWorkflowReadiness,
  type WorkflowStepStatus,
} from "./transaction-readiness";
export {
  proposeSyntheticCertificateForCompany,
  approveWorkspaceCertificate,
  appendContractLedgerUsage,
  promoteBasketLinesToContractLedger,
  proposeCertificateRestatement,
  listCertificateFactsForSnapshot,
  type SeedCertificateResult,
  type ApproveCertificateResult,
} from "./certificate-actions";
export {
  attemptCertifiedTransaction,
  type CertifiedTransactionAttempt,
  type CertifiedTransactionBlocker,
} from "./certified-transaction";
export {
  loadAuthoritativeCapacity,
  type AuthoritativeCapacityResult,
  type AuthoritativeCapacityStatus,
} from "./authoritative-capacity";
/** Dashboard / product read of APPROVED Neon NS-4 financial evidence. */
export {
  loadNs4DashboardFinancialState,
  type Ns4DashboardFinancialState,
  type Ns4DashboardFinancialStatus,
  type Ns4DashboardFact,
} from "@/lib/dashboard/ns4-financial-panel";
export {
  computeNs4ContractualNetLeverage,
  type Ns4LeverageIrTrace,
  type Ns4LeverageIrStatus,
} from "@/lib/dashboard/ns4-leverage-ir";
export {
  proposeCertificateTextForCompany,
  proposeAuthenticCertificateFixtureForCompany,
  approveFceProposedCertificate,
  MATTHEWS_FIXTURE_AUTHORITY,
  COHERENT_FIXTURE_AUTHORITY,
  type CertificateFixtureIssuer,
  type ProposeCertificateTextResult,
} from "./fce-certificate-actions";
export {
  loadApprovedFinancialInputBundle,
  NS4_PRODUCT_CUTOFF_SELECTOR,
  type ApprovedFinancialInputBundle,
  type ApprovedFinancialInputBundleStatus,
} from "./approved-financial-inputs";
export {
  parseTransactionDraft,
  analyzeContemplatedTransaction,
  type TransactionDraft,
  type TransactionAnalysisResult,
} from "./transaction-analysis";
export {
  enumerateCertifiedPaths,
  type CertifiedPathEnumeration,
  type EnumeratedCertifiedPath,
  type CertifiedPathAuthority,
  type ContemplatedTxnKind,
} from "./verified-path-enumeration";
export {
  DEMO_TRANSACTION_FIXTURES,
  listDemoTransactionFixtures,
  type DemoTransactionFixture,
  type DemoTransactionKind,
} from "./demo-transaction-fixtures";
export {
  listContractLedgerForCompany,
  supersedeContractLedgerUsage,
} from "./contract-ledger-actions";
export {
  DEMO_EXERCISES,
  DEMO_LABEL,
  DEMO_IR_LABEL,
  DEMO_LEGACY_AUTHORITY,
  DEMO_NOT_CERTIFIED,
  DEMO_COMPANY_ID,
  DEMO_INSTRUMENT_KEY,
  getDemoExercise,
  structuredExerciseFields,
  buildDemoReportShell,
  renderDemoReportMarkdown,
  type DemoExercise,
  type DemoExerciseId,
  type DemoExerciseStructuredFields,
  type CapacityDiscrepancy,
  type ExerciseComparisonRow,
  type CertifiedVsLegacyDemoReport,
} from "./demo-exercises";
export {
  FIXTURE_IR_LABEL,
  buildFixtureVerifiedPackage,
  buildFixtureDebtRpSharedPackage,
  seedFixtureApprovedWorld,
  runFixtureCertifiedPath,
  moneyAmountOf,
  type FixtureVerifiedPackage,
  type FixtureCertifiedRun,
} from "./fixture-verified-package";
export {
  ALL_BUSINESS_TRANSACTION_TYPES,
  TRANSACTION_EFFECT_RECIPES_VERSION,
  recipeDebtIncurrence,
  recipeDebtRepayment,
  recipeSecuredBorrowing,
  recipeDividendPayment,
  recipeRestrictedInvestment,
  recipeEquityContribution,
  recipeInvestmentReturn,
  recipeAssetSale,
  recipeReinvestment,
  recipeBasketReclassification,
  recipeAmendmentAffectingCapacity,
  type BusinessTransactionType,
  type RecipeBuildResult,
  type RecipeIdentity,
} from "./transaction-effect-recipes";
export {
  runSequentialTransactions,
  replaySequentialRun,
  assertCompletedNotDoublePosted,
  SEQUENTIAL_TRANSACTION_RUNNER_VERSION,
  type SequentialRunResult,
  type SequentialStepResult,
  type RunnerMode,
} from "./sequential-transaction-runner";
export {
  classifyUtilizationHistory,
  honestRemaining,
  UTILIZATION_UNKNOWN_REASON,
  type UtilizationHistoryStatus,
} from "./utilization-history";
export {
  runCanonicalSequentialDemo,
  buildCanonicalSequentialSteps,
  buildSequentialDemoWorld,
} from "./sequential-demo-scenario";
/** Additive unified orchestration — see lib/product/verified-transaction-execution. */
export {
  executeUnifiedVerifiedTransaction,
  toProductExecutionHandoff,
  toAllProductExecutionHandoffs,
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
} from "@/lib/product/verified-transaction-execution";
