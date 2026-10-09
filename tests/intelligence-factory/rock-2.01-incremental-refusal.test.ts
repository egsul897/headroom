/**
 * Permanent regression: ROCK §2.01 voluntary prepayment / prepayment-based
 * incremental amount must stay KNOWN_NOT_MODELED — never invent FLAT_AMOUNT 0
 * capacity (false favorable).
 *
 * This is the provision that produced the activation-matrix 10/11 "correct
 * formulas" score: it is a justified formula exclusion, not an incorrect parse
 * of an executable basket.
 */
import { describe, expect, it } from "vitest";
import { parseCounselFormulaForTest } from "@/lib/product/customer-intelligence/compile-accepted";
import type { CovenantSummaryItem } from "@/lib/product/covenant-intelligence/summarize";

const ROCK_2_01_SUMMARY_ITEM = {
  sectionRef: "2.01",
  category: "DEBT_INCURRENCE",
  heading: "Incremental Facilities",
  plainEnglish:
    "Incremental path: Voluntary Prepayment / Prepayment-Based Incremental Amount.",
  materialBasketsThresholds: [
    "Incremental path: Voluntary Prepayment / Prepayment-Based Incremental Amount.",
  ],
  permissions: [
    "Borrower may incur Incremental Facilities in an amount equal to Voluntary Prepayments / Prepayment-Based Incremental Amount.",
  ],
  operativeLanguageExcerpt:
    "Voluntary Prepayment / Prepayment-Based Incremental Amount. Cap measured on outstanding amount at any time.",
} as unknown as CovenantSummaryItem;

describe("ROCK §2.01 prepayment incremental — justified KNOWN_NOT_MODELED refusal", () => {
  it("does not mint a MODELED flat-zero formula from prepayment-incremental prose", () => {
    const parsed = parseCounselFormulaForTest(ROCK_2_01_SUMMARY_ITEM);
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toEqual(expect.arrayContaining(["thresholdValue", "formulaType"]));
    // Inventing FLAT_AMOUNT with threshold 0 as executable capacity would be a false favorable.
    expect(parsed.modelingStatus === "MODELED" && parsed.thresholdValue === 0).toBe(false);
  });
});
