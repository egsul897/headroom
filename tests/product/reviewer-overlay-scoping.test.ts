/**
 * Rule 27 — reviewer overlay must never apply one document's
 * decision to another document's section.
 *
 * applyReviewerOverlayToItems had a fallback: when no approval
 * matched the item's sourceId, it applied the approval anyway if
 * exactly one approval shared the sectionRef. Counsel's decision
 * on §6.01 of Doc A would then apply to §6.01 of Doc B — and a
 * REJECTED on Doc A would FILTER OUT Doc B's §6.01 item entirely.
 * Section refs are only unique within a document (rule 13).
 * Match strictly on (sectionRef + sourceId); the sourceless-item
 * legacy path is preserved.
 */
import { describe, expect, it } from "vitest";
import { applyReviewerOverlayToItems } from "../../lib/product/customer-intelligence/reviewer-overlay";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(sectionRef: string, sourceId?: string): CovenantSummaryItem & { sourceId?: string } {
  return {
    sectionRef,
    plainEnglish: "AI text",
    sourceId,
  } as unknown as CovenantSummaryItem & { sourceId?: string };
}

describe("reviewer overlay source scoping", () => {
  it("does NOT apply Doc A's REJECTED to Doc B's same-ref item", () => {
    const out = applyReviewerOverlayToItems(
      [item("6.01", "doc-b")],
      [
        {
          sourceId: "doc-a",
          sectionRef: "6.01",
          category: "DEBT",
          decision: "REJECTED",
          reviewedAt: "2026-01-01T00:00:00.000Z",
          reviewerLabel: "counsel",
          version: 1,
        },
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.plainEnglish).toBe("AI text");
  });

  it("applies the decision when sourceId matches", () => {
    const out = applyReviewerOverlayToItems(
      [item("6.01", "doc-a")],
      [
        {
          sourceId: "doc-a",
          sectionRef: "6.01",
          category: "DEBT",
          decision: "EDITED",
          editedPlainEnglish: "Counsel corrected text",
          reviewedAt: "2026-01-01T00:00:00.000Z",
          reviewerLabel: "counsel",
          version: 1,
        },
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.plainEnglish).toBe("Counsel corrected text");
  });

  it("sourceless items keep the legacy sectionRef match", () => {
    const out = applyReviewerOverlayToItems(
      [item("6.01")],
      [
        {
          sourceId: "doc-a",
          sectionRef: "6.01",
          category: "DEBT",
          decision: "EDITED",
          editedPlainEnglish: "Counsel corrected text",
          reviewedAt: "2026-01-01T00:00:00.000Z",
          reviewerLabel: "counsel",
          version: 1,
        },
      ],
    );
    expect(out[0]?.plainEnglish).toBe("Counsel corrected text");
  });
});
