/**
 * PHASE 3 / 6.01 remediation §19 - HD-5 scorer fix, tested against the EXACT frozen examples from
 * docs/phase-3-final-601/88-final-paid-harness-defect-disclosure.json. Zero model calls.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { numbersIn, near, contradictsSource, scorerUnitOf } from "../../scripts/phase-3-601-score-numeric";

const SRC = readFileSync("tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", "utf8");

describe("HD-5 - percent normalization", () => {
  it("source '50%' parses to the fraction 0.5 with unit % and raw text preserved; it equals the IR-normalized 0.5", () => {
    const n = numbersIn("the greater of (x) $360.0 million and (y) 50% of Consolidated EBITDA");
    expect(n).toEqual([{ raw: "$360.0 million", value: 360_000_000, unit: "USD" }, { raw: "50%", value: 0.5, unit: "%" }]);
    expect(near(0.5, n[1]!.value)).toBe(true);
    expect(contradictsSource({ normalizedValue: 0.5, unit: "%", rawText: "50%" }, n).contradiction).toBe(false);
    expect(contradictsSource({ normalizedValue: 2, unit: "%", rawText: "200%" }, numbersIn("200% of the net cash proceeds")).contradiction).toBe(false);
    expect(contradictsSource({ normalizedValue: 1, unit: "%", rawText: "100%" }, numbersIn("the greater of $720.0 million and 100% of Consolidated EBITDA")).contradiction).toBe(false);
  });

  it("a real percent contradiction is still detected (unit-aware, never silent)", () => {
    const r = contradictsSource({ normalizedValue: 0.75, unit: "%", rawText: "75%" }, numbersIn("50% of Consolidated EBITDA"));
    expect(r.contradiction).toBe(true);
  });
});

describe("HD-5 - money scale and unit awareness", () => {
  it("money is fully scaled and only ever compared against money", () => {
    const n = numbersIn("$720.0 million and 100% of Consolidated EBITDA and 2.50x");
    expect(n.find((x) => x.unit === "USD")!.value).toBe(720_000_000);
    expect(contradictsSource({ normalizedValue: 720_000_000, unit: "USD", rawText: "$720.0 million" }, n).contradiction).toBe(false);
    // a percent IR value never contradicts money numbers and vice versa
    expect(contradictsSource({ normalizedValue: 720_000_000, unit: "USD", rawText: "$720.0 million" }, numbersIn("50% of EBITDA")).contradiction).toBe(false);
    expect(scorerUnitOf("days")).toBeNull();
    expect(contradictsSource({ normalizedValue: 90, unit: "days", rawText: "90 days" }, n).contradiction).toBe(false);
  });

  it("a real money contradiction is still detected", () => {
    expect(contradictsSource({ normalizedValue: 500_000_000, unit: "USD", rawText: "$500.0 million" }, numbersIn("$720.0 million")).contradiction).toBe(true);
  });
});

describe("HD-5 - span truncation cannot manufacture a contradiction (frozen B6 span [634000, 634400] ends inside '$360.0 million')", () => {
  const span: [number, number] = [634000, 634400];
  const spanText = SRC.slice(span[0], span[1]);

  it("the frozen span is cut inside the money phrase: it ends with '$360.0 milli' and the source continues 'on and (y) 50% of Co...'", () => {
    expect(spanText.endsWith("$360.0 milli")).toBe(true);
    expect(SRC.slice(span[1], span[1] + 20)).toBe("on and (y) 50% of Co");
    // the scale word is cut, so the span alone parses to 360 - exactly the pinned scorer's reading
    expect(numbersIn(spanText).find((x) => x.unit === "USD")).toEqual({ raw: "$360.0", value: 360, unit: "USD" });
  });

  it("the pinned scorer's reading (360 vs 360,000,000) is no longer a contradiction: the span-cut source number is a prefix of the IR raw text", () => {
    const sourceNumbers = numbersIn(spanText);
    expect(sourceNumbers.find((x) => x.unit === "USD")).toEqual({ raw: "$360.0", value: 360, unit: "USD" });
    const r = contradictsSource({ normalizedValue: 360_000_000, unit: "USD", rawText: "$360.0 million" }, sourceNumbers, { fullSourceText: SRC, spanStart: span[0], spanEnd: span[1] });
    expect(r.contradiction).toBe(false);
    expect(r.reason).toMatch(/span-cut prefix|span truncation/);
  });

  it("the guard is narrow: a genuinely different amount inside the same span is still a contradiction", () => {
    const r = contradictsSource({ normalizedValue: 990_000_000, unit: "USD", rawText: "$990.0 million" }, numbersIn(spanText), { fullSourceText: SRC, spanStart: span[0], spanEnd: span[1] });
    expect(r.contradiction).toBe(true);
  });
});
