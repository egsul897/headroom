/**
 * Pure reanalysis merge for preserved reviewer decisions.
 * Kept free of prisma imports so it is unit-testable in
 * isolation.
 */
import type {
  CovenantSummaryItem,
  DocumentCovenantSummary,
} from "../covenant-intelligence/summarize";
import type { ReviewerApproval } from "./reviewer-approvals";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * After AI reanalysis, re-apply counsel edits/accepts onto the new summary and
 * flag conflicts when the AI plain English materially changed under an ACCEPTED item.
 */
export function mergePreservedReviewerDecisions(params: {
  summary: DocumentCovenantSummary;
  priorApprovals: ReviewerApproval[];
}): { summary: DocumentCovenantSummary; conflicts: string[] } {
  const conflicts: string[] = [];
  if (!params.priorApprovals.length) return { summary: params.summary, conflicts };

  const items = params.summary.items.map((item) => {
    const approval = params.priorApprovals.find((a) => a.sectionRef === item.sectionRef);
    if (!approval || approval.decision === "REJECTED") return item;
    if (approval.decision === "EDITED" && approval.editedPlainEnglish?.trim()) {
      return {
        ...item,
        plainEnglish: approval.editedPlainEnglish.trim(),
        reviewerDecision: "EDITED" as const,
        interpretationNote: `${item.interpretationNote ?? ""} [Counsel edit preserved after reanalysis ${approval.reviewedAt}]`.trim(),
      };
    }
    if (approval.decision === "ACCEPTED") {
      const prior = approval.priorPlainEnglish ?? approval.editedPlainEnglish;
      // Rule 57: the conflict note must reflect THIS item's drift,
      // not the cumulative conflict count. The old code tested
      // conflicts.length (all prior items) when composing this
      // item's note, so an unchanged item after a drifted one was
      // falsely stamped "AI text may have changed".
      const thisConflict = Boolean(prior && normalize(prior) !== normalize(item.plainEnglish));
      if (thisConflict) {
        conflicts.push(
          `§${item.sectionRef}: AI text changed after counsel acceptance — review again (prior acceptance retained as flag).`,
        );
      }
      return {
        ...item,
        reviewerDecision: "ACCEPTED" as const,
        interpretationNote: `${item.interpretationNote ?? ""} [Prior counsel acceptance ${approval.reviewedAt}${thisConflict ? "; AI text may have changed — conflict flagged" : ""}]`.trim(),
      };
    }
    return item;
  });

  return {
    summary: { ...params.summary, items },
    conflicts,
  };
}
