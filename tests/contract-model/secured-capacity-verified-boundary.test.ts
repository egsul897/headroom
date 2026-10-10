/**
 * Certified-path trigger + boundary lock for secured-capacity reconciliation.
 * Ensures sequential execution stays on verified REQUIRE adapter after solver
 * debt/lien semantic fixes (PR onto #253). Provider-free.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { VERIFIED_EXECUTION_POLICY } from "../../lib/contract-model/verified-execution";

describe("secured-capacity × verified-execution boundary", () => {
  it("REQUIRE policy unchanged", () => {
    expect(VERIFIED_EXECUTION_POLICY).toBe("REQUIRE");
  });

  it("sequential-execution uses verified adapter only", () => {
    const seq = fs.readFileSync(path.join(process.cwd(), "lib/contract-model/sequential-execution.ts"), "utf8");
    expect(seq).toMatch(/evaluateVerifiedCapacity/);
    expect(seq).toMatch(/simulateVerifiedTransaction/);
    expect(seq).not.toMatch(/computeRemainingCapacityAfterDebtIncurrence/);
  });
});
