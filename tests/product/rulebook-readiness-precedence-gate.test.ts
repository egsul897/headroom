/**
 * Rule 67 — unresolved amendment precedence caps the rulebook
 * ladder at REVIEWED, never EXECUTABLE.
 *
 * The EXECUTABLE stage required only capacity + VERIFIED
 * Permissions + reviewed count. It never consulted the
 * operative amendment package, so a workspace with
 * UNRESOLVED_PRECEDENCE (two competing amendments, unclear
 * which governs) could show EXECUTABLE while its live
 * Permissions were compiled from a superseded document's
 * sections. Source-assertion test (the loader is
 * prisma-backed, like the rule-66 test).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("rulebook readiness precedence gate", () => {
  it("EXECUTABLE requires resolved amendment precedence", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib/product/customer-intelligence/rulebook-readiness.ts"),
      "utf8",
    );
    const fn = source.slice(source.indexOf("export async function loadRulebookReadiness"));
    expect(fn).toContain("getLatestAmendmentPackage");
    expect(fn).toContain("precedenceUnresolved");
    expect(fn).toContain("UNRESOLVED_PRECEDENCE");
    expect(fn).toContain("!precedenceUnresolved");
    expect(fn).toContain("EXECUTABLE withheld until precedence resolves");
  });
});
