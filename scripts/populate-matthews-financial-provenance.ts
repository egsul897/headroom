/**
 * Matthews International (MATW) — financial-core population (FinancialState /
 * Facility / DebtEvent) + golden-question set (GoldenTest, all UNVERIFIED).
 *
 * Mirrors scripts/populate-coherent-ebitda-provenance.ts's pattern for the
 * financial-input side, and constructs the golden-question inventory the
 * task requires — modeled on Coherent's categories but NOT copied: adds
 * questions specific to what's actually new about Matthews' capital
 * structure (first-lien/second-lien priority split, the Intercreditor
 * Agreement's own priority mechanics, and the confirmed January 2026 full
 * redemption of the Second Lien Notes).
 *
 * ============================================================================
 * FINANCIAL-INPUT AUDIT — PUBLIC_FILING_RECONSTRUCTION METHODOLOGY-ORDER
 * DISCLOSURE, STATED UP FRONT (task requirement — not after the fact):
 *
 * Matthews' 10-Q/10-K filings disclose a qualitative "leverage ratio" (total
 * indebtedness / EBITDA "as defined within the domestic credit facility
 * agreement") used only to set the revolver's pricing grid, and state
 * compliance ("The Company was in compliance with all of its debt covenants
 * as of December 31, 2024") — but NEVER disclose a single reconciled dollar
 * EBITDA figure, under either the Credit Agreement's own simple EBIT+D&A
 * definition or the Indenture's much richer "Consolidated EBITDA" defined
 * term (interest + taxes + non-cash items + D&A + run-rate synergies, capped
 * addbacks). Both therefore require PUBLIC_FILING_RECONSTRUCTION.
 *
 * METHODOLOGY ORDER (disclosed plainly, per the task's own instruction): the
 * build-up below was fixed FROM THE INDENTURE'S OWN "Consolidated EBITDA"
 * DEFINED TERM TEXT FIRST (§1.01, fetched and read in full — see
 * docs/matthews-international-onboarding.md §A/§D) — Consolidated Net Income
 * + Consolidated Interest Expense + Consolidated Income Taxes (net of any
 * benefit, per the defined term's own clause (2)) + non-cash expenses/losses
 * excluding D&A + D&A — BEFORE any TTM dollar figure was computed. No target
 * Leverage Ratio, Secured Net Leverage Ratio, or covenant-compliance outcome
 * was in view when the formula was selected; the formula is a direct
 * transcription of the defined term's clauses (1)(a)-(c) and (i), applied
 * only to the specific non-cash items Matthews' own GAAP filings actually
 * disclose (goodwill write-downs, asset write-downs, stock-based
 * compensation — all listed as non-cash add-backs on the face of the
 * Consolidated Statements of Cash Flows) — clause (1)(f)'s discretionary
 * "extraordinary/non-recurring" prong and clause (1)(g)'s run-rate synergy
 * addback are NOT invoked (conservative: no attempt was made to characterize
 * any item as "extraordinary" or to estimate "run-rate" synergies not
 * already disclosed as a discrete GAAP line item).
 *
 * TTM (through 12/31/2024) build-up, all figures in $M, sourced from the
 * FY2024 10-K (accession 0000063296-24-000094, year ended 9/30/2024) plus
 * the Q1 FY2025 10-Q (accession 0000063296-25-000006, quarter ended
 * 12/31/2024) and its own Q1 FY2024 comparative column, TTM = FY2024 + Q1FY25
 * − Q1FY24:
 *   Consolidated Net Income:      -59.660 + (-3.472) - (-2.303) = -60.829
 *   + Interest Expense:            50.534 +   15.682 -   11.576 =  54.640
 *   - Income tax BENEFIT (clause 2): 9.997 +    2.358 -    0.726 =  11.629 (subtracted, not added, per the defined term's own clause (2))
 *   + D&A:                          94.770 +   22.504 -   23.523 =  93.751
 *   + Goodwill write-downs (non-cash, FY2024 only, none disclosed in either Q1): 16.727
 *   + Asset write-downs (non-cash, FY2024 only, none disclosed in either Q1): 16.847
 *   + Stock-based compensation (non-cash):  18.478 +    4.979 -    4.651 =  18.806
 *   = Consolidated EBITDA (Indenture-defined, TTM 12/31/2024):        $128.313M
 *
 * This reconstruction is UNVERIFIED (ExternalInputRecord.reviewStatus) and
 * PUBLIC_FILING_RECONSTRUCTION (ExternalInputKind) — never CERTIFIED_EXTERNAL_INPUT,
 * per the schema's own hard rule (prisma/schema.prisma ExternalInputKind
 * comment). It has NOT been checked against a compliance certificate, which
 * does not exist in this population's source set.
 * ============================================================================
 *
 * Idempotent. Never touches Coherent's rows (companyId scoping throughout).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { MATTHEWS_GOLDEN_TESTS } from "./matthews-golden-tests-data";

const prisma = new PrismaClient();
const COMPANY_ID = "matthews";
const IND_ID = "matw-2027-second-lien-notes-indenture";
const CA_ID = "matw-credit-agreement-2020";
const AS_OF = new Date("2024-12-31");
const REDEMPTION_DATE = new Date("2026-01-22");

function asJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function fact(value: number, sourceType: "REPORTED" | "RECONSTRUCTED" | "ASSUMED" | "EXTERNAL_CERTIFICATE", notes?: string) {
  return { value, sourceType, reviewStatus: "UNVERIFIED" as const, asOfDate: AS_OF.toISOString(), notes };
}


async function main() {
  console.log("== Matthews International (MATW) — financial-core + golden-question population ==\n");

  // -------------------------------------------------------------------------
  // 0. Clean slate
  // -------------------------------------------------------------------------
  await prisma.externalInputRecord.deleteMany({ where: { companyId: COMPANY_ID, OR: [{ financialStateId: { not: null } }, { facilityId: { not: null } }] } });
  await prisma.debtEvent.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.facility.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.financialState.deleteMany({ where: { companyId: COMPANY_ID } });
  // GoldenTest is DELIBERATELY NOT cleared here (see
  // docs/database-replay-safety.md and prisma/seed.ts's matching comment) -
  // it is upserted on `stableKey` below (step 5) instead, so a re-run
  // preserves any status/reviewerNotes a review script has since written,
  // and a fresh database always reconstructs the same 18 stableKeys.

  // -------------------------------------------------------------------------
  // 1. FinancialState (financial-core) — 2024-12-31, Notes genuinely outstanding
  // -------------------------------------------------------------------------
  const state = await prisma.financialState.create({
    data: {
      companyId: COMPANY_ID,
      asOfDate: AS_OF,
      periodType: "ACTUAL",
      scope: "CONSOLIDATED",
      balanceSheetFacts: asJson({
        cash: fact(33.513, "REPORTED", "10-Q accession 0000063296-25-000006, Consolidated Balance Sheet."),
        totalAssets: fact(1791.719, "REPORTED", "Same source, Consolidated Balance Sheet."),
        totalDebtPrincipal: fact(809.211, "REPORTED", "10-Q Note 7, 'Total debt' line (GAAP carrying value, net of unamortized discount/issuance costs)."),
        securedDebtPrincipal: fact(778.882, "RECONSTRUCTED", "Revolving credit facilities ($484.083M, first lien) + 2027 Senior Secured Notes ($294.799M, second lien) per 10-Q Note 7; excludes 'Other borrowings' ($7.869M) and finance lease obligations ($22.460M), not confirmed secured on the Common Collateral pool from primary text — excluded conservatively."),
      }),
      incomeStatementFacts: asJson({
        gaapEbitda: fact(77.675, "RECONSTRUCTED", "TTM GAAP Operating profit + D&A (simple, no non-cash addbacks): TTM Operating profit (-12.323+5.674-9.427=-16.076) + TTM D&A (94.770+22.504-23.523=93.751) = 77.675. Deliberately DISTINCT from covenantMetricFacts.covenantEbitda below (architecture's own 'GAAP vs covenant EBITDA never conflated' rule, lib/financial-core/solver-adapter.ts projectToLegacySnapshot) — this field is never read by the solver boundary; covenantEbitda is."),
        cumulativeNetIncomeSinceIssue: fact(-3.472, "REPORTED", "Q1 FY2025 10-Q net loss ($3.472M), the fiscal quarter containing the Issue Date (9/27/2024) — used as a since-issue-date proxy; the exact 9/27-9/30/2024 stub period was not separately isolated from Q4 FY2024."),
        equityProceedsSinceIssue: fact(0, "REPORTED", "10-Q Consolidated Statement of Cash Flows, financing activities — no equity-issuance line item since the Issue Date."),
        interestExpense: fact(54.640, "RECONSTRUCTED", "TTM: FY2024 $50.534M + Q1FY25 $15.682M - Q1FY24 $11.576M."),
      }),
      covenantMetricFacts: asJson({
        covenantEbitda: {
          value: 128.313,
          addbacks: [
            { label: "Interest expense", amount: 54.64, provenance: fact(54.64, "RECONSTRUCTED") },
            { label: "Income tax (benefit), net — SUBTRACTED per Consolidated EBITDA cl.(2)", amount: -11.629, provenance: fact(-11.629, "RECONSTRUCTED") },
            { label: "Depreciation and amortization", amount: 93.751, provenance: fact(93.751, "RECONSTRUCTED") },
            { label: "Goodwill write-downs (non-cash)", amount: 16.727, provenance: fact(16.727, "REPORTED", "FY2024 10-K Consolidated Statement of Cash Flows.") },
            { label: "Asset write-downs (non-cash)", amount: 16.847, provenance: fact(16.847, "REPORTED", "FY2024 10-K Consolidated Statement of Cash Flows.") },
            { label: "Stock-based compensation (non-cash)", amount: 18.806, provenance: fact(18.806, "RECONSTRUCTED") },
          ],
          provenance: fact(128.313, "RECONSTRUCTED", "Indenture §1.01 'Consolidated EBITDA' defined term, TTM through 12/31/2024 — see this script's header for the full methodology-order disclosure."),
        },
        assumedNewDebtRatePct: fact(8.625, "ASSUMED", "Assumed new-money rate = the 2027 Senior Secured Notes' own coupon — the most recent actual incremental-debt pricing Matthews obtained. A disclosed assumption, not a contractual figure."),
      }),
      liquidityFacts: asJson({
        revolverFacilityId: "matw-facility-revolver",
        revolverCommitment: fact(750, "REPORTED", "10-Q Note 7: '$750,000 senior secured revolving credit facility.'"),
        revolverDrawn: fact(484.083, "REPORTED", "10-Q Note 7, 'Revolving credit facilities' line."),
        revolverLcUsage: fact(0, "ASSUMED", "Not separately disclosed as of 12/31/2024; facility permits up to $75.0M of LC issuance (10-Q Note 7) but no outstanding LC balance was stated — assumed zero, not confirmed."),
      }),
      notes:
        "Pre-redemption fixture (Second Lien Notes genuinely outstanding). 10-Q for the quarter ended 12/31/2024, accession 0000063296-25-000006. Covenant EBITDA is PUBLIC_FILING_RECONSTRUCTION — see this script's header and docs/matthews-international-onboarding.md §D.",
    },
  });

  // -------------------------------------------------------------------------
  // 2. Facilities
  // -------------------------------------------------------------------------
  const revolver = await prisma.facility.create({
    data: {
      id: "matw-facility-revolver",
      companyId: COMPANY_ID,
      name: "Domestic senior secured revolving credit facility (Third A&R Loan Agreement, as amended)",
      facilityType: "REVOLVER",
      currency: "USD",
      originalPrincipal: 750,
      commitmentAmount: 750,
      secured: true,
      couponType: "FLOATING",
      marginBps: 150, // 1.00%-2.00% range; 1.50% at 12/31/2024 per 10-Q Note 7
      referenceRate: "SOFR + 0.10% CSA",
      maturityDate: new Date("2029-01-31"),
      issuedDate: new Date("2020-03-27"),
      governingDocumentId: CA_ID,
      obligorEntityClasses: ["BORROWER"],
      guarantorEntityClasses: ["GUARANTOR_RS"],
      collateralPoolIds: ["matw-pool-common"],
      originatingPermissionIds: [],
    },
  });

  const notesFacility = await prisma.facility.create({
    data: {
      id: "matw-facility-2027-notes",
      companyId: COMPANY_ID,
      name: "8.625% Senior Secured Second Lien Notes due 2027",
      facilityType: "NOTES",
      currency: "USD",
      originalPrincipal: 300,
      secured: true,
      couponType: "FIXED",
      couponPct: 8.625,
      maturityDate: new Date("2027-10-01"),
      issuedDate: new Date("2024-09-27"),
      governingDocumentId: IND_ID,
      obligorEntityClasses: ["BORROWER"],
      guarantorEntityClasses: ["GUARANTOR_RS"],
      collateralPoolIds: ["matw-pool-common"],
      originatingPermissionIds: ["matw-ind-d-notes-fixed"],
    },
  });

  // -------------------------------------------------------------------------
  // 3. DebtEvents — issuance history + the CONFIRMED January 2026 redemption
  //    (8-K filed 2026-01-12, accession 0000063296-26-000006: notice of
  //    redemption of 100% of the $300.0M outstanding Notes, redemption date
  //    January 22, 2026, at 104.313% of principal).
  // -------------------------------------------------------------------------
  await prisma.debtEvent.createMany({
    data: [
      {
        companyId: COMPANY_ID,
        facilityId: revolver.id,
        eventType: "ISSUANCE",
        date: new Date("2024-12-31"),
        amount: 484.083,
        provenance: asJson(fact(484.083, "REPORTED", "10-Q Note 7 — outstanding balance as of 12/31/2024 (facility originated 2020, amended through the Sixth Amendment; drawn balance as of the anchor date modeled as a single representative ISSUANCE event rather than the full multi-year draw/repay history, which was not independently reconstructed in this pass).")),
      },
      {
        companyId: COMPANY_ID,
        facilityId: notesFacility.id,
        eventType: "ISSUANCE",
        date: new Date("2024-09-27"),
        amount: 300,
        relatedPermissionIds: ["matw-ind-d-notes-fixed"],
        provenance: asJson(fact(300, "REPORTED", "8-K filed 2024-09-30, accession 0001193125-24-228450, Item 1.01: '$300,000,000 aggregate principal amount of 8.625% Senior Secured Second Lien Notes due 2027.'")),
      },
      {
        companyId: COMPANY_ID,
        facilityId: notesFacility.id,
        eventType: "REPAYMENT",
        date: REDEMPTION_DATE,
        amount: 300,
        relatedPermissionIds: ["matw-ind-d-notes-fixed"],
        provenance: asJson(
          fact(300, "REPORTED", "8-K filed 2026-01-12, accession 0000063296-26-000006, Item 8.01: notice of redemption of 100% of the outstanding $300,000,000 principal amount, redemption date January 22, 2026, at 104.313% of principal plus accrued interest. CONFIRMED from Matthews' own filing, not assumed from outside characterization.")
        ),
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 4. ExternalInputRecord rows linked to this FinancialState (financial-core
  //    provenance extension — schema.prisma ExternalInputRecord §M.2/§T)
  // -------------------------------------------------------------------------
  await prisma.externalInputRecord.createMany({
    data: [
      {
        companyId: COMPANY_ID,
        kind: "PUBLIC_FILING_RECONSTRUCTION",
        name: "matw-covenant-ebitda-ttm-2024-12-31-fs",
        value: 128.313,
        asOfDate: AS_OF,
        sourceRef: "Indenture §1.01 Consolidated EBITDA def.; FY2024 10-K + Q1 FY2025/FY2024 10-Qs — see script header for full build-up.",
        reviewStatus: "UNVERIFIED",
        maxAgeDays: 120,
        financialStateId: state.id,
        fieldKey: "covenantMetricFacts.covenantEbitda",
      },
      // No CERTIFIED_EXTERNAL_INPUT row is created: Matthews has no certified
      // compliance-certificate source in this population's source set (per
      // ExternalInputKind's own hard rule — see script header).
    ],
  });


  // update deliberately omits status/reviewerNotes (review/reconciliation-
  // script-owned columns), matching prisma/seed.ts's own upsert - see that
  // script's comment for the full rationale.
  for (const test of MATTHEWS_GOLDEN_TESTS) {
    await prisma.goldenTest.upsert({
      where: { stableKey: test.stableKey },
      update: {
        question: test.question,
        queryType: test.queryType,
        queryParams: test.queryParams ? asJson(test.queryParams) : Prisma.DbNull,
        expectedAnswer: test.expectedAnswer,
        tolerance: test.tolerance ?? null,
        bindingProvision: test.bindingProvision,
        bindingDefinedTerms: test.bindingDefinedTerms,
      },
      create: {
        companyId: COMPANY_ID,
        stableKey: test.stableKey,
        question: test.question,
        queryType: test.queryType,
        queryParams: test.queryParams ? asJson(test.queryParams) : Prisma.DbNull,
        expectedAnswer: test.expectedAnswer,
        tolerance: test.tolerance ?? null,
        bindingProvision: test.bindingProvision,
        bindingDefinedTerms: test.bindingDefinedTerms,
        reviewerNotes: test.reviewerNotes,
        status: test.status,
      },
    });
  }

  const goldenCount = await prisma.goldenTest.count({ where: { companyId: COMPANY_ID } });
  const stateCount = await prisma.financialState.count({ where: { companyId: COMPANY_ID } });
  const facilityCount = await prisma.facility.count({ where: { companyId: COMPANY_ID } });
  const eventCount = await prisma.debtEvent.count({ where: { companyId: COMPANY_ID } });
  const eirCount = await prisma.externalInputRecord.count({ where: { companyId: COMPANY_ID } });
  console.log("Population complete:");
  console.log(`  FinancialStates: ${stateCount}`);
  console.log(`  Facilities: ${facilityCount}`);
  console.log(`  DebtEvents: ${eventCount}`);
  console.log(`  ExternalInputRecords: ${eirCount}`);
  console.log(`  GoldenTests: ${goldenCount} (all UNVERIFIED)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
