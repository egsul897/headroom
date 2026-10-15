import { describe, expect, it } from "vitest";
import { categorize, extremumLimbs } from "@/lib/contract-model/covenant-computation/baskets";
import { runCovenantComputation } from "@/lib/contract-model/covenant-computation";

const one = (text: string) => {
  const pkg = { packageKey: "p", companyId: "c", instrumentKey: "i", asOf: "2026-10-15", documents: [{ documentId: "d", text }], baskets: [{ stableKey: "b", sectionRef: "7.02(f)", covenantFamily: "DEBT", documentId: "d", operativeText: text, role: "PERMISSION" }] } as never;
  return runCovenantComputation(pkg, { createdAt: "1970-01-01T00:00:00.000Z" } as never).baskets[0]!;
};

describe("fixed-limb bounds", () => {
  it("greater of $X and Y% of an unbound metric: at least $X, metric named", () => {
    const b = one("other Indebtedness in an aggregate principal amount not to exceed the greater of (x) $50,000,000 and (y) 15% of Consolidated EBITDA for the most recent Test Period");
    expect(b).toMatchObject({ capStatus: "COMPUTED", capCanonical: "50000000", capBound: "AT_LEAST" });
    expect(b.missingInputs.join(" ")).toMatch(/Consolidated EBITDA/);
  });
  it("millions and three limbs: at least the largest fixed limb", () => {
    const b = one("Investments not to exceed the greater of (a) $25.0 million, (b) $40.5 million and (c) 2.5% of Consolidated Total Assets");
    expect(b).toMatchObject({ capCanonical: "40500000", capBound: "AT_LEAST" });
  });
  it("lesser of $X and Y% of M: at most $X", () => {
    const text = "Liens securing Indebtedness in an amount not to exceed the lesser of (i) $10,000,000 and (ii) 5% of Consolidated Net Tangible Assets";
    expect(categorize(text)).toBe("LESSER_OF");
    expect(one(text)).toMatchObject({ capStatus: "COMPUTED", capCanonical: "10000000", capBound: "AT_MOST" });
  });
  it("only fixed limbs: exact; a nested greater/lesser: no bound", () => {
    expect(one("Restricted Payments not to exceed the greater of (a) $5,000,000 and (b) $7,500,000")).toMatchObject({ capCanonical: "7500000" });
    expect(one("Restricted Payments not to exceed the greater of (a) $5,000,000 and (b) $7,500,000").capBound).toBeUndefined();
    expect(one("not to exceed the lesser of (a) $20,000,000 and (b) the greater of (x) $5,000,000 and (y) 10% of EBITDA").capStatus).toBe("NEEDS_INPUT");
  });
  it("an unreadable limb gives no bound", () => {
    expect(extremumLimbs("the greater of $10,000,000", "greater")).toBeNull();
  });
});
