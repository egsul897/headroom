# Founder legal-review confirmation and status update (2026-08-25)

Records and reconciles the founder's 2026-08-25 instruction confirming personal review of every currently existing `golden_tests` row for Coherent and Matthews. Implemented by `scripts/populate-founder-solo-legal-review-2026-08-25.ts` (idempotent, re-run twice during this task with identical results both times).

---

## 1. Enumeration and total reviewed

**48 rows total** — Coherent 30, Matthews 18. All 48 are covered by this instruction; the script hard-fails if the live count is not exactly 48, so this figure is verified against the database at run time, not assumed.

## 2. Rows already known-stale from prior engineering reconciliation

Three rows, all Coherent, all previously identified in `docs/result-semantics-headroom-cleanup.md`:

| Row | Question | Stored value | Solver-native-aware recomputation |
|---|---|---|---|
| Q22 (`cmt7vicwr002pj1d33vvdfvav`) | "If Coherent incurs $500M of new secured debt today, what secured capacity remains immediately afterward, and under which provision?" | expectedAnswer 3,541 / `mila_secured` | 4,629 / `ca_incremental_ratio_based_unsecured_or_junior` |
| Row 16 (`cmt7vicwj002dj1d3bv3zwd1w`) | SSNL-binding-constraint spot check at $2,000M | `mila_secured` | `ca_incremental_ratio_based_unsecured_or_junior` |
| Row 17 (`cmt7vicwk002fj1d3nnpsqqdp`) | SSNL-binding-constraint spot check at the $4,041M ceiling | `mila_secured` | `ca_incremental_ratio_based_unsecured_or_junior` |

## 3. A genuinely new finding, discovered while trying to identify the "corrected result" — read before trusting the 4,629/16/17 figures

The founder's instruction requires identifying "the exact row and corrected result" before writing any correction, and forbids new legal research or engine changes. Investigating the proposed correction (rather than writing it directly) surfaced a real, separate, **not fixed in this task** engineering gap:

All three rows' new solver-native citation is permission `coh-ca-d-incr-ratiobased-unsecjr` (code `ca_incremental_ratio_based_unsecured_or_junior`), whose own action label is *"Incur debt under the Ratio-Based Incremental Facility, **unsecured or junior-secured** (unlimited if TNL ≤ 4.25x)."* Its `eligibilityConditions` column is **empty** — nothing in the modeled data actually restricts it to unsecured/junior debt. `runSolverForDocument` (`lib/covenant-engine.ts`) filters eligible permissions only by `documentId` + `grantType`, relying on each permission's own `eligibilityConditions` to enforce secured/unsecured restrictions; this one has none. So the solver currently counts this permission's ratio room toward **first-lien/pari-passu SECURED** debt capacity, which its own name says it shouldn't be eligible for.

By contrast, the other two Coherent permissions whose citations differ from legacy in this same rerun — `ca_incremental_cash_capped` and `ca_general_debt_601k` — carry no such restrictive language in their action labels and have empty `eligibilityConditions` for the unremarkable reason that they're genuinely usable for either secured or unsecured debt. Those 9 rows' representation differences are unaffected by this finding and remain classified exactly as `docs/result-semantics-headroom-cleanup.md` classified them (`REPRESENTATION_DIFFERENCE_ONLY`).

**Net effect: neither 3,541/`mila_secured` (the old figure) nor 4,629/`ca_incremental_ratio_based_unsecured_or_junior` (the new one) is confirmed correct.** The new figure is likely an overstatement, pending a fix to that one Permission row's `eligibilityConditions` — a real fix, but a `Permission`-row change, which is outside what this task authorizes (this project's standing freeze: never touch Coherent's `Permission` rows outside an explicitly-authorized task). This is reported here as a distinct, future, separately-authorizable follow-up — not performed.

## 4. Reconciliation actions taken

Per the founder's own 5-step procedure and "do not silently change any value":

- **`expectedAnswer`/`bindingProvision`/`bindingDefinedTerms`/`question`**: unchanged on all 48 rows, including all three affected ones. Verified directly against the database after the script ran (Q22 still 3,541/`mila_secured`; rows 16/17 still `mila_secured`).
- **`reviewerNotes`**: appended (never overwritten) on the three affected rows, documenting the founder's review, the specific discrepancy, and the newly discovered engineering gap that prevents a confident correction right now.
- **`golden_tests.status`, rows 16/17**: reverted `FOUNDER_AND_PEER_REVIEWED` → `UNVERIFIED`. The 2026-08-25 Coherent closeout promoted these two rows on the stated premise "matches exactly between legacy and solver-native" — a premise the golden-harness solver-native-grading fix later disproved (the citation differs) and this task's own investigation now shows may reflect a real capacity-overstatement bug, not a benign difference. Leaving them labeled "founder-and-peer reviewed, settled" would be exactly the "falsely approved merely because it exists in the database" outcome the instruction prohibits.
- **Audit trail / traceability**: the original 2026-08-25 `LegalReviewRecord` rows for both (`coh-lrr-golden-cmt7vicwj002dj1d3bv3zwd1w`, `coh-lrr-golden-cmt7vicwk002fj1d3nnpsqqdp`) are left completely untouched — verified directly (`reviewStatus` still `FOUNDER_AND_PEER_REVIEWED` on the original rows, as an accurate historical record of what was believed and why at the time). New, separate `LegalReviewRecord` rows (`lrr-supersede-2026-08-25-...`) explain the supersession without deleting or editing history.
- **Q22**: never previously promoted (was already `UNVERIFIED`); left `UNVERIFIED`.

## 5. Classification of all 48 rows

- **A. Legally reviewed and current** (founder-reviewed this pass, no known staleness) — 45 rows (27 Coherent + 18 Matthews). Each now carries a new `LegalReviewRecord` (`GOLDEN_TEST`, `reviewStatus: UNVERIFIED` — see §6 on why, `reviewDate: 2026-08-25`, `reviewerRole: "Founder (Headroom) - single reviewer"`) documenting the founder's approval of the currently modeled conclusion, including every row whose determination is `NOT_TESTED`/`REVIEW_REQUIRED`/`NOT_EVALUABLE`/out-of-scope — approval of those means only "this fail-closed state is the correct current modeled conclusion," never an affirmative "transaction permitted" reading (Matthews' absent debt-incurrence covenant stays `NOT_TESTED`, not "unlimited").
- **B. Legally reviewed but engineering expectation/citation stale (and now, additionally, the proposed replacement is itself unconfirmed)** — 3 rows: Q22, row 16, row 17. See §§2–4.
- **C. Intentionally `NOT_TESTED`/`REVIEW_REQUIRED`/`NOT_EVALUABLE`** — a subset of category A (they are legally reviewed and current; their *engineering* determination is fail-closed by design). Matthews alone carries 10 flagged/2 errored rows of this kind (per the harness's own out-of-scope/error classification); the founder's approval covers all of them.
- **D. Genuinely unsupported/out-of-scope** — none identified beyond category C's existing, already-documented scope boundaries (e.g. Matthews' Intercreditor Agreement §§3/4 enforcement mechanics, deliberately not modeled — `docs/matthews-international-onboarding.md` §B).

## 6. The metadata/status-model mismatch (flagged, not treated as a blocker)

`docs/legal-review-status-model.md` §2 and the matching `LegalReviewStatus`/`GoldenTestStatus` schema comments define `FOUNDER_AND_PEER_REVIEWED` as review by **both** the founder **and** a second qualified attorney. The founder's instruction supplies only his own review ("I have personally reviewed…") and explicitly anticipated this gap, instructing: don't fabricate a second reviewer; record truthfully; identify the mismatch; don't treat it as a blocker. Accordingly:

- No `golden_tests.status` was promoted to `FOUNDER_AND_PEER_REVIEWED` on the strength of this instruction alone (45 new `LegalReviewRecord` rows are `reviewStatus: UNVERIFIED` — the honest label, since the enum has no intermediate "one qualified reviewer, second pending" tier).
- This is a labeling gap only. Per `docs/legal-review-status-model.md` §6, **no code path in the repository gates on `GoldenTest.status` or `LegalReviewStatus`** — confirmed unchanged this task. Leaving the label accurate therefore blocks nothing.
- The 6 Coherent rows that already carried a genuine two-reviewer `FOUNDER_AND_PEER_REVIEWED` status from the 2026-08-25 closeout (8 originally promoted, minus the 2 reverted in §4) are untouched by this mismatch — they are not re-labeled, and this instruction adds a corroborating founder-solo record alongside their existing status rather than replacing it.

## 7. Before / after golden-status counts

| | Before | After |
|---|---|---|
| Coherent `UNVERIFIED` | 22 | 24 |
| Coherent `FOUNDER_AND_PEER_REVIEWED` | 8 | 6 |
| Matthews `UNVERIFIED` | 18 | 18 |
| **Total `legal_review_records` (Coherent + Matthews)** | 13 | 63 (+48 founder-solo + 2 supersession records) |

The 2 fewer `FOUNDER_AND_PEER_REVIEWED` Coherent rows are exactly rows 16/17 (§4). No other status changed.

## 8. Golden-harness re-run

Re-run after reconciliation (no `expectedAnswer`/`bindingProvision`/`question` changed, so results are unchanged from the pre-task state — expected, and confirmed):

- **Coherent**: 26 passed / 3 failed / 1 flagged / 0 errored (30 total) — identical to `docs/result-semantics-headroom-cleanup.md`.
- **Matthews**: 2 passed / 4 failed / 10 flagged / 2 errored (18 total) — identical, non-regression confirmed.

## 9. What was NOT touched

No `Permission` (29 rows, unchanged), `PermissionRelationship` (27, unchanged), `SharedCapacityConstraint` (3, unchanged), `CollateralPool`/`PermissionCollateralScope`/`IntercreditorAgreement` row. No `expectedAnswer`/`bindingProvision`/`bindingDefinedTerms`/`question` value on any of the 48 rows. No production solver/engine code. No financial-core arithmetic. No fabricated reviewer name, role beyond "Founder (Headroom)," or date beyond the actual 2026-08-25 recording date.

## 10. Final gate

**`LEGAL_BASELINE_RECORDED — PHASE10_AUTHORIZED`**

The founder's review is recorded truthfully for all 48 rows. The one data-integrity-adjacent issue found (the `ca_incremental_ratio_based_unsecured_or_junior` eligibility gap) does not prevent recording the review — it is a genuine conflict discovered during review, which per the founder's own instruction is a trigger for a **future** legal/engineering review event, not a blocker to this recording or to Phase 10.

Per the instruction: **STOP.** No Phase 10 work begun. Recommended (not performed) next steps, for separate authorization: (a) add the missing `eligibilityConditions` restriction to `coh-ca-d-incr-ratiobased-unsecjr` and re-evaluate Q22/16/17 once that's fixed; (b) supply a second qualified attorney's review if the two-reviewer `FOUNDER_AND_PEER_REVIEWED` status is wanted for the 45 newly-solo-reviewed rows.
