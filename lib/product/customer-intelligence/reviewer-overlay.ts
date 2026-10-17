/**
 * Pure reviewer-overlay: apply counsel decisions onto summary items
 * for Ask / display. Kept free of prisma imports so it is
 * unit-testable in isolation.
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import type { ReviewerApproval } from "./reviewer-approvals";

/** Overlay counsel decisions onto summary items for Ask / display. */
export function applyReviewerOverlayToItems(
  items: Array<CovenantSummaryItem & { sourceId?: string }>,
  approvals: ReviewerApproval[],
): Array<CovenantSummaryItem & { sourceId?: string }> {
  return items
    .map((item) => {
      // Strict (sectionRef + sourceId) match. The old fallback
      // applied an approval to a DIFFERENT source when exactly one
      // approval shared the sectionRef — counsel's decision on
      // §6.01 of Doc A would then apply to (or REJECT-filter) §6.01
      // of Doc B. Section refs are only unique within a document.
      // Sourceless items keep the legacy sectionRef-only match.
      // Fix 6: match on category too — an EDITED decision on the
      // EVENTS_OF_DEFAULT reading of a section must not overwrite the
      // OTHER reading's plainEnglish. A missing category on either side
      // (synthetic / legacy items) is a wildcard so the Rule 27
      // legacy sectionRef match keeps working; in production both
      // sides always carry a category, so the match is strict there.
      const approval = approvals.find(
        (a) =>
          a.sectionRef === item.sectionRef &&
          (!item.category || !a.category || a.category === item.category) &&
          (!item.sourceId || a.sourceId === item.sourceId),
      );
      if (!approval) return item;
      if (approval.decision === "REJECTED") {
        return { ...item, reviewerDecision: "REJECTED" as const };
      }
      const plain =
        approval.decision === "EDITED" && approval.editedPlainEnglish?.trim()
          ? approval.editedPlainEnglish.trim()
          : item.plainEnglish;
      return {
        ...item,
        plainEnglish: plain,
        reviewerDecision: approval.decision,
        interpretationNote: `${item.interpretationNote ?? ""} [Workspace counsel ${approval.decision.toLowerCase()} ${approval.reviewedAt}]`.trim(),
      };
    })
    .filter((item) => item.reviewerDecision !== "REJECTED");
}
