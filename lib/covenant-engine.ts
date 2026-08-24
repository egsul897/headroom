/**
 * Covenant capacity engine.
 *
 * This module evaluates covenant capacity purely from structured data:
 * formula archetypes (FormulaType), thresholds, and expression trees over
 * CovenantProvision rows. It never branches on a company, document, section,
 * or basket name - adding a new basket that fits an existing formula type
 * requires a new database row, not a source change.
 *
 * Fail-closed by construction: every result carries an EvaluationStatus
 * ("modeled" | "not_tested" | "review_required") alongside its number.
 * Missing or incomplete configuration never silently becomes Infinity/
 * "unlimited" or 0 - it becomes not_tested/review_required, and that status
 * propagates through every composition (capacity expressions, cross-document
 * minimums, transaction simulations) so a transaction can never come back
 * "clear" while something applicable to it wasn't actually evaluated.
 *
 * The module is split in two layers:
 *  - A pure calculation core (no DB, no I/O) that takes plain data objects
 *    shaped like the DB rows. This is what's unit tested.
 *  - A thin Prisma adapter (`loadCompanyCovenantData`) that fetches rows
 *    (date-scoped by `asOfDate` for amendment precedence) and maps them
 *    (Decimal -> number, etc) into the pure core's input types.
 */

// ---------------------------------------------------------------------------
// Types mirroring the Prisma schema (decimal fields as `number`)
// ---------------------------------------------------------------------------

export type FormulaType =
  | "FLAT_AMOUNT"
  | "FLAT_NET_OF_DEBT"
  | "GREATER_OF_FLAT_OR_PCT_EBITDA"
  | "LEVERAGE_RATIO_ROOM"
  | "COVERAGE_RATIO_ROOM"
  | "BUILDER_BASKET"
  | "RATIO_GATE";

export type DebtBasis = "total" | "secured";

/**
 * Whether a computed result reflects real, complete configuration
 * ("modeled") or is missing/incomplete in a way that must not be presented
 * as a definite number. "not_tested" = no configuration exists at all for
 * something applicable. "review_required" = configuration exists but is
 * incomplete or internally inconsistent in a way that blocks confident
 * evaluation (e.g. a coverage-ratio formula with no assumed interest rate).
 */
export type EvaluationStatus = "modeled" | "not_tested" | "review_required";

/** The outcome of testing a proposed transaction against modeled covenants. */
export type TransactionStatus = "clear" | "blocked" | "not_tested" | "review_required";

/** Priority order when combining multiple statuses into one overall status: a confirmed block always wins, then any uncertainty, then clear. */
function worstStatus(statuses: EvaluationStatus[]): EvaluationStatus {
  if (statuses.length === 0) return "not_tested";
  if (statuses.includes("review_required")) return "review_required";
  if (statuses.includes("not_tested")) return "not_tested";
  return "modeled";
}

function combineReasons(parts: { status: EvaluationStatus; reason?: string }[]): string | undefined {
  const reasons = parts.filter((p) => p.status !== "modeled" && p.reason).map((p) => p.reason!);
  return reasons.length > 0 ? reasons.join(" ") : undefined;
}

/** Formula-specific secondary inputs, stored as CovenantProvision.params JSON. */
export interface FormulaParams {
  /** GREATER_OF_FLAT_OR_PCT_EBITDA, BUILDER_BASKET: the EBITDA percentage (e.g. 0.25 for 25%). */
  pctEbitda?: number;
  /** LEVERAGE_RATIO_ROOM, RATIO_GATE: which net-leverage measure to test ("total" default, or "secured"). */
  debtBasis?: DebtBasis;
  /** FLAT_NET_OF_DEBT: which gross debt outstanding to net the flat basket against. */
  netOfBasis?: DebtBasis;
  /** BUILDER_BASKET: share of cumulative net income added to the basket (e.g. 0.5 for 50%). */
  cniSharePct?: number;
  /** BUILDER_BASKET: whether equity proceeds since issuance are added to the basket. */
  includeEquityProceeds?: boolean;
  /** BUILDER_BASKET: section ref for the starter component, if distinct from the provision's own sectionRef. */
  starterSectionRef?: string;
  /** BUILDER_BASKET: section ref for the CNI contribution, if distinct from the provision's own sectionRef. */
  cniSectionRef?: string;
  /** BUILDER_BASKET: section ref for the equity proceeds contribution, if distinct from the provision's own sectionRef. */
  equitySectionRef?: string;
}

/** One line item inside a composite basket's total (currently: BUILDER_BASKET). */
export interface EvaluatedProvisionComponent {
  label: string;
  sectionRef: string;
  value: number;
}

export interface CovenantProvisionInput {
  id: string;
  documentId: string;
  /** Stable machine key referenced by a document's capacityFormulas / rpWaterfall / assetSale config. */
  code: string;
  basketName: string;
  sectionRef: string;
  formulaType: FormulaType;
  thresholdValue: number;
  params?: FormulaParams | null;
  notes?: string | null;
}

/**
 * An expression tree combining evaluated provision capacities into one
 * document-level capacity figure. An optional `label` marks a node whose
 * value is meaningful to surface on its own (e.g. "Lien capacity" as the sum
 * of two lien-related baskets) - `computeCovenantPosition` collects every
 * labeled node into `labeledSubtotals`, so the UI can render a
 * database-declared derived total instead of inventing one in JSX.
 */
export type CapacityExpr =
  | { op: "REF"; code: string; label?: string }
  | { op: "SUM"; items: CapacityExpr[]; label?: string }
  | { op: "MIN"; items: CapacityExpr[]; label?: string }
  | { op: "MAX"; items: CapacityExpr[]; label?: string };

export interface CapacityFormulas {
  secured?: CapacityExpr;
  unsecured?: CapacityExpr;
}

export type RestrictedPaymentKind = "dividend" | "investment";

export interface RpWaterfallConfig {
  /** Ordered basket steps drawn down before the ratio gate (e.g. builder basket, then general basket). */
  steps: { code: string }[];
  /** Which RATIO_GATE provision code gates unlimited capacity for each kind of payment. */
  ratioGateCodeByKind: Record<RestrictedPaymentKind, string>;
}

export interface AssetSaleConfig {
  /** Provision code for the Excess Proceeds threshold basket. */
  thresholdCode: string;
  reinvestmentWindowDays: number;
}

export type DocumentType = "CREDIT_AGREEMENT" | "INDENTURE" | "OTHER";

export interface DocumentInput {
  id: string;
  name: string;
  type: DocumentType;
  governs?: string | null;
  capacityFormulas?: CapacityFormulas | null;
  rpWaterfall?: RpWaterfallConfig | null;
  assetSale?: AssetSaleConfig | null;
}

export interface FinancialSnapshotInput {
  ebitda: number;
  cash: number;
  interestExpense: number;
  cumulativeNetIncome: number;
  equityProceedsSinceIssue: number;
  assumedNewDebtRatePct: number;
  totalDebt: number;
  securedDebt: number;
}

export type LedgerBasket = "EQUITY" | "DEBT_INCUR" | "DEBT_REPAY" | "ASSET_SALE" | "DIVIDEND" | "INVESTMENT";
export type LedgerDirection = "CREDIT" | "DEBIT";

export interface LedgerEntryInput {
  basket: LedgerBasket;
  amount: number;
  direction: LedgerDirection;
}

export interface CompanyCovenantData {
  companyId: string;
  documents: DocumentInput[];
  provisions: CovenantProvisionInput[];
  financials: FinancialSnapshotInput;
  ledger: LedgerEntryInput[];
}

// ---------------------------------------------------------------------------
// Leverage metrics (equivalent to the top of the `m` hook)
// ---------------------------------------------------------------------------

export interface LeverageMetrics {
  netDebt: number;
  netSecured: number;
  /** Total net leverage (TNL). */
  totalNetLeverage: number;
  /** Senior secured net leverage (SSNL). */
  seniorSecuredNetLeverage: number;
  /** Fixed charge coverage ratio (FCCR), also used as interest coverage (IC). */
  fixedChargeCoverage: number;
}

export function computeLeverageMetrics(fin: FinancialSnapshotInput): LeverageMetrics {
  const netDebt = fin.totalDebt - fin.cash;
  const netSecured = fin.securedDebt - fin.cash;
  return {
    netDebt,
    netSecured,
    totalNetLeverage: netDebt / fin.ebitda,
    seniorSecuredNetLeverage: netSecured / fin.ebitda,
    fixedChargeCoverage: fin.ebitda / fin.interestExpense,
  };
}

/** Human-readable name for the leverage measure a LEVERAGE_RATIO_ROOM/RATIO_GATE provision tests - derived from params, never hardcoded per provision. */
export function leverageMetricName(basis: DebtBasis | undefined): string {
  return basis === "secured" ? "Senior Secured Net Leverage" : "Total Net Leverage";
}

// ---------------------------------------------------------------------------
// Leaf provision evaluation
// ---------------------------------------------------------------------------

export interface EvaluatedProvision {
  provision: CovenantProvisionInput;
  status: EvaluationStatus;
  /**
   * The basket's capacity in $M. Only meaningful when status === "modeled".
   * Infinity is legitimate here ONLY when status === "modeled" (an explicit
   * RATIO_GATE formula genuinely modeling "unlimited if ratio condition
   * met") - it is never used as a stand-in for missing configuration.
   */
  capacity?: number;
  /** Populated when status !== "modeled", explaining what's missing/incomplete. */
  reason?: string;
  /** Present only for RATIO_GATE provisions. */
  gate?: { open: boolean; measure: number };
  /** Present only for composite formulas (currently BUILDER_BASKET): the line items summing to `capacity`. */
  components?: EvaluatedProvisionComponent[];
}

function leverageBasisValue(basis: DebtBasis | undefined, metrics: LeverageMetrics): number {
  return basis === "secured" ? metrics.netSecured : metrics.netDebt;
}

function grossDebtOutstanding(basis: DebtBasis | undefined, fin: FinancialSnapshotInput): number {
  return basis === "secured" ? fin.securedDebt : fin.totalDebt;
}

function leverageMeasure(basis: DebtBasis | undefined, metrics: LeverageMetrics): number {
  return basis === "secured" ? metrics.seniorSecuredNetLeverage : metrics.totalNetLeverage;
}

/**
 * Evaluate a single CovenantProvision's capacity, given the current
 * financials and leverage metrics. This is the data-driven replacement for
 * every hardcoded formula in the original prototype. It never branches on a
 * provision's code, basketName, or document - only on formulaType (a closed,
 * generic enum) and params.
 */
export function evaluateProvision(
  p: CovenantProvisionInput,
  fin: FinancialSnapshotInput,
  metrics: LeverageMetrics
): EvaluatedProvision {
  const params = p.params ?? {};

  switch (p.formulaType) {
    case "FLAT_AMOUNT": {
      return { provision: p, status: "modeled", capacity: Math.max(0, p.thresholdValue) };
    }
    case "FLAT_NET_OF_DEBT": {
      const outstanding = grossDebtOutstanding(params.netOfBasis, fin);
      return { provision: p, status: "modeled", capacity: Math.max(0, p.thresholdValue - outstanding) };
    }
    case "GREATER_OF_FLAT_OR_PCT_EBITDA": {
      const pct = params.pctEbitda ?? 0;
      return { provision: p, status: "modeled", capacity: Math.max(p.thresholdValue, pct * fin.ebitda) };
    }
    case "LEVERAGE_RATIO_ROOM": {
      const basis = leverageBasisValue(params.debtBasis, metrics);
      return { provision: p, status: "modeled", capacity: Math.max(0, p.thresholdValue * fin.ebitda - basis) };
    }
    case "COVERAGE_RATIO_ROOM": {
      const rate = fin.assumedNewDebtRatePct / 100;
      if (rate <= 0) {
        return {
          provision: p,
          status: "review_required",
          reason: `"${p.basketName}" (${p.sectionRef}) is a coverage-ratio formula, which requires an assumed new-debt interest rate to convert a coverage ratio into a dollar capacity - the financial snapshot's assumedNewDebtRatePct is zero or not set.`,
        };
      }
      const capacity = Math.max(0, (fin.ebitda / p.thresholdValue - fin.interestExpense) / rate);
      return { provision: p, status: "modeled", capacity };
    }
    case "BUILDER_BASKET": {
      const pct = params.pctEbitda ?? 0;
      const base = Math.max(p.thresholdValue, pct * fin.ebitda);
      const cniContribution = (params.cniSharePct ?? 0) * Math.max(0, fin.cumulativeNetIncome);
      const equityContribution = params.includeEquityProceeds ? fin.equityProceedsSinceIssue : 0;
      const components: EvaluatedProvisionComponent[] = [
        { label: "Builder basket starter", sectionRef: params.starterSectionRef ?? p.sectionRef, value: base },
      ];
      if (params.cniSharePct) {
        components.push({
          label: `+ ${(params.cniSharePct * 100).toFixed(0)}% CNI since issue`,
          sectionRef: params.cniSectionRef ?? p.sectionRef,
          value: cniContribution,
        });
      }
      if (params.includeEquityProceeds) {
        components.push({
          label: "+ equity proceeds since issue",
          sectionRef: params.equitySectionRef ?? p.sectionRef,
          value: equityContribution,
        });
      }
      return {
        provision: p,
        status: "modeled",
        capacity: base + cniContribution + equityContribution,
        components,
      };
    }
    case "RATIO_GATE": {
      const measure = leverageMeasure(params.debtBasis, metrics);
      const open = measure <= p.thresholdValue;
      // Infinity is legitimate here: RATIO_GATE explicitly models "unlimited
      // capacity if this ratio condition holds" - the database is asserting
      // the uncapped result, not defaulting to it from absent config.
      return { provision: p, status: "modeled", capacity: open ? Infinity : 0, gate: { open, measure } };
    }
    default: {
      const exhaustive: never = p.formulaType;
      throw new Error(`Unknown formula type: ${String(exhaustive)}`);
    }
  }
}

function keyFor(documentId: string, code: string): string {
  return `${documentId}:${code}`;
}

// ---------------------------------------------------------------------------
// Capacity expression composition
// ---------------------------------------------------------------------------

interface ExprEvalResult {
  status: EvaluationStatus;
  /** Present iff status === "modeled". */
  value?: number;
  /** The provision code (or, for SUM, a "+"-joined list) that determined this result. Present iff status === "modeled". */
  bindingCode?: string;
  /** Present iff status !== "modeled". */
  reason?: string;
}

/** A named intermediate result inside a capacity expression tree, surfaced because its node declared a `label`. */
export interface LabeledSubtotal {
  label: string;
  status: EvaluationStatus;
  value?: number;
  bindingCode?: string;
  reason?: string;
}

function evalExpr(
  expr: CapacityExpr,
  capacities: Map<string, EvaluatedProvision>,
  labeled: LabeledSubtotal[]
): ExprEvalResult {
  let result: ExprEvalResult;

  switch (expr.op) {
    case "REF": {
      const evaluated = capacities.get(expr.code);
      if (!evaluated) {
        result = { status: "review_required", reason: `Capacity formula references unknown provision code "${expr.code}".` };
      } else if (evaluated.status !== "modeled") {
        result = { status: evaluated.status, reason: evaluated.reason };
      } else {
        result = { status: "modeled", value: evaluated.capacity, bindingCode: expr.code };
      }
      break;
    }
    case "SUM": {
      const parts = expr.items.map((item) => evalExpr(item, capacities, labeled));
      const status = worstStatus(parts.map((part) => part.status));
      result =
        status !== "modeled"
          ? { status, reason: combineReasons(parts) }
          : {
              status: "modeled",
              value: parts.reduce((sum, part) => sum + (part.value ?? 0), 0),
              bindingCode: parts.map((part) => part.bindingCode).join("+"),
            };
      break;
    }
    case "MIN": {
      const parts = expr.items.map((item) => evalExpr(item, capacities, labeled));
      const status = worstStatus(parts.map((part) => part.status));
      result =
        status !== "modeled"
          ? { status, reason: combineReasons(parts) }
          : parts.reduce((min, part) => ((part.value ?? Infinity) < (min.value ?? Infinity) ? part : min));
      break;
    }
    case "MAX": {
      const parts = expr.items.map((item) => evalExpr(item, capacities, labeled));
      const status = worstStatus(parts.map((part) => part.status));
      result =
        status !== "modeled"
          ? { status, reason: combineReasons(parts) }
          : parts.reduce((max, part) => ((part.value ?? -Infinity) > (max.value ?? -Infinity) ? part : max));
      break;
    }
    default: {
      const exhaustive: never = expr;
      throw new Error(`Unknown capacity expr op: ${String((exhaustive as CapacityExpr).op)}`);
    }
  }

  if (expr.label) {
    labeled.push({ label: expr.label, ...result });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Position: cross-document capacity (equivalent to the `m` hook's output)
// ---------------------------------------------------------------------------

export interface DocumentCapacityResult {
  documentId: string;
  documentName: string;

  securedStatus: EvaluationStatus;
  securedCapacity?: number;
  securedReason?: string;
  securedBindingCode?: string;
  securedBindingProvision?: CovenantProvisionInput;
  securedLabeledSubtotals: LabeledSubtotal[];

  unsecuredStatus: EvaluationStatus;
  unsecuredCapacity?: number;
  unsecuredReason?: string;
  unsecuredBindingCode?: string;
  unsecuredBindingProvision?: CovenantProvisionInput;
  unsecuredLabeledSubtotals: LabeledSubtotal[];
}

/** The tightest capacity across every governing document, or the reason it can't be determined. */
export interface CrossDocumentCapacity {
  status: EvaluationStatus;
  capacity?: number;
  bindingDocumentId?: string;
  bindingDocumentName?: string;
  bindingProvision?: CovenantProvisionInput;
  reason?: string;
}

function evaluateDocumentSide(
  expr: CapacityExpr | undefined,
  scoped: Map<string, EvaluatedProvision>,
  side: "secured" | "unsecured",
  documentName: string
): { status: EvaluationStatus; capacity?: number; reason?: string; bindingCode?: string; bindingProvision?: CovenantProvisionInput; labeled: LabeledSubtotal[] } {
  if (!expr) {
    return {
      status: "not_tested",
      reason: `No ${side}-debt capacity formula has been entered for ${documentName}.`,
      labeled: [],
    };
  }
  const labeled: LabeledSubtotal[] = [];
  const result = evalExpr(expr, scoped, labeled);
  if (result.status !== "modeled") {
    return { status: result.status, reason: result.reason, labeled };
  }
  return {
    status: "modeled",
    capacity: result.value,
    bindingCode: result.bindingCode,
    bindingProvision: result.bindingCode ? scoped.get(result.bindingCode)?.provision : undefined,
    labeled,
  };
}

export interface CovenantPosition {
  metrics: LeverageMetrics;
  /** Every evaluated provision, keyed by `${documentId}:${code}`. */
  provisionCapacities: Map<string, EvaluatedProvision>;
  documents: DocumentCapacityResult[];
  crossDocumentSecured: CrossDocumentCapacity;
  crossDocumentUnsecured: CrossDocumentCapacity;
}

function combineCrossDocument(documents: DocumentCapacityResult[], side: "secured" | "unsecured"): CrossDocumentCapacity {
  if (documents.length === 0) {
    return { status: "not_tested", reason: "No governing documents are modeled for this company." };
  }
  const statuses = documents.map((d) => (side === "secured" ? d.securedStatus : d.unsecuredStatus));
  const worst = worstStatus(statuses);
  if (worst !== "modeled") {
    const reasons = documents
      .filter((d) => (side === "secured" ? d.securedStatus : d.unsecuredStatus) !== "modeled")
      .map((d) => `${d.documentName}: ${side === "secured" ? d.securedReason : d.unsecuredReason}`);
    return { status: worst, reason: reasons.join(" ") };
  }
  const binding = documents.reduce((min, d) => {
    const v = side === "secured" ? d.securedCapacity! : d.unsecuredCapacity!;
    const minV = side === "secured" ? min.securedCapacity! : min.unsecuredCapacity!;
    return v < minV ? d : min;
  });
  return {
    status: "modeled",
    capacity: side === "secured" ? binding.securedCapacity : binding.unsecuredCapacity,
    bindingDocumentId: binding.documentId,
    bindingDocumentName: binding.documentName,
    bindingProvision: side === "secured" ? binding.securedBindingProvision : binding.unsecuredBindingProvision,
  };
}

export function computeCovenantPosition(data: CompanyCovenantData): CovenantPosition {
  const metrics = computeLeverageMetrics(data.financials);

  const provisionCapacities = new Map<string, EvaluatedProvision>();
  for (const provision of data.provisions) {
    provisionCapacities.set(
      keyFor(provision.documentId, provision.code),
      evaluateProvision(provision, data.financials, metrics)
    );
  }

  const documents: DocumentCapacityResult[] = data.documents.map((doc) => {
    // Scope the capacity map to this document's own codes so a CapacityExpr's
    // bare `code` references resolve unambiguously.
    const scoped = new Map<string, EvaluatedProvision>();
    for (const provision of data.provisions) {
      if (provision.documentId === doc.id) {
        scoped.set(provision.code, provisionCapacities.get(keyFor(doc.id, provision.code))!);
      }
    }

    const secured = evaluateDocumentSide(doc.capacityFormulas?.secured, scoped, "secured", doc.name);
    const unsecured = evaluateDocumentSide(doc.capacityFormulas?.unsecured, scoped, "unsecured", doc.name);

    return {
      documentId: doc.id,
      documentName: doc.name,
      securedStatus: secured.status,
      securedCapacity: secured.capacity,
      securedReason: secured.reason,
      securedBindingCode: secured.bindingCode,
      securedBindingProvision: secured.bindingProvision,
      securedLabeledSubtotals: secured.labeled,
      unsecuredStatus: unsecured.status,
      unsecuredCapacity: unsecured.capacity,
      unsecuredReason: unsecured.reason,
      unsecuredBindingCode: unsecured.bindingCode,
      unsecuredBindingProvision: unsecured.bindingProvision,
      unsecuredLabeledSubtotals: unsecured.labeled,
    };
  });

  return {
    metrics,
    provisionCapacities,
    documents,
    crossDocumentSecured: combineCrossDocument(documents, "secured"),
    crossDocumentUnsecured: combineCrossDocument(documents, "unsecured"),
  };
}

// ---------------------------------------------------------------------------
// Ratio tests: generic, applies to any LEVERAGE_RATIO_ROOM / COVERAGE_RATIO_ROOM
// provision company-wide - not a hardcoded list of provision codes. This is
// what a debt-incurrence simulation checks post-transaction ratios against.
// ---------------------------------------------------------------------------

export type RatioComparisonDirection = "at_or_below" | "at_or_above";

export interface RatioTestResult {
  provisionId: string;
  documentId: string;
  documentName: string;
  basketName: string;
  sectionRef: string;
  metricName: string;
  /** Whether this test is relevant to the transaction being tested (e.g. an SSNL test only applies to a secured incurrence). */
  applies: boolean;
  preTransactionRatio: number;
  postTransactionRatio?: number;
  threshold: number;
  comparisonDirection: RatioComparisonDirection;
  status: TransactionStatus; // "clear" | "blocked" | "review_required" (never "not_tested" - a ratio test only exists when a provision was found)
  reason?: string;
  provision: CovenantProvisionInput;
}

/**
 * Builds one ratio-test row per LEVERAGE_RATIO_ROOM/COVERAGE_RATIO_ROOM
 * provision across the whole company - generic over formulaType, never over
 * a specific provision code. This is the sole source of ratio-consistency
 * checking; there is no separate hardcoded recheck anywhere else.
 */
export function buildDebtRatioTests(
  data: CompanyCovenantData,
  position: CovenantPosition,
  amount: number,
  secured: boolean
): RatioTestResult[] {
  const fin = data.financials;
  const results: RatioTestResult[] = [];

  for (const provision of data.provisions) {
    if (provision.formulaType !== "LEVERAGE_RATIO_ROOM" && provision.formulaType !== "COVERAGE_RATIO_ROOM") continue;
    const doc = data.documents.find((d) => d.id === provision.documentId);
    if (!doc) continue;
    const params = provision.params ?? {};

    if (provision.formulaType === "LEVERAGE_RATIO_ROOM") {
      const basis = params.debtBasis;
      const applies = basis === "secured" ? secured : true;
      const preRatio = leverageMeasure(basis, position.metrics);
      const addSecured = secured ? amount : 0;
      const postBasisValue =
        basis === "secured" ? fin.securedDebt + addSecured - fin.cash : fin.totalDebt + amount - fin.cash;
      const postRatio = postBasisValue / fin.ebitda;
      const status: TransactionStatus = postRatio <= provision.thresholdValue ? "clear" : "blocked";
      results.push({
        provisionId: provision.id,
        documentId: doc.id,
        documentName: doc.name,
        basketName: provision.basketName,
        sectionRef: provision.sectionRef,
        metricName: leverageMetricName(basis),
        applies,
        preTransactionRatio: preRatio,
        postTransactionRatio: postRatio,
        threshold: provision.thresholdValue,
        comparisonDirection: "at_or_below",
        status,
        provision,
      });
    } else {
      // COVERAGE_RATIO_ROOM
      const rate = fin.assumedNewDebtRatePct / 100;
      const preRatio = fin.ebitda / fin.interestExpense;
      if (rate <= 0) {
        results.push({
          provisionId: provision.id,
          documentId: doc.id,
          documentName: doc.name,
          basketName: provision.basketName,
          sectionRef: provision.sectionRef,
          metricName: "Fixed Charge / Interest Coverage",
          applies: true,
          preTransactionRatio: preRatio,
          threshold: provision.thresholdValue,
          comparisonDirection: "at_or_above",
          status: "review_required",
          reason: `Assumed new-debt interest rate is zero or not set; cannot compute a pro forma coverage ratio for "${provision.basketName}".`,
          provision,
        });
        continue;
      }
      const postRatio = fin.ebitda / (fin.interestExpense + amount * rate);
      const status: TransactionStatus = postRatio >= provision.thresholdValue ? "clear" : "blocked";
      results.push({
        provisionId: provision.id,
        documentId: doc.id,
        documentName: doc.name,
        basketName: provision.basketName,
        sectionRef: provision.sectionRef,
        metricName: "Fixed Charge / Interest Coverage",
        applies: true,
        preTransactionRatio: preRatio,
        postTransactionRatio: postRatio,
        threshold: provision.thresholdValue,
        comparisonDirection: "at_or_above",
        status,
        provision,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Simulate: debt incurrence
// ---------------------------------------------------------------------------

export interface DebtIncurrenceProForma {
  totalNetLeverage: number;
  seniorSecuredNetLeverage: number;
  fixedChargeCoverage: number;
}

export interface PerDocumentDebtResult {
  documentId: string;
  documentName: string;
  status: TransactionStatus;
  capacity?: number;
  bindingProvision?: CovenantProvisionInput;
  reason?: string;
}

export interface DebtIncurrenceSimulation {
  amount: number;
  secured: boolean;
  perDocument: PerDocumentDebtResult[];
  /** The tightest document whose capacity was actually modeled (clear or blocked). Undefined if none were modeled. */
  binding?: PerDocumentDebtResult;
  next?: PerDocumentDebtResult;
  /**
   * Overall verdict combining every document's capacity test AND every
   * applicable ratio test. Can only be "clear" if all of both are clear.
   */
  status: TransactionStatus;
  /** The binding document's own declared capacity - a reference point, not the final verdict. Always defer to `status`. */
  overallCapacity?: number;
  proForma: DebtIncurrenceProForma;
  /** Every applicable LEVERAGE_RATIO_ROOM/COVERAGE_RATIO_ROOM test post-transaction - see buildDebtRatioTests. */
  ratioTests: RatioTestResult[];
  reason?: string;
}

export function simulateDebtIncurrence(
  data: CompanyCovenantData,
  position: CovenantPosition,
  amount: number,
  secured: boolean
): DebtIncurrenceSimulation {
  const fin = data.financials;

  const perDocument: PerDocumentDebtResult[] = position.documents.map((d) => {
    const status = secured ? d.securedStatus : d.unsecuredStatus;
    const capacity = secured ? d.securedCapacity : d.unsecuredCapacity;
    const bindingProvision = secured ? d.securedBindingProvision : d.unsecuredBindingProvision;
    const reason = secured ? d.securedReason : d.unsecuredReason;
    if (status !== "modeled") {
      return { documentId: d.documentId, documentName: d.documentName, status, reason, bindingProvision };
    }
    return {
      documentId: d.documentId,
      documentName: d.documentName,
      status: amount <= capacity! ? "clear" : "blocked",
      capacity,
      bindingProvision,
    };
  });

  const modeled = perDocument.filter((d) => d.status === "clear" || d.status === "blocked");
  const sorted = [...modeled].sort((a, b) => (a.capacity ?? Infinity) - (b.capacity ?? Infinity));
  const binding = sorted[0];
  const next = sorted[1];

  const ratioTests = buildDebtRatioTests(data, position, amount, secured);

  const rate = fin.assumedNewDebtRatePct / 100;
  const addSecured = secured ? amount : 0;
  const proForma: DebtIncurrenceProForma = {
    totalNetLeverage: (fin.totalDebt + amount - fin.cash) / fin.ebitda,
    seniorSecuredNetLeverage: (fin.securedDebt + addSecured - fin.cash) / fin.ebitda,
    fixedChargeCoverage: fin.ebitda / (fin.interestExpense + amount * rate),
  };

  const applicableRatioStatuses = ratioTests.filter((r) => r.applies).map((r) => r.status);
  const allStatuses: TransactionStatus[] = [...perDocument.map((d) => d.status), ...applicableRatioStatuses];
  const status: TransactionStatus = allStatuses.includes("blocked")
    ? "blocked"
    : allStatuses.includes("review_required")
      ? "review_required"
      : allStatuses.includes("not_tested")
        ? "not_tested"
        : "clear";

  const reason =
    status === "clear" || status === "blocked"
      ? undefined
      : [
          ...perDocument
            .filter((d) => d.status === "not_tested" || d.status === "review_required")
            .map((d) => `${d.documentName}: ${d.reason}`),
          ...ratioTests
            .filter((r) => r.applies && (r.status === "not_tested" || r.status === "review_required"))
            .map((r) => `${r.basketName}: ${r.reason}`),
        ].join(" ");

  return { amount, secured, perDocument, binding, next, status, overallCapacity: binding?.capacity, proForma, ratioTests, reason };
}

// ---------------------------------------------------------------------------
// Simulate: restricted payments (dividends/buybacks & investments), sharing
// one basket waterfall and Available Amount pool per the governing document.
// ---------------------------------------------------------------------------

export interface RpWaterfallStepResult {
  code: string;
  basketName: string;
  sectionRef: string;
  allocated: number;
}

export interface RestrictedPaymentSimulation {
  documentId: string;
  documentName?: string;
  amount: number;
  kind: RestrictedPaymentKind;
  status: TransactionStatus;
  steps: RpWaterfallStepResult[];
  remaining: number;
  /** Total already committed against the shared pool via ledger entries (dividends + investments). */
  poolUsed: number;
  /** Capacity remaining in each waterfall step's basket, after ledger usage but before this simulated amount. */
  stepCapacitiesRemaining: Record<string, number>;
  proFormaTotalNetLeverage?: number;
  reason?: string;
}

function restrictedPaymentPoolUsed(ledger: LedgerEntryInput[]): number {
  return ledger
    .filter((e) => (e.basket === "DIVIDEND" || e.basket === "INVESTMENT") && e.direction === "DEBIT")
    .reduce((sum, e) => sum + e.amount, 0);
}

/** Every document with a restricted-payment waterfall configured - the generic replacement for hardcoding one document id. */
export function documentsWithRpWaterfall(data: CompanyCovenantData): DocumentInput[] {
  return data.documents.filter((d) => d.rpWaterfall);
}

/** Every document with an asset-sale configuration - the generic replacement for hardcoding one document id. */
export function documentsWithAssetSale(data: CompanyCovenantData): DocumentInput[] {
  return data.documents.filter((d) => d.assetSale);
}

export function simulateRestrictedPayment(
  data: CompanyCovenantData,
  position: CovenantPosition,
  documentId: string,
  amount: number,
  kind: RestrictedPaymentKind
): RestrictedPaymentSimulation {
  const doc = data.documents.find((d) => d.id === documentId);
  if (!doc?.rpWaterfall) {
    return {
      documentId,
      documentName: doc?.name,
      amount,
      kind,
      status: "not_tested",
      steps: [],
      remaining: amount,
      poolUsed: restrictedPaymentPoolUsed(data.ledger),
      stepCapacitiesRemaining: {},
      reason: doc
        ? `${doc.name} has no restricted payment basket configuration entered.`
        : `No document with id "${documentId}" was found for this company.`,
    };
  }

  // Basket steps are drawn down by whatever's already been committed via the
  // ledger before this simulated amount is tested against what's left - a
  // dividend committed this quarter genuinely shrinks what an Investment sees
  // next quarter, and vice versa, because they share the same pool.
  let poolRemaining = restrictedPaymentPoolUsed(data.ledger);
  const stepCapacitiesRemaining: Record<string, number> = {};
  let anyStepNotModeled = false;
  const stepReasons: string[] = [];
  const stepDefs = doc.rpWaterfall.steps.map((step) => {
    const evaluated = position.provisionCapacities.get(keyFor(documentId, step.code));
    if (!evaluated || evaluated.status !== "modeled") {
      anyStepNotModeled = true;
      const reason = evaluated?.reason ?? `Unknown restricted-payment basket code "${step.code}".`;
      stepReasons.push(reason);
      stepCapacitiesRemaining[step.code] = 0;
      return { code: step.code, capacityLeft: 0, provision: evaluated?.provision };
    }
    const used = Math.min(poolRemaining, evaluated.capacity!);
    poolRemaining -= used;
    const left = Math.max(0, evaluated.capacity! - used);
    stepCapacitiesRemaining[step.code] = left;
    return { code: step.code, capacityLeft: left, provision: evaluated.provision };
  });

  const gateCode = doc.rpWaterfall.ratioGateCodeByKind[kind];
  const gateEvaluated = gateCode ? position.provisionCapacities.get(keyFor(documentId, gateCode)) : undefined;
  const gateNotModeled = Boolean(gateCode) && (!gateEvaluated || gateEvaluated.status !== "modeled");
  if (gateNotModeled) {
    stepReasons.push(
      gateEvaluated?.reason ?? `The unlimited ratio-gate basket for "${kind}" (code "${gateCode}") is not configured.`
    );
  }

  let remaining = amount;
  const steps: RpWaterfallStepResult[] = [];
  for (const step of stepDefs) {
    if (remaining <= 0 || step.capacityLeft <= 0 || !step.provision) continue;
    const alloc = Math.min(remaining, step.capacityLeft);
    steps.push({ code: step.code, basketName: step.provision.basketName, sectionRef: step.provision.sectionRef, allocated: alloc });
    remaining -= alloc;
  }
  if (!gateNotModeled && gateEvaluated?.gate?.open && remaining > 0) {
    steps.push({
      code: gateCode!,
      basketName: gateEvaluated.provision.basketName,
      sectionRef: gateEvaluated.provision.sectionRef,
      allocated: remaining,
    });
    remaining = 0;
  }

  const poolUsed = restrictedPaymentPoolUsed(data.ledger);
  const proFormaTotalNetLeverage = (data.financials.totalDebt - (data.financials.cash - amount)) / data.financials.ebitda;

  const status: TransactionStatus =
    anyStepNotModeled || gateNotModeled ? "review_required" : remaining <= 0.0001 ? "clear" : "blocked";

  return {
    documentId,
    documentName: doc.name,
    amount,
    kind,
    status,
    steps,
    remaining,
    poolUsed,
    stepCapacitiesRemaining,
    proFormaTotalNetLeverage,
    reason: anyStepNotModeled || gateNotModeled ? stepReasons.join(" ") : undefined,
  };
}

// ---------------------------------------------------------------------------
// Simulate: asset sales (reinvestment window vs. mandatory offer trigger)
// ---------------------------------------------------------------------------

export interface AssetSaleSimulation {
  documentId: string;
  documentName?: string;
  netProceeds: number;
  reinvest: boolean;
  /** "blocked" is never used here - an asset sale itself isn't prevented; see offerTriggered for the substantive conclusion. */
  status: "clear" | "not_tested" | "review_required";
  excessProceedsThreshold?: number;
  excessProceeds?: number;
  offerTriggered?: boolean;
  proFormaTotalNetLeverage?: number;
  reason?: string;
}

export function simulateAssetSale(
  data: CompanyCovenantData,
  position: CovenantPosition,
  documentId: string,
  netProceeds: number,
  reinvest: boolean
): AssetSaleSimulation {
  const doc = data.documents.find((d) => d.id === documentId);
  if (!doc?.assetSale) {
    return {
      documentId,
      documentName: doc?.name,
      netProceeds,
      reinvest,
      status: "not_tested",
      reason: doc
        ? `${doc.name} has no asset-sale threshold configuration entered.`
        : `No document with id "${documentId}" was found for this company.`,
    };
  }

  const evaluated = position.provisionCapacities.get(keyFor(documentId, doc.assetSale.thresholdCode));
  if (!evaluated || evaluated.status !== "modeled") {
    return {
      documentId,
      documentName: doc.name,
      netProceeds,
      reinvest,
      status: "review_required",
      reason: evaluated?.reason ?? `Unknown asset-sale threshold provision code "${doc.assetSale.thresholdCode}".`,
    };
  }

  const excessProceedsThreshold = evaluated.capacity!;
  const excessProceeds = reinvest ? 0 : Math.max(0, netProceeds - excessProceedsThreshold);
  const offerTriggered = excessProceeds > 0.0001;
  const proFormaTotalNetLeverage = (data.financials.totalDebt - (data.financials.cash + netProceeds)) / data.financials.ebitda;

  return {
    documentId,
    documentName: doc.name,
    netProceeds,
    reinvest,
    status: "clear",
    excessProceedsThreshold,
    excessProceeds,
    offerTriggered,
    proFormaTotalNetLeverage,
  };
}

// ---------------------------------------------------------------------------
// Prisma adapter
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a PrismaClient this adapter needs - typed structurally so
 * this module doesn't have to import @prisma/client's generated types (which
 * don't exist until `prisma generate` has run against a real database).
 */
export interface CovenantEnginePrismaClient {
  // Method-shorthand signatures (not arrow-typed properties) so TS's bivariant
  // parameter checking lets a real PrismaClient's more specific `*FindManyArgs`
  // types satisfy this adapter's looser `any`.
  document: { findMany(args: any): Promise<DbDocumentRow[]> };
  covenantProvision: { findMany(args: any): Promise<DbProvisionRow[]> };
  financialSnapshot: { findFirst(args: any): Promise<DbSnapshotRow | null> };
  ledgerEntry: { findMany(args: any): Promise<DbLedgerRow[]> };
}

interface DecimalLike {
  toNumber(): number;
}
type DecimalField = number | DecimalLike;

function toNumber(value: DecimalField): number {
  return typeof value === "number" ? value : value.toNumber();
}

// Prisma's generated JSON field type (Prisma.JsonValue) is a broad
// string|number|boolean|object|array union - narrower than what these
// columns actually hold, so the adapter casts through `unknown` at the
// mapping boundary below rather than fighting that union here.
interface DbDocumentRow {
  id: string;
  name: string;
  type: DocumentType;
  governs: string | null;
  capacityFormulas: unknown;
  rpWaterfall: unknown;
  assetSale: unknown;
}

interface DbProvisionRow {
  id: string;
  documentId: string;
  code: string;
  basketName: string;
  sectionRef: string;
  formulaType: FormulaType;
  thresholdValue: DecimalField;
  params: unknown;
  notes: string | null;
}

interface DbSnapshotRow {
  ebitda: DecimalField;
  cash: DecimalField;
  interestExpense: DecimalField;
  cumulativeNetIncome: DecimalField;
  equityProceedsSinceIssue: DecimalField;
  assumedNewDebtRatePct: DecimalField;
  totalDebt: DecimalField;
  securedDebt: DecimalField;
}

interface DbLedgerRow {
  basket: LedgerBasket;
  amount: DecimalField;
  direction: LedgerDirection;
}

/** A date-range filter matching Prisma's `where` shape for effectiveFrom/effectiveTo columns: both null = always effective. */
function effectiveDateFilter(asOfDate: Date) {
  return {
    AND: [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOfDate } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOfDate } }] },
    ],
  };
}

/**
 * Loads a company's documents, provisions, latest financial snapshot, and
 * ledger from the database, scoped to whichever contractual rules were
 * effective on `asOfDate` (default: now). This is the ONLY place amendment
 * precedence is resolved - by a plain date-range filter on effectiveFrom/
 * effectiveTo, never by document name/type special-casing. A document or
 * provision row with both fields null is always effective.
 */
export async function loadCompanyCovenantData(
  prisma: CovenantEnginePrismaClient,
  companyId: string,
  asOfDate: Date = new Date()
): Promise<CompanyCovenantData> {
  const dateFilter = effectiveDateFilter(asOfDate);
  const [documents, provisions, snapshot, ledger] = await Promise.all([
    prisma.document.findMany({ where: { companyId, ...dateFilter } }),
    prisma.covenantProvision.findMany({ where: { companyId, ...dateFilter } }),
    prisma.financialSnapshot.findFirst({ where: { companyId, asOfDate: { lte: asOfDate } }, orderBy: { asOfDate: "desc" } }),
    prisma.ledgerEntry.findMany({ where: { companyId, date: { lte: asOfDate } } }),
  ]);

  if (!snapshot) {
    throw new Error(`No financial snapshot found for company ${companyId} as of ${asOfDate.toISOString()}`);
  }

  return {
    companyId,
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      governs: d.governs,
      capacityFormulas: d.capacityFormulas as CapacityFormulas | null,
      rpWaterfall: d.rpWaterfall as RpWaterfallConfig | null,
      assetSale: d.assetSale as AssetSaleConfig | null,
    })),
    provisions: provisions.map((p) => ({
      id: p.id,
      documentId: p.documentId,
      code: p.code,
      basketName: p.basketName,
      sectionRef: p.sectionRef,
      formulaType: p.formulaType,
      thresholdValue: toNumber(p.thresholdValue),
      params: p.params as FormulaParams | null,
      notes: p.notes,
    })),
    financials: {
      ebitda: toNumber(snapshot.ebitda),
      cash: toNumber(snapshot.cash),
      interestExpense: toNumber(snapshot.interestExpense),
      cumulativeNetIncome: toNumber(snapshot.cumulativeNetIncome),
      equityProceedsSinceIssue: toNumber(snapshot.equityProceedsSinceIssue),
      assumedNewDebtRatePct: toNumber(snapshot.assumedNewDebtRatePct),
      totalDebt: toNumber(snapshot.totalDebt),
      securedDebt: toNumber(snapshot.securedDebt),
    },
    ledger: ledger.map((e) => ({ basket: e.basket, amount: toNumber(e.amount), direction: e.direction })),
  };
}
