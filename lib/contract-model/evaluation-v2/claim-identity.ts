/**
 * Evaluation Methodology V2 — Phase 3F.1.5.3, Workstream A.
 *
 * SAME_COVENANT_FAMILY_IS_NOT_SAME_SEMANTIC_CLAIM.
 *
 * Confirmed defect (Phase 3F.1.5.2, Risk R3): a candidate anchored at a
 * DIFFERENT specific enumerated sub-provision than the ground-truth claim
 * (e.g. GT is Section 6.02(h); candidate is Section 6.02(d)) can still pass
 * deterministic correspondence, because the two share substantial genuine
 * covenant-family vocabulary — real legal language, not thin boilerplate —
 * and no existing dimension checks sub-provision IDENTITY. H_PROVISION_ROLE_
 * BREADTH classifies drafting SHAPE (chapeau vs. specific-exception vs.
 * affirmative-obligation), not identity among same-shape siblings: two
 * different lettered exceptions under the same chapeau have the identical
 * shape classification.
 *
 * This module adds a purely STRUCTURAL signal — parsed from sectionRef using
 * the already-existing, already-tested splitSectionRef() — that distinguishes
 * "these two candidates sit under the same covenant" from "these two
 * candidates are the SAME enumerated sub-provision." It carries no package,
 * document, or term-specific knowledge: it only ever compares the SHAPE of
 * two section-reference strings.
 */
import { splitSectionRef } from "./source-excerpt";
import type { CandidateSemanticRepresentation, GroundTruthSemanticUnit } from "./types";

export type ClaimIdentityOutcome = "SAME_SUBPROVISION" | "DIFFERENT_SUBPROVISION_SAME_PARENT" | "NOT_COMPARABLE";

export interface ClaimIdentityComparison {
  outcome: ClaimIdentityOutcome;
  gtSubReference: string | null;
  candidateSubReference: string | null;
  parentSection: string | null;
}

const NOT_COMPARABLE: ClaimIdentityComparison = { outcome: "NOT_COMPARABLE", gtSubReference: null, candidateSubReference: null, parentSection: null };

/**
 * Compares the ground truth's and candidate's section references to detect
 * a SIBLING sub-provision mismatch: both anchored under the identical parent
 * section, but at DIFFERENT top-level enumerated sub-items.
 *
 * Deliberately conservative about when it has an opinion at all:
 *  - different documents, or a candidate with no sectionRef at all -> NOT_COMPARABLE.
 *  - different base/parent sections -> NOT_COMPARABLE (an unrelated-section
 *    mismatch is already the job of the lexical/family dimensions; this
 *    module only adjudicates SIBLINGS under a shared parent).
 *  - either side lacking any enumerated sub-item (a bare chapeau-level
 *    reference) -> NOT_COMPARABLE (an ancestor/descendant relationship is
 *    H_PROVISION_ROLE_BREADTH's job, not this dimension's).
 *  - both sides share the same top-level enumerated sub-item (regardless of
 *    deeper nesting, e.g. both under "(b)" even if one drills to "(b)(i)")
 *    -> SAME_SUBPROVISION.
 *  - both sides have a top-level enumerated sub-item under the same parent,
 *    and those top-level sub-items differ -> DIFFERENT_SUBPROVISION_SAME_PARENT.
 */
export function compareClaimIdentity(gt: GroundTruthSemanticUnit, candidate: CandidateSemanticRepresentation): ClaimIdentityComparison {
  if (!candidate.sectionRef) return NOT_COMPARABLE;
  if (gt.documentId && candidate.documentId && gt.documentId !== candidate.documentId) return NOT_COMPARABLE;

  const gtSplit = splitSectionRef(gt.sectionRef);
  const candSplit = splitSectionRef(candidate.sectionRef);
  if (!gtSplit.base || !candSplit.base) return NOT_COMPARABLE;
  if (gtSplit.base.toLowerCase() !== candSplit.base.toLowerCase()) return NOT_COMPARABLE;
  if (gtSplit.parts.length === 0 || candSplit.parts.length === 0) return NOT_COMPARABLE;

  const gtTopLevel = gtSplit.parts[0]!.toLowerCase();
  const candTopLevel = candSplit.parts[0]!.toLowerCase();
  const gtSubReference = `${gtSplit.base}${gtSplit.parts.join("")}`;
  const candidateSubReference = `${candSplit.base}${candSplit.parts.join("")}`;

  if (gtTopLevel === candTopLevel) {
    return { outcome: "SAME_SUBPROVISION", gtSubReference, candidateSubReference, parentSection: gtSplit.base };
  }
  return { outcome: "DIFFERENT_SUBPROVISION_SAME_PARENT", gtSubReference, candidateSubReference, parentSection: gtSplit.base };
}
