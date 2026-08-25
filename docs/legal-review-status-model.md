# Legal Review Status Model

Operational reference for legal-review provenance in Headroom. Originally written as part of the Coherent legal-model finalization / phase closeout (2026-08-25); superseded the same day by the founder's "Final legal review status instruction" (§0 below is the current, controlling policy). Keep this concise — it documents an existing, small persistence model, not a legal-workflow product.

## 0. Final legal review status instruction (2026-08-25) — CURRENT, CONTROLLING POLICY

The founder of Headroom, an experienced debt/leveraged-finance attorney, is Headroom's own authorized legal-review standard for the repository's internal product/development purposes. This instruction **supersedes** the two-reviewer framework described in §2 below (kept for historical reference, not as an active requirement):

- There is **no** additional peer-review, second-attorney, outside-counsel, or independent-counsel requirement for a golden row or legal conclusion to be considered legally reviewed.
- A conclusion the founder has personally reviewed and approved is **`VERIFIED`** — the complete legal-review state. Nothing further is required.
- The status enum value itself was **renamed** `FOUNDER_AND_PEER_REVIEWED` → `VERIFIED` (Prisma migration `20260825145840_rename_founder_and_peer_reviewed_to_verified` — a pure enum-value rename, not a data migration: every row that carried the old value carries the new one automatically, zero rows touched by hand, zero data loss).
- All 48 currently-existing `golden_tests` rows (30 Coherent + 18 Matthews) are `VERIFIED` as of this instruction (`scripts/finalize-founder-sole-review-verified-2026-08-25.ts`).
- **`VERIFIED` is a legal-review-status dimension only.** It is orthogonal to, and never substitutes for: financial-data provenance (§5), engineering/execution correctness (§7), or a known implementation defect (§10). A row can simultaneously be legal review `VERIFIED` and engineering `FAIL`/`EXPECTED_ANSWER_STALE`/a documented configuration error — see §10's worked example (Q22, rows 16/17).
- **Do not create a new legal-review blocker by renaming the same requirement.** Do not ask for peer review, second-attorney review, outside counsel, or independent counsel as a precondition for `VERIFIED` or for continued product development, unless the founder explicitly introduces such a requirement later.

## 1. Purpose

Headroom's engine computes covenant capacity from contractual interpretations someone had to make (which basket applies, whether two permissions stack, what a definition means). Those interpretations need a durable, honest record of **who has reviewed them, at what level, and when** — separate from whether the underlying computation is correct, and separate from whether the financial inputs it runs on are certified. This document defines that record: what status values exist, what each one is sufficient for, and what it must never be read to imply.

## 2. `FOUNDER_AND_PEER_REVIEWED` (SUPERSEDED 2026-08-25 — historical, not an active requirement)

This section describes the policy that was controlling from the 2026-08-25 Coherent closeout until later the same day, when §0 superseded it. It is preserved for historical accuracy (why records created in that window read the way they do), **not** as a live requirement — see §0.

**Definition (as it was).** A contractual interpretation, legal-model configuration, stacking conclusion, permission conclusion, or golden-test legal conclusion had to be substantively reviewed and approved by:

1. Headroom's founder, an experienced leveraged/debt-finance attorney; and
2. a second attorney with relevant debt-finance experience.

**What it was sufficient for.** Headroom contractual modeling; solver configuration; golden-test validation; regression testing; engineering acceptance; internal product validation; product development; continued architecture work; and progression to subsequent development phases. No additional outside-counsel review was required as a condition to continue Headroom development even under this earlier policy.

**Not a rung on a required ladder (this principle survives §0's supersession unchanged).** Neither the old `FOUNDER_AND_PEER_REVIEWED` status nor the current `VERIFIED` status is an intermediate step toward some other, mandatory "fully verified" tier. If Headroom later receives review from outside or independent counsel, that fact is retained as **additional** reviewer provenance on the same artifact (e.g. a second `LegalReviewRecord`) — never as a condition that was silently required all along. This principle is exactly why the enum was renamed rather than given a third tier: the two-reviewer requirement was removed outright, not demoted to optional.

## 3. Where it lives

Two persisted layers, deliberately kept separate:

- **`GoldenTest.status`** (`GoldenTestStatus` enum: `UNVERIFIED | VERIFIED | DISPUTED`) — the review status of one specific golden question's legal conclusion. This is the field a reader sees directly on a golden-test row.
- **`LegalReviewRecord`** (model, `prisma/schema.prisma`) — the generalized, reusable provenance record behind a promotion: who reviewed what, in what capacity, when, and why. A `LegalReviewRecord` can point at a `GOLDEN_TEST` row, a `PERMISSION` row, a `RULE_ACTIVATION_CONDITION` row, or a `LEGAL_CONCLUSION` that isn't any single row (e.g. a stacking/non-netting determination spanning several permissions — see §8 below). One `GoldenTest.status` promotion is always backed by at least one `LegalReviewRecord` row; the reverse is not required (a `LEGAL_CONCLUSION`-level record need not correspond to any single golden test).

**Chronology** (nothing below was ever deleted — every record from every stage still exists and is queryable):

1. **2026-08-25, Coherent closeout**: `GoldenTestStatus` previously also carried a `LAWYER_VERIFIED` value, removed via a proper Prisma migration (`20260825031110_remove_unused_lawyer_verified_status`) after confirming zero rows/code ever used it. The same closeout promoted 8 of Coherent's 30 golden rows to (what was then named) `FOUNDER_AND_PEER_REVIEWED`, under the two-reviewer policy in §2.
2. **2026-08-25, later the same day, founder-solo confirmation** (`docs/founder-legal-review-2026-08-25.md`): the founder personally reviewed all 48 rows (both companies) under the still-controlling two-reviewer policy. Since only one reviewer was supplied, rows were recorded via new, honest single-reviewer `LegalReviewRecord`s without promoting `GoldenTest.status` (a purely metadata/status-model gap, not a substantive blocker, per that document). Investigating a proposed correction for 2 previously-promoted rows (the SSNL-binding-constraint spot checks) surfaced that their original promotion premise had been disproved by the golden-harness fix; those 2 rows were reverted to `UNVERIFIED`, with the original record preserved and a new superseding record added.
3. **2026-08-25, later still, Final legal review status instruction** (§0, this document): the founder superseded the two-reviewer requirement outright. The enum value was renamed `FOUNDER_AND_PEER_REVIEWED` → `VERIFIED`, and all 48 rows — including the 2 reverted in step 2 — were promoted to `VERIFIED`, since the reason they were held back (an unmet two-reviewer bar, or a since-disproved promotion premise later re-examined under the new single-reviewer-sufficient policy) no longer applies. Their known engineering discrepancy (§10) remains separately tracked and was **not** resolved by this promotion.

Independent/outside-counsel review, if it ever occurs, should be recorded as an **additional `LegalReviewRecord`** on the same artifact (e.g. `notes` identifying the reviewer as independent/outside counsel) rather than as a distinct enum tier — see §2's "not a rung on a required ladder" principle.

## 4. Reviewer metadata

`LegalReviewRecord` carries: `reviewerName`, `reviewerRole`, `reviewerExperience` (relevant experience/category), `reviewDate`, `reviewedArtifactType`/`reviewedArtifactRef`, `notes`, `sourceVersion` (applicable source/version where relevant).

**Never fabricated.** The 2026-08-25 closeout's original records (§3 step 1) have `reviewerName`/`reviewerRole`/`reviewDate` left `null` — that task supplied a review *determination* but not the reviewers' actual names, exact titles, or the review date, and inventing those would have violated its explicit instruction not to. The founder-solo (§3 step 2) and final-policy (§3 step 3) records DO carry a real, non-fabricated `reviewerRole` ("Founder (Headroom) - single reviewer" / "Founder / Legal Reviewer") and `reviewDate` (2026-08-25) — that metadata was actually supplied by the founder's own instructions, so recording it is not fabrication; leaving it null in those later records would itself have been inaccurate. `reviewerName` remains `null` across every record in every stage — no actual name has ever been supplied, and none is invented. Do not backfill `reviewerName` with a placeholder or inferred value under any circumstance — leave it `null` until the real name is supplied, and use the truthful role label already established ("Founder / Legal Reviewer") rather than inventing one.

## 5. Legal review vs. financial-data certification

These are orthogonal dimensions and must never be collapsed:

| Dimension | Model | Example |
|---|---|---|
| Substantive contractual result | `Permission`/`CovenantProvision`/solver output | "$5,130M cross-document secured capacity" |
| Legal review status | `GoldenTest.status` / `LegalReviewRecord` | `VERIFIED` |
| Financial-data provenance | `ExternalInputRecord` (`ExternalInputKind`: `CERTIFIED_EXTERNAL_INPUT` or, for a documented public-filing reconstruction valid only for test/regression fixtures, `PUBLIC_FILING_RECONSTRUCTION`) | Covenant EBITDA — `PUBLIC_FILING_RECONSTRUCTION`, still **not** `CERTIFIED_EXTERNAL_INPUT`, for Coherent |
| Engineering/execution status | `EvaluationStatus`/`TransactionStatus` (`lib/covenant-engine.ts`), `PathStatus` (`lib/solver/status.ts`) | `clear` / `review_required` / `not_tested` |
| Assumptions / unresolved facts | `TransactionAssumptions`, `RequirementResult.class === "TRANSACTION_ASSUMPTION"` | An unsupplied interest-rate assumption |

A completed `VERIFIED` legal review **never** marks a financial input `CERTIFIED_EXTERNAL_INPUT`, never changes an `EvaluationStatus`/`PathStatus`, and never substitutes for either. A valid combination looks like: `LEGAL INTERPRETATION: VERIFIED / FINANCIAL INPUT: COVENANT EBITDA — PUBLIC_FILING_RECONSTRUCTION / ENGINE EXECUTION: PASS`. Concretely for Coherent: the four load-bearing legal conclusions (§8) are `VERIFIED`, and Covenant EBITDA carries a documented, source-cited `ExternalInputRecord` of kind `PUBLIC_FILING_RECONSTRUCTION` (`docs/coherent-phase8-population-reconciliation.md` §V) — but it is not, and for this fixture never will be, `CERTIFIED_EXTERNAL_INPUT`, since that status is reserved for a real customer's own certified source (a Compliance Certificate, an ERP-linked figure). `PUBLIC_FILING_RECONSTRUCTION` is Coherent's permanent, correct provenance level as a test fixture, not a temporary gap awaiting resolution — see `docs/coherent-legal-model-baseline-v1.md` §6 and the `ExternalInputKind` enum's own schema comment (`prisma/schema.prisma`).

## 6. `hasCompletedQualifiedLegalReview` — the gating predicate

`lib/legal-review.ts` defines the conceptual "has this artifact received completed qualified legal review" question, for any future code path that needs to gate on it:

```ts
export function hasCompletedQualifiedLegalReview(status): boolean {
  return status === "VERIFIED";
}
```

As of this document, **no code path in the repository actually gates anything on legal-review status** — the engine's own status types (`EvaluationStatus`, `TransactionStatus`, `PathStatus`) gate on data/coverage completeness, never on review provenance. `hasCompletedQualifiedLegalReview` exists so that if such a gate is ever added, it is shaped correctly from the start: explicit set membership, not an ordinal comparison (`status >= X`) that would incorrectly imply one reviewer relationship is unconditionally "better" than another. `VERIFIED` alone satisfies it; no second reviewer is required. If independent/outside-counsel provenance is added in the future (as an additional `LegalReviewRecord`, per §3), extend this function's accepted set at that time rather than modeling it as a required higher tier.

## 7. Relationship to `REVIEW_REQUIRED` / `ASSUMPTION_REQUIRED` / `NOT_TESTED` / `NOT_EVALUABLE`

These are **engineering/execution** states (`lib/solver/status.ts`, `lib/covenant-engine.ts`), computed per-transaction from `RequirementResult`s, and are structurally unconnected to `GoldenTest.status`/`LegalReviewRecord` — nothing in `pathStatus`/`aggregateOverallStatus`/`worstStatus` reads legal-review data, and nothing in the legal-review model reads solver output. This is intentional and must be preserved: a conclusion can be `VERIFIED` (the legal question is settled) while the specific transaction path that would rely on it still returns `REVIEW_REQUIRED` or is `NOT EXECUTABLE` because a **capability** the engine needs isn't built yet (e.g. Contribution Indebtedness's measurement basis, First Lien SNLR, reclassification/redesignation mechanics — all documented, unfixed engineering gaps, none of them resolved by legal review). Do not treat an engineering capability gap as if it were a pending legal review, and do not treat a `VERIFIED` legal conclusion as though it silently resolves an unrelated engineering gap.

## 8. Worked examples (Coherent, 2026-08-25 closeout)

- **Clause 6/24/25 non-netting** — `LegalReviewRecord` (`LEGAL_CONCLUSION`, ref `coherent-indenture-permitted-liens-clause-6-24-25-stacking-nonnetting`), `VERIFIED`. Spans four `Permission` rows and the deliberate *absence* of a `PermissionRelationship` connecting them — the review conclusion is a property of that absence, not any single row, hence `LEGAL_CONCLUSION` rather than `PERMISSION`.
- **EBITDA addback-cap absence** — `VERIFIED` as a legal-definition matter. Does **not** certify the $1,700M `FinancialSnapshot.ebitda` value Coherent's engine actually uses (§5).
- **Contribution Indebtedness availability** — `VERIFIED`. Availability is confirmed, but the basket remains **not populated** as a `Permission` row (measurement-basis gap) — legal review does not manufacture engine capacity that doesn't exist.
- **Collateral Suspension Period current-state** — `VERIFIED`, explicitly **as of** the review's reporting date (8/25/2026), not a timeless fact. A later reporting period requires re-confirmation against the then-current factual state (Term B balance, ratings) before being relied upon again.
- **Golden questions** — as of §0's final policy, all 48 current rows (30 Coherent + 18 Matthews) are `VERIFIED`. Some rows' expected answer still numerically reflects a pre-correction legacy formula or an unresolved engineering discrepancy that the review itself calls attention to (§10) — `VERIFIED` records that the underlying legal proposition has been reviewed, not that the stored number is confirmed correct; see §10.

## 9. How a future company configuration should use this model

1. When a legal conclusion (a stacking rule, a definition reading, a basket's availability) is substantively reviewed and approved by the founder, create or update a `LegalReviewRecord` with `reviewStatus: VERIFIED`, real reviewer metadata (the founder's truthful role; never a fabricated name), and a `reviewedArtifactRef` precise enough that a later reader can tell exactly what was and wasn't covered.
2. If the conclusion corresponds to specific `golden_tests` rows, update those rows' `status` to `VERIFIED`. Legal review approving the conclusion does not, on its own, resolve a separately-tracked engineering discrepancy (§10) — preserve that discrepancy through `reviewerNotes`/discrepancy classification rather than treating `VERIFIED` as license to ignore it.
3. Never let a `VERIFIED` promotion touch `expectedAnswer`, `bindingProvision`, or any solver-native configuration row — review status is provenance, not a correction mechanism.
4. If outside/independent counsel later reviews the same conclusion, add that as an **additional** `LegalReviewRecord` alongside the existing `VERIFIED` one — never delete or downgrade the founder's own record, and never make the new review a precondition that was retroactively "always required" (§0's "no new legal blocker" rule).

## 10. `VERIFIED` does not force a stale number or suppress a known defect

Legal verification and software correctness are separate concepts (§0). `VERIFIED` means the legal analysis represented by the reviewed row/conclusion has been reviewed and approved. It does **not** mean: force the engine to reproduce an obsolete legacy calculation; ignore a subsequently discovered implementation defect; bless a mathematically impossible output; or suppress a discrepancy between a reviewed legal rule and its software implementation.

**Worked example**: Coherent's Q22 and golden rows 16/17 (`docs/founder-legal-review-2026-08-25.md` §3, `docs/result-semantics-headroom-cleanup.md`) have a known, unresolved engineering/configuration discrepancy — permission `coh-ca-d-incr-ratiobased-unsecjr`'s own action label restricts it to unsecured/junior-secured debt, but it carries no structured `eligibilityConditions` enforcing that restriction, so the solver currently over-counts it toward secured-debt capacity. That finding does **not** revoke these rows' legal review — the legal proposition itself (what the reviewed contractual language means) is `VERIFIED`. The implementation's failure to mechanically enforce that reviewed proposition is classified separately, as an engineering/configuration defect, to be fixed independently (not performed as part of any legal-review-status task). `LEGAL RULE VERIFIED + SOFTWARE IMPLEMENTATION DISCREPANCY` is a valid, stable state — it is not `LEGAL RULE UNVERIFIED`, and these three rows' `golden_tests.status` stays `VERIFIED` while their `expectedAnswer`/`bindingProvision` stay unchanged and their engineering classification (`EXPECTED_ANSWER_STALE` / stale-citation) stays exactly as documented.
