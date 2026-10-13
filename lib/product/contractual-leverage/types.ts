/**
 * Contractual leverage-ratio computation — shared types.
 *
 * Issuer-agnostic: every company supplies definition texts + financial inputs;
 * no production formula branches on companyId.
 */

/**
 * Fulfillment / information-request shapes mirrored here so client modules can
 * import this file without traversing contract-model/runtime (node:crypto).
 * Keep in sync with lib/contract-model/contractual-metric-execution exports.
 */
export type FulfillmentState =
  | "APPROVED_VERIFIED"
  | "MISSING"
  | "STALE"
  | "AMBIGUOUS"
  | "UNSUPPORTED"
  | "NOT_APPROVED"
  | "INCOMPATIBLE";

export type EbitdaBuildupKind = "COHERENT_CAPPED_ADDBACK" | "MATTHEWS_UNCAPPED_SUM";

export type DebtMetricBasis = "total" | "secured";

/** Minimal serializable information-request summary for dashboard display. */
export interface FinancialInformationRequestSummary {
  executable: boolean;
  blockingKeys: string[];
  summary: Partial<Record<FulfillmentState, number>>;
}

export interface DefinitionText {
  termName: string;
  sectionRef: string;
  fullText: string;
  documentId: string;
  documentName?: string;
}

export interface IdentifiedLeverageComponents {
  /** Operative leverage-ratio defined term. */
  leverageTerm: DefinitionText;
  /** Operative EBITDA defined term. */
  ebitdaTerm: DefinitionText;
  debtBasis: DebtMetricBasis;
  /** Contractual debt metric name as named in the leverage definition. */
  debtMetricName: string;
  /** True when the definition nets unrestricted cash / Cash Equivalents. */
  netsCash: boolean;
  /** Human-readable formula skeleton derived from the definition text. */
  formulaDisplay: string;
  /** Source citations (section refs + term names). */
  citations: string[];
  /** Structural limitations detected at identification time. */
  limitations: string[];
}

export interface LeverageFinancialInputs {
  /**
   * Caller-supplied contractual EBITDA ($M) when not deriving via build-up.
   * Never treated as an independently compiled definition result.
   */
  ebitda: number | null;
  /** Gross total indebtedness ($M). */
  totalDebt: number | null;
  /** Gross secured indebtedness ($M). */
  securedDebt: number | null;
  /** Unrestricted cash & cash equivalents ($M). */
  cash: number | null;
}

/** Component metrics for an EBITDA build-up ($M). Absent keys → MISSING (never zero). */
export type EbitdaComponentInputs = Record<string, number | null | undefined>;

export interface ResolvedInputLine {
  key: string;
  label: string;
  valueMillions: number | null;
  required: boolean;
  /** Legacy coarse status kept for dashboard compatibility. */
  status: "RESOLVED" | "MISSING";
  /** Fine-grained fulfillment when join ran. */
  fulfillmentState?: FulfillmentState;
}

export type ContractualLeverageStatus =
  | "COMPUTED"
  | "MISSING_DEFINITIONS"
  | "UNSUPPORTED_DEFINITION_SHAPE"
  | "MISSING_INPUTS"
  | "EVALUATION_ERROR";

export interface ContractualLeverageResult {
  status: ContractualLeverageStatus;
  /** Provision / basket label when computed against a threshold covenant. */
  name: string;
  sectionRef: string;
  documentName: string | null;
  debtBasis: DebtMetricBasis | null;
  formulaDisplay: string | null;
  citations: string[];
  limitations: string[];
  inputs: ResolvedInputLine[];
  missingRequirements: string[];
  /** Current contractual leverage ratio (x), when computed. */
  currentRatio: number | null;
  /** Covenant / basket threshold (x), when supplied. */
  threshold: number | null;
  /** Ratio headroom (threshold − current) for at-or-below tests. */
  ratioHeadroom: number | null;
  /**
   * Mathematical threshold×EBITDA − netDebt ($M).
   * NOT verified available debt capacity — ratio arithmetic only.
   */
  debtHeadroomMillions: number | null;
  /** Explicit product flag: dollar figure is ratio math, not capacity authority. */
  debtHeadroomIsVerifiedCapacity: false;
  /** Runtime evaluation status for the ratio expression, when attempted. */
  runtimeStatus: string | null;
  /** Derived contractual EBITDA from build-up when used ($M). */
  derivedEbitdaMillions?: number | null;
  ebitdaBuildupKind?: EbitdaBuildupKind | null;
  /** Manifest→fulfillment join summary when snapshots were supplied. */
  informationRequest?: FinancialInformationRequestSummary | null;
}

export interface LeverageCalculationRequest {
  /** Display name for the covenant / basket. */
  name: string;
  sectionRef: string;
  documentName?: string | null;
  companyId: string;
  instrumentKey: string;
  /** All defined-term texts available for the instrument (EBITDA + leverage + peers). */
  definitions: DefinitionText[];
  /** Preferred leverage term name(s), most specific first. */
  leverageTermCandidates: string[];
  /** Preferred EBITDA term name(s). */
  ebitdaTermCandidates?: string[];
  /** Threshold for headroom (e.g. 4.25). Omit → ratio only. */
  threshold?: number | null;
  /** Hint when definition text does not itself establish secured vs total. */
  debtBasisHint?: DebtMetricBasis | null;
  financials: LeverageFinancialInputs;
  /**
   * When set, EBITDA is derived from component metrics via FIXED_POINT / SUM build-up
   * instead of using financials.ebitda as a black-box certificate figure.
   */
  ebitdaBuildup?: EbitdaBuildupKind | null;
  /** Component metrics for build-up ($M). Required keys depend on buildup kind. */
  ebitdaComponents?: EbitdaComponentInputs | null;
}
