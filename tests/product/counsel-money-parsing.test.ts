/**
 * Rule 18 — bare dollar amounts are raw dollars, never assumed
 * millions; and "thousand" is a unit.
 *
 * parseMoneyMillions (counsel-compile path: accepted items become
 * executable Permissions that drive capacity) had two unit bugs,
 * confirmed empirically against the old code:
 *  (a) A bare amount ≤ $10,000 fell through BOTH raw-dollar
 *      branches and was treated as already-in-millions: "$5,000"
 *      compiled to a $5,000M ($5B) threshold — a million-fold
 *      overstatement of capacity. Bare amounts are raw dollars:
 *      divide by 1e6, always. (A missing unit must never be read
 *      as "million" — the #391 unit-loss lesson.)
 *  (b) The regex never captured "thousand", so "$150.0 thousand"
 *      ($150,000 = 0.15M) matched as bare 150 and stayed 150 ($M)
 *      — a thousand-fold overstatement.
 * The parser now lives in a prisma-free module (money.ts) so it is
 * directly unit-testable.
 */
import { describe, expect, it } from "vitest";
import { parseMoneyMillions } from "../../lib/product/customer-intelligence/money";

describe("counsel-compile money parsing", () => {
  it("bare $5,000 is raw dollars → 0.005 ($M), not 5000", () => {
    expect(parseMoneyMillions("Amount/threshold: $5,000")).toBeCloseTo(0.005, 9);
  });

  it("$150.0 thousand → 0.15 ($M)", () => {
    expect(parseMoneyMillions("Amount/threshold: $150.0 thousand")).toBeCloseTo(0.15, 9);
  });

  it("$150.0 million → 150 ($M)", () => {
    expect(parseMoneyMillions("Amount/threshold: $150.0 million")).toBeCloseTo(150, 9);
  });

  it("raw $150,000,000 → 150 ($M)", () => {
    expect(parseMoneyMillions("Amount/threshold: $150,000,000")).toBeCloseTo(150, 9);
  });

  it("bare $50,000 → 0.05 ($M)", () => {
    expect(parseMoneyMillions("Amount/threshold: $50,000")).toBeCloseTo(0.05, 9);
  });

  it("$2.5 billion → 2500 ($M)", () => {
    expect(parseMoneyMillions("Amount/threshold: $2.5 billion")).toBeCloseTo(2500, 9);
  });
});
