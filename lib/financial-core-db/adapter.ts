/**
 * Financial-core DB adapter (architecture §U), Phase 9.
 *
 * Prisma reads for the §T tables - thin, structurally typed, mirroring
 * lib/covenant-engine.ts's own `CovenantEnginePrismaClient`/
 * `loadCompanyCovenantData` pattern (Decimal -> number, JSON -> typed shape,
 * effective-dating filtered the same way). This is the only place a Prisma
 * client is imported for financial-core data; lib/financial-core/** itself
 * stays DB-free.
 */

import { reviveProvencancedFact } from "../financial-core/provenance";
import type {
  BalanceSheetFacts,
  CovenantMetricFacts,
  DebtEvent,
  Facility,
  FinancialState,
  IncomeStatementFacts,
  LiquidityFacts,
} from "../financial-core/types";

interface DecimalLike {
  toNumber(): number;
}
type DecimalField = number | DecimalLike;
function toNumber(value: DecimalField): number {
  return typeof value === "number" ? value : value.toNumber();
}
function toNumberOrUndefined(value: DecimalField | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : toNumber(value);
}

function effectiveDateFilter(asOfDate: Date) {
  return {
    AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOfDate } }] }, { OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOfDate } }] }],
  };
}

interface DbFinancialStateRow {
  id: string;
  companyId: string;
  asOfDate: Date;
  periodType: "ACTUAL" | "FORECAST" | "PRO_FORMA";
  scope: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  balanceSheetFacts: unknown;
  incomeStatementFacts: unknown;
  covenantMetricFacts: unknown;
  liquidityFacts: unknown;
  notes: string | null;
}

interface DbFacilityRow {
  id: string;
  companyId: string;
  name: string;
  facilityType: Facility["facilityType"];
  currency: string;
  originalPrincipal: DecimalField;
  commitmentAmount: DecimalField | null;
  borrowingBaseAtOrigination: DecimalField | null;
  secured: boolean;
  couponType: Facility["couponType"];
  couponPct: DecimalField | null;
  marginBps: number | null;
  referenceRate: string | null;
  rateFloorPct: DecimalField | null;
  maturityDate: Date | null;
  issuedDate: Date | null;
  governingDocumentId: string | null;
  obligorEntityClasses: Facility["obligorEntityClasses"];
  guarantorEntityClasses: Facility["guarantorEntityClasses"];
  collateralPoolIds: string[];
  originatingPermissionIds: string[];
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

interface DbDebtEventRow {
  id: string;
  companyId: string;
  facilityId: string;
  eventType: DebtEvent["eventType"];
  date: Date;
  amount: DecimalField;
  refinancesFacilityId: string | null;
  relatedPermissionIds: string[];
  sourceLedgerEntryId: string | null;
  provenance: unknown;
}

export interface FinancialCorePrismaClient {
  financialState: { findFirst(args: any): Promise<DbFinancialStateRow | null> };
  facility: { findMany(args: any): Promise<DbFacilityRow[]> };
  debtEvent: { findMany(args: any): Promise<DbDebtEventRow[]> };
}

function reviveFactsGroup<T extends object>(g: T): T {
  const out: Record<string, unknown> = { ...(g as unknown as Record<string, unknown>) };
  for (const k of Object.keys(out)) {
    const v = out[k] as { asOfDate?: string } | undefined;
    if (v && typeof v === "object" && "asOfDate" in v) out[k] = reviveProvencancedFact(v as any);
  }
  return out as unknown as T;
}

/**
 * Loads the latest effective `FinancialState` for a company as of a given
 * date (same "at most one row matches a given query date" convention
 * `loadCompanyCovenantData` already uses - architecture §C.3). Returns
 * `null` if none exists, mirroring `loadCompanyCovenantData`'s own explicit
 * "no snapshot found" failure rather than fabricating an empty state.
 */
export async function loadFinancialState(prisma: FinancialCorePrismaClient, companyId: string, asOfDate: Date): Promise<FinancialState | null> {
  const row = await prisma.financialState.findFirst({
    where: { companyId, asOfDate: { lte: asOfDate }, ...effectiveDateFilter(asOfDate) },
    orderBy: { asOfDate: "desc" },
  });
  if (!row) return null;

  const balanceSheetFacts = reviveFactsGroup(row.balanceSheetFacts as BalanceSheetFacts);
  const incomeStatementFacts = reviveFactsGroup(row.incomeStatementFacts as IncomeStatementFacts);
  const covenantMetricFactsRaw = row.covenantMetricFacts as CovenantMetricFacts;
  const covenantMetricFacts: CovenantMetricFacts = {
    assumedNewDebtRatePct: reviveProvencancedFact(covenantMetricFactsRaw.assumedNewDebtRatePct as any),
    covenantEbitda: covenantMetricFactsRaw.covenantEbitda
      ? { ...covenantMetricFactsRaw.covenantEbitda, provenance: reviveProvencancedFact(covenantMetricFactsRaw.covenantEbitda.provenance as any) }
      : undefined,
  };
  const liquidityFacts = row.liquidityFacts ? reviveFactsGroup(row.liquidityFacts as LiquidityFacts) : undefined;

  return {
    id: row.id,
    companyId: row.companyId,
    asOfDate: row.asOfDate,
    periodType: row.periodType,
    scope: row.scope === "CONSOLIDATED" ? { kind: "CONSOLIDATED" } : { kind: "ENTITY_CLASS", entityClass: row.scope as never },
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    balanceSheetFacts,
    incomeStatementFacts,
    covenantMetricFacts,
    liquidityFacts,
    notes: row.notes ?? undefined,
  };
}

export async function loadFacilities(prisma: FinancialCorePrismaClient, companyId: string, asOfDate: Date): Promise<Facility[]> {
  const rows = await prisma.facility.findMany({ where: { companyId, ...effectiveDateFilter(asOfDate) } });
  return rows.map(
    (r): Facility => ({
      id: r.id,
      companyId: r.companyId,
      name: r.name,
      facilityType: r.facilityType,
      currency: { code: r.currency },
      originalPrincipal: toNumber(r.originalPrincipal),
      commitmentAmount: toNumberOrUndefined(r.commitmentAmount),
      borrowingBaseAtOrigination: toNumberOrUndefined(r.borrowingBaseAtOrigination),
      secured: r.secured,
      couponType: r.couponType,
      couponPct: toNumberOrUndefined(r.couponPct),
      marginBps: r.marginBps ?? undefined,
      referenceRate: r.referenceRate ?? undefined,
      rateFloorPct: toNumberOrUndefined(r.rateFloorPct),
      maturityDate: r.maturityDate ?? undefined,
      issuedDate: r.issuedDate ?? undefined,
      governingDocumentId: r.governingDocumentId ?? undefined,
      obligorEntityClasses: r.obligorEntityClasses,
      guarantorEntityClasses: r.guarantorEntityClasses,
      collateralPoolIds: r.collateralPoolIds,
      originatingPermissionIds: r.originatingPermissionIds,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    })
  );
}

/** Loads every DebtEvent up to (and including) `asOfDate` - the full replay history capital-structure.ts's event-sourcing functions need. */
export async function loadDebtEvents(prisma: FinancialCorePrismaClient, companyId: string, asOfDate: Date): Promise<DebtEvent[]> {
  const rows = await prisma.debtEvent.findMany({ where: { companyId, date: { lte: asOfDate } } });
  return rows.map(
    (r): DebtEvent => ({
      id: r.id,
      companyId: r.companyId,
      facilityId: r.facilityId,
      eventType: r.eventType,
      date: r.date,
      amount: toNumber(r.amount),
      refinancesFacilityId: r.refinancesFacilityId ?? undefined,
      relatedPermissionIds: r.relatedPermissionIds,
      sourceLedgerEntryId: r.sourceLedgerEntryId ?? undefined,
      provenance: reviveProvencancedFact(r.provenance as any),
    })
  );
}

export interface CompanyFinancialCoreData {
  state: FinancialState;
  facilities: Facility[];
  events: DebtEvent[];
}

/** Convenience loader combining the three reads above - the single call site position-service.ts/scenario-service.ts actually use. */
export async function loadCompanyFinancialCoreData(prisma: FinancialCorePrismaClient, companyId: string, asOfDate: Date): Promise<CompanyFinancialCoreData> {
  const [state, facilities, events] = await Promise.all([loadFinancialState(prisma, companyId, asOfDate), loadFacilities(prisma, companyId, asOfDate), loadDebtEvents(prisma, companyId, asOfDate)]);
  if (!state) throw new Error(`No FinancialState found for company ${companyId} as of ${asOfDate.toISOString()}.`);
  return { state, facilities, events };
}
