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
 *
 * Rule 20 — grower % must be the % attached to its base.
 *
 * The old parsePct took the FIRST % anywhere in the joined text,
 * so an unrelated "50% ownership" in the same section became the
 * greater-of grower instead of the true "10% of EBITDA"
 * (verified empirically: old code returned 0.50). parsePctOf
 * matches only a % modifying EBITDA / Total Assets.
 */
import { describe, expect, it } from "vitest";
import { parseMoneyMillions, parsePctOf, parseRatio } from "../../lib/product/customer-intelligence/money";
import { parseFormulaFromItem } from "../../lib/product/customer-intelligence/formula-parse";

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

  it("P4: $30MM carries its scale → 30 ($M), not bare $30", () => {
    expect(parseMoneyMillions("Amount/threshold: $30MM")).toBeCloseTo(30, 9);
  });

  it("P4: $2.5bn carries its scale → 2500 ($M)", () => {
    expect(parseMoneyMillions("Amount/threshold: $2.5bn")).toBeCloseTo(2500, 9);
  });
});

describe("P4 unit-misread treatment in formula parsing (Egzon ruling: no basket is below $1,000)", () => {
  function basketItem(amountText: string) {
    return {
      heading: "6.01(a)",
      sectionRef: "6.01(a)",
      category: "DEBT_INCURRENCE",
      posture: "ENUMERATED_PERMISSION",
      plainEnglish: `The Borrower may incur Indebtedness in an aggregate principal amount not to exceed ${amountText}.`,
      restriction: null,
      permissions: [],
      coveredEntities: [],
      exceptions: [],
      conditions: [],
      materialBasketsThresholds: [`Amount/threshold: ${amountText}`],
      draftingPatterns: [],
      operativeLanguageExcerpt: `The Borrower may incur Indebtedness not to exceed ${amountText}.`,
      sourceCitation: "test",
      governingAgreement: "test",
      families: [],
      relatedDefinedTerms: [],
      applicableDefinitions: [],
      entityScope: {},
    } as unknown as import("../../lib/product/covenant-intelligence/summarize").CovenantSummaryItem;
  }

  it('"$30 million" → thresholdValue 30 ($M = $30,000,000), MODELED', () => {
    const parsed = parseFormulaFromItem(basketItem("$30 million"));
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.thresholdValue).toBeCloseTo(30, 9);
  });

  it('"$30,000,000" → thresholdValue 30 ($M), MODELED', () => {
    const parsed = parseFormulaFromItem(basketItem("$30,000,000"));
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.thresholdValue).toBeCloseTo(30, 9);
  });

  it('"$30MM" → thresholdValue 30 ($M), MODELED', () => {
    const parsed = parseFormulaFromItem(basketItem("$30MM"));
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.thresholdValue).toBeCloseTo(30, 9);
  });

  it('a bare "$30" with no scale evidence fails closed with the unit-misread reason', () => {
    const parsed = parseFormulaFromItem(basketItem("$30"));
    expect(parsed.modelingStatus).toBe("KNOWN_NOT_MODELED");
    expect(parsed.missingFields).toContain("thresholdValue");
    expect(parsed.notes.join(" ")).toMatch(/unit misread/i);
    expect(parsed.thresholdValue).toBe(0);
  });

  it('a legitimately parsed "$50,000,000" behaves exactly as before', () => {
    const parsed = parseFormulaFromItem(basketItem("$50,000,000"));
    expect(parsed.modelingStatus).toBe("MODELED");
    expect(parsed.thresholdValue).toBeCloseTo(50, 9);
  });
});

describe("grower % attached to its base", () => {
  const text =
    "The Company must maintain at least 50% ownership of each Subsidiary. " +
    "Indebtedness not to exceed the greater of $150.0 million and 10.0% of Consolidated EBITDA. " +
    "Liens not to exceed 7.5% of Consolidated Total Assets.";

  it("EBITDA grower ignores an unrelated earlier %", () => {
    expect(parsePctOf(text, "EBITDA")).toBeCloseTo(0.1, 9);
  });

  it("Total Assets grower finds its own %", () => {
    expect(parsePctOf(text, "TOTAL_ASSETS")).toBeCloseTo(0.075, 9);
  });

  it("returns null when the base has no attached %", () => {
    expect(parsePctOf("Fixed basket of $150.0 million.", "EBITDA")).toBeNull();
  });

  it("Net Worth grower: bare, parenthesized, and qualified forms (Rule 186)", () => {
    // Aon 6.16(l) real language: "ten percent (10%) of Consolidated Net Worth".
    expect(parsePctOf("other Indebtedness in an aggregate principal amount outstanding at no time exceeding an amount equal to the greater of $1,000,000,000 or ten percent (10%) of Consolidated Net Worth at such time.", "NET_WORTH")).toBeCloseTo(0.1, 9);
    expect(parsePctOf("greater of $50 million and 15% of Net Worth", "NET_WORTH")).toBeCloseTo(0.15, 9);
    expect(parsePctOf("greater of $50 million and (12.5%) of the Borrower's Consolidated Net Worth", "NET_WORTH")).toBeCloseTo(0.125, 9);
  });

  it("Net Worth never matches Net Income (separate defined terms)", () => {
    expect(parsePctOf("greater of $50 million and 50% of Consolidated Net Income", "NET_WORTH")).toBeNull();
    expect(parsePctOf("greater of $50 million and 10% of Consolidated Net Worth", "CNI")).toBeNull();
  });

  it("parenthesized form works for the older bases too (Rule 186)", () => {
    expect(parsePctOf("greater of $150.0 million and twenty percent (20%) of Consolidated EBITDA", "EBITDA")).toBeCloseTo(0.2, 9);
    expect(parsePctOf("Liens not to exceed five percent (5%) of Consolidated Total Assets.", "TOTAL_ASSETS")).toBeCloseTo(0.05, 9);
  });
});

/**
 * Rule 58 — CNI share % must be the % attached to CNI, never
 * the hardcoded 0.5 the compiler used to invent.
 *
 * The old compile-accepted builder branch set
 * cniSharePct = /net income|CNI/ ? 0.5 : undefined — any mention
 * of net income/CNI added 0.5 × max(0, CNI) of invented
 * capacity. The share is now parsed from the text
 * ("50% of Consolidated Net Income" → 0.5) and is undefined +
 * missingFields when mentioned but unparseable.
 */
describe("CNI share % attached to its base", () => {
  it("parses 50% of Consolidated Net Income", () => {
    expect(parsePctOf("Available Amount plus 50% of Consolidated Net Income.", "CNI")).toBeCloseTo(0.5, 9);
  });

  it("parses a non-50% CNI share (100% is not 50%)", () => {
    expect(
      parsePctOf("Available Amount plus 100% of Consolidated Net Income.", "CNI"),
    ).toBeCloseTo(1.0, 9);
  });

  it("parses the bare CNI abbreviation", () => {
    expect(parsePctOf("Available Amount plus 75% of CNI.", "CNI")).toBeCloseTo(0.75, 9);
  });

  it("ignores an unrelated earlier %", () => {
    expect(
      parsePctOf(
        "The Company must maintain at least 50% ownership of each Subsidiary. Available Amount plus 25% of Consolidated Net Income.",
        "CNI",
      ),
    ).toBeCloseTo(0.25, 9);
  });

  it("returns null when CNI is mentioned without an attached %", () => {
    expect(parsePctOf("Available Amount plus Consolidated Net Income.", "CNI")).toBeNull();
  });
});

/**
 * Rule 24 — the "Xx" ratio form only counts in a leverage sentence.
 *
 * The old parseRatio took the first "Xx" anywhere, so an
 * interest-coverage multiple ("Coverage Ratio of at least 2.00x")
 * became the leverage ratio. The "to 1.00" form is
 * leverage-specific and still wins; the "Xx" form now requires
 * "leverage" in the same sentence.
 */
describe("leverage ratio parsing", () => {
  it("prefers the 'to 1.00' form", () => {
    expect(
      parseRatio("Interest Coverage Ratio of at least 2.00x. Total Leverage Ratio shall not exceed 4.00 to 1.00."),
    ).toBeCloseTo(4.0, 9);
  });

  it("takes Xx from a leverage sentence, not a coverage sentence", () => {
    expect(
      parseRatio("Interest Coverage Ratio of at least 2.00x. The leverage test requires the ratio not exceed 4.5x."),
    ).toBeCloseTo(4.5, 9);
  });

  it("returns null when Xx appears only in a non-leverage sentence", () => {
    expect(parseRatio("Interest Coverage Ratio of at least 2.00x. No leverage test applies.")).toBeNull();
  });
});
