/**
 * Issue 5: an amendment with unresolved restrictions must not be
 * silently excluded from capacity calculations (Fix 8's skip).
 * The skip is safe only when the amendment's restriction-bearing
 * items have reviewer decisions; otherwise the amendment stays in
 * the aggregation as NOT_DETERMINABLE (fail-closed).
 */
import { describe, expect, it } from "vitest";
import { hasUnresolvedRestrictionsForSource, isNonCapacityAmendment } from "../../lib/covenant-engine";
import type { DocumentCapacityResult } from "../../lib/covenant-engine";

const basketItem = (sectionRef: string, category = "OTHER") => ({
  sectionRef, category, materialBasketsThresholds: ["Amount/threshold: $5,000,000"], conditions: [], permissions: [],
});
const decided = (sectionRef: string, category = "OTHER") => ({ sectionRef, category });
const doc = (overrides: Partial<DocumentCapacityResult> = {}): DocumentCapacityResult => ({
  documentId: "doc-amd", documentName: "Amendment No. 1", documentType: "AMENDMENT",
  hasUnresolvedRestrictions: false,
  securedStatus: "not_tested", securedLabeledSubtotals: [],
  unsecuredStatus: "not_tested", unsecuredLabeledSubtotals: [],
  ...overrides,
});

describe("hasUnresolvedRestrictionsForSource", () => {
  it("restriction-bearing item with no decision is unresolved", () => {
    expect(hasUnresolvedRestrictionsForSource([basketItem("6.02(bb)")], [])).toBe(true);
  });
  it("restriction-bearing item with a decision for (ref, category) is resolved", () => {
    expect(hasUnresolvedRestrictionsForSource([basketItem("6.02(bb)")], [decided("6.02(bb)")])).toBe(false);
  });
  it("a decision for a DIFFERENT category does not resolve the item (Fix 6 isolation)", () => {
    expect(
      hasUnresolvedRestrictionsForSource([basketItem("1.01(g)(c)(c)", "OTHER")], [decided("1.01(g)(c)(c)", "EVENTS_OF_DEFAULT")]),
    ).toBe(true);
  });
  it("a pure boilerplate item (no baskets/conditions/permissions) is not a restriction", () => {
    expect(
      hasUnresolvedRestrictionsForSource(
        [{ sectionRef: "1.01", category: "OTHER", materialBasketsThresholds: [], conditions: [], permissions: [] }],
        [],
      ),
    ).toBe(false);
  });
  it("a conditions-only item with no decision is unresolved", () => {
    expect(
      hasUnresolvedRestrictionsForSource(
        [{ sectionRef: "5.1(b)", category: "OTHER", materialBasketsThresholds: [], conditions: ["provided_that: provided that no Default has occurred"], permissions: [] }],
        [],
      ),
    ).toBe(true);
  });
});

describe("isNonCapacityAmendment with unresolved restrictions", () => {
  it("an amendment with unresolved restrictions is NOT skipped", () => {
    expect(isNonCapacityAmendment(doc({ hasUnresolvedRestrictions: true }))).toBe(false);
  });
  it("an amendment with resolved restrictions and no modeled side IS skipped", () => {
    expect(isNonCapacityAmendment(doc({ hasUnresolvedRestrictions: false }))).toBe(true);
  });
  it("an amendment with a modeled side is never skipped", () => {
    expect(isNonCapacityAmendment(doc({ hasUnresolvedRestrictions: false, securedStatus: "modeled", securedCapacity: 60 }))).toBe(false);
  });
});
