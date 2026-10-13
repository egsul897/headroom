/**
 * Contractual leverage-ratio computation — shared types.
 *
 * Issuer-agnostic: every company supplies definition texts + financial inputs;
 * no production formula branches on companyId.
 */

export type DebtMetricBasis = "total" | "secured";

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
  /** Contractual / covenant EBITDA ($M). */
  ebitda: number | null;
  /** Gross total indebtedness ($M). */
  totalDebt: number | null;
  /** Gross secured indebtedness ($M). */
  securedDebt: number | null;
  /** Unrestricted cash & cash equivalents ($M). */
  cash: number | null;
}

export interface ResolvedInputLine {
  key: string;
  label: string;
  valueMillions: number | null;
  required: boolean;
  status: "RESOLVED" | "MISSING";
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
   * Dollar headroom under threshold × EBITDA − net debt ($M), when the
   * definition nets cash (or uses gross debt) and a threshold is known.
   * Null when legally/mathematically unsupported or inputs missing.
   */
  debtHeadroomMillions: number | null;
  /** Runtime evaluation status for the ratio expression, when attempted. */
  runtimeStatus: string | null;
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
}
