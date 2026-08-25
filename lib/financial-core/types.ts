/**
 * Financial-core domain types (Phase 2 of
 * docs/financial-core-vertical-slice-implementation.md, implementing
 * docs/generalized-financial-analytics-architecture.md §C/§D/§E/§F/§G/§H/§I/§K).
 *
 * Pure domain vocabulary - no Prisma types, no company-name/document-id/
 * provision-code branching anywhere in this file (task §25). A synthetic
 * fixture and a future real company both produce values of these same types.
 *
 * Deliberately reused, not reinvented (architecture §S.1, §M.1):
 *  - `ProvenanceWrapper<T>`/`SourceCitation`/`EntityClass`/`MeasurementBasis`
 *    are imported FROM lib/solver/types.ts, never redefined.
 *  - `FinancialSnapshotInput`/`LeverageMetrics`/`computeLeverageMetrics` stay
 *    in lib/covenant-engine.ts, untouched - this file's `FinancialMetrics`
 *    (see metrics.ts) is a deliberately distinct, non-covenant-defined
 *    vocabulary (architecture §G.1).
 */

import type { EntityClass, ProvenanceWrapper, SourceCitation } from "../solver/types";

// ---------------------------------------------------------------------------
// §M.1 - the one provenance wrapper, extended with as-of-date/staleness
// (architecture §C.1, §O.1)
// ---------------------------------------------------------------------------

export interface ProvencancedFact<T> extends ProvenanceWrapper<T> {
  asOfDate: Date;
  staleness?: { maxAgeDays: number };
}

export function fact<T>(
  value: T,
  sourceType: ProvenanceWrapper<T>["sourceType"],
  asOfDate: Date,
  opts?: { reviewStatus?: ProvenanceWrapper<T>["reviewStatus"]; notes?: string; maxAgeDays?: number }
): ProvencancedFact<T> {
  return {
    value,
    sourceType,
    reviewStatus: opts?.reviewStatus ?? "UNVERIFIED",
    notes: opts?.notes,
    asOfDate,
    staleness: opts?.maxAgeDays !== undefined ? { maxAgeDays: opts.maxAgeDays } : undefined,
  };
}

// ---------------------------------------------------------------------------
// §C - canonical FinancialState
// ---------------------------------------------------------------------------

export type PeriodType = "ACTUAL" | "FORECAST" | "PRO_FORMA";

export interface EntityScopeRef {
  kind: "CONSOLIDATED" | "ENTITY_CLASS";
  entityClass?: EntityClass;
}

export interface BalanceSheetFacts {
  cash: ProvencancedFact<number>;
  restrictedCash?: ProvencancedFact<number>;
  totalAssets?: ProvencancedFact<number>;
  totalDebtPrincipal: ProvencancedFact<number>;
  securedDebtPrincipal: ProvencancedFact<number>;
  totalEquity?: ProvencancedFact<number>;
}

export interface IncomeStatementFacts {
  revenue?: ProvencancedFact<number>;
  gaapEbitda?: ProvencancedFact<number>;
  gaapNetIncome?: ProvencancedFact<number>;
  cumulativeNetIncomeSinceIssue: ProvencancedFact<number>;
  equityProceedsSinceIssue: ProvencancedFact<number>;
  interestExpense: ProvencancedFact<number>;
  capex?: ProvencancedFact<number>;
}

export interface CovenantEbitdaAddback {
  label: string;
  amount: number;
  provenance: ProvencancedFact<number>;
}

export interface CovenantMetricFacts {
  covenantEbitda?: { value: number; addbacks: CovenantEbitdaAddback[]; provenance: ProvencancedFact<number> };
  assumedNewDebtRatePct: ProvencancedFact<number>;
}

/**
 * Additive extension beyond architecture §C.1's three fact groups (see
 * prisma/schema.prisma's FinancialState model comment for why) - the
 * revolver/ABL-specific facts the liquidity engine (§F) and the product
 * acceptance target (task §2) need that don't fit balance-sheet/income-
 * statement/covenant-metric categories.
 */
export interface LiquidityFacts {
  revolverFacilityId?: string;
  revolverCommitment?: ProvencancedFact<number>;
  revolverDrawn?: ProvencancedFact<number>;
  revolverLcUsage?: ProvencancedFact<number>;
  /** Present only when a borrowing-base certificate has been ingested (architecture §F.1). Absent = fail-closed for borrowing-base-constrained availability, never assumed equal to commitment. */
  borrowingBaseValue?: ProvencancedFact<number>;
}

export interface FinancialState {
  id: string;
  companyId: string;
  asOfDate: Date;
  periodType: PeriodType;
  scope: EntityScopeRef;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  balanceSheetFacts: BalanceSheetFacts;
  incomeStatementFacts: IncomeStatementFacts;
  covenantMetricFacts: CovenantMetricFacts;
  liquidityFacts?: LiquidityFacts;
  notes?: string;
}

// ---------------------------------------------------------------------------
// §D - capital structure
// ---------------------------------------------------------------------------

export type FacilityType = "TERM_LOAN" | "REVOLVER" | "NOTES" | "ABL" | "OTHER";
export type CouponType = "FIXED" | "FLOATING";

export interface Facility {
  id: string;
  companyId: string;
  name: string;
  facilityType: FacilityType;
  currency: { code: string };
  originalPrincipal: number;
  /** REVOLVER/ABL only. */
  commitmentAmount?: number;
  borrowingBaseAtOrigination?: number;
  secured: boolean;
  couponType: CouponType;
  couponPct?: number;
  marginBps?: number;
  referenceRate?: string;
  rateFloorPct?: number;
  maturityDate?: Date;
  issuedDate?: Date;
  governingDocumentId?: string;
  obligorEntityClasses: EntityClass[];
  guarantorEntityClasses: EntityClass[];
  collateralPoolIds: string[];
  originatingPermissionIds: string[];
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

// ---------------------------------------------------------------------------
// §E - debt events
// ---------------------------------------------------------------------------

export type DebtEventType = "ISSUANCE" | "REPAYMENT" | "REFINANCING" | "REDESIGNATION" | "RECLASSIFICATION" | "AMENDMENT" | "LC_ISSUANCE" | "LC_EXPIRATION";

export interface DebtEvent {
  id: string;
  companyId: string;
  facilityId: string;
  eventType: DebtEventType;
  date: Date;
  amount: number;
  refinancesFacilityId?: string;
  relatedPermissionIds?: string[];
  sourceLedgerEntryId?: string;
  provenance: ProvencancedFact<number>;
}

// ---------------------------------------------------------------------------
// §F - liquidity
// ---------------------------------------------------------------------------

export type LiquidityComponentStatus = "AVAILABLE" | "UNAVAILABLE_REVIEW_REQUIRED";

export interface LiquidityComponentTrace {
  label: string;
  value: number | null;
  status: LiquidityComponentStatus;
  detail: string;
}

export interface LiquidityPosition {
  companyId: string;
  asOfDate: Date;
  cash: ProvencancedFact<number>;
  restrictedCash: number;
  availableCash: number;
  revolverFacilityId?: string;
  revolverCommitment?: number;
  revolverDrawn?: number;
  revolverLcUsage?: number;
  borrowingBaseValue?: number;
  /** Undrawn commitment: commitment - drawn - LC usage, ignoring any borrowing-base constraint. Always computable when a revolver exists. */
  undrawnCommitment?: number;
  /**
   * Actual modeled availability: for a facility with a borrowing-base
   * constraint, min(commitment, borrowingBaseValue) - drawn - lcUsage; for
   * one without, equals undrawnCommitment. `null` + status
   * UNAVAILABLE_REVIEW_REQUIRED when a required borrowing-base input is
   * absent (architecture §F.1's fail-closed rule) - independent facts
   * (cash, debt) are never suppressed because of this (task §7/§20).
   */
  revolverAvailability: number | null;
  revolverAvailabilityStatus: LiquidityComponentStatus;
  totalLiquidity: number | null;
  componentTrace: LiquidityComponentTrace[];
}

// ---------------------------------------------------------------------------
// §G - generic financial metrics (explicitly NOT covenant-defined ratios -
// architecture §G.1's naming discipline)
// ---------------------------------------------------------------------------

export type MetricStatus = "OK" | "UNAVAILABLE_MISSING_INPUT" | "UNAVAILABLE_INVALID_DENOMINATOR";

export interface MetricResult {
  status: MetricStatus;
  value: number | null;
  detail?: string;
}

export interface GenericFinancialMetrics {
  companyId: string;
  asOfDate: Date;
  /** Generic gross leverage = gross debt / generic EBITDA. NOT a covenant-defined ratio (architecture §G.1/§G.2). */
  genericGrossLeverage: MetricResult;
  genericNetLeverage: MetricResult;
  genericSecuredLeverage: MetricResult;
  /** Generic interest coverage = generic EBITDA / annualized cash interest. */
  genericInterestCoverage: MetricResult;
  ebitdaMarginPct: MetricResult;
}

// ---------------------------------------------------------------------------
// §D - capital-structure summary
// ---------------------------------------------------------------------------

export interface CapitalStructureSummary {
  companyId: string;
  asOfDate: Date;
  facilities: { facility: Facility; outstandingPrincipal: number }[];
  grossDebt: number;
  netDebt: number;
  securedDebt: number;
  unsecuredDebt: number;
  fixedRateDebt: number;
  floatingRateDebt: number;
  fixedPct: number | null;
  floatingPct: number | null;
  /** Undefined when there is zero outstanding debt (no rate to weight). */
  weightedAverageInterestRatePct: number | null;
}

// ---------------------------------------------------------------------------
// §H - interest / debt service
// ---------------------------------------------------------------------------

export interface InstrumentInterestResult {
  facilityId: string;
  facilityName: string;
  outstandingPrincipal: number;
  effectiveRatePct: number | ProvencancedFact<null> | null;
  annualizedCashInterest: number | null;
  status: "OK" | "MISSING_BENCHMARK_ASSUMPTION";
  detail?: string;
}

export interface InterestResult {
  companyId: string;
  asOfDate: Date;
  perInstrument: InstrumentInterestResult[];
  totalAnnualizedCashInterest: number;
  assumptions: { referenceRate: string; assumedRatePct: number }[];
  /** True if any FLOATING instrument's referenceRate had no matching assumption supplied - surfaced, never silently defaulted (task §9). */
  hasMissingBenchmarkAssumption: boolean;
}

// ---------------------------------------------------------------------------
// §I - maturity analytics
// ---------------------------------------------------------------------------

export interface MaturityWallEntry {
  periodLabel: string;
  year: number;
  principalMaturing: number;
  facilityIds: string[];
}

export interface MaturityAnalytics {
  companyId: string;
  asOfDate: Date;
  nextMaturity?: { facilityId: string; facilityName: string; date: Date; principal: number };
  dueWithin12Months: number;
  dueWithin24Months: number;
  dueWithin36Months: number;
  maturityWall: MaturityWallEntry[];
  /** Company-wide, principal-weighted years-to-maturity across bullet facilities (this slice models bullet maturities only - see AmortizationSchedule deferral). */
  weightedAverageMaturityYears: number | null;
}

// ---------------------------------------------------------------------------
// §K - scenario engine
// ---------------------------------------------------------------------------

export interface FacilityDraft {
  name: string;
  facilityType: FacilityType;
  currency?: string;
  secured: boolean;
  couponType: CouponType;
  couponPct?: number;
  marginBps?: number;
  referenceRate?: string;
  rateFloorPct?: number;
  maturityDate?: Date;
  commitmentAmount?: number;
}

/**
 * design doc §K.1's union, plus two additive members (`DRAW_REVOLVER`,
 * `CHANGE_EBITDA`) the architecture's own §K.1 list didn't enumerate but
 * task §11/§19-23 require as distinct, directly-testable economic actions
 * (a revolver draw against an EXISTING facility is a different action from
 * `DEBT_ISSUANCE`, which always drafts a NEW facility; a standalone EBITDA
 * assumption change is needed by the adversarial zero/missing-EBITDA cases
 * independent of any acquisition). Named exactly per the task's own kind
 * names where the architecture is silent; the architecture's own kind names
 * (`DEBT_ISSUANCE`, `RATE_ASSUMPTION_CHANGE`, `ACQUISITION`, ...) are used
 * verbatim everywhere they overlap, per this task's instruction to follow
 * the architecture's naming where the two describe the same capability.
 */
export type ScenarioAction =
  | { kind: "DEBT_ISSUANCE"; facilityDraft: FacilityDraft; amount: number; useOfProceeds: string }
  | { kind: "DRAW_REVOLVER"; facilityId: string; amount: number }
  | { kind: "DEBT_REPAYMENT"; facilityId: string; amount: number }
  | { kind: "REFINANCING"; retiresFacilityId: string; newFacilityDraft: FacilityDraft; newAmount: number }
  | { kind: "DIVIDEND"; amount: number }
  | { kind: "SHARE_REPURCHASE"; amount: number }
  | { kind: "ASSET_SALE"; netProceeds: number; reinvest: boolean; ebitdaImpact?: number }
  | {
      kind: "ACQUISITION";
      purchasePrice: number;
      cashConsideration: number;
      revolverFunding: { facilityId: string; amount: number } | null;
      newDebtFunding: { facilityDraft: FacilityDraft; amount: number } | null;
      acquiredEbitda: number;
      synergyEbitda: number;
      transactionFees: number;
    }
  | { kind: "CHANGE_EBITDA"; ebitdaDelta: number; description?: string }
  | { kind: "RATE_ASSUMPTION_CHANGE"; newAssumedRatePct: number; referenceRate?: string }
  | { kind: "WORKING_CAPITAL_CHANGE"; cashDelta: number };

export interface Scenario {
  id: string;
  companyId: string;
  baseFinancialStateId: string;
  actions: ScenarioAction[];
}

export interface FinancialStateDelta {
  actionIndex: number;
  action: ScenarioAction;
  cashDelta: number;
  grossDebtDelta: number;
  liquidityDelta: number;
  ebitdaDelta: number;
  interestExpenseDelta: number;
  newFacilityIds: string[];
  modifiedFacilityIds: string[];
  maturityChanges: string[];
}

export interface ScenarioRunResult {
  baseState: FinancialState;
  proFormaState: FinancialState;
  proFormaFacilities: Facility[];
  proFormaEvents: DebtEvent[];
  perActionDeltas: FinancialStateDelta[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// §Q/§R - dashboard / scenario output contracts
// ---------------------------------------------------------------------------

export interface ProvenanceIndexEntry {
  fact: ProvencancedFact<unknown>;
  isStale: boolean;
  stalenessDays?: number;
}

export interface FinancialPosition {
  companyId: string;
  asOfDate: Date;
  liquidity: LiquidityPosition;
  capitalStructure: CapitalStructureSummary;
  metrics: GenericFinancialMetrics;
  interest: InterestResult;
  maturities: MaturityAnalytics;
  warnings: { category: string; description: string }[];
  provenanceIndex: Record<string, ProvenanceIndexEntry>;
}

export interface ScenarioWarning {
  category: "STALE_INPUT" | "DISPUTED_FACT" | "UNMODELED_COVENANT" | "MISSING_ASSUMPTION" | "FORECAST_DRIVER_UNCERTAIN";
  description: string;
  affectedFacts?: string[];
}

export interface ScenarioResult {
  scenarioId: string;
  companyId: string;
  asOfDate: Date;
  actionsApplied: ScenarioAction[];
  before: { state: FinancialState; position: FinancialPosition };
  transaction: { actions: ScenarioAction[]; assumptions: Record<string, unknown> };
  after: { state: FinancialState; position: FinancialPosition };
  financialImpact: {
    cashDelta: number;
    grossDebtDelta: number;
    netDebtDelta: number;
    liquidityDelta: number;
    ebitdaDelta: number;
    interestDelta: number;
    leverageDelta: { grossLeverageDelta: number | null; netLeverageDelta: number | null };
    maturityChanges: string[];
    perActionDeltas: FinancialStateDelta[];
  };
  contractualImpact?: {
    overallStatus: string;
    perDocument: unknown[];
    reviewRequired: boolean;
  };
  warnings: ScenarioWarning[];
  sourceTrace: SourceCitation[];
}
