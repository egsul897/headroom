/**
 * Rule 33 — selectEnumeratedPath must enforce eligibility itself.
 *
 * Its contract says "Unknown / stale / ineligible pathIds fail
 * closed — never silently substitute", but the implementation
 * trusted the caller to pre-filter to CANDIDATE +
 * hasCapacityExpression. Given an explicit pathId matching an
 * INELIGIBLE candidate (status REVIEW_REQUIRED, or no capacity
 * expression), it chose it. And auto-select counted ineligible
 * candidates, so one eligible + one ineligible candidate demanded
 * PATH_SELECTION_REQUIRED instead of auto-selecting the eligible
 * one. Eligibility is now enforced inside the function: explicit
 * ineligible matches return PATH_INELIGIBLE, auto-select counts
 * only eligible candidates.
 */
import { describe, expect, it } from "vitest";
import { selectEnumeratedPath } from "../../lib/product/unified-position/path-selection";
import type { EnumeratedCertifiedPath } from "../../lib/product/north-star-workflow/verified-path-enumeration";

function candidate(
  pathId: string,
  over: Partial<EnumeratedCertifiedPath> = {},
): EnumeratedCertifiedPath {
  return {
    pathId,
    label: pathId,
    status: "CANDIDATE",
    ruleId: pathId.replace(/^path:/, ""),
    sourceSectionRef: "§1",
    action: "INCUR_DEBT",
    covenantFamily: "DEBT",
    permission: { posture: "PERMISSION", ruleType: "CAPACITY", hasCapacityExpression: true, sufficiency: "COMPLETE" },
    conditions: [],
    financialTests: [],
    sharedCapacityInteractions: [],
    companionRestrictions: [],
    note: "test",
    ...over,
  } as EnumeratedCertifiedPath;
}

describe("selectEnumeratedPath eligibility enforcement", () => {
  it("explicit pathId matching an ineligible candidate fails closed (PATH_INELIGIBLE)", () => {
    const ineligible = candidate("path:stale", {
      status: "REVIEW_REQUIRED" as never,
    });
    const r = selectEnumeratedPath([ineligible], "path:stale");
    expect(r.chosen).toBeNull();
    expect(r.error).toBe("PATH_INELIGIBLE:path:stale");
    expect(r.autoSelected).toBe(false);
  });

  it("explicit pathId matching a candidate without a capacity expression fails closed", () => {
    const noCap = candidate("path:nocap", {
      permission: { posture: "PERMISSION", ruleType: "CAPACITY", hasCapacityExpression: false, sufficiency: "COMPLETE" },
    });
    const r = selectEnumeratedPath([noCap], "path:nocap");
    expect(r.chosen).toBeNull();
    expect(r.error).toBe("PATH_INELIGIBLE:path:nocap");
  });

  it("auto-select counts only eligible candidates", () => {
    const eligible = candidate("path:good");
    const ineligible = candidate("path:bad", { status: "REVIEW_REQUIRED" as never });
    const r = selectEnumeratedPath([eligible, ineligible], null);
    expect(r.chosen?.pathId).toBe("path:good");
    expect(r.autoSelected).toBe(true);
    expect(r.error).toBeNull();
  });

  it("all-ineligible list with no pathId reports NO_CANDIDATE_PATHS", () => {
    const ineligible = candidate("path:bad", { status: "REVIEW_REQUIRED" as never });
    const r = selectEnumeratedPath([ineligible], null);
    expect(r.chosen).toBeNull();
    expect(r.error).toBe("NO_CANDIDATE_PATHS");
  });

  it("eligible candidates still match exactly", () => {
    const a = candidate("path:a");
    const b = candidate("path:b");
    const r = selectEnumeratedPath([a, b], "path:b");
    expect(r.chosen?.pathId).toBe("path:b");
    expect(r.error).toBeNull();
  });
});
