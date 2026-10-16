/**
 * Rule 57 — the reanalysis conflict note must reflect THIS
 * item's drift, not the cumulative conflict count.
 *
 * The old code tested conflicts.length (all prior items) when
 * composing each item's note, so an unchanged item after a
 * drifted one was falsely stamped "AI text may have changed —
 * conflict flagged". Counsel reading that item would think
 * its text drifted when it did not. The note now uses a
 * per-item drift boolean. The merge also moved to prisma-free
 * reviewer-merge.ts.
 */
import { describe, expect, it } from "vitest";
import { mergePreservedReviewerDecisions } from "../../lib/product/customer-intelligence/reviewer-merge";
import type { DocumentCovenantSummary, CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";
import type { ReviewerApproval } from "../../lib/product/customer-intelligence/reviewer-approvals";

function summary(items: Array<Partial<CovenantSummaryItem> & { sectionRef: string }>): DocumentCovenantSummary {
  return {
    items: items.map((i) => ({ plainEnglish: "", ...i }) as CovenantSummaryItem),
  } as DocumentCovenantSummary;
}

function approval(over: Partial<ReviewerApproval> & { sectionRef: string }): ReviewerApproval {
  return {
    sourceId: "s1",
    category: "DEBT_INCURRENCE",
    decision: "ACCEPTED",
    reviewedAt: "2026-01-01T00:00:00.000Z",
    reviewerLabel: "counsel",
    version: 1,
    ...over,
  };
}

describe("mergePreservedReviewerDecisions conflict notes", () => {
  it("stamps the conflict note only on the drifted item", () => {
    const merged = mergePreservedReviewerDecisions({
      summary: summary([
        { sectionRef: "6.01", plainEnglish: "New AI text about debt." },
        { sectionRef: "6.02", plainEnglish: "Same AI text about liens." },
      ]),
      priorApprovals: [
        approval({ sectionRef: "6.01", priorPlainEnglish: "Old AI text about debt." }),
        approval({ sectionRef: "6.02", priorPlainEnglish: "Same AI text about liens." }),
      ],
    });
    expect(merged.conflicts).toHaveLength(1);
    expect(merged.conflicts[0]).toContain("6.01");
    expect(merged.summary.items[0]?.interpretationNote).toContain("AI text may have changed");
    expect(merged.summary.items[1]?.interpretationNote ?? "").not.toContain("AI text may have changed");
  });

  it("stamps no conflict note when nothing drifted", () => {
    const merged = mergePreservedReviewerDecisions({
      summary: summary([{ sectionRef: "6.01", plainEnglish: "Same text." }]),
      priorApprovals: [approval({ sectionRef: "6.01", priorPlainEnglish: "Same text." })],
    });
    expect(merged.conflicts).toEqual([]);
    expect(merged.summary.items[0]?.interpretationNote ?? "").not.toContain("AI text may have changed");
  });
});
