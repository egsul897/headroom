/**
 * Restore the full covenant overview (docs/full-covenant-overview-restoration.md).
 *
 * `getCovenantOverview(companyId, asOfDate?)` is the server-side loader:
 * fetches every real row this view needs via Prisma, normalizes it into the
 * plain shapes `buildCovenantOverview` (lib/covenant-overview-builder.ts,
 * the actual pure row-building logic - unchanged, just relocated) expects,
 * and returns the combined result. Kept deliberately thin - this file's own
 * job is Prisma I/O and Decimal/enum normalization only; see the builder
 * module's own header comment for why the computation itself lives there
 * instead (so the Dashboard tab's editable-financials reflow can call the
 * exact same logic client-side with zero server round-trip).
 */
import { prisma } from "./prisma";
import { computeLeverageMetrics, loadCompanyCovenantData, type CompanyCovenantData, type FormulaParams } from "./covenant-engine";
import { getFinancialPosition } from "./financial-core/position-service";
import { loadCompanyFinancialCoreData } from "./financial-core-db/adapter";
import { buildSolverContext, getCompanySummary, type CompanySummary } from "./dashboard-service";
import { buildCovenantOverview, type CovenantOverviewCore, type PermissionRowInput, type CoverageDeclarationInput } from "./covenant-overview-builder";

export type {
  AttentionItem,
  BindingState,
  CapacityRow,
  CovenantFamilySection,
  FamilyCounts,
  FamilyCoverageState,
  HeadlineCapacitySide,
  HeadlineMetric,
  OverviewRow,
  RatioRow,
  ReviewStateLabel,
  RowStatus,
  RowTier,
} from "./covenant-overview-builder";

export interface CovenantOverview extends CovenantOverviewCore {
  company: CompanySummary;
}

/** A well-formed, empty `CompanyCovenantData` - every downstream function in this file already handles zero documents/provisions correctly, so this is a real, safe "nothing modeled yet" state, never a fabricated financial snapshot. */
export function emptyCovenantData(companyId: string): CompanyCovenantData {
  return { companyId, documents: [], provisions: [], financials: { ebitda: 0, cash: 0, interestExpense: 0, cumulativeNetIncome: 0, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 0, totalDebt: 0, securedDebt: 0 }, ledger: [] };
}

/**
 * `loadCompanyCovenantData` throws when a company has no legacy
 * `FinancialSnapshot` row at all (real for any customer onboarded through the
 * current wizard, or a solver-native-only company like Matthews). Exported so
 * any page needing a real `CompanyCovenantData` (e.g. the Simulate tab) can
 * share this one guard instead of re-deriving it.
 */
export async function loadCovenantDataOrEmpty(companyId: string, asOfDate: Date): Promise<CompanyCovenantData> {
  try {
    return await loadCompanyCovenantData(prisma, companyId, asOfDate);
  } catch {
    return emptyCovenantData(companyId);
  }
}

async function resolveDefaultAsOfDate(companyId: string): Promise<Date> {
  const latest = await prisma.financialState.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } });
  return latest?.asOfDate ?? new Date();
}

/**
 * Loads every input `buildCovenantOverview` needs, in the plain
 * (already-serializable, no Prisma Decimal/enum types) shape it expects -
 * exported so a page can pass this SAME payload to a client component,
 * which then calls `buildCovenantOverview` itself for live, no-round-trip
 * reflow when the person editing overrides a financial input.
 */
export async function loadCovenantOverviewInputs(companyId: string, asOfDateParam?: Date) {
  const asOfDate = asOfDateParam ?? (await resolveDefaultAsOfDate(companyId));

  const [company, fcData, covenantData, permissionRowsRaw, coverageDeclarationsRaw, documents, solverContext] = await Promise.all([
    getCompanySummary(companyId),
    loadCompanyFinancialCoreData(prisma, companyId, asOfDate),
    // `loadCompanyCovenantData` throws when a company has no legacy
    // `FinancialSnapshot` row at all - real for any customer onboarded
    // through the current wizard, which writes the newer `FinancialState`
    // model instead (lib/onboarding/financial.ts). That is a genuinely
    // empty legacy-covenant-data state, not an error this view should
    // crash on - Permission-based (solver-native) families still render
    // correctly from an empty legacy dataset, and this view already treats
    // "no CovenantProvision rows" as a normal, real state (§G of
    // docs/full-covenant-overview-restoration.md).
    loadCovenantDataOrEmpty(companyId, asOfDate),
    prisma.permission.findMany({ where: { companyId } }),
    prisma.solverCoverageDeclaration.findMany({ where: { companyId } }),
    prisma.document.findMany({ where: { companyId } }),
    buildSolverContext(companyId, asOfDate),
  ]);

  const documentNameById = new Map(documents.map((d) => [d.id, d.name] as const));
  const financialPosition = getFinancialPosition(fcData.state, fcData.facilities, fcData.events, asOfDate, []);

  const permissionRows: PermissionRowInput[] = permissionRowsRaw.map((p) => ({
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
  }));
  const coverageDeclarations: CoverageDeclarationInput[] = coverageDeclarationsRaw.map((d) => ({ grantType: d.grantType, notes: d.notes }));

  return { company, asOfDate, covenantData, financialPosition, solverContext, permissionRows, coverageDeclarations, documentNameById };
}

export async function getCovenantOverview(companyId: string, asOfDateParam?: Date): Promise<CovenantOverview> {
  const inputs = await loadCovenantOverviewInputs(companyId, asOfDateParam);
  const core = buildCovenantOverview(inputs);
  return { company: inputs.company, ...core };
}

/**
 * The sticky company header's "live total net leverage" figure (task "MAKE
 * THE UI MATCH THE PROTOTYPE EXACTLY" - "sticky header with company name
 * and live total net leverage"). Deliberately the cheapest real path to
 * that one number - `computeLeverageMetrics` (lib/covenant-engine.ts,
 * unmodified) over the same `CompanyCovenantData.financials` the Dashboard
 * tab's capacity band itself is computed from, so the header and the
 * Dashboard band can never disagree. Returns `null` (never a fabricated
 * "0.00x") when a company has no covenant financial snapshot at all.
 */
export async function getLiveTotalNetLeverage(companyId: string, asOfDateParam?: Date): Promise<number | null> {
  const asOfDate = asOfDateParam ?? (await resolveDefaultAsOfDate(companyId));
  const covenantData = await loadCovenantDataOrEmpty(companyId, asOfDate);
  if (!isFinite(covenantData.financials.ebitda) || covenantData.financials.ebitda === 0) return null;
  return computeLeverageMetrics(covenantData.financials).totalNetLeverage;
}
