/**
 * Rule 32 — compare must not silently collapse duplicate section
 * refs.
 *
 * compareAmendmentSummaries keyed items by sectionRef in Maps, so
 * later items overwrote earlier ones. Since rule 13, one document
 * can legitimately carry two items under the same ref (base +
 * amendment versions of §6.01 in a single PDF), and two base docs
 * can share a ref. The compare silently picked one and could emit
 * a THRESHOLD_OR_TEXT_SHIFT / ADDED_IN_AMENDMENT row the resolver
 * then BOUND — a binding from an arbitrary pick. Now a ref with
 * duplicates on either side yields BOTH_PRESENT with a duplicate
 * note (never a bindable kind), so the resolver cannot bind from
 * a collapsed comparison.
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

describe("amendment compare duplicate refs", () => {
  it("duplicate base refs yield BOTH_PRESENT with a duplicate note (never bindable)", () => {
    const rows = compareAmendmentSummaries({
      amendmentPackage: pkg(),
      items: [
        item("base", "6.01", "Base version one: cap $50.0 million."),
        item("base", "6.01", "Base version two: cap $100.0 million."),
        item("amd", "6.01", "Amendment version: cap $200.0 million."),
      ],
    }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.changeKind).toBe("BOTH_PRESENT");
    expect(rows[0]?.note).toMatch(/duplicat/i);
  });

  it("duplicate amendment-only refs yield BOTH_PRESENT (never ADDED binding)", () => {
    const rows = compareAmendmentSummaries({
      amendmentPackage: pkg(),
      items: [
        item("amd", "6.01", "Amendment version one."),
        item("amd", "6.01", "Amendment version two."),
      ],
    }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.changeKind).toBe("BOTH_PRESENT");
    expect(rows[0]?.note).toMatch(/duplicat/i);
  });

  it("unique refs still compare normally", () => {
    const rows = compareAmendmentSummaries({
      amendmentPackage: pkg(),
      items: [
        item("base", "6.01", "Base text."),
        item("amd", "6.01", "Different amendment text."),
      ],
    }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.changeKind).toBe("THRESHOLD_OR_TEXT_SHIFT");
  });
});
