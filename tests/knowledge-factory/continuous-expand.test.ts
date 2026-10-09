import { describe, expect, it } from "vitest";
import { scoreExhibitForTargets, DIVERSITY_EXPAND_TARGETS } from "../../lib/knowledge-factory/continuous/target-issuers";
import { buildSyntheticCalculationLibrary } from "../../lib/knowledge-factory/continuous/calculation-examples";

describe("continuous neon expand targeting", () => {
  it("includes sparse-class diversity targets beyond CONMED/Chewy", () => {
    const tickers = new Set(DIVERSITY_EXPAND_TARGETS.map((t) => t.ticker));
    expect(tickers.has("GPK")).toBe(true);
    expect(tickers.has("NET")).toBe(true);
    expect(tickers.has("JNJ")).toBe(true);
    expect(tickers.has("CNMD")).toBe(false);
    expect(tickers.has("CHWY")).toBe(false);
  });

  it("scores ABL and intercreditor exhibits higher for sparse priorities", () => {
    const abl = scoreExhibitForTargets(
      "Amended and Restated Asset-Based Revolving Credit Agreement",
      "ex10-1.htm",
      ["ABL_AGREEMENT", "CREDIT_AGREEMENT"],
    );
    const generic = scoreExhibitForTargets("Side letter", "ex99.htm", ["ABL_AGREEMENT"]);
    expect(abl).toBeGreaterThan(generic);
    expect(abl).toBeGreaterThanOrEqual(10);
  });
});

describe("synthetic calculation example library", () => {
  it("labels all inputs synthetic and keeps enginePrediction null", () => {
    const cases = buildSyntheticCalculationLibrary({
      sourceAnchors: [{ sourceId: "edgar:demo:ex10.htm", documentClass: "CREDIT_AGREEMENT" }],
    });
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const c of cases) {
      expect(c.inputs.inputKind).toBe("synthetic");
      expect(c.enginePrediction).toBeNull();
      expect(c.expected.permitted === true || c.expected.permitted === false).toBe(true);
      expect(c.verificationStatus).not.toBe("CERTIFIED");
    }
    const kinds = new Set(cases.map((c) => c.scenarioKind));
    expect(kinds.has("BELOW_LIMIT")).toBe(true);
    expect(kinds.has("ABOVE_LIMIT")).toBe(true);
    expect(kinds.has("SHARED_CAPACITY")).toBe(true);
    expect(kinds.has("CROSS_DOCUMENT")).toBe(true);
  });
});
