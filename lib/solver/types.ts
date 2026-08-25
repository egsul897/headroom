/**
 * Solver domain types (Phase 2 of docs/solver-implementation-phases-0-7-report.md).
 *
 * Generalized TypeScript representations for the permission-and-constraint
 * graph solver described in docs/solver-architecture-design.md §B–§O. These
 * types are the *pure* domain vocabulary the solver core (lib/solver/*)
 * operates on - no Prisma types, no company/document/basket-code-specific
 * unions anywhere in this file. A synthetic fixture and a (future) real
 * company both produce values of these same types.
 *
 * Deliberately reused, not reinvented:
 *  - `FormulaType`/`FormulaParams`/`DebtBasis` from lib/covenant-engine.ts -
 *    the leaf-calculation layer is kept, not replaced (design doc §Q.1).
 *  - The legacy `EvaluationStatus`/`TransactionStatus` enums are NOT reused
 *    for solver-native results; §M below defines a new, generalized
 *    `PathStatus` vocabulary specifically because the legacy `MAX`-as-OR
 *    aggregation bug (see lib/solver/status.ts) must not be inherited.
 *
 * Every exported type here corresponds to a named shape in
 * docs/solver-architecture-design.md; the section letter is noted in each
 * doc comment so a reviewer can check this file against the design doc
 * section by section.
 */

import type { DebtBasis, FormulaParams, FormulaType } from "../covenant-engine";

// ---------------------------------------------------------------------------
// §M.1 - unified status vocabulary
// ---------------------------------------------------------------------------

/**
 * The five solver-native statuses (design doc §M.1). Distinct from the
 * legacy engine's `EvaluationStatus`/`TransactionStatus` - see
 * lib/solver/status.ts for the aggregation semantics that make this
 * vocabulary safe against the legacy MAX-as-OR bug.
 */
export type PathStatus = "CLEAR" | "BLOCKED" | "NOT_TESTED" | "REVIEW_REQUIRED" | "ASSUMPTION_REQUIRED";

/** design doc §M.1 - why a mandatory requirement is unresolved, for reason-code branching without a sixth top-level status. */
export type ReviewReasonCategory =
  | "EXTERNAL_INPUT"
  | "LEGAL_JUDGMENT"
  | "UNKNOWN_RELATIONSHIP"
  | "UNKNOWN_ENTITY_CLASS"
  | "INCOMPLETE_COVERAGE"
  | "UNRESOLVED_ACTIVATION_STATE"
  | "SEARCH_LIMIT_EXCEEDED"
  | "MISSING_ASSUMPTION";

// ---------------------------------------------------------------------------
// §K - provenance / source citation, wrapper types
// ---------------------------------------------------------------------------

/** design doc §B "Provenance is not a bolt-on field, it is a wrapper type." */
export interface ProvenanceWrapper<T> {
  value: T;
  sourceType: "REPORTED" | "RECONSTRUCTED" | "ASSUMED" | "EXTERNAL_CERTIFICATE";
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "DISPUTED";
  notes?: string;
}

/** A deduplicated citation into a governing document (design doc §D/§N `sources`). */
export interface SourceCitation {
  documentId: string;
  sectionRef: string;
  definedTermIds?: string[];
  permissionId?: string;
  relationshipId?: string;
  constraintId?: string;
}

/** design doc §C.1 `sourceProvision`. */
export interface SourceProvisionRef {
  documentId: string;
  sectionRef: string;
  definedTermIds?: string[];
}

// ---------------------------------------------------------------------------
// §C.1 - Permission
// ---------------------------------------------------------------------------

export type GrantType = "DEBT_INCURRENCE" | "LIEN";
export type AmountKind = "FIXED" | "INCURRENCE_BASED";
export type MeasurementBasis = "CUMULATIVE_INCURRED" | "CURRENTLY_OUTSTANDING" | "NET_OF_REPAYMENT" | "PREPAYMENT_CREDIT";
export type ModelingStatus = "MODELED" | "KNOWN_NOT_MODELED";

/** design doc §C.1 `EntityClassFilter` - the closed entity-class vocabulary Round 2 §L item 10 established. */
export type EntityClass =
  | "BORROWER"
  | "GUARANTOR_RS"
  | "NON_GUARANTOR_RS"
  | "FOREIGN_RS"
  | "UNRESTRICTED_SUB"
  | "SECURITIZATION_SUB"
  | "IMMATERIAL_SUB";

/** design doc §C.1 `eligibilityConditions`/`termConditions` - heterogeneous, AND-combined predicates. Kept as data (never inferred), never a table (design doc §R). */
export interface EligibilityCondition {
  id: string;
  description: string;
  /**
   * How this condition is resolved against SolverRequest/state - purely
   * declarative; lib/solver/election.ts's `evaluatePermissionEligibility`
   * interprets `kind`.
   *
   * `TRANSACTION_SECURITY_SCOPE` is a GENERALIZED primitive - it restricts a
   * permission to a declared subset of the requesting transaction's own
   * secured/lien-priority character (`allowedSecurity` below), mechanically
   * evaluated against `Transaction.secured`/`Transaction.requestedLienPriority`.
   * It is not specific to any one permission or company: any Permission row
   * on any document/company whose own action label restricts it to (e.g.)
   * unsecured-or-junior debt can carry this condition to have that
   * restriction mechanically enforced, rather than relying on the label text
   * alone (see docs/founder-legal-review-2026-08-25.md §3 for the case that
   * motivated adding it - a permission whose action label said "unsecured or
   * junior-secured" but had no data enforcing it).
   */
  kind: "RATINGS_THRESHOLD" | "INTERCREDITOR_JOINDER" | "MFN_EXCLUSION_TEST" | "LCA_TEST_DATE_FREEZE" | "ENTITY_SCOPE" | "CUSTOM_STATE_PREDICATE" | "TRANSACTION_SECURITY_SCOPE";
  /** Only for CUSTOM_STATE_PREDICATE: the RuleActivationCondition id this defers to (§I). */
  ruleActivationConditionId?: string;
  /**
   * Only for TRANSACTION_SECURITY_SCOPE. `UNSECURED_ONLY` requires
   * `Transaction.secured === false`. `UNSECURED_OR_JUNIOR` additionally
   * permits a secured transaction, but only when every entry in
   * `Transaction.requestedLienPriority` is confirmed junior (`"SECOND"`) -
   * an uncharacterized/empty priority array, or any `"FIRST"`/`"PARI_PASSU"`
   * entry, fails closed rather than being assumed eligible. Kept to exactly
   * these two values deliberately - no `SECURED_ANY`/other variant exists
   * because nothing in this codebase currently needs one.
   */
  allowedSecurity?: "UNSECURED_ONLY" | "UNSECURED_OR_JUNIOR";
  sourceProvision?: SourceProvisionRef;
}

export interface TermCondition {
  id: string;
  description: string;
  kind: "WAL_FLOOR" | "MATURITY_FLOOR" | "TERM_WAIVER";
  /** Years, for WAL_FLOOR/MATURITY_FLOOR. */
  minYears?: number;
  sourceProvision?: SourceProvisionRef;
}

/** design doc §C.1 `Permission` - the generalized replacement for the debt/lien-relevant subset of CovenantProvision. */
export interface Permission {
  id: string;
  documentId: string;
  companyId: string;
  /** Optional stable machine key for citation/fixture readability - never branched on. */
  code?: string;
  grantType: GrantType;
  amountKind: AmountKind;
  action: string;
  entityScope: EntityClass[]; // empty = unrestricted
  formulaType: FormulaType;
  thresholdValue: number;
  params?: FormulaParams | null;
  eligibilityConditions: EligibilityCondition[];
  termConditions: TermCondition[];
  measurementBasis: MeasurementBasis;
  sourceProvision: SourceProvisionRef;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  modelingStatus: ModelingStatus;
}

// ---------------------------------------------------------------------------
// §C.2 - Requirements
// ---------------------------------------------------------------------------

export type RequirementClass =
  | "DEBT_PERMISSION"
  | "LIEN_PERMISSION"
  | "PRIORITY_CONDITION"
  | "COLLATERAL_SCOPE"
  | "RATIO_CONDITION"
  | "GUARANTOR_CONDITION"
  | "SHARED_CAP"
  | "COVENANT_APPLICABILITY"
  | "CROSS_DOCUMENT_STATE"
  | "TERM_CONDITION"
  | "TRANSACTION_ASSUMPTION";

// ---------------------------------------------------------------------------
// §C.3 - Relationships
// ---------------------------------------------------------------------------

export type StackingRelationshipType =
  | "CONCURRENT_DISREGARDED"
  | "CONCURRENT_COUNTED"
  | "ALTERNATIVE"
  | "MUTUALLY_EXCLUSIVE"
  | "AUTOMATIC_LINKED_PERMISSION"
  | "EQUAL_AND_RATABLE_PULLUP"
  | "PARAMETER_ADJUSTMENT_TRIGGER"
  | "SHARED_CONSTRAINT_PARTICIPATION"
  | "UNKNOWN";

/** design doc §C.3 - a row connecting two Permission ids. `groupKey` clusters >2-way ALTERNATIVE/MUTUALLY_EXCLUSIVE groups. */
export interface PermissionRelationship {
  id: string;
  companyId: string;
  fromPermissionId: string;
  toPermissionId: string;
  relationshipType: StackingRelationshipType;
  groupKey?: string;
  /** PARAMETER_ADJUSTMENT_TRIGGER payload, e.g. { parameter: "couponPct", adjustmentBps: 50 }. */
  parameter?: Record<string, unknown>;
  sourceProvision: SourceProvisionRef;
  notes?: string;
}

// ---------------------------------------------------------------------------
// §G - Shared-capacity model
// ---------------------------------------------------------------------------

export type AggregationRule = "NAMED_MEMBER_CLAUSES" | "EXTERNAL_INSTRUMENT_BALANCE" | "ENTITY_CLASS_FILTER";

export interface SharedConstraintMember {
  permissionId?: string;
  namedInstrument?: string;
  entityClass?: EntityClass;
  externalInstrumentRef?: string;
}

/** design doc §G `SharedCapacityConstraint`, adopted verbatim from Round 2 §F/§L item 1. */
export interface SharedConstraint {
  id: string;
  companyId: string;
  name: string;
  cap: { amount: number } | { formulaType: FormulaType; thresholdValue: number; params?: FormulaParams | null };
  aggregationRule: AggregationRule;
  members: SharedConstraintMember[];
  measurementBasis: MeasurementBasis;
  followsRefinancing: boolean;
  /** Pre-transaction usage. For EXTERNAL_INSTRUMENT_BALANCE this is itself an external input - see ExternalInputs.instrumentBalances. */
  currentUsage: number;
  sourceProvision: SourceProvisionRef;
}

// ---------------------------------------------------------------------------
// §H - Collateral / priority model
// ---------------------------------------------------------------------------

export type PriorityTier = "FIRST" | "SECOND" | "PARI_PASSU" | "UNSECURED";

export interface CollateralPoolRef {
  id: string;
  name: string;
}

export interface PermissionCollateralScope {
  permissionId: string;
  collateralPoolId: string;
  priorityTier: PriorityTier;
  pariPassuWithGroupId?: string;
  intercreditorAgreementId?: string;
}

export interface IntercreditorAgreementRef {
  id: string;
  companyId: string;
  name: string;
  governs: { poolId: string; counterpartyClass: string }[];
}

// ---------------------------------------------------------------------------
// §I - Dynamic activation model
// ---------------------------------------------------------------------------

export type StatePredicateKind = "POINT_IN_TIME" | "CONTINUITY_WINDOW" | "EVENT_TRIGGERED" | "USAGE_LIMITED";
export type RuleActivationEffect = "APPLICABILITY" | "PARAMETER_VALUE" | "RETROACTIVE_REEXAMINATION";
export type SeriesComparator = "gte" | "lte" | "gt" | "lt" | "eq";

/**
 * design doc §I `StatePredicate` - deliberately **data-only** (no embedded
 * functions), unlike the design doc's own illustrative pseudocode, so that:
 *  (a) a RuleActivationCondition round-trips through Prisma's JSON
 *      `predicateConfig` column without losing behavior, and
 *  (b) evaluation logic lives once, generically, in
 *      lib/solver/graph.ts's `evaluateStatePredicate` - never as a
 *      per-permission or per-company closure, which is what "no
 *      company-specific solver branches" (task §19) requires in practice
 *      for this concept.
 * Each variant reads a single named series/event/usage key out of
 * `ActivationState` - the series' *meaning* (which rating agency, which
 * liquidity measure) is a fact about the fixture/company's data, not about
 * the predicate's shape.
 */
export type StatePredicate =
  | { kind: "POINT_IN_TIME"; description: string; seriesKey: string; comparator: SeriesComparator; threshold: number | string | boolean }
  | {
      kind: "CONTINUITY_WINDOW";
      description: string;
      seriesKey: string;
      comparator: SeriesComparator;
      threshold: number;
      minConsecutivePeriods: number;
      periodUnit: "DAY" | "QUARTER";
    }
  | { kind: "EVENT_TRIGGERED"; description: string; sinceEvent: string; until?: string }
  | { kind: "USAGE_LIMITED"; description: string; usageKey: string; maxUses: number; minSpacingPeriods?: number; periodUnit?: "DAY" | "QUARTER" };

/** Step-table parameter resolution for `effect === "PARAMETER_VALUE"` (e.g. a step-up'd threshold) - data-only for the same reason as StatePredicate above. */
export interface ParameterResolution {
  seriesKey: string;
  /** Evaluated in descending `thresholdAtLeast` order; the first step whose threshold the series' current value meets or exceeds wins. */
  steps: { thresholdAtLeast: number; value: number }[];
  belowAllStepsValue: number;
}

export interface RuleActivationCondition {
  id: string;
  companyId: string;
  appliesTo: { permissionId?: string; covenantSectionIds?: string[]; companyWide?: boolean };
  predicate: StatePredicate;
  effect: RuleActivationEffect;
  parameterName?: string;
  parameterResolution?: ParameterResolution;
  reversionRule?: { predicate: StatePredicate; retroactiveReconciliation?: string };
  sourceProvision: SourceProvisionRef;
}

/**
 * The minimal state an activation predicate reads. Deliberately narrow and
 * generic - a `StatePredicate.test` closure captures whatever additional
 * state it actually needs (ratings history, liquidity history, discharge
 * events, usage counters) rather than this type growing a field per mechanic.
 */
export interface ActivationState {
  asOfDate: Date;
  /** Chronological history of point-in-time facts a CONTINUITY_WINDOW/POINT_IN_TIME predicate consults (e.g. daily/quarterly liquidity, rating). Keyed by predicate-specific series name. */
  series: Record<string, { asOf: Date; value: number | string | boolean }[]>;
  /** Ordered event log for EVENT_TRIGGERED predicates (discharge, reinstatement, etc). */
  events: { type: string; asOf: Date }[];
  /** Usage counters for USAGE_LIMITED predicates (e.g. equity-cure uses), keyed by predicate/permission id. */
  usageCounts: Record<string, { asOf: Date }[]>;
  /** Explicit unknown markers - a series/event/usage key present here means the data is genuinely missing, not merely absent-because-zero (fail-closed per §I). */
  unknownKeys: Set<string>;
}

// ---------------------------------------------------------------------------
// §K - External-input model
// ---------------------------------------------------------------------------

export type ExternalInputKind = "COMPUTABLE_FORMULA" | "CERTIFIED_EXTERNAL_INPUT" | "DISCRETIONARY_CATCH_ALL" | "HUMAN_CLASSIFICATION";

export interface ExternalInputRecord {
  id: string;
  kind: ExternalInputKind;
  name: string;
  value?: number;
  asOfDate?: Date;
  sourceRef?: string;
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "DISPUTED";
  staleness?: { maxAgeDays: number };
}

/** design doc §B `externalInputs`. */
export interface ExternalInputs {
  borrowingBaseCertificate?: { asOfDate: Date; values: Record<string, number>; provenance: ExternalInputRecord };
  reserves?: { named: Record<string, number>; discretionaryCatchAll?: number | "UNKNOWN" };
  ratings?: { agency: string; rating: string; asOfDate: Date }[];
  /** EXTERNAL_INSTRUMENT_BALANCE reads for SharedConstraint.currentUsage - see design doc §G. */
  instrumentBalances?: Record<string, ExternalInputRecord>;
  agentDeterminations?: { id: string; description: string }[];
  collateralClassifications?: { id: string; description: string }[];
}

// ---------------------------------------------------------------------------
// §B - Solver request: transaction / financial / historical state
// ---------------------------------------------------------------------------

export type TransactionType = "DEBT_INCURRENCE" | "LIEN_GRANT" | "RESTRICTED_PAYMENT" | "ASSET_SALE";
export type GuarantorStatus = "GUARANTOR" | "NON_GUARANTOR" | "UNKNOWN";

export interface EntityRef {
  id: string;
  name: string;
}

export interface Transaction {
  transactionType: TransactionType;
  amount: number;
  currency: { code: string };
  incurringEntity: EntityRef;
  guarantorStatus: GuarantorStatus;
  secured: boolean;
  collateralPools: CollateralPoolRef[];
  requestedLienPriority: { poolId: string; priorityTier: PriorityTier; pariPassuWithGroupId?: string }[];
  useOfProceeds: string;
  acquisitionRelated: boolean;
  maturity?: Date;
  weightedAverageLife?: number;
  interestRate?: { couponPct: number; allInYieldPct?: number };
  transactionDate: Date;
}

export interface FinancialState {
  snapshotAsOf: Date;
  ebitda: number;
  cash: number;
  interestExpense: number;
  totalDebt: number;
  securedDebt: number;
  cumulativeNetIncome: number;
  equityProceedsSinceIssue: number;
  liquidity?: number;
  assumedNewDebtRatePct: number;
}

export interface BasketUsageRecord {
  permissionId?: string;
  constraintId?: string;
  cumulativeIncurred: number;
  currentlyOutstanding: number;
  prepaymentCredit: number;
}

export interface LedgerEventRef {
  id: string;
  date: Date;
  amount: number;
  description: string;
}

export interface ReclassificationRecord {
  id: string;
  date: Date;
  fromPermissionId: string;
  toPermissionId: string;
  amount: number;
}

export interface RedesignationRecord {
  id: string;
  date: Date;
  description: string;
}

export interface ElectionRecord {
  id: string;
  kind: "LCA_ELECTION" | "EQUITY_CURE" | "OTHER";
  date: Date;
  description: string;
}

export interface StepUpEventRecord {
  id: string;
  date: Date;
  description: string;
}

export interface HistoricalState {
  basketUsage: BasketUsageRecord[];
  priorIncurrences: LedgerEventRef[];
  prepayments: LedgerEventRef[];
  reclassifications: ReclassificationRecord[];
  redesignations: RedesignationRecord[];
  elections: ElectionRecord[];
  stepUpCooldownHistory: StepUpEventRecord[];
}

/** design doc §B `assumptions` - never merged into FinancialState. */
export interface TransactionAssumptions {
  assumedNewDebtRatePct?: number;
  ebitdaAdjustments?: { description: string; amount: number }[];
  fundingSource?: string;
  concurrentRepaymentAmount?: number;
  designatedTestDate?: Date;
}

export interface CompanyContext {
  companyId: string;
  asOfDate: Date;
}

/** design doc §B `SolverRequest` - the single structured solver input. */
export interface SolverRequest {
  companyContext: CompanyContext;
  transaction: Transaction;
  financialState: FinancialState;
  historicalState: HistoricalState;
  externalInputs: ExternalInputs;
  assumptions: TransactionAssumptions;
  activationState: ActivationState;
}

// ---------------------------------------------------------------------------
// §F - Constraint model
// ---------------------------------------------------------------------------

export type RequirementResultStatus = "SATISFIED" | "FAILED" | "UNKNOWN";

export interface RequirementResult {
  class: RequirementClass;
  scope: { permissionId?: string; poolId?: string; entityId?: string; constraintId?: string };
  status: RequirementResultStatus;
  detail: string;
  sourceProvision?: SourceCitation;
  /** Present only when status === "UNKNOWN" - what would resolve it. */
  reasonCategory?: ReviewReasonCategory;
}

// ---------------------------------------------------------------------------
// §D - Permission path model
// ---------------------------------------------------------------------------

export interface PermissionPathLeg {
  permissionId: string;
  grantType: GrantType;
  amountAllocated: number;
  standaloneCapacity?: number;
  linkedFrom?: string;
  concurrentTreatment?: { withPermissionId: string; relationship: StackingRelationshipType; disregardedFromRatioDenominator: boolean };
  measurementBasis: MeasurementBasis;
  historicalUsage: { cumulativeIncurred?: number; currentlyOutstanding?: number; prepaymentCredit?: number };
  ratioCalculation?: { measure: string; threshold: number; proFormaDebtUsed: number };
  sourceProvision: SourceProvisionRef;
}

export interface LinkedPermissionPair {
  debtPermissionId: string;
  lienPermissionId: string;
  pool: CollateralPoolRef;
  priorityTier: PriorityTier;
}

export interface SharedConstraintConsumption {
  constraintId: string;
  amountConsumed: number;
  headroomBefore: number;
  headroomAfter: number;
}

export interface AssumptionUsage {
  field: string;
  value: unknown;
  provided: "explicit" | "missing";
}

export interface ParameterAdjustment {
  triggeringPermissionId: string;
  affectedPermissionId: string;
  parameter: string;
  before: number;
  after: number;
  sourceProvision: SourceProvisionRef;
}

/** design doc §D `PermissionPath` - the unit the solver reasons about, allocates within, and reports. */
export interface PermissionPath {
  id: string;
  status: PathStatus;
  legs: PermissionPathLeg[];
  linkedPermissions: LinkedPermissionPair[];
  conditionsTested: RequirementResult[];
  sharedConstraintsConsumed: SharedConstraintConsumption[];
  assumptionsUsed: AssumptionUsage[];
  parameterAdjustmentsTriggered: ParameterAdjustment[];
  sourceProvisions: SourceCitation[];
  stateEffects: StateDelta;
}

// ---------------------------------------------------------------------------
// §L - State-transition model
// ---------------------------------------------------------------------------

export interface StateDelta {
  debtOutstandingDelta: { permissionId: string; amount: number }[];
  cashDelta: number;
  leverageMetricsProForma?: {
    netDebt: number;
    netSecured: number;
    totalNetLeverage: number;
    seniorSecuredNetLeverage: number;
    fixedChargeCoverage: number;
  };
  basketUsageDelta: { permissionId?: string; constraintId?: string; amount: number; measurementBasis: MeasurementBasis }[];
  sharedConstraintUsageDelta: { constraintId: string; amount: number }[];
  prepaymentCreditDelta?: { permissionId: string; amount: number }[];
  reclassificationsApplied?: ReclassificationRecord[];
  redesignationsApplied?: RedesignationRecord[];
  ruleActivationChanges?: { conditionId: string; wasActive: boolean; nowActive: boolean; reason: string }[];
  parameterAdjustmentsApplied?: { affectedPermissionId: string; parameter: string; before: number; after: number }[];
}

// ---------------------------------------------------------------------------
// §O - Maximum-capacity algorithm
// ---------------------------------------------------------------------------

export type MaxCapacityResult =
  | { kind: "EXACT"; amount: number; path: PermissionPath }
  | { kind: "BOUNDED_RANGE"; lowerBound: number; upperBound?: number; reason: string }
  | { kind: "SCENARIO_DEPENDENT"; scenarios: { assumptionSet: TransactionAssumptions; amount: number }[] }
  | { kind: "ASSUMPTION_REQUIRED"; missingFields: string[] }
  | { kind: "REVIEW_REQUIRED"; reason: string };

// ---------------------------------------------------------------------------
// §N - Explainability / result object
// ---------------------------------------------------------------------------

export interface RatioTestResult {
  permissionId: string;
  measure: string;
  preTransactionRatio: number;
  postTransactionRatio?: number;
  threshold: number;
  status: RequirementResultStatus;
  reason?: string;
}

export interface SolverResult {
  overall: { status: PathStatus; amountTested: number; maximumCapacity?: MaxCapacityResult };
  permissionPathUsed?: PermissionPath;
  constraintsEvaluated: {
    sharedConstraints: SharedConstraint[];
    ratioTests: RatioTestResult[];
    eligibilityConditions: RequirementResult[];
    entityCollateralPriorityRequirements: RequirementResult[];
  };
  dynamicRules: {
    activated: { conditionId: string; effect: RuleActivationEffect; reason: string }[];
    parameterChanges: { affectedPermissionId: string; parameter: string; before: number; after: number }[];
    predicatesEvaluated: { conditionId: string; predicateKind: StatePredicateKind; result: boolean | "UNKNOWN"; stateUsed: string }[];
  };
  inputs: {
    financialFactsUsed: { field: string; value: number; provenance?: string }[];
    historicalStateUsed: { field: string; value: unknown; asOfEvent?: string }[];
    externalInputsUsed: ExternalInputRecord[];
    assumptionsUsed: AssumptionUsage[];
  };
  alternatives: { path: PermissionPath; rejectionReason: string }[];
  sources: SourceCitation[];
  uncertainty: {
    reviewItems: { reasonCategory: ReviewReasonCategory; description: string; affectedPermissions: string[] }[];
    missingInputs: string[];
    legalJudgmentRequired: { description: string; sourceProvision?: SourceProvisionRef }[];
  };
  /** Performance guardrail instrumentation (task §14) - never affects the result's correctness, only its observability. */
  searchStats: SearchStats;
}

/** Performance guardrail instrumentation (task §14), shared by lib/solver/election.ts's enumeration/evaluation loop and lib/solver/result.ts's SolverResult. */
export interface SearchStats {
  candidateElections: number;
  prunedElections: number;
  evaluatedElections: number;
  durationMs: number;
  limitExceeded: boolean;
}

// ---------------------------------------------------------------------------
// §Q.2 - Coverage-gate classification (Phase 3)
// ---------------------------------------------------------------------------

export type CoverageStatus = "SOLVER_NATIVE" | "LEGACY" | "NOT_TESTED";

export interface CoverageDeclaration {
  documentId: string;
  side: string;
  grantType: GrantType;
  isComplete: boolean;
}

export interface CoverageResult {
  status: CoverageStatus;
  documentId: string;
  side: string;
  grantType: GrantType;
  reason: string;
  /** Permission ids considered in scope for this determination, for audit. */
  scopedPermissionIds: string[];
}

// ---------------------------------------------------------------------------
// §E - Allocation model / election enumeration (Phase 6 types)
// ---------------------------------------------------------------------------

export interface Election {
  id: string;
  /** Permission ids this election relies on, including automatically-linked lien legs. */
  memberPermissionIds: string[];
  /** Human-readable description of which relationship rules produced this election, for explainability. */
  rationale: string;
}

export interface Allocation {
  electionId: string;
  perPermission: { permissionId: string; amount: number }[];
  totalAllocated: number;
}

export interface ConstraintResult {
  requirement: RequirementResult;
}
