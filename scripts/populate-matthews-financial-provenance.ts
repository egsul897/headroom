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
  await prisma.goldenTest.deleteMany({ where: { companyId: COMPANY_ID } });

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

  // -------------------------------------------------------------------------
  // 5. Golden questions — all UNVERIFIED. Modeled on Coherent's categories,
  //    NOT copied; includes the three task-specified new categories.
  // -------------------------------------------------------------------------
  await prisma.goldenTest.createMany({
    data: [
      // --- Category: maximum secured/unsecured capacity ---
      {
        companyId: COMPANY_ID,
        question: "What is Matthews' maximum additional secured-debt capacity under the Indenture alone, as of 12/31/2024?",
        queryType: "DOCUMENT_CAPACITY",
        queryParams: { documentId: IND_ID, secured: true },
        expectedAnswer: "631.45",
        tolerance: "1",
        bindingProvision: "ind_permitted_debt_1a_flat",
        bindingDefinedTerms: [],
        reviewerNotes:
          "Live-verified via scripts/matthews-shadow-run.ts binary search: Indenture secured maximum = $631.45M, combining ind_permitted_debt_1a_flat (~$521.12M, cl.(1)(a) flat, net of total secured debt per the FLAT_NET_OF_DEBT imprecision documented in the populate script) + ind_ratio_debt_fccr (~$110.34M, FCCR≥2.00x room); ind_permitted_debt_1b_ratio_secured contributes $0 (already above 3.50x Secured Net Leverage under the PUBLIC_FILING_RECONSTRUCTION EBITDA). NOT executable through scripts/golden-test.ts (legacy-engine-only harness — see doc §G).",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "What is Matthews' maximum additional unsecured-debt capacity under the Indenture alone, as of 12/31/2024?",
        queryType: "DOCUMENT_CAPACITY",
        queryParams: { documentId: IND_ID, secured: false },
        expectedAnswer: "631.45",
        tolerance: "1",
        bindingProvision: "ind_permitted_debt_1a_flat",
        bindingDefinedTerms: [],
        reviewerNotes: "Live-verified — identical to the secured figure: the Indenture's debt-incurrence baskets are not secured/unsecured-differentiated (only lien eligibility differs). See scripts/matthews-shadow-run.ts.",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "What is Matthews' cross-document (Indenture AND Credit Agreement) maximum secured-debt capacity, as of 12/31/2024?",
        queryType: "CROSS_DOCUMENT_CAPACITY",
        queryParams: { secured: true, expectedStatus: "not_tested" },
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "Live-verified as NOT_TESTED (not a number) — the Credit Agreement has NO SolverCoverageDeclaration for DEBT_INCURRENCE at all (confirmed: the CA contains no negative covenant restricting Indebtedness incurrence — Article VI runs §6.01-§6.08 with no 'Indebtedness' section; see populate script header item 1), so the cross-document combination correctly refuses to guess 'unconstrained' rather than fabricating a number. This is the CORRECT, honest engine outcome, not a bug.",
        status: "UNVERIFIED",
      },
      // --- Category: binding document / provision identification ---
      {
        companyId: COMPANY_ID,
        question: "If Matthews incurs $500.0M of new secured debt, which Indenture permission(s) bind?",
        queryType: "DEBT_SIMULATION",
        queryParams: { amount: 500, secured: true, metric: "cleared" },
        expectedAnswer: "1",
        tolerance: "0",
        bindingProvision: "ind_permitted_debt_1a_flat",
        bindingDefinedTerms: ["Consolidated EBITDA"],
        reviewerNotes: "Live-verified: at $500M secured, the winning permission path is ind_permitted_debt_1a_flat (cl.(1)(a) flat/fixed Debt Facilities basket). See scripts/matthews-shadow-run.ts scenario B.",
        status: "UNVERIFIED",
      },
      // --- Category: fixed checkpoint amounts ---
      {
        companyId: COMPANY_ID,
        question: "What is the flat-dollar component of the Indenture's Debt Facilities basket (Permitted Debt cl.(1)(a))?",
        queryType: "PROVISION_CAPACITY",
        queryParams: { documentId: IND_ID, provisionCode: "ind_permitted_debt_1a_flat" },
        expectedAnswer: "521.12",
        tolerance: "1",
        bindingProvision: "ind_permitted_debt_1a_flat",
        bindingDefinedTerms: [],
        reviewerNotes: "$1,300.0M flat cap net of total secured debt outstanding ($778.882M) = $521.118M remaining. See populate script header item 4 for the netOfBasis imprecision this figure carries (understates true remaining capacity).",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "What is the aggregate committed size of Matthews' domestic revolving credit facility under the Credit Agreement, and does it match the Sixth Amendment's own confirmation that this amount is unchanged?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "$750,000,000 — confirmed independently from TWO primary sources: (1) the Sixth Amendment's own recital ('the aggregate principal amount of $750 million available under the Credit Facility remain[s] unchanged'), and (2) the 10-Q's own Note 7 disclosure ('$750,000 senior secured revolving credit facility'). Not a Permission-model query (a facility-size fact, not a covenant capacity question) — represented as a Facility row (matw-facility-revolver.commitmentAmount), not a GoldenTest capacity computation. FLAGGED here for citation completeness only.",
        status: "UNVERIFIED",
      },
      // --- Category: ratio mechanics ---
      {
        companyId: COMPANY_ID,
        question: "Is Matthews' reconstructed pro forma Secured Net Leverage Ratio at or below the Indenture's 3.50x cap (Permitted Debt cl.(1)(b)(x)) as of 12/31/2024?",
        queryType: "PROVISION_CAPACITY",
        queryParams: { documentId: IND_ID, provisionCode: "ind_permitted_debt_1b_ratio_secured" },
        expectedAnswer: "0",
        tolerance: "0.01",
        bindingProvision: "ind_permitted_debt_1b_ratio_secured",
        bindingDefinedTerms: ["Secured Net Leverage Ratio", "Consolidated EBITDA"],
        reviewerNotes:
          "Live-verified: reconstructed Secured Net Leverage = (778.882-33.513)/128.313 ≈ 5.81x, above the 3.50x cap — this ratio prong therefore contributes ZERO incremental capacity (all headroom under the Indenture flows through cl.(1)(a)'s flat component and the FCCR-gated Ratio Debt permission instead). A materially different real EBITDA figure (this one is PUBLIC_FILING_RECONSTRUCTION, UNVERIFIED) could change this conclusion — flagged for review.",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "Is Matthews' reconstructed pro forma Consolidated Fixed Charge Coverage Ratio at or above the Indenture's 2.00x floor for unrestricted Ratio Debt (§4.09(a))?",
        queryType: "LEVERAGE_METRIC",
        queryParams: { metric: "fixedChargeCoverage", bindingProvisionDocumentId: IND_ID, bindingProvisionCode: "ind_ratio_debt_fccr" },
        expectedAnswer: "2.3486",
        tolerance: "0.05",
        bindingProvision: "ind_ratio_debt_fccr",
        bindingDefinedTerms: ["Consolidated Fixed Charge Coverage Ratio", "Consolidated EBITDA"],
        reviewerNotes: "128.313/54.640 ≈ 2.3486x — above the 2.00x floor, contributing ~$110.34M of FCCR-gated Ratio Debt room per the shadow run.",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "Does the Credit Agreement's own §5.14 maintenance Leverage Ratio / Senior Leverage Ratio test function as an INCURRENCE gate the Permission model should represent, or as something else?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "Confirmed structural finding, not modeled as a Permission: §5.14 is a periodic MAINTENANCE covenant (tested quarterly against the Company's actual then-current ratios, defaults are the consequence of breach) rather than an INCURRENCE-conditioned basket (a precondition to a specific transaction). The schema's Permission model represents 'what may be done' (incurrence permissions); a maintenance test is a category mismatch, not a gap in the same sense as the Total-Assets-grower or First-Lien-ratio gaps. Genuinely out of the Permission-model's intended scope, not merely unmodeled.",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "Does the Credit Agreement, standing alone, impose any negative covenant restricting Matthews' incurrence of additional Indebtedness (as distinct from its Liens covenant)?",
        queryType: "DOCUMENT_CAPACITY",
        queryParams: { documentId: CA_ID, secured: false, expectedStatus: "not_tested" },
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "CONFIRMED NO by full-text reading of the Third A&R Loan Agreement's Table of Contents and Article VI body (§6.01 Liens through §6.08 Dividends and Distributions — no 'Indebtedness' section exists at all, in the original 2020 text or as amended by any of the six amendments read). This is a real, cited structural finding, not an engine gap — the CA relies exclusively on maintenance ratios (§5.14) and the Liens covenant (§6.01) to constrain leverage. No SolverCoverageDeclaration exists for CA/DEBT_INCURRENCE; the engine correctly reports NOT_TESTED rather than fabricating 'unlimited.'",
        status: "UNVERIFIED",
      },
      // --- Category: basket sizes ---
      {
        companyId: COMPANY_ID,
        question: "What is the Non-Guarantor Subsidiary sub-cap on Ratio Debt under the Indenture's §4.09(a) proviso?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "Greater of $125.0M or 7.0% of Total Assets ($1,791.719M as of 12/31/2024 -> ~$125.4M) — modeled as SharedCapacityConstraint matw-scc-nonguarantor-ratiodebt at the $125.0M flat floor only (no Total-Assets-percentage grower formula type exists — see populate script header item 5, a legitimate candidate NEW generalized capability, not built). FLAGGED here because golden-test.ts's query vocabulary has no direct SharedCapacityConstraint-introspection query type — an engine/harness limitation, not a legal unknown.",
        status: "UNVERIFIED",
      },
      // --- Category: sequential/ledger behavior ---
      {
        companyId: COMPANY_ID,
        question: "Has any public-record ledger event (equity raise, asset sale, debt repayment) affected Matthews' basket capacity since the anchor date, other than the confirmed January 2026 Notes redemption?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "No LedgerEntry rows populated for Matthews in this pass (Phase 1 debt/liens scope; no RP/Investment/Asset Sale ledger events extracted or in scope). Only the confirmed Notes redemption (DebtEvent REPAYMENT, matw-facility-2027-notes, 2026-01-22) is populated on the financial-core side. A genuine scope limitation of this onboarding pass, documented rather than guessed at.",
        status: "UNVERIFIED",
      },
      // --- NEW category (a): first-lien/second-lien priority split vs. Coherent's flat pari-passu structure ---
      {
        companyId: COMPANY_ID,
        question: "How does Matthews' first-lien/second-lien priority split change secured-debt capacity analysis compared to Coherent's pari-passu-among-secured-tranches structure?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "Structural finding for legal review, not a single computable answer. Coherent's secured tranches (Term Loan A, Term Loan B-3) are modeled as PARI_PASSU within one collateral pool (docs/coherent-phase1-stacking-table.md) — 'secured capacity' is one undifferentiated question. Matthews requires TWO PermissionCollateralScope rows on the SAME CollateralPool (matw-pool-common): priorityTier FIRST (Credit Agreement revolver, ind_lien_first_creditfacility) and priorityTier SECOND (2024 Note Offering, ind_lien_second_notes / ca_lien_601j_2024notes), both linked to the SAME IntercreditorAgreement row (matw-ica-2024). The EXISTING CollateralPool/PermissionCollateralScope/priorityTier primitive handled this WITHOUT any new schema or engine capability — see docs/matthews-international-onboarding.md §C for the full modeling-decision writeup. This is the single most important ontology confirmation of this onboarding.",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "Does the first-priority tier's own ratio-based growth capacity (Secured Net Leverage ≤3.50x) apply identically to second-priority debt, or does the Indenture impose a tighter, priority-specific test?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "TIGHTER, priority-specific test confirmed: Permitted Debt cl.(1)(b)(y) imposes a SEPARATE First Lien Net Leverage Ratio ≤2.50x cap that applies ONLY to Debt constituting 'First Priority Obligations,' distinct from and stricter than the general 3.50x Secured Net Leverage Ratio cl.(1)(b)(x) applies to ALL secured debt regardless of priority tier. This priority-differentiated ratio-gating has NO Coherent analogue (Coherent's own equivalent gap — First Lien SNLR, documented in scripts/populate-coherent-solver-native.ts header item 1 — was never actually exercised by a real first/second-lien split until now). NOT separately modeled here either (see populate script header item 3) — confirmed recurrence of the same documented gap, now proven materially real by a second real company's contract text.",
        status: "UNVERIFIED",
      },
      // --- NEW category (b): Intercreditor Agreement priority/restriction mechanics ---
      {
        companyId: COMPANY_ID,
        question: "What does the Intercreditor Agreement's own Section 2 (Lien Priorities) actually permit or restrict regarding additional first-lien or second-lien debt?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "The Intercreditor Agreement (dated 9/27/2024, Citizens Bank N.A./Truist Bank) does NOT itself impose any dollar-amount or ratio cap on additional first- or second-lien debt — Section 2.1 ('Subordination of Liens') establishes ONLY that Second Priority Liens on the Common Collateral are unconditionally subordinate to First Priority Liens 'notwithstanding the date, time, method, manner or order of filing or recordation' (a 'silent second' priority mechanic — priority is contractual, not perfection-order-based). The actual DOLLAR/RATIO gating on how much additional debt of either priority may be incurred lives entirely in the Credit Agreement (§6.01, no cap beyond the single §6.01(j) exception) and the Indenture (Permitted Debt cl.(1), the 3.50x/2.50x ratio tests) — NOT in the Intercreditor Agreement itself. This is the correct, cited legal conclusion; no engine gap.",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "Does the Intercreditor Agreement's Section 3 (Enforcement) or Section 4 (Payments) mechanics bear on Phase 1 debt/lien capacity questions?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "NO — read and cited for completeness in docs/matthews-international-onboarding.md §B, but deliberately NOT modeled as Permission/relationship rows. Section 3 (standstill on the Second Priority Secured Parties' enforcement rights prior to Discharge of Senior Lender Claims) and Section 4 (payment-waterfall/turnover mechanics) are enforcement-regime provisions, explicitly out of Phase 1 scope per docs/targeted-ontology-closure-test.md's own prior finding (deferred, not this phase's concern).",
        status: "UNVERIFIED",
      },
      // --- NEW category (c): January 2026 redemption / capacity restoration ---
      {
        companyId: COMPANY_ID,
        question: "Is the January 2026 full redemption of the Second Lien Notes confirmed from Matthews' own SEC filings, and on what date/terms?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "CONFIRMED from Matthews' own 8-K filed 2026-01-12 (accession 0000063296-26-000006), Item 8.01: notice of redemption issued to holders of the 8.625% Senior Secured Second Lien Notes due 2027, redeeming 100% of the $300,000,000 outstanding principal amount on January 22, 2026, at 104.313% of principal plus accrued and unpaid interest. Independently verified from Matthews' own primary filing, not assumed from the task prompt's 'public reporting indicates' hedge. Represented as a DebtEvent (REPAYMENT, matw-facility-2027-notes, date 2026-01-22, amount 300) on the financial-core side.",
        status: "UNVERIFIED",
      },
      {
        companyId: COMPANY_ID,
        question: "Following the January 22, 2026 full redemption, does the Indenture's own defeasance/discharge mechanic (Article 8) release the second-priority lien and restore secured capacity under the Credit Agreement's §6.01, and has this been modeled?",
        queryType: "OUT_OF_SCOPE",
        queryParams: {},
        expectedAnswer: null,
        bindingProvision: null,
        bindingDefinedTerms: [],
        reviewerNotes:
          "NOT MODELED in this pass — a documented follow-up, not a guess. The Indenture's own Article 8 ('Legal Defeasance and Covenant Defeasance,' confirmed present in its Table of Contents) is the governing mechanic for what happens to the covenant package and the second-priority lien once 100% of the Notes are redeemed, but its precise text (satisfaction-and-discharge vs. defeasance vs. simple full repayment mechanics, and whether/how CA §6.01(j)'s own exception is affected once the 2024 Note Offering no longer has Debt outstanding) was not independently fetched and read in this pass. The financial-core DebtEvent (REPAYMENT) is populated as a real, dated fact; no Document.effectiveTo, Permission-level change, or post-redemption FinancialState/second scenario was built on top of it. Flagged SOURCE_CHAIN_INCOMPLETE / follow-up required — this is exactly the honest 'don't guess at redemption mechanics' disposition the task instructed when the full picture can't be independently confirmed within the time available.",
        status: "UNVERIFIED",
      },
    ],
  });

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
