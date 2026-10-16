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
    const code = permissionCode("src1", "6.01", "DEBT_INCURRENCE");
    expect(code.startsWith(permissionCodePrefix("src1", "6.01"))).toBe(true);
  });

  it("matches codes minted from section refs with parens", () => {
    const code = permissionCode("src1", "6.01(a)", "DEBT_INCURRENCE");
    expect(code).toBe("counsel:src1:6.01_a_:DEBT_INCURRENCE");
    expect(code.startsWith(permissionCodePrefix("src1", "6.01(a)"))).toBe(true);
    // The old raw prefix would NOT have matched.
    expect(code.startsWith("counsel:src1:6.01(a):")).toBe(false);
  });

  it("matches codes minted from section refs with spaces/slashes", () => {
    const code = permissionCode("src1", "6.01 / 6.02", "LIEN");
    expect(code.startsWith(permissionCodePrefix("src1", "6.01 / 6.02"))).toBe(true);
  });
});
