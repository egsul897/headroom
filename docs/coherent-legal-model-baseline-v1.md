# Coherent Legal Model Baseline v1

**CLOSEOUT DOCUMENT.** This freezes the state of Coherent's legal-modeling phase as of the date below. It is not another analysis memo — for the underlying legal reasoning, see `docs/coherent-phase1-stacking-table.md` and `docs/coherent-phase8-blocker-closure.md`; for the engineering population, see `docs/coherent-phase8-population-reconciliation.md`; for what `FOUNDER_AND_PEER_REVIEWED` means, see `docs/legal-review-status-model.md`.

> **SUPERSEDING UPDATE (2026-08-25, later the same day — "Final legal review status instruction"):** The two-reviewer `FOUNDER_AND_PEER_REVIEWED` policy this document describes below was superseded: the founder's own review is now Headroom's complete legal-verification standard (no second-attorney requirement), and the enum value itself was renamed to `VERIFIED` (a rename, not a data migration — the 8 rows/records this document describes as `FOUNDER_AND_PEER_REVIEWED` are the same rows, now reading `VERIFIED`). All 48 current golden rows across both Coherent and Matthews are now `VERIFIED`, not just the 8 this document originally recorded. See `docs/legal-review-status-model.md` §0 for the current, controlling policy — the rest of this document is left exactly as originally written to preserve the chronology.

## 1. As-of date

**2026-08-25.**

## 2. Source document set

The currently operative Coherent debt-document source set used for this model:

- **Indenture** (`coherent-2029-notes-indenture`) governing the 2029 Notes — Permitted Liens clauses (6), (24), (25); MILA secured/unsecured prongs; §3.3(a) Ratio Debt; §3.3(b) baskets (i)/(iv)/(xii)/(xv)/(xviii)/(xx); §13.1 Restricted Payments; §3.7 Asset Sale.
- **Credit Agreement** (`coherent-credit-agreement-2022`) — §6.01(k)/(p) debt baskets, Incremental Amount definition (Cash-Capped/Ratio-Based/Prepayment-Based prongs), §6.02(hh)/(kk) liens, §6.11(a) financial covenant, §6.06 Restricted Payments (not configured — fail-closed `not_tested`, by design).
- Both reconstructed from primary EDGAR filings and cross-checked against Coherent's FY2026 10-K (filed 8/14/2026) and contemporaneous ratings-agency releases — see `docs/coherent-phase8-blocker-closure.md` §G for the specific citations behind the Collateral Suspension Period / Term B balance determination.

## 3. Legal review status

The four load-bearing conclusions identified in prior phases, and the golden questions listed in §5 below, have completed **`FOUNDER_AND_PEER_REVIEWED`** review — substantively reviewed and approved by Headroom's founder (an experienced leveraged/debt-finance attorney) and a second attorney with relevant debt-finance experience. See `docs/legal-review-status-model.md` §2 for the full definition and what it is/isn't sufficient for.

| Load-bearing conclusion | Status | `legal_review_records` id |
|---|---|---|
| Permitted Liens clause (6) not netted against clauses (24)/(25) | `FOUNDER_AND_PEER_REVIEWED` | `coh-lrr-clause-6-24-25-nonnetting` |
| Adjusted Consolidated EBITDA / Consolidated EBITDA addback-cap absence (legal-definition conclusion only) | `FOUNDER_AND_PEER_REVIEWED` | `coh-lrr-ebitda-addback-cap-absence` |
| Contribution Indebtedness availability | `FOUNDER_AND_PEER_REVIEWED` | `coh-lrr-contribution-indebtedness-availability` |
| Collateral Suspension Period current-state (as of 8/25/2026) | `FOUNDER_AND_PEER_REVIEWED` | `coh-lrr-collateral-suspension-period-current-state`, `coh-lrr-rac-collateral-suspension` |

**Reviewer identity note:** `reviewerName`/`reviewerRole`/`reviewDate` are recorded `null` on every row above — the closeout task that produced this baseline supplied the review *determination*, not the reviewers' actual names, titles, or the review date, and those fields are never fabricated (`docs/legal-review-status-model.md` §4). Filling them in with the real values is an open, low-risk follow-up that does not block this closeout.

## 4. Solver configuration state

Coherent's solver-native contract model (`scripts/populate-coherent-solver-native.ts`), unchanged by this closeout — verified by direct count comparison before/after:

| Table | Count |
|---|---|
| `Permission` | 22 (11 Indenture debt, 4 Indenture liens, 5 Credit Agreement debt, 2 Credit Agreement liens) |
| `PermissionRelationship` | 19 |
| `SharedCapacityConstraint` | 2 |
| `RuleActivationCondition` | 2 |
| `CollateralPool` | 3 |
| `PermissionCollateralScope` | 6 |
| `SolverCoverageDeclaration` | 6 (all `isComplete: true`) |

All 6 declared (documentId, side, grantType) scopes route `SOLVER_NATIVE` live (`scripts/coherent-shadow-run.ts`). Shadow-run output is byte-for-byte identical before and after this closeout's changes.

## 5. Golden test state

**Total rows: 30.** Status distribution after this closeout:

| Status | Count |
|---|---|
| `FOUNDER_AND_PEER_REVIEWED` | 8 |
| `UNVERIFIED` | 22 |
| `DISPUTED` | 0 |

*(As originally written, this table also listed `LAWYER_VERIFIED | 0`. That value was subsequently removed from the `GoldenTestStatus` enum on 2026-08-25 — zero rows ever used it, confirmed before removal — see `docs/legal-review-status-model.md` §3. Left out of the table above rather than edited in place, since the count was accurate at authorship and the removal is a later, separate event.)*

Executable harness result (`npx tsx scripts/golden-test.ts`): **29 passed, 0 failed, 1 flagged out-of-scope, 0 errored** — unchanged from the pre-closeout baseline.

**The 8 promoted rows** (material legal dependency within the four reviewed conclusions, AND a numeric/boolean answer stable under both the pre-review and post-review interpretation — see `docs/legal-review-status-model.md` §8):

1. "Is $100M of new secured debt permitted? Under which test?"
2. "Is $250M of new secured debt permitted?"
3. "Is $500M of new secured debt permitted?"
4. "Is $1,000M ($1B) of new secured debt permitted?"
5. "What is the SSNL threshold applicable to secured incurrence under the indenture, and what is the current SSNL?"
6. "At what level of incremental secured debt would the indenture's SSNL test first become the binding constraint — spot check at $2,000M"
7. "At what level of incremental secured debt would the indenture's SSNL test first become the binding constraint — spot check at the $4,041M ceiling"
8. "Can Coherent incur $1,000M of secured debt without breaching either document, and if so what does pro forma total net leverage become?"

All eight test `mila_secured`/Permitted Liens clause (24)'s SSNL ≤ 3.00x gate at amounts and thresholds where the clear/blocked verdict and ratio value do not depend on whether the non-netting correction has been applied to the *aggregate ceiling* — the underlying ratio test itself (not a stacking computation) is what's actually reviewed and tested.

**22 rows deliberately left `UNVERIFIED`**, for two distinct reasons — never conflated:

- **No material dependency on the four reviewed conclusions** (most of the 22): Restricted Payments (dividend/investment) rows, the Asset Sale row, the Credit Agreement fail-closed `not_tested` row, the OUT_OF_SCOPE redesignation row, TNL-threshold/FCCR-threshold rows bound to Credit Agreement §6.11 or Indenture §3.3(a) rather than to clause 6/24/25, and the standalone basket-size rows (`facility_flat`, `general_debt`, `lien_general`) whose formulas were never in dispute — only whether baskets *stack* was reviewed, not each basket's own size.
- **Known `LEGACY_MODEL_ERROR`-affected ceiling figures** (Q1–Q4, the MILA-unsecured `DOCUMENT_CAPACITY` row, the "remaining secured capacity" row, and the standalone Credit Agreement `DOCUMENT_CAPACITY` row): these rows' `expectedAnswer` values are computed by the **legacy** `CapacityExpr` formula, which `docs/coherent-phase8-population-reconciliation.md` §G/§P already classified as understating true capacity given the now-reviewed non-netting conclusion (legacy $4,041M vs. solver-native $11,932.8M standalone Indenture secured, for example). Promoting these rows' *review status* would misrepresent their frozen `$` figures as legally endorsed, when the review's own substance implies a different, higher true ceiling that the legacy formula does not yet reflect. This is a pre-existing, already-documented finding — not new to this closeout — and this closeout does not correct it (expected answers are frozen per the closeout task's own instruction; see §8 below).

**Confirmation:** `question`, `queryType`, `expectedAnswer`, `bindingProvision` are byte-for-byte/numerically identical before and after this closeout for all 30 rows (verified by full-table CSV diff); only `status` changed, on exactly the 8 rows listed above.

## 6. Known open data issue

**Covenant EBITDA remains pending `CERTIFIED_EXTERNAL_INPUT` provenance.** Coherent's $1,700M EBITDA figure is a plain, hardcoded `FinancialSnapshot.ebitda` value with no `ExternalInputRecord` row, no `sourceType`, and no certification of any kind. Founder-and-peer legal review resolved the *legal interpretation* of the EBITDA definition (no general addback cap exists) — it did **not** certify that this specific numerical value is sourced from a Compliance Certificate or equivalent approved source. This is a **DATA-PROVENANCE** issue, not a legal-review issue, and this closeout does not resolve it and does not treat it as a legal blocker (per the closeout task's explicit instruction). It does not block generalized financial-core development.

**2026-08-25 update (append-only — the paragraph above is left as originally written):** Coherent's EBITDA now DOES carry an `ExternalInputRecord` row (`coh-eir-covenant-ebitda-public-filing-reconstruction`), of a new kind, `PUBLIC_FILING_RECONSTRUCTION`, distinct from and never substituting for `CERTIFIED_EXTERNAL_INPUT` — a documented, source-cited reconstruction from Coherent's own FY2026 10-K (see `docs/coherent-phase8-population-reconciliation.md` §V for the full citation and reconciliation math). `CERTIFIED_EXTERNAL_INPUT` provenance is still, and will permanently remain, open for this fixture — Coherent is not a real customer and will never have an ERP-linked certified figure. The correct current characterization is **FINANCIAL INPUT: COVENANT EBITDA — `PUBLIC_FILING_RECONSTRUCTION`**, not "certification pending" (which wrongly implied eventual certification was the expected resolution).

## 7. Known engineering capability gaps

Genuine, unfixed capability gaps — none created or resolved by this closeout, none legal in nature:

1. **First Lien Secured Net Leverage Ratio** — not populated; `LEVERAGE_RATIO_ROOM`'s `debtBasis` has no first-lien-priority-specific subtotal distinct from junior-secured debt.
2. **Reallocated Amount** (CA §6.01(k) → Cash-Capped Incremental) — not enforced; `lib/solver/election.ts`'s shared-constraint consumption can only ration a permission's capacity downward, never grant capacity sourced from another basket's unused headroom.
3. **Contribution Indebtedness measurement basis** (Indenture §3.3(b)(xviii)) — not populated; its contribution-linked-credit measurement basis has no representation in the `MeasurementBasis` enum, and would also require a `CERTIFIED_EXTERNAL_INPUT` (an Officer's Certificate) that doesn't exist in Coherent's data.
4. **Reclassification / redesignation mechanics** (§13.1(a)/§1.07(b) fixed→incurrence-based reclassification; Incremental Amount's Cash-Capped→Ratio-Based opt-out; Restricted/Unrestricted Subsidiary redesignation) — not modeled; zero reclassification logic exists in `lib/solver/election.ts`.

All four fail closed (understate capacity / report `not_tested`/`NOT EXECUTABLE`), never fabricate capacity, and are unaffected by legal review — reviewing the underlying legal availability of a basket does not, by itself, give the engine a measurement primitive it doesn't have.

## 8. Current legal blockers

**None identified for the reviewed Phase 1 debt/liens model.** The four load-bearing conclusions have completed `FOUNDER_AND_PEER_REVIEWED` review; no additional outside-counsel review is required as a condition to continue Headroom development (`docs/legal-review-status-model.md` §2). Uncertified Covenant EBITDA (§6) is explicitly **not** a legal blocker — it is a data-provenance gap. The known engineering capability gaps (§7) are explicitly **not** legal blockers — they are unmodeled primitives that fail closed. The 22 non-promoted golden rows (§5) are not blocked pending legal review either — most simply fall outside the reviewed scope, and the `LEGACY_MODEL_ERROR`-affected subset is a pre-existing, already-reported engineering reconciliation issue (stale legacy-formula output), not an unresolved legal question.

## 9. Change control

Future changes to Coherent's contractual configuration (`Permission`, `PermissionRelationship`, `SharedCapacityConstraint`, `CovenantProvision`, `capacityFormulas`, thresholds, document interpretations) should require, at minimum:

- an identified source basis (primary document citation, amendment, or further legal review);
- a stated reason for the change;
- an effective date where applicable (respecting the existing `effectiveFrom`/`effectiveTo` dating conventions);
- a regression-impact check against the golden-test suite and `tests/solver/**`; and
- appropriate review provenance recorded via `LegalReviewRecord` (or a documented reason why none applies).

Changes to review *status* alone (promoting/demoting a `GoldenTest.status` or adding a `LegalReviewRecord`) must never, by themselves, alter `expectedAnswer`, `bindingProvision`, or any solver-native configuration row — see `docs/legal-review-status-model.md` §9.

## 10. Phase status

**COHERENT LEGAL MODELING PHASE: CLOSED FOR CURRENT PRODUCT-DEVELOPMENT PURPOSES.**

No genuine substantive mismatch was found that makes this unsafe to state. The known open items (uncertified EBITDA, four engineering capability gaps, 22 golden rows outside reviewed scope, the legacy-formula-affected ceiling figures already documented in `docs/coherent-phase8-population-reconciliation.md`) are all pre-existing, already-categorized, non-blocking limitations — none of them is a legal-interpretation question left open by this review.
