/**
 * Rule 44 — simulate handoff must validate asOf (fail closed on
 * garbage, as documented).
 *
 * parseSimulateHandoffSearchParams validated action, amount, and
 * secured, but passed asOf through verbatim — "not-a-date",
 * "2026-13-40", "2026-02-30" all became evaluationDate. The
 * certified path re-validates before executing, but the handoff
 * draft is the contract ("fail closed on garbage") and its
 * evaluationDate is also used for display. Invalid asOf is now
 * dropped at parse time.
 */
import { describe, expect, it } from "vitest";
import { parseSimulateHandoffSearchParams } from "../../lib/product/unified-position/simulate-handoff";

describe("parseSimulateHandoffSearchParams asOf", () => {
  it("drops a non-calendar date (2026-02-30)", () => {
    const d = parseSimulateHandoffSearchParams({ action: "debt", amount: "50", asOf: "2026-02-30" });
    expect(d.evaluationDate).toBeUndefined();
  });

  it("drops a malformed date", () => {
    const d = parseSimulateHandoffSearchParams({ action: "debt", amount: "50", asOf: "not-a-date" });
    expect(d.evaluationDate).toBeUndefined();
  });

  it("drops an out-of-range month", () => {
    const d = parseSimulateHandoffSearchParams({ action: "debt", amount: "50", asOf: "2026-13-01" });
    expect(d.evaluationDate).toBeUndefined();
  });

  it("keeps a valid calendar date", () => {
    const d = parseSimulateHandoffSearchParams({ action: "debt", amount: "50", asOf: "2026-06-30" });
    expect(d.evaluationDate).toBe("2026-06-30");
  });

  it("keeps other valid fields when asOf is dropped", () => {
    const d = parseSimulateHandoffSearchParams({ action: "debt", amount: "50", asOf: "bogus" });
    expect(d.action).toBe("debt");
    expect(d.amountMillions).toBe(50);
  });
});
