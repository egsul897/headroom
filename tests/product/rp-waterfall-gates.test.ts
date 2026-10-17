/**
 * Rule 21 — RP waterfall gates must not be invented, and a stale
 * waterfall must not survive its permissions.
 *
 * syncDocumentRpWaterfall had two fail-opens:
 *  (a) When no ratio gate was compiled for a kind, the gate fell
 *      back to the OTHER kind's gate, then to the LAST waterfall
 *      step's code — inventing a ratio gate when none was
 *      compiled (contradicting its own "does not invent
 *      ratio-gate codes" docstring). The engine/overview then
 *      treated an ordinary flat basket as a ratio gate.
 *      Now a kind's gate is only a RATIO_GATE compiled for that
 *      same grantType, else null.
 *  (b) When permissions went to zero (e.g. counsel REJECTED them
 *      all), the sync early-returned and left the STALE waterfall
 *      in place, still gating RP transactions with superseded
 *      baskets. Now an empty build clears rpWaterfall (matching
 *      syncDocumentCapacityFormulas, which already clears on
 *      empty).
 */
import { describe, expect, it } from "vitest";
import { buildRpWaterfall } from "../../lib/product/customer-intelligence/rp-waterfall";

function perm(code: string, grantType: string, formulaType: string, sectionRef = "7.06") {
  return { code, grantType, formulaType, sectionRef };
}

describe("rp waterfall gate honesty", () => {
  it("uses only the same-grantType ratio gate; missing kind is null", () => {
    const out = buildRpWaterfall([
      perm("counsel:flat-rp", "RESTRICTED_PAYMENT", "FLAT_AMOUNT"),
      perm("counsel:gate-rp", "RESTRICTED_PAYMENT", "RATIO_GATE"),
      perm("counsel:flat-inv", "INVESTMENT", "FLAT_AMOUNT"),
    ]);
    expect(out?.ratioGateCodeByKind.dividend).toBe("counsel:gate-rp");
    expect(out?.ratioGateCodeByKind.investment).toBeNull();
  });

  it("does not borrow the other kind's gate", () => {
    const out = buildRpWaterfall([
      perm("counsel:flat-rp", "RESTRICTED_PAYMENT", "FLAT_AMOUNT"),
      perm("counsel:gate-inv", "INVESTMENT", "RATIO_GATE"),
    ]);
    expect(out?.ratioGateCodeByKind.dividend).toBeNull();
    expect(out?.ratioGateCodeByKind.investment).toBe("counsel:gate-inv");
  });

  it("does not fall back to the last step code when no gate exists", () => {
    const out = buildRpWaterfall([
      perm("counsel:flat-rp", "RESTRICTED_PAYMENT", "FLAT_AMOUNT"),
      perm("counsel:flat-inv", "INVESTMENT", "FLAT_AMOUNT"),
    ]);
    expect(out?.ratioGateCodeByKind.dividend).toBeNull();
    expect(out?.ratioGateCodeByKind.investment).toBeNull();
  });

  it("orders builder before flat and excludes ratio gates from steps", () => {
    const out = buildRpWaterfall([
      perm("counsel:flat", "RESTRICTED_PAYMENT", "FLAT_AMOUNT", "7.06"),
      perm("counsel:builder", "RESTRICTED_PAYMENT", "BUILDER_BASKET", "7.06"),
      perm("counsel:gate", "RESTRICTED_PAYMENT", "RATIO_GATE", "7.06"),
    ]);
    expect(out?.steps.map((s) => s.code)).toEqual(["counsel:builder", "counsel:flat"]);
  });

  it("returns null when there are no permissions or no steps", () => {
    expect(buildRpWaterfall([])).toBeNull();
    expect(
      buildRpWaterfall([perm("counsel:gate", "RESTRICTED_PAYMENT", "RATIO_GATE")]),
    ).toBeNull();
  });
});
