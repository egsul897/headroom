/**
 * Phase 8 — populates Coherent's solver-native contract model (Permission /
 * PermissionRelationship / SharedCapacityConstraint / CollateralPool /
 * PermissionCollateralScope / RuleActivationCondition / SolverCoverageDeclaration)
 * from the approved legal specification:
 *   - docs/coherent-phase1-stacking-table.md (§D-§V — the corrected stacking
 *     table, permission inventory, interaction matrices, path templates)
 *   - docs/coherent-phase8-blocker-closure.md (§B-§H — the 5 resolved
 *     blockers; §G — current-state findings superseding the stacking table's
 *     own §Q.3/§X placeholders)
 *
 * All dollar figures are in $M, matching prisma/seed-data.ts's own
 * convention (Decimal(18,6) columns store "4000" for $4,000.0M etc).
 *
 * THIS IS COHERENT-SPECIFIC DATA, NOT SOLVER CODE. Per task §21 (the
 * generalization guard): every dollar figure, threshold, and citation below
 * is Coherent's own contractual configuration, populated through the
 * existing generalized Permission/PermissionRelationship/SharedCapacityConstraint/
 * RuleActivationCondition primitives. Nothing in lib/solver/** or
 * lib/covenant-engine.ts is modified by this script or branches on
 * company/document/basket identity.
 *
 * PROVISIONAL — ENGINEERING-VERIFIED ONLY. Every legal conclusion this
 * population encodes (clause 6/24/25 non-netting, EBITDA addback-cap
 * absence, Contribution Indebtedness availability, Collateral Suspension
 * Period current-state determination) rests on internal AI-driven
 * source-verification against primary EDGAR text, NOT independent outside-
 * counsel confirmation. See docs/coherent-phase8-population-reconciliation.md
 * §U for the full legal-confirmation-status ledger. `reviewStatus: VERIFIED`
 * on the rows below means "checked against the executed document's own
 * text" (the schema's own DefinedTermStatus semantics) — it does NOT mean
 * outside counsel has signed off.
 *
 * GENERALIZED CAPABILITY GAPS DELIBERATELY NOT WORKED AROUND (documented in
 * full in the report; summarized here at each affected omission):
 *   1. First Lien Secured Net Leverage Ratio (Incremental Amount def., pari
 *      passu-secured "Ratio-Based" prong, Template INC-1): LEVERAGE_RATIO_ROOM's
 *      only `debtBasis` values are "total"/"secured" (FinancialSnapshotInput
 *      has one undifferentiated `securedDebt` figure) — there is no
 *      first-lien-priority-specific secured debt subtotal distinct from
 *      junior-secured debt, and no `UnrestrictedCashAmount`-style netting
 *      distinct from total cash. NOT POPULATED. See report §M.
 *   2. Reallocated Amount (CA §6.01(k) unused capacity feeding
 *      ca_incr_cashcapped's own ceiling): lib/solver/election.ts's shared-
 *      constraint consumption (`headroomAndConsume`) computes
 *      `desiredForSharedCheck = Math.min(remaining, standalone)` from the
 *      permission's OWN formula BEFORE ever consulting a SharedCapacityConstraint
 *      — a shared constraint can only ration a permission's capacity
 *      downward, never grant it capacity beyond its own formula sourced from
 *      another basket's unused headroom. Cash-Capped Incremental is
 *      therefore populated at its BASE formula only ($1,428M/100% Adjusted
 *      Consolidated EBITDA), WITHOUT the Reallocated Amount add-on — this
 *      UNDERSTATES true Cash-Capped capacity (conservative direction). A
 *      SharedCapacityConstraint row is still created to carry the correct
 *      legal citation/provenance, with its own notes field documenting this
 *      gap explicitly. See report §L.
 *   3. Contribution Indebtedness (Indenture §3.3(b)(xviii)): its measurement
 *      basis is a contribution-linked credit tied to a historical corporate
 *      event (post-Issue-Date cash equity contributions, 210-day incurrence
 *      window, Officer's-Certificate-designated) — the schema's
 *      MeasurementBasis enum (CUMULATIVE_INCURRED / CURRENTLY_OUTSTANDING /
 *      NET_OF_REPAYMENT / PREPAYMENT_CREDIT) has no fourth value for this.
 *      NOT POPULATED (would also require a CERTIFIED_EXTERNAL_INPUT — the
 *      Officer's Certificate itself — that does not exist in Coherent's seed
 *      data). See report §M.
 *   4. Fixed→Incurrence-Based automatic reclassification (Indenture §13.1(a)
 *      / CA §1.07(b)) and the Incremental Amount's Cash-Capped→Ratio-Based
 *      opt-out redesignation: docs/coherent-phase1-stacking-table.md §O
 *      itself specifies these as state-transition rules evaluated against
 *      `historicalUsage`, not `PermissionRelationship` rows — and
 *      lib/solver/election.ts contains NO reclassification/redesignation
 *      logic at all (confirmed by direct source inspection: zero matches for
 *      "reclassif"/"redesignat" in that file). NOT MODELED — an engine gap,
 *      not a data gap. See report §J.
 *   5. RuleActivationCondition.effect === "PARAMETER_VALUE" (the §6.11(a)
 *      Financial Covenant Step-Up's own threshold-swap mechanic) is defined
 *      in the type system and has a resolver (`resolveParameterValue` in
 *      lib/solver/graph.ts) but is NEVER CALLED from lib/solver/election.ts —
 *      only `effect === "APPLICABILITY"` conditions are consumed during live
 *      evaluation. A RuleActivationCondition row is still created below for
 *      provenance (current state: no Material Acquisition since the
 *      Amendment No. 4 Effective Date, confirmed docs/coherent-phase8-blocker-closure.md
 *      §B item 3 — threshold flat at 4.25x), but the CURRENT numeric value
 *      (4.25) is what's actually written onto the affected Permission rows'
 *      thresholdValue directly, per task §8's "represent as state/
 *      configuration inputs... do not hardcode into solver SOURCE code" —
 *      this is configuration DATA, not source code, and is exactly the
 *      currently-accurate value per the blocker-closure's own dispositive
 *      finding. See report §J/§N.
 *   6. Priority Debt / Collateral Suspension Period baskets (CA §6.01(ee)/
 *      §6.02(pp)): confirmed INACTIVE as of the current reporting date
 *      (docs/coherent-phase8-blocker-closure.md §G — Term B Loans
 *      outstanding at $1,080.0M as of 6/30/2026 independently bars the
 *      trigger; current ratings BB/BB independently corroborate). The
 *      stacking table's own §L conclusion is that the "steady-state" tables
 *      correctly reflect Coherent's current position BY OMITTING these
 *      baskets while dormant — that is what this script does. A company-wide
 *      RuleActivationCondition documents the mechanic for provenance/audit
 *      without being attached to any populated Permission (nothing currently
 *      depends on it).
 *   7. §3.3(b)(xx) Non-Guarantor Subsidiary debt basket's Coherent
 *      Commerzbank Credit Agreement carve-out (additional €24.0M) is NOT
 *      separately modeled — immaterial, additive, conservative omission.
 *   8. §6.01(b)/CA-L1 (Loan Document debt, deemed-classified base Term
 *      Loan/Revolver debt) is NOT populated as a debt Permission: it
 *      generates no NEW incremental capacity for a forward-looking
 *      maximum-additional-debt analysis (it is a classification label for
 *      already-outstanding debt, not a basket a NEW transaction draws on) —
 *      new CA secured capacity is sourced through the Incremental Amount
 *      components instead (§6.01(v)), which link to §6.02(hh) via CA-L2.
 *      §6.01(h)/§6.01(p)'s acquisition-specific alternative test and §3.3
 *      Indenture clauses (ii)/(iii)/(v)-(xi)/(xiii)-(xiv)/(xvi)/(xvii)/
 *      (xix)/(xxi)-(xxxiii) are likewise not populated per blocker-closure
 *      §H's own NOT_MATERIAL_TO_PHASE8 classification for every one of them.
 *   9. Entity-scoped baskets (E-1 Non-Guarantor Ratio Debt sub-cap, bxx
 *      Non-Guarantor debt basket): Coherent's seed data names no actual
 *      Restricted Subsidiaries, so no EntityClassMember rows exist for real
 *      entities — these baskets are structurally populated (a real
 *      SharedCapacityConstraint / entityScope exists, citation-complete) but
 *      cannot be exercised by a named real subsidiary in this pass. Every
 *      shadow scenario below uses "Borrower" (the Company itself,
 *      BORROWER class) as the incurring entity — see report §S.
 *
 * Idempotent: deletes and recreates every Coherent solver-native row this
 * script owns on each run (identified by fixed ids below), so re-running is
 * safe. Never touches prisma/seed-data.ts's own legacy CovenantProvision/
 * Document/GoldenTest rows — verify with `git diff` after running.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY_ID = "coherent";
const CA_ID = "coherent-credit-agreement-2022";
const IND_ID = "coherent-2029-notes-indenture";
const VERIFIED = "VERIFIED" as const;

// ---------------------------------------------------------------------------
// Permission ids (stable, descriptive — never branched on by solver code)
// ---------------------------------------------------------------------------
const P = {
  // Indenture debt
  indRatioFccr: "coh-ind-d-ratio-fccr",
  indScfFlat: "coh-ind-d-scf-flat",
  indScfGrower: "coh-ind-d-scf-grower",
  indMilaSecured: "coh-ind-d-mila-secured",
  indMilaUnsecTnl: "coh-ind-d-mila-unsec-tnl",
  indMilaUnsecFccr: "coh-ind-d-mila-unsec-fccr",
  indCapex: "coh-ind-d-capex-biv",
  indGeneral: "coh-ind-d-general-bxii",
  indBxvRatioDebtPath: "coh-ind-d-bxv-ratiodebt-path",
  indBxvFccrNoWorsePath: "coh-ind-d-bxv-fccr-noworse-path",
  indBxxNonGuarantor: "coh-ind-d-bxx-nonguarantor",
  // Indenture liens
  indLienCl6Scf: "coh-ind-l-cl6-linked-scf",
  indLienCl6Capex: "coh-ind-l-cl6-linked-capex",
  indLienCl24Ratio: "coh-ind-l-cl24-ratio",
  indLienCl25General: "coh-ind-l-cl25-general",
  // Credit Agreement debt
  caGeneral601k: "coh-ca-d-general-601k",
  caIncrCashCapped: "coh-ca-d-incr-cashcapped",
  caIncrRatioUnsecJr: "coh-ca-d-incr-ratiobased-unsecjr",
  caIncrPrepayment: "coh-ca-d-incr-prepaymentbased",
  caPermitted601p: "coh-ca-d-permitted-601p",
  // Credit Agreement liens
  caLienHhLinkedV: "coh-ca-l-hh-linked-601v",
  caLienGeneral602kk: "coh-ca-l-general-602kk",
} as const;

async function main() {
  console.log("== Phase 8: populating Coherent solver-native model ==");
  console.log("PROVISIONAL — ENGINEERING-VERIFIED ONLY (no outside-counsel confirmation). See report §U.\n");

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
  await prisma.entityClassMember.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.externalInputRecord.deleteMany({ where: { companyId: COMPANY_ID, name: { startsWith: "coh-" } } });

  // -------------------------------------------------------------------------
  // 1. Collateral pools
  // -------------------------------------------------------------------------
  await prisma.collateralPool.createMany({
    data: [
      { id: "coh-pool-ind-general", companyId: COMPANY_ID, name: "Indenture — General Collateral (Permitted Liens cl. 6/24/25 pool)" },
      { id: "coh-pool-ind-capex-restricted", companyId: COMPANY_ID, name: "Indenture — Capex/Purchase-Money Financed Assets Only (cl. 6 proviso, §3.3(b)(iv)-linked)" },
      { id: "coh-pool-ca-general", companyId: COMPANY_ID, name: "Credit Agreement — Collateral (§6.02(hh)/(kk) pool)" },
    ],
  });

  // -------------------------------------------------------------------------
  // 2. Permissions — Indenture, debt
  //    Source: docs/coherent-phase1-stacking-table.md §F.1/§S; new bxv/bxx
  //    rows per docs/coherent-phase8-blocker-closure.md §H.
  // -------------------------------------------------------------------------
  await prisma.permission.createMany({
    data: [
      {
        id: P.indRatioFccr,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_ratio_debt_fccr",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur Ratio Debt (unlimited if FCCR ≥ 2.00x)",
        entityScope: [],
        formulaType: "COVERAGE_RATIO_ROOM",
        thresholdValue: 2.0,
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§3.3(a)",
        definedTermRefs: ["Fixed Charge Coverage Ratio"],
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "Subject to the E-1 Non-Guarantor Restricted Subsidiary sub-cap (SharedCapacityConstraint coh-scc-nonguarantor-ratiodebt) when the incurring entity is a Non-Guarantor Restricted Subsidiary. Source: docs/coherent-phase1-stacking-table.md §C.1, §E-1, Row I-D... .",
      },
      {
        id: P.indScfFlat,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_scf_basket_a_flat",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur debt under the Senior Credit Agreement basket, flat component",
        entityScope: [],
        formulaType: "FLAT_NET_OF_DEBT",
        thresholdValue: 4000,
        params: { netOfBasis: "secured" },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§3.3(b)(i)(A)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "$4,000.0M flat, net of Senior-Credit-Agreement-specific outstanding — the params.netOfBasis=\"secured\" value nets against TOTAL secured debt (the only netOfBasis the existing FLAT_NET_OF_DEBT formula supports), not Senior-Credit-Agreement-specific outstanding as the Indenture text actually requires. This is a pre-existing, unrelated correctness issue carried forward unchanged from the legacy CovenantProvision of the same name (prov-ind-facility-flat) — not introduced or resolved by this population. Source: docs/coherent-phase1-stacking-table.md §S.",
      },
      {
        id: P.indScfGrower,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_scf_basket_b_grower",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur debt under the Senior Credit Agreement basket, grower component",
        entityScope: [],
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 1320,
        params: { pctEbitda: 1.0 },
        measurementBasis: "CUMULATIVE_INCURRED",
        sectionRef: "§3.3(b)(i)(B)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes: "Greater of $1,320.0M / 100% Four Quarter Consolidated EBITDA. Source: docs/coherent-phase1-stacking-table.md §S.",
      },
      {
        id: P.indMilaSecured,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_mila_secured",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur MILA debt, secured prong (unlimited if SSNL ≤ 3.00x)",
        entityScope: [],
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 3.0,
        params: { debtBasis: "secured" },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§3.3(b)(i)(C) / Maximum Leverage Requirement(a)",
        definedTermRefs: ["Consolidated Senior Secured Net Leverage Ratio", "Maximum Leverage Requirement"],
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes: "Per §3.3(b)(i) proviso, ind_scf_basket_a_flat + ind_scf_basket_b_grower usage is CONCURRENT_COUNTED against this permission's SSNL calc when relied on substantially concurrently (see PermissionRelationship rows below). Source: docs/coherent-phase1-stacking-table.md §C.1/§S.",
      },
      {
        id: P.indMilaUnsecTnl,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_mila_unsecured_tnl",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur MILA debt, unsecured prong, TNL path (unlimited if TNL ≤ 5.00x)",
        entityScope: [],
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 5.0,
        params: { debtBasis: "total" },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Maximum Leverage Requirement(b)(i)",
        definedTermRefs: ["Consolidated Total Net Leverage Ratio"],
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes: "ALTERNATIVE to ind_mila_unsecured_fccr — either path independently suffices. Source: docs/coherent-phase1-stacking-table.md §C.3.",
      },
      {
        id: P.indMilaUnsecFccr,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_mila_unsecured_fccr",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur MILA debt, unsecured prong, FCCR path (unlimited if FCCR ≥ 2.00x)",
        entityScope: [],
        formulaType: "COVERAGE_RATIO_ROOM",
        thresholdValue: 2.0,
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Maximum Leverage Requirement(b)(ii)",
        definedTermRefs: ["Fixed Charge Coverage Ratio"],
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes: "ALTERNATIVE to ind_mila_unsecured_tnl. Source: docs/coherent-phase1-stacking-table.md §C.3.",
      },
      {
        id: P.indCapex,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_capex_debt_biv",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur purchase-money / capex / Capitalized Lease debt",
        entityScope: [],
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 465,
        params: { pctEbitda: 0.35 },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§3.3(b)(iv)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes: "Greater of $465.0M / 35% Four Quarter Consolidated EBITDA, outstanding-based. Newly identified basket (E-2). Source: docs/coherent-phase1-stacking-table.md §C.7 Row I-L4b, §E-2.",
      },
      {
        id: P.indGeneral,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_general_debt_bxii",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur general-purpose debt",
        entityScope: [],
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 530,
        params: { pctEbitda: 0.4 },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§3.3(b)(xii)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes: "Greater of $530.0M / 40% Four Quarter Consolidated EBITDA. NOT clause-(6)-linked — must independently clear a lien permission if secured. Source: docs/coherent-phase1-stacking-table.md §S.",
      },
      // --- New §3.3(b)(xv) acquisition/leverage-neutral basket, modeled as
      // two ALTERNATIVE sub-permissions (mirrors the MILA unsecured TNL/FCCR
      // pattern) per docs/coherent-phase8-blocker-closure.md §H.
      {
        id: P.indBxvRatioDebtPath,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_acquisition_debt_bxv_ratiodebt_path",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur acquisition/Investment-related debt (leverage-neutral alternative), Ratio-Debt-capacity path",
        entityScope: [],
        formulaType: "COVERAGE_RATIO_ROOM",
        thresholdValue: 2.0,
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§3.3(b)(xv)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "§3.3(b)(xv) gates on 'post-transaction Ratio Debt capacity of ≥$1.00' — modeled here as the same FCCR ≥ 2.00x test as ind_ratio_debt_fccr (post-transaction Ratio Debt has ≥$1 of room iff post-transaction FCCR ≥ 2.00x), since that is the exact condition that makes Ratio Debt capacity nonzero. No dollar cap on its own face. Newly identified basket, not previously modeled. Not clause-(6)-linked — secured use requires independent cl.(24)/(25) clearance. Source: docs/coherent-phase8-blocker-closure.md §H, row (xv).",
      },
      {
        id: P.indBxvFccrNoWorsePath,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_acquisition_debt_bxv_fccr_noworse_path",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur acquisition/Investment-related debt (leverage-neutral alternative), FCCR-no-worse-off path",
        entityScope: [],
        formulaType: "COVERAGE_RATIO_ROOM",
        // Pre-transaction FCCR as of the Coherent financial snapshot used in
        // this population (ebitda 1700 / interestExpense 190 = 8.9474x): a
        // dated snapshot fact, not an approximation of the legal test itself
        // ("FCCR not less than pre-transaction FCCR" literally IS today's
        // own ratio at a given snapshot date). Recompute if financials change.
        thresholdValue: 8.947368,
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§3.3(b)(xv)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "§3.3(b)(xv)'s second alternative: 'FCCR ≥ pre-transaction FCCR.' thresholdValue is Coherent's own pre-transaction FCCR (EBITDA $1,700M / interest expense $190M = 8.947368x) as of the FY2026 10-K snapshot used elsewhere in this population — a snapshot-dated fact, must be recomputed whenever the financial snapshot changes; NOT a fixed contractual threshold. ALTERNATIVE to indBxvRatioDebtPath. Source: docs/coherent-phase8-blocker-closure.md §H, row (xv).",
      },
      {
        id: P.indBxxNonGuarantor,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_nonguarantor_debt_bxx",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur general-purpose debt at a Non-Guarantor Restricted Subsidiary",
        entityScope: ["NON_GUARANTOR_RS"],
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 465,
        params: { pctEbitda: 0.35 },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§3.3(b)(xx)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "Greater of $465.0M / 35% Four Quarter Consolidated EBITDA, at Non-Guarantor Restricted Subsidiaries only. Does NOT include the separate Coherent Commerzbank Credit Agreement carve-out (additional €24.0M) — immaterial, conservative omission (item 7 in this script's header). Newly identified basket. Not clause-(6)-linked. No EntityClassMember rows exist naming Coherent's actual Non-Guarantor Restricted Subsidiaries, so this basket cannot be exercised by a named real entity in this population's shadow scenarios (item 9). Source: docs/coherent-phase8-blocker-closure.md §H, row (xx).",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 3. Permissions — Indenture, liens
  // -------------------------------------------------------------------------
  await prisma.permission.createMany({
    data: [
      {
        id: P.indLienCl6Scf,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_lien_cl6_linked_scf",
        grantType: "LIEN",
        amountKind: "FIXED",
        action: "Secure debt Incurred under §3.3(b)(i) — automatic lien, no independent ceiling",
        entityScope: [],
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 0,
        params: { automaticLinkOnly: true },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Permitted Liens cl. (6)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "AUTOMATIC_LINKED_PERMISSION from indScfFlat/indScfGrower/indMilaSecured (see relationship rows). No independent dollar/ratio ceiling of its own — parasitic entirely on the linked debt permission's own validly-Incurred amount. thresholdValue=0/FLAT_AMOUNT is a structural placeholder only; actual lien capacity = whatever the linked debt leg allocates (task §6: 'NOT unlimited lien capacity'). Source: docs/coherent-phase1-stacking-table.md §C.7 Row I-L4a.",
      },
      {
        id: P.indLienCl6Capex,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_lien_cl6_linked_capex",
        grantType: "LIEN",
        amountKind: "FIXED",
        action: "Secure debt Incurred under §3.3(b)(iv) — automatic lien, asset-scope-restricted to financed assets only",
        entityScope: [],
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 0,
        params: { automaticLinkOnly: true, assetScopeRestricted: true },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Permitted Liens cl. (6) proviso",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "AUTOMATIC_LINKED_PERMISSION from indCapex. Scoped to coh-pool-ind-capex-restricted ONLY (not coh-pool-ind-general) — cannot secure a general-collateral financing. Source: docs/coherent-phase1-stacking-table.md §C.7 Row I-L4b.",
      },
      {
        id: P.indLienCl24Ratio,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_lien_cl24_ratio",
        grantType: "LIEN",
        amountKind: "INCURRENCE_BASED",
        action: "Secure debt Incurred pursuant to §3.3 generally (unlimited if SSNL ≤ 3.00x)",
        entityScope: [],
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 3.0,
        params: { debtBasis: "secured" },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Permitted Liens cl. (24)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "NOT linked (no PermissionRelationship row) to ind_lien_cl6_linked_scf/_capex — independent, additive, non-netted pool per the addendum's central resolved question (docs/coherent-phase1-stacking-table.md §C.2/E-3). The absence of a SharedCapacityConstraint here IS the affirmative finding, not an oversight.",
      },
      {
        id: P.indLienCl25General,
        companyId: COMPANY_ID,
        documentId: IND_ID,
        code: "ind_lien_cl25_general",
        grantType: "LIEN",
        amountKind: "FIXED",
        action: "Secure other obligations, general fixed/grower basket",
        entityScope: [],
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 530,
        params: { pctEbitda: 0.4 },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Permitted Liens cl. (25)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes: "Independent, additive, non-netted vs. clause (6) — same E-3 finding. COMBINABLE with cl.(24) (Permitted Liens def. closing proviso (x)) — no relationship row needed; independence is the default.",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 4. Permissions — Credit Agreement, debt
  // -------------------------------------------------------------------------
  await prisma.permission.createMany({
    data: [
      {
        id: P.caGeneral601k,
        companyId: COMPANY_ID,
        documentId: CA_ID,
        code: "ca_general_debt_601k",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur debt under the General Debt Basket",
        entityScope: [],
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 786,
        params: { pctEbitda: 0.55 },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§6.01(k)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "Greater of $786,000,000 / 55% Adjusted Consolidated EBITDA (current, post-Amendment-No.-4 figures). Reduced dollar-for-dollar by amounts used as Reallocated Amount per §6.01(k)'s own proviso — modeled via SharedCapacityConstraint coh-scc-reallocated-amount, subject to the documented engine gap (this script's header, item 2): the feed direction into ca_incr_cashcapped is NOT enforced by the live solver as of this population. Source: docs/coherent-phase1-stacking-table.md §C.12, §S.",
      },
      {
        id: P.caIncrCashCapped,
        companyId: COMPANY_ID,
        documentId: CA_ID,
        code: "ca_incremental_cash_capped",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur debt under the Cash-Capped Incremental Facility",
        entityScope: [],
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 1428,
        params: { pctEbitda: 1.0 },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Incremental Amount def., clause (x)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "BASE FORMULA ONLY: greater of $1,428,000,000 / 100% Adjusted Consolidated EBITDA. Does NOT include the Reallocated Amount add-on (unused §6.01(k) capacity) — see this script's header item 2 for the confirmed engine gap that prevents faithfully modeling that feed with the existing SharedCapacityConstraint primitive. This UNDERSTATES true Cash-Capped capacity (conservative direction, never overstates). Drawn last in the mandatory Incremental ordering (Ratio-Based → Prepayment-Based → Cash-Capped) — ordering is NOT separately enforced by the live solver (no ordering primitive exists in lib/solver/election.ts beyond relationship-driven concurrent treatment); flagged as a further engine limitation in the report. Source: docs/coherent-phase1-stacking-table.md §C.12/§N.",
      },
      {
        id: P.caIncrRatioUnsecJr,
        companyId: COMPANY_ID,
        documentId: CA_ID,
        code: "ca_incremental_ratio_based_unsecured_or_junior",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur debt under the Ratio-Based Incremental Facility, unsecured or junior-secured (unlimited if TNL ≤ 4.25x)",
        entityScope: [],
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 4.25,
        params: { debtBasis: "total" },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "Incremental Amount def., clause (y); §6.11(a)",
        definedTermRefs: ["Total Net Leverage Ratio"],
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "thresholdValue=4.25 is the CURRENT §6.11(a) baseline — confirmed no Financial Covenant Step-Up currently active (no Material Acquisition since the Amendment No. 4 Effective Date, 9/26/2025; docs/coherent-phase8-blocker-closure.md §B item 3). This is DATA (a snapshot of current contractual state), not a hardcoded solver-source constant — see coh-rac-6-11a-stepup below and this script's header item 5 for why the step-up mechanic itself is not live-computed by the engine. The pari passu-secured Ratio-Based prong (First Lien SNLR ≤ 2.75x, Template INC-1) is NOT populated — see header item 1.",
      },
      {
        id: P.caIncrPrepayment,
        companyId: COMPANY_ID,
        documentId: CA_ID,
        code: "ca_incremental_prepayment_based",
        grantType: "DEBT_INCURRENCE",
        amountKind: "FIXED",
        action: "Incur debt under the Prepayment-Based Incremental Facility",
        entityScope: [],
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 502,
        measurementBasis: "PREPAYMENT_CREDIT",
        sectionRef: "Incremental Amount def., clause (z)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "$502M — cumulative qualifying voluntary Term Loan prepayments per Coherent's FY2026 10-K liquidity disclosure / prisma/seed-data.ts's own ledger entry ('TLB voluntary prepayments during FY26 ($502M of $509M total)', dated 2026-06-30). Modeled as a static, dated snapshot value (FLAT_AMOUNT) — the solver does not dynamically recompute PREPAYMENT_CREDIT from LedgerEntry rows in this population pass (the same ledger-to-Permission wiring gap already noted for SharedCapacityConstraint.currentUsage in lib/covenant-engine.ts's loadCompanySolverStaticData). Must be refreshed whenever new qualifying prepayments occur. Source: prisma/seed-data.ts COHERENT_LEDGER_ENTRIES; docs/coherent-phase1-stacking-table.md §C.13/Template INC-3.",
      },
      {
        id: P.caPermitted601p,
        companyId: COMPANY_ID,
        documentId: CA_ID,
        code: "ca_permitted_debt_601p",
        grantType: "DEBT_INCURRENCE",
        amountKind: "INCURRENCE_BASED",
        action: "Incur debt under the General Permitted Debt catch-all (unlimited if TNL ≤ 4.25x, no Default/EOD)",
        entityScope: [],
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 4.25,
        params: { debtBasis: "total" },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§6.01(p)",
        definedTermRefs: ["Total Net Leverage Ratio"],
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "thresholdValue=4.25 is the CURRENT §6.11(a) value (see caIncrRatioUnsecJr's notes — same basis). §6.01(p)'s own cross-reference directly confirmed corrected to '§6.11(a)' (not the erroneous '§6.11(i)') per docs/coherent-phase1-stacking-table.md §C.14/Row D. No independent lien link — secured use of this basket requires independent §6.02(kk) clearance (not automatically lien-eligible under §6.02(hh), which names only §6.01(b)/(v)).",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 5. Permissions — Credit Agreement, liens
  // -------------------------------------------------------------------------
  await prisma.permission.createMany({
    data: [
      {
        id: P.caLienHhLinkedV,
        companyId: COMPANY_ID,
        documentId: CA_ID,
        code: "ca_lien_hh_linked_601v",
        grantType: "LIEN",
        amountKind: "FIXED",
        action: "Secure debt Incurred under §6.01(v) (Incremental Amount) as Other First Lien or Junior Lien — automatic, no independent ceiling",
        entityScope: [],
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 0,
        params: { automaticLinkOnly: true },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§6.02(hh)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "AUTOMATIC_LINKED_PERMISSION from caIncrCashCapped/caIncrRatioUnsecJr/caIncrPrepayment. Extends to §6.01(m) guarantees of that debt (not separately modeled as its own leg — immaterial for a max-new-money-capacity analysis). Priority tier modeled as PARI_PASSU (Other First Lien) by default; the Junior Lien alternative is a transaction-specific structuring election not separately distinguished in this population (limitation noted in report). Source: docs/coherent-phase1-stacking-table.md §C.11 Row CA-L2.",
      },
      {
        id: P.caLienGeneral602kk,
        companyId: COMPANY_ID,
        documentId: CA_ID,
        code: "ca_general_lien_602kk",
        grantType: "LIEN",
        amountKind: "FIXED",
        action: "Secure obligations under the General Lien Basket",
        entityScope: [],
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 786,
        params: { pctEbitda: 0.55 },
        measurementBasis: "CURRENTLY_OUTSTANDING",
        sectionRef: "§6.02(kk)",
        modelingStatus: "MODELED",
        reviewStatus: VERIFIED,
        notes:
          "Greater of $786,000,000 / 55% Adjusted Consolidated EBITDA (current, post-Amendment-No.-4 figures). Independent of ca_lien_hh_linked_601v — no netting (docs/coherent-phase1-stacking-table.md §J, CA-side analogue of the Indenture's E-3 finding). Combinable with itself and other CA lien permissions per §6.02's own closing paragraph.",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 6. Collateral scopes for linked liens
  // -------------------------------------------------------------------------
  await prisma.permissionCollateralScope.createMany({
    data: [
      { id: "coh-pcs-ind-cl6-scf", permissionId: P.indLienCl6Scf, collateralPoolId: "coh-pool-ind-general", priorityTier: "FIRST" },
      { id: "coh-pcs-ind-cl6-capex", permissionId: P.indLienCl6Capex, collateralPoolId: "coh-pool-ind-capex-restricted", priorityTier: "FIRST" },
      { id: "coh-pcs-ind-cl24", permissionId: P.indLienCl24Ratio, collateralPoolId: "coh-pool-ind-general", priorityTier: "FIRST" },
      { id: "coh-pcs-ind-cl25", permissionId: P.indLienCl25General, collateralPoolId: "coh-pool-ind-general", priorityTier: "FIRST" },
      { id: "coh-pcs-ca-hh-v", permissionId: P.caLienHhLinkedV, collateralPoolId: "coh-pool-ca-general", priorityTier: "PARI_PASSU" },
      { id: "coh-pcs-ca-kk", permissionId: P.caLienGeneral602kk, collateralPoolId: "coh-pool-ca-general", priorityTier: "FIRST" },
    ],
  });

  // -------------------------------------------------------------------------
  // 7. PermissionRelationship rows
  // -------------------------------------------------------------------------
  await prisma.permissionRelationship.createMany({
    data: [
      // --- Indenture: §13.1(a) proviso, (A)/(B) counted against MILA secured ---
      {
        id: "coh-rel-ind-scfflat-milasec",
        companyId: COMPANY_ID,
        fromPermissionId: P.indScfFlat,
        toPermissionId: P.indMilaSecured,
        relationshipType: "CONCURRENT_COUNTED",
        sourceSectionRef: "§3.3(b)(i) proviso",
        notes: "Component (A)'s usage is given pro forma effect when sizing MILA's SSNL calc, per §3.3(b)(i)'s own proviso (narrower than the general §13.1(a) disregard default). Source: docs/coherent-phase1-stacking-table.md §D, Row I-D1 note / §G row 2.",
      },
      {
        id: "coh-rel-ind-scfgrower-milasec",
        companyId: COMPANY_ID,
        fromPermissionId: P.indScfGrower,
        toPermissionId: P.indMilaSecured,
        relationshipType: "CONCURRENT_COUNTED",
        sourceSectionRef: "§3.3(b)(i) proviso",
        notes: "Same proviso as component (A). Source: docs/coherent-phase1-stacking-table.md §G row 2.",
      },
      // --- Indenture: §13.1(a) general disregard, Fixed vs. other ratio permissions ---
      {
        id: "coh-rel-ind-scfflat-ratiofccr",
        companyId: COMPANY_ID,
        fromPermissionId: P.indScfFlat,
        toPermissionId: P.indRatioFccr,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§13.1(a)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §G.",
      },
      {
        id: "coh-rel-ind-scfgrower-ratiofccr",
        companyId: COMPANY_ID,
        fromPermissionId: P.indScfGrower,
        toPermissionId: P.indRatioFccr,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§13.1(a)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §G.",
      },
      {
        id: "coh-rel-ind-capex-ratiofccr",
        companyId: COMPANY_ID,
        fromPermissionId: P.indCapex,
        toPermissionId: P.indRatioFccr,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§13.1(a)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §G.",
      },
      {
        id: "coh-rel-ind-general-ratiofccr",
        companyId: COMPANY_ID,
        fromPermissionId: P.indGeneral,
        toPermissionId: P.indRatioFccr,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§13.1(a)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §G.",
      },
      {
        id: "coh-rel-ind-capex-milasec",
        companyId: COMPANY_ID,
        fromPermissionId: P.indCapex,
        toPermissionId: P.indMilaSecured,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§13.1(a)",
        notes: "General rule (no narrower proviso applies to this pair). Source: docs/coherent-phase1-stacking-table.md §G row 4.",
      },
      {
        id: "coh-rel-ind-general-milasec",
        companyId: COMPANY_ID,
        fromPermissionId: P.indGeneral,
        toPermissionId: P.indMilaSecured,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§13.1(a)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §G row 4.",
      },
      // --- Indenture: MILA unsecured ALTERNATIVE + bxv ALTERNATIVE ---
      {
        id: "coh-rel-ind-mila-unsec-alt",
        companyId: COMPANY_ID,
        fromPermissionId: P.indMilaUnsecTnl,
        toPermissionId: P.indMilaUnsecFccr,
        relationshipType: "ALTERNATIVE",
        groupKey: "ind-mila-unsecured",
        sourceSectionRef: "Maximum Leverage Requirement(b)",
        notes: "Either path independently sufficient. Source: docs/coherent-phase1-stacking-table.md §C.3, Row I-D3.",
      },
      {
        id: "coh-rel-ind-bxv-alt",
        companyId: COMPANY_ID,
        fromPermissionId: P.indBxvRatioDebtPath,
        toPermissionId: P.indBxvFccrNoWorsePath,
        relationshipType: "ALTERNATIVE",
        groupKey: "ind-bxv-leverage-neutral",
        sourceSectionRef: "§3.3(b)(xv)",
        notes: "Source: docs/coherent-phase8-blocker-closure.md §H, row (xv).",
      },
      // --- Indenture: automatic linked liens ---
      {
        id: "coh-rel-ind-link-scfflat",
        companyId: COMPANY_ID,
        fromPermissionId: P.indScfFlat,
        toPermissionId: P.indLienCl6Scf,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "Permitted Liens cl. (6)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §C.7 Row I-L4a.",
      },
      {
        id: "coh-rel-ind-link-scfgrower",
        companyId: COMPANY_ID,
        fromPermissionId: P.indScfGrower,
        toPermissionId: P.indLienCl6Scf,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "Permitted Liens cl. (6)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §C.7 Row I-L4a.",
      },
      {
        id: "coh-rel-ind-link-milasec",
        companyId: COMPANY_ID,
        fromPermissionId: P.indMilaSecured,
        toPermissionId: P.indLienCl6Scf,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "Permitted Liens cl. (6)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §C.7 Row I-L4a.",
      },
      {
        id: "coh-rel-ind-link-capex",
        companyId: COMPANY_ID,
        fromPermissionId: P.indCapex,
        toPermissionId: P.indLienCl6Capex,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "Permitted Liens cl. (6) proviso",
        notes: "Asset-scope-restricted. Source: docs/coherent-phase1-stacking-table.md §C.7 Row I-L4b.",
      },
      // --- Credit Agreement: §1.07(b) general disregard ---
      {
        id: "coh-rel-ca-general601k-incrunsecjr",
        companyId: COMPANY_ID,
        fromPermissionId: P.caGeneral601k,
        toPermissionId: P.caIncrRatioUnsecJr,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§1.07(b)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §I.",
      },
      {
        id: "coh-rel-ca-general601k-permitted601p",
        companyId: COMPANY_ID,
        fromPermissionId: P.caGeneral601k,
        toPermissionId: P.caPermitted601p,
        relationshipType: "CONCURRENT_DISREGARDED",
        sourceSectionRef: "§1.07(b)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §I.",
      },
      // --- Credit Agreement: automatic linked liens ---
      {
        id: "coh-rel-ca-link-cashcapped",
        companyId: COMPANY_ID,
        fromPermissionId: P.caIncrCashCapped,
        toPermissionId: P.caLienHhLinkedV,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "§6.02(hh)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §C.11 Row CA-L2.",
      },
      {
        id: "coh-rel-ca-link-ratiounsecjr",
        companyId: COMPANY_ID,
        fromPermissionId: P.caIncrRatioUnsecJr,
        toPermissionId: P.caLienHhLinkedV,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "§6.02(hh)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §C.11 Row CA-L2.",
      },
      {
        id: "coh-rel-ca-link-prepayment",
        companyId: COMPANY_ID,
        fromPermissionId: P.caIncrPrepayment,
        toPermissionId: P.caLienHhLinkedV,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: "§6.02(hh)",
        notes: "Source: docs/coherent-phase1-stacking-table.md §C.11 Row CA-L2.",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 8. SharedCapacityConstraint — E-1 Non-Guarantor Ratio Debt sub-cap
  //    (Indenture §3.3(a) proviso) and Reallocated Amount (CA §6.01(k), see
  //    header item 2 for the documented engine-consumption gap).
  // -------------------------------------------------------------------------
  await prisma.sharedCapacityConstraint.create({
    data: {
      id: "coh-scc-nonguarantor-ratiodebt",
      companyId: COMPANY_ID,
      name: "Non-Guarantor Restricted Subsidiary sub-cap on Ratio Debt",
      capFormulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      capParams: { pctEbitda: 0.3, thresholdValue: 400 },
      capAmount: null,
      aggregationRule: "ENTITY_CLASS_FILTER",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      sourceSectionRef: "§3.3(a) proviso",
      members: { create: [{ entityClass: "NON_GUARANTOR_RS" }] },
    },
  });
  await prisma.sharedCapacityConstraint.create({
    data: {
      id: "coh-scc-reallocated-amount",
      companyId: COMPANY_ID,
      name: "General Debt Basket / Reallocated Amount pool (CA §6.01(k) <-> Cash-Capped Incremental)",
      capFormulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      capParams: { pctEbitda: 0.55, thresholdValue: 786 },
      capAmount: null,
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      sourceSectionRef: "§6.01(k) proviso; Incremental Amount def. clause (x)(2)",
      members: { create: [{ permissionId: P.caGeneral601k }] },
    },
  });

  // -------------------------------------------------------------------------
  // 9. RuleActivationCondition — provenance rows (see header items 5/6 for
  //    which effects are actually consumed by the live solver today).
  // -------------------------------------------------------------------------
  await prisma.ruleActivationCondition.createMany({
    data: [
      {
        id: "coh-rac-6-11a-stepup",
        companyId: COMPANY_ID,
        permissionId: null,
        covenantSectionIds: ["6.11(a)"],
        companyWide: false,
        predicateKind: "EVENT_TRIGGERED",
        predicateConfig: {
          kind: "EVENT_TRIGGERED",
          description: "Financial Covenant Step-Up (4.25x -> 4.75x TNL threshold) active for 4 fiscal quarters following the closing of a Material Acquisition (>=$500M), subject to a 2-consecutive-quarter Cool Down Period and re-trigger rule.",
          sinceEvent: "MaterialAcquisitionClosed",
          until: "CoolDownPeriodExpired",
        },
        effect: "PARAMETER_VALUE",
        parameterName: "totalNetLeverageThreshold",
        sourceSectionRef: "§6.11(a)",
      },
      {
        id: "coh-rac-collateral-suspension",
        companyId: COMPANY_ID,
        permissionId: null,
        // Deliberately NOT companyWide and NOT matching any populated
        // Permission's own sectionRef: this row exists purely for provenance
        // (it documents the mechanic per this script's header item 6). A
        // companyWide=true row would apply lib/solver/graph.ts's
        // resolveApplicability to EVERY permission in the company (not just
        // the dormant Priority Debt baskets it is actually about), and -
        // since the mechanic correctly evaluates to `false` given zero
        // "InvestmentGradeRatingTriggerDate" events in ActivationState - that
        // would incorrectly BLOCK every Coherent permission, not just the
        // two dormant §6.01(ee)/§6.02(pp) baskets this condition is actually
        // scoped to (which are, correctly, not populated - see header item
        // 6). Discovered by this population's own shadow-run smoke test.
        covenantSectionIds: ["6.01(ee)", "6.02(pp)"],
        companyWide: false,
        predicateKind: "EVENT_TRIGGERED",
        predicateConfig: {
          kind: "EVENT_TRIGGERED",
          description:
            "Collateral Suspension Period — from the Investment Grade Rating Trigger Date (Investment Grade Rating from >=2 of S&P/Moody's/Fitch, no Term B Loans outstanding, no Default/EOD, officer's certificate delivered) until a Secured Covenant Reinstatement Event. Confirmed NOT ACTIVE as of the current reporting date: Term B Loans outstanding $1,080.0M as of 6/30/2026 independently bars the trigger; current ratings (Fitch/S&P both 'BB') independently corroborate.",
          sinceEvent: "InvestmentGradeRatingTriggerDate",
          until: "SecuredCovenantReinstatementEvent",
        },
        effect: "APPLICABILITY",
        sourceSectionRef: "Annex V (Schedule 6.09)",
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 10. SolverCoverageDeclarations
  //     Verified programmatically below (step 11) BEFORE these are written —
  //     see the assertion block.
  // -------------------------------------------------------------------------
  const declarations: { documentId: string; side: string; grantType: "DEBT_INCURRENCE" | "LIEN"; notes: string }[] = [
    {
      documentId: IND_ID,
      side: "secured",
      grantType: "DEBT_INCURRENCE",
      notes:
        "Indenture / secured / debt. Excludes ind_contribution_indebtedness_bxviii (measurement-basis gap, header item 3) — a REAL, material Indenture debt basket, so this declaration is complete relative to the modeled inventory but that inventory is itself known-incomplete. See report §M.",
    },
    {
      documentId: IND_ID,
      side: "unsecured",
      grantType: "DEBT_INCURRENCE",
      notes: "Indenture / unsecured / debt. Same bxviii omission as secured/debt.",
    },
    {
      documentId: IND_ID,
      side: "secured",
      grantType: "LIEN",
      notes: "Indenture / secured / liens.",
    },
    {
      documentId: CA_ID,
      side: "secured",
      grantType: "DEBT_INCURRENCE",
      notes:
        "Credit Agreement / secured / debt. Excludes the Ratio-Based Incremental Facility's pari passu-secured prong (First Lien SNLR — header item 1) and the Reallocated Amount add-on to Cash-Capped (header item 2, understates capacity conservatively).",
    },
    {
      documentId: CA_ID,
      side: "unsecured",
      grantType: "DEBT_INCURRENCE",
      notes: "Credit Agreement / unsecured / debt.",
    },
    {
      documentId: CA_ID,
      side: "secured",
      grantType: "LIEN",
      notes: "Credit Agreement / secured / liens.",
    },
  ];

  // -------------------------------------------------------------------------
  // 11. Coverage-integrity assertion — programmatically verify every
  //     Permission this population intends as part of a scope is MODELED
  //     before marking a SolverCoverageDeclaration.isComplete=true. This is
  //     the same check tests/solver/coverage-integrity.test.ts re-runs as a
  //     regression guard (task §11).
  // -------------------------------------------------------------------------
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
    data: declarations.map((d) => ({
      companyId: COMPANY_ID,
      documentId: d.documentId,
      side: d.side,
      grantType: d.grantType,
      isComplete: true,
      notes: d.notes,
    })),
  });

  // -------------------------------------------------------------------------
  // 12. Summary
  // -------------------------------------------------------------------------
  const [permCount, relCount, sccCount, racCount, declCount, poolCount, pcsCount] = await Promise.all([
    prisma.permission.count({ where: { companyId: COMPANY_ID } }),
    prisma.permissionRelationship.count({ where: { companyId: COMPANY_ID } }),
    prisma.sharedCapacityConstraint.count({ where: { companyId: COMPANY_ID } }),
    prisma.ruleActivationCondition.count({ where: { companyId: COMPANY_ID } }),
    prisma.solverCoverageDeclaration.count({ where: { companyId: COMPANY_ID } }),
    prisma.collateralPool.count({ where: { companyId: COMPANY_ID } }),
    prisma.permissionCollateralScope.count({ where: { permission: { companyId: COMPANY_ID } } }),
  ]);
  console.log("Population complete:");
  console.log(`  Permissions: ${permCount}`);
  console.log(`  PermissionRelationships: ${relCount}`);
  console.log(`  SharedCapacityConstraints: ${sccCount}`);
  console.log(`  RuleActivationConditions: ${racCount}`);
  console.log(`  SolverCoverageDeclarations: ${declCount}`);
  console.log(`  CollateralPools: ${poolCount}`);
  console.log(`  PermissionCollateralScopes: ${pcsCount}`);
  console.log("\nPROVISIONAL — ENGINEERING-VERIFIED ONLY. No outside-counsel confirmation. See docs/coherent-phase8-population-reconciliation.md §U.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
