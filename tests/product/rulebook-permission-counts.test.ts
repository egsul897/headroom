/**
 * Rule 47 — rulebook readiness must not count UNVERIFIED
 * permissions as reviewed.
 *
 * The old code used /VERIFIED|REVIEWED|APPROVED/i, which
 * matches "UNVERIFIED" as a substring — so EVERY
 * compiler-minted Permission row (default UNVERIFIED) counted
 * as reviewed, and the ladder could report REVIEWED/EXECUTABLE
 * with zero actual counsel verification. Only VERIFIED counts,
 * via the canonical predicate.
 */
import { describe, expect, it } from "vitest";
import { verifiedPermissionCount } from "../../lib/product/customer-intelligence/rulebook-permission-counts";

describe("verifiedPermissionCount", () => {
  it("counts only VERIFIED rows (UNVERIFIED is not reviewed)", () => {
    expect(verifiedPermissionCount(["UNVERIFIED", "VERIFIED", "DISPUTED", "UNVERIFIED"])).toBe(1);
  });

  it("returns 0 when nothing is verified", () => {
    expect(verifiedPermissionCount(["UNVERIFIED", "DISPUTED"])).toBe(0);
  });

  it("counts every VERIFIED row", () => {
    expect(verifiedPermissionCount(["VERIFIED", "VERIFIED"])).toBe(2);
  });
});
