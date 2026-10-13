/**
 * Matthews covenant book — expected values are recomputed here from the
 * cited excerpt tokens, not copied from the pipeline output.
 */
import { describe, expect, it } from "vitest";
import { divide, rationalFromString, subtract, toCanonicalString } from "@/lib/contract-model/runtime/decimal";
import {
  InMemoryLearningSink,
  matthewsCovenantPackage,
  runCovenantComputation,
} from "@/lib/contract-model/covenant-computation";

const EBITDA = "128.313"; // certificate: "Consolidated EBITDA: $128.313 million"
const FIXED_CHARGES = "54.640"; // certificate: "Consolidated Fixed Charges: $54.640 million"
const FCCR_FLOOR = "2"; // §4.09(a): "at least 2.00 to 1.00"

describe("Matthews covenant book", () => {
  const sink = new InMemoryLearningSink();
  const book = runCovenantComputation(matthewsCovenantPackage(), {
    sink,
    createdAt: "2026-10-13T00:00:00.000Z",
  });

  it("publishes an uncertified book the learning factory can store", () => {
    expect(book.certification).toBe("COMPUTED_NOT_CERTIFIED");
    expect(book.mistakes).toEqual([]);
    expect(sink.artifacts).toHaveLength(1);
    expect(sink.artifacts[0]).toMatchObject({
      kind: "CALCULATION",
      state: "PROPOSED",
      family: "COVENANT_COMPUTATION",
      packageKey: "matthews-international-q1-fy2025",
    });
    expect(sink.errors).toEqual([]);
  });

  it("computes FCCR from the indenture definition and the fixed-charges line", () => {
    const fccr = book.ratios.find((r) => r.ratioKey === "FIXED_CHARGE_COVERAGE");
    const expected = toCanonicalString(divide(rationalFromString(EBITDA), rationalFromString(FIXED_CHARGES)));
    const headroom = toCanonicalString(subtract(divide(rationalFromString(EBITDA), rationalFromString(FIXED_CHARGES)), rationalFromString(FCCR_FLOOR)));
    expect(fccr?.definitionExcerpt).toMatch(/ratio of Consolidated EBITDA to Consolidated Fixed Charges/);
    expect(fccr?.numerator[0]?.citationExcerpt).toMatch(/Consolidated EBITDA: \$128\.313 million/);
    expect(fccr?.denominator[0]?.citationExcerpt).toMatch(/Consolidated Fixed Charges: \$54\.640 million/);
    expect(fccr?.denominator[0]?.citationExcerpt).not.toMatch(/Interest Expense/);
    expect(fccr?.status).toBe("COMPUTED");
    expect(fccr?.canonical).toBe(expected);
    expect(fccr?.thresholds[0]?.citationExcerpt).toMatch(/at\s+least\s+2\.00 to 1\.00/);
    expect(fccr?.thresholds[0]?.headroomCanonical).toBe(headroom);
    expect(fccr?.certification).toBe("COMPUTED_NOT_CERTIFIED");
  });

  it("does not invent secured, first-lien, or interest-coverage ratios", () => {
    const secured = book.ratios.find((r) => r.ratioKey === "SECURED_NET_LEVERAGE");
    const firstLien = book.ratios.find((r) => r.ratioKey === "FIRST_LIEN_NET_LEVERAGE");
    const interest = book.ratios.find((r) => r.ratioKey === "INTEREST_COVERAGE");
    const totalNet = book.ratios.find((r) => r.ratioKey === "TOTAL_NET_LEVERAGE");

    expect(secured?.status).toBe("NEEDS_INPUT");
    expect(secured?.canonical).toBeNull();
    expect(secured?.thresholds[0]?.citationExcerpt).toMatch(/3\.50 to 1\.00/);
    expect(secured?.thresholds[0]?.headroomStatus).toBe("NEEDS_INPUT");

    expect(firstLien?.status).toBe("NEEDS_INPUT");
    expect(firstLien?.canonical).toBeNull();
    expect(firstLien?.thresholds[0]?.citationExcerpt).toMatch(/2\.50 to 1\.00/);
    expect(firstLien?.missingInputs).toContain("contract definition");

    expect(interest?.status).toBe("UNKNOWN");
    expect(interest?.canonical).toBeNull();

    expect(totalNet?.status).toBe("NEEDS_INPUT");
    expect(totalNet?.canonical).toBeNull();
    expect(totalNet?.refusedReported?.canonical).toBe("6.05");
    expect(totalNet?.refusedReported?.reason).toMatch(/not a contract-defined calculation/);
  });

  it("types excerpted baskets and evaluates only a cite-bound gross cap", () => {
    const facilities = book.baskets.find((b) => b.stableKey === "matw-pd-1a");
    const securedProng = book.baskets.find((b) => b.stableKey === "matw-pd-1bx");
    const firstLienProng = book.baskets.find((b) => b.stableKey === "matw-pd-1by");
    const notes = book.baskets.find((b) => b.stableKey === "matw-pd-2");
    const ratioDebt = book.baskets.find((b) => b.stableKey === "matw-409a");
    const liens = book.baskets.find((b) => b.stableKey === "matw-410");
    const caLiens = book.baskets.find((b) => b.stableKey === "matw-ca-601j");

    expect(facilities?.category).toBe("FIXED_DOLLAR");
    expect(facilities?.citationExcerpt).toMatch(/not to exceed \$1,300,000,000/);
    expect(facilities?.capCanonical).toBe("1300000000");
    expect(facilities?.capCurrency).toBe("USD");
    expect(facilities?.remainingStatus).toBe("NEEDS_INPUT");

    expect(securedProng?.category).toBe("RATIO_BASED");
    expect(securedProng?.capCanonical).toBeNull();
    expect(securedProng?.dollarRoomStatus).toBe("NEEDS_INPUT");

    expect(firstLienProng?.category).toBe("RATIO_BASED");
    expect(firstLienProng?.capStatus).toBe("NEEDS_INPUT");

    expect(notes?.citationExcerpt).toMatch(/\$300,000,000/);
    expect(notes?.category).toBe("UNKNOWN");
    expect(notes?.capCanonical).toBeNull();

    expect(ratioDebt?.category).toBe("RATIO_BASED");
    expect(ratioDebt?.capKind).toBe("RATIO_TEST");
    expect(ratioDebt?.gateOpen).toBe(true);
    expect(ratioDebt?.dollarRoomStatus).toBe("NEEDS_INPUT");

    expect(liens?.category).toBe("UNKNOWN");
    expect(caLiens?.category).toBe("UNKNOWN");
    expect(book.baskets.every((b) => b.remainingStatus === "NEEDS_INPUT")).toBe(true);
  });

  it("leaves covenants whose section text is absent as NEEDS_INPUT with no cap", () => {
    expect(book.omissions.map((o) => o.sectionRef)).toEqual([
      "Credit Agreement §5.14(a)(i) Leverage Ratio",
      "Credit Agreement §5.14(a)(ii) Senior Leverage Ratio",
      "Credit Agreement §5.14(b) Interest Coverage Ratio",
      "Indenture §4.09(a) non-guarantor proviso",
      "Permitted Debt (3)-(22)",
    ]);
    expect(book.omissions.every((o) => o.status === "NEEDS_INPUT" && o.capCanonical === null)).toBe(true);
  });
});
