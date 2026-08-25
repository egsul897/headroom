/**
 * Matthews International (MATW) golden-question inventory — pure data, no
 * side effects when imported. Extracted out of
 * scripts/populate-matthews-financial-provenance.ts (which still owns
 * writing these rows to the database and the full financial-input
 * methodology disclosure this data set depends on) so it can be imported
 * safely by scripts/backfill-golden-test-stable-keys.ts without triggering
 * that script's own `main()` side effects — importing an executable script
 * purely for its data is unsafe (its `main()` would run on import);
 * importing a pure-data module is not. Mirrors the existing
 * prisma/seed-data.ts pattern used for Coherent's COHERENT_GOLDEN_TESTS.
 */
import { GoldenQueryType } from "@prisma/client";

const IND_ID = "matw-2027-second-lien-notes-indenture";
const CA_ID = "matw-credit-agreement-2020";

// -------------------------------------------------------------------------
// 5. Golden questions — all UNVERIFIED. Modeled on Coherent's categories,
//    NOT copied; includes the three task-specified new categories.
//
//    Each entry carries a `stableKey` ("matthews:qNN", NN = its position in
//    THIS array, 01-18 - see docs/database-replay-safety.md §B). Matthews'
//    golden questions have no pre-existing internal Q-numbering of their
//    own (unlike Coherent's "v1 Q<N>" reviewerNotes tags) - this is a
//    one-time, explicit authoring decision fixing each question's stable
//    identity to its declaration order in this array, not a runtime
//    dependency on array order: rows are upserted by `stableKey` below,
//    never by position. Upserted on `stableKey`, NOT createMany'd fresh
//    each run, so re-running this script preserves any status/
//    reviewerNotes a review script has since written (see step 0 above).
// -------------------------------------------------------------------------
export const MATTHEWS_GOLDEN_TESTS: {
  stableKey: string;
  question: string;
  queryType: GoldenQueryType;
  queryParams?: Record<string, unknown>;
  expectedAnswer: string | null;
  tolerance?: string;
  bindingProvision: string | null;
  bindingDefinedTerms: string[];
  reviewerNotes: string;
  status: "UNVERIFIED";
}[] = [
    // --- Category: maximum secured/unsecured capacity ---
    {
      stableKey: "matthews:q01",
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
      stableKey: "matthews:q02",
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
      stableKey: "matthews:q03",
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
      stableKey: "matthews:q04",
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
      stableKey: "matthews:q05",
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
      stableKey: "matthews:q06",
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
      stableKey: "matthews:q07",
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
      stableKey: "matthews:q08",
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
      stableKey: "matthews:q09",
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
      stableKey: "matthews:q10",
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
      stableKey: "matthews:q11",
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
      stableKey: "matthews:q12",
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
      stableKey: "matthews:q13",
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
      stableKey: "matthews:q14",
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
      stableKey: "matthews:q15",
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
      stableKey: "matthews:q16",
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
      stableKey: "matthews:q17",
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
      stableKey: "matthews:q18",
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
  ];

