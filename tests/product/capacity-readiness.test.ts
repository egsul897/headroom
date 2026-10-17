import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));

import { capacityStaleNote } from "../../lib/product/customer-intelligence/capacity-readiness";

describe("rule 161: capacity readiness discloses stale analyses", () => {
  it("returns empty when no analyzed document is stale", () => {
    expect(capacityStaleNote(0)).toBe("");
    expect(capacityStaleNote(-1)).toBe("");
  });

  it("names the stale count and asks for re-analysis", () => {
    expect(capacityStaleNote(1)).toMatch(/1 document\(s\) carry analyses from an older Headroom version/i);
    expect(capacityStaleNote(1)).toMatch(/re-analyze for current results/i);
    expect(capacityStaleNote(3)).toMatch(/3 document\(s\)/);
  });
});
