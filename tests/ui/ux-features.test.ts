import { describe, expect, it } from "vitest";
import {
  bandSentence,
  certificateCsv,
  currentBand,
  datedItems,
  missingInputLabels,
  presentMorningBrief,
  presentVerdict,
  scenarioDelta,
  unevaluatedLine,
  UNLOADED_BRIEF,
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

describe("scenarios", () => {
  it("highlights a numeric delta and skips text", () => {
    expect(scenarioDelta("80", "140")).toBe("+60");
    expect(scenarioDelta("Debt incurrence", "Dividend / buyback")).toBeNull();
  });
});
