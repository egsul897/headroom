/**
 * Rule 50 — section-ref ordering must be numeric everywhere,
 * not just in summaries (rule 38).
 *
 * Rule 38 fixed the summary sort, but three more surfaces
 * still sorted section refs lexicographically: the amendment
 * compare rows ("10.01" before "6.02"), the covenant-review
 * category blocks, the RP waterfall, and the completeness
 * audit's headroom refs. All now use numeric collation.
 */
import { describe, expect, it } from "vitest";
import { compareAmendmentSummaries } from "../../lib/product/customer-intelligence/amendment-compare";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

function item(over: Partial<CovenantSummaryItem> & { sourceId: string }): CovenantSummaryItem & { sourceId: string; documentTitle: string } {
  return {
    sectionRef: "6.01",
    category: "DEBT_INCURRENCE",
    heading: "H",
    plainEnglish: "P.",
    posture: "GENERAL_PROHIBITION",
    operativeLanguageExcerpt: "text",
    materialBasketsThresholds: [],
    documentTitle: "Doc",
    ...over,
  } as CovenantSummaryItem & { sourceId: string; documentTitle: string };
}

describe("compareAmendmentSummaries row order", () => {
  it("orders section refs numerically (6.02 before 10.01)", () => {
    const view = compareAmendmentSummaries({
      amendmentPackage: {
        operativeResolution: "RESOLVED",
        unresolvedReasons: [],
        askGuidance: "",
        baseCandidates: [{ sourceId: "base" } as never],
        amendmentDocuments: [{ sourceId: "amd" } as never],
      } as never,
      items: [
        item({ sourceId: "base", sectionRef: "10.01" }),
        item({ sourceId: "amd", sectionRef: "10.01" }),
        item({ sourceId: "base", sectionRef: "6.02" }),
        item({ sourceId: "amd", sectionRef: "6.02" }),
        item({ sourceId: "base", sectionRef: "9.01" }),
        item({ sourceId: "amd", sectionRef: "9.01" }),
      ],
    });
    expect(view.rows.map((r) => r.sectionRef)).toEqual(["6.02", "9.01", "10.01"]);
  });
});
