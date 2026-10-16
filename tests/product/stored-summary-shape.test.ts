/**
 * Rule 17 — stored summaries must be shape-validated before use.
 *
 * summarizeFromStoredMetadata cast ANY object to
 * DocumentCovenantSummary with zero shape validation. A stored
 * summary missing `items` (older version, partial write, corrupt
 * metadata) passed through, and callers doing
 * `summary.items.length` threw — crashing the documents list /
 * dashboard load instead of degrading to "not analyzed". A stored
 * summary is untrusted input: validate the shape at the single
 * choke point, return null when it does not match.
 */
import { describe, expect, it } from "vitest";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";

describe("stored summary shape validation", () => {
  it("returns null when the stored summary has no items array", () => {
    expect(
      summarizeFromStoredMetadata({ covenantSummary: { schemaVersion: "product.covenant-summary.v2" } }),
    ).toBeNull();
    expect(
      summarizeFromStoredMetadata({ covenantSummary: { items: "not-an-array" } }),
    ).toBeNull();
    expect(summarizeFromStoredMetadata({ covenantSummary: { items: null } })).toBeNull();
  });

  it("returns the summary when the shape is valid", () => {
    const cs = {
      schemaVersion: "product.covenant-summary.v2",
      sourceId: "s1",
      items: [],
      countsByCategory: {},
    };
    expect(summarizeFromStoredMetadata({ covenantSummary: cs })).toEqual(cs);
  });

  it("returns null for missing / non-object metadata", () => {
    expect(summarizeFromStoredMetadata(null)).toBeNull();
    expect(summarizeFromStoredMetadata(undefined)).toBeNull();
    expect(summarizeFromStoredMetadata("x")).toBeNull();
    expect(summarizeFromStoredMetadata({})).toBeNull();
    expect(summarizeFromStoredMetadata({ covenantSummary: null })).toBeNull();
  });
});
