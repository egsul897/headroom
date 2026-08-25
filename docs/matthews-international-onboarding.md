# Matthews International Corporation (NASDAQ: MATW) — Company B Onboarding

Status: engineering-verified only, no outside-counsel confirmation. Every golden-question row created by this pass is `UNVERIFIED` — none has been self-promoted to `FOUNDER_AND_PEER_REVIEWED`. Legal review of Matthews' conclusions is a separate, later phase, not begun here (same discipline as Coherent's own review sequencing — see `docs/legal-review-status-model.md`).

This document reports the first onboarding of a second real capital structure onto the generalized permission/solver engine and financial-core vertical slice, both built and verified against Coherent Corp. and synthetic fixtures only until now. Section lettering below is adapted from the Coherent phase docs (`docs/coherent-phase1-stacking-table.md`, `docs/coherent-phase8-population-reconciliation.md`) to fit this single combined deliverable.

---

## THE HEADLINE METRIC

**`lib/covenant-engine.ts` / `lib/solver/**` / `lib/financial-core/**` / `lib/financial-core-db/**` / `prisma/schema.prisma` source-code lines changed to onboard Matthews: 0.**

Confirmed by:

```
git diff <starting-commit> -- lib/covenant-engine.ts lib/solver/ lib/financial-core/ lib/financial-core-db/ prisma/schema.prisma
```

which produces empty output — zero hunks, zero lines. Every fact, threshold, and structural choice below was represented using the EXISTING `Permission` / `PermissionRelationship` / `SharedCapacityConstraint` / `CollateralPool` / `PermissionCollateralScope` / `IntercreditorAgreement` / `SolverCoverageDeclaration` / `ExternalInputRecord` / `FinancialState` / `Facility` / `DebtEvent` primitives, through two new, Matthews-only population scripts:

- `scripts/populate-matthews-solver-native.ts` — Company/Document rows, the solver-native contract model, and the one legacy `FinancialSnapshot` row the shared leaf-calculation boundary requires.
- `scripts/populate-matthews-financial-provenance.ts` — `FinancialState`/`Facility`/`DebtEvent` rows, linked `ExternalInputRecord` provenance, and all 18 `GoldenTest` rows.

Neither script contains a single `if (companyId === 'matthews')`-style branch inside shared code — they are pure data-population scripts, structurally identical in kind to `scripts/populate-coherent-solver-native.ts`/`scripts/populate-coherent-ebitda-provenance.ts`, which they were written to mirror.

Where a genuine capability gap was found, it is named explicitly below and left `UNKNOWN_REVIEW_REQUIRED`/documented rather than worked around. Two of the four gaps found are **confirmed recurrences** of gaps Coherent's own population already documented (not new); one is a genuinely new candidate capability (§F.3); one is a structural finding, not a gap at all (§F.1).

---

## §A — Source inventory

All documents were fetched directly from EDGAR (`https://www.sec.gov/Archives/edgar/...`, `User-Agent: Headroom Research research@example.com`) and read from the fetched text only — no characterization from outside sources.

| Document | Form | Accession | Exhibit/file | Date | Read |
|---|---|---|---|---|---|
| Indenture, 8.625% Senior Secured Second Lien Notes due 2027 | 8-K | 0001193125-24-228450 | Ex. 4.1, `d873825dex41.htm` | filed 2024-09-30, dated 2024-09-27 | Full text (~495K chars) |
| Intercreditor Agreement | 8-K (same) | 0001193125-24-228450 | Ex. 10.3, `d873825dex103.htm` | dated 2024-09-27 | Full text |
| 8-K body (Notes issuance announcement) | 8-K | 0001193125-24-228450 | `d873825d8k.htm` | filed 2024-09-30 | Full text |
| Sixth Amendment to Third A&R Loan Agreement | 8-K | 0001193125-24-224129 | Ex. 10.2, `d872508dex102.htm` | filed 2024-09-24, dated 2024-09-23 | Full text |
| **Third Amended and Restated Loan Agreement (base Credit Agreement)** | 8-K | 0000063296-20-000040 | Ex. 10.1, `ex101loanagreement.htm` | filed 2020-03-30, dated 2020-03-27 | **Located and fetched — full text (~392K chars)** |
| First Amendment to Third A&R Loan Agreement | 10-Q | 0000063296-21-000048 | `firstamendmenttothirdamend.htm` | dated 2021-03-30 | Fetched, skimmed for amendment-chain confirmation |
| Third Amendment to Third A&R Loan Agreement | 10-K | 0000063296-22-000099 | `thirdamendmenttothirdamend.htm` | dated 2022-07-01 | Fetched, skimmed |
| Fourth Amendment to Third A&R Loan Agreement | 10-Q | 0000063296-23-000044 | `fourthamendmenttothirdamen.htm` | dated 2023-03-17 | Fetched, skimmed |
| Fifth Amendment to Third A&R Loan Agreement | 8-K | 0000063296-24-000010 | `fifthamendmenttothirdamend.htm` | dated 2024-01-31 | Fetched, skimmed |
| Anchor 10-Q (quarter ended 12/31/2024) | 10-Q | 0000063296-25-000006 | `matw-20241231.htm` | filed 2025-02-07 | Full text |
| FY2024 10-K (year ended 9/30/2024) | 10-K | 0000063296-24-000094 | `matw-20240930.htm` | filed 2024-11-22 | Full text (income statement, cash-flow statement) |
| Redemption 8-K | 8-K | 0000063296-26-000006 | `matw-20260112.htm` | filed 2026-01-12 | Full text |

**Amendment-chain reconstruction, confirmed from the Sixth Amendment's own recitals (§WHEREAS clause):** Third A&R Loan Agreement dated 3/27/2020, as amended by (i) First Amendment 3/30/2021, (ii) Second Amendment 12/27/2021, (iii) Third Amendment 7/1/2022, (iv) Fourth Amendment 3/17/2023, (v) Fifth Amendment 1/31/2024, (vi) Sixth Amendment 9/23/2024. **All six amendment documents were independently located via EDGAR full-text search** (`efts.sec.gov/LATEST/search-index?q="Third Amended and Restated Loan Agreement"&cik=0000063296`) and confirmed against this recital list — the full amendment chain is accounted for, unlike the open question flagged in the task brief. The Second Amendment's own exhibit filename was not independently isolated (recital-confirmed only, not separately fetched) — noted, immaterial (no Second-Amendment-specific fact is relied upon below).

**Note on the Sixth Amendment's own scope** (confirmed directly from its text, not assumed): it is narrow and targeted — it amends §1.01 (definitions), §6.01 (Liens), §6.02 (Restrictions on Non-Loan Party Subsidiaries), §6.04 (Disposition of Assets), §6.07 (Double Negative Pledge), and §7.01(h)/(i) (Events of Default) to accommodate the Notes issuance and the resulting lien-priority restructuring. It confirms explicitly that "the aggregate principal amount of $750 million available under the Credit Facility remain[s] unchanged." **It does NOT restate §5.14 (Financial Covenants) or Article VI's other sections** — the substantive maintenance-covenant levels and the base Liens-covenant structure not touched by the Sixth Amendment come from the 2020 base agreement as modified by whichever of Amendments 1-5 touched them (not individually diffed against §5.14 in this pass — flagged below, §F.1).

**What was NOT independently located:** the exact Article/Section of the Indenture granting the Notes' own second-priority lien in the first instance (as distinct from §4.10, the negative-pledge covenant that protects that lien's priority against later liens) — the 8-K's own Item 1.01 body text is used as the primary citation for the fact of the second-priority lien instead (§C.2 below). The Existing Notes' (2017 5.250% Senior Notes due 2025) precise repayment/redemption mechanics were not independently located — their absence from the anchor 10-Q's own debt table is the primary evidence relied upon (§D below).

---

## §B — Permission inventory / interaction matrix

### B.1 — Credit Agreement (Third A&R Loan Agreement, as amended through the Sixth Amendment)

**Structural finding, confirmed by full-text reading of the Table of Contents and the entirety of Article VI:** the Credit Agreement contains **no negative covenant restricting Indebtedness incurrence at all.** Article VI ("Negative Covenants") runs §6.01 (Liens) → §6.02 (Restrictions on Non-Loan Party Subsidiaries) → §6.03 (Self-Dealing) → §6.04 (Disposition of Assets) → §6.05 (Margin Stock) → §6.06 (Partnerships; Mergers; Acquisitions) → §6.07 (Double Negative Pledge) → §6.08 (Dividends and Distributions). There is no "§6.0x Indebtedness" section, in the original 2020 text or in any of the six amendments read. Debt capacity under the CA is governed instead by:

- **§5.14 Financial Covenants** (a MAINTENANCE covenant, tested quarterly against the Company's actual then-current ratios — a compliance test on the Company's own borrowing, not an incurrence-conditioned basket a transaction must clear). Original 2020 schedule: Leverage Ratio ≤4.50x and Senior Leverage Ratio ≤3.50x (both step down from higher initial levels through 12/31/2020). Whether these exact levels were subsequently amended by Amendments 1-5 was **not independently re-diffed in this pass** — flagged `SOURCE_CHAIN_INCOMPLETE` (§F.1).
- **§6.01 Liens** (the only covenant genuinely gating NEW secured debt — see B.1.1).

This is a real, cited structural difference from Coherent (an incurrence-covenant-style high-yield capital structure) and drives the modeling decision in §B.1.2: **no `DEBT_INCURRENCE` Permission row is created for the Credit Agreement**, and no `SolverCoverageDeclaration` for CA-side `DEBT_INCURRENCE` exists. The absence resolves `NOT_TESTED` via the coverage-gate's existing documented default (`docs/solver-architecture-design.md` §Q.2) — verified live (§E below): a human asking "how much unsecured debt can Matthews incur under the CA alone" gets `NOT_TESTED`, never a fabricated "unlimited."

#### B.1.1 — §6.01 Liens (as restated by the Sixth Amendment, 9/23/2024)

Full text read (both the 2020 original and the Sixth Amendment's restated version, diffed). **Confirmed finding: the Sixth Amendment DELETED the original clause (j)** — "Liens of any Loan Party securing Indebtedness; provided... such Liens shall be limited to Liens on equipment, fixtures, real property and/or proceeds thereof; and provided, further, that the aggregate book value of the assets securing such Indebtedness shall not at any time exceed the [defined term] 'Permitted Amount'" [= $50,000,000 flat, per the original §1.01] — **and replaced it with:**

> (j) Liens securing Indebtedness under the 2024 Note Offering to the extent both (y) the Agent has received the fully executed applicable Security Agreement and has a Prior Security Interest in the Collateral and (z) such Liens are subordinate to the Agent's Liens on the applicable Collateral pursuant to and in accordance with the terms and provisions of the 2024 Note Intercreditor Agreement.

Every other clause of §6.01 ((a) closing-date liens, (b) hedge liens, (c) tax liens, (d)-(h) ordinary-course/statutory carve-outs, (i) Liens of non-Loan-Party Subsidiaries securing their own Indebtedness, (k)-(q) receivables financing/leases/deposit accounts/etc.) is unchanged in substance and immaterial to a new-money secured-capacity analysis.

**Modeled:** `ca_lien_601j_2024notes` (`Permission`, `GrantType.LIEN`) — the sole remaining exception for a Loan Party to grant a NEW secured lien, `AUTOMATIC_LINKED_PERMISSION` (cross-document) from the Indenture's `ind_permitted_debt_2_notes` row (the same $300.0M debt, viewed from the CA's own negative-pledge perspective). `PermissionCollateralScope`: `matw-pool-common`, `priorityTier: SECOND`, `intercreditorAgreementId: matw-ica-2024`.

**Real, cited, zero-capacity finding** (not an `UNKNOWN` — a confirmed answer): as of the current Credit Agreement, **Matthews has zero remaining capacity to grant a NEW secured lien to any Loan-Party creditor other than the 2024 Note Offering itself.** The general $50.0M secured-lien basket that existed from 2020 through the Sixth Amendment is gone.

#### B.1.2 — §5.14 Financial Covenants (maintenance, not modeled as a Permission)

Deliberately NOT represented as a `Permission` row. Rationale (a category distinction, not a gap): the `Permission` model represents incurrence permissions — "what may be done, subject to clearing a precondition." A periodic maintenance test (breach of which is an Event of Default, independent of any specific transaction) is a different kind of thing. This mirrors the same reasoning that would apply to any maintenance-covenant-style facility and is named explicitly as a golden question (§E, row 9) rather than silently omitted.

### B.2 — Indenture (8.625% Senior Secured Second Lien Notes due 2027)

Full text read (§1.01 Definitions in full; §4.09 Limitation on Incurrence of Debt in full; §4.10 Limitation on Liens in full; the "Permitted Debt" and "Permitted Liens" defined-term lists in full; the "Consolidated EBITDA" defined term in full).

#### B.2.1 — §4.09 Limitation on Incurrence of Debt

**Ratio Debt** (§4.09(a)): unlimited Debt if pro forma Consolidated Fixed Charge Coverage Ratio ≥ 2.00x, subject to a Non-Guarantor Subsidiary sub-cap (greater of $125.0M or 7.0% of Total Assets, §4.09(a) proviso). **Modeled:** `ind_ratio_debt_fccr` (`COVERAGE_RATIO_ROOM`, thresholdValue 2.0). Sub-cap modeled via `SharedCapacityConstraint matw-scc-nonguarantor-ratiodebt` at its $125.0M flat floor only — see §F.3 for the Total-Assets-grower gap this represents.

**Permitted Debt** (§4.09(b), 22 enumerated clauses read in full):
- **Clause (1)(a)** — Debt under Debt Facilities (the Credit Agreement) + Qualified Receivables Transactions, up to the sum of a **$1,300.0M flat cap** and a ratio-based add-on. **Modeled:** `ind_permitted_debt_1a_flat` (`FLAT_NET_OF_DEBT`, thresholdValue 1300, `netOfBasis: "secured"`). See §F.2 for the netting imprecision this carries (a confirmed recurrence of a Coherent-documented gap).
- **Clause (1)(b)** — the ratio-based add-on: (x) unlimited if pro forma **Secured Net Leverage Ratio ≤ 3.50x**; AND, for Debt constituting "First Priority Obligations" specifically, (y) unlimited only if pro forma **First Lien Net Leverage Ratio ≤ 2.50x** (a SEPARATE, TIGHTER, priority-specific test). **Modeled:** `ind_permitted_debt_1b_ratio_secured` (`LEVERAGE_RATIO_ROOM`, thresholdValue 3.5, `debtBasis: "secured"`) — clause (x) only. Clause (y) is **NOT modeled** — see §F.1 (a confirmed recurrence of Coherent's own documented First-Lien-SNLR gap).
- **Clause (2)** — Debt under the Notes issued on the Issue Date ($300.0M, already outstanding). **Modeled:** `ind_permitted_debt_2_notes` (`FLAT_AMOUNT`, thresholdValue 300) — a grandfather clause carrying zero NEW capacity, populated for citation/linked-lien completeness.
- **Clause (3)** — the "Existing Notes" (2017 5.250% Senior Notes due 2025). **NOT modeled** — see §D for why (they do not appear in the anchor 10-Q's own debt table).
- **Clauses (4)-(22)** — grandfathered/intercompany/ordinary-course/insurance/refinancing/tax/other carve-outs, all immaterial to a new-money capacity analysis at Matthews' scale (mirroring the same "NOT_MATERIAL_TO_PHASE8"-style disposition Coherent's own population used for its own immaterial clauses). Not populated.

**§4.09(c) concurrency mechanic** (directly evidenced, the Indenture's own analogue of Coherent's §13.1(a)/§1.07(b) "Fixed vs. Ratio disregard"): a concurrent Permitted-Debt incurrence NOT itself relying on a leverage ratio is disregarded when calculating the ratio for a same-date §4.09(a)/cl.(1)(b) incurrence. **Modeled** as four `CONCURRENT_DISREGARDED` `PermissionRelationship` rows (flat cl.(1)(a) and grandfathered cl.(2) debt, each disregarded against both `ind_ratio_debt_fccr` and `ind_permitted_debt_1b_ratio_secured`).

#### B.2.2 — §4.10 Limitation on Liens

Liens on Collateral require "Permitted Liens" status; a Lien securing Debt that isn't a Permitted Lien triggers an equal-and-ratable (or senior) obligation to the Notes. **Permitted Liens clause (2)** is the Indenture's own negative-pledge exception for the Credit Facility's first-priority lien — conditioned on the holders becoming party to the "First Priority/Second Priority Intercreditor Agreement." **Modeled:** `ind_lien_first_creditfacility` (`AUTOMATIC_LINKED_PERMISSION` from both `ind_permitted_debt_1a_flat` and `ind_permitted_debt_1b_ratio_secured`), `PermissionCollateralScope` priority `FIRST`.

The Notes' own second-priority lien grant is stated directly in the 8-K's own Item 1.01 body text ("secured by a second priority lien on substantially all of the Company's and the U.S. Guarantors' assets") — used as the primary citation since the exact Indenture granting-clause (as distinct from §4.10's negative-pledge protection of that lien) was not independently traced to a specific Article/Section. **Modeled:** `ind_lien_second_priority_notes` (`AUTOMATIC_LINKED_PERMISSION` from `ind_permitted_debt_2_notes`), priority `SECOND`.

### B.3 — Intercreditor Agreement, dated 9/27/2024 (Citizens Bank, N.A. / Truist Bank)

Read in full (SECTION 1 Definitions; SECTION 2 Lien Priorities; SECTION 3 Enforcement; SECTION 4 Payments).

**SECTION 2 (Lien Priorities) — IN Phase 1 scope, modeled via the collateral-pool primitive (§C):** §2.1 "Subordination of Liens" establishes that Second Priority Liens on the "Common Collateral" (defined: all assets constituting both Senior Lender Collateral and Second Priority Collateral) are unconditionally subordinate to First Priority Liens "notwithstanding the date, time, method, manner or order of filing or recordation... [or] any defect or deficiency" — a classic "silent second" priority mechanic: priority is purely contractual, never perfection-order-dependent. **No dollar-amount or ratio cap on additional first- or second-lien debt appears anywhere in the Intercreditor Agreement itself** — that gating lives entirely in the Credit Agreement (§6.01) and the Indenture (Permitted Debt cl. (1)), confirmed by reading the ICA's full definitions list (no "Cap Amount"/"Senior Lender Cap"-style defined term exists).

**SECTION 3 (Enforcement) and SECTION 4 (Payments) — confirmed present, read and cited, deliberately NOT modeled:** §3.1 establishes a standstill on the Second Priority Secured Parties' enforcement rights prior to "Discharge of Senior Lender Claims"; §4.1/§4.2 establish payment-waterfall/turnover mechanics. Per `docs/targeted-ontology-closure-test.md`'s own prior finding, enforcement/LME mechanics are explicitly out of Phase 1 scope — no `Permission`/`PermissionRelationship` rows represent these sections, consistent with the instruction given for this task.

**Modeled:** `IntercreditorAgreement` row `matw-ica-2024`, `governs: [{ poolId: "matw-pool-common", counterpartyClass: "First Lien Agent/Senior Lenders vs. Second Priority Agent/Second Lien Notes" }]`.

---

## §C — Collateral pool / priority-tier modeling decision

**This is the single most important ontology test of this onboarding, and it worked on the first real attempt, without any new primitive.**

Matthews' entire secured capital structure — the Credit Agreement's revolver and the Indenture's Notes — is secured by the SAME pool of assets ("Common Collateral," per the Intercreditor Agreement's own defined term: "all of the assets of any Grantor... constituting both Senior Lender Collateral and Second Priority Collateral"), split by CONTRACTUAL PRIORITY, not by asset-scope segregation. This is exactly the structural case `docs/solver-architecture-design.md` §H's `CollateralPool`/`PermissionCollateralScope`/`priorityTier` model was built to handle, and exactly the case the closure-test rounds' Petco/CHS findings anticipated.

**Modeling, as populated:**

- **One `CollateralPool`** (`matw-pool-common`, "Common Collateral — substantially all assets of Matthews and its U.S. domestic subsidiaries") — NOT two pools. Coherent's own model (a flat pari-passu structure among its secured tranches) never needed to distinguish tiers within one pool; Matthews does, and the primitive already supported it.
- **Three `PermissionCollateralScope` rows** on that ONE pool:
  - `ind_lien_first_creditfacility` → `priorityTier: FIRST`
  - `ind_lien_second_priority_notes` → `priorityTier: SECOND`
  - `ca_lien_601j_2024notes` → `priorityTier: SECOND`
- All three carry `intercreditorAgreementId: matw-ica-2024`, linking every scope to the real, cited Intercreditor Agreement that actually governs the FIRST/SECOND relationship between them.

**Contrast with Coherent:** Coherent's own secured tranches (Term Loan A, Term Loan B-3) are PARI_PASSU within one pool — "secured capacity" is one undifferentiated question there. For Matthews, the SAME pool now has two answers depending on priority: the Credit Facility's own ratio-gated growth capacity is tested against the tighter 2.50x First Lien Net Leverage Ratio (not separately modeled — §F.1), while the pool's overall secured capacity (either tier) is tested against the broader 3.50x Secured Net Leverage Ratio (modeled). No schema change, no new enum value, no new table was required to express this distinction — `PriorityTier.FIRST`/`SECOND` plus the existing `intercreditorAgreementId` foreign key carried the entire real-world mechanic.

**Conclusion:** the collateral-pool primitive is validated by this onboarding as a genuinely generalized capability, not an artifact tuned to Coherent's own (simpler) structure.

---

## §D — Financial-input audit (PUBLIC_FILING_RECONSTRUCTION), methodology-order disclosed up front

**Matthews' own filings never disclose a single reconciled dollar EBITDA figure**, under either the Credit Agreement's own simple definition ("EBIT, plus depreciation, depletion and amortization") or the Indenture's much richer "Consolidated EBITDA" defined term (interest + taxes + non-cash items + D&A + capped run-rate-synergy addbacks). The 10-Q states only a qualitative leverage-ratio mechanic ("total indebtedness divided by EBITDA... as defined within the domestic credit facility agreement," used solely to set the revolver's pricing-grid spread) and a bare compliance attestation ("The Company was in compliance with all of its debt covenants as of December 31, 2024" — 10-Q Note 7). Both EBITDA figures therefore require `PUBLIC_FILING_RECONSTRUCTION`.

**Methodology-order disclosure, stated plainly (per the task's explicit instruction — not after the fact):** the build-up below was fixed FROM THE INDENTURE'S OWN "Consolidated EBITDA" DEFINED-TERM TEXT FIRST (fetched and read in full before any dollar figure was computed) — Consolidated Net Income + Interest Expense + Income Taxes (net of any benefit, per the defined term's own clause (2), which SUBTRACTS a tax benefit rather than adding it) + non-cash expenses/losses excluding D&A + D&A. **No target Leverage Ratio, Secured Net Leverage Ratio, or covenant-compliance outcome was in view when this formula was selected** — the formula is a direct transcription of defined-term clauses (1)(a)-(c) and (i), applied ONLY to the specific non-cash items Matthews' own GAAP filings actually disclose as discrete line items on the face of its Consolidated Statements of Cash Flows (goodwill write-downs, asset write-downs, stock-based compensation). Clause (1)(f)'s discretionary "extraordinary/non-recurring" prong and clause (1)(g)'s run-rate-synergy addback are deliberately NOT invoked — no attempt was made to characterize any item as "extraordinary" or to estimate unstated "run-rate" synergies. This is a conservative choice (understates, never overstates, the reconstruction).

**TTM build-up (through 12/31/2024), $M, TTM = FY2024 (10-K, year ended 9/30/2024) + Q1 FY2025 (10-Q, quarter ended 12/31/2024) − Q1 FY2024 (10-Q's own comparative column):**

| Line | FY2024 | Q1 FY2025 | Q1 FY2024 | TTM |
|---|---:|---:|---:|---:|
| Consolidated Net Income (loss) | (59.660) | (3.472) | (2.303) | (60.829) |
| + Interest Expense | 50.534 | 15.682 | 11.576 | 54.640 |
| − Income tax benefit (cl. (2), subtracted) | 9.997 | 2.358 | 0.726 | 11.629 |
| + D&A | 94.770 | 22.504 | 23.523 | 93.751 |
| + Goodwill write-downs (non-cash) | 16.727 | — | — | 16.727 |
| + Asset write-downs (non-cash) | 16.847 | — | — | 16.847 |
| + Stock-based compensation (non-cash) | 18.478 | 4.979 | 4.651 | 18.806 |
| **= Consolidated EBITDA (Indenture-defined, TTM)** | | | | **128.313** |

All source figures cited to the 10-K/10-Q's own Consolidated Statements of Income and Cash Flows (see script header comments for exact line references). This reconstruction is `UNVERIFIED` (`ExternalInputRecord.reviewStatus`, `Permission.reviewStatus` unaffected — reviewStatus there tracks the CONTRACT TEXT transcription, not this financial figure) and `PUBLIC_FILING_RECONSTRUCTION` (`ExternalInputKind`) — never `CERTIFIED_EXTERNAL_INPUT`, per the schema's own hard rule. No compliance certificate exists in this population's source set.

**Balance-sheet inputs** (all `REPORTED`, directly from the 10-Q's own Consolidated Balance Sheet / Note 7): cash $33.513M; total debt $809.211M (revolver $484.083M + 2027 Notes $294.799M net-of-discount + other borrowings $7.869M + finance leases $22.460M); secured debt $778.882M (revolver + Notes only — "other borrowings" and finance leases excluded, not confirmed secured on the Common Collateral pool from primary text — a conservative, disclosed simplification). Assumed new-money rate 8.625% (the Notes' own coupon — a disclosed assumption, not a contractual figure).

**Existing Notes (2017 5.250% Senior Notes due 2025) — not populated:** the anchor 10-Q's own Note 7 debt table lists exactly four debt line items (revolving credit facilities, 2027 Senior Secured Notes, other borrowings, finance leases) — NO 5.250% Senior Notes line item as of 12/31/2024. This directly-observed absence, not an assumption, indicates the 2017 Notes were no longer outstanding by the anchor date (consistent with, but not independently traced to, the September 2024 refinancing). Flagged `SOURCE_CHAIN_INCOMPLETE` for the exact repayment mechanics/date; not populated with a fabricated figure.

---

## §E — Shadow-run / live-solver-path verification

`scripts/matthews-shadow-run.ts` drives Matthews' real financial state through the SAME live application path Coherent uses (`simulateDebtIncurrence(data, position, amount, secured, solverContext)`). Full output reproduced below (abridged for repetition).

**Routing confirmation** (live):

```
Indenture / secured / debt+lien            -> SOLVER_NATIVE   (All 4 Permission rows MODELED)
Indenture / unsecured / debt               -> SOLVER_NATIVE   (All 4 Permission rows MODELED)
Credit Agreement / secured / debt+lien     -> NOT_TESTED      (No SolverCoverageDeclaration for CA/secured/DEBT_INCURRENCE — none exists, by design; see §B.1)
Credit Agreement / unsecured / debt        -> NOT_TESTED      (No SolverCoverageDeclaration for CA/unsecured/DEBT_INCURRENCE)
```

**Maximum capacity** (binary-search-verified, live): Indenture secured maximum = **$631.45M**; Indenture unsecured maximum = **$631.45M** (identical — the Indenture's debt baskets are not secured/unsecured-differentiated, only lien eligibility differs). Decomposition: `ind_permitted_debt_1a_flat` ≈ $521.12M (cl.(1)(a) flat, net of total secured debt) + `ind_ratio_debt_fccr` ≈ $110.34M (FCCR≥2.00x room) = $631.45M; `ind_permitted_debt_1b_ratio_secured` contributes $0 (reconstructed Secured Net Leverage ≈5.81x already exceeds the 3.50x cap).

**Cross-document (Indenture AND Credit Agreement) capacity: `not_tested`, at every amount tested** — because the Credit Agreement never resolves to a status other than `not_tested` (no debt-incurrence coverage declared). This is the correct, honest, live-verified outcome, not a bug: a real question — "what is Matthews' maximum TOTAL new secured debt capacity across both documents" — genuinely cannot be answered as a number without a human first deciding what to do about a facility whose own text imposes no incurrence-covenant ceiling.

**Scenario matrix** (five scenarios run: $50M/$500M/$1,000M secured, $50M/$500M unsecured) — all Indenture-side results consistent with the binary-search maximum; $1,000M secured correctly `blocked` (exceeds $631.45M).

**§20-style non-mutation discipline**: the shadow-run script is read-only (no writes to the database); re-run twice with identical output.

---

## §F — Generalized-capability findings (the zero-source-change accounting)

Every item below was named, not worked around. None resulted in an `if (companyId === 'matthews')`-style branch anywhere in `lib/**`.

### F.1 — Confirmed recurrence: no first-lien-priority-specific `debtBasis`

`LEVERAGE_RATIO_ROOM`'s `params.debtBasis` supports only `"total"`/`"secured"` (`lib/covenant-engine.ts` `DebtBasis` type) — there is no first-lien-specific secured-debt subtotal distinct from junior-secured debt. This is the EXACT gap `scripts/populate-coherent-solver-native.ts`'s header already documented for Coherent (item 1), which Coherent's own capital structure never actually exercised with a real first/second-lien split. **Matthews' Permitted Debt cl.(1)(b)(y) — a real, materially different, tighter 2.50x First Lien Net Leverage Ratio applying only to first-priority debt — is the first real proof this gap matters, not merely a theoretical one.** Not built here (would require a `lib/covenant-engine.ts` change); the narrower test is simply not modeled, which UNDERSTATES the true constraint on first-lien-specific incremental debt (conservative in the sense that the modeled 3.50x test is looser, so a transaction relying on the modeled figure alone could, in principle, exceed the unmodeled 2.50x first-lien-specific cap — flagged explicitly in the golden question set, §E row 14, rather than silently assumed safe).

### F.2 — Confirmed recurrence: `FLAT_NET_OF_DEBT` nets against company-wide debt, not basket-specific outstanding

`ind_permitted_debt_1a_flat`'s $1,300.0M cap is measured, per the Indenture's own text, against Debt-Facilities-and-Qualified-Receivables-Transaction-specific outstanding debt (≈$584.8M: $484.083M revolver + $100.700M sold receivables). The engine's `FLAT_NET_OF_DEBT` formula type only supports netting against the company's TOTAL secured/total debt (`grossDebtOutstanding`, `lib/covenant-engine.ts`), which is what was used ($778.882M) — UNDERSTATING remaining capacity by roughly $194M. This is the exact same pre-existing imprecision `scripts/populate-coherent-solver-native.ts`'s header already documented for its own `P.indScfFlat` row. Confirmed recurrence, not new; not worked around.

### F.3 — NEW candidate capability: no Total-Assets-percentage grower

`GREATER_OF_FLAT_OR_PCT_EBITDA` supports only an EBITDA-percentage grower (`params.pctEbitda`). Matthews' Indenture grows several baskets off a percentage of **Total Assets** instead (the §4.09(a) Non-Guarantor sub-cap: greater of $125.0M or 7.0% of Total Assets — a common high-yield drafting convention this codebase has not previously encountered in Coherent's own baskets, which are all EBITDA-percentage growers). Modeled at the $125.0M flat floor only (numerically close at Matthews' current asset base — 7.0% × $1,791.719M ≈ $125.4M — but the underlying formula-type gap is general and would matter more at a different asset/EBITDA ratio, or for any OTHER company using Total-Assets growers more aggressively). **Named here as a legitimate candidate new generalized capability** — a `GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS` formula type (or a generalized "grower basis" parameter on the existing type) — but NOT built in this pass, since the flat-floor substitution was sufficient and conservative for this onboarding's own fixture.

### F.4 — Structural finding, not a gap: maintenance covenants are out of the Permission model's scope

§5.14's maintenance Leverage Ratio/Senior Leverage Ratio tests are a category mismatch with the incurrence-permission model, not an unmodeled capability (§B.1.2). Named for completeness, not counted as a gap.

### F.5 — `scripts/golden-test.ts` harness limitation (script-level, not `lib/**` — reported per task instruction anyway)

`scripts/golden-test.ts` calls ONLY `loadCompanyCovenantData`/`computeCovenantPosition`/`simulateDebtIncurrence(data, position, amount, secured)` **without ever passing a `solverContext`** — it has NEVER been wired to the solver-native path, for ANY company, including Coherent (Coherent's own solver-native verification runs through the SEPARATE `scripts/coherent-shadow-run.ts`/`scripts/coherent-golden-comparison.ts` scripts instead). This is a pre-existing harness limitation, confirmed here (not introduced by this task): running `npx tsx scripts/golden-test.ts matthews` against Matthews' 18 golden rows produces 2 PASS / 4 FAIL / 10 FLAGGED / 2 ERROR — every capacity-type FAIL/ERROR is because the legacy-only harness cannot see Matthews' solver-native `Permission` rows (Matthews has zero legacy `CovenantProvision` rows, by design — solver-native from the start). The FCCR `LEVERAGE_METRIC` row computed the correct number (`2.3483` vs. hand-computed `2.3486`, well within tolerance) because leverage metrics are computed directly from `FinancialSnapshot` data regardless of provisions — only its `bindingProvision`/`bindingDefinedTerms` assertions failed, for the same underlying reason. The two `expectedStatus: "not_tested"` rows correctly PASS. This is a script, not `lib/**`, so it does not count against the headline metric — but a future fix (passing `solverContext` through `golden-test.ts`) would benefit every future company, not just Matthews, and is recommended as a follow-up (§H).

---

## §G — Golden-question set

18 `GoldenTest` rows, all `status: UNVERIFIED`, created by `scripts/populate-matthews-financial-provenance.ts`. Full text (question, `queryType`/`queryParams`, `expectedAnswer`/`expectedStatus`, `bindingProvision`, `reviewerNotes` with citations) is in that script — not reproduced verbatim here to avoid duplication; the categories:

1. Maximum secured capacity, Indenture alone (`DOCUMENT_CAPACITY`) — $631.45M, live-verified.
2. Maximum unsecured capacity, Indenture alone — $631.45M, live-verified.
3. Cross-document maximum secured capacity (`CROSS_DOCUMENT_CAPACITY`) — `not_tested`, live-verified, correctly reflects the CA's zero-debt-covenant structure.
4. Binding permission(s) at $500M secured (`DEBT_SIMULATION`) — `ind_permitted_debt_1a_flat`.
5. Fixed checkpoint: cl.(1)(a) flat-component remaining room (`PROVISION_CAPACITY`) — $521.12M.
6. Facility-size fact: $750.0M revolver commitment, cross-confirmed from two primary sources (`OUT_OF_SCOPE`-flagged citation row).
7. Ratio mechanics: Secured Net Leverage vs. 3.50x cap — $0 incremental room (already above cap).
8. Ratio mechanics: Consolidated FCCR vs. 2.00x floor — ≈2.35x, above floor.
9. Structural: §5.14 maintenance-vs-incurrence category question.
10. Structural: CA has no debt-incurrence negative covenant at all — `not_tested`, live-verified.
11. Basket size: Non-Guarantor sub-cap ($125.0M) — harness-vocabulary-limited, `OUT_OF_SCOPE`-flagged.
12. Sequential/ledger: no other ledger events besides the confirmed redemption.
13. **NEW category (a):** first-lien/second-lien priority split vs. Coherent's pari-passu structure — the collateral-pool modeling writeup.
14. **NEW category (a):** priority-differentiated ratio test (2.50x first-lien vs. 3.50x general) — confirms §F.1 is materially real.
15. **NEW category (b):** what the Intercreditor Agreement's §2 actually permits/restricts (nothing dollar/ratio — that's in the CA/Indenture).
16. **NEW category (b):** confirms §3/§4 (enforcement/turnover) are out of Phase 1 scope, correctly not modeled.
17. **NEW category (c):** the January 2026 redemption, confirmed from Matthews' own 8-K (not the task prompt's outside characterization).
18. **NEW category (c):** whether redemption restores capacity — explicitly NOT modeled, a documented follow-up, not a guess.

---

## §H — DB population summary

| Table | Coherent (unchanged) | Matthews (new) |
|---|---:|---:|
| `Company` | 1 | 1 |
| `Document` | (unchanged) | 2 |
| `Permission` | 22 | 7 |
| `PermissionRelationship` | 19 | 8 |
| `SharedCapacityConstraint` | 2 | 1 |
| `CollateralPool` | (unchanged) | 1 |
| `PermissionCollateralScope` | (unchanged) | 3 |
| `IntercreditorAgreement` | 0 | 1 |
| `SolverCoverageDeclaration` | (unchanged) | 4 |
| `FinancialSnapshot` (legacy) | (unchanged) | 1 |
| `FinancialState` | 0 | 1 |
| `Facility` | 0 | 2 |
| `DebtEvent` | 0 | 3 |
| `ExternalInputRecord` | (unchanged) | 2 |
| `GoldenTest` | 30 (22 UNVERIFIED + 8 FOUNDER_AND_PEER_REVIEWED) | 18 (all UNVERIFIED) |
| `LegalReviewRecord` | 13 | 0 (legal review is a separate later phase) |

Confirmed via direct `psql` queries against the live database (not assumed): Coherent's counts are byte-identical to their pre-task state; every Matthews `GoldenTest` row carries `status = 'UNVERIFIED'`; zero `LegalReviewRecord` rows exist for `companyId = 'matthews'`.

Scripts: `scripts/populate-matthews-solver-native.ts` (Company/Document/Permission/relationship/collateral/coverage), `scripts/populate-matthews-financial-provenance.ts` (financial-core + golden tests). Both idempotent (delete-then-recreate, scoped strictly to `companyId: 'matthews'`).

`CovenantProvision`/`Document.capacityFormulas` — **deliberately NOT used** for Matthews (going solver-native from the start, per the task's own suggestion). This is why `scripts/golden-test.ts` cannot currently exercise Matthews' figures (§F.5) — a real, structural consequence of that choice, not an oversight.

---

## §I — Full standard test-suite results

All run against the live database with Matthews' rows populated alongside Coherent's, from the working tree at the time of this report.

| Check | Result |
|---|---|
| `npx prisma validate` | ✅ "The schema at prisma/schema.prisma is valid" |
| `npx tsc --noEmit` | ✅ clean, zero errors |
| `npx eslint` (new scripts) | ✅ clean, zero warnings |
| `npm run test` (vitest) | ✅ **199 passed, 0 failed** (19 test files) |
| `npx tsx scripts/golden-test.ts coherent` | ✅ **29 passed, 0 failed, 1 flagged, 0 errored** (30 total) — Coherent's own regression suite, unaffected |
| `npx tsx scripts/coherent-golden-comparison.ts` | ✅ runs clean, same output shape as before |
| `npx tsx scripts/golden-test.ts matthews` | 2 passed, 4 failed, 10 flagged, 2 errored (18 total) — **expected**, diagnostic of the pre-existing legacy-only harness limitation (§F.5), not of wrong Matthews data (independently cross-checked against the live shadow-run, §E) |
| `npx tsx scripts/matthews-shadow-run.ts` | ✅ runs clean; live solver-native routing and capacity figures reported in §E |
| `npx next build` | ✅ "Compiled successfully", all 9 routes generated |

No Coherent regression on any axis.

---

## §J — Recommendation / next steps

1. **Legal review** of every conclusion in this document (a separate, later phase — explicitly not begun here, matching the task's own instruction and Coherent's own review sequencing).
2. **§F.3** (Total-Assets-percentage grower) is the one item here worth prioritizing as an actual generalized-capability build, since it is a common high-yield drafting convention Coherent's own baskets never exercised — likely to recur in Company C.
3. **§F.5** (`scripts/golden-test.ts`'s legacy-only harness) — extending it to accept an optional `solverContext` (mirroring `simulateDebtIncurrence`'s own signature) would let it exercise BOTH Coherent's and Matthews' solver-native rows through one unified regression command, rather than requiring a bespoke shadow-run script per company.
4. **The confirmed January 2026 redemption** (§B.3, §E row 17-18) is a real, clean opportunity to exercise `Document`/`Permission` effective-dating or a second `FinancialState` scenario once the Indenture's own Article 8 (Legal Defeasance and Covenant Defeasance) text is independently fetched and read — flagged as a documented follow-up, not attempted here.
5. **The Existing Notes' (2017, 5.250% due 2025) disposition** (§D) — if a future pass needs Matthews' pre-September-2024 capital structure, the specific repayment/redemption 8-K should be independently located rather than inferred from the anchor 10-Q's own silence.
