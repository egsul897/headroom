/**
 * Covenant capacity engine.
 *
 * This is a generalized port of the `m` and `sim` useMemo hooks from the
 * headroom-coherent.jsx prototype. In the prototype, every basket size,
 * ratio, and percentage was a JS constant baked into the formula (e.g.
 * `Math.max(0, 3.0 * E - netSecured)`). Here, the *numbers* (thresholds,
 * percentages, which leverage measure a basket keys off) come from
 * CovenantProvision rows in the database; this module only knows the small
 * set of formula archetypes those rows can express (see FormulaType) and how
 * to combine them into per-document capacity, RP waterfalls, and asset-sale
 * tests.
 *
 * The module is split in two layers:
 *  - A pure calculation core (no DB, no I/O) that takes plain data objects
 *    shaped like the DB rows. This is what's unit tested.
 *  - A thin Prisma adapter (`loadCompanyCovenantData`) that fetches rows and
 *    maps them (Decimal -> number, etc) into the pure core's input types.
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

/** An expression tree combining evaluated provision capacities into one document-level capacity figure. */
export type CapacityExpr =
  | { op: "REF"; code: string }
  | { op: "SUM"; items: CapacityExpr[] }
  | { op: "MIN"; items: CapacityExpr[] }
  | { op: "MAX"; items: CapacityExpr[] };

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

// ---------------------------------------------------------------------------
// Leaf provision evaluation
// ---------------------------------------------------------------------------

export interface EvaluatedProvision {
  provision: CovenantProvisionInput;
  /** The basket's capacity in $M, or Infinity if uncapped. */
  capacity: number;
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
 * every hardcoded formula in the prototype's `m` hook (fccrCap, milaSec,
 * milaUnsec, facA, facB, genDebt, lienRatio, lienGen, builder, genRP,
 * ratioRPOpen, ratioInvOpen, excessProceedsThreshold, caTNLroom, caICroom).
 */
export function evaluateProvision(
  p: CovenantProvisionInput,
  fin: FinancialSnapshotInput,
  metrics: LeverageMetrics
): EvaluatedProvision {
  const params = p.params ?? {};

  switch (p.formulaType) {
    case "FLAT_AMOUNT": {
      return { provision: p, capacity: Math.max(0, p.thresholdValue) };
    }
    case "FLAT_NET_OF_DEBT": {
      const outstanding = grossDebtOutstanding(params.netOfBasis, fin);
      return { provision: p, capacity: Math.max(0, p.thresholdValue - outstanding) };
    }
    case "GREATER_OF_FLAT_OR_PCT_EBITDA": {
      const pct = params.pctEbitda ?? 0;
      return { provision: p, capacity: Math.max(p.thresholdValue, pct * fin.ebitda) };
    }
    case "LEVERAGE_RATIO_ROOM": {
      const basis = leverageBasisValue(params.debtBasis, metrics);
      return { provision: p, capacity: Math.max(0, p.thresholdValue * fin.ebitda - basis) };
    }
    case "COVERAGE_RATIO_ROOM": {
      const rate = fin.assumedNewDebtRatePct / 100;
      const capacity =
        rate > 0 ? Math.max(0, (fin.ebitda / p.thresholdValue - fin.interestExpense) / rate) : Infinity;
      return { provision: p, capacity };
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
      return { provision: p, capacity: base + cniContribution + equityContribution, components };
    }
    case "RATIO_GATE": {
      const measure = leverageMeasure(params.debtBasis, metrics);
      const open = measure <= p.thresholdValue;
      return { provision: p, capacity: open ? Infinity : 0, gate: { open, measure } };
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

interface ExprResult {
  value: number;
  /** The provision code that determined this result (the binding constraint for MIN/MAX). */
  bindingCode: string;
}

function evalExpr(expr: CapacityExpr, capacities: Map<string, EvaluatedProvision>): ExprResult {
  switch (expr.op) {
    case "REF": {
      const evaluated = capacities.get(expr.code);
      if (!evaluated) throw new Error(`Unknown provision code in capacity formula: ${expr.code}`);
      return { value: evaluated.capacity, bindingCode: expr.code };
    }
    case "SUM": {
      const parts = expr.items.map((item) => evalExpr(item, capacities));
      return {
        value: parts.reduce((sum, part) => sum + part.value, 0),
        bindingCode: parts.map((part) => part.bindingCode).join("+"),
      };
    }
    case "MIN": {
      const parts = expr.items.map((item) => evalExpr(item, capacities));
      return parts.reduce((min, part) => (part.value < min.value ? part : min));
    }
    case "MAX": {
      const parts = expr.items.map((item) => evalExpr(item, capacities));
      return parts.reduce((max, part) => (part.value > max.value ? part : max));
    }
    default: {
      const exhaustive: never = expr;
      throw new Error(`Unknown capacity expr op: ${String((exhaustive as CapacityExpr).op)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Position: cross-document capacity (equivalent to the `m` hook's output)
// ---------------------------------------------------------------------------

export interface DocumentCapacityResult {
  documentId: string;
  documentName: string;
  securedCapacity: number;
  securedBindingCode?: string;
  securedBindingProvision?: CovenantProvisionInput;
  unsecuredCapacity: number;
  unsecuredBindingCode?: string;
  unsecuredBindingProvision?: CovenantProvisionInput;
}

export interface CovenantPosition {
  metrics: LeverageMetrics;
  /** Every evaluated provision, keyed by `${documentId}:${code}`. */
  provisionCapacities: Map<string, EvaluatedProvision>;
  documents: DocumentCapacityResult[];
  /** The tightest secured capacity across all documents - the actual ceiling on a secured incurrence. */
  crossDocumentSecuredCapacity: number;
  /** The tightest unsecured capacity across all documents. */
  crossDocumentUnsecuredCapacity: number;
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

    let securedCapacity = Infinity;
    let securedBindingCode: string | undefined;
    let unsecuredCapacity = Infinity;
    let unsecuredBindingCode: string | undefined;

    if (doc.capacityFormulas?.secured) {
      const result = evalExpr(doc.capacityFormulas.secured, scoped);
      securedCapacity = result.value;
      securedBindingCode = result.bindingCode;
    }
    if (doc.capacityFormulas?.unsecured) {
      const result = evalExpr(doc.capacityFormulas.unsecured, scoped);
      unsecuredCapacity = result.value;
      unsecuredBindingCode = result.bindingCode;
    }

    return {
      documentId: doc.id,
      documentName: doc.name,
      securedCapacity,
      securedBindingCode,
      securedBindingProvision: securedBindingCode ? scoped.get(securedBindingCode)?.provision : undefined,
      unsecuredCapacity,
      unsecuredBindingCode,
      unsecuredBindingProvision: unsecuredBindingCode ? scoped.get(unsecuredBindingCode)?.provision : undefined,
    };
  });

  const crossDocumentSecuredCapacity = Math.min(...documents.map((d) => d.securedCapacity));
  const crossDocumentUnsecuredCapacity = Math.min(...documents.map((d) => d.unsecuredCapacity));

  return { metrics, provisionCapacities, documents, crossDocumentSecuredCapacity, crossDocumentUnsecuredCapacity };
}

// ---------------------------------------------------------------------------
// Simulate: debt incurrence (equivalent to the `sim` hook's debt-action branch)
// ---------------------------------------------------------------------------

export interface DebtIncurrenceProForma {
  totalNetLeverage: number;
  seniorSecuredNetLeverage: number;
  fixedChargeCoverage: number;
}

export interface PerDocumentDebtResult {
  documentId: string;
  documentName: string;
  capacity: number;
  bindingCode?: string;
  bindingProvision?: CovenantProvisionInput;
  cleared: boolean;
}

export interface DebtIncurrenceSimulation {
  amount: number;
  secured: boolean;
  perDocument: PerDocumentDebtResult[];
  binding: PerDocumentDebtResult;
  next?: PerDocumentDebtResult;
  cleared: boolean;
  overallCapacity: number;
  proForma: DebtIncurrenceProForma;
}

export function simulateDebtIncurrence(
  position: CovenantPosition,
  fin: FinancialSnapshotInput,
  amount: number,
  secured: boolean
): DebtIncurrenceSimulation {
  const perDocument: PerDocumentDebtResult[] = position.documents.map((d) => {
    const capacity = secured ? d.securedCapacity : d.unsecuredCapacity;
    const bindingProvision = secured ? d.securedBindingProvision : d.unsecuredBindingProvision;
    return {
      documentId: d.documentId,
      documentName: d.documentName,
      capacity,
      bindingCode: secured ? d.securedBindingCode : d.unsecuredBindingCode,
      bindingProvision,
      cleared: amount <= capacity,
    };
  });

  const sorted = [...perDocument].sort((a, b) => a.capacity - b.capacity);
  const binding = sorted[0];
  if (!binding) throw new Error("Cannot simulate debt incurrence with no documents");
  const next = sorted[1];
  const cleared = amount <= binding.capacity;

  const rate = fin.assumedNewDebtRatePct / 100;
  const addSecured = secured ? amount : 0;
  const proForma: DebtIncurrenceProForma = {
    totalNetLeverage: (fin.totalDebt + amount - fin.cash) / fin.ebitda,
    seniorSecuredNetLeverage: (fin.securedDebt + addSecured - fin.cash) / fin.ebitda,
    fixedChargeCoverage: fin.ebitda / (fin.interestExpense + amount * rate),
  };

  return { amount, secured, perDocument, binding, next, cleared, overallCapacity: binding.capacity, proForma };
}

// ---------------------------------------------------------------------------
// Simulate: restricted payments (dividends/buybacks & investments), sharing
// one basket waterfall and Available Amount pool per §3.4 in the prototype.
// ---------------------------------------------------------------------------

export interface RpWaterfallStepResult {
  code: string;
  basketName: string;
  sectionRef: string;
  allocated: number;
}

export interface RestrictedPaymentSimulation {
  amount: number;
  kind: RestrictedPaymentKind;
  steps: RpWaterfallStepResult[];
  remaining: number;
  cleared: boolean;
  /** Total already committed against the shared pool via ledger entries (dividends + investments). */
  poolUsed: number;
  /** Capacity remaining in each waterfall step's basket, after ledger usage but before this simulated amount. */
  stepCapacitiesRemaining: Record<string, number>;
  proFormaTotalNetLeverage: number;
}

function restrictedPaymentPoolUsed(ledger: LedgerEntryInput[]): number {
  return ledger
    .filter((e) => (e.basket === "DIVIDEND" || e.basket === "INVESTMENT") && e.direction === "DEBIT")
    .reduce((sum, e) => sum + e.amount, 0);
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
    throw new Error(`Document ${documentId} has no restricted payment waterfall configured`);
  }

  // Basket steps are drawn down by whatever's already been committed via the
  // ledger before this simulated amount is tested against what's left - a
  // dividend committed this quarter genuinely shrinks what an Investment sees
  // next quarter, and vice versa, because they share the same pool.
  let poolRemaining = restrictedPaymentPoolUsed(data.ledger);
  const stepCapacitiesRemaining: Record<string, number> = {};
  const stepDefs = doc.rpWaterfall.steps.map((step) => {
    const evaluated = position.provisionCapacities.get(keyFor(documentId, step.code));
    if (!evaluated) throw new Error(`Unknown RP waterfall provision code: ${step.code}`);
    const used = Math.min(poolRemaining, evaluated.capacity);
    poolRemaining -= used;
    const left = Math.max(0, evaluated.capacity - used);
    stepCapacitiesRemaining[step.code] = left;
    return { code: step.code, capacityLeft: left, provision: evaluated.provision };
  });

  const gateCode = doc.rpWaterfall.ratioGateCodeByKind[kind];
  const gateEvaluated = gateCode ? position.provisionCapacities.get(keyFor(documentId, gateCode)) : undefined;

  let remaining = amount;
  const steps: RpWaterfallStepResult[] = [];
  for (const step of stepDefs) {
    if (remaining <= 0 || step.capacityLeft <= 0) continue;
    const alloc = Math.min(remaining, step.capacityLeft);
    steps.push({ code: step.code, basketName: step.provision.basketName, sectionRef: step.provision.sectionRef, allocated: alloc });
    remaining -= alloc;
  }
  if (gateEvaluated?.gate?.open && remaining > 0) {
    steps.push({
      code: gateCode!,
      basketName: gateEvaluated.provision.basketName,
      sectionRef: gateEvaluated.provision.sectionRef,
      allocated: remaining,
    });
    remaining = 0;
  }

  const proFormaTotalNetLeverage =
    (data.financials.totalDebt - (data.financials.cash - amount)) / data.financials.ebitda;

  return {
    amount,
    kind,
    steps,
    remaining,
    cleared: remaining <= 0.0001,
    poolUsed: restrictedPaymentPoolUsed(data.ledger),
    stepCapacitiesRemaining,
    proFormaTotalNetLeverage,
  };
}

// ---------------------------------------------------------------------------
// Simulate: asset sales (reinvestment window vs. mandatory offer trigger)
// ---------------------------------------------------------------------------

export interface AssetSaleSimulation {
  netProceeds: number;
  reinvest: boolean;
  excessProceedsThreshold: number;
  excessProceeds: number;
  offerTriggered: boolean;
  proFormaTotalNetLeverage: number;
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
    throw new Error(`Document ${documentId} has no asset sale configuration`);
  }
  const evaluated = position.provisionCapacities.get(keyFor(documentId, doc.assetSale.thresholdCode));
  if (!evaluated) throw new Error(`Unknown asset sale threshold provision code: ${doc.assetSale.thresholdCode}`);

  const excessProceedsThreshold = evaluated.capacity;
  const excessProceeds = reinvest ? 0 : Math.max(0, netProceeds - excessProceedsThreshold);
  const offerTriggered = excessProceeds > 0.0001;
  const proFormaTotalNetLeverage =
    (data.financials.totalDebt - (data.financials.cash + netProceeds)) / data.financials.ebitda;

  return { netProceeds, reinvest, excessProceedsThreshold, excessProceeds, offerTriggered, proFormaTotalNetLeverage };
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

/** Loads a company's documents, provisions, latest financial snapshot, and ledger from the database. */
export async function loadCompanyCovenantData(
  prisma: CovenantEnginePrismaClient,
  companyId: string
): Promise<CompanyCovenantData> {
  const [documents, provisions, snapshot, ledger] = await Promise.all([
    prisma.document.findMany({ where: { companyId } }),
    prisma.covenantProvision.findMany({ where: { companyId } }),
    prisma.financialSnapshot.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } }),
    prisma.ledgerEntry.findMany({ where: { companyId } }),
  ]);

  if (!snapshot) {
    throw new Error(`No financial snapshot found for company ${companyId}`);
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
