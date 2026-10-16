/**
 * Rule 56 — Ask's composed answer must disclose when matching
 * provisions were omitted.
 *
 * answerFromSummaryItems / composeAnswer capped the answer at
 * the top 6 matching provisions with no marker that more
 * matches existed. A CFO reading the answer could conclude
 * those 6 were the only relevant provisions. The answer now
 * carries a limitation when matches were omitted.
 */
import { describe, expect, it } from "vitest";
import { matchingProvisionsTruncationNote } from "../../lib/product/covenant-intelligence/ask-truncation-note";

describe("matchingProvisionsTruncationNote", () => {
  it("returns null when nothing was omitted", () => {
    expect(matchingProvisionsTruncationNote(6, 6)).toBeNull();
    expect(matchingProvisionsTruncationNote(2, 2)).toBeNull();
  });

  it("discloses omitted matches", () => {
    expect(matchingProvisionsTruncationNote(6, 10)).toBe(
      "Answer shows the top 6 of 10 matching provisions; additional matches exist in the workspace.",
    );
  });
});
