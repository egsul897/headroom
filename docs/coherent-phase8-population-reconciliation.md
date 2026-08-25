# Coherent Phase 8 — Solver-Native Population and Shadow-Run Reconciliation

> **SUPERSEDING UPDATE (2026-08-25, legal-model finalization / phase closeout):** The four load-bearing legal conclusions this document is built on (clause 6/24/25 non-netting, EBITDA addback-cap absence, Contribution Indebtedness availability, Collateral Suspension Period current-state determination) have since completed **founder-and-peer legal review** (`FOUNDER_AND_PEER_REVIEWED` — Headroom's founder, an experienced leveraged/debt-finance attorney, plus a second attorney with relevant debt-finance experience). This is sufficient completed legal review for Headroom product-development purposes; no additional outside-counsel review is required as a condition to continue development. **This paragraph and the boxed note in §U are an append-only correction — the rest of this document, including the "PROVISIONAL — ENGINEERING-VERIFIED ONLY" language below, is left exactly as originally written to preserve the chronology (INITIAL STATE: engineering-verified only, legal review not yet completed → THEN: founder-and-peer substantive legal review completed → CURRENT STATE: `FOUNDER_AND_PEER_REVIEWED`, recorded in the `legal_review_records` table and docs/coherent-legal-model-baseline-v1.md).** The one item this update does NOT resolve: Covenant EBITDA is still not a `CERTIFIED_EXTERNAL_INPUT` — that is a separate, still-open **data-provenance** gap, not a legal-review gap (see docs/coherent-legal-model-baseline-v1.md §6). See docs/legal-review-status-model.md for the full status model.

**Every dollar figure in this document was, as of original authorship, PROVISIONAL — ENGINEERING-VERIFIED ONLY.** Outside counsel had NOT confirmed the load-bearing legal conclusions this population is built on (clause 6/24/25 non-netting, EBITDA addback-cap absence, Contribution Indebtedness availability, Collateral Suspension Period current-state determination) — see the superseding update above for the current status. All source verification behind this document is internal, AI-driven review of primary EDGAR text — not independent outside-counsel confirmation, and this document does not claim otherwise even after the update above. See §U for the full ledger. This constraint was given to this task as a precondition and is not re-derived here.

**Recommendation as of original authorship: `READY_WITH_FINANCIAL_INPUT_REVIEW_REQUIRED`.** `READY_TO_UPDATE_GOLDEN_TESTS` was explicitly unavailable for selection per the task's precondition and was **not** selected, regardless of how clean the reconciliation looks. See §T/§U. (This recommendation predates the founder-and-peer review noted above; it is not restated as a new recommendation here — see docs/coherent-legal-model-baseline-v1.md §10 for the current phase-status determination.)

---

## A. Executive verdict

The Phase 1 solver-native model for Coherent's Indenture and Credit Agreement debt/lien sides has been populated from `docs/coherent-phase1-stacking-table.md` and `docs/coherent-phase8-blocker-closure.md`, and run through the real, live application code path (`simulateDebtIncurrence(..., solverContext)`) against Coherent's actual financial state. All 4 required coverage sides (Indenture debt, Indenture liens, Credit Agreement debt, Credit Agreement liens) route **SOLVER_NATIVE** — confirmed live, not merely declared (§C, §F).

Two genuine, pre-existing bugs in the **generalized solver engine** (not Coherent-specific code) were discovered and fixed during this population, purely by exercising the live path with real relationship data for the first time (§J). Several genuine **generalized capability gaps** were identified and deliberately left unfixed, per the task's explicit "STOP and report, do not approximate" instruction (§M).

**Headline PROVISIONAL solver-native figures**, compared to the legacy figures the old model reported:

| | Legacy | Solver-native (PROVISIONAL) |
|---|---|---|
| Max additional secured debt (cross-document) | $4,041M | **$5,130M** |
| Max additional unsecured debt (cross-document) | $5,129M | **$5,130M** |
| Binding document, secured | Indenture (MILA secured, SSNL≤3.00x) | **Credit Agreement** (General Debt Basket + Ratio-Based Incremental, TNL≤4.25x) |
| Indenture secured max (standalone) | $4,041M | **$11,932.8M** |
| Indenture unsecured max (standalone) | $10,153.8M | **$11,932.8M** |
| Credit Agreement secured/unsecured max (standalone) | $5,129M | **$5,130M** |

These are consistent with the task's own expectation (§16): the legacy $4,041M figure changed because the legacy Indenture secured formula treated MILA's SSNL ratio room as the effective ceiling, never adding the clause-(6)-linked SCF/capex baskets' own capacity on top (§C.2's confirmed non-netting finding). The new **binding document flip** (Credit Agreement now tighter than the Indenture for secured debt) is a direct, explainable consequence of that correction, not an anomaly.

---

## B. Configuration populated

`scripts/populate-coherent-solver-native.ts` (idempotent, additive, run against the live dev database):

- **22 `Permission` rows**: 11 Indenture debt, 4 Indenture liens, 5 Credit Agreement debt, 2 Credit Agreement liens.
- **19 `PermissionRelationship` rows**: 8 `CONCURRENT_DISREGARDED`, 2 `CONCURRENT_COUNTED`, 2 `ALTERNATIVE`, 7 `AUTOMATIC_LINKED_PERMISSION`.
- **2 `SharedCapacityConstraint` rows**: the E-1 Non-Guarantor Ratio Debt sub-cap (`ENTITY_CLASS_FILTER`) and the Reallocated Amount pool (`NAMED_MEMBER_CLAUSES`, documented as not fully enforced — §M item 2).
- **2 `RuleActivationCondition` rows**: the §6.11(a) Financial Covenant Step-Up (provenance only — its `PARAMETER_VALUE` effect is not consumed by the live engine, §M item 5) and the Collateral Suspension Period (provenance only, deliberately scoped to match no populated permission — §M item 6).
- **3 `CollateralPool` rows**, **6 `PermissionCollateralScope` rows**.
- **6 `SolverCoverageDeclaration` rows**, each `isComplete: true` only after a programmatic coverage-integrity check (mirrored in `tests/solver/coherent-coverage-integrity.test.ts`) confirmed zero `KNOWN_NOT_MODELED` rows in scope.

Every row carries its `sectionRef`/source citation and `reviewStatus: VERIFIED` — meaning "checked against the executed document's own text" (the schema's `DefinedTermStatus` semantics), **not** "outside counsel confirmed" (§U).

`prisma/seed-data.ts` and `scripts/golden-test.ts` are **untouched** (`git diff` against the pre-task commit `7161c05` shows zero changes to either file); no `golden_tests` row, expected answer, or status changed (30 rows before and after).

---

## C. Coverage declarations — live-verified routing

All 6 declared scopes resolved `SOLVER_NATIVE` in a live `simulateDebtIncurrence(..., solverContext)` call (`scripts/coherent-shadow-run.ts` output, reproduced here):

| Scope | Live routing result |
|---|---|
| Indenture / secured / debt | **SOLVER_NATIVE** |
| Indenture / secured / lien | **SOLVER_NATIVE** |
| Indenture / unsecured / debt | **SOLVER_NATIVE** |
| Credit Agreement / secured / debt | **SOLVER_NATIVE** |
| Credit Agreement / secured / lien | **SOLVER_NATIVE** |
| Credit Agreement / unsecured / debt | **SOLVER_NATIVE** |

**4 of 4 required Phase 1 coverage sides, and all 6 declared (documentId, side, grantType) scopes, actually routed SOLVER_NATIVE in the live shadow run — not merely declared complete.** No scope silently fell back to LEGACY/NOT_TESTED.

---

## D. Financial-input audit

| Input | Value | Measurement date | Source | Source type | Certified vs. reconstructed | Review status | Depends on |
|---|---|---|---|---|---|---|---|
| Covenant EBITDA | $1,700M | (unstated in seed data) | `prisma/seed-data.ts` `COHERENT_DATA.financials.ebitda` | **Plain hardcoded number** — no `sourceType`/certification/provenance field of any kind | **Reconstructed/assumed**, NOT `CERTIFIED_EXTERNAL_INPUT` | Not tracked (the `FinancialSnapshotInput`/`FinancialSnapshot` schema has no provenance columns) | Every EBITDA-percentage basket in both documents; every ratio test |
| Cash | $1,162M | — | seed data | hardcoded | reconstructed | not tracked | net-debt/net-secured leverage calcs |
| Total debt | $3,258M | 6/30/2026 (per `COHERENT_TRANCHES`) | seed data, sums 4 tranches | hardcoded, tranche-level detail present | reconstructed | not tracked | TNL |
| Secured debt | $2,221M | 6/30/2026 | seed data | hardcoded, tranche-level detail present | reconstructed | not tracked | SSNL, First Lien SNLR (blocked, §M item 1) |
| First-lien secured debt (distinct from total secured) | **N/A — does not exist as a field** | — | — | — | — | — | First Lien SNLR — this is exactly why that ratio is NOT populated (§M item 1) |
| Interest expense | $190M | — | seed data | hardcoded | reconstructed | not tracked | FCCR |
| Term B balance | $1,080M (Term Loan B-3) | 6/30/2026 | seed data tranche row, cross-confirmed by `docs/coherent-phase8-blocker-closure.md` §G's own 10-K citation ($1,080,000 thousand) | hardcoded in seed but independently corroborated by the blocker-closure's own primary-source 10-K read | reconstructed in seed / verbatim-cited in the legal doc | not tracked in DB | Collateral Suspension Period trigger (confirmed inactive, §M item 6) |
| Current covenant activation state (Material Acquisition step-up, Collateral Suspension Period) | Both confirmed **inactive/flat** | as of 8/25/2026 reporting date | `docs/coherent-phase8-blocker-closure.md` §B item 3, §G | primary-source (10-K, ratings-agency press releases) | source-verified, not outside-counsel-confirmed | — | §6.11(a) threshold value (4.25 hardcoded onto Permission rows), Priority Debt baskets (deliberately not populated) |

**Finding, stated per task §9's explicit instruction**: Coherent's covenant EBITDA is **not** currently represented as a `CERTIFIED_EXTERNAL_INPUT` anywhere in this codebase — it is a plain `Decimal` column on `FinancialSnapshot`/a plain field on the seed data's `financials` object, with **no** `ExternalInputRecord` row, no `sourceType`, no certification/review-status tracking of any kind. This population did **not** create a new EBITDA reconstruction engine (per task §9's prohibition) and did **not** invent a certified value to make it "look certified" — it consumes the existing `FinancialSnapshotInput.ebitda` field exactly as every other engine calculation already does. **This is an honest limitation to report, not a new defect introduced by this phase**: the blocker-closure document (§D) already established the *correct* sourcing methodology (source the entire EBITDA definition as a `CERTIFIED_EXTERNAL_INPUT` keyed to the Compliance Certificate) — implementing that methodology (adding `ExternalInputRecord` rows and wiring the solver to consume them instead of the raw snapshot field) is a distinct, not-yet-done follow-up task, out of this population's scope.

---

## E. Legacy results (from `scripts/coherent-shadow-run.ts`)

| | Indenture | Credit Agreement | Cross-document (MIN) |
|---|---|---|---|
| Secured max | $4,041M (modeled) | $5,129M (modeled) | **$4,041M** |
| Unsecured max | $10,153.8M (modeled) | $5,129M (modeled) | **$5,129M** |

---

## F. Solver-native results (PROVISIONAL — ENGINEERING-VERIFIED ONLY)

| | Indenture | Credit Agreement | Cross-document (MIN) |
|---|---|---|---|
| Secured max | **$11,932.8M** (EXACT) | **$5,130M** (EXACT) | **$5,130M** |
| Unsecured max | **$11,932.8M** (EXACT) | **$5,130M** (EXACT) | **$5,130M** |

The Indenture secured maximum's winning election is `ind_scf_basket_a_flat` ($1,779M, FIXED, net of secured debt) + `ind_lien_cl6_linked_scf` (automatic lien) + a ratio-based leg providing the rest — sized well above the old $4,041M MILA-secured-alone figure precisely because clause-(6)-linked SCF/capex capacity is now correctly additive to, not netted against, MILA/clause-24/25 capacity (§C.2 of the stacking table). The Indenture unsecured maximum's winning election is `ind_scf_basket_a_flat` + `ind_ratio_debt_fccr` ($1,779M + $10,153.8M = $11,932.8M) via `CONCURRENT_DISREGARDED` — a combination the legacy engine's unsecured formula (`MAX(ratio_debt_fccr, mila_unsecured)`) never considered at all, since it never included the SCF basket in the unsecured side.

---

## G. Side-by-side reconciliation

| Scenario | Legacy | Solver-native | Classification |
|---|---|---|---|
| Max secured (cross-doc) | $4,041M | $5,130M | `LEGACY_MODEL_ERROR` — legacy formula omitted clause-(6)-linked capacity and the CA's §6.02(hh) automatic-linkage effect on the true secured ceiling |
| Max unsecured (cross-doc) | $5,129M | $5,130M | `REPRESENTATION_DIFFERENCE_ONLY` — CA-bound in both; the $1M gap is rounding/threshold-precision, not a methodology difference |
| Binding document, secured | Indenture | Credit Agreement | `LEGACY_MODEL_ERROR` — direct consequence of the above; the CA was never actually the binding document once the Indenture's true (larger) capacity is correctly computed |
| $100M/$500M/$1,000M secured or unsecured (C-E, H-J) | clear | clear | `REPRESENTATION_DIFFERENCE_ONLY` — same verdict, different (and more complete) binding-permission citation |

---

## H. Secured-capacity analysis

The corrected, additive treatment of clause (6) (automatic, ratio-free lien for §3.3(b)(i)/(iv)-sourced debt) alongside clause (24)/(25) (ratio/fixed, independently available) more than doubles the Indenture's own standalone secured ceiling relative to the legacy MILA-only figure. On the Credit Agreement side, §6.02(hh)'s automatic linkage similarly means CA secured capacity is not correctly bounded by the maintenance-covenant ratio tests alone — but because the CA's General Debt Basket + Incremental permissions were already reasonably close in aggregate size to the legacy ratio-cap figure, the CA-side change is small ($5,129M → $5,130M). **The Credit Agreement, not the Indenture, is now the binding document for secured capacity** — a genuine, explainable flip, not noise.

## I. Unsecured-capacity analysis

Indenture unsecured capacity increased from $10,153.8M to $11,932.8M by correctly combining the SCF flat basket with Ratio Debt under §13.1(a)'s general disregard rule (§G row 3 of the stacking table) — a combination the legacy engine's simpler `MAX(ratio, mila)` formula never modeled. CA unsecured capacity is essentially unchanged ($5,129M → $5,130M).

## J. Stacking behavior verification

Verified live via `tests/solver/coherent-stacking-conclusions.test.ts` (10/10 passing) and `tests/solver/coherent-coverage-integrity.test.ts` (4/4 passing): clause-(6) capacity is not netted against clause-(24)/(25) (no relationship row connects them, and Indenture secured max exceeds MILA-alone room); clause (25) is `COMBINABLE` with clause (24) (no `MUTUALLY_EXCLUSIVE` row); linked lien permissions carry `thresholdValue=0`/no independent formula capacity (never "unlimited"); `CONCURRENT_COUNTED` is correctly applied where the §3.3(b)(i) proviso requires it (SCF flat/grower vs. MILA secured) and not elsewhere; `ALTERNATIVE` semantics are correctly used for the MILA unsecured TNL/FCCR pair; an amount exceeding every election's capacity blocks (never partially clears); every leg of a CLEAR secured path carries a corresponding lien leg.

**Two real, generalized solver-engine bugs were found and fixed during this verification work** (both are shared-code fixes, not Coherent-specific — see the two dedicated commits):

1. `lib/covenant-engine.ts`'s `runSolverForDocument` filtered relationships with `eligibleIds.has(from) || eligibleIds.has(to)` (OR). For any UNSECURED transaction on any company with an `AUTOMATIC_LINKED_PERMISSION` relationship, the LIEN endpoint is excluded from `eligiblePermissions`, so the relationship passed the OR filter with a dangling reference and `buildPermissionGraph` threw. **Fixed to require BOTH endpoints in scope.** Without this fix, no unsecured Coherent scenario could be evaluated at all once real relationship data existed — this had never been exercised end-to-end with real cross-linked data before this population.
2. `lib/solver/election.ts`'s `evaluateElection` computed a single/zero-ratio election's `maxCapacity` as `totalAllocated + remaining` — an accounting identity that always equals `requestedAmount` by construction, not an actual capacity figure. This silently made every "maximum capacity" computation echo back whatever amount happened to be probed. **Fixed to sum each `DEBT_INCURRENCE` leg's own `standaloneCapacity`.** Without this fix, every solver-native maximum-capacity figure in this report would have read "$1M" (the probe amount) instead of a real number — confirmed by direct reproduction before the fix (see the two shadow-run transcripts committed in this session's history).

**One real bug was found and fixed in this population's own data** (not engine code): the Collateral Suspension Period `RuleActivationCondition` was initially created with `companyWide: true`, which made `lib/solver/graph.ts`'s `resolveApplicability` apply it (and its correctly-evaluated-`false` result) to **every** Coherent permission, not just the two dormant §6.01(ee)/§6.02(pp) baskets it documents — blocking every single Coherent scenario. Fixed by scoping it to `covenantSectionIds` that match no populated permission (purely documentary, as intended).

All three fixes are recorded in `git log` with their own dedicated commits and full before/after test-suite runs (133 → 133, then 157 → 157 passing).

## K. Linked-lien verification

Every `AUTOMATIC_LINKED_PERMISSION` lien target (`ind_lien_cl6_linked_scf`, `ind_lien_cl6_linked_capex`, `ca_lien_hh_linked_601v`) has `thresholdValue=0` and `params.automaticLinkOnly=true` — structurally impossible to mistake for independent/unlimited capacity. A live CLEAR secured path's explanation trace (`SolverResult.permissionPathUsed.linkedPermissions`) names both the debt permission relied upon and the associated lien permission, satisfying task §6's explicit requirement.

## L. Shared/Reallocated Amount verification

The E-1 Non-Guarantor Ratio Debt sub-cap is populated and — per `tests/solver/coherent-stacking-conclusions.test.ts`'s dedicated test — is actually consulted (a `SHARED_CAP` requirement appears) when the incurring entity is `NON_GUARANTOR_RS`-classed. **The Reallocated Amount mechanic (CA §6.01(k) → Cash-Capped Incremental) is NOT enforced by the live solver** — a confirmed, documented engine gap (§M item 2), not a data gap: `lib/solver/election.ts`'s shared-constraint consumption bounds a permission's shared-constraint allocation by its own standalone formula *before* the constraint is ever consulted, so a `SharedCapacityConstraint` can only ration a permission's capacity downward, never grant it capacity beyond its own formula sourced from another basket's unused headroom. Coherent's Cash-Capped Incremental is therefore populated at its base formula only ($1,428M/100% Adjusted Consolidated EBITDA, no Reallocated Amount add-on) — a conservative (understating, never overstating) omission. Shadow scenario O is marked NOT EXECUTABLE for this reason.

## M. Ratio/alternative-path verification

Shadow scenario Q ($3,000M unsecured) exercised the §3.3(b)(xv) leverage-neutral `ALTERNATIVE` pair live; the solver correctly selected `ind_acquisition_debt_bxv_ratiodebt_path`. The MILA unsecured TNL/FCCR pair is confirmed `ALTERNATIVE` (not `CONCURRENT_*`) by direct DB assertion.

**Generalized capability gaps identified and deliberately not worked around** (full detail in `scripts/populate-coherent-solver-native.ts`'s own header comment):

1. **First Lien Secured Net Leverage Ratio** (Incremental Amount def., pari passu-secured "Ratio-Based" prong, Template INC-1) — **NOT POPULATED**. `LEVERAGE_RATIO_ROOM`'s only `debtBasis` values are `"total"`/`"secured"`; `FinancialSnapshotInput` has one undifferentiated `securedDebt` figure with no first-lien-priority-specific subtotal distinct from junior-secured debt, and no `UnrestrictedCashAmount`-style netting distinct from total cash. Per task §10's explicit instruction, this portion is **stopped, not approximated**.
2. **Reallocated Amount feed** — see §L above.
3. **Contribution Indebtedness** (Indenture §3.3(b)(xviii)) — **NOT POPULATED**. Its measurement basis is a contribution-linked credit (post-Issue-Date cash equity contributions, 210-day window, Officer's-Certificate-designated) with no representation in the `MeasurementBasis` enum (`CUMULATIVE_INCURRED`/`CURRENTLY_OUTSTANDING`/`NET_OF_REPAYMENT`/`PREPAYMENT_CREDIT`). Would also require a `CERTIFIED_EXTERNAL_INPUT` (the Officer's Certificate) that does not exist in Coherent's data.
4. **Fixed→Incurrence-Based reclassification** (§13.1(a)/§1.07(b)) **and** the Incremental Amount's Cash-Capped→Ratio-Based opt-out redesignation — **NOT MODELED**. `lib/solver/election.ts` contains zero reclassification/redesignation logic (confirmed by direct source inspection). Shadow scenario R is NOT EXECUTABLE for this reason.
5. **`RuleActivationCondition.effect === "PARAMETER_VALUE"`** is defined in the type system with a resolver (`resolveParameterValue`, `lib/solver/graph.ts`) but is **never called** from `lib/solver/election.ts` — only `APPLICABILITY`-effect conditions are consumed live. The §6.11(a) step-up's current numeric value (4.25, confirmed flat/no-step-up per the blocker-closure) is written directly onto the affected `Permission.thresholdValue` rows as current-state **data**, not hardcoded into solver source; a future Material Acquisition event would require both an activation-state event feed AND engine wiring work that does not exist today.

## N. StateDelta verification

`tests/solver/live-integration.test.ts` (pre-existing, unmodified, still passing) already proves `StateDelta` internal consistency (postDebt = preDebt + newDebt) for the generic path; this population's own shadow-run additionally confirms non-mutation end-to-end for Coherent specifically (§O below).

## O. Golden-test comparison (read-only; `scripts/coherent-golden-comparison.ts`)

Of the 30 existing `golden_tests` rows: 12 use `DEBT_SIMULATION` (the only query type wired to `simulateDebtIncurrence`, hence the only type with a genuine solver-native counterpart); 11 of those 12 are simple "does $X clear" checks (Q6-Q13, Q17 both spot-checks, Q23) and **match exactly** between legacy and solver-native (both `clear`, difference 0) — consistent with the stacking table's own §R prediction that these verdicts are robust to the methodology correction (capacity only grows). The 12th (Q22, "remaining secured capacity after $500M") shows legacy=$3,541M vs. solver-native=$0, classified **`REPRESENTATION_DIFFERENCE_ONLY`**: `PerDocumentDebtResult.capacity` for a solver-native-routed document means "this specific tested amount clears" (confirmation), not "here is the ceiling" the way legacy's declared `capacity` does — computing a true "remaining capacity" figure requires the separate maximum-capacity call this report's §F already performs, not `sim.overallCapacity - amount` from a fixed-amount probe. This is a representational mismatch between the two `capacity` fields' semantics, not a disagreement about the underlying legal answer.

The remaining 18 rows (`LEVERAGE_METRIC`, `PROVISION_CAPACITY`, `DOCUMENT_CAPACITY`, `CROSS_DOCUMENT_CAPACITY`, `RP_SIMULATION`, `ASSET_SALE_SIMULATION`, `OUT_OF_SCOPE`) have **no solver-native equivalent function in the live application today** — only `simulateDebtIncurrence` accepts a `solverContext`. These are reported N/A with the reason stated, not approximated. Q1/Q2/Q3/Q4/Q25 (the `CROSS_DOCUMENT_CAPACITY`/`DOCUMENT_CAPACITY` max-capacity questions, exactly the ones the stacking table's own §R classified `LEGAL_JUDGMENT_REQUIRED`) fall in this bucket — their solver-native analogue is computed separately in §F above via the live maximum-capacity path, not through the golden-test harness's own query types.

## P. Difference classifications

| Difference | Classification | Recommended action |
|---|---|---|
| Max secured cross-doc: $4,041M → $5,130M | `LEGACY_MODEL_ERROR` | Retire the legacy formula's implicit "MILA-secured-is-the-ceiling" assumption once outside counsel confirms clause 6/24/25 non-netting |
| Binding document flip (Indenture → CA) | `LEGACY_MODEL_ERROR` (consequence of above) | Same |
| Q22 remaining-capacity metric ($3,541M vs $0) | `REPRESENTATION_DIFFERENCE_ONLY` | Fix by computing remaining capacity from the maximum-capacity path, not `overallCapacity - amount`, wherever this metric is surfaced to a solver-native-routed document |
| 18 golden rows with no solver-native equivalent | `UNKNOWN_REVIEW_REQUIRED` (engineering gap, not legal) | Build solver-native equivalents for `PROVISION_CAPACITY`/`DOCUMENT_CAPACITY`/`CROSS_DOCUMENT_CAPACITY` query types before those golden rows can be meaningfully dual-run |
| First Lien SNLR, Reallocated Amount, Contribution Indebtedness, reclassification/redesignation | `SOLVER_ENGINE_ERROR` / `SOLVER_CONFIGURATION_ERROR` (generalized capability gaps, not legal ambiguity) | See §M; each requires new generalized primitives, not Coherent-specific code |

## Q. Generalization audit

Repo-wide inspection for company-specific solver behavior: **none found**. `lib/solver/**` and `lib/covenant-engine.ts`'s solver-routing logic contain zero `if (company === "coherent")`/`if (permissionCode === ...)`-style branches; every behavior difference observed in this report traces to **data** (Coherent's own populated `Permission`/relationship/constraint rows) or to **generalized bug fixes** applied uniformly (§J). The two engine bug fixes touch shared code paths used by every company/document, verified by the pre-existing (non-Coherent) `tests/solver/*` suite passing unchanged before and after (133/133, then 157/157 including the new Coherent-specific tests).

## R. Full test results

- `tsc --noEmit -p tsconfig.json`: **0 errors**.
- `next lint`: **no ESLint warnings or errors**.
- `prisma validate`: **schema valid**.
- `prisma migrate status`: **database schema up to date, 6 migrations, none pending**.
- `vitest run` (full suite): **157 passed, 0 failed** (13 test files, including the 3 new Coherent-specific files — 4 + 10 tests — and the pre-existing 143).
- `npx tsx scripts/golden-test.ts`: **29 passed, 0 failed, 1 flagged out-of-scope, 0 errored** (unchanged from the pre-population baseline).
- `next build`: **compiled successfully**, all 9 routes generated.

## S. Remaining assumptions / review items

1. Covenant EBITDA ($1,700M) is a plain, non-certified seed value — not a `CERTIFIED_EXTERNAL_INPUT` (§D).
2. `SharedCapacityConstraint.currentUsage` is hardcoded to `0` by `loadCompanySolverStaticData` (a pre-existing adapter limitation, not introduced by this population) — Coherent's actual current usage of the General Debt Basket/Reallocated Amount pool is not tracked from `LedgerEntry` rows.
3. `ca_incremental_prepayment_based`'s $502M figure is a static snapshot of one known ledger entry, not dynamically recomputed from `LedgerEntry` history.
4. Entity-scoped baskets (E-1 sub-cap, `ind_nonguarantor_debt_bxx`) have no `EntityClassMember` rows naming Coherent's actual Non-Guarantor Restricted Subsidiaries — structurally populated but not exercisable by a named real entity; scenarios P/O/parts of the required matrix that would need one are marked `ASSUMPTION_REQUIRED`/`NOT EXECUTABLE`.
5. Priority tier on `ca_lien_hh_linked_601v` is modeled as `PARI_PASSU` by default; the Junior Lien alternative is a transaction-specific structuring election not separately distinguished.
6. `ind_scf_basket_a_flat`'s `FLAT_NET_OF_DEBT` formula nets against total secured debt, not Senior-Credit-Agreement-specific outstanding — a pre-existing, unrelated correctness issue carried forward unchanged from the legacy `CovenantProvision` of the same name, not introduced or resolved by this population.
7. Scenarios F/G/K/L (exactly-at/above the solver-native maximum) and P (one document permits, the other blocks) required deriving amounts *from* this population's own computed maxima rather than pre-specified round numbers — by construction of the harness, not an assumption gap, but noted for reproducibility.

## T. Recommendation

**`READY_WITH_FINANCIAL_INPUT_REVIEW_REQUIRED`.**

The engineering population is complete, additive, and non-destructive; all 4 required coverage sides route SOLVER_NATIVE live; the coverage-integrity self-check and 14 dedicated Coherent tests all pass; two real solver-engine bugs were found and fixed with full regression coverage; every generalized capability gap encountered was documented and left unfixed rather than approximated. What blocks a stronger recommendation:

- The load-bearing legal conclusions (clause 6/24/25 non-netting, EBITDA addback-cap absence, Contribution Indebtedness availability, Collateral Suspension current-state) have **not** received outside-counsel confirmation (§U) — every dollar figure in §E-§I is PROVISIONAL for exactly this reason.
- Covenant EBITDA is not a certified input (§D/§S item 1) — the single most load-bearing financial fact in this entire population is a plain seed-data number.
- Real, material capability gaps remain unfixed by design (First Lien SNLR, Reallocated Amount, Contribution Indebtedness, reclassification/redesignation — §M) — none of these block the *current* reconciliation (Coherent's actual current position doesn't need them to resolve CLEAR/BLOCKED correctly for the scenarios tested), but a future scenario that does need one of them would currently get an artificially conservative (never artificially permissive) answer.

`READY_TO_UPDATE_GOLDEN_TESTS` is **not selected** and was not available for selection per this task's precondition, irrespective of how clean the reconciliation looks.

## U. Legal confirmation status

> **UPDATE (2026-08-25):** All four rows below have since completed **founder-and-peer legal review** (`FOUNDER_AND_PEER_REVIEWED`). The "Confirmation status" column is preserved unedited below to show the state as originally documented (INITIAL STATE); the table immediately after it records the CURRENT STATE. Per docs/legal-review-status-model.md, `FOUNDER_AND_PEER_REVIEWED` is sufficient completed legal review for Headroom product-development purposes — it should no longer be characterized as "pending outside counsel," "legally unreviewed," or "provisional solely because counsel review is missing." It remains true, and is NOT changed by this update, that no INDEPENDENT/outside-counsel confirmation has occurred — see the CURRENT STATE table's own "still true" column.

| Load-bearing legal conclusion | Confirmation status (INITIAL STATE, as originally documented) | Figures depending on it |
|---|---|---|
| Permitted Liens clause (6) not netted against clauses (24)/(25) | **Internal source-verification only** — quoted verbatim from EDGAR-fetched Indenture text (`docs/coherent-phase8-blocker-closure.md`, `docs/coherent-phase1-stacking-table.md` §C.2). **No outside-counsel confirmation.** | Indenture secured max ($11,932.8M), cross-document secured max ($5,130M), binding-document flip |
| Adjusted Consolidated EBITDA / Consolidated EBITDA addback-cap absence | **Internal source-verification only** (`docs/coherent-phase8-blocker-closure.md` §C/§D). **No outside-counsel confirmation.** | Every EBITDA-percentage basket in both documents |
| Contribution Indebtedness availability | **Not populated at all** (§M item 3) — moot for the figures in this report, but flagged since the underlying legal availability is itself only internally source-verified where it was researched (`docs/coherent-phase8-blocker-closure.md` §H) | None currently (basket excluded) |
| Collateral Suspension Period current-state (confirmed inactive) | **Internal source-verification only** — Term B balance + ratings cross-checked against a 10-K and two ratings-agency press releases (`docs/coherent-phase8-blocker-closure.md` §G). **No outside-counsel confirmation.** | Determines that §6.01(ee)/§6.02(pp) Priority Debt baskets are correctly omitted (dormant) |

### CURRENT STATE (as of 2026-08-25, per the legal-model finalization / phase closeout)

| Load-bearing legal conclusion | Legal review status | Still true (not resolved by this update) | Provenance |
|---|---|---|---|
| Permitted Liens clause (6) not netted against clauses (24)/(25) | **`FOUNDER_AND_PEER_REVIEWED`** | No independent/outside-counsel review has occurred | `legal_review_records` row `coh-lrr-clause-6-24-25-nonnetting` |
| Adjusted Consolidated EBITDA / Consolidated EBITDA addback-cap absence — a LEGAL-DEFINITION conclusion only, does NOT certify the numerical Covenant EBITDA value | **`FOUNDER_AND_PEER_REVIEWED`** | Covenant EBITDA ($1,700M) remains a non-certified seed value — `CERTIFIED_EXTERNAL_INPUT` provenance is still open (§D above; docs/coherent-legal-model-baseline-v1.md §6) | `legal_review_records` row `coh-lrr-ebitda-addback-cap-absence` |
| Contribution Indebtedness availability | **`FOUNDER_AND_PEER_REVIEWED`** | Still **not populated** as a Permission row — an engineering-capability gap, unaffected by this review (§M item 3) | `legal_review_records` row `coh-lrr-contribution-indebtedness-availability` |
| Collateral Suspension Period current-state (confirmed inactive) | **`FOUNDER_AND_PEER_REVIEWED`**, as of the 8/25/2026 reporting date — an explicitly temporal, as-of determination, not a timeless constant | Would need re-confirmation against a later factual state before being relied upon for a future reporting period | `legal_review_records` rows `coh-lrr-collateral-suspension-period-current-state` and `coh-lrr-rac-collateral-suspension` |

**Every solver-native dollar figure in §E through §I of this document rested, at original authorship, on at least one of the above conclusions before it completed legal review, and was therefore labeled PROVISIONAL — ENGINEERING-VERIFIED ONLY.** As of the 2026-08-25 update, the underlying legal interpretation of all four conclusions has completed `FOUNDER_AND_PEER_REVIEWED` review; the preferred current characterization for any figure whose only prior caveat was "legal conclusion not yet reviewed" is: **LEGAL MODEL: `FOUNDER_AND_PEER_REVIEWED` / ENGINEERING: VERIFIED / FINANCIAL INPUT: COVENANT EBITDA — `CERTIFIED_EXTERNAL_INPUT` CERTIFICATION PENDING.** This is not outside-counsel verification, not independent third-party verification, not a certified Covenant EBITDA figure, and not a transaction-level legal opinion — see docs/legal-review-status-model.md for what `FOUNDER_AND_PEER_REVIEWED` is and is not sufficient for. This population remains a shadow-run migration artifact for engineering review, not a covenant-compliance opinion.
