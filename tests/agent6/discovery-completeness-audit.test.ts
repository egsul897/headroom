/**
 * Pins discovery-completeness audit invariants: frozen pins preserved,
 * missed restrictions reported, Pass A never executable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "docs/agent-6-authentic-company-e2e/08-discovery-completeness-audit";
const PINS = "docs/agent-6-authentic-company-e2e/00-expectation-pins.json";

describe("Agent 6 — discovery completeness audit pins", () => {
  it("aggregate preserves expectation pins and records inventory beyond must-discover", () => {
    const agg = JSON.parse(readFileSync(join(OUT, "aggregate.json"), "utf8")) as {
      expectationPinsPreserved: boolean;
      totalMustDiscoverPins: number;
      totalRestrictionSectionsInventoried: number;
      totalMissedRestrictionsPassA: number;
      totalUniqueOutsideMustDiscoverPins: number;
      totalStructuralBaseGaps: number;
      costUsd: number;
    };
    expect(agg.expectationPinsPreserved).toBe(true);
    expect(agg.totalMustDiscoverPins).toBe(20);
    expect(agg.totalRestrictionSectionsInventoried).toBeGreaterThan(agg.totalMustDiscoverPins);
    expect(agg.totalUniqueOutsideMustDiscoverPins).toBeGreaterThan(0);
    expect(agg.costUsd).toBe(0);
    expect(typeof agg.totalMissedRestrictionsPassA).toBe("number");
    expect(typeof agg.totalStructuralBaseGaps).toBe("number");
  });

  it("each company audit matches frozen pin SHA and never marks Pass A executable", () => {
    const pins = JSON.parse(readFileSync(PINS, "utf8")) as { expectationPins: Record<string, string> };
    for (const key of ["knife-river-2023-2026", "insulet-2021-2026", "benchmark-2025"]) {
      const a = JSON.parse(readFileSync(join(OUT, `${key}.json`), "utf8")) as {
        expectationPinPreserved: boolean;
        frozenPinSha256: string;
        agent1Eligibility: { executableCount: number };
        missedRestrictions: unknown[];
        passAHitsOutsideMustDiscoverPins: unknown[];
      };
      expect(a.expectationPinPreserved).toBe(true);
      expect(a.frozenPinSha256).toBe(pins.expectationPins[key]);
      expect(a.agent1Eligibility.executableCount).toBe(0);
      expect(Array.isArray(a.missedRestrictions)).toBe(true);
      expect(Array.isArray(a.passAHitsOutsideMustDiscoverPins)).toBe(true);
    }
  });
});
