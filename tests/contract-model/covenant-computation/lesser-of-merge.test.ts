/**
 * Merge of #398 (lesser-of must be the cap; AT_MOST fixed-limb bound) with release-1
 * (exact min(fixed, metric limb) when the metric is bound; MULTIPLE_OF_METRIC caps).
 */
import { describe, expect, it } from "vitest";
import { categorize, evaluateBasket } from "@/lib/contract-model/covenant-computation/baskets";
import type { BasketClause, ComputationPackage } from "@/lib/contract-model/covenant-computation/types";
import { moneyMetricInput } from "@/lib/contract-model/definition-execution";
import type { MetricInput } from "@/lib/contract-model/runtime/types";

function evalText(operativeText: string, metrics: readonly MetricInput[] = []) {
  const pkg = { packageKey: "t", companyId: "c", instrumentKey: "i", asOf: "2026-06-30", documents: [{ documentId: "d", text: `Agreement. ${operativeText}`, role: "CREDIT_AGREEMENT" }], baskets: [] } as unknown as ComputationPackage;
  const clause: BasketClause = { stableKey: "k", sectionRef: "§6.1", covenantFamily: "DEBT", documentId: "d", operativeText, role: "PERMISSION" };
  return evaluateBasket(pkg, clause, metrics, []);
}
const ebitda = () => [moneyMetricInput("Consolidated EBITDA", 500_000_000, "FY2026", "2026-06-30", "test")];

describe("lesser-of after the #398/release-1 merge", () => {
  const text = "Indebtedness in an aggregate principal amount not to exceed the lesser of (a) $100,000,000 and (b) 10% of Consolidated EBITDA.";
  it("bound metric: exact min of both limbs (release-1 path)", () => {
    const b = evalText(text, ebitda());
    expect(b.capStatus).toBe("COMPUTED");
    expect(b.capBound).toBeUndefined();
    expect(Number(b.capCanonical)).toBe(50_000_000);
  });
  it("unbound metric: never the fixed limb as the exact cap; at most the fixed limb (#398 path)", () => {
    const b = evalText(text);
    expect(b.capBound).toBe("AT_MOST");
    expect(Number(b.capCanonical)).toBe(100_000_000);
  });
  it("a lesser-of inside a condition is not the cap (#398 guard kept)", () => {
    expect(categorize("any such request shall be in a minimum amount of the lesser of (x) $5,000,000 and (y) the entire amount of any increase")).not.toBe("LESSER_OF");
  });
  it("a maintenance ratio limit is not read as a multiple-of-EBITDA dollar cap", () => {
    expect(categorize("The Borrower shall not permit the Consolidated Total Leverage Ratio as of the last day of any fiscal quarter to exceed 4.50 to 1.00.")).not.toBe("MULTIPLE_OF_METRIC");
  });
  it("an amount cap stated as a multiple of a metric is still MULTIPLE_OF_METRIC (release-1 kept)", () => {
    expect(categorize("Indebtedness in an aggregate principal amount not to exceed 1.0x Consolidated EBITDA.")).toBe("MULTIPLE_OF_METRIC");
  });
});
