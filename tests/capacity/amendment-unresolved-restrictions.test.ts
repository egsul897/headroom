/**
 * Amendment exclusion requires INCORPORATION evidence, not just
 * reviewer decisions (residual issue 5). A decision alone does not
 * incorporate an effect: an ACCEPTED-but-INCOMPLETE item (no
 * compiled Permission / provision) has an unknown effect, so the
 * amendment stays in the aggregation as NOT_DETERMINABLE
 * (fail-closed). REJECTED items count as incorporated (counsel
 * determined no operative effect).
 */
import { describe, expect, it } from "vitest";
import { hasUnincorporatedRestrictionsForSource, isNonCapacityAmendment } from "../../lib/covenant-engine";
import type { DocumentCapacityResult } from "../../lib/covenant-engine";
import { permissionCode } from "../../lib/product/customer-intelligence/permission-code";

const SRC = "src-amend";
const DOC = "doc-amd";
const basketItem = (sectionRef: string, category = "OTHER") => ({
  sectionRef, category, materialBasketsThresholds: ["Amount/threshold: $5,000,000"], conditions: [], permissions: [],
});
const approval = (sectionRef: string, category = "OTHER", decision = "ACCEPTED") => ({ sectionRef, category, decision });
// A live compiled artifact for exactly this (sourceId, sectionRef, category).
const artifact = (sectionRef: string, category = "OTHER", documentId = DOC) => ({
  code: permissionCode(SRC, sectionRef, "DEBT_INCURRENCE", category),
  documentId,
});
const check = (
  items: Parameters<typeof hasUnincorporatedRestrictionsForSource>[0],
  approvals: Parameters<typeof hasUnincorporatedRestrictionsForSource>[1] = [],
  provisions: Parameters<typeof hasUnincorporatedRestrictionsForSource>[2] = [],
) => hasUnincorporatedRestrictionsForSource(items, approvals, provisions, SRC, DOC);
const doc = (overrides: Partial<DocumentCapacityResult> = {}): DocumentCapacityResult => ({
  documentId: "doc-amd", documentName: "Amendment No. 1", documentType: "AMENDMENT",
  hasUnresolvedRestrictions: false,
  securedStatus: "not_tested", securedLabeledSubtotals: [],
  unsecuredStatus: "not_tested", unsecuredLabeledSubtotals: [],
  ...overrides,
});

describe("hasUnincorporatedRestrictionsForSource", () => {
  it("restriction-bearing item with no decision is unincorporated", () => {
    expect(check([basketItem("6.02(bb)")])).toBe(true);
  });
  it("ACCEPTED with a live compiled artifact for the same (ref, category) is incorporated", () => {
    expect(check([basketItem("6.02(bb)")], [approval("6.02(bb)")], [artifact("6.02(bb)")])).toBe(false);
  });
  it("ACCEPTED with NO compiled artifact is unincorporated (decision alone is not evidence)", () => {
    expect(check([basketItem("6.02(bb)")], [approval("6.02(bb)")], [])).toBe(true);
  });
  it("REJECTED counts as incorporated (counsel determined no operative effect)", () => {
    expect(check([basketItem("6.02(bb)")], [approval("6.02(bb)", "OTHER", "REJECTED")], [])).toBe(false);
  });
  it("an artifact for a DIFFERENT category does not incorporate the item", () => {
    expect(
      check([basketItem("1.01(g)(c)(c)", "OTHER")], [approval("1.01(g)(c)(c)", "OTHER")], [artifact("1.01(g)(c)(c)", "EVENTS_OF_DEFAULT")]),
    ).toBe(true);
  });
  it("an artifact for a DIFFERENT document does not incorporate the item", () => {
    expect(
      check([basketItem("6.02(bb)")], [approval("6.02(bb)")], [artifact("6.02(bb)", "OTHER", "doc-other")]),
    ).toBe(true);
  });
  it("a decision for a DIFFERENT category does not resolve the item (Fix 6 isolation)", () => {
    expect(
      check([basketItem("1.01(g)(c)(c)", "OTHER")], [approval("1.01(g)(c)(c)", "EVENTS_OF_DEFAULT")], [artifact("1.01(g)(c)(c)", "OTHER")]),
    ).toBe(true);
  });
  it("a pure boilerplate item (no baskets/conditions/permissions) is not a restriction", () => {
    expect(
      check(
        [{ sectionRef: "1.01", category: "OTHER", materialBasketsThresholds: [], conditions: [], permissions: [] }],
      ),
    ).toBe(false);
  });
  it("a conditions-only item with no decision is unincorporated", () => {
    expect(
      check(
        [{ sectionRef: "5.1(b)", category: "OTHER", materialBasketsThresholds: [], conditions: ["provided_that: provided that no Default has occurred"], permissions: [] }],
      ),
    ).toBe(true);
  });
});

describe("isNonCapacityAmendment with unincorporated restrictions", () => {
  it("an amendment with unincorporated restrictions is NOT skipped", () => {
    expect(isNonCapacityAmendment(doc({ hasUnresolvedRestrictions: true }))).toBe(false);
  });
  it("an amendment with incorporated restrictions and no modeled side IS skipped", () => {
    expect(isNonCapacityAmendment(doc({ hasUnresolvedRestrictions: false }))).toBe(true);
  });
  it("an amendment with a modeled side is never skipped", () => {
    expect(isNonCapacityAmendment(doc({ hasUnresolvedRestrictions: false, securedStatus: "modeled", securedCapacity: 60 }))).toBe(false);
  });
});
