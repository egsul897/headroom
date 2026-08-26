/**
 * Restore the full covenant overview (docs/full-covenant-overview-restoration.md).
 *
 * `getCovenantOverview(companyId, asOfDate?)` is the single generalized
 * service contract the dense Dashboard/Covenants view renders from. It
 * performs ZERO covenant-capacity or financial arithmetic of its own beyond
 * grouping/labeling already-computed results - every number comes from an
 * existing, unmodified engine call:
 *  - `getFinancialPosition` (lib/financial-core) for headline metrics.
 *  - `computeRemainingCapacityAfterDebtIncurrence` (lib/covenant-engine.ts,
 *    already used by lib/dashboard-service.ts) for headline secured/unsecured
 *    capacity + binding constraint - unchanged, called at amount=0 exactly as
 *    the existing Dashboard already does.
 *  - `evaluateProvision`/`describeFormula` (lib/covenant-engine.ts,
 *    lib/describe-formula.ts) for per-basket capacity + plain-English
 *    formula text - reused verbatim as a pure formula evaluator/serializer,
 *    never reimplemented. `Permission` rows are adapted into the same
 *    `CovenantProvisionInput` shape these functions already accept (both
 *    models share the same formulaType/thresholdValue/params leaf-calculation
 *    fields) - this is composition, not a solver change.
 *  - `buildDebtRatioTests` (lib/covenant-engine.ts) for standalone
 *    maintenance-covenant ratio rows.
 *
 * Family/coverage classification uses only REAL structural signals already
 * present in the data - which document config (capacityFormulas /
 * rpWaterfall / assetSale) references a provision's code, a Permission's own
 * `grantType`, and real `SolverCoverageDeclaration`/`modelingStatus` rows -
 * never a hardcoded company/provision-code branch. A covenant family with
 * zero real evidence of presence for a company renders no section at all
 * (fabricating presence would be worse than omitting it); this is recorded
 * explicitly in the report, not silently decided.
 */
import type { CompanyTenantKind } from "@prisma/client";
import { prisma } from "./prisma";
import {
  buildDebtRatioTests,
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  evaluateProvision,
  loadCompanyCovenantData,
  resolveDocumentSideCoverage,
  type CapacityExpr,
  type CompanyCovenantData,
  type CovenantPosition,
  type CovenantProvisionInput,
  type DocumentInput,
  type EvaluationStatus,
  type FormulaParams,
  type PostTransactionCapacitySimulation,
  type RatioTestResult,
} from "./covenant-engine";
import { describeFormula } from "./describe-formula";
import { getFinancialPosition } from "./financial-core/position-service";
import { loadCompanyFinancialCoreData } from "./financial-core-db/adapter";
import { buildSolverContext, getCompanySummary, type CompanySummary } from "./dashboard-service";
import type { MaxCapacityResult, SourceCitation } from "./solver/types";

// ---------------------------------------------------------------------------
// Row-level types
// ---------------------------------------------------------------------------

export type RowStatus = "MODELED" | "REVIEW_REQUIRED" | "NOT_TESTED" | "UNMODELED";
export type BindingState = "BINDING" | "AVAILABLE" | "REVIEW_REQUIRED" | "NOT_EVALUABLE" | "UNMODELED";
export type ReviewStateLabel = "VERIFIED" | "UNVERIFIED" | "DISPUTED" | "NOT_TRACKED";

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

export interface CovenantOverview {
  company: CompanySummary;
  asOfDate: Date;
  headlineMetrics: HeadlineMetric[];
  securedCapacity: HeadlineCapacitySide;
  unsecuredCapacity: HeadlineCapacitySide;
  warnings: { category: string; description: string }[];
  covenantFamilies: CovenantFamilySection[];
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
async function computeShadowedProvisionCodes(covenantData: CompanyCovenantData, position: CovenantPosition, solverContext: Awaited<ReturnType<typeof buildSolverContext>>): Promise<Set<string>> {
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

interface PermissionRow {
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

function buildCapacityRowFromPermission(p: PermissionRow, documentName: string, fin: CompanyCovenantData["financials"], metrics: CovenantPosition["metrics"], bindingKeys: Set<string>): CapacityRow {
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
    reason: evaluated.reason,
  };
}

function buildRatioRowFromTest(test: RatioTestResult, documentName: string): RatioRow {
  const status: RowStatus = test.status === "clear" || test.status === "blocked" ? "MODELED" : test.status === "review_required" ? "REVIEW_REQUIRED" : "NOT_TESTED";
  // `preTransactionRatio` is the CURRENT ratio (amount=0 is always passed in
  // by this service - see getCovenantOverview) - headroom against it is the
  // real current headroom, independent of postTransactionRatio's own
  // (amount-dependent, here always ~equal to pre) value.
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
    reason: test.reason,
  };
}

function buildRatioRowFromGate(provision: CovenantProvisionInput, documentName: string, family: string, fin: CompanyCovenantData["financials"], metrics: CovenantPosition["metrics"]): RatioRow {
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
    reason: evaluated.reason,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function resolveDefaultAsOfDate(companyId: string): Promise<Date> {
  const latest = await prisma.financialState.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } });
  return latest?.asOfDate ?? new Date();
}

export async function getCovenantOverview(companyId: string, asOfDateParam?: Date): Promise<CovenantOverview> {
  const asOfDate = asOfDateParam ?? (await resolveDefaultAsOfDate(companyId));

  const [company, fcData, covenantData, permissionRows, coverageDeclarations, documents] = await Promise.all([
    getCompanySummary(companyId),
    loadCompanyFinancialCoreData(prisma, companyId, asOfDate),
    loadCompanyCovenantData(prisma, companyId, asOfDate),
    prisma.permission.findMany({ where: { companyId } }),
    prisma.solverCoverageDeclaration.findMany({ where: { companyId } }),
    prisma.document.findMany({ where: { companyId } }),
  ]);

  const documentNameById = new Map(documents.map((d) => [d.id, d.name] as const));
  const financialPosition = getFinancialPosition(fcData.state, fcData.facilities, fcData.events, asOfDate, []);
  const position = computeCovenantPosition(covenantData);
  const solverContext = await buildSolverContext(companyId, asOfDate);
  const [securedSim, unsecuredSim] = await Promise.all([
    Promise.resolve(computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, true, solverContext)),
    Promise.resolve(computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, false, solverContext)),
  ]);
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

  const shadowed = await computeShadowedProvisionCodes(covenantData, position, solverContext);

  // INDEBTEDNESS / LIENS - real Permission rows (both MODELED and KNOWN_NOT_MODELED).
  const debtRows: OverviewRow[] = [];
  const lienRows: OverviewRow[] = [];
  for (const p of permissionRows) {
    const row: PermissionRow = {
      id: p.id,
      documentId: p.documentId,
      code: p.code,
      grantType: p.grantType,
      action: p.action,
      entityScope: p.entityScope,
      formulaType: p.formulaType,
      thresholdValue: p.thresholdValue.toNumber(),
      params: (p.params as FormulaParams | null) ?? null,
      sectionRef: p.sectionRef,
      modelingStatus: p.modelingStatus,
      reviewStatus: p.reviewStatus,
      notes: p.notes,
    };
    const built = buildCapacityRowFromPermission(row, documentNameById.get(p.documentId) ?? p.documentId, covenantData.financials, position.metrics, bindingKeys);
    if (p.grantType === "DEBT_INCURRENCE") debtRows.push(built);
    else lienRows.push(built);
  }

  // RESTRICTED_PAYMENTS / INVESTMENTS / ASSET_SALES / FINANCIAL_COVENANTS -
  // real CovenantProvision rows not superseded by a solver-native document/side.
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
      if (dividendGate) rpRows.push(buildRatioRowFromGate(dividendGate, doc.name, "RESTRICTED_PAYMENTS", covenantData.financials, position.metrics));
      const investmentGateCode = doc.rpWaterfall.ratioGateCodeByKind.investment;
      const investmentGate = covenantData.provisions.find((pr) => pr.documentId === doc.id && pr.code === investmentGateCode);
      if (investmentGate) investmentRows.push(buildRatioRowFromGate(investmentGate, doc.name, "INVESTMENTS", covenantData.financials, position.metrics));
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

  // Any remaining CovenantProvision row not already classified above and not
  // shadowed by solver-native coverage - a fail-closed catch-all so a future
  // formulaType/config this service doesn't yet recognize is still surfaced
  // for review rather than silently dropped, never assigned a fabricated family.
  const classifiedIds = new Set([...ratioCovenantProvisionIds]);
  for (const doc of covenantData.documents) {
    if (doc.rpWaterfall) {
      for (const s of doc.rpWaterfall.steps) classifiedIds.add(`${doc.id}:${s.code}`);
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

  // Sort within each family: breached/binding first, then near-binding (none
  // synthesized - task §20), then modeled/available, then everything else -
  // stable otherwise (Array.prototype.sort is stable per spec).
  const priority: Record<string, number> = { BINDING: 0, REVIEW_REQUIRED: 1, AVAILABLE: 2, NOT_EVALUABLE: 3, UNMODELED: 4 };
  for (const f of families) {
    f.rows.sort((a, b) => (priority[a.bindingState] ?? 9) - (priority[b.bindingState] ?? 9));
  }

  return {
    company,
    asOfDate,
    headlineMetrics,
    securedCapacity,
    unsecuredCapacity,
    warnings: financialPosition.warnings,
    covenantFamilies: families,
  };
}

function metricRow(key: string, label: string, m: { status: string; value: number | null }): HeadlineMetric {
  if (m.status !== "OK" || m.value === null) {
    return { key, label, value: null, state: m.status === "UNAVAILABLE_MISSING_INPUT" ? "NOT_AVAILABLE" : "REVIEW_REQUIRED" };
  }
  return { key, label, value: `${m.value.toFixed(2)}x`, state: "AVAILABLE" };
}
