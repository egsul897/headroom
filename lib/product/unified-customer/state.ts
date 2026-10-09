/**
 * Single verified contractual + financial state loader for Position / Simulate / Ask.
 * Surfaces obtain results from this module — they do not reimplement capacity math.
 */

import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  loadCompanyCovenantData,
  type CompanyCovenantData,
  type CovenantPosition,
  type SolverNativeCompanyContext,
} from "@/lib/covenant-engine";
import { buildSolverContext } from "@/lib/dashboard-service";
import { loadCompanyFinancialCoreData } from "@/lib/financial-core-db/adapter";
import { getFinancialPosition } from "@/lib/financial-core/position-service";
import type { DebtEvent, Facility, FinancialPosition, FinancialState } from "@/lib/financial-core/types";
import { resolveCanonicalFinancialIdentity } from "@/lib/financial-identity";
import { loadCapacityReadiness, type CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { prisma } from "@/lib/prisma";
import { fingerprintVerifiedState } from "./fingerprint";
import type { EngineAuthorityLabel } from "./types";

export interface VerifiedCustomerState {
  companyId: string;
  asOfDate: Date;
  asOfDateIso: string;
  stateFingerprint: string;
  readiness: CapacityReadiness;
  authority: EngineAuthorityLabel;
  covenantData: CompanyCovenantData;
  covenantPosition: CovenantPosition;
  solverContext: SolverNativeCompanyContext | null;
  financialState: FinancialState | null;
  facilities: Facility[];
  events: DebtEvent[];
  financialPosition: FinancialPosition | null;
  documents: Array<{ id: string; name: string; notes: string | null }>;
  /** True when legacy engine capacity path can run without inventing inputs. */
  canEvaluate: boolean;
}

async function resolveAsOf(companyId: string, evaluationDate?: string | null): Promise<Date> {
  if (evaluationDate && /^\d{4}-\d{2}-\d{2}$/.test(evaluationDate)) {
    return new Date(`${evaluationDate}T12:00:00.000Z`);
  }
  const resolution = await resolveCanonicalFinancialIdentity(
    (args) => prisma.financialState.findMany(args),
    { where: { companyId }, selection: "latest-cohort" },
  );
  if (resolution.status === "UNIQUE") return resolution.row.asOfDate;
  return new Date();
}

function emptyCovenantData(companyId: string): CompanyCovenantData {
  return {
    companyId,
    documents: [],
    provisions: [],
    financials: {
      ebitda: 0,
      cash: 0,
      interestExpense: 0,
      cumulativeNetIncome: 0,
      equityProceedsSinceIssue: 0,
      assumedNewDebtRatePct: 0,
      totalDebt: 0,
      securedDebt: 0,
      totalAssets: 0,
    },
    ledger: [],
  };
}

function authorityFromReadiness(readiness: CapacityReadiness): EngineAuthorityLabel {
  return {
    capacityAuthority: readiness.capacityAuthority,
    note:
      readiness.capacityAuthority === "LEGACY_ENGINE" || readiness.capacityAuthority === "NOT_CERTIFIED_4E"
        ? "Figures from the shared legacy covenant engine against dated FinancialState — NOT_CERTIFIED_4E until Phase 4A–4E + APPROVED snapshots replace this path."
        : readiness.headline,
  };
}

/**
 * Load the one shared verified state used by Position, Simulate, and Ask.
 */
export async function loadVerifiedCustomerState(
  companyId: string,
  opts?: { evaluationDate?: string | null },
): Promise<VerifiedCustomerState> {
  const asOfDate = await resolveAsOf(companyId, opts?.evaluationDate);
  const readiness = await loadCapacityReadiness(companyId);

  const [covenantData, solverContext, documents, fc] = await Promise.all([
    loadCompanyCovenantData(prisma, companyId, asOfDate).catch(() => emptyCovenantData(companyId)),
    buildSolverContext(companyId, asOfDate).catch(() => null),
    prisma.document.findMany({
      where: { companyId },
      select: { id: true, name: true, notes: true },
      orderBy: { createdAt: "asc" },
    }),
    loadCompanyFinancialCoreData(prisma, companyId, asOfDate).catch(() => null),
  ]);

  const data = covenantData ?? emptyCovenantData(companyId);
  const covenantPosition = computeCovenantPosition(data);
  const financialState = fc?.state ?? null;
  const facilities = fc?.facilities ?? [];
  const events = fc?.events ?? [];
  const financialPosition =
    financialState != null
      ? getFinancialPosition(financialState, facilities, events, asOfDate, [])
      : null;

  const provisionDigest = data.provisions
    .map((p) => `${p.documentId}:${p.code}:${p.sectionRef}:${p.thresholdValue ?? ""}`)
    .sort()
    .join("|");
  const stateFingerprint = fingerprintVerifiedState({
    companyId,
    asOfDate: asOfDate.toISOString(),
    provisionDigest,
    finDigest: data.financials,
    permissionCount: readiness.permissionCount,
    ns4: readiness.ns4ApprovedSnapshotCount,
    ledger: readiness.contractLedgerActiveCount,
    docIds: documents.map((d) => d.id).sort(),
  });

  return {
    companyId,
    asOfDate,
    asOfDateIso: asOfDate.toISOString().slice(0, 10),
    stateFingerprint,
    readiness,
    authority: authorityFromReadiness(readiness),
    covenantData: data,
    covenantPosition,
    solverContext,
    financialState,
    facilities,
    events,
    financialPosition,
    documents,
    canEvaluate: readiness.canEvaluateExecutableCapacity && data.provisions.length > 0,
  };
}

/**
 * Current capacity sides from the SAME engine function Simulate uses at amount=0.
 */
export function capacitySidesFromState(state: VerifiedCustomerState) {
  if (!state.canEvaluate || !state.solverContext) {
    return { secured: null as null, unsecured: null as null };
  }
  const secured = computeRemainingCapacityAfterDebtIncurrence(
    state.covenantData,
    state.covenantPosition,
    0,
    true,
    state.solverContext,
  );
  const unsecured = computeRemainingCapacityAfterDebtIncurrence(
    state.covenantData,
    state.covenantPosition,
    0,
    false,
    state.solverContext,
  );
  return { secured, unsecured };
}
