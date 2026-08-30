/**
 * Phase 3F.1.5.R §4 - stable, sibling-safe, pre-compilation claim identity.
 *
 * Never invents a new identity scheme (§4's own "do not use human-readable
 * sectionRef alone as unique identity" - the earlier structural-identity work
 * established exactly why that is unsafe). Instead this module strictly
 * REUSES the two identity schemes the live pipeline has already proven safe
 * for exactly this purpose:
 *
 *  1. semantic-coverage's MaterialSemanticUnit.semanticUnitId - content-derived
 *     from (documentId + anchor span + detection signature), computed by
 *     computeSemanticUnitId() in semantic-coverage/identity.ts. This is the
 *     PREFERRED identity whenever a semantic-coverage audit has run, because
 *     its anchor-span derivation already distinguishes sibling/sub-provisions
 *     under the same base section (unlike a bare sectionRef).
 *
 *  2. The compiler's own candidateRef convention (documented on
 *     SemanticCompilerInput.candidateRef): a Phase 2B DiscoveredCandidate's
 *     discoveryId where one exists (already occurrence-safe per Phase 3F.1.2's
 *     structuralNodeIds work), else the normalized source section ref. Used
 *     as the fallback when no semantic-coverage unit exists yet for this
 *     claim (e.g. a compiler-only or verifier-only emission point).
 *
 * Residual risk, disclosed rather than hidden: the candidateRef fallback's
 * OWN fallback (normalized section ref, when no discoveryId exists) can in
 * principle still collide across two sibling sub-provisions that discovery
 * never separately discovered - this is the exact same sibling-collision
 * class Workstream A fixed for the FROZEN EVALUATOR MATCHER in Phase
 * 3F.1.5.3, and this module deliberately does NOT attempt to re-solve it
 * here (Section 20 of this phase's own charter: determine whether a claim-
 * identity risk is production-relevant before touching anything, and never
 * casually reopen the frozen evaluator matcher). Per Section 31 of this
 * phase's charter, an UNDISCOVERED claim (no discoveryId, ambiguous fallback
 * ref) remains a discovery/coverage failure, not something this safe-failure
 * architecture can or should paper over.
 */

export interface ClaimKeyFromSemanticUnitInput {
  semanticUnitId: string;
}

export interface ClaimKeyFromCandidateRefInput {
  candidateRef: string;
}

/** Preferred identity source - reuses semantic-coverage's own content-derived unit id verbatim. */
export function claimKeyFromSemanticUnit(input: ClaimKeyFromSemanticUnitInput): string {
  return `su:${input.semanticUnitId}`;
}

/** Fallback identity source when no semantic-coverage unit exists yet - reuses the compiler's own candidateRef verbatim. */
export function claimKeyFromCandidateRef(input: ClaimKeyFromCandidateRefInput): string {
  return `cr:${input.candidateRef}`;
}

/**
 * Namespacing rationale for the `su:`/`cr:` prefixes: semanticUnitId and
 * candidateRef are independently-computed identity schemes (different
 * algorithms, different inputs) that happen to be plain strings - without a
 * namespace prefix, a coincidental string collision between the two schemes
 * would silently merge two unrelated claims into one ClaimReviewItem row.
 * The prefix costs nothing and removes that entire risk class.
 */
export function isSemanticUnitClaimKey(claimKey: string): boolean {
  return claimKey.startsWith("su:");
}

export function isCandidateRefClaimKey(claimKey: string): boolean {
  return claimKey.startsWith("cr:");
}
