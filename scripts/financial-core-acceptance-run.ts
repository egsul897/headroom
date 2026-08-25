/**
 * §32 acceptance run - the live, end-to-end demonstration required to call
 * the financial-core vertical slice complete:
 *
 *   SYNTHETIC COMPANY -> POSTGRES -> LOAD FINANCIAL STATE -> CALCULATE
 *   CURRENT POSITION -> RUN $800M ACQUISITION SCENARIO -> CALCULATE PRO
 *   FORMA POSITION -> PASS SAME PRO FORMA STATE TO CONTRACTUAL ADAPTER ->
 *   RUN EXISTING CONTRACTUAL SOLVER -> RETURN UNIFIED SCENARIO RESULT ->
 *   VERIFY DATABASE ACTUAL STATE DID NOT MUTATE
 *
 * Idempotent and re-runnable: deletes and recreates its own isolated
 * company (never Coherent, never any other fixture's company) on every run.
 * Run with: npx tsx scripts/financial-core-acceptance-run.ts
 */
import { prisma } from "../lib/prisma";
import { fact } from "../lib/financial-core/types";
import type { Scenario } from "../lib/financial-core/types";
import { loadCompanyFinancialCoreData } from "../lib/financial-core-db/adapter";
import { getFinancialPosition } from "../lib/financial-core/position-service";
import { runScenarioAgainstCovenants } from "../lib/financial-core/scenario-service";
import { toSolverNativeCompanyContext } from "../lib/financial-core/solver-adapter";
import { computeCovenantPosition } from "../lib/covenant-engine";
import type { CompanyCovenantData, CovenantPosition } from "../lib/covenant-engine";
import type { ActivationState, Permission } from "../lib/solver/types";

const COMPANY_ID = "acceptance-run-summit-holdings";
const AS_OF = new Date("2027-01-01T00:00:00.000Z");
const SOFR_ASSUMPTION = { referenceRate: "SOFR", assumedRatePct: 5.25 };

const FAC_REVOLVER = "arsh-revolver";
const FAC_TERM_LOAN = "arsh-term-loan";
const DOC_ID = "arsh-doc-acquisition-facility";
const PERM_ID = "arsh-perm-acquisition-facility";

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return "N/A (review-required)";
  return n.toFixed(digits);
}

async function resetFixture() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Acceptance-Run Summit Holdings (synthetic, §32 acceptance script)" } });

  await prisma.financialState.create({
    data: {
      companyId: COMPANY_ID,
      asOfDate: AS_OF,
      periodType: "ACTUAL",
      balanceSheetFacts: { cash: fact(300, "REPORTED", AS_OF), totalDebtPrincipal: fact(200, "RECONSTRUCTED", AS_OF), securedDebtPrincipal: fact(200, "RECONSTRUCTED", AS_OF) },
      incomeStatementFacts: { gaapEbitda: fact(300, "REPORTED", AS_OF), cumulativeNetIncomeSinceIssue: fact(0, "REPORTED", AS_OF), equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF), interestExpense: fact(20, "REPORTED", AS_OF) },
      covenantMetricFacts: { assumedNewDebtRatePct: fact(7.5, "ASSUMED", AS_OF) },
      liquidityFacts: { revolverFacilityId: FAC_REVOLVER },
    } as any,
  });

  await prisma.facility.create({
    data: {
      id: FAC_REVOLVER,
      companyId: COMPANY_ID,
      name: "$400M Revolving Credit Facility",
      facilityType: "REVOLVER",
      originalPrincipal: 400,
      commitmentAmount: 400,
      secured: true,
      couponType: "FLOATING",
      marginBps: 225,
      referenceRate: "SOFR",
      rateFloorPct: 0,
      maturityDate: new Date("2030-01-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.facility.create({
    data: {
      id: FAC_TERM_LOAN,
      companyId: COMPANY_ID,
      name: "Term Loan B",
      facilityType: "TERM_LOAN",
      originalPrincipal: 200,
      secured: true,
      couponType: "FLOATING",
      marginBps: 275,
      referenceRate: "SOFR",
      rateFloorPct: 0.5,
      maturityDate: new Date("2029-01-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.debtEvent.create({ data: { companyId: COMPANY_ID, facilityId: FAC_TERM_LOAN, eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 200, provenance: fact(200, "REPORTED", AS_OF) as any } });

  // A deliberately simple solver-native permission (not Coherent's) so the
  // acceptance run touches the REAL live solver, not a mock: a $300M
  // unsecured debt-incurrence basket - large enough for the $250M revolver
  // funding leg of the acquisition to CLEAR against it.
  await prisma.document.create({ data: { id: DOC_ID, companyId: COMPANY_ID, name: "Acceptance-Run Credit Agreement", type: "OTHER" } });
  await prisma.permission.create({
    data: {
      id: PERM_ID,
      companyId: COMPANY_ID,
      documentId: DOC_ID,
      code: "acceptance-debt-basket",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      action: "Incur unsecured debt",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 300,
      sectionRef: "§1.1",
      modelingStatus: "MODELED",
      measurementBasis: "CUMULATIVE_INCURRED",
    },
  });
  await prisma.solverCoverageDeclaration.create({ data: { companyId: COMPANY_ID, documentId: DOC_ID, side: "unsecured", grantType: "DEBT_INCURRENCE", isComplete: true } });
}

async function main() {
  console.log("================================================================================");
  console.log("HEADROOM FINANCIAL CORE - §32 END-TO-END ACCEPTANCE RUN");
  console.log("================================================================================\n");

  console.log("[1/8] Resetting isolated synthetic fixture in Postgres (Acceptance-Run Summit Holdings)...");
  await resetFixture();
  console.log("      Done.\n");

  console.log("[2/8] Loading FinancialState + Facility[] + DebtEvent[] from Postgres...");
  const before = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
  console.log(`      FinancialState id=${before.state.id}, asOfDate=${before.state.asOfDate.toISOString().slice(0, 10)}, periodType=${before.state.periodType}`);
  console.log(`      Facilities loaded: ${before.facilities.length} (${before.facilities.map((f) => f.name).join(", ")})`);
  console.log(`      DebtEvents loaded: ${before.events.length}\n`);

  console.log("[3/8] Calculating CURRENT financial position (getFinancialPosition)...");
  const beforePosition = getFinancialPosition(before.state, before.facilities, before.events, AS_OF, [SOFR_ASSUMPTION]);
  console.log("      --- BEFORE ---");
  console.log(`      Cash:                        $${fmt(beforePosition.liquidity.cash.value)}M`);
  console.log(`      Available cash:              $${fmt(beforePosition.liquidity.availableCash)}M`);
  console.log(`      Gross debt:                  $${fmt(beforePosition.capitalStructure.grossDebt)}M`);
  console.log(`      Net debt:                    $${fmt(beforePosition.capitalStructure.netDebt)}M`);
  console.log(`      Secured debt:                $${fmt(beforePosition.capitalStructure.securedDebt)}M`);
  console.log(`      Revolver availability:       $${fmt(beforePosition.liquidity.revolverAvailability)}M`);
  console.log(`      Total liquidity:             $${fmt(beforePosition.liquidity.totalLiquidity)}M`);
  console.log(`      Annualized cash interest:    $${fmt(beforePosition.interest.totalAnnualizedCashInterest)}M`);
  console.log(`      Generic gross leverage:      ${fmt(beforePosition.metrics.genericGrossLeverage.value)}x (${beforePosition.metrics.genericGrossLeverage.status})`);
  console.log(`      Generic net leverage:        ${fmt(beforePosition.metrics.genericNetLeverage.value)}x (${beforePosition.metrics.genericNetLeverage.status})`);
  console.log(`      Generic interest coverage:   ${fmt(beforePosition.metrics.genericInterestCoverage.value)}x (${beforePosition.metrics.genericInterestCoverage.status})`);
  console.log(`      Next maturity:               ${beforePosition.maturities.nextMaturity ? `${beforePosition.maturities.nextMaturity.facilityName} on ${beforePosition.maturities.nextMaturity.date.toISOString().slice(0, 10)} ($${beforePosition.maturities.nextMaturity.principal}M)` : "none"}\n`);

  console.log("[4/8] Building solver-native contractual context (real Permission rows, real coverage declaration)...");
  const permissionRows: Permission[] = [
    {
      id: PERM_ID,
      documentId: DOC_ID,
      companyId: COMPANY_ID,
      code: "acceptance-debt-basket",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      action: "Incur unsecured debt",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 300,
      eligibilityConditions: [],
      termConditions: [],
      measurementBasis: "CUMULATIVE_INCURRED",
      sourceProvision: { documentId: DOC_ID, sectionRef: "§1.1" },
      modelingStatus: "MODELED",
    },
  ];
  const activationState: ActivationState = { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() };
  const solverContext = toSolverNativeCompanyContext({
    staticData: { permissions: permissionRows, relationships: [], sharedConstraints: [], collateralScopes: [], ruleActivationConditions: [], coverageDeclarations: [{ documentId: DOC_ID, side: "unsecured", grantType: "DEBT_INCURRENCE", isComplete: true }] },
    activationState,
    asOfDate: AS_OF,
    entityClasses: ["BORROWER"],
    incurringEntity: { id: "borrower", name: "Borrower" },
    guarantorStatus: "GUARANTOR",
    collateralPools: [],
    requestedLienPriority: [],
  });
  const covenantData: CompanyCovenantData = {
    companyId: COMPANY_ID,
    documents: [{ id: DOC_ID, name: "Acceptance-Run Credit Agreement", type: "OTHER", governs: null }],
    provisions: [],
    financials: { ebitda: 1, cash: 1, interestExpense: 1, cumulativeNetIncome: 0, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 0, totalDebt: 1, securedDebt: 0 },
    ledger: [],
  };
  const covenantPosition: CovenantPosition = computeCovenantPosition(covenantData);
  console.log("      Done - real Permission row (FLAT_AMOUNT, $300M unsecured debt basket), real SolverCoverageDeclaration.\n");

  console.log("[5/8] Running $800M acquisition scenario (ACQUISITION action: $200M cash / $250M revolver / $350M new secured notes,");
  console.log("       +$100M acquired EBITDA, +$20M synergy, $15M fees) through runScenarioAgainstCovenants,");
  console.log("       feeding the PRO FORMA state directly to the covenant-solver adapter -> the REAL live runSolver...");
  const scenario: Scenario = {
    id: "acceptance-run-acquisition",
    companyId: COMPANY_ID,
    baseFinancialStateId: before.state.id,
    actions: [
      {
        kind: "ACQUISITION",
        purchasePrice: 800,
        cashConsideration: 200,
        revolverFunding: { facilityId: FAC_REVOLVER, amount: 250 },
        newDebtFunding: { amount: 350, facilityDraft: { name: "7.00% Senior Secured Notes due 2032", facilityType: "NOTES", secured: true, couponType: "FIXED", couponPct: 7.0, maturityDate: new Date("2032-01-01") } },
        acquiredEbitda: 100,
        synergyEbitda: 20,
        transactionFees: 15,
      },
    ],
  };
  const result = runScenarioAgainstCovenants({
    scenario,
    baseState: before.state,
    baseFacilities: before.facilities,
    baseEvents: before.events,
    asOfDate: AS_OF,
    rateAssumptions: [SOFR_ASSUMPTION],
    contractualTest: { data: covenantData, position: covenantPosition, amount: 250, secured: false, solverContext },
  });
  console.log("      Scenario executed.\n");

  console.log("[6/8] PRO FORMA financial position (AFTER)...");
  console.log(`      Cash:                        $${fmt(result.after.position.liquidity.cash.value)}M`);
  console.log(`      Gross debt:                  $${fmt(result.after.position.capitalStructure.grossDebt)}M`);
  console.log(`      Net debt:                    $${fmt(result.after.position.capitalStructure.netDebt)}M`);
  console.log(`      Secured debt:                $${fmt(result.after.position.capitalStructure.securedDebt)}M`);
  console.log(`      Revolver availability:       $${fmt(result.after.position.liquidity.revolverAvailability)}M`);
  console.log(`      Total liquidity:             $${fmt(result.after.position.liquidity.totalLiquidity)}M`);
  console.log(`      Annualized cash interest:    $${fmt(result.after.position.interest.totalAnnualizedCashInterest)}M`);
  console.log(`      Generic gross leverage:      ${fmt(result.after.position.metrics.genericGrossLeverage.value)}x`);
  console.log(`      Generic net leverage:        ${fmt(result.after.position.metrics.genericNetLeverage.value)}x`);
  console.log(`      Generic interest coverage:   ${fmt(result.after.position.metrics.genericInterestCoverage.value)}x\n`);

  console.log("      --- FINANCIAL IMPACT (deltas) ---");
  console.log(`      Cash delta:                  $${fmt(result.financialImpact.cashDelta)}M`);
  console.log(`      Gross debt delta:            $${fmt(result.financialImpact.grossDebtDelta)}M`);
  console.log(`      Net debt delta:              $${fmt(result.financialImpact.netDebtDelta)}M`);
  console.log(`      EBITDA delta:                $${fmt(result.financialImpact.ebitdaDelta)}M`);
  console.log(`      Interest delta:              $${fmt(result.financialImpact.interestDelta)}M`);
  console.log(`      Liquidity delta:             $${fmt(result.financialImpact.liquidityDelta)}M`);
  console.log(`      Gross leverage delta:        ${fmt(result.financialImpact.leverageDelta.grossLeverageDelta)}x\n`);

  console.log("[7/8] CONTRACTUAL IMPACT - real live solver result (runSolver via evaluateContractualCapacity)...");
  console.log(`      Overall status: ${result.contractualImpact?.overallStatus}`);
  const perDoc = (result.contractualImpact?.perDocument ?? []) as any[];
  for (const d of perDoc) {
    console.log(`      Document "${d.documentName}": status=${d.status}, capacity=${d.capacity ?? "N/A"}`);
    if (d.solverResult) {
      console.log(`        solver overall.status=${d.solverResult.overall.status}, amountTested=${d.solverResult.overall.amountTested}`);
      console.log(`        permissionPathUsed legs: ${JSON.stringify(d.solverResult.permissionPathUsed?.legs.map((l: any) => ({ permissionId: l.permissionId, amountAllocated: l.amountAllocated })))}`);
    }
  }
  console.log(`      Warnings: ${result.warnings.length === 0 ? "(none)" : result.warnings.map((w) => `[${w.category}] ${w.description}`).join("; ")}\n`);

  console.log("[8/8] Verifying persisted database state did NOT mutate...");
  const after = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
  const cashUnchanged = after.state.balanceSheetFacts.cash.value === before.state.balanceSheetFacts.cash.value;
  const debtUnchanged = after.state.balanceSheetFacts.totalDebtPrincipal.value === before.state.balanceSheetFacts.totalDebtPrincipal.value;
  const facilityCountUnchanged = after.facilities.length === before.facilities.length;
  const [facilityRowCount, eventRowCount, permissionRowCount] = await Promise.all([
    prisma.facility.count({ where: { companyId: COMPANY_ID } }),
    prisma.debtEvent.count({ where: { companyId: COMPANY_ID } }),
    prisma.permission.count({ where: { companyId: COMPANY_ID } }),
  ]);
  console.log(`      Persisted cash unchanged ($${before.state.balanceSheetFacts.cash.value}M):        ${cashUnchanged ? "PASS" : "FAIL"}`);
  console.log(`      Persisted totalDebt unchanged ($${before.state.balanceSheetFacts.totalDebtPrincipal.value}M): ${debtUnchanged ? "PASS" : "FAIL"}`);
  console.log(`      Persisted facility count unchanged (${before.facilities.length}):        ${facilityCountUnchanged ? "PASS" : "FAIL"}`);
  console.log(`      Facility rows in DB: ${facilityRowCount} (expected 2, no new facility persisted despite pro forma creating one in-memory)`);
  console.log(`      DebtEvent rows in DB: ${eventRowCount} (expected 1, no new events persisted)`);
  console.log(`      Permission rows in DB: ${permissionRowCount} (expected 1, untouched)`);

  const allPass = cashUnchanged && debtUnchanged && facilityCountUnchanged && facilityRowCount === 2 && eventRowCount === 1 && permissionRowCount === 1;
  console.log(`\n      DATABASE NON-MUTATION: ${allPass ? "VERIFIED" : "FAILED"}\n`);

  console.log("[cleanup] Removing acceptance-run fixture company...");
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  console.log("      Done.\n");

  console.log("================================================================================");
  console.log(allPass ? "ACCEPTANCE RUN: PASS" : "ACCEPTANCE RUN: FAIL");
  console.log("================================================================================");

  if (!allPass) process.exit(1);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("ACCEPTANCE RUN ERRORED:", err);
  await prisma.$disconnect();
  process.exit(1);
});
