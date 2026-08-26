/**
 * Pure, isomorphic covenant-overview row builder - split out of
 * lib/covenant-overview-service.ts (docs/full-covenant-overview-restoration.md)
 * specifically so a client component can call the SAME row-building logic
 * against already-loaded data with LOCALLY OVERRIDDEN financials, with zero
 * server round-trip, mirroring the exact established pattern
 * app/[companyId]/simulate/SimulateClient.tsx already uses
 * (`computeCovenantPosition` called client-side against already-loaded
 * `CompanyCovenantData`). This file imports NO `@prisma/client` and performs
 * NO I/O - every function here is a pure function of its arguments, so
 * "recompute on every keystroke" is a real re-run of the real engine, never
 * client-side arithmetic reimplementing it (task hard requirement §34 - "No
 * calculation in React").
 *
 * lib/covenant-overview-service.ts is now a thin server wrapper: it loads
 * data via Prisma, then calls `buildCovenantOverview` below - unchanged
 * logic, just relocated so it can be shared.
 */
import {
  buildDebtRatioTests,
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  evaluateProvision,
  resolveDocumentSideCoverage,
  type CapacityExpr,
  type CompanyCovenantData,
  type CovenantPosition,
  type CovenantProvisionInput,
  type EvaluationStatus,
  type FormulaParams,
  type PostTransactionCapacitySimulation,
  type RatioTestResult,
  type SolverNativeCompanyContext,
} from "./covenant-engine";
import { describeFormula } from "./describe-formula";
import type { FinancialPosition } from "./financial-core/types";
import type { MaxCapacityResult, SourceCitation } from "./solver/types";

// ---------------------------------------------------------------------------
// Row-level types
// ---------------------------------------------------------------------------

export type RowStatus = "MODELED" | "REVIEW_REQUIRED" | "NOT_TESTED" | "UNMODELED";
export type BindingState = "BINDING" | "AVAILABLE" | "REVIEW_REQUIRED" | "NOT_EVALUABLE" | "UNMODELED";
export type ReviewStateLabel = "VERIFIED" | "UNVERIFIED" | "DISPUTED" | "NOT_TRACKED";

/**
 * Basket priority hierarchy (task "UNIVERSAL HEADROOM PRODUCT EXPERIENCE"
 * §17-20 - "visually prioritize rows into generalized tiers... nothing
 * disappears"). Derived purely from each row's own already-computed
 * capacity/status - never from provision codes or basket-name pattern
 * matching (§18 - "Do not hardcode by provision code"), so it generalizes
 * to any company's data. See `assignTiers` below for the exact rule.
 */
export type RowTier = "PRIMARY" | "CONDITIONAL" | "EXCEPTION";

export interface CapacityRow {
  kind: "CAPACITY";
  stableKey: string;
  name: string;
  documentName: string;
  sectionRef: string;
  formulaDisplay: string | null;
  currentCapacity: number | null;
  capacityUnlimited: boolean;
  usageState: "TRACKED" | "NOT_TRACKED";
  used: number | null;
  remaining: number | null;
  utilizationPct: number | null;
  bindingState: BindingState;
  status: RowStatus;
  reviewState: ReviewStateLabel;
  entityScope: string[];
  tier: RowTier;
  reason?: string;
}

export interface RatioRow {
  kind: "RATIO";
  stableKey: string;
  name: string;
  documentName: string;
  sectionRef: string;
  currentRatio: number | null;
  ratioLimit: number;
  ratioHeadroom: number | null;
  comparisonDirection: "at_or_below" | "at_or_above";
  bindingState: BindingState;
  status: RowStatus;
  reviewState: ReviewStateLabel;
  tier: RowTier;
  reason?: string;
}

export type OverviewRow = CapacityRow | RatioRow;

export interface FamilyCounts {
  modeled: number;
  reviewRequired: number;
  unmodeled: number;
}

export type FamilyCoverageState = "MODELED_AND_EVALUABLE" | "MODELED_REVIEW_REQUIRED" | "PRESENT_BUT_UNMODELED" | "NOT_TESTED";

export interface CovenantFamilySection {
  family: string;
  coverageState: FamilyCoverageState;
  counts: FamilyCounts;
  rows: OverviewRow[];
  advisoryNotes: string[];
}

export interface HeadlineMetric {
  key: string;
  label: string;
  value: string | null;
  state: "AVAILABLE" | "NOT_AVAILABLE" | "REVIEW_REQUIRED";
}

export interface HeadlineCapacitySide {
  maximumCapacity: MaxCapacityResult | undefined;
  remainingCapacity: number | undefined;
  bindingDocumentName: string | undefined;
  bindingSections: string[];
  status: "MODELED" | "REVIEW_REQUIRED" | "NOT_MODELED";
}

/** A compact, real, non-fabricated "needs attention" item (task §13/§96). See `buildAttentionItems` for the exact, generalized derivation rules. */
export interface AttentionItem {
  severity: "HIGH" | "MEDIUM";
  category: string;
  description: string;
}

export interface CovenantOverviewCore {
  asOfDate: Date;
  headlineMetrics: HeadlineMetric[];
  securedCapacity: HeadlineCapacitySide;
  unsecuredCapacity: HeadlineCapacitySide;
  warnings: { category: string; description: string }[];
  attentionItems: AttentionItem[];
  covenantFamilies: CovenantFamilySection[];
}

// ---------------------------------------------------------------------------
// Plain (already-normalized, no Prisma Decimal/enum types) input shapes
// ---------------------------------------------------------------------------

export interface PermissionRowInput {
  id: string;
  documentId: string;
  code: string | null;
  grantType: "DEBT_INCURRENCE" | "LIEN";
  action: string;
  entityScope: string[];
  formulaType: CovenantProvisionInput["formulaType"];
  thresholdValue: number;
  params: FormulaParams | null;
  sectionRef: string;
  modelingStatus: "MODELED" | "KNOWN_NOT_MODELED";
  reviewStatus: "VERIFIED" | "UNVERIFIED" | "DISPUTED";
  notes: string | null;
}

export interface CoverageDeclarationInput {
  grantType: "DEBT_INCURRENCE" | "LIEN";
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Helpers - pure, generalized, no company-specific branching
// ---------------------------------------------------------------------------

function collectRefCodes(expr: CapacityExpr | undefined, seen: Set<string>): void {
  if (!expr) return;
  if (expr.op === "REF") {
    seen.add(expr.code);
    return;
  }
  for (const item of expr.items) collectRefCodes(item, seen);
}

/** Every CovenantProvision code already superseded by a SOLVER_NATIVE (Permission-based) document/side - rendering these too would double-count the same real basket under two representations. */
function computeShadowedProvisionCodes(covenantData: CompanyCovenantData, solverContext: SolverNativeCompanyContext): Set<string> {
  const shadowed = new Set<string>();
  for (const doc of covenantData.documents) {
    for (const side of ["secured", "unsecured"] as const) {
      const expr = side === "secured" ? doc.capacityFormulas?.secured : doc.capacityFormulas?.unsecured;
      if (!expr) continue;
      const coverage = resolveDocumentSideCoverage(doc.id, side, Boolean(expr), solverContext);
      if (coverage.status !== "SOLVER_NATIVE") continue;
      const codes = new Set<string>();
      collectRefCodes(expr, codes);
      for (const code of codes) shadowed.add(`${doc.id}:${code}`);
    }
  }
  return shadowed;
}

function citationsToKeys(citations: SourceCitation[] | undefined): Set<string> {
  const keys = new Set<string>();
  for (const c of citations ?? []) {
    if (c.permissionId) keys.add(`perm:${c.permissionId}`);
    keys.add(`sec:${c.documentId}:${c.sectionRef}`);
  }
  return keys;
}

function bindingStateFor(bindingKeys: Set<string>, permissionId: string | undefined, documentId: string, sectionRef: string, status: RowStatus): BindingState {
  const isBinding = (permissionId && bindingKeys.has(`perm:${permissionId}`)) || bindingKeys.has(`sec:${documentId}:${sectionRef}`);
  if (isBinding) return "BINDING";
  if (status === "MODELED") return "AVAILABLE";
  if (status === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  if (status === "UNMODELED") return "UNMODELED";
  return "NOT_EVALUABLE";
}

function toRowStatus(status: EvaluationStatus): RowStatus {
  if (status === "modeled") return "MODELED";
  if (status === "review_required") return "REVIEW_REQUIRED";
  return "NOT_TESTED";
}

function headlineCapacitySide(sim: PostTransactionCapacitySimulation): HeadlineCapacitySide {
  const mc = sim.binding?.maximumCapacity;
  const status: HeadlineCapacitySide["status"] = mc?.kind === "EXACT" ? "MODELED" : mc ? "REVIEW_REQUIRED" : "NOT_MODELED";
  const bindingSections = (sim.binding?.bindingConstraint ?? []).map((c) => c.sectionRef);
  return {
    maximumCapacity: mc,
    remainingCapacity: sim.remainingCapacity,
    bindingDocumentName: sim.binding?.documentName,
    bindingSections,
    status,
  };
}

function familyCoverage(counts: FamilyCounts): FamilyCoverageState {
  if (counts.unmodeled > 0) return "PRESENT_BUT_UNMODELED";
  if (counts.reviewRequired > 0) return "MODELED_REVIEW_REQUIRED";
  if (counts.modeled > 0) return "MODELED_AND_EVALUABLE";
  return "NOT_TESTED";
}

function counts(rows: OverviewRow[]): FamilyCounts {
  return {
    modeled: rows.filter((r) => r.status === "MODELED").length,
    reviewRequired: rows.filter((r) => r.status === "REVIEW_REQUIRED").length,
    unmodeled: rows.filter((r) => r.status === "UNMODELED").length,
  };
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function buildCapacityRowFromPermission(p: PermissionRowInput, documentName: string, fin: CompanyCovenantData["financials"], metrics: CovenantPosition["metrics"], bindingKeys: Set<string>): CapacityRow {
  if (p.modelingStatus === "KNOWN_NOT_MODELED") {
    return {
      kind: "CAPACITY",
      stableKey: `perm:${p.id}`,
      name: p.action,
      documentName,
      sectionRef: p.sectionRef,
      formulaDisplay: p.notes,
      currentCapacity: null,
      capacityUnlimited: false,
      usageState: "NOT_TRACKED",
      used: null,
      remaining: null,
      utilizationPct: null,
      bindingState: "UNMODELED",
      status: "UNMODELED",
      reviewState: p.reviewStatus,
      entityScope: p.entityScope,
      tier: "EXCEPTION",
      reason: p.notes ?? "Acknowledged as a real, applicable provision that has not been modeled yet.",
    };
  }

  const asProvision: CovenantProvisionInput = { id: p.id, documentId: p.documentId, code: p.code ?? p.id, basketName: p.action, sectionRef: p.sectionRef, formulaType: p.formulaType, thresholdValue: p.thresholdValue, params: p.params };
  const evaluated = evaluateProvision(asProvision, fin, metrics);
  const status = toRowStatus(evaluated.status);
  const capacity = evaluated.status === "modeled" ? evaluated.capacity : undefined;
  const unlimited = capacity !== undefined && !isFinite(capacity);

  return {
    kind: "CAPACITY",
    stableKey: `perm:${p.id}`,
    name: p.action,
    documentName,
    sectionRef: p.sectionRef,
    formulaDisplay: evaluated.status === "modeled" ? describeFormula(asProvision) : null,
    currentCapacity: capacity !== undefined && isFinite(capacity) ? capacity : null,
    capacityUnlimited: unlimited,
    usageState: "NOT_TRACKED",
    used: null,
    remaining: capacity !== undefined && isFinite(capacity) ? capacity : null,
    utilizationPct: capacity !== undefined && isFinite(capacity) ? 0 : null,
    bindingState: bindingStateFor(bindingKeys, p.id, p.documentId, p.sectionRef, status),
    status,
    reviewState: p.reviewStatus,
    entityScope: p.entityScope,
    tier: "CONDITIONAL",
    reason: evaluated.reason,
  };
}

function buildCapacityRowFromProvision(provision: CovenantProvisionInput, documentName: string, fin: CompanyCovenantData["financials"], metrics: CovenantPosition["metrics"], bindingKeys: Set<string>): CapacityRow {
  const evaluated = evaluateProvision(provision, fin, metrics);
  const status = toRowStatus(evaluated.status);
  const capacity = evaluated.status === "modeled" ? evaluated.capacity : undefined;
  const unlimited = capacity !== undefined && !isFinite(capacity);
  return {
    kind: "CAPACITY",
    stableKey: `prov:${provision.id}`,
    name: provision.basketName,
    documentName,
    sectionRef: provision.sectionRef,
    formulaDisplay: evaluated.status === "modeled" ? describeFormula(provision) : null,
    currentCapacity: capacity !== undefined && isFinite(capacity) ? capacity : null,
    capacityUnlimited: unlimited,
    usageState: "NOT_TRACKED",
    used: null,
    remaining: capacity !== undefined && isFinite(capacity) ? capacity : null,
    utilizationPct: capacity !== undefined && isFinite(capacity) ? 0 : null,
    bindingState: bindingStateFor(bindingKeys, undefined, provision.documentId, provision.sectionRef, status),
    status,
    reviewState: "NOT_TRACKED",
    entityScope: [],
    tier: "CONDITIONAL",
    reason: evaluated.reason,
  };
}

function buildRatioRowFromTest(test: RatioTestResult, documentName: string): RatioRow {
  const status: RowStatus = test.status === "clear" || test.status === "blocked" ? "MODELED" : test.status === "review_required" ? "REVIEW_REQUIRED" : "NOT_TESTED";
  const headroom = status === "MODELED" ? (test.comparisonDirection === "at_or_below" ? test.threshold - test.preTransactionRatio : test.preTransactionRatio - test.threshold) : null;
  return {
    kind: "RATIO",
    stableKey: `ratio:${test.provisionId}`,
    name: `${test.metricName} — ${test.basketName}`,
    documentName,
    sectionRef: test.sectionRef,
    currentRatio: status === "MODELED" ? test.preTransactionRatio : null,
    ratioLimit: test.threshold,
    ratioHeadroom: headroom,
    comparisonDirection: test.comparisonDirection,
    bindingState: status === "MODELED" ? "AVAILABLE" : status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "NOT_EVALUABLE",
    status,
    reviewState: "NOT_TRACKED",
    tier: "PRIMARY",
    reason: test.reason,
  };
}

function buildRatioRowFromGate(provision: CovenantProvisionInput, documentName: string, fin: CompanyCovenantData["financials"], metrics: CovenantPosition["metrics"]): RatioRow {
  const evaluated = evaluateProvision(provision, fin, metrics);
  const status = toRowStatus(evaluated.status);
  return {
    kind: "RATIO",
    stableKey: `gate:${provision.id}`,
    name: provision.basketName,
    documentName,
    sectionRef: provision.sectionRef,
    currentRatio: evaluated.gate ? evaluated.gate.measure : null,
    ratioLimit: provision.thresholdValue,
    ratioHeadroom: evaluated.gate ? provision.thresholdValue - evaluated.gate.measure : null,
    comparisonDirection: "at_or_below",
    bindingState: status === "MODELED" ? (evaluated.gate?.open ? "AVAILABLE" : "REVIEW_REQUIRED") : status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "NOT_EVALUABLE",
    status,
    reviewState: "NOT_TRACKED",
    tier: "PRIMARY",
    reason: evaluated.reason,
  };
}

// ---------------------------------------------------------------------------
// Main pure builder
// ---------------------------------------------------------------------------

export interface BuildCovenantOverviewInput {
  asOfDate: Date;
  covenantData: CompanyCovenantData;
  financialPosition: FinancialPosition;
  solverContext: SolverNativeCompanyContext;
  permissionRows: PermissionRowInput[];
  coverageDeclarations: CoverageDeclarationInput[];
  documentNameById: Map<string, string>;
}

export function buildCovenantOverview(input: BuildCovenantOverviewInput): CovenantOverviewCore {
  const { asOfDate, covenantData, financialPosition, solverContext, permissionRows, coverageDeclarations, documentNameById } = input;

  const position = computeCovenantPosition(covenantData);
  const securedSim = computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, true, solverContext);
  const unsecuredSim = computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, false, solverContext);
  const securedCapacity = headlineCapacitySide(securedSim);
  const unsecuredCapacity = headlineCapacitySide(unsecuredSim);
  const bindingKeys = new Set([...citationsToKeys(securedSim.binding?.bindingConstraint), ...citationsToKeys(unsecuredSim.binding?.bindingConstraint)]);

  const headlineMetrics: HeadlineMetric[] = [
    { key: "cash", label: "Cash", value: `$${Math.round(financialPosition.liquidity.cash.value).toLocaleString("en-US")}M`, state: "AVAILABLE" },
    { key: "grossDebt", label: "Gross debt", value: `$${Math.round(financialPosition.capitalStructure.grossDebt).toLocaleString("en-US")}M`, state: "AVAILABLE" },
    { key: "netDebt", label: "Net debt", value: `$${Math.round(financialPosition.capitalStructure.netDebt).toLocaleString("en-US")}M`, state: "AVAILABLE" },
    {
      key: "totalLiquidity",
      label: "Total liquidity",
      value: financialPosition.liquidity.totalLiquidity === null ? null : `$${Math.round(financialPosition.liquidity.totalLiquidity).toLocaleString("en-US")}M`,
      state: financialPosition.liquidity.totalLiquidity === null ? "REVIEW_REQUIRED" : "AVAILABLE",
    },
    metricRow("netLeverage", "Net leverage", financialPosition.metrics.genericNetLeverage),
    metricRow("securedLeverage", "Secured leverage", financialPosition.metrics.genericSecuredLeverage),
    metricRow("interestCoverage", "Interest coverage", financialPosition.metrics.genericInterestCoverage),
    metricRow("ebitdaMargin", "EBITDA margin", financialPosition.metrics.ebitdaMarginPct),
  ];

  const shadowed = computeShadowedProvisionCodes(covenantData, solverContext);

  const debtRows: OverviewRow[] = [];
  const lienRows: OverviewRow[] = [];
  for (const p of permissionRows) {
    const built = buildCapacityRowFromPermission(p, documentNameById.get(p.documentId) ?? p.documentId, covenantData.financials, position.metrics, bindingKeys);
    if (p.grantType === "DEBT_INCURRENCE") debtRows.push(built);
    else lienRows.push(built);
  }

  const rpRows: OverviewRow[] = [];
  const investmentRows: OverviewRow[] = [];
  const assetSaleRows: OverviewRow[] = [];
  const otherProvisionRows: OverviewRow[] = [];
  const ratioCovenantProvisionIds = new Set<string>();

  for (const doc of covenantData.documents) {
    if (doc.rpWaterfall) {
      for (const step of doc.rpWaterfall.steps) {
        const provision = covenantData.provisions.find((pr) => pr.documentId === doc.id && pr.code === step.code);
        if (!provision || shadowed.has(`${doc.id}:${step.code}`)) continue;
        rpRows.push(buildCapacityRowFromProvision(provision, doc.name, covenantData.financials, position.metrics, bindingKeys));
      }
      const dividendGateCode = doc.rpWaterfall.ratioGateCodeByKind.dividend;
      const dividendGate = covenantData.provisions.find((pr) => pr.documentId === doc.id && pr.code === dividendGateCode);
      if (dividendGate) rpRows.push(buildRatioRowFromGate(dividendGate, doc.name, covenantData.financials, position.metrics));
      const investmentGateCode = doc.rpWaterfall.ratioGateCodeByKind.investment;
      const investmentGate = covenantData.provisions.find((pr) => pr.documentId === doc.id && pr.code === investmentGateCode);
      if (investmentGate) investmentRows.push(buildRatioRowFromGate(investmentGate, doc.name, covenantData.financials, position.metrics));
    }
    if (doc.assetSale) {
      const provision = covenantData.provisions.find((pr) => pr.documentId === doc.id && pr.code === doc.assetSale!.thresholdCode);
      if (provision) assetSaleRows.push(buildCapacityRowFromProvision(provision, doc.name, covenantData.financials, position.metrics, bindingKeys));
    }
  }

  const referencedCodes = new Set<string>();
  for (const doc of covenantData.documents) {
    if (doc.rpWaterfall) {
      for (const s of doc.rpWaterfall.steps) referencedCodes.add(`${doc.id}:${s.code}`);
      referencedCodes.add(`${doc.id}:${doc.rpWaterfall.ratioGateCodeByKind.dividend}`);
      referencedCodes.add(`${doc.id}:${doc.rpWaterfall.ratioGateCodeByKind.investment}`);
    }
    if (doc.assetSale) referencedCodes.add(`${doc.id}:${doc.assetSale.thresholdCode}`);
  }

  for (const secured of [true, false]) {
    for (const test of buildDebtRatioTests(covenantData, position, 0, secured)) {
      if (!test.applies || ratioCovenantProvisionIds.has(test.provisionId)) continue;
      ratioCovenantProvisionIds.add(test.provisionId);
      const doc = covenantData.documents.find((d) => d.id === test.documentId);
      otherProvisionRows.push(buildRatioRowFromTest(test, doc?.name ?? test.documentId));
    }
  }

  const unclassified: OverviewRow[] = [];
  for (const provision of covenantData.provisions) {
    const key = `${provision.documentId}:${provision.code}`;
    if (shadowed.has(key) || referencedCodes.has(key) || ratioCovenantProvisionIds.has(provision.id)) continue;
    const doc = covenantData.documents.find((d) => d.id === provision.documentId);
    unclassified.push(buildCapacityRowFromProvision(provision, doc?.name ?? provision.documentId, covenantData.financials, position.metrics, bindingKeys));
  }

  const families: CovenantFamilySection[] = [];
  const pushFamily = (family: string, rows: OverviewRow[], advisoryNotes: string[] = []) => {
    if (rows.length === 0 && advisoryNotes.length === 0) return;
    families.push({ family, coverageState: familyCoverage(counts(rows)), counts: counts(rows), rows, advisoryNotes });
  };

  const debtAdvisories = coverageDeclarations.filter((d) => d.grantType === "DEBT_INCURRENCE" && d.notes).map((d) => d.notes as string);
  const lienAdvisories = coverageDeclarations.filter((d) => d.grantType === "LIEN" && d.notes).map((d) => d.notes as string);

  pushFamily("INDEBTEDNESS", debtRows, debtAdvisories);
  pushFamily("LIENS", lienRows, lienAdvisories);
  pushFamily("FINANCIAL_COVENANTS", otherProvisionRows);
  pushFamily("RESTRICTED_PAYMENTS", rpRows);
  pushFamily("INVESTMENTS", investmentRows);
  pushFamily("ASSET_SALES", assetSaleRows);
  pushFamily("DEFINITIONS_CALCULATION_RULES", unclassified);

  for (const f of families) assignTiers(f.rows);

  // Default row order (task §87): breach/locked, then binding/near-limit,
  // then review-required, then the tiered available paths (primary before
  // conditional before exceptions/other), then not-evaluable, then
  // genuinely unmodeled/not-tested last. "Breach/locked" here means a real
  // computed CAPACITY row already sitting at zero (never a fabricated
  // percentage threshold) that ISN'T itself the current binding constraint.
  const bindingUrgency = (r: OverviewRow): number => {
    if (r.bindingState === "BINDING") return 0;
    if (r.kind === "CAPACITY" && r.status === "MODELED" && !r.capacityUnlimited && r.currentCapacity !== null && r.currentCapacity <= 0) return 1;
    if (r.bindingState === "REVIEW_REQUIRED") return 2;
    if (r.bindingState === "AVAILABLE") return 3;
    if (r.bindingState === "NOT_EVALUABLE") return 4;
    return 5; // UNMODELED
  };
  const tierRank: Record<RowTier, number> = { PRIMARY: 0, CONDITIONAL: 1, EXCEPTION: 2 };
  for (const f of families) {
    f.rows.sort((a, b) => bindingUrgency(a) - bindingUrgency(b) || tierRank[a.tier] - tierRank[b.tier]);
  }

  return {
    asOfDate,
    headlineMetrics,
    securedCapacity,
    unsecuredCapacity,
    warnings: financialPosition.warnings,
    covenantFamilies: families,
    attentionItems: buildAttentionItems(families, financialPosition, securedCapacity, unsecuredCapacity),
  };
}

/**
 * Basket priority tiers (task §17-20). Purely a materiality re-rank of
 * already-evaluated CAPACITY rows within one family - never a new
 * calculation, never keyed on provision code or basket name. RATIO rows are
 * always PRIMARY (a financial-covenant test is inherently decision-relevant,
 * and there are typically too few per family to usefully sub-rank).
 * UNMODELED/NOT_TESTED rows are always EXCEPTION (§20 - "present in
 * documents, not modeled" is the least decision-relevant state, though still
 * fully visible, never hidden). Among the rest, the top 3 by real evaluated
 * capacity (unlimited counts as top) are PRIMARY; everything else modeled or
 * review-required is CONDITIONAL.
 */
function assignTiers(rows: OverviewRow[]): void {
  const rankable = rows.filter((r): r is CapacityRow => r.kind === "CAPACITY" && (r.status === "MODELED" || r.status === "REVIEW_REQUIRED"));
  const ranked = [...rankable].sort((a, b) => {
    const av = a.capacityUnlimited ? Infinity : (a.currentCapacity ?? -1);
    const bv = b.capacityUnlimited ? Infinity : (b.currentCapacity ?? -1);
    return bv - av;
  });
  const primaryKeys = new Set(ranked.slice(0, 3).map((r) => r.stableKey));
  for (const r of rows) {
    if (r.kind === "RATIO") continue; // already PRIMARY at construction
    if (r.status === "UNMODELED" || r.status === "NOT_TESTED") {
      r.tier = "EXCEPTION";
    } else if (primaryKeys.has(r.stableKey)) {
      r.tier = "PRIMARY";
    } else {
      r.tier = "CONDITIONAL";
    }
  }
}

/**
 * Needs Attention (task §13/§96 - "compact... only actual material
 * issues... make the impact obvious"). Every item here is read directly off
 * an already-computed, real signal - never a fabricated alert or an invented
 * near-limit percentage:
 *   - financialPosition.warnings (lib/financial-core/position-service.ts,
 *     unmodified) - STALE_INPUT / DISPUTED_FACT / MISSING_ASSUMPTION,
 *     already real and categorized.
 *   - a family with REVIEW_REQUIRED rows - real coverage counts.
 *   - a maturity due within 12 months - real financial-core analytics.
 *   - a CAPACITY row genuinely at zero capacity of its own formula - a real
 *     computed fact, not a % threshold.
 * Capped and severity-sorted so it stays compact (§13 - "Keep it compact").
 */
function buildAttentionItems(
  families: CovenantFamilySection[],
  financialPosition: FinancialPosition,
  securedCapacity: HeadlineCapacitySide,
  unsecuredCapacity: HeadlineCapacitySide
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const w of financialPosition.warnings) {
    items.push({ severity: w.category === "MISSING_ASSUMPTION" ? "MEDIUM" : "HIGH", category: w.category, description: w.description });
  }

  if (securedCapacity.status === "REVIEW_REQUIRED" || unsecuredCapacity.status === "REVIEW_REQUIRED") {
    items.push({ severity: "HIGH", category: "REVIEW_REQUIRED", description: "Headline incremental debt capacity is review-required, not a clean modeled figure." });
  }

  for (const f of families) {
    if (f.counts.reviewRequired > 0) {
      items.push({ severity: "MEDIUM", category: "REVIEW_REQUIRED", description: `${familyDisplayName(f.family)}: ${f.counts.reviewRequired} rule(s) require review.` });
    }
  }

  const nextMaturity = financialPosition.maturities.nextMaturity;
  if (nextMaturity && financialPosition.maturities.dueWithin12Months > 0) {
    items.push({
      severity: "HIGH",
      category: "UPCOMING_MATURITY",
      description: `${nextMaturity.facilityName} matures ${nextMaturity.date.toISOString().slice(0, 10)} ($${Math.round(nextMaturity.principal).toLocaleString("en-US")}M).`,
    });
  }

  for (const f of families) {
    for (const r of f.rows) {
      if (r.kind !== "CAPACITY" || r.status !== "MODELED" || r.capacityUnlimited || r.currentCapacity === null || r.currentCapacity > 0) continue;
      if (r.bindingState === "BINDING") continue; // already the headline's own binding constraint - not a separate surprise
      items.push({ severity: "MEDIUM", category: "LOCKED_CAPACITY", description: `${r.name} (${familyDisplayName(f.family)}) has no capacity currently available under its own formula.` });
    }
  }

  const severityRank: Record<AttentionItem["severity"], number> = { HIGH: 0, MEDIUM: 1 };
  items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return items.slice(0, 8);
}

function familyDisplayName(family: string): string {
  return family
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

function metricRow(key: string, label: string, m: { status: string; value: number | null }): HeadlineMetric {
  if (m.status !== "OK" || m.value === null) {
    return { key, label, value: null, state: m.status === "UNAVAILABLE_MISSING_INPUT" ? "NOT_AVAILABLE" : "REVIEW_REQUIRED" };
  }
  return { key, label, value: `${m.value.toFixed(2)}x`, state: "AVAILABLE" };
}
