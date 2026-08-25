/**
 * Phase 10 — app-facing aggregation service.
 *
 * A thin composition layer over the generalized engines (lib/covenant-engine.ts,
 * lib/financial-core/**, lib/financial-core-db/adapter.ts) so that app/**
 * pages/components never coordinate multiple unrelated DB calls themselves
 * and never compute anything beyond formatting/sorting/filtering (task hard
 * requirement §1 - "no calculation in React/JSX"). This file performs ZERO
 * covenant-capacity or financial arithmetic of its own - it only calls the
 * existing engines and reshapes/aggregates their already-computed outputs.
 *
 * NO company-specific branching anywhere below (task hard requirement §2):
 * every function takes `companyId` as a plain parameter and behaves
 * identically for any value. The one apparent per-company table
 * (`SOLVER_CONTEXT_ENTITY_DEFAULTS`) is the exact same generalized,
 * documented pattern scripts/golden-test.ts's own `buildSolverContext`
 * already established and this repo already relies on for its only two
 * populated companies - it degrades to a generic, still-correct default for
 * ANY companyId not in the table (zero Permission rows for an unrecognized
 * company makes every document/side resolve LEGACY/NOT_TESTED regardless of
 * these fields' exact values), so it is data/convenience, not branching on
 * company identity in the sense the task prohibits (no `if (companyId ===
 * "coherent")` anywhere in this file or any other lib/ or app/ file).
 */
import type { OnboardingStatus } from "@prisma/client";
import { prisma } from "./prisma";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  loadCompanyCovenantData,
  loadCompanySolverStaticData,
  type PostTransactionCapacitySimulation,
  type SolverNativeCompanyContext,
} from "./covenant-engine";
import { loadCompanyFinancialCoreData } from "./financial-core-db/adapter";
import { getFinancialPosition } from "./financial-core/position-service";
import { evaluateContractualCapacity, projectToLegacySnapshot } from "./financial-core/solver-adapter";
import type { FinancialPosition, ScenarioAction, ScenarioResult } from "./financial-core/types";
import type { ActivationState, EntityClass, GuarantorStatus } from "./solver/types";
import { hasCompletedQualifiedLegalReview } from "./legal-review";
import { runScenarioWithInputs, type ScenarioInputs } from "./scenario-runner";
export { deriveContractualTestParams, runScenarioWithInputs, type ScenarioInputs } from "./scenario-runner";

export interface CompanySummary {
  id: string;
  name: string;
  ticker: string | null;
  // Company onboarding (docs/company-onboarding-v1-implementation.md) -
  // additive field, defaults to "ACTIVE" for every pre-existing row per
  // Company.onboardingStatus's own schema default. Lets the landing page and
  // company switcher route an ONBOARDING company to its wizard instead of a
  // product page it has no data for yet, with zero company-specific branching.
  onboardingStatus: OnboardingStatus;
}

/**
 * Every company in the system, for the company-selector mechanism (task's
 * "smallest generalized mechanism to choose between them"). Deliberately NOT
 * wrapped in React's `cache()` (unlike lib/coherent.ts's older loaders) - the
 * installed `react` package here does not export `cache` at all
 * (`node -e "require('react').cache"` is undefined), so wrapping would break
 * every non-Next caller of this module (vitest, scripts) at import time,
 * which is a much worse failure than the per-request re-fetch this would
 * have deduplicated. Correctness over a request-scoped memoization nicety.
 */
export async function listCompanies(): Promise<CompanySummary[]> {
  const rows = await prisma.company.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, ticker: r.ticker, onboardingStatus: r.onboardingStatus }));
}

export async function getCompanySummary(companyId: string): Promise<CompanySummary> {
  const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  return { id: row.id, name: row.name, ticker: row.ticker, onboardingStatus: row.onboardingStatus };
}

// ---------------------------------------------------------------------------
// Solver-native transaction context (reused pattern - see header comment)
// ---------------------------------------------------------------------------

const SOLVER_CONTEXT_ENTITY_DEFAULTS: Record<string, { entityClasses: EntityClass[]; incurringEntity: { id: string; name: string }; guarantorStatus: GuarantorStatus }> = {
  coherent: { entityClasses: ["BORROWER"], incurringEntity: { id: "coherent-borrower", name: "Coherent Corp." }, guarantorStatus: "GUARANTOR" },
  matthews: { entityClasses: ["BORROWER"], incurringEntity: { id: "matw-borrower", name: "Matthews International Corporation (Borrower)" }, guarantorStatus: "GUARANTOR" },
};

/** Builds a real SolverNativeCompanyContext for any company - see this module's header comment for why the small lookup table above is a generalized default, not company branching. */
export async function buildSolverContext(companyId: string, asOfDate: Date): Promise<SolverNativeCompanyContext> {
  const staticData = await loadCompanySolverStaticData(prisma, companyId, asOfDate);
  const entityDefaults = SOLVER_CONTEXT_ENTITY_DEFAULTS[companyId] ?? {
    entityClasses: ["BORROWER"] as EntityClass[],
    incurringEntity: { id: `${companyId}-borrower`, name: companyId },
    guarantorStatus: "GUARANTOR" as GuarantorStatus,
  };
  const activationState: ActivationState = { asOfDate, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() };
  return {
    ...staticData,
    activationState,
    asOfDate,
    ...entityDefaults,
    collateralPools: [],
    requestedLienPriority: [],
  };
}

// ---------------------------------------------------------------------------
// §E/§F/§I - Overview / Capital Structure / Capacity dashboard
// ---------------------------------------------------------------------------

export interface CapacityBySide {
  secured: PostTransactionCapacitySimulation;
  unsecured: PostTransactionCapacitySimulation;
}

export interface LegalReviewSummary {
  goldenTestsTotal: number;
  goldenTestsVerified: number;
  permissionsTotal: number;
  permissionsVerified: number;
}

export interface DocumentSummary {
  id: string;
  name: string;
  type: string;
  governs: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

export interface CompanyDashboard {
  company: CompanySummary;
  asOfDate: Date;
  financialPosition: FinancialPosition;
  capacity: CapacityBySide;
  documents: DocumentSummary[];
  legalReview: LegalReviewSummary;
}

/**
 * Resolves the "as of" date to use when a caller doesn't supply one
 * explicitly: the company's OWN latest `FinancialState.asOfDate`, never
 * wall-clock "now." Using "now" would let `loadDebtEvents`'s replay window
 * (lib/financial-core/capital-structure.ts `computeOutstandingPrincipal`)
 * run past the FinancialState snapshot's own balance-sheet-facts date - a
 * genuine issue this surfaced for Matthews, whose only FinancialState is
 * dated 2024-12-31 but which also has a real, later DebtEvent (the January
 * 2026 Second Lien Notes redemption, docs/matthews-international-onboarding.md
 * golden row 14): querying "as of today" would silently blend a stale
 * 2024-12-31 cash/EBITDA snapshot with a debt structure replayed through
 * today, understating gross debt against every OTHER balance-sheet fact
 * still frozen at the older date. Anchoring to the state's own date instead
 * produces one internally-consistent "as of [reporting date]" position - the
 * same convention a 10-Q/10-K balance sheet uses - and is itself generalized
 * (queries whichever company's latest state, never a hardcoded date).
 */
async function resolveDefaultAsOfDate(companyId: string): Promise<Date> {
  const latest = await prisma.financialState.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } });
  return latest?.asOfDate ?? new Date();
}

/**
 * The Overview/Capital Structure/Liquidity/Maturity/Capacity pages' single
 * data source. Composes:
 *  - `getFinancialPosition` (lib/financial-core) for every generic financial
 *    metric - cash, debt, leverage, coverage, liquidity, maturities.
 *  - `computeRemainingCapacityAfterDebtIncurrence(..., amount: 0, ...)`
 *    (lib/covenant-engine.ts) for CURRENT contractual capacity by side - the
 *    SAME real post-transaction-recomputation function the Simulate workflow
 *    uses (task hard requirement §3: never `preMax - amount` in a
 *    component), evaluated at amount=0 so "post a $0 transaction" IS "the
 *    current state," not a special-cased duplicate code path.
 * Never computes a dollar figure itself - every number already exists on the
 * objects these engines return.
 */
export async function getCompanyDashboard(companyId: string, asOfDateParam?: Date): Promise<CompanyDashboard> {
  const asOfDate = asOfDateParam ?? (await resolveDefaultAsOfDate(companyId));
  const [company, fcData, covenantData, documents, goldenCounts, permissionCounts] = await Promise.all([
    getCompanySummary(companyId),
    loadCompanyFinancialCoreData(prisma, companyId, asOfDate),
    loadCompanyCovenantData(prisma, companyId, asOfDate),
    prisma.document.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    prisma.goldenTest.groupBy({ by: ["status"], where: { companyId }, _count: true }),
    prisma.permission.groupBy({ by: ["reviewStatus"], where: { companyId }, _count: true }),
  ]);

  const financialPosition = getFinancialPosition(fcData.state, fcData.facilities, fcData.events, asOfDate, []);

  const position = computeCovenantPosition(covenantData);
  const solverContext = await buildSolverContext(companyId, asOfDate);
  const [secured, unsecured] = await Promise.all([
    Promise.resolve(computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, true, solverContext)),
    Promise.resolve(computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, false, solverContext)),
  ]);

  const goldenTestsTotal = goldenCounts.reduce((s, g) => s + g._count, 0);
  const goldenTestsVerified = goldenCounts.filter((g) => hasCompletedQualifiedLegalReview(g.status)).reduce((s, g) => s + g._count, 0);
  const permissionsTotal = permissionCounts.reduce((s, p) => s + p._count, 0);
  const permissionsVerified = permissionCounts.filter((p) => hasCompletedQualifiedLegalReview(p.reviewStatus)).reduce((s, p) => s + p._count, 0);

  return {
    company,
    asOfDate,
    financialPosition,
    capacity: { secured, unsecured },
    documents: documents.map((d) => ({ id: d.id, name: d.name, type: d.type, governs: d.governs, effectiveFrom: d.effectiveFrom, effectiveTo: d.effectiveTo })),
    legalReview: { goldenTestsTotal, goldenTestsVerified, permissionsTotal, permissionsVerified },
  };
}

// ---------------------------------------------------------------------------
// §J/§K/§L/§M - Simulate workflow (read-only inputs + pure scenario runner)
// ---------------------------------------------------------------------------

/**
 * Loads everything the Simulate page's client component needs to run a
 * hypothetical transaction WITHOUT any further DB access (task hard
 * requirement §6 - read-only scenarios). Every field here is read-only data;
 * nothing in this function or `runScenarioWithInputs` (lib/scenario-runner.ts,
 * a separate, `@prisma/client`-free module so the Simulate page's client
 * component can call it directly without pulling Prisma into the browser
 * bundle) writes to the database.
 */
export async function getScenarioInputs(companyId: string, asOfDateParam?: Date): Promise<ScenarioInputs> {
  const asOfDate = asOfDateParam ?? (await resolveDefaultAsOfDate(companyId));
  const [fcData, covenantData, solverContext] = await Promise.all([
    loadCompanyFinancialCoreData(prisma, companyId, asOfDate),
    loadCompanyCovenantData(prisma, companyId, asOfDate),
    buildSolverContext(companyId, asOfDate),
  ]);
  const covenantPosition = computeCovenantPosition(covenantData);
  return { companyId, asOfDate, financialState: fcData.state, facilities: fcData.facilities, events: fcData.events, covenantData, covenantPosition, solverContext };
}

/** Async convenience combining `getScenarioInputs` + `runScenarioWithInputs` in one call, for a server context (tests, a server action) that has no already-loaded inputs to reuse. Still performs no writes - `getScenarioInputs` is exclusively reads. */
export async function runCompanyScenario(companyId: string, actions: ScenarioAction[], asOfDate?: Date): Promise<ScenarioResult> {
  const inputs = await getScenarioInputs(companyId, asOfDate);
  return runScenarioWithInputs(inputs, actions);
}

// ---------------------------------------------------------------------------
// Documents/Sources page aggregation
// ---------------------------------------------------------------------------

export interface DocumentDetail extends DocumentSummary {
  provisionCount: number;
  permissionCount: number;
  permissionsVerified: number;
}

/**
 * Documents/Sources page's data source - per-document provision/permission
 * counts and review-state breakdown, aggregated here so the page performs no
 * counting itself. Document/Permission/CovenantProvision rows are not
 * currently effective-dated by amendment version in a way this listing needs
 * to filter further, so (unlike the rest of this module) no asOfDate
 * parameter is threaded through here.
 */
export async function getDocumentDetails(companyId: string): Promise<DocumentDetail[]> {
  const [documents, provisions, permissions] = await Promise.all([
    prisma.document.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    prisma.covenantProvision.findMany({ where: { companyId } }),
    prisma.permission.findMany({ where: { companyId } }),
  ]);
  return documents.map((d) => {
    const docPermissions = permissions.filter((p) => p.documentId === d.id);
    return {
      id: d.id,
      name: d.name,
      type: d.type,
      governs: d.governs,
      effectiveFrom: d.effectiveFrom,
      effectiveTo: d.effectiveTo,
      provisionCount: provisions.filter((p) => p.documentId === d.id).length,
      permissionCount: docPermissions.length,
      permissionsVerified: docPermissions.filter((p) => hasCompletedQualifiedLegalReview(p.reviewStatus)).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Re-exports for convenient single-import use by app/** pages.
// ---------------------------------------------------------------------------
export { evaluateContractualCapacity, projectToLegacySnapshot };
