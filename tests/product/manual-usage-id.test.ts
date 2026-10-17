/**
 * Rule 45 — default manual usageIds must be collision-free.
 *
 * The old default was `usage-<company>-<Date.now()>`: two
 * legitimate rapid submissions (double-click, two tabs) in the
 * same millisecond produced the SAME id, and the store's
 * DUPLICATE_USAGE_ID guard (correctly) rejected the second entry
 * as a duplicate. A random suffix disambiguates same-millisecond
 * ids; the store guard stays as the backstop.
 */
import { describe, expect, it } from "vitest";
import { defaultManualUsageId } from "../../lib/product/north-star-workflow/usage-ids";

describe("defaultManualUsageId", () => {
  it("never repeats across rapid calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => defaultManualUsageId("co-1")));
    expect(ids.size).toBe(1000);
  });

  it("keeps the usage-<company>-<timestamp> shape", () => {
    expect(defaultManualUsageId("co-1")).toMatch(/^usage-co-1-\d+-[0-9a-f-]{8}$/);
  });
});
