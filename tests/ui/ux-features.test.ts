import { describe, expect, it } from "vitest";
import { keyRatiosFromPosition } from "@/lib/home/key-ratios";
import {
  bandSentence,
  certificateCsv,
  currentBand,
  datedItems,
  formatRatio,
  keyRatioProof,
  missingInputLabels,
  presentMorningBrief,
  presentVerdict,
  scenarioDelta,
  unevaluatedLine,
  UNLOADED_BRIEF,
  UNLOADED_KEY_RATIOS,
  type BandReading,
  type FigureProof,
} from "@/lib/ux/present";

describe("morning brief", () => {
  it("stays on needs input when the feed is not loaded", () => {
    const lines = presentMorningBrief(UNLOADED_BRIEF);
    expect(lines.map((line) => line.text)).toEqual(["Needs input", "Needs input", "Needs input"]);
  });

  it("uses the quiet sentence only when a visit date was supplied", () => {
    const lines = presentMorningBrief({ ...UNLOADED_BRIEF, lastVisitLabel: "Oct 16", changes: [] });
    expect(lines[0]?.text).toBe("Nothing changed since Oct 16.");
  });
});

describe("proof", () => {
  it("names each missing input", () => {
    const proof: FigureProof = {
      figure: "Headroom",
      value: "$1",
      inputs: [
        { label: "Capacity", value: "$2", source: "Notes" },
        { label: "Drawn", value: null, source: null },
      ],
      clause: null,
      page: null,
      review: null,
    };
    expect(missingInputLabels(proof)).toEqual(["Drawn"]);
  });
});

describe("certificate", () => {
  it("prints unevaluated lines as NOT EVALUATED", () => {
    const line = unevaluatedLine("Leverage", null);
    expect(presentVerdict(line)).toBe("NOT EVALUATED");
    expect(presentVerdict({ ...line, evaluated: "PASS" })).toBe("NOT EVALUATED");
    expect(presentVerdict({ ...line, evaluated: "PASS", required: "4.0x", actual: "3.0x" })).toBe("PASS");
    expect(certificateCsv({ company: "Acme", period: null, lines: [line] })).toContain("NOT EVALUATED");
  });
});

describe("calendar", () => {
  it("drops items whose date was not provided", () => {
    expect(datedItems([{ id: "a", kind: "test", label: "Test", date: null }])).toEqual([]);
    expect(datedItems([{ id: "a", kind: "test", label: "Test", date: "2026-11-15" }])).toHaveLength(1);
  });
});

describe("bands", () => {
  const reading: BandReading = {
    name: "Net leverage",
    actual: 3.1,
    actualLabel: "3.1x",
    thresholds: {
      direction: "lower-is-safer",
      healthyUntil: 2.5,
      moderateUntil: 3.5,
      limit: 4,
      limitLabel: "4.0x max",
    },
    previousBand: "Healthy",
    trendingToward: null,
  };

  it("describes a band change and stays quiet when cutoffs are missing", () => {
    expect(currentBand(reading)).toBe("Moderate");
    expect(bandSentence(reading)).toBe("Net leverage moved Healthy → Moderate (3.1x of 4.0x max).");
    expect(bandSentence({ ...reading, thresholds: null })).toBeNull();
    expect(currentBand({ ...reading, thresholds: null })).toBeNull();
  });
});

describe("key ratios", () => {
  it("prints missing input and does not invent a band or a limit", () => {
    expect(formatRatio(null)).toBe("Missing input");
    expect(formatRatio(1.64)).toBe("1.64x");
    const ratios = keyRatiosFromPosition(null, []);
    expect(ratios.map((ratio) => ratio.value)).toEqual([null, null, null, null, null]);
    expect(ratios.every((ratio) => ratio.thresholds == null && ratio.limitLabel == null)).toBe(true);
    expect(keyRatioProof(UNLOADED_KEY_RATIOS[0]!).value).toBeNull();
  });

  it("keeps a modeled limit and leaves fixed-charge coverage empty without a covenant row", () => {
    const ratios = keyRatiosFromPosition(
      {
        companyId: "co",
        asOfDate: new Date("2026-06-30"),
        genericGrossLeverage: { status: "OK", value: 1.92 },
        genericNetLeverage: { status: "OK", value: 1.23 },
        genericSecuredLeverage: { status: "UNAVAILABLE_MISSING_INPUT", value: null, detail: "Missing EBITDA" },
        genericInterestCoverage: { status: "OK", value: 4.1 },
        ebitdaMarginPct: { status: "UNAVAILABLE_MISSING_INPUT", value: null },
      },
      [
        {
          kind: "RATIO",
          stableKey: "tnl",
          name: "Total net leverage",
          documentName: "Credit agreement",
          sectionRef: "§7.01",
          currentRatio: 1.23,
          ratioLimit: 4,
          ratioHeadroom: 2.77,
          comparisonDirection: "at_or_below",
          bindingState: "BINDING",
          status: "MODELED",
          reviewState: "NOT_TRACKED",
          tier: "PRIMARY",
        },
      ],
    );
    expect(ratios.find((ratio) => ratio.id === "net")).toMatchObject({ value: 1.23, limitLabel: "4.00x max" });
    expect(ratios.find((ratio) => ratio.id === "secured")?.value).toBeNull();
    expect(ratios.find((ratio) => ratio.id === "fccr")?.value).toBeNull();
  });
});

describe("scenarios", () => {
  it("highlights a numeric delta and skips text", () => {
    expect(scenarioDelta("80", "140")).toBe("+60");
    expect(scenarioDelta("Debt incurrence", "Dividend / buyback")).toBeNull();
  });
});
