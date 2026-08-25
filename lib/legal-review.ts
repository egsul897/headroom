/**
 * Legal-review provenance gating semantics (docs/legal-review-status-model.md).
 *
 * This module exists purely to give a single, explicit place for the
 * conceptual "has this artifact received completed qualified legal review"
 * question (task §K), in case a future gate needs to ask it — as of this
 * closeout, `grep -rn "LAWYER_VERIFIED"` and equivalent searches confirm NO
 * existing code path actually gates anything on legal-review status today
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
 * substantive legal review 'better'"). FOUNDER_AND_PEER_REVIEWED and
 * LAWYER_VERIFIED are DIFFERENT reviewer relationships, not ranked tiers of
 * the same thing — both independently satisfy "completed qualified legal
 * review" for Headroom's current product-development gate; UNVERIFIED and
 * DISPUTED do not.
 */

export type GoldenTestReviewStatus = "UNVERIFIED" | "LAWYER_VERIFIED" | "FOUNDER_AND_PEER_REVIEWED" | "DISPUTED";
export type LegalReviewStatus = "UNVERIFIED" | "FOUNDER_AND_PEER_REVIEWED" | "DISPUTED";

const QUALIFIED_REVIEW_STATUSES: ReadonlySet<string> = new Set(["FOUNDER_AND_PEER_REVIEWED", "LAWYER_VERIFIED"]);

/**
 * Headroom's current engineering/product-development gate (task §A/§K):
 * "has this conclusion received completed qualified legal review" —
 * FOUNDER_AND_PEER_REVIEWED is sufficient on its own; no additional
 * outside-counsel/independent review is required. If a future artifact
 * separately carries LAWYER_VERIFIED (independent/outside-counsel)
 * provenance, that also satisfies this gate — it is simply a different,
 * not-required, reviewer relationship, never a mandatory higher rung above
 * FOUNDER_AND_PEER_REVIEWED (task §B).
 */
export function hasCompletedQualifiedLegalReview(status: GoldenTestReviewStatus | LegalReviewStatus): boolean {
  return QUALIFIED_REVIEW_STATUSES.has(status);
}
