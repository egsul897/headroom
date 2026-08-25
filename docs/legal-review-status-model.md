# Legal Review Status Model

Operational reference for legal-review provenance in Headroom. Written as part of the Coherent legal-model finalization / phase closeout (2026-08-25). Keep this concise — it documents an existing, small persistence model, not a legal-workflow product.

## 1. Purpose

Headroom's engine computes covenant capacity from contractual interpretations someone had to make (which basket applies, whether two permissions stack, what a definition means). Those interpretations need a durable, honest record of **who has reviewed them, at what level, and when** — separate from whether the underlying computation is correct, and separate from whether the financial inputs it runs on are certified. This document defines that record: what status values exist, what each one is sufficient for, and what it must never be read to imply.

## 2. `FOUNDER_AND_PEER_REVIEWED`

**Definition.** A contractual interpretation, legal-model configuration, stacking conclusion, permission conclusion, or golden-test legal conclusion has been substantively reviewed and approved by:

1. Headroom's founder, an experienced leveraged/debt-finance attorney; and
2. a second attorney with relevant debt-finance experience.

**What it is sufficient for.** Headroom contractual modeling; solver configuration; golden-test validation; regression testing; engineering acceptance; internal product validation; product development; continued architecture work; and progression to subsequent development phases. No additional outside-counsel review is required as a condition to continue Headroom development.

**What it must never be characterized as.** A `FOUNDER_AND_PEER_REVIEWED` conclusion is not: pending outside counsel; awaiting independent legal verification; legally unreviewed; engineering-verified only; provisional solely because counsel review is missing; or blocked from product development for lack of additional counsel review.

**Not a rung on a required ladder.** `FOUNDER_AND_PEER_REVIEWED` is not an intermediate step toward some other, mandatory "fully verified" status. Headroom's development model does not require a progression toward some other, higher-tier "fully verified" status. If Headroom later receives review from outside or independent counsel, that fact is retained as **additional** reviewer provenance on the same artifact (e.g. a second `LegalReviewRecord`) — never as a condition that was silently required all along.

## 3. Where it lives

Two persisted layers, deliberately kept separate:

- **`GoldenTest.status`** (`GoldenTestStatus` enum: `UNVERIFIED | FOUNDER_AND_PEER_REVIEWED | DISPUTED`) — the review status of one specific golden question's legal conclusion. This is the field a reader sees directly on a golden-test row.
- **`LegalReviewRecord`** (new model, `prisma/schema.prisma`) — the generalized, reusable provenance record behind a promotion: who reviewed what, in what capacity, when, and why. A `LegalReviewRecord` can point at a `GOLDEN_TEST` row, a `PERMISSION` row, a `RULE_ACTIVATION_CONDITION` row, or a `LEGAL_CONCLUSION` that isn't any single row (e.g. a stacking/non-netting determination spanning several permissions — see §8 below). One `GoldenTest.status` promotion is always backed by at least one `LegalReviewRecord` row; the reverse is not required (a `LEGAL_CONCLUSION`-level record need not correspond to any single golden test).

**2026-08-25 update**: `GoldenTestStatus` previously also carried a `LAWYER_VERIFIED` value. It was removed via a proper Prisma migration (`prisma/migrations/20260825031110_remove_unused_lawyer_verified_status`) after confirming zero `golden_tests` rows ever used it and zero application code referenced it. Independent/outside-counsel review, if it occurs, should be recorded as an **additional `LegalReviewRecord`** on the same artifact (e.g. `notes` identifying the reviewer as independent/outside counsel) rather than as a distinct enum tier — see §2's "not a rung on a required ladder" principle, which motivated removing the unused placeholder rather than reintroducing it as a formal status value.

## 4. Reviewer metadata

`LegalReviewRecord` carries: `reviewerName`, `reviewerRole`, `reviewerExperience` (relevant experience/category), `reviewDate`, `reviewedArtifactType`/`reviewedArtifactRef`, `notes`, `sourceVersion` (applicable source/version where relevant).

**Never fabricated.** Every `LegalReviewRecord` row created during the 2026-08-25 closeout has `reviewerName`, `reviewerRole`, and `reviewDate` left `null`. The closeout task that created them supplied a review *determination* (founder-and-peer review occurred, per that task's own controlling instruction) but not the reviewers' actual names, exact titles, or the review date — inventing those would have violated the explicit instruction not to. Each row's `notes` field states this plainly so a future update has an obvious place to fill in the real values. Do not backfill `reviewerName`/`reviewerRole`/`reviewDate` with placeholder or inferred values under any circumstance — leave them `null` until the real information is supplied.

## 5. Legal review vs. financial-data certification

These are orthogonal dimensions and must never be collapsed:

| Dimension | Model | Example |
|---|---|---|
| Substantive contractual result | `Permission`/`CovenantProvision`/solver output | "$5,130M cross-document secured capacity" |
| Legal review status | `GoldenTest.status` / `LegalReviewRecord` | `FOUNDER_AND_PEER_REVIEWED` |
| Financial-data provenance | `ExternalInputRecord` (`ExternalInputKind`: `CERTIFIED_EXTERNAL_INPUT` or, for a documented public-filing reconstruction valid only for test/regression fixtures, `PUBLIC_FILING_RECONSTRUCTION`) | Covenant EBITDA — `PUBLIC_FILING_RECONSTRUCTION`, still **not** `CERTIFIED_EXTERNAL_INPUT`, for Coherent |
| Engineering/execution status | `EvaluationStatus`/`TransactionStatus` (`lib/covenant-engine.ts`), `PathStatus` (`lib/solver/status.ts`) | `clear` / `review_required` / `not_tested` |
| Assumptions / unresolved facts | `TransactionAssumptions`, `RequirementResult.class === "TRANSACTION_ASSUMPTION"` | An unsupplied interest-rate assumption |

A completed `FOUNDER_AND_PEER_REVIEWED` legal review **never** marks a financial input `CERTIFIED_EXTERNAL_INPUT`, never changes an `EvaluationStatus`/`PathStatus`, and never substitutes for either. A valid combination looks like: `LEGAL INTERPRETATION: FOUNDER_AND_PEER_REVIEWED / FINANCIAL INPUT: COVENANT EBITDA — PUBLIC_FILING_RECONSTRUCTION / ENGINE EXECUTION: PASS`. Concretely for Coherent: the four load-bearing legal conclusions (§8) are `FOUNDER_AND_PEER_REVIEWED`, and Covenant EBITDA carries a documented, source-cited `ExternalInputRecord` of kind `PUBLIC_FILING_RECONSTRUCTION` (`docs/coherent-phase8-population-reconciliation.md` §V) — but it is not, and for this fixture never will be, `CERTIFIED_EXTERNAL_INPUT`, since that status is reserved for a real customer's own certified source (a Compliance Certificate, an ERP-linked figure). `PUBLIC_FILING_RECONSTRUCTION` is Coherent's permanent, correct provenance level as a test fixture, not a temporary gap awaiting resolution — see `docs/coherent-legal-model-baseline-v1.md` §6 and the `ExternalInputKind` enum's own schema comment (`prisma/schema.prisma`).

## 6. `hasCompletedQualifiedLegalReview` — the gating predicate

`lib/legal-review.ts` defines the conceptual "has this artifact received completed qualified legal review" question, for any future code path that needs to gate on it:

```ts
export function hasCompletedQualifiedLegalReview(status): boolean {
  return status === "FOUNDER_AND_PEER_REVIEWED";
}
```

As of this document, **no code path in the repository actually gates anything on legal-review status** — the engine's own status types (`EvaluationStatus`, `TransactionStatus`, `PathStatus`) gate on data/coverage completeness, never on review provenance. `hasCompletedQualifiedLegalReview` exists so that if such a gate is ever added, it is shaped correctly from the start: explicit set membership, not an ordinal comparison (`status >= X`) that would incorrectly imply one reviewer relationship is unconditionally "better" than another. `FOUNDER_AND_PEER_REVIEWED` alone satisfies it; no ownership-independent reviewer is required. If independent/outside-counsel provenance is added in the future (as an additional `LegalReviewRecord`, per §3), extend this function's accepted set at that time rather than modeling it as a required higher tier.

## 7. Relationship to `REVIEW_REQUIRED` / `ASSUMPTION_REQUIRED` / `NOT_TESTED` / `NOT_EVALUABLE`

These are **engineering/execution** states (`lib/solver/status.ts`, `lib/covenant-engine.ts`), computed per-transaction from `RequirementResult`s, and are structurally unconnected to `GoldenTest.status`/`LegalReviewRecord` — nothing in `pathStatus`/`aggregateOverallStatus`/`worstStatus` reads legal-review data, and nothing in the legal-review model reads solver output. This is intentional and must be preserved: a conclusion can be `FOUNDER_AND_PEER_REVIEWED` (the legal question is settled) while the specific transaction path that would rely on it still returns `REVIEW_REQUIRED` or is `NOT EXECUTABLE` because a **capability** the engine needs isn't built yet (e.g. Contribution Indebtedness's measurement basis, First Lien SNLR, reclassification/redesignation mechanics — all documented, unfixed engineering gaps, none of them resolved by legal review). Do not treat an engineering capability gap as if it were a pending legal review, and do not treat a `FOUNDER_AND_PEER_REVIEWED` legal conclusion as though it silently resolves an unrelated engineering gap.

## 8. Worked examples (Coherent, 2026-08-25 closeout)

- **Clause 6/24/25 non-netting** — `LegalReviewRecord` (`LEGAL_CONCLUSION`, ref `coherent-indenture-permitted-liens-clause-6-24-25-stacking-nonnetting`), `FOUNDER_AND_PEER_REVIEWED`. Spans four `Permission` rows and the deliberate *absence* of a `PermissionRelationship` connecting them — the review conclusion is a property of that absence, not any single row, hence `LEGAL_CONCLUSION` rather than `PERMISSION`.
- **EBITDA addback-cap absence** — `FOUNDER_AND_PEER_REVIEWED` as a legal-definition matter. Does **not** certify the $1,700M `FinancialSnapshot.ebitda` value Coherent's engine actually uses (§5).
- **Contribution Indebtedness availability** — `FOUNDER_AND_PEER_REVIEWED`. Availability is confirmed, but the basket remains **not populated** as a `Permission` row (measurement-basis gap) — legal review does not manufacture engine capacity that doesn't exist.
- **Collateral Suspension Period current-state** — `FOUNDER_AND_PEER_REVIEWED`, explicitly **as of** the review's reporting date (8/25/2026), not a timeless fact. A later reporting period requires re-confirmation against the then-current factual state (Term B balance, ratings) before being relied upon again.
- **Golden questions** — 8 of Coherent's 30 `golden_tests` rows were promoted (see `docs/coherent-legal-model-baseline-v1.md` §5 for the list and per-row reasoning); the other 22 were left `UNVERIFIED` — either because their material dependency falls outside the four reviewed conclusions (e.g. Restricted Payments, Asset Sale, a different covenant section entirely), or because their expected answer numerically reflects a pre-correction legacy formula that the review itself calls into question (promoting those would misrepresent a still-open reconciliation issue as settled — see that document's own note on the point).

## 9. How a future company configuration should use this model

1. When a legal conclusion (a stacking rule, a definition reading, a basket's availability) is substantively reviewed by the founder and a second qualifying attorney, create or update a `LegalReviewRecord` with `reviewStatus: FOUNDER_AND_PEER_REVIEWED`, the real reviewer metadata if available (never fabricated if not), and a `reviewedArtifactRef` precise enough that a later reader can tell exactly what was and wasn't covered.
2. If the conclusion corresponds to specific `golden_tests` rows, update those rows' `status` to match **only** for rows whose answer actually depends on the reviewed conclusion and is not itself known-stale for an unrelated reason (§8's golden-question note). Never promote a row just because it cites the same document.
3. Never let a `FOUNDER_AND_PEER_REVIEWED` promotion touch `expectedAnswer`, `bindingProvision`, or any solver-native configuration row — review status is provenance, not a correction mechanism (see the closeout task's own §C/§G/§L for the rule this restates).
4. If outside/independent counsel later reviews the same conclusion, add that as a **second, additional** `LegalReviewRecord` alongside the existing `FOUNDER_AND_PEER_REVIEWED` one (e.g. `notes` identifying the reviewer as independent/outside counsel) — never delete or downgrade the founder-and-peer record, and never make the new review a precondition that was retroactively "always required."
