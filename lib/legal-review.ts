/**
 * Legal-review provenance gating semantics (docs/legal-review-status-model.md).
 *
 * This module exists purely to give a single, explicit place for the
 * conceptual "has this artifact received completed qualified legal review"
 * question (task §K), in case a future gate needs to ask it — no existing
 * code path actually gates anything on legal-review status today
 * (lib/covenant-engine.ts's EvaluationStatus/TransactionStatus and
 * lib/solver/status.ts's PathStatus both gate on DATA/COVERAGE completeness,
 * not legal-review provenance — see the audit note in
 * docs/legal-review-status-model.md §7). This function is therefore not
 * wired into any current gate; it is the generalized, correctly-shaped
 * predicate a future one should use instead of an ordinal enum comparison.
 *
 * Deliberately explicit set membership, NOT an ordinal `status >= X`
 * comparison (task §K: "Do not use ordinal status comparisons if they
 * incorrectly imply that one reviewer relationship automatically makes the
 * substantive legal review 'better'"). Independent/outside-counsel review is
 * not modeled as a `GoldenTestStatus` enum value (the earlier `LAWYER_VERIFIED`
 * value was removed — zero rows ever used it); it should instead be recorded
 * as an additional `LegalReviewRecord` alongside an existing
 * FOUNDER_AND_PEER_REVIEWED one, never as a required higher tier above it.
 */

export type GoldenTestReviewStatus = "UNVERIFIED" | "FOUNDER_AND_PEER_REVIEWED" | "DISPUTED";
export type LegalReviewStatus = "UNVERIFIED" | "FOUNDER_AND_PEER_REVIEWED" | "DISPUTED";

const QUALIFIED_REVIEW_STATUSES: ReadonlySet<string> = new Set(["FOUNDER_AND_PEER_REVIEWED"]);

/**
 * Headroom's current engineering/product-development gate (task §A/§K):
 * "has this conclusion received completed qualified legal review" —
 * FOUNDER_AND_PEER_REVIEWED is sufficient on its own; no additional
 * outside-counsel/independent review is required. If a future artifact
 * separately records independent/outside-counsel provenance (via an
 * additional LegalReviewRecord, not a new enum tier), that should also
 * satisfy this gate — extend QUALIFIED_REVIEW_STATUSES (or this function's
 * signature) at that time rather than modeling it as a required rung above
 * FOUNDER_AND_PEER_REVIEWED (task §B).
 */
export function hasCompletedQualifiedLegalReview(status: GoldenTestReviewStatus | LegalReviewStatus): boolean {
  return QUALIFIED_REVIEW_STATUSES.has(status);
}
