/**
 * Rule 31 — compare row truncation must be disclosed.
 *
 * compareAmendmentSummaries capped rows at 40 with no marker —
 * the same silent-truncation class as rule 7 (summary items).
 * A package with 50 differing sections showed 40 rows and the
 * reader could not know 10 were dropped. Add totalRowsBeforeCap
 * + truncated, mirroring the summary shape.
 */
import { describe, expect, it } from "vitest";
import { compareAmendmentSummaries } from "../../lib/product/customer-intelligence/amendment-compare";
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";
import type { AmendmentPackageView } from "../../lib/product/customer-intelligence/amendment-package";

function item(sourceId: string, sectionRef: string): CovenantSummaryItem & { sourceId: string; documentTitle: string } {
  return {
    sourceId,
    documentTitle: sourceId,
    sectionRef,
    category: "DEBT_INCURRENCE",
    heading: "Limitation on Indebtedness",
    operativeLanguageExcerpt: `Operative text for ${sectionRef}.`,
    materialBasketsThresholds: [],
  } as unknown as CovenantSummaryItem & { sourceId: string; documentTitle: string };
}

describe("amendment compare truncation disclosure", () => {
  it("discloses when rows are capped at 40", () => {
    const items: Array<CovenantSummaryItem & { sourceId: string; documentTitle: string }> = [];
    for (let i = 1; i <= 45; i += 1) {
      const sec = `6.${String(i).padStart(2, "0")}`;
      items.push(item("base", sec));
      items.push(item("amd", sec));
    }
    const ap = {
      operativeResolution: "UNRESOLVED_PRECEDENCE",
      baseCandidates: [{ sourceId: "base", title: "Credit Agreement", documentClass: "CREDIT_AGREEMENT" }],
      amendmentDocuments: [{ sourceId: "amd", title: "First Amendment", documentClass: "AMENDMENT" }],
      unresolvedReasons: [],
    } as unknown as AmendmentPackageView;
    const out = compareAmendmentSummaries({ amendmentPackage: ap, items });
    expect(out.rows).toHaveLength(40);
    expect(out.totalRowsBeforeCap).toBe(45);
    expect(out.truncated).toBe(true);
  });

  it("no truncation marker when under the cap", () => {
    const ap = {
      operativeResolution: "UNRESOLVED_PRECEDENCE",
      baseCandidates: [{ sourceId: "base", title: "Credit Agreement", documentClass: "CREDIT_AGREEMENT" }],
      amendmentDocuments: [{ sourceId: "amd", title: "First Amendment", documentClass: "AMENDMENT" }],
      unresolvedReasons: [],
    } as unknown as AmendmentPackageView;
    const out = compareAmendmentSummaries({
      amendmentPackage: ap,
      items: [item("base", "6.01"), item("amd", "6.01")],
    });
    expect(out.rows).toHaveLength(1);
    expect(out.totalRowsBeforeCap).toBe(1);
    expect(out.truncated).toBe(false);
  });
});
