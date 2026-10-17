/**
 * Rule 59 — the REJECT supersede prefix must use the same
 * sanitization as the minted code.
 *
 * permissionCode sanitizes unsafe characters to `_`, but the
 * REJECT path rebuilt its lookup prefix from the RAW
 * sourceId/sectionRef. For a section ref with parens
 * ("6.01(a)"), the minted code contains "6.01_a_" while the
 * raw prefix contains "6.01(a)" — startsWith never matched,
 * so counsel's REJECT silently left the compiled Permission
 * live and feeding capacity. The prefix now goes through the
 * shared sanitizer.
 */
import { describe, expect, it } from "vitest";
import { permissionCode, permissionCodePrefix } from "../../lib/product/customer-intelligence/permission-code";

describe("permissionCodePrefix", () => {
  it("matches codes minted from plain section refs", () => {
    const code = permissionCode("src1", "6.01", "DEBT_INCURRENCE", "INDEBTEDNESS");
    expect(code.startsWith(permissionCodePrefix("src1", "6.01", "INDEBTEDNESS"))).toBe(true);
  });

  it("matches codes minted from section refs with parens", () => {
    const code = permissionCode("src1", "6.01(a)", "DEBT_INCURRENCE", "INDEBTEDNESS");
    expect(code).toBe("counsel:src1:6.01_a_:INDEBTEDNESS:DEBT_INCURRENCE");
    expect(code.startsWith(permissionCodePrefix("src1", "6.01(a)", "INDEBTEDNESS"))).toBe(true);
    // The old raw prefix would NOT have matched.
    expect(code.startsWith("counsel:src1:6.01(a):")).toBe(false);
  });

  it("matches codes minted from section refs with spaces/slashes", () => {
    const code = permissionCode("src1", "6.01 / 6.02", "LIEN", "LIENS_SECURED_DEBT");
    expect(code.startsWith(permissionCodePrefix("src1", "6.01 / 6.02", "LIENS_SECURED_DEBT"))).toBe(true);
  });
});

describe("counsel-review isolation: category in the code", () => {
  it("two items sharing (sourceId, sectionRef) with different categories get different codes", () => {
    const eod = permissionCode("src1", "1.01(g)(c)(c)", "DEBT_INCURRENCE", "EVENTS_OF_DEFAULT");
    const other = permissionCode("src1", "1.01(g)(c)(c)", "DEBT_INCURRENCE", "OTHER");
    expect(eod).not.toBe(other);
  });

  it("a REJECT prefix for one category does not match the other category's Permissions", () => {
    const otherCode = permissionCode("src1", "1.01(g)(c)(c)", "DEBT_INCURRENCE", "OTHER");
    expect(otherCode.startsWith(permissionCodePrefix("src1", "1.01(g)(c)(c)", "EVENTS_OF_DEFAULT"))).toBe(false);
    expect(otherCode.startsWith(permissionCodePrefix("src1", "1.01(g)(c)(c)", "OTHER"))).toBe(true);
  });

  it("a REJECT prefix matches all grant types of its own category", () => {
    const prefix = permissionCodePrefix("src1", "6.01", "INDEBTEDNESS");
    expect(permissionCode("src1", "6.01", "DEBT_INCURRENCE", "INDEBTEDNESS").startsWith(prefix)).toBe(true);
    expect(permissionCode("src1", "6.01", "LIEN", "INDEBTEDNESS").startsWith(prefix)).toBe(true);
  });
});
