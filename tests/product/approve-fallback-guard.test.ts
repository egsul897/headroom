/**
 * Rule 82 — an approval fallback must never override a safety refusal.
 *
 * approveCertificateAction tries the FCE attributable path first,
 * then falls back to the workspace approve path. The FCE path
 * refuses when reconciliation is BLOCKED, but the workspace path
 * has no reconciliation check — so a BLOCKED refusal that falls
 * through would be approved anyway. The fallback must run only
 * for non-safety refusals.
 */
import { describe, expect, it } from "vitest";
import { shouldFallbackAfterFceRefusal } from "../../lib/product/north-star-workflow/approve-fallback-guard";

describe("shouldFallbackAfterFceRefusal", () => {
  it("does NOT fall back on a BLOCKED reconciliation refusal", () => {
    expect(
      shouldFallbackAfterFceRefusal(["Reconciliation disposition is BLOCKED; cannot approve."]),
    ).toBe(false);
  });

  it("falls back on non-safety refusals (already-approved, not-found, generic)", () => {
    expect(shouldFallbackAfterFceRefusal(["snapshot not found"])).toBe(true);
    expect(shouldFallbackAfterFceRefusal(["NS-4 approve failed"])).toBe(true);
    expect(shouldFallbackAfterFceRefusal([])).toBe(true);
  });
});
