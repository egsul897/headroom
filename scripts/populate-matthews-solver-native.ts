/**
 * Matthews International Corporation (NASDAQ: MATW) — Company B onboarding.
 *
 * Populates Matthews' Company/Document rows and its solver-native contract
 * model (Permission / PermissionRelationship / SharedCapacityConstraint /
 * CollateralPool / PermissionCollateralScope / IntercreditorAgreement /
 * SolverCoverageDeclaration) plus the ONE legacy FinancialSnapshot row the
 * shared leaf-calculation boundary (`evaluateProvision`/`runSolverForDocument`
 * both consume `FinancialSnapshotInput` via `data.financials` — see
 * lib/covenant-engine.ts `runSolverForDocument`'s `financials: fin` wiring)
 * requires to exist for ANY covenant math — legacy or solver-native — to run
 * at all.
 *
 * THIS IS MATTHEWS-SPECIFIC DATA, NOT SOLVER CODE. Every dollar figure,
 * threshold, and citation below is Matthews' own real contractual
 * configuration and its own real, EDGAR-filed financial facts, populated
 * entirely through the EXISTING generalized Permission/PermissionRelationship/
 * SharedCapacityConstraint/CollateralPool/PermissionCollateralScope/
 * IntercreditorAgreement/SolverCoverageDeclaration primitives. Nothing in
 * lib/solver/**, lib/covenant-engine.ts, or lib/financial-core/** is modified
 * by this script or branches on company/document/basket identity.
 *
 * Full source citations, extraction discipline, and the collateral-pool
 * modeling decision are documented in
 * docs/matthews-international-onboarding.md — this header summarizes only
 * the population-specific choices and the generalized-capability gaps
 * DELIBERATELY NOT worked around:
 *
 *   1. Credit Agreement (Third A&R Loan Agreement dated 3/27/2020, as
 *      amended through the Sixth Amendment dated 9/23/2024) — CONFIRMED, by
 *      full-text reading of its Table of Contents and Article VI body text,
 *      to contain NO negative covenant restricting Indebtedness incurrence
 *      at all (Article VI runs §6.01 Liens through §6.08 Dividends and
 *      Distributions; there is no "§6.0x Indebtedness" section). Debt
 *      capacity under the CA is gated only by (a) the §5.14 Leverage
 *      Ratio/Senior Leverage Ratio MAINTENANCE covenants (a compliance test
 *      on the CA's own borrower, not an incurrence-conditioned basket — a
 *      category mismatch with the Permission model's "what may be
 *      done"/incurrence-permission semantics) and (b) the §6.01 Liens
 *      covenant. NO DEBT_INCURRENCE Permission row is created for the
 *      Credit Agreement, and NO SolverCoverageDeclaration for
 *      CA (either side) / DEBT_INCURRENCE is written — the absence resolves NOT_TESTED via
 *      the existing coverage-gate default (design doc §Q.2's documented
 *      "absence of a declaration always resolves to legacy/not-tested"
 *      behavior), which is the conservative, correct outcome: a human asking
 *      "how much unsecured debt can Matthews incur under the CA alone"
 *      should get NOT_TESTED, not a fabricated "unlimited."
 *
 *   2. Sixth Amendment REPLACED old CA §6.01(j) (a general $50.0M Loan-Party
 *      secured-lien basket, the "Permitted Amount") with a NEW §6.01(j) that
 *      permits ONLY Liens securing the 2024 Note Offering, subject to
 *      Intercreditor Agreement joinder. Confirmed by diffing the Sixth
 *      Amendment's restated §6.01 against the original 2020 text: clause (j)
 *      is the ONLY Loan-Party-secured-debt exception in the current (post-
 *      9/23/2024) Liens covenant. This is a real, cited, ZERO-capacity
 *      finding (not an UNKNOWN) — as of the current CA, Matthews cannot
 *      grant a NEW secured lien to a Loan-Party creditor other than the 2024
 *      Note Offering itself.
 *
 *   3. Indenture Permitted Debt clause (1)(b)(y) — the First Lien Net
 *      Leverage Ratio ≤ 2.50x sub-test that applies specifically to Debt
 *      constituting "First Priority Obligations" — is NOT separately
 *      modeled. This is a CONFIRMED RECURRENCE of the exact gap
 *      scripts/populate-coherent-solver-native.ts's header already
 *      documented for Coherent (item 1: "LEVERAGE_RATIO_ROOM's only
 *      debtBasis values are total/secured... no first-lien-priority-specific
 *      secured debt subtotal distinct from junior-secured debt"). Only the
 *      broader Secured Net Leverage Ratio ≤ 3.50x prong (clause (1)(b)(x))
 *      is populated. NOT a new gap; NOT worked around; same disposition as
 *      Coherent's.
 *
 *   4. Indenture Permitted Debt clause (1)(a)'s $1,300.0M flat component is
 *      modeled as FLAT_NET_OF_DEBT with params.netOfBasis="secured" — which
 *      nets against the Company's TOTAL secured debt company-wide, not the
 *      Debt-Facilities-and-Qualified-Receivables-Transactions-specific
 *      outstanding amount the clause actually measures against. This is a
 *      CONFIRMED RECURRENCE of the exact same pre-existing engine
 *      imprecision scripts/populate-coherent-solver-native.ts's header
 *      already documented for its own P.indScfFlat row. UNDERSTATES true
 *      remaining clause-(1)(a) capacity (conservative direction, never
 *      overstates). Not a new gap; not worked around.
 *
 *   5. Every Indenture basket that grows off "greater of $X or Y% of Total
 *      Assets" (the non-guarantor sub-debt cap under §4.09(a)'s proviso,
 *      among others) is modeled at its FLAT dollar floor ONLY.
 *      GREATER_OF_FLAT_OR_PCT_EBITDA (the only "greater of flat or grower"
 *      formula type that exists) supports ONLY an EBITDA-percentage grower,
 *      not a Total-Assets-percentage grower — this is a NEW, generalized,
 *      non-Matthews-specific gap (any indenture that grows a basket off
 *      Total Assets rather than EBITDA — an extremely common high-yield
 *      drafting convention — hits it). NOT built here (would require a
 *      lib/covenant-engine.ts change, which the task's zero-source-change
 *      mandate reserves for a case that genuinely cannot be worked around
 *      with existing data-only choices — the flat-floor substitution is
 *      conservative and, at Matthews' current asset base, numerically close:
 *      $125.0M flat vs. 7.0% × $1,791.719M Total Assets ≈ $125.4M as of
 *      12/31/2024 — see docs/matthews-international-onboarding.md §D for the
 *      full disclosure). NAMED here as a candidate legitimate new
 *      capability, not implemented.
 *
 *   6. The Intercreditor Agreement's Section 3 (Enforcement/standstill) and
 *      Section 4 (Payments/turnover) mechanics are read and cited in the
 *      onboarding doc but are NOT modeled as Permission/relationship rows —
 *      per docs/targeted-ontology-closure-test.md's own prior finding,
 *      enforcement/LME mechanics are explicitly out of Phase 1 scope. Only
 *      Section 2 (Lien Priorities) — the priority mechanic that bears on
 *      "can this debt be incurred and secured, at what priority" — is
 *      modeled, via CollateralPool/PermissionCollateralScope/priorityTier.
 *
 * Idempotent: deletes and recreates every Matthews row this script owns on
 * each run, identified by fixed ids below (all prefixed "matw-"), so
 * re-running is safe. Never touches prisma/seed-data.ts's own Coherent rows
 * — verify with `git diff` / a DB query scoped to companyId "coherent" after
 * running.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY_ID = "matthews";
const CA_ID = "matw-credit-agreement-2020";
const IND_ID = "matw-2027-second-lien-notes-indenture";
const VERIFIED = "VERIFIED" as const;
const AS_OF = new Date("2024-12-31"); // anchor 10-Q balance-sheet date (accession 0000063296-25-000006)

const P = {
  indDebtRatioFccr: "matw-ind-d-ratio-fccr",
  indDebtPermitted1aFlat: "matw-ind-d-permitted-1a-flat",
  indDebtPermitted1bRatioSecured: "matw-ind-d-permitted-1b-ratio-secured",
  indDebtNotesFixed: "matw-ind-d-notes-fixed",
  indLienSecondNotes: "matw-ind-l-second-notes",
  indLienFirstCreditFacility: "matw-ind-l-first-creditfacility",
  caLien2024Notes: "matw-ca-l-2024notes",
} as const;

async function main() {
  console.log("== Matthews International (MATW) — populating solver-native model ==");
  console.log("PROVISIONAL — ENGINEERING-VERIFIED ONLY (no outside-counsel confirmation).\n");
  console.log("As-of date for this fixture: 2024-12-31 (10-Q accession 0000063296-25-000006) — the Second Lien Notes are genuinely outstanding as of this date.\n");

  // -------------------------------------------------------------------------
  // 0. Clean slate for every row this script owns (idempotent re-run)
  // -------------------------------------------------------------------------
  const ownedPermissionIds = Object.values(P);
  await prisma.permissionCollateralScope.deleteMany({ where: { permissionId: { in: ownedPermissionIds } } });
  await prisma.sharedCapacityConstraintMember.deleteMany({ where: { constraint: { companyId: COMPANY_ID } } });
  await prisma.sharedCapacityConstraint.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.ruleActivationCondition.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.permissionRelationship.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.solverCoverageDeclaration.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.permission.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.collateralPool.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.intercreditorAgreement.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.entityClassMember.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.externalInputRecord.deleteMany({ where: { companyId: COMPANY_ID, financialStateId: null, facilityId: null } });
  await prisma.financialSnapshot.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });

  // -------------------------------------------------------------------------
  // 1. Company + Documents
  // -------------------------------------------------------------------------
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: { name: "Matthews International Corporation", ticker: "MATW", cik: "0000063296" },
    create: { id: COMPANY_ID, name: "Matthews International Corporation", ticker: "MATW", cik: "0000063296" },
  });

  await prisma.document.createMany({
    data: [
      {
        id: CA_ID,
        companyId: COMPANY_ID,
        name: "Third Amended and Restated Loan Agreement, dated March 27, 2020, as amended through the Sixth Amendment dated September 23, 2024",
        type: "CREDIT_AGREEMENT",
        governs: "Domestic senior secured revolving credit facility ($750.0M committed), Citizens Bank, N.A. as administrative agent",
        executedOn: new Date("2020-03-27"),
        notes:
          "Solver-native only — no legacy CovenantProvision/capacityFormulas rows (going solver-native from the start, per task instruction). Base agreement: 8-K filed 2020-03-30, accession 0000063296-20-000040, Exhibit 10.1. Sixth Amendment: 8-K filed 2024-09-24, accession 0001193125-24-224129, Exhibit 10.2. Amendments 1-5 independently located and read for the amendment-chain reconstruction (see docs/matthews-international-onboarding.md §A) but not separately cited per-provision except where they bear on a modeled Permission.",
      },
      {
        id: IND_ID,
        companyId: COMPANY_ID,
        name: "Indenture, dated September 27, 2024, governing the 8.625% Senior Secured Second Lien Notes due 2027",
        type: "INDENTURE",
        governs: "$300.0M aggregate principal 8.625% Senior Secured Second Lien Notes due October 1, 2027",
        executedOn: new Date("2024-09-27"),
        notes:
          "Solver-native only — no legacy CovenantProvision/capacityFormulas rows. 8-K filed 2024-09-30, accession 0001193125-24-228450, Exhibit 4.1.",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 2. Legacy FinancialSnapshot — required for ANY covenant math (legacy or
  //    solver-native) to run at all; see header comment. Figures reconstructed
  //    from Matthews' own EDGAR filings — full methodology-order disclosure
  //    and every input citation in docs/matthews-international-onboarding.md §D.
  // -------------------------------------------------------------------------
  await prisma.financialSnapshot.create({
    data: {
      companyId: COMPANY_ID,
      asOfDate: AS_OF,
      // Indenture-defined Consolidated EBITDA, TTM through 12/31/2024,
      // PUBLIC_FILING_RECONSTRUCTION — see ExternalInputRecord below and
      // docs/matthews-international-onboarding.md §D for the full build-up
      // and methodology-order disclosure.
      ebitda: 128.313,
      cash: 33.513,
      interestExpense: 54.640,
      // TTM Consolidated Net Income since-Issue-Date proxy — see doc §D.
      cumulativeNetIncome: -3.472,
      equityProceedsSinceIssue: 0,
      // Assumed new-money rate = the Second Lien Notes' own coupon (the most
      // recent actual incremental-debt pricing Matthews obtained) — a
      // disclosed assumption, not a contractual figure.
      assumedNewDebtRatePct: 8.625,
      totalDebt: 809.211,
      // Revolving credit facilities ($484.083M, first lien) + 2027 Senior
      // Secured Notes ($294.799M, second lien). Excludes "Other borrowings"
      // ($7.869M) and finance lease obligations ($22.460M) — not confirmed
      // secured on the Common Collateral pool from primary text, excluded
      // conservatively (understates secured debt, overstates secured-ratio
      // room slightly — disclosed in doc §D).
      securedDebt: 778.882,
      notes:
        "10-Q for the quarter ended 12/31/2024 (accession 0000063296-25-000006), Note 7 'Debt and Financing Arrangements' and Consolidated Balance Sheet. EBITDA is PUBLIC_FILING_RECONSTRUCTION per the Indenture's own Consolidated EBITDA defined term — see ExternalInputRecord and docs/matthews-international-onboarding.md §D.",
    },
  });

  // -------------------------------------------------------------------------
  // 3. ExternalInputRecord — EBITDA reconstruction provenance
  // -------------------------------------------------------------------------
  await prisma.externalInputRecord.create({
    data: {
      companyId: COMPANY_ID,
      kind: "PUBLIC_FILING_RECONSTRUCTION",
      name: "matw-covenant-ebitda-ttm-2024-12-31",
      value: 128.313,
      asOfDate: AS_OF,
      sourceRef:
        "Indenture §1.01 'Consolidated EBITDA' defined term, applied to: FY2024 10-K (accession 0000063296-24-000094) Consolidated Statements of Income/Cash Flows + Q1 FY2025 10-Q (accession 0000063296-25-000006) and Q1 FY2024 comparative figures, TTM = FY2024 + Q1FY25 − Q1FY24. See docs/matthews-international-onboarding.md §D for the full line-item build-up and the methodology-order disclosure (formula fixed from the defined term BEFORE any number was computed).",
      reviewStatus: "UNVERIFIED",
      maxAgeDays: 120,
    },
  });

  // -------------------------------------------------------------------------
  // 4. Collateral pool + Intercreditor Agreement
  // -------------------------------------------------------------------------
  await prisma.collateralPool.create({
    data: {
      id: "matw-pool-common",
      companyId: COMPANY_ID,
      name: "Common Collateral — substantially all assets of Matthews and its U.S. domestic subsidiaries",
      definedTermRef: "\"Common Collateral\" (Intercreditor Agreement §1.1)",
    },
  });

  await prisma.intercreditorAgreement.create({
    data: {
      id: "matw-ica-2024",
      companyId: COMPANY_ID,
      name: "Intercreditor Agreement, dated September 27, 2024, among Citizens Bank, N.A. (Administrative Agent/First Lien Agent) and Truist Bank (Trustee/Second Priority Collateral Agent)",
      governs: [
        { poolId: "matw-pool-common", counterpartyClass: "First Lien Agent / Senior Lenders (Credit Agreement) vs. Second Priority Agent / Second Lien Notes holders" },
      ],
    },
  });

  // -------------------------------------------------------------------------
  // 5. Permissions — Indenture, debt
  // -------------------------------------------------------------------------
  await prisma.permission.createMany({
    data: [
      {
        id: P.indDebtRatioFccr,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_ratio_debt_fccr",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur Ratio Debt (unlimited if pro forma Consolidated Fixed Charge Coverage Ratio ≥ 2.00x)",
        entityScope: [],
        formulaType: "COVERAGE_RATIO_ROOM",
        thresholdValue: 2.0,
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§4.09(a)",
        definedTermRefs: ["Consolidated Fixed Charge Coverage Ratio", "Consolidated EBITDA"],
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "Non-Guarantor Subsidiary Debt Incurred under this Section is sub-capped at the greater of $125.0M or 7.0% of Total Assets (§4.09(a) proviso) — modeled via SharedCapacityConstraint matw-scc-nonguarantor-ratiodebt at its $125.0M FLAT FLOOR ONLY (see this script's header item 5 for the Total-Assets-grower gap). Source: 8-K accession 0001193125-24-228450, Exhibit 4.1, §4.09(a).",
      },
      {
        id: P.indDebtPermitted1aFlat,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_permitted_debt_1a_flat",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur Debt under Debt Facilities (the Credit Agreement) and Qualified Receivables Transactions, flat component",
        entityScope: [],
        formulaType: "FLAT_NET_OF_DEBT",
        thresholdValue: 1300,
        params: { netOfBasis: "secured" },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Permitted Debt def., cl. (1)(a)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "$1,300.0M flat aggregate cap on Debt Facilities + Qualified Receivables Transaction debt outstanding. netOfBasis=\"secured\" nets against TOTAL company-wide secured debt (778.882M), not the Debt-Facilities-and-QRT-specific outstanding (revolver 484.083M + RPA 100.700M sold receivables ≈ 584.783M per 10-Q Note 7) the clause actually measures against — a CONFIRMED RECURRENCE of the same pre-existing engine imprecision documented in scripts/populate-coherent-solver-native.ts's header (P.indScfFlat). UNDERSTATES true remaining capacity (conservative). Source: Indenture, Permitted Debt def. cl. (1)(a).",
      },
      {
        id: P.indDebtPermitted1bRatioSecured,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_permitted_debt_1b_ratio_secured",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur additional Debt under Debt Facilities (unlimited if pro forma Secured Net Leverage Ratio ≤ 3.50x)",
        entityScope: [],
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 3.5,
        params: { debtBasis: "secured" },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Permitted Debt def., cl. (1)(b)(x)",
        definedTermRefs: ["Secured Net Leverage Ratio", "Consolidated EBITDA"],
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "The narrower First Lien Net Leverage Ratio ≤ 2.50x sub-test (cl. (1)(b)(y), applies only to Debt constituting First Priority Obligations) is NOT separately modeled — CONFIRMED RECURRENCE of the exact gap documented in scripts/populate-coherent-solver-native.ts's header item 1 (LEVERAGE_RATIO_ROOM has no first-lien-specific debtBasis value). Source: Indenture, Permitted Debt def. cl. (1)(b).",
      },
      {
        id: P.indDebtNotesFixed,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_permitted_debt_2_notes",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Debt under the Notes issued on the Issue Date (the $300.0M 2027 Senior Secured Notes themselves)",
        entityScope: [],
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 300,
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Permitted Debt def., cl. (2)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "Grandfather clause for the already-issued Notes ($300.0M, fully outstanding as of the anchor date) — carries zero NEW incremental capacity on its own; populated for citation/linked-lien completeness, not as a growth basket. The Indenture's own definition of \"Existing Notes\" (the 2017 5.250% Senior Notes due 2025, cl. (3)) is NOT populated: the anchor 10-Q's own Note 7 debt table (accession 0000063296-25-000006) lists no 5.250% Senior Notes line item as of 12/31/2024, indicating they were no longer outstanding by the anchor date — consistent with the September 2024 refinancing having repaid them, though the specific repayment/redemption mechanics were not independently located in this pass. Flagged SOURCE_CHAIN_INCOMPLETE for the exact 2017 Notes disposition, not populated. Source: Indenture, Permitted Debt def. cl. (2)/(3); 10-Q accession 0000063296-25-000006 Note 7.",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 6. Permissions — Indenture, liens
  // -------------------------------------------------------------------------
  await prisma.permission.createMany({
    data: [
      {
        id: P.indLienFirstCreditFacility,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_lien_permitted_cl2_creditfacility",
        grantType: "LIEN",
        amountKind: "FIXED",
        action: "Secure Debt Facilities debt at FIRST priority on the Common Collateral — automatic, no independent ceiling of its own",
        entityScope: [],
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 0,
        params: { automaticLinkOnly: true },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§4.10 / Permitted Liens def., cl. (2)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "AUTOMATIC_LINKED_PERMISSION from ind_permitted_debt_1a_flat and ind_permitted_debt_1b_ratio_secured (see relationship rows) — the Indenture's own negative-pledge treatment of the senior Credit Facility's first-priority lien on Common Collateral, conditioned on the holders of such Debt becoming party to the First Priority/Second Priority Intercreditor Agreement. Source: Indenture §4.10; Permitted Liens def. cl. (2).",
      },
      {
        id: P.indLienSecondNotes,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_lien_second_priority_notes",
        grantType: "LIEN",
        amountKind: "FIXED",
        action: "Secure the Notes at SECOND priority on the Common Collateral — automatic, no independent ceiling of its own",
        entityScope: [],
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 0,
        params: { automaticLinkOnly: true },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "8-K Item 1.01 (accession 0001193125-24-228450) / §4.10",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "AUTOMATIC_LINKED_PERMISSION from ind_permitted_debt_2_notes. The Notes' own second-priority lien grant is stated directly in the 8-K's own body text (\"secured by a second priority lien on substantially all of the Company's and the U.S. Guarantors' assets\"); the exact granting-clause citation within the Indenture's own Security Documents provisions (as distinct from §4.10's negative-pledge covenant, which protects rather than grants this lien) was not independently traced to a specific Article/Section in this pass. Source: 8-K accession 0001193125-24-228450, Item 1.01; Indenture §4.10.",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 7. Permissions — Credit Agreement, liens (no CA debt-incurrence
  //    permissions exist — see header item 1)
  // -------------------------------------------------------------------------
  await prisma.permission.create({
    data: {
      id: P.caLien2024Notes,
      companyId: COMPANY_ID,
      documentId: CA_ID,
      code: "ca_lien_601j_2024notes",
      grantType: "LIEN",
      amountKind: "FIXED",
      action: "Secure Indebtedness under the 2024 Note Offering at second priority — the ONLY Loan-Party-secured-debt exception remaining in §6.01 after the Sixth Amendment",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      params: { automaticLinkOnly: true },
      measurementBasis: "CURRENTLY_OUTSTANDING",
      sectionRef: "§6.01(j), as restated by the Sixth Amendment (9/23/2024)",
      modelingStatus: "MODELED",
      reviewStatus: VERIFIED,
      notes:
        "AUTOMATIC_LINKED_PERMISSION (cross-document) from ind_permitted_debt_2_notes — the CA's OWN authorization for the same $300.0M 2024 Note Offering lien the Indenture side represents, conditioned on (y) the Agent having received the executed Security Agreement with a Prior Security Interest and (z) such Liens being subordinate per the 2024 Note Intercreditor Agreement. CONFIRMED by diffing the Sixth Amendment's restated §6.01 against the original 2020 text that the prior general $50.0M Loan-Party secured-lien basket (former cl. (j), the defined term \"Permitted Amount\") was DELETED and replaced by this Notes-specific exception — no other CA-side basket exists for a Loan Party to grant a NEW secured lien to a new/different creditor as of the current CA (real, cited, zero-capacity finding — see header item 2). Source: 8-K accession 0001193125-24-224129, Exhibit 10.2 (Sixth Amendment), restated §6.01(j).",
    },
  });

  // -------------------------------------------------------------------------
  // 8. Collateral scopes
  // -------------------------------------------------------------------------
  await prisma.permissionCollateralScope.createMany({
    data: [
      { id: "matw-pcs-ind-first", permissionId: P.indLienFirstCreditFacility, collateralPoolId: "matw-pool-common", priorityTier: "FIRST", intercreditorAgreementId: "matw-ica-2024" },
      { id: "matw-pcs-ind-second", permissionId: P.indLienSecondNotes, collateralPoolId: "matw-pool-common", priorityTier: "SECOND", intercreditorAgreementId: "matw-ica-2024" },
      { id: "matw-pcs-ca-second", permissionId: P.caLien2024Notes, collateralPoolId: "matw-pool-common", priorityTier: "SECOND", intercreditorAgreementId: "matw-ica-2024" },
    ],
  });

  // -------------------------------------------------------------------------
  // 9. PermissionRelationship rows
  // -------------------------------------------------------------------------
  await prisma.permissionRelationship.createMany({
    data: [
      // --- Automatic linked liens ---
      {
        id: "matw-rel-link-1a-first",
        companyId: COMPANY_ID,
        fromPermissionId: P.indDebtPermitted1aFlat,
        toPermissionId: P.indLienFirstCreditFacility,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "Permitted Liens def., cl. (2)",
        notes: "Source: Indenture Permitted Liens def. cl. (2).",
      },
      {
        id: "matw-rel-link-1b-first",
        companyId: COMPANY_ID,
        fromPermissionId: P.indDebtPermitted1bRatioSecured,
        toPermissionId: P.indLienFirstCreditFacility,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "Permitted Liens def., cl. (2)",
        notes: "Source: Indenture Permitted Liens def. cl. (2).",
      },
      {
        id: "matw-rel-link-notes-second",
        companyId: COMPANY_ID,
        fromPermissionId: P.indDebtNotesFixed,
        toPermissionId: P.indLienSecondNotes,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "8-K Item 1.01 (accession 0001193125-24-228450)",
        notes: "Source: 8-K Item 1.01.",
      },
      {
        id: "matw-rel-link-notes-ca-second",
        companyId: COMPANY_ID,
        fromPermissionId: P.indDebtNotesFixed,
        toPermissionId: P.caLien2024Notes,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "CA §6.01(j), as restated by the Sixth Amendment",
        notes:
          "Cross-document link: the SAME $300.0M 2024 Note Offering debt (Indenture side) is what the CA's own §6.01(j) exception authorizes as a lien on the Credit Agreement side. Source: Sixth Amendment, restated §6.01(j).",
      },
      // --- §4.09(c) concurrency: Fixed/grandfathered Debt disregarded when
      //     calculating a concurrent ratio-based incurrence's own ratio ---
      {
        id: "matw-rel-disregard-1a-fccr",
        companyId: COMPANY_ID,
        fromPermissionId: P.indDebtPermitted1aFlat,
        toPermissionId: P.indDebtRatioFccr,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§4.09(c)",
        notes:
          "§4.09(c): a concurrent Permitted Debt incurrence NOT itself relying on a leverage ratio is disregarded when calculating the Consolidated Fixed Charge Coverage Ratio for a same-date §4.09(a) incurrence. Source: Indenture §4.09(c).",
      },
      {
        id: "matw-rel-disregard-1a-1b",
        companyId: COMPANY_ID,
        fromPermissionId: P.indDebtPermitted1aFlat,
        toPermissionId: P.indDebtPermitted1bRatioSecured,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§4.09(c)",
        notes: "Same §4.09(c) mechanic, applied to a concurrent cl.(1)(b) ratio-based incurrence. Source: Indenture §4.09(c).",
      },
      {
        id: "matw-rel-disregard-notes-fccr",
        companyId: COMPANY_ID,
        fromPermissionId: P.indDebtNotesFixed,
        toPermissionId: P.indDebtRatioFccr,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§4.09(c)",
        notes: "Source: Indenture §4.09(c).",
      },
      {
        id: "matw-rel-disregard-notes-1b",
        companyId: COMPANY_ID,
        fromPermissionId: P.indDebtNotesFixed,
        toPermissionId: P.indDebtPermitted1bRatioSecured,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§4.09(c)",
        notes: "Source: Indenture §4.09(c).",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 10. SharedCapacityConstraint — §4.09(a) proviso Non-Guarantor sub-cap
  // -------------------------------------------------------------------------
  await prisma.sharedCapacityConstraint.create({
    data: {
      id: "matw-scc-nonguarantor-ratiodebt",
      companyId: COMPANY_ID,
      name: "Non-Guarantor Subsidiary sub-cap on Ratio Debt (§4.09(a) proviso)",
      capAmount: 125,
      aggregationRule: "ENTITY_CLASS_FILTER",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      sourceSectionRef:
        "§4.09(a) proviso — cap is the greater of $125.0M or 7.0% of Total Assets ($1,791.719M as of 12/31/2024 -> ~$125.4M); modeled at the $125.0M FLAT FLOOR only (capFormulaType left null — GREATER_OF_FLAT_OR_PCT_EBITDA has no Total-Assets-percentage grower; see script header item 5). Numerically minor at Matthews' current asset base; the underlying formula-type gap is general.",
      members: { create: [{ entityClass: "NON_GUARANTOR_RS" }] },
    },
  });

  // -------------------------------------------------------------------------
  // 11. SolverCoverageDeclarations — Indenture only (see header item 1 for
  //     why no CA/DEBT_INCURRENCE declaration exists)
  // -------------------------------------------------------------------------
  const declarations: { documentId: string; side: string; grantType: "DEBT_INCURRENCE" | "LIEN"; notes: string }[] = [
    {
      documentId: IND_ID,
      side: "secured",
      grantType: "DEBT_INCURRENCE",
      notes: "Indenture / secured / debt. Excludes cl.(1)(b)(y)'s First Lien Net Leverage Ratio sub-test and cl.(3) Existing Notes (see header items 3/4).",
    },
    {
      documentId: IND_ID,
      side: "unsecured",
      grantType: "DEBT_INCURRENCE",
      notes: "Indenture / unsecured / debt — the §4.09(a) Ratio Debt permission is not secured/unsecured-differentiated at the Indenture level; same permission used for both sides.",
    },
    {
      documentId: IND_ID,
      side: "secured",
      grantType: "LIEN",
      notes: "Indenture / secured / liens — both priority tiers of the Common Collateral pool.",
    },
    {
      documentId: CA_ID,
      side: "secured",
      grantType: "LIEN",
      notes: "Credit Agreement / secured / liens — the single remaining §6.01(j) exception (2024 Note Offering) is the complete current lien-exception inventory for a Loan Party to grant a NEW secured lien (see header item 2).",
    },
  ];

  const allPermissions = await prisma.permission.findMany({ where: { companyId: COMPANY_ID } });
  for (const decl of declarations) {
    const scoped = allPermissions.filter((p) => p.documentId === decl.documentId && p.grantType === decl.grantType);
    if (scoped.length === 0) {
      throw new Error(`Refusing to declare ${decl.documentId}/${decl.side}/${decl.grantType} complete: zero Permission rows in scope.`);
    }
    const notModeled = scoped.filter((p) => p.modelingStatus !== "MODELED");
    if (notModeled.length > 0) {
      throw new Error(
        `Refusing to declare ${decl.documentId}/${decl.side}/${decl.grantType} complete: ${notModeled.length} KNOWN_NOT_MODELED row(s) present (${notModeled.map((p) => p.code).join(", ")}).`
      );
    }
  }
  console.log(`Coverage-integrity check passed for all ${declarations.length} declarations — every scoped Permission is MODELED.\n`);

  await prisma.solverCoverageDeclaration.createMany({
    data: declarations.map((d) => ({ companyId: COMPANY_ID, documentId: d.documentId, side: d.side, grantType: d.grantType, isComplete: true, notes: d.notes })),
  });

  // -------------------------------------------------------------------------
  // 12. Summary
  // -------------------------------------------------------------------------
  const [permCount, relCount, sccCount, declCount, poolCount, pcsCount, icaCount] = await Promise.all([
    prisma.permission.count({ where: { companyId: COMPANY_ID } }),
    prisma.permissionRelationship.count({ where: { companyId: COMPANY_ID } }),
    prisma.sharedCapacityConstraint.count({ where: { companyId: COMPANY_ID } }),
    prisma.solverCoverageDeclaration.count({ where: { companyId: COMPANY_ID } }),
    prisma.collateralPool.count({ where: { companyId: COMPANY_ID } }),
    prisma.permissionCollateralScope.count({ where: { permission: { companyId: COMPANY_ID } } }),
    prisma.intercreditorAgreement.count({ where: { companyId: COMPANY_ID } }),
  ]);
  console.log("Population complete:");
  console.log(`  Permissions: ${permCount}`);
  console.log(`  PermissionRelationships: ${relCount}`);
  console.log(`  SharedCapacityConstraints: ${sccCount}`);
  console.log(`  SolverCoverageDeclarations: ${declCount}`);
  console.log(`  CollateralPools: ${poolCount}`);
  console.log(`  PermissionCollateralScopes: ${pcsCount}`);
  console.log(`  IntercreditorAgreements: ${icaCount}`);
  console.log("\nPROVISIONAL — ENGINEERING-VERIFIED ONLY. No outside-counsel confirmation.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
