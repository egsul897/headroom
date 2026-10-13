/**
 * Matthews covenant book — expected values are recomputed here from the
 * cited excerpt tokens, not copied from the pipeline output.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare, divide, multiply, rationalFromString, subtract, toCanonicalString } from "@/lib/contract-model/runtime/decimal";
import {
  InMemoryLearningSink,
  matthewsCovenantPackage,
  runCovenantComputation,
} from "@/lib/contract-model/covenant-computation";

const EBITDA = "128.313"; // certificate: "Consolidated EBITDA: $128.313 million"
const FIXED_CHARGES = "54.640"; // certificate: "Consolidated Fixed Charges: $54.640 million"
const FCCR_FLOOR = "2"; // §4.09(a): "at least 2.00 to 1.00"
const TOTAL_ASSETS = "1791.719"; // statement: "Total Assets: $1,791.719 million"

function greaterOf(fixed: string, percent: string): string {
  const flat = rationalFromString(fixed);
  const grown = multiply(rationalFromString(TOTAL_ASSETS), rationalFromString(percent));
  return toCanonicalString(compare(grown, flat) > 0 ? grown : flat);
}

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

  it("pins the EDGAR exhibits to the published sha256", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/edgar/matthews/manifest.json"), "utf8")) as {
      documents: Array<{ filename: string; sha256: string; sourceUrl: string }>;
      complianceCertificate: null;
    };
    expect(manifest.complianceCertificate).toBeNull();
    expect(manifest.documents.map((doc) => doc.sourceUrl)).toEqual([
      "https://www.sec.gov/Archives/edgar/data/63296/000119312524228450/d873825dex41.htm",
      "https://www.sec.gov/Archives/edgar/data/63296/000006329624000010/fifthamendmenttothirdamend.htm",
      "https://www.sec.gov/Archives/edgar/data/63296/000119312524224129/d872508dex102.htm",
    ]);
    for (const doc of manifest.documents) {
      const bytes = readFileSync(join(process.cwd(), "tests/fixtures/edgar/matthews", doc.filename));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(doc.sha256);
    }
  });

  it("computes FCCR from the indenture definition and the fixed-charges line", () => {
    const fccr = book.ratios.find((r) => r.ratioKey === "FIXED_CHARGE_COVERAGE");
    const expected = toCanonicalString(divide(rationalFromString(EBITDA), rationalFromString(FIXED_CHARGES)));
    const headroom = toCanonicalString(subtract(divide(rationalFromString(EBITDA), rationalFromString(FIXED_CHARGES)), rationalFromString(FCCR_FLOOR)));
    expect(fccr?.definitionExcerpt).toMatch(/the ratio of \(x\) the aggregate amount of Consolidated EBITDA/);
    expect(fccr?.definitionExcerpt).toMatch(/to \(y\) the aggregate amount of Consolidated Fixed Charges/);
    expect(fccr?.numerator[0]?.citationExcerpt).toMatch(/Consolidated EBITDA: \$128\.313 million/);
    expect(fccr?.denominator[0]?.citationExcerpt).toMatch(/Consolidated Fixed Charges: \$54\.640 million/);
    expect(fccr?.denominator[0]?.citationExcerpt).not.toMatch(/Interest Expense/);
    expect(fccr?.status).toBe("COMPUTED");
    expect(fccr?.canonical).toBe(expected);
    expect(fccr?.thresholds[0]?.citationExcerpt).toMatch(/at\s+least\s+2\.00 to 1\.00/);
    expect(fccr?.thresholds[0]?.headroomCanonical).toBe(headroom);
    expect(fccr?.certification).toBe("COMPUTED_NOT_CERTIFIED");
  });

  it("cites leverage definitions and does not fill unbound operands", () => {
    const secured = book.ratios.find((r) => r.ratioKey === "SECURED_NET_LEVERAGE");
    const firstLien = book.ratios.find((r) => r.ratioKey === "FIRST_LIEN_NET_LEVERAGE");
    const interest = book.ratios.find((r) => r.ratioKey === "INTEREST_COVERAGE");
    const leverage = book.ratios.find((r) => r.ratioKey === "LEVERAGE");
    const senior = book.ratios.find((r) => r.ratioKey === "SENIOR_LEVERAGE");
    const totalNet = book.ratios.find((r) => r.ratioKey === "TOTAL_NET_LEVERAGE");

    expect(secured?.status).toBe("NEEDS_INPUT");
    expect(secured?.canonical).toBeNull();
    expect(secured?.definitionExcerpt).toMatch(/ratio of \(x\) Secured Debt/);
    expect(secured?.definitionExcerpt).toMatch(/minus the amount/);
    expect(secured?.missingInputs).toContain("Eligible Cash Equivalents");
    expect(secured?.thresholds[0]?.citationExcerpt).toMatch(/to exceed 3\.50 to 1\.00/);
    expect(secured?.thresholds[0]?.canonical).toBe("3.5");
    expect(secured?.thresholds[0]?.headroomStatus).toBe("NEEDS_INPUT");

    expect(firstLien?.status).toBe("NEEDS_INPUT");
    expect(firstLien?.canonical).toBeNull();
    expect(firstLien?.definitionExcerpt).toMatch(/ratio of \(1\) First Lien Debt/);
    expect(firstLien?.missingInputs).toEqual(expect.arrayContaining(["First Lien Debt", "Eligible Cash Equivalents"]));
    expect(firstLien?.thresholds[0]?.citationExcerpt).toMatch(/to exceed 2\.50 to 1\.00/);
    expect(firstLien?.thresholds[0]?.canonical).toBe("2.5");

    expect(interest?.status).toBe("NEEDS_INPUT");
    expect(interest?.canonical).toBeNull();
    expect(interest?.definitionExcerpt).toMatch(/ratio of \(i\) EBITDA to \(ii\) Interest Expense/);
    expect(interest?.missingInputs).toEqual(["EBITDA"]);
    expect(interest?.thresholds.some((t) => /greater than or equal to 3\.00 to 1\.0/.test(t.citationExcerpt) && t.canonical === "3")).toBe(true);

    expect(leverage?.status).toBe("NEEDS_INPUT");
    expect(leverage?.definitionExcerpt).toMatch(/ratio of \(i\) Net Indebtedness to \(ii\) EBITDA/);
    expect(leverage?.missingInputs).toEqual(expect.arrayContaining(["Net Indebtedness", "EBITDA"]));
    expect(leverage?.thresholds.some((t) => /less than or equal to 4\.50 to 1\.00/.test(t.citationExcerpt) && t.canonical === "4.5")).toBe(true);

    expect(senior?.status).toBe("NEEDS_INPUT");
    expect(senior?.definitionExcerpt).toMatch(/ratio of \(i\) Senior Indebtedness to \(ii\) EBITDA/);
    expect(senior?.missingInputs).toEqual(expect.arrayContaining(["Senior Indebtedness", "EBITDA"]));
    expect(senior?.thresholds.map((t) => t.canonical)).toEqual(["4"]);

    expect(totalNet?.status).toBe("NEEDS_INPUT");
    expect(totalNet?.definitionExcerpt).toBeNull();
    expect(totalNet?.missingInputs).toContain("contract definition");
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
    expect(facilities?.citationExcerpt).toMatch(/not to exceed the sum of \(a\) \$1,300\.0 million/);
    expect(facilities?.capCanonical).toBe("1300000000");
    expect(facilities?.capCurrency).toBe("USD");
    expect(facilities?.remainingStatus).toBe("NEEDS_INPUT");

    expect(securedProng?.category).toBe("RATIO_BASED");
    expect(securedProng?.capCanonical).toBeNull();
    expect(securedProng?.dollarRoomStatus).toBe("NEEDS_INPUT");

    expect(firstLienProng?.category).toBe("RATIO_BASED");
    expect(firstLienProng?.capStatus).toBe("NEEDS_INPUT");

    expect(notes?.citationExcerpt).toMatch(/Debt under the Notes issued on the Issue Date/);
    expect(notes?.citationExcerpt).not.toMatch(/\$300,000,000/);
    expect(notes?.category).toBe("UNLIMITED_BY_PURPOSE");
    expect(notes?.capCanonical).toBeNull();

    expect(ratioDebt?.category).toBe("RATIO_BASED");
    expect(ratioDebt?.capKind).toBe("RATIO_TEST");
    expect(ratioDebt?.gateOpen).toBe(true);
    expect(ratioDebt?.dollarRoomStatus).toBe("NEEDS_INPUT");

    const proviso = book.baskets.find((b) => b.stableKey === "matw-409a-proviso");
    const purchaseMoney = book.baskets.find((b) => b.stableKey === "matw-pd-9");
    const foreignSubs = book.baskets.find((b) => b.stableKey === "matw-pd-13");
    const general = book.baskets.find((b) => b.stableKey === "matw-pd-16");
    const assetsCap = greaterOf("125", "0.07");
    expect(proviso?.category).toBe("GROWER_GREATER_OF");
    expect(proviso?.citationExcerpt).toMatch(/greater of \(i\) \$125\.0 million and \(ii\) 7\.0% of the Total Assets/);
    expect(proviso?.capStatus).toBe("COMPUTED");
    expect(proviso?.capCanonical).toBe(assetsCap);
    expect(proviso?.capCurrency).toBe("USD_MILLIONS");
    expect(purchaseMoney?.capCanonical).toBe(assetsCap);
    expect(general?.capCanonical).toBe(assetsCap);
    expect(foreignSubs?.category).toBe("GROWER_GREATER_OF");
    expect(foreignSubs?.citationExcerpt).toMatch(/greater of \(a\) \$100\.0 million and \(b\) 5\.5% of the Total Assets/);
    expect(foreignSubs?.capCanonical).toBe(greaterOf("100", "0.055"));

    expect(liens?.category).toBe("UNLIMITED_BY_PURPOSE");
    expect(liens?.capCanonical).toBeNull();
    expect(caLiens?.category).toBe("UNLIMITED_BY_PURPOSE");
    expect(caLiens?.citationExcerpt).toMatch(/2024 Note Offering/);
    expect(caLiens?.capCanonical).toBeNull();

    const section514 = book.baskets.find((b) => b.stableKey === "matw-514a");
    expect(section514?.category).toBe("RATIO_BASED");
    expect(section514?.citationExcerpt).toMatch(/December 31, 2023/);
    expect(section514?.citationExcerpt).toMatch(/less than or equal to 4\.50 to 1\.00/);
    expect(section514?.capCanonical).toBeNull();

    expect(book.baskets.every((b) => b.remainingStatus === "NEEDS_INPUT")).toBe(true);
    const computedKeys = book.baskets.filter((b) => b.capStatus === "COMPUTED").map((b) => b.stableKey);
    for (const key of ["matw-409a", "matw-409a-proviso", "matw-pd-1a", "matw-pd-13", "matw-pd-16", "matw-pd-9"]) {
      expect(computedKeys, key).toContain(key);
    }
    expect(computedKeys).toHaveLength(69);
    const amountKeys = book.baskets.filter((b) => b.capKind === "AMOUNT" && b.capStatus === "COMPUTED").map((b) => b.stableKey);
    for (const key of ["matw-409a-proviso", "matw-pd-1a", "matw-pd-13", "matw-pd-16", "matw-pd-9"]) {
      expect(amountKeys, key).toContain(key);
    }
    expect(amountKeys).toHaveLength(30);
  });

  it("leaves only the missing compliance-certificate amounts as an omission", () => {
    expect(book.omissions.map((o) => o.sectionRef)).toEqual([
      "Compliance certificate: CA EBITDA, Net Indebtedness, Senior Indebtedness, First Lien Debt, Eligible Cash Equivalents",
    ]);
    expect(book.omissions.every((o) => o.status === "NEEDS_INPUT" && o.capCanonical === null)).toBe(true);
    for (const n of [3, 4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19, 20, 21, 22]) {
      expect(book.baskets.some((b) => b.stableKey === `matw-pd-${n}`), `Permitted Debt (${n})`).toBe(true);
    }
  });
});
