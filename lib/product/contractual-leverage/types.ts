/**
 * Contractual leverage-ratio computation — shared types.
 *
 * Issuer-agnostic: every company supplies definition texts + financial inputs;
 * no production formula branches on companyId.
 */

export type DebtMetricBasis = "total" | "secured";

/**
 * How financial inputs were obtained. Caller-supplied / seeded values are never
 * labeled as authenticated approved evidence merely because they reached the resolver.
 */
export type FinancialInputAuthority =
  /** Dashboard edit, test fixture, or other caller-passed scalars. */
  | "CALLER_SUPPLIED"
  /** Legacy FinancialSnapshot / seed population — not an APPROVED certificate. */
  | "SEEDED_SNAPSHOT"
  /** Authenticated, approved, period-matched financial evidence (4B APPROVED path). */
  | "APPROVED_PERIOD_MATCHED";

/** Honesty level of the computed ratio — never silently "authoritative contractual". */
export type ComputationAuthority =
  /** Math succeeded; definitions/inputs/mechanics not fully verified for contractual reliance. */
  | "INDICATIVE"
  /** Operative defs + approved period-matched inputs + supported mechanics — still not legal capacity. */
  | "CONTRACTUAL_EXECUTABLE";

export type HeadroomPresentation =
  /** threshold − current ratio (x). Not legal incurrence capacity. */
  | "MATHEMATICAL_RATIO_HEADROOM"
  /** threshold × EBITDA − net debt ($M). Not legal incurrence capacity. */
  | "MATHEMATICAL_DOLLAR_ROOM"
  /** Explicitly refused — would be misleading as capacity. */
  | "NOT_PRESENTED_AS_CAPACITY";

export interface DefinitionText {
  termName: string;
  sectionRef: string;
  fullText: string;
  documentId: string;
  documentName?: string;
}

export interface IdentifiedLeverageComponents {
  leverageTerm: DefinitionText;
  ebitdaTerm: DefinitionText;
  debtBasis: DebtMetricBasis;
  debtMetricName: string;
  netsCash: boolean;
  /** Definition uses capped / lesser-of cash netting we do not execute. */
  hasUnsupportedCashCap: boolean;
  /** Definition references pro forma / acquisition adjustments without bound inputs. */
  hasUnresolvedProForma: boolean;
  formulaDisplay: string;
  citations: string[];
  limitations: string[];
}

export interface LeverageFinancialInputs {
  ebitda: number | null;
  totalDebt: number | null;
  securedDebt: number | null;
  cash: number | null;
}

export interface ResolvedInputLine {
  key: string;
  label: string;
  valueMillions: number | null;
  required: boolean;
  status: "RESOLVED" | "MISSING";
  /** Provenance authority for this input line. */
  authority: FinancialInputAuthority;
}

export type ContractualLeverageStatus =
  | "COMPUTED"
  | "MISSING_DEFINITIONS"
  | "UNSUPPORTED_DEFINITION_SHAPE"
  | "MISSING_INPUTS"
  | "EVALUATION_ERROR";

export interface EbitdaBuildupLineTrace {
  key: string;
  label: string;
  amountMillions: number | null;
  role: "BASE" | "ADD" | "SUBTRACT";
  /** Definition category matched, when recognized. */
  definitionMatch: string | null;
}

export interface EbitdaBuildupSummary {
  status: "COMPUTED" | "MISSING_INPUTS" | "UNSUPPORTED_DEFINITION_SHAPE";
  valueMillions: number | null;
  formulaDisplay: string | null;
  lineItems: EbitdaBuildupLineTrace[];
  /** Ordered numerical trace for the dashboard (signed contributions). */
  numericalTrace: Array<{ label: string; amountMillions: number; sign: "+" | "−" | "=" }>;
  /** Definition prongs / evidence rows that remain unresolved. */
  unresolvedComponents: string[];
  /** Phase 4B resolve states when approval was checked (APPROVED-only policy). */
  approvalResolution: Array<{ key: string; label: string; resolveState: string; reason: string | null }>;
  citations: string[];
  missingRequirements: string[];
  limitations: string[];
  authority: FinancialInputAuthority;
  runtimeStatus: string | null;
  /** Period identity used for the build-up. */
  period: string | null;
  definitionIdentity: string | null;
}

export interface ContractualLeverageResult {
  status: ContractualLeverageStatus;
  name: string;
  sectionRef: string;
  documentName: string | null;
  debtBasis: DebtMetricBasis | null;
  formulaDisplay: string | null;
  citations: string[];
  limitations: string[];
  inputs: ResolvedInputLine[];
  missingRequirements: string[];
  currentRatio: number | null;
  threshold: number | null;
  /**
   * Mathematical ratio headroom (threshold − current). Never legal incurrence capacity.
   */
  ratioHeadroom: number | null;
  /**
   * Mathematical dollar room under threshold × EBITDA − net debt ($M).
   * Null when unsupported or inputs missing. Never legal incurrence capacity.
   */
  debtHeadroomMillions: number | null;
  runtimeStatus: string | null;
  /** How inputs were sourced. */
  inputAuthority: FinancialInputAuthority;
  /** INDICATIVE until defs + approved inputs + supported mechanics clear. */
  computationAuthority: ComputationAuthority;
  headroomPresentation: HeadroomPresentation;
  /** Explicit disclaimer always shown with headroom figures. */
  capacityDisclaimer: string;
  /** Optional Consolidated EBITDA build-up attached to this result. */
  ebitdaBuildup: EbitdaBuildupSummary | null;
}

export interface ApprovedFinancialLineItem {
  key: string;
  label: string;
  amountMillions: number;
  /** Period key the fact is stated for (e.g. TTM ending 2024-12-31). */
  period: string;
  asOf: string;
  authority: FinancialInputAuthority;
  sourceCitation?: string;
}

export interface LeverageCalculationRequest {
  name: string;
  sectionRef: string;
  documentName?: string | null;
  companyId: string;
  instrumentKey: string;
  definitions: DefinitionText[];
  leverageTermCandidates: string[];
  ebitdaTermCandidates?: string[];
  threshold?: number | null;
  debtBasisHint?: DebtMetricBasis | null;
  financials: LeverageFinancialInputs;
  /** Default authority for scalar financials when not overridden per line. */
  financialAuthority?: FinancialInputAuthority;
  /**
   * Optional approved line items for Consolidated EBITDA build-up.
   * When present and complete, used as the EBITDA input with their authority.
   */
  ebitdaLineItems?: ApprovedFinancialLineItem[];
  /** Period expected for period-matched approved evidence. */
  expectedPeriod?: string | null;
}
