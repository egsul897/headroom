/**
 * Legal-review provenance gating semantics (docs/legal-review-status-model.md).
 *
 * This module exists purely to give a single, explicit place for the
 * conceptual "has this artifact received completed qualified legal review"
 * question, in case a future gate needs to ask it — no existing code path
 * actually gates anything on legal-review status today
 * (lib/covenant-engine.ts's EvaluationStatus/TransactionStatus and
 * lib/solver/status.ts's PathStatus both gate on DATA/COVERAGE completeness,
 * not legal-review provenance — see the audit note in
 * docs/legal-review-status-model.md §7). This function is therefore not
 * wired into any current gate; it is the generalized, correctly-shaped
 * predicate a future one should use instead of an ordinal enum comparison.
 *
 * 2026-08-25 UPDATE ("Final legal review status instruction" —
 * docs/legal-review-status-model.md): the prior FOUNDER_AND_PEER_REVIEWED
 * status required both the founder and a second attorney. The founder — as
 * Headroom's own controlling legal-review authority — superseded that
 * requirement: a conclusion the founder has personally reviewed and approved
 * is VERIFIED, the complete legal-review state, with no additional
 * peer/second-attorney/outside-counsel/independent-counsel requirement. The
 * enum value itself was renamed (Prisma migration
 * 20260825145840_rename_founder_and_peer_reviewed_to_verified) rather than
 * data-migrated — every previously-FOUNDER_AND_PEER_REVIEWED row is now
 * VERIFIED automatically.
 *
 * Deliberately explicit set membership, NOT an ordinal `status >= X`
 * comparison ("do not use ordinal status comparisons if they incorrectly
 * imply that one reviewer relationship automatically makes the substantive
 * legal review 'better'"). If the founder later introduces an *additional*
 * review requirement for some future purpose, that should be recorded as an
 * additional `LegalReviewRecord` alongside an existing VERIFIED one, never as
 * a silently-reintroduced required tier above it — see
 * docs/legal-review-status-model.md's "no new legal blocker" policy.
 */

export type GoldenTestReviewStatus = "UNVERIFIED" | "VERIFIED" | "DISPUTED";
export type LegalReviewStatus = "UNVERIFIED" | "VERIFIED" | "DISPUTED";

const QUALIFIED_REVIEW_STATUSES: ReadonlySet<string> = new Set(["VERIFIED"]);

/**
 * Headroom's current engineering/product-development gate: "has this
 * conclusion received completed qualified legal review" — the founder's own
 * VERIFIED status is sufficient on its own; no additional outside-counsel/
 * independent/peer review is required (2026-08-25 policy, see this module's
 * header comment). If a future artifact separately records independent/
 * outside-counsel provenance (via an additional LegalReviewRecord, not a new
 * enum tier), that should also satisfy this gate — extend
 * QUALIFIED_REVIEW_STATUSES (or this function's signature) at that time
 * rather than modeling it as a required rung above VERIFIED.
 */
export function hasCompletedQualifiedLegalReview(status: GoldenTestReviewStatus | LegalReviewStatus): boolean {
  return QUALIFIED_REVIEW_STATUSES.has(status);
}
