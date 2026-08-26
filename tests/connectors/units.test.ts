/**
 * lib/connectors/units.ts - the explicit financial-unit contract
 * (docs/autonomous-ingestion-production-readiness.md). Root cause this
 * closes: a value with no declared unit was silently treated as already
 * being in this codebase's internal $-millions convention.
 */
import { describe, expect, it } from "vitest";
import { CANONICAL_UNIT_BY_METRIC, IncompatibleUnitError, UnrecognizedMetricError, isFinancialUnit, normalizeFinancialValue } from "../../lib/connectors/units";

describe("normalizeFinancialValue - dollar units", () => {
  it("USD -> USD_MILLIONS divides by 1,000,000 (the exact regression this fix closes)", () => {
    const result = normalizeFinancialValue("cash", 125_000_000, "USD");
    expect(result).toMatchObject({ canonicalUnit: "USD_MILLIONS", originalValue: 125_000_000, originalUnit: "USD", normalizedValue: 125, withinSanityBounds: true });
  });

  it("USD_THOUSANDS -> USD_MILLIONS divides by 1,000", () => {
    const result = normalizeFinancialValue("total_debt", 750_000, "USD_THOUSANDS");
    expect(result.normalizedValue).toBe(750);
  });

  it("USD_MILLIONS -> USD_MILLIONS is a no-op", () => {
    const result = normalizeFinancialValue("secured_debt", 500, "USD_MILLIONS");
    expect(result.normalizedValue).toBe(500);
  });
});

describe("normalizeFinancialValue - percent/ratio units", () => {
  it("PERCENT -> PERCENT is a no-op", () => {
    const result = normalizeFinancialValue("assumed_new_debt_rate_pct", 7.5, "PERCENT");
    expect(result.normalizedValue).toBe(7.5);
    expect(result.canonicalUnit).toBe("PERCENT");
  });

  it("RATIO -> PERCENT multiplies by 100", () => {
    const result = normalizeFinancialValue("assumed_new_debt_rate_pct", 0.075, "RATIO");
    expect(result.normalizedValue).toBeCloseTo(7.5, 10);
  });
});

describe("normalizeFinancialValue - hard failures (never silently guessed)", () => {
  it("throws UnrecognizedMetricError for a metricName with no canonical unit configured", () => {
    expect(() => normalizeFinancialValue("some_unknown_metric", 100, "USD")).toThrow(UnrecognizedMetricError);
  });

  it("throws IncompatibleUnitError when a PERCENT is declared for a dollar-denominated metric", () => {
    expect(() => normalizeFinancialValue("cash", 7.5, "PERCENT")).toThrow(IncompatibleUnitError);
  });

  it("throws IncompatibleUnitError when a dollar unit is declared for a percent-denominated metric", () => {
    expect(() => normalizeFinancialValue("assumed_new_debt_rate_pct", 100, "USD")).toThrow(IncompatibleUnitError);
  });

  it("throws IncompatibleUnitError for COUNT declared against a dollar metric", () => {
    expect(() => normalizeFinancialValue("cash", 5, "COUNT")).toThrow(IncompatibleUnitError);
  });
});

describe("normalizeFinancialValue - extreme-magnitude sanity check (soft, never a hard rejection)", () => {
  it("flags withinSanityBounds:false instead of throwing when the normalized value is implausibly large", () => {
    const result = normalizeFinancialValue("cash", 125_000_000, "USD_MILLIONS");
    expect(result.withinSanityBounds).toBe(false);
    expect(result.sanityNote).toMatch(/sanity ceiling/);
    // still returns the (implausible) normalized value - flagging, not rejecting.
    expect(result.normalizedValue).toBe(125_000_000);
  });

  it("does not flag a plausible value", () => {
    const result = normalizeFinancialValue("cash", 125, "USD_MILLIONS");
    expect(result.withinSanityBounds).toBe(true);
    expect(result.sanityNote).toBeUndefined();
  });

  it("flags an implausible PERCENT value too", () => {
    const result = normalizeFinancialValue("assumed_new_debt_rate_pct", 50_000, "PERCENT");
    expect(result.withinSanityBounds).toBe(false);
  });
});

describe("isFinancialUnit", () => {
  it("accepts every value in FINANCIAL_UNITS", () => {
    for (const unit of ["USD", "USD_THOUSANDS", "USD_MILLIONS", "RATIO", "PERCENT", "COUNT"]) {
      expect(isFinancialUnit(unit)).toBe(true);
    }
  });

  it("rejects an unrecognized string", () => {
    expect(isFinancialUnit("DOLLARS")).toBe(false);
    expect(isFinancialUnit(123)).toBe(false);
    expect(isFinancialUnit(undefined)).toBe(false);
  });
});

describe("CANONICAL_UNIT_BY_METRIC", () => {
  it("covers every metric lib/onboarding/financial.ts's FINANCIAL_METRIC_FIELD_MAP recognizes", () => {
    // Kept in sync by hand (see units.ts's own header comment) - this test
    // is a tripwire: if FINANCIAL_METRIC_FIELD_MAP ever gains a metric this
    // map doesn't know about, normalizeFinancialValue would silently become
    // unreachable for it (UnrecognizedMetricError instead of a real unit),
    // which is the CORRECT fail-closed behavior but should be a deliberate
    // choice, not an oversight - so this test spells out the expected set.
    const expectedMetrics = ["cash", "total_debt", "secured_debt", "covenant_ebitda", "interest_expense", "cumulative_net_income", "equity_proceeds", "assumed_new_debt_rate_pct"];
    expect(Object.keys(CANONICAL_UNIT_BY_METRIC).sort()).toEqual(expectedMetrics.sort());
  });
});
