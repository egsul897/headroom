import { describe, expect, it } from "vitest";
import { loadAuthoritativeCapacity } from "@/lib/product/north-star-workflow";

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("authoritative capacity", () => {
  it("never claims CERTIFIED without VerifiedExecutionPackage", async () => {
    const r = await loadAuthoritativeCapacity({
      companyId: "auth-capacity-empty-co",
      evaluationDate: "2026-08-01",
      verifiedPackage: null,
    });
    expect(r.authority).not.toBe("CERTIFIED_4A_4D");
    expect(r.status).not.toBe("CERTIFIED_EXECUTED");
    expect(r.missingInputs).toContain("VerifiedExecutionPackage");
    expect(r.legacy.note).toMatch(/LEGACY_ENGINE|NOT_CERTIFIED/);
  });
});
