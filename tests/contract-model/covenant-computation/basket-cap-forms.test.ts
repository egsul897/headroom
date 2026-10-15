/**
 * Deterministic basket-cap extraction: dollar / multiple / percent cap forms + fail-closed adversarial cases.
 *
 * No issuer/fixture hardcoding: every clause is synthetic except the Chewy-shape probes, which locate
 * cap-bearing spans in the DEV-split Chewy snapshot with generic patterns (no Chewy-specific strings).
 * A wrong cap is worse than no cap: ambiguous, conflicting, or unbound caps stay NEEDS_INPUT.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { evaluateBasket } from "@/lib/contract-model/covenant-computation/baskets";
import type { BasketClause, ComputationPackage } from "@/lib/contract-model/covenant-computation/types";
import { moneyMetricInput, metricInput, money, rationalFromString } from "@/lib/contract-model/definition-execution";
import type { MetricInput } from "@/lib/contract-model/runtime/types";

/** Consolidated EBITDA in USD_MILLIONS (as bindFinancialInputs produces for million-denominated metrics). */
function cebitdaMillions(): MetricInput[] {
  return [
    metricInput(
      "Consolidated EBITDA",
      money(rationalFromString("500"), "USD_MILLIONS", { exprId: null, inputKeys: ["Consolidated EBITDA"], rawSource: 500 }),
      { source: "test", sourceVersion: "2026-06-30", note: "test" },
      "FY2026",
      "2026-06-30",
    ),
  ];
}

const DOC = "test-doc";

function evalText(operativeText: string, metrics: readonly MetricInput[] = []): ReturnType<typeof evaluateBasket> {
  const pkg = {
    packageKey: "t",
    companyId: "c",
    instrumentKey: "i",
    asOf: "2026-06-30",
    documents: [{ documentId: DOC, text: `Agreement. ${operativeText}`, role: "CREDIT_AGREEMENT" }],
    baskets: [],
  } as unknown as ComputationPackage;
  const clause: BasketClause = {
    stableKey: "k",
    sectionRef: "§6.1",
    covenantFamily: "DEBT",
    documentId: DOC,
    operativeText,
    role: "PERMISSION",
  };
  return evaluateBasket(pkg, clause, metrics, []);
}

const cebitda = () => [moneyMetricInput("Consolidated EBITDA", 500, "FY2026", "2026-06-30", "test")];
const cassets = () => [moneyMetricInput("Consolidated Total Assets", 2000, "FY2026", "2026-06-30", "test")];

describe("dollar cap forms", () => {
  it.each([
    ["not to exceed", "Indebtedness in an aggregate principal amount not to exceed $250,000,000."],
    ["not in excess of", "Indebtedness in an aggregate principal amount not in excess of $250,000,000."],
    ["bare up to", "Indebtedness in an aggregate principal amount of up to $250,000,000."],
    ["capped at", "Indebtedness capped at $250,000,000."],
    ["maximum aggregate amount", "Indebtedness in a maximum aggregate amount of $250,000,000."],
    ["not exceeding", "Indebtedness in an aggregate principal amount not exceeding $250,000,000."],
    ["millions", "Indebtedness in an aggregate principal amount not to exceed $250.0 million."],
  ])("%s -> FIXED_DOLLAR 250000000", (_label, text) => {
    const b = evalText(text);
    expect(b.category).toBe("FIXED_DOLLAR");
    expect(b.capStatus).toBe("COMPUTED");
    expect(b.capCanonical).toBe("250000000");
  });
  it("a bare dollar statement with no ceiling language is not a cap", () => {
    const b = evalText("The aggregate principal amount of Indebtedness exceeds $250,000,000.");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical).toBeNull();
  });
  it("an HTML space entity between the number and 'million' still means millions (no million-fold understatement)", () => {
    // "$36.0&nbsp;million" must be $36,000,000, never $36. With a USD (non-millions) metric the
    // units misalign and the engine must say NEEDS_INPUT rather than compute a wrong cap.
    const b = evalText(
      "Dispositions for Fair Market Value not to exceed the greater of (x)&nbsp;$36.0&nbsp;million and (y) 5.0% of Consolidated EBITDA.",
      cebitda(),
    );
    expect(b.capCanonical).not.toBe("36");
    expect(b.capCanonical).not.toBe("36.0");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.missingInputs.join(" ")).toMatch(/currency alignment/);
  });
});

describe("EBITDA-multiple amount caps", () => {
  it.each([
    ["3.0x", "Indebtedness in an aggregate principal amount not to exceed 3.0x Consolidated EBITDA.", 1500],
    ["3.0 times", "Indebtedness in an aggregate principal amount not to exceed 3.0 times Consolidated EBITDA.", 1500],
    ["3.25x decimal", "Indebtedness in an aggregate principal amount not to exceed 3.25x Consolidated EBITDA.", 1625],
    ["multiple of Total Assets", "Indebtedness in an aggregate principal amount not to exceed 1.5x Consolidated Total Assets.", 3000],
  ])("%s -> MULTIPLE_OF_METRIC COMPUTED", (_label, text, expected) => {
    const b = evalText(text, [...cebitda(), ...cassets()]);
    expect(b.category).toBe("MULTIPLE_OF_METRIC");
    expect(b.capStatus).toBe("COMPUTED");
    expect(b.capCanonical).toBe(String(expected));
  });
  it("a ratio maintenance test is never converted to a dollar cap", () => {
    const b = evalText("The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.0 to 1.0.", cebitda());
    expect(b.category).toBe("RATIO_BASED");
    expect(b.capCanonical).toBeNull();
    const b2 = evalText("The Borrower shall not permit the Consolidated Leverage Ratio to exceed 3.0x.", cebitda());
    expect(b2.category).toBe("RATIO_BASED");
    expect(b2.capCanonical).toBeNull();
  });
  it("an unbound multiple metric stays NEEDS_INPUT", () => {
    const b = evalText("Indebtedness in an aggregate principal amount not to exceed 3.0x Consolidated EBITDA.");
    expect(b.category).toBe("MULTIPLE_OF_METRIC");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.missingInputs).toContain("Consolidated EBITDA");
  });
});

describe("percent-of-metric caps", () => {
  it("25% of Consolidated EBITDA with the metric bound", () => {
    const b = evalText("Indebtedness in an aggregate principal amount not to exceed 25% of Consolidated EBITDA.", cebitda());
    expect(b.category).toBe("PCT_OF_METRIC");
    expect(b.capStatus).toBe("COMPUTED");
    expect(b.capCanonical).toBe("125");
  });
  it("15% of Consolidated Total Assets with the metric bound", () => {
    const b = evalText("Indebtedness in an aggregate principal amount not to exceed 15% of Consolidated Total Assets.", cassets());
    expect(b.category).toBe("PCT_OF_METRIC");
    expect(b.capStatus).toBe("COMPUTED");
    expect(b.capCanonical).toBe("300");
  });
  it("an unbound percent metric stays NEEDS_INPUT (no other base substituted)", () => {
    const b = evalText("Indebtedness in an aggregate principal amount not to exceed 25% of Consolidated EBITDA.");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.missingInputs).toContain("Consolidated EBITDA");
  });
});

describe("greater-of and lesser-of", () => {
  it("greater of dollar and percent of EBITDA takes the max", () => {
    const b = evalText(
      "Indebtedness in an aggregate principal amount not to exceed the greater of (a) $100,000,000 and (b) 25% of Consolidated EBITDA.",
      cebitda(),
    );
    expect(b.category).toBe("GROWER_GREATER_OF");
    expect(b.capStatus).toBe("COMPUTED");
    // max(100,000,000, 25% of 500) = 100,000,000 in fixture units.
    expect(b.capCanonical).toBe("100000000");
  });
  it("lesser of dollar and multiple takes the min (multiple limb smaller)", () => {
    // min($2,000, 3.0 x 500) = 1,500: the multiple limb governs, not the fixed limb.
    const b = evalText(
      "Indebtedness in an aggregate principal amount not to exceed the lesser of (a) $2,000 and (b) 3.0x Consolidated EBITDA.",
      cebitda(),
    );
    expect(b.category).toBe("LESSER_OF");
    expect(b.capStatus).toBe("COMPUTED");
    expect(b.capCanonical).toBe("1500");
  });
  it("lesser of dollar and multiple takes the min (fixed limb smaller)", () => {
    // min($400, 3.0 x 500) = 400.
    const b = evalText(
      "Indebtedness in an aggregate principal amount not to exceed the lesser of (a) $400 and (b) 3.0x Consolidated EBITDA.",
      cebitda(),
    );
    expect(b.category).toBe("LESSER_OF");
    expect(b.capStatus).toBe("COMPUTED");
    expect(b.capCanonical).toBe("400");
  });
  it("lesser of dollar and percent takes the min", () => {
    // min($100, 25% of 500 = 125) = 100.
    const b = evalText(
      "Indebtedness in an aggregate principal amount not to exceed the lesser of (a) $100 and (b) 25% of Consolidated EBITDA.",
      cebitda(),
    );
    expect(b.category).toBe("LESSER_OF");
    expect(b.capStatus).toBe("COMPUTED");
    expect(b.capCanonical).toBe("100");
  });
});

describe("fail-closed adversarial cases", () => {
  it("no cap stated stays NEEDS_INPUT", () => {
    const b = evalText("Indebtedness incurred in the ordinary course of business.");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical).toBeNull();
  });
  it("two different dollar caps stay NEEDS_INPUT (no silent pick)", () => {
    const b = evalText("Indebtedness not to exceed $100,000,000 or $200,000,000.");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical).toBeNull();
  });
  it("two different multiples stay NEEDS_INPUT (no silent pick)", () => {
    const b = evalText(
      "Indebtedness in an aggregate principal amount not to exceed 3.0x Consolidated EBITDA or 4.0x Consolidated EBITDA.",
      cebitda(),
    );
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical).toBeNull();
  });
  it("dollar and multiple joined by 'and' without lesser/greater stays NEEDS_INPUT (neither limb alone is the cap)", () => {
    const b = evalText("Indebtedness not to exceed $100,000,000 and 3.0x Consolidated EBITDA.", cebitda());
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical).toBeNull();
  });
  it("a non-cap greater-of (rate definition) stays NEEDS_INPUT", () => {
    const b = evalText(
      "greater of (a) (x) SONIA for the day that is five RFR Business Days prior to such RFR Interest Day or (ii) if such RFR Interest Day is not an RFR Business Day",
      cebitda(),
    );
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical).toBeNull();
  });
});

describe("Chewy-shape probes (DEV-split snapshot, generic patterns, no Chewy-specific strings)", () => {
  const CHWY = "edgar:0001193125-26-281042:doc-a-2026-06-23-credit-agreement.htm";
  function chewyText(): string {
    const raw = JSON.parse(gunzipSync(readFileSync("scripts/covenant-learning-factory/scoreboard/snapshot.json.gz")).toString("utf8")) as unknown as {
      sources: Array<{ source: { sourceId: string }; documentText: string }>;
    };
    const entry = raw.sources.find((s) => s.source.sourceId === CHWY);
    if (!entry) throw new Error("Chewy snapshot entry missing");
    return entry.documentText.replace(/\s+/g, " ").trim();
  }
  it("the E2E proviso shapes (cap-less conditions) stay NEEDS_INPUT", () => {
    // The five clauses extractBasketClauses surfaced on this agreement are provisos with no cap.
    // Their shape — a condition with no number in cap role — must never yield a cap.
    const b = evalText("; provided that, with respect to any benchmark rate that includes a floor, the applicable benchmark rate is less than the floor");
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical).toBeNull();
  });
  it("greater-of dollar-and-percent-of-EBITDA spans present in the agreement evaluate (fail-before: 0 computed caps end-to-end)", () => {
    const text = chewyText();
    // Generic shape: greater of (marker) $N million and (marker) P% of Consolidated EBITDA.
    // Note: [\s\S] (not [^.;]) because the dollar limb contains a decimal point ("$36.0 million").
    const spans = [...text.matchAll(/greater of\s+\([a-z0-9]+\)[\s\S]{0,600}?\d+(?:\.\d+)?\s*%\s+of\s+(?:the\s+)?(?:Consolidated\s+)?EBITDA/gi)];
    expect(spans.length).toBeGreaterThan(0);
    let computed = 0;
    for (const m of spans.slice(0, 8)) {
      if (m.index == null) continue;
      // Start at "greater of": preceding window text would add unrelated numbers/HTML.
      const operativeText = text.slice(m.index, m.index + m[0].length);
      const clause: BasketClause = { stableKey: "chewy-shape", sectionRef: "§6.5", covenantFamily: "ASSET_SALES", documentId: CHWY, operativeText, role: "PERMISSION" };
      const pkg = {
        packageKey: "t",
        companyId: "c",
        instrumentKey: "i",
        asOf: "2026-06-30",
        documents: [{ documentId: CHWY, text, role: "CREDIT_AGREEMENT" }],
        baskets: [],
      } as unknown as ComputationPackage;
      // The agreement's fixed limbs are written in millions; the bound metric must be USD_MILLIONS
      // for the currency-alignment check to pass (as bindFinancialInputs produces in production).
      const b = evaluateBasket(pkg, clause, cebitdaMillions(), []);
      if (b.capStatus === "COMPUTED" && b.capCanonical !== null) computed += 1;
    }
    // At least one real greater-of span in the agreement must now compute. The extractor
    // surfacing these spans end-to-end is a separate gap (HTML headings); this proves the
    // evaluator handles the shapes once they reach it.
    expect(computed).toBeGreaterThan(0);
  });
});
