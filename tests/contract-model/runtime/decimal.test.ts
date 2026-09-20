import { describe, expect, it } from "vitest";
import * as R from "@/lib/contract-model/runtime/decimal";

describe("Phase 4A runtime - exact rational arithmetic", () => {
  it("converts IR number literals exactly through their decimal representation (no float residue)", () => {
    expect(R.rationalFromNumber(0.125)).toEqual({ num: 1n, den: 8n });
    expect(R.rationalFromNumber(2.5)).toEqual({ num: 5n, den: 2n });
    expect(R.rationalFromNumber(75_000_000)).toEqual({ num: 75_000_000n, den: 1n });
    expect(R.rationalFromNumber(0.1)).toEqual({ num: 1n, den: 10n });
    expect(R.rationalFromNumber(1e21)).toEqual({ num: 10n ** 21n, den: 1n });
    expect(R.rationalFromNumber(1.5e-7)).toEqual({ num: 3n, den: 20_000_000n });
    expect(() => R.rationalFromNumber(Number.NaN)).toThrow();
    expect(() => R.rationalFromNumber(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("0.1 + 0.2 is exactly 0.3 and 12.5% of 800,000,000 is exactly 100,000,000", () => {
    expect(R.toCanonicalString(R.add(R.rationalFromNumber(0.1), R.rationalFromNumber(0.2)))).toBe("0.3");
    expect(R.toCanonicalString(R.multiply(R.rationalFromNumber(0.125), R.rationalFromNumber(800_000_000)))).toBe("100000000");
  });

  it("non-terminating quotients stay exact as fractions; fixed rendering rounds half-even", () => {
    const third = R.divide(R.ONE, R.rationalFromNumber(3));
    expect(R.toCanonicalString(third)).toBe("1/3");
    expect(R.toFixed(third, 4)).toBe("0.3333");
    expect(R.toFixed(R.rationalFromString("2.5"), 0)).toBe("2");
    expect(R.toFixed(R.rationalFromString("3.5"), 0)).toBe("4");
    expect(R.toFixed(R.rationalFromString("-2.5"), 0)).toBe("-2");
    expect(R.toCanonicalString(R.rationalFromString("-0.750"))).toBe("-0.75");
  });

  it("comparison and extremes are exact", () => {
    expect(R.compare(R.rationalFromString("0.3"), R.add(R.rationalFromNumber(0.1), R.rationalFromNumber(0.2)))).toBe(0);
    expect(R.toCanonicalString(R.max([R.rationalFromNumber(75_000_000), R.rationalFromNumber(100_000_000)]))).toBe("100000000");
    expect(R.toCanonicalString(R.min([R.rationalFromNumber(75_000_000), R.rationalFromNumber(100_000_000)]))).toBe("75000000");
  });

  it("division by zero throws at the arithmetic layer (the evaluator turns it into a structured ERROR before reaching here)", () => {
    expect(() => R.divide(R.ONE, R.ZERO)).toThrow();
  });
});
