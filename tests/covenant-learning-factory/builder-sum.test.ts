/** Builder sums: a named, valueless limb ("the Cumulative Credit") makes the sum NEEDS_INPUT, never CAP_COMPUTED. */
import { describe, expect, it } from "vitest";
import { evaluateBasket, namedSumLimbs } from "@/lib/contract-model/covenant-computation/baskets";
import type { BasketClause, ComputationPackage } from "@/lib/contract-model/covenant-computation/types";

const evalText = (operativeText: string) => {
  const pkg = { packageKey: "t", companyId: "c", instrumentKey: "i", asOf: "2026-01-01", documents: [{ documentId: "d", text: operativeText, role: "CREDIT_AGREEMENT" }], baskets: [], metrics: [], ratios: [] } as unknown as ComputationPackage;
  const clause: BasketClause = { stableKey: "k", sectionRef: "7.6(c)", covenantFamily: "RESTRICTED_PAYMENTS", documentId: "d", operativeText, role: "PERMISSION" };
  return evaluateBasket(pkg, clause, [], []);
};

describe("builder sums are never a computed cap", () => {
  it("'the sum of (A) $200,000,000 and (B) the Cumulative Credit' is NEEDS_INPUT, not COMPUTED 200000000", () => {
    const b = evalText("Restricted Payments in an aggregate amount not to exceed the sum of (A) $200,000,000 and (B) the Cumulative Credit at such time");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical ?? null).toBeNull();
    expect(b.missingInputs.join(" ")).toMatch(/Cumulative Credit/);
  });
  it("named limbs: only valueless components are reported", () => {
    expect(namedSumLimbs("the sum of (1) $50,000,000, plus (2) 50% of Consolidated Net Income")).toEqual([]);
    expect(namedSumLimbs("not to exceed $25,000,000")).toEqual([]);
  });
  it("any additive non-dollar limb makes the sum NEEDS_INPUT ('(b) Excluded Contributions')", () => {
    const b = evalText("Restricted Payments in an aggregate amount not to exceed the sum of (a) $50,000,000 plus (b) Excluded Contributions");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical ?? null).toBeNull();
    expect(namedSumLimbs("the sum of (a) $50,000,000 plus (b) Excluded Contributions")).toEqual(["Excluded Contributions"]);
  });
});
