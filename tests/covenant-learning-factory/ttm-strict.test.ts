import { describe, expect, it } from "vitest";
import { ttmAt, type XbrlFact } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const f = (start: string, end: string, val: number, form: string): XbrlFact => ({ start, end, val, form, accn: "a", filed: end });
// Fiscal year = calendar year. Latest 10-Q: six months to 2026-06-30.
const fy25 = f("2025-01-01", "2025-12-31", 1000, "10-K");
const ytd26 = f("2026-01-01", "2026-06-30", 600, "10-Q");
const ytd25 = f("2025-01-01", "2025-06-30", 500, "10-Q");

describe("flow inputs are trailing four quarters, never one 10-Q", () => {
  it("10-K FY + 10-Q YTD − prior-year YTD", () => {
    expect(ttmAt([fy25, ytd26, ytd25], "2026-06-30")?.value).toBe(1100n);
  });
  it("prior-year comparison from a different fiscal window (not the same YTD) → no TTM", () => {
    
    const shifted = f("2024-12-25", "2025-06-24", 480, "10-Q"); // same length, ends within 7 days of 2025-06-30, starts in the prior fiscal year
    expect(ttmAt([fy25, ytd26, shifted], "2026-06-30")).toBeNull();

  });
  it("the 'annual' piece must be a 10-K fiscal year, and the YTD a 10-Q figure", () => {
    const annualFrom10Q = { ...fy25, form: "10-Q" };
    expect(ttmAt([annualFrom10Q, ytd26, ytd25], "2026-06-30")).toBeNull();
    const ytdFrom8K = { ...ytd26, form: "8-K" };
    expect(ttmAt([fy25, ytdFrom8K, ytd25], "2026-06-30")).toBeNull();
  });
  it("a missing piece is not annualized", () => {
    expect(ttmAt([ytd26, ytd25], "2026-06-30")).toBeNull();
    expect(ttmAt([fy25, ytd26], "2026-06-30")).toBeNull();
  });
});
