/**
 * Coherent — financial-core population (FinancialState / Facility / DebtEvent).
 *
 * Phase 10 finding: Coherent has NEVER been populated into the financial-core
 * schema (lib/financial-core/**, prisma FinancialState/Facility/DebtEvent
 * models) - only into the legacy covenant-engine schema
 * (FinancialSnapshot/DebtTranche/LedgerEntry, lib/covenant-engine.ts) that
 * predates the financial-core module. Matthews (scripts/populate-matthews-
 * financial-provenance.ts) is the only company ever wired into financial-core.
 * Without this script, Overview/Capital Structure/Liquidity/Maturity Analytics
 * (all built on `getFinancialPosition`, lib/financial-core/position-service.ts)
 * cannot render for Coherent at all - `loadCompanyFinancialCoreData` throws
 * "No FinancialState found."
 *
 * ============================================================================
 * NOT NEW FINANCIAL/LEGAL RESEARCH - RE-EXPRESSION OF ALREADY-MODELED FACTS
 * ============================================================================
 * Every figure below is copied VERBATIM from Coherent's existing, already-
 * reviewed FinancialSnapshot (id cmt7vicvm000vj1d3643au0nq, asOfDate
 * 2026-06-30) and its 4 DebtTranche rows - re-expressed in the financial-core
 * schema's shape, never re-derived or newly estimated. Covenant EBITDA
 * (1700) is the SAME externalInputRecord already on file
 * (coh-eir-covenant-ebitda-public-filing-reconstruction, PUBLIC_FILING_
 * RECONSTRUCTION, per docs/legal-review-status-model.md §5's permanent
 * classification for this fixture) - this script does not create a second,
 * independent EBITDA figure.
 *
 * `gaapEbitda` (financial-core's `IncomeStatementFacts.gaapEbitda`, a field
 * the architecture requires be DISTINCT from covenant-defined EBITDA) is
 * deliberately left UNSET here: Coherent's legacy FinancialSnapshot only ever
 * recorded ONE ebitda figure (the covenant-defined build-up, per the
 * external-input record's own text) - inventing a second, separately-
 * reconciled "GAAP EBITDA" figure that was never modeled would be
 * fabrication. `genericGrossLeverage`/`genericNetLeverage`/etc.
 * (lib/financial-core/metrics.ts) fall back to `covenantEbitda` when
 * `gaapEbitda` is absent (confirmed by reading that file before writing this
 * script) - so this omission does not silently zero out the Overview page;
 * it is honestly reflected wherever the UI distinguishes "GAAP EBITDA" from
 * "Covenant EBITDA" (Coherent will show only the latter).
 *
 * Facility maturity dates: DebtTranche only ever recorded a NAME ("Term Loan
 * A due 2030", "Term Loan B-3 due 2029") - the exact month/day was never
 * modeled anywhere in this repository. Rather than fabricate a day,
 * `maturityDate` is left UNSET for the two term loans (they will be
 * correctly excluded from Maturity Analytics' dated wall, not silently
 * assigned a wrong date - task's own "never fabricate" rule). The Notes'
 * exact issue date (2021-12-10) IS independently confirmed
 * (docs/coherent-phase1-stacking-table.md's own primary-source read of the
 * Indenture's own dateline) and is used; its exact maturity DAY within 2029
 * was likewise never independently confirmed and is left unset for the same
 * reason - only the year ("due 2029") is confirmed.
 *
 * DebtEvent convention: each facility's outstanding balance is recorded as a
 * SINGLE representative ISSUANCE event dated at the snapshot's own asOfDate
 * (2026-06-30) for TLA/TLB-3/Other (issuance history not independently
 * reconstructed), or at the Notes' own confirmed Indenture date (2021-12-10)
 * for the Notes - the EXACT SAME convention scripts/populate-matthews-
 * financial-provenance.ts already established for Matthews' revolver
 * ("drawn balance ... modeled as a single representative ISSUANCE event
 * rather than the full multi-year draw/repay history").
 *
 * Idempotent (delete-then-recreate by companyId, like the Matthews script).
 * Touches ONLY FinancialState/Facility/DebtEvent rows for companyId
 * "coherent" - never any Permission/PermissionRelationship/GoldenTest/
 * CovenantProvision/FinancialSnapshot/DebtTranche row (the legacy tables stay
 * exactly as they are; this is a pure ADDITION of the financial-core
 * representation alongside them, not a migration or replacement).
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMPANY_ID = "coherent";
const CA_ID = "coherent-credit-agreement-2022";
const IND_ID = "coherent-2029-notes-indenture";
const AS_OF = new Date("2026-06-30");
const NOTES_ISSUE_DATE = new Date("2021-12-10");

function asJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function fact(value: number, sourceType: "REPORTED" | "RECONSTRUCTED" | "ASSUMED" | "EXTERNAL_CERTIFICATE", notes?: string) {
  return { value, sourceType, reviewStatus: "UNVERIFIED" as const, asOfDate: AS_OF.toISOString(), notes };
}

async function main() {
  console.log("== Coherent — financial-core population ==\n");

  await prisma.debtEvent.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.facility.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.financialState.deleteMany({ where: { companyId: COMPANY_ID } });

  const SOURCE = "Re-expressed verbatim from FinancialSnapshot cmt7vicvm000vj1d3643au0nq (FY2026 10-K, filed 2026-08-14, fiscal year ended 2026-06-30) - see that snapshot's own `notes` and coh-eir-covenant-ebitda-public-filing-reconstruction for the underlying source/methodology. Not independently re-derived by this script.";

  const state = await prisma.financialState.create({
    data: {
      companyId: COMPANY_ID,
      asOfDate: AS_OF,
      periodType: "ACTUAL",
      scope: "CONSOLIDATED",
      balanceSheetFacts: asJson({
        cash: fact(1162, "REPORTED", SOURCE),
        totalDebtPrincipal: fact(3258, "REPORTED", SOURCE),
        securedDebtPrincipal: fact(2221, "REPORTED", SOURCE),
      }),
      incomeStatementFacts: asJson({
        // gaapEbitda deliberately omitted - see script header.
        cumulativeNetIncomeSinceIssue: fact(520, "REPORTED", SOURCE),
        equityProceedsSinceIssue: fact(2150, "REPORTED", SOURCE),
        interestExpense: fact(190, "REPORTED", SOURCE),
      }),
      covenantMetricFacts: asJson({
        covenantEbitda: {
          value: 1700,
          addbacks: [],
          provenance: fact(1700, "RECONSTRUCTED", "Same figure as coh-eir-covenant-ebitda-public-filing-reconstruction (PUBLIC_FILING_RECONSTRUCTION, permanent for this fixture per docs/legal-review-status-model.md §5) - not re-derived here."),
        },
        assumedNewDebtRatePct: fact(6.5, "ASSUMED", SOURCE),
      }),
      notes: "Re-expression of Coherent's existing legacy FinancialSnapshot (id cmt7vicvm000vj1d3643au0nq) in the financial-core schema - see scripts/populate-coherent-financial-core.ts header for the full disclosure of what was and was not fabricated.",
    },
  });

  const tla = await prisma.facility.create({
    data: {
      id: "coh-facility-tla-2030",
      companyId: COMPANY_ID,
      name: "Term Loan A due 2030",
      facilityType: "TERM_LOAN",
      currency: "USD",
      originalPrincipal: 1141,
      secured: true,
      couponType: "FLOATING",
      governingDocumentId: CA_ID,
      obligorEntityClasses: ["BORROWER"],
      guarantorEntityClasses: ["GUARANTOR_RS"],
      collateralPoolIds: ["coh-pool-ca-general"],
      originatingPermissionIds: [],
      // maturityDate intentionally unset - see script header (year only, "due 2030," confirmed; exact day never modeled).
    },
  });

  const tlb3 = await prisma.facility.create({
    data: {
      id: "coh-facility-tlb3-2029",
      companyId: COMPANY_ID,
      name: "Term Loan B-3 due 2029",
      facilityType: "TERM_LOAN",
      currency: "USD",
      originalPrincipal: 1080,
      secured: true,
      couponType: "FLOATING",
      governingDocumentId: CA_ID,
      obligorEntityClasses: ["BORROWER"],
      guarantorEntityClasses: ["GUARANTOR_RS"],
      collateralPoolIds: ["coh-pool-ca-general"],
      originatingPermissionIds: [],
    },
  });

  const notes = await prisma.facility.create({
    data: {
      id: "coh-facility-2029-notes",
      companyId: COMPANY_ID,
      name: "5.000% Senior Notes due 2029",
      facilityType: "NOTES",
      currency: "USD",
      originalPrincipal: 990,
      secured: false,
      couponType: "FIXED",
      couponPct: 5.0,
      issuedDate: NOTES_ISSUE_DATE,
      governingDocumentId: IND_ID,
      obligorEntityClasses: ["BORROWER"],
      guarantorEntityClasses: ["GUARANTOR_RS"],
      collateralPoolIds: [],
      originatingPermissionIds: [],
      // maturityDate intentionally unset - "due 2029" confirms the year only.
    },
  });

  const other = await prisma.facility.create({
    data: {
      id: "coh-facility-other-subsidiary-debt",
      companyId: COMPANY_ID,
      name: "Other subsidiary debt (June 2026 Facility / local lines / German loan)",
      facilityType: "OTHER",
      currency: "USD",
      originalPrincipal: 47,
      secured: false,
      couponType: "FIXED",
      obligorEntityClasses: ["NON_GUARANTOR_RS", "FOREIGN_RS"],
      guarantorEntityClasses: [],
      collateralPoolIds: [],
      originatingPermissionIds: [],
      // No single governing Document row covers this blended, multi-source
      // balance (per DebtTranche's own "June 2026 Facility / local lines /
      // German loan" description) - governingDocumentId intentionally unset.
    },
  });

  await prisma.debtEvent.createMany({
    data: [
      {
        companyId: COMPANY_ID,
        facilityId: tla.id,
        eventType: "ISSUANCE",
        date: AS_OF,
        amount: 1141,
        provenance: asJson(fact(1141, "REPORTED", `${SOURCE} Single representative ISSUANCE event at the snapshot date - full draw/amendment history not independently reconstructed (same convention as scripts/populate-matthews-financial-provenance.ts's revolver event).`)),
      },
      {
        companyId: COMPANY_ID,
        facilityId: tlb3.id,
        eventType: "ISSUANCE",
        date: AS_OF,
        amount: 1080,
        provenance: asJson(fact(1080, "REPORTED", `${SOURCE} Single representative ISSUANCE event at the snapshot date.`)),
      },
      {
        companyId: COMPANY_ID,
        facilityId: notes.id,
        eventType: "ISSUANCE",
        date: NOTES_ISSUE_DATE,
        amount: 990,
        provenance: asJson(fact(990, "REPORTED", `${SOURCE} Dated at the Indenture's own confirmed dateline (docs/coherent-phase1-stacking-table.md), not the snapshot date - the Notes' issuance date IS independently confirmed, unlike the term loans'.`)),
      },
      {
        companyId: COMPANY_ID,
        facilityId: other.id,
        eventType: "ISSUANCE",
        date: AS_OF,
        amount: 47,
        provenance: asJson(fact(47, "REPORTED", `${SOURCE} Single representative ISSUANCE event at the snapshot date; blended balance across multiple facilities, not independently decomposed.`)),
      },
    ],
  });

  const totalFacilityPrincipal = 1141 + 1080 + 990 + 47;
  if (totalFacilityPrincipal !== 3258) {
    throw new Error(`Facility principal sum (${totalFacilityPrincipal}) does not match the snapshot's totalDebt (3258) - refusing to proceed with an inconsistent population.`);
  }

  console.log(`FinancialState ${state.id} created for ${COMPANY_ID} as of ${AS_OF.toISOString().slice(0, 10)}.`);
  console.log("Facilities:", [tla.id, tlb3.id, notes.id, other.id].join(", "));
  console.log("Facility principal sum matches legacy snapshot totalDebt (3258) - confirmed consistent.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
