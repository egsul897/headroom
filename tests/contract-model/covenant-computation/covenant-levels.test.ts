/**
 * Covenant-level grammar pins (PR #383 design 6240146575; semantics
 * rulings 6240192569; cross-review brief 2026-10-17).
 *
 * Every fixture is SYNTHETIC (invented issuers — "Meridian Packaging",
 * "Halloran Grid" — and invented figures), per the PR #430 discipline.
 * Each describe block names the confirmed gap or cross-review probe it
 * pins. On the base tree this module does not exist, so every test
 * fails there by construction; the consumer pins in
 * covenant-levels-consumers.test.ts demonstrate behavioral fail-before
 * on code that exists at base.
 */
import { describe, expect, it } from "vitest";
import {
  findRatioTokens,
  metricForRatioName,
  parseCovenantLevel,
} from "../../../lib/contract-model/covenant-computation/covenant-levels";
// Mirrors figure-role.ts RATIO_RE verbatim (the canonical reader the
// brief says already works) for the tokenizer-union pin. figure-role
// itself is not imported here: its module chain reaches @prisma/client
// as a value import, which fails collection in this workspace's stale
// generated-client state (pre-existing; CI uses a regenerated client).
// The union property is a property of the two readers' patterns and
// values, so it is pinned at the pattern level.
const FIGURE_ROLE_RATIO_RE = /\b(\d[\d,]*(?:\.\d+)?)\s*(?:to|:)\s*1(?:\.0+)?\b/gi;

describe("tokenizer: union with figure-role's canonical reader", () => {
  const forms: Array<[string, string]> = [
    ["4.50:1.00", "4.5"],
    ["4.50 to 1.00", "4.5"],
    ["4.5 to 1", "4.5"],
    ["4.50:1", "4.5"],
    ["4.50 to 1.0", "4.5"],
    ["3.00:1.00", "3"],
    ["1,250.50:1.00", "1250.5"],
  ];
  for (const [raw, canonical] of forms) {
    it(`reads ${raw} as ${canonical}, agreeing with figure-role`, () => {
      FIGURE_ROLE_RATIO_RE.lastIndex = 0;
      expect(FIGURE_ROLE_RATIO_RE.test(raw)).toBe(true);
      const tokens = findRatioTokens(raw);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.canonical).toBe(canonical);
      // figure-role's reader values the same span as numerator / 1:
      expect(tokens[0]!.numericValue).toBe(Number(canonical));
    });
  }

  it("normalizes non-1 denominators EXACTLY (BigInt, never float division)", () => {
    expect(findRatioTokens("9.00:2.00")[0]!.canonical).toBe("4.5");
    expect(findRatioTokens("3.75 to 1.50")[0]!.canonical).toBe("2.5");
    // 10/3 does not terminate: the exact fraction is kept, not 3.33.
    expect(findRatioTokens("10.00:3.00")[0]!.canonical).toBe("10/3");
  });

  it("reads bare NUM x / NUM times as NUM:1", () => {
    expect(findRatioTokens("4.25x")[0]!.canonical).toBe("4.25");
    expect(findRatioTokens("a level of 4.25 times")[0]!.canonical).toBe("4.25");
  });
});

const MAINTENANCE_MAX =
  "The Borrower shall not permit the Consolidated Total Net Leverage Ratio as of the last day of any fiscal quarter to exceed 4.50:1.00.";

describe("canonical maintenance covenant (shall not permit … to exceed)", () => {
  it("parses level, direction, metric, kind — DETERMINED", () => {
    const r = parseCovenantLevel({ text: MAINTENANCE_MAX, sectionFamily: "FINANCIAL_RATIOS" });
    expect(r.status).toBe("DETERMINED");
    expect(r.testKind).toBe("MAINTENANCE");
    expect(r.direction).toBe("MAX");
    expect(r.level).toBe("4.5");
    expect(r.metric).toBe("NET_LEVERAGE");
    expect(r.ratioName).toBe("Consolidated Total Net Leverage Ratio");
    expect(r.citation).toContain("shall not permit");
    expect(r.missing).toEqual([]);
  });

  it("works from the heading alone (Financial Covenants article)", () => {
    const r = parseCovenantLevel({ text: MAINTENANCE_MAX, articleHeading: "ARTICLE VII — FINANCIAL COVENANTS" });
    expect(r.testKind).toBe("MAINTENANCE");
    expect(r.status).toBe("DETERMINED");
  });
});

describe("gap 1: strict :1.00-only readers — every ratio format parses", () => {
  const variants = ["4.5:1", "4.50 to 1", "4.5 to 1.00", "4.50:1.0", "4.50 to 1.00", "4.5x", "4.50:1.00"];
  for (const v of variants) {
    it(`accepts ${v}`, () => {
      const r = parseCovenantLevel({
        text: `The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed ${v}.`,
        sectionFamily: "FINANCIAL_RATIOS",
      });
      expect(r.status).toBe("DETERMINED");
      expect(r.level).toBe("4.5");
      expect(r.testKind).toBe("MAINTENANCE");
    });
  }

  it("accepts a non-1 denominator in a level (9.00:2.00 = 4.5)", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed 9.00:2.00.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.level).toBe("4.5");
    expect(r.status).toBe("DETERMINED");
  });
});

describe("CANONICAL CORRECTNESS CASE: the incurrence-proviso guard", () => {
  it("pro-forma incurrence phrasing is INCURRENCE even inside a financial-covenants role", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall not incur any Indebtedness if, after giving effect thereto on a pro forma basis, the Consolidated Total Leverage Ratio would exceed 4.50:1.00.",
      sectionFamily: "FINANCIAL_RATIOS",
      sectionHeading: "Financial Covenants",
    });
    expect(r.testKind).toBe("INCURRENCE");
    expect(r.level).toBe("4.5");
    expect(r.direction).toBe("MAX");
    expect(r.status).toBe("DETERMINED");
  });

  it("'provided that … pro forma basis … would not exceed' is INCURRENCE", () => {
    const r = parseCovenantLevel({
      text: "The Borrower may make Investments, provided that, after giving pro forma effect to such Investment, the Consolidated Total Leverage Ratio would not exceed 4.50:1.00.",
      sectionFamily: "FINANCIAL_MAINTENANCE",
    });
    expect(r.testKind).toBe("INCURRENCE");
    expect(r.level).toBe("4.5");
  });

  it("a 'would be at least' coverage test on an incurrence action is INCURRENCE + MIN", () => {
    const r = parseCovenantLevel({
      text: "The Borrower may incur Indebtedness so long as the Consolidated Fixed Charge Coverage Ratio would be at least 2.00:1.00.",
      sectionFamily: "INDEBTEDNESS",
    });
    expect(r.testKind).toBe("INCURRENCE");
    expect(r.direction).toBe("MIN");
    expect(r.metric).toBe("FIXED_CHARGE_COVERAGE");
    expect(r.level).toBe("2");
  });

  it("the same level shape WITHOUT the proviso, in a maintenance role, stays MAINTENANCE", () => {
    const r = parseCovenantLevel({ text: MAINTENANCE_MAX, sectionFamily: "FINANCIAL_RATIOS" });
    expect(r.testKind).toBe("MAINTENANCE");
  });

  it("'calculated on a Pro Forma Basis' inside a maintenance covenant is a calculation convention, NOT an incurrence proviso", () => {
    // Dev-set shape: a maintenance leverage test whose ratio is computed
    // pro forma for period transactions, with a Material Acquisition
    // step-up proviso. The guard must not fire; the elided section stem
    // ("shall not permit" lives in the article chapeau, outside this
    // clause fragment) leaves direction honestly NEEDS_INPUT.
    const r = parseCovenantLevel({
      text: "Permit the Total Leverage Ratio as of the end of any Test Period to be greater than 4.00:1.00 calculated on a Pro Forma Basis; provided, that, upon the consummation of a Material Acquisition, the ratio set forth above shall be increased by 0.50:1.00; provided, further, that for at least two fiscal quarters immediately following each such period the ratio shall be tested at the level set forth above.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.testKind).toBe("MAINTENANCE");
    expect(r.level).toBe("4");
    expect(r.modifiers.some((mod) => mod.kind === "STEP_UP" && mod.amount === "0.5")).toBe(true);
    expect(r.direction).toBeNull();
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.missing).toContain("direction");
  });

  it("'for at least two consecutive fiscal quarters' is a duration, never a MIN comparator", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall not permit the Consolidated Leverage Ratio to exceed 5.25:1.00; provided that, upon a Material Acquisition, such level shall be increased by 0.25:1.00 and, for at least two consecutive fiscal quarters thereafter, the Borrower shall deliver a compliance certificate.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.direction).toBe("MAX");
    expect(r.level).toBe("5.25");
    expect(r.status).toBe("DETERMINED");
  });
});

describe("gap 2: affirmative frames (shall maintain / shall have / imperative)", () => {
  it("'shall maintain … not less than' is a MIN maintenance level", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall maintain a Consolidated Interest Coverage Ratio of not less than 3.00:1.00.",
    });
    expect(r.testKind).toBe("MAINTENANCE");
    expect(r.direction).toBe("MIN");
    expect(r.metric).toBe("INTEREST_COVERAGE");
    expect(r.level).toBe("3");
    expect(r.status).toBe("DETERMINED");
  });

  it("'shall have … at least' is a MIN maintenance level", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall have a Fixed Charge Coverage Ratio of at least 1.25:1.00 as of the last day of each fiscal quarter.",
    });
    expect(r.testKind).toBe("MAINTENANCE");
    expect(r.direction).toBe("MIN");
    expect(r.metric).toBe("FIXED_CHARGE_COVERAGE");
    expect(r.level).toBe("1.25");
  });

  it("imperative under a Financial Covenants heading parses (heading supplies the role)", () => {
    const r = parseCovenantLevel({
      text: "Maintain a Consolidated Leverage Ratio not more than 4.75:1.00 at all times.",
      sectionHeading: "Section 7.11 Financial Covenants",
    });
    expect(r.testKind).toBe("MAINTENANCE");
    expect(r.direction).toBe("MAX");
    expect(r.level).toBe("4.75");
    expect(r.metric).toBe("GROSS_LEVERAGE");
  });

  it("'will not permit … to be less than' is a MIN maintenance level (ABL drafting form)", () => {
    const r = parseCovenantLevel({
      text: "As of the end of any calendar month, the Borrowers will not permit the Fixed Charge Coverage Ratio to be less than 1.05 to 1.00.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.testKind).toBe("MAINTENANCE");
    expect(r.direction).toBe("MIN");
    expect(r.metric).toBe("FIXED_CHARGE_COVERAGE");
    expect(r.level).toBe("1.05");
    expect(r.status).toBe("DETERMINED");
  });

  it("'will not permit … to exceed' is a MAX maintenance level", () => {
    const r = parseCovenantLevel({
      text: "The Borrower will not permit the Consolidated Leverage Ratio to exceed 4.25 to 1.00 at any time.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.direction).toBe("MAX");
    expect(r.level).toBe("4.25");
    expect(r.status).toBe("DETERMINED");
  });

  it("'maintain + not more than' (already working per the brief) stays working", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall maintain a Consolidated Leverage Ratio of not more than 4.75 to 1.00.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.level).toBe("4.75");
    expect(r.direction).toBe("MAX");
    expect(r.status).toBe("DETERMINED");
  });
});

describe("gap 5: step schedules are never dropped or silently flattened", () => {
  const SCHEDULE =
    "The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed the applicable level set forth below: " +
    "(a) for the fiscal quarter ending June 30, 2027, 5.00:1.00; " +
    "(b) for the fiscal quarter ending September 30, 2027, 4.75:1.00; " +
    "(c) thereafter, 4.50:1.00.";

  it("keeps every row and, without a test date, is NEEDS_INPUT naming testDate (never first/last row alone)", () => {
    const r = parseCovenantLevel({ text: SCHEDULE, sectionFamily: "FINANCIAL_RATIOS" });
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.missing).toContain("testDate");
    expect(r.reasons).toContain("TEST_DATE_REQUIRED_FOR_SCHEDULE");
    expect(r.level).toBeNull();
    expect(r.schedule).toHaveLength(3);
    expect(r.schedule.map((s) => s.level)).toEqual(["5", "4.75", "4.5"]);
  });

  it("selects the governing row by test date", () => {
    const r = parseCovenantLevel({ text: SCHEDULE, sectionFamily: "FINANCIAL_RATIOS", testDate: "2027-08-15" });
    expect(r.status).toBe("DETERMINED");
    expect(r.level).toBe("4.75");
    expect(r.schedule[1]!.selected).toBe(true);
    expect(r.schedule[0]!.selected).toBe(false);
  });

  it("the 'thereafter' row governs after the last dated row", () => {
    const r = parseCovenantLevel({ text: SCHEDULE, sectionFamily: "FINANCIAL_RATIOS", testDate: "2028-03-31" });
    expect(r.level).toBe("4.5");
    expect(r.schedule[2]!.selected).toBe(true);
  });

  it("a test date in a schedule gap is NEEDS_INPUT naming the gap, not the nearest row", () => {
    const gapped =
      "The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed: " +
      "for any Test Period ending on or after January 1, 2027 and prior to July 1, 2027, 5.00:1.00; " +
      "on or after January 1, 2028, 4.50:1.00.";
    const r = parseCovenantLevel({ text: gapped, sectionFamily: "FINANCIAL_RATIOS", testDate: "2027-09-15" });
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.reasons).toContain("TEST_DATE_OUTSIDE_SCHEDULE");
    expect(r.level).toBeNull();
    expect(r.schedule).toHaveLength(2);
  });

  it("parses the 'from the Test Period ending on X to and including …' schedule dialect, with a step-up proviso riding as a modifier", () => {
    const text =
      "The Borrower shall not permit the Consolidated Rent Adjusted Net Leverage Ratio to be greater than " +
      "(A) from the Test Period ending on April 2, 2028 to and including the Test Period ending on December 30, 2028, 6.25:1.00, " +
      "(B) from the Test Period ending on April 1, 2029 to and including the Test Period ending on December 29, 2029, 6.00:1.00, and " +
      "(C) from the Test Period ending on March 31, 2030 and each Test Period ending thereafter, 5.75:1.00; " +
      "provided that, upon the consummation of a Material Acquisition, the applicable level shall be increased by 0.25:1.00 for the fiscal quarter in which such Material Acquisition is consummated.";
    const r = parseCovenantLevel({ text, sectionFamily: "FINANCIAL_RATIOS", testDate: "2029-06-30" });
    expect(r.testKind).toBe("MAINTENANCE");
    expect(r.schedule.map((s) => s.level)).toEqual(["6.25", "6", "5.75"]);
    expect(r.level).toBe("6");
    expect(r.schedule[1]!.selected).toBe(true);
    expect(r.status).toBe("DETERMINED");
    expect(r.modifiers.some((mod) => mod.kind === "STEP_UP" && mod.amount === "0.25")).toBe(true);
    const later = parseCovenantLevel({ text, sectionFamily: "FINANCIAL_RATIOS", testDate: "2031-01-15" });
    expect(later.level).toBe("5.75");
  });

  it("an unparseable test date is NEEDS_INPUT, never a guessed row", () => {
    const r = parseCovenantLevel({ text: SCHEDULE, sectionFamily: "FINANCIAL_RATIOS", testDate: "next quarter" });
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.reasons).toContain("TEST_DATE_UNPARSEABLE");
    expect(r.level).toBeNull();
  });
});

describe("gap 3 + 6: modifiers and relative levels are data, never silently dropped", () => {
  it("a numeric step-up with a trigger rides as a modifier; the base level stays DETERMINED", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall not permit the Consolidated Total Net Leverage Ratio to exceed 4.50:1.00, which level shall be increased by 0.25:1.00 upon a Material Acquisition.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.status).toBe("DETERMINED");
    expect(r.level).toBe("4.5");
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]!.kind).toBe("STEP_UP");
    expect(r.modifiers[0]!.amount).toBe("0.25");
    expect(r.modifiers[0]!.resolved).toBe(true);
    expect(r.modifiers[0]!.trigger).toContain("Material Acquisition");
  });

  it("a relative level ('0.50 less than the maximum … under Section X') is NEEDS_INPUT naming the modifier — never the base asserted flat", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall not permit the Consolidated Leverage Ratio to exceed a level equal to 0.50 less than the maximum Consolidated Leverage Ratio permitted under Section 7.09.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.reasons).toContain("RELATIVE_LEVEL_UNRESOLVED");
    expect(r.level).toBeNull();
    expect(r.modifiers[0]!.kind).toBe("RELATIVE");
    expect(r.modifiers[0]!.resolved).toBe(false);
  });

  it("a modifier with no base level is NEEDS_INPUT naming the missing base", () => {
    const r = parseCovenantLevel({
      text: "The permitted level shall be increased by 0.25:1.00 upon a Material Acquisition.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.reasons).toContain("MODIFIER_WITHOUT_BASE_LEVEL");
    expect(r.level).toBeNull();
  });
});

describe("fail-closed discipline: no default level, named missing inputs", () => {
  it("text with no ratio returns level null with a named reason", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall maintain all material permits in full force and effect.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.level).toBeNull();
    expect(r.reasons).toContain("NO_RATIO_LEVEL_IN_TEXT");
  });

  it("a bare ratio with no comparator and no role is NEEDS_INPUT for direction and kind", () => {
    const r = parseCovenantLevel({ text: "The Consolidated Leverage Ratio shall be 4.50:1.00." });
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.reasons).toContain("DIRECTION_UNDETERMINED");
    expect(r.reasons).toContain("TEST_KIND_UNDETERMINED");
  });

  it("two distinct tests conflated in one blob refuse rather than pick one", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall not permit the Consolidated Leverage Ratio to exceed 4.50:1.00 and shall maintain an Interest Coverage Ratio of not less than 3.00:1.00.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.reasons).toContain("MULTIPLE_DISTINCT_LEVELS");
    expect(r.level).toBeNull();
  });
});

describe("metric identity (never guessed)", () => {
  it("maps the catalog names", () => {
    expect(metricForRatioName("Consolidated Total Leverage Ratio")).toBe("GROSS_LEVERAGE");
    expect(metricForRatioName("Consolidated Total Net Leverage Ratio")).toBe("NET_LEVERAGE");
    expect(metricForRatioName("Consolidated Secured Leverage Ratio")).toBe("SECURED_LEVERAGE");
    expect(metricForRatioName("First Lien Leverage Ratio")).toBe("SECURED_LEVERAGE");
    expect(metricForRatioName("Consolidated Interest Coverage Ratio")).toBe("INTEREST_COVERAGE");
    expect(metricForRatioName("Consolidated Fixed Charge Coverage Ratio")).toBe("FIXED_CHARGE_COVERAGE");
    expect(metricForRatioName("Consolidated EBITDA Growth Ratio")).toBeNull();
  });

  it("reads identity from an inline 'ratio of A to B' (net of Unrestricted Cash)", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall not permit the ratio of Consolidated Total Debt minus Unrestricted Cash to Consolidated EBITDA to exceed 4.50:1.00.",
      sectionFamily: "FINANCIAL_RATIOS",
    });
    expect(r.metric).toBe("NET_LEVERAGE");
    expect(r.level).toBe("4.5");
  });

  it("an unmapped ratio name yields metric null, not a guess", () => {
    const r = parseCovenantLevel({
      text: "The Borrower shall not permit the Consolidated EBITDA Growth Ratio to exceed 4.50:1.00.",
      sectionFamily: "FINANCIAL_RATIOS",
      ratioName: "Consolidated EBITDA Growth Ratio",
    });
    expect(r.metric).toBeNull();
    expect(r.reasons).toContain("METRIC_IDENTITY_UNRESOLVED");
    expect(r.level).toBe("4.5");
  });
});
