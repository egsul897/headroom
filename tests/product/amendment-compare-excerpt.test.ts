/**
 * Rule 30 — compare full operative excerpts, not just the first
 * 120 chars.
 *
 * compareAmendmentSummaries detected a text shift by comparing
 * only the first 120 chars of each excerpt. Two versions with an
 * identical opening but a different proviso after char 120
 * ("...provided that no Default has occurred" → "...provided
 * that Leverage is less than 3.0x") compared EQUAL → BOTH_PRESENT
 * → the resolver's change filter missed it → no operative
 * binding for the amended proviso. Compare normalized FULL
 * excerpts (already clipped to 700 chars at analysis time).
 */
import { describe, expect, it } from "vitest";
import { compareAmendmentSummaries } from "../../lib/product/customer-intelligence/amendment-compare";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";
import type { AmendmentPackageView } from "../../lib/product/customer-intelligence/amendment-package";

function item(sourceId: string, sectionRef: string, excerpt: string): CovenantSummaryItem & { sourceId: string; documentTitle: string } {
  return {
    sourceId,
    documentTitle: sourceId,
    sectionRef,
    category: "DEBT_INCURRENCE",
    heading: "Limitation on Indebtedness",
    operativeLanguageExcerpt: excerpt,
    materialBasketsThresholds: ["Amount/threshold: $150.0 million"],
  } as unknown as CovenantSummaryItem & { sourceId: string; documentTitle: string };
}

function pkg(): AmendmentPackageView {
  return {
    operativeResolution: "UNRESOLVED_PRECEDENCE",
    baseCandidates: [{ sourceId: "base", title: "Credit Agreement", documentClass: "CREDIT_AGREEMENT" }],
    amendmentDocuments: [{ sourceId: "amd", title: "First Amendment", documentClass: "AMENDMENT" }],
    unresolvedReasons: [],
  } as unknown as AmendmentPackageView;
}

describe("amendment compare excerpt comparison", () => {
  it("flags a proviso change after char 120 as a shift", () => {
    const shared = "The Company shall not create Indebtedness except as permitted herein under the basket provisions set forth in this Section, subject to the following conditions and limitations: ";
    expect(shared.length).toBeGreaterThan(120);
    const rows = compareAmendmentSummaries({
      amendmentPackage: pkg(),
      items: [
        item("base", "6.01", shared + "provided that no Default has occurred."),
        item("amd", "6.01", shared + "provided that Leverage is less than 3.0x."),
      ],
    }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.changeKind).toBe("THRESHOLD_OR_TEXT_SHIFT");
  });

  it("identical excerpts stay BOTH_PRESENT", () => {
    const rows = compareAmendmentSummaries({
      amendmentPackage: pkg(),
      items: [
        item("base", "6.01", "Same operative text."),
        item("amd", "6.01", "Same operative text."),
      ],
    }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.changeKind).toBe("BOTH_PRESENT");
  });
});
