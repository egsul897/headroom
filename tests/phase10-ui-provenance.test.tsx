/**
 * Phase 10 — UI-level proof, rendered for real (react-dom/server, no extra
 * dependency needed - react-dom is already a project dependency) rather than
 * asserted only against the underlying data:
 *  - task hard requirement §4: a `VERIFIED` legal-review status is NEVER
 *    rendered as a bare stamp - its explanatory label is always present in
 *    the same markup.
 *  - task hard requirement §3/§5: fail-closed capacity/metric states never
 *    render as "$0" or "Unlimited".
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LegalReviewBadge, LEGAL_REVIEW_STATUS_EXPLANATION } from "../components/ui";
import { fmtCapacity, fmtM, fmtMaxCapacity, fmtMetric } from "../lib/format";

describe("LegalReviewBadge - VERIFIED never renders bare (task hard requirement §4)", () => {
  it("renders VERIFIED together with its explanatory label", () => {
    const html = renderToStaticMarkup(<LegalReviewBadge status="VERIFIED" context="this golden question" />);
    expect(html).toContain("VERIFIED");
    // The bare word "VERIFIED" must never appear without accompanying
    // explanatory text in the same markup - assert the actual policy
    // language (docs/legal-review-status-model.md §0) is present alongside it.
    expect(html).toContain("Headroom&#x27;s own legal reviewer");
    expect(html.length).toBeGreaterThan("VERIFIED".length + 20); // more than just the bare stamp
  });

  it("UNVERIFIED and DISPUTED also carry their own explanatory text, not just a status word", () => {
    for (const status of ["UNVERIFIED", "DISPUTED"] as const) {
      const html = renderToStaticMarkup(<LegalReviewBadge status={status} />);
      expect(html).toContain(status);
      // HTML-escapes apostrophes (&#x27;) - compare on a stable, punctuation-free substring instead of the raw string.
      expect(html).toContain(status === "DISPUTED" ? "legal review is disputed" : "has not yet received a recorded legal review");
    }
  });

  it("the VERIFIED explanation text matches the current, controlling policy (docs/legal-review-status-model.md §0) - reviewed by Headroom's own legal reviewer, no second/outside-counsel requirement", () => {
    const explanation = LEGAL_REVIEW_STATUS_EXPLANATION.VERIFIED;
    expect(explanation).toMatch(/legal reviewer/i);
    expect(explanation).toMatch(/founder/i);
    expect(explanation).not.toMatch(/second attorney|peer review required|outside counsel required/i);
  });
});

describe("Fail-closed states never render as $0 or Unlimited (task hard requirement §3/§5)", () => {
  it("fmtMaxCapacity never returns a dollar figure or 'Unlimited' for a non-EXACT MaxCapacityResult", () => {
    expect(fmtMaxCapacity(undefined)).toBe("Not modeled");
    expect(fmtMaxCapacity({ kind: "REVIEW_REQUIRED", reason: "x" })).toBe("Review required");
    expect(fmtMaxCapacity({ kind: "ASSUMPTION_REQUIRED", missingFields: ["ebitda"] })).toBe("Missing input");
    expect(fmtMaxCapacity({ kind: "SCENARIO_DEPENDENT", scenarios: [] })).toBe("Scenario-dependent");
    expect(fmtMaxCapacity({ kind: "BOUNDED_RANGE", lowerBound: 10, reason: "x" })).not.toBe("Unlimited");
    for (const result of [
      undefined,
      { kind: "REVIEW_REQUIRED" as const, reason: "x" },
      { kind: "ASSUMPTION_REQUIRED" as const, missingFields: [] },
      { kind: "SCENARIO_DEPENDENT" as const, scenarios: [] },
    ]) {
      const rendered = fmtMaxCapacity(result);
      expect(rendered).not.toBe("$0M");
      expect(rendered).not.toBe("Unlimited");
    }
  });

  it("fmtMetric never returns '0x' for a missing/invalid metric - only 'Missing input'/'Not evaluated'", () => {
    expect(fmtMetric({ status: "UNAVAILABLE_MISSING_INPUT", value: null })).toBe("Missing input");
    expect(fmtMetric({ status: "UNAVAILABLE_INVALID_DENOMINATOR", value: null })).toBe("Not evaluated");
    expect(fmtMetric({ status: "OK", value: null })).not.toMatch(/^0\.00x$/);
  });

  it("fmtCapacity('not_tested'/'review_required') never renders as Unlimited or $0", () => {
    expect(fmtCapacity("not_tested")).toBe("Not tested");
    expect(fmtCapacity("review_required")).toBe("Review required");
    expect(fmtCapacity("not_tested")).not.toBe("Unlimited");
    expect(fmtCapacity("not_tested", undefined)).not.toBe(fmtM(0));
  });
});
