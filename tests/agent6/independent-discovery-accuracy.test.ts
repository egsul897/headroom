/**
 * Pins independent discovery GT scoring invariants — document-local ≠ package-level;
 * frozen pins preserved; Pass A executable never implied.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "docs/agent-6-authentic-company-e2e/11-independent-discovery-ground-truth";

describe("Agent 6 — independent discovery accuracy pins", () => {
  it("accuracy matrix separates document-local from package-level recall", () => {
    const m = JSON.parse(readFileSync(join(OUT, "accuracy-matrix.json"), "utf8")) as {
      costUsd: number;
      expectationPinsPreserved: boolean;
      totals: {
        gtItems: number;
        TP: number;
        FN: number;
        documentLocalRecall: number;
        packageLevelRecall: number;
      };
      falseNegatives: Array<{ id: string; packageLevelHit: boolean }>;
    };
    expect(m.costUsd).toBe(0);
    expect(m.expectationPinsPreserved).toBe(true);
    expect(m.totals.gtItems).toBe(20);
    expect(m.totals.TP + m.totals.FN).toBe(20);
    expect(m.totals.documentLocalRecall).toBeLessThanOrEqual(m.totals.packageLevelRecall);
    expect(m.totals.documentLocalRecall).toBeGreaterThan(0.5);
    // At least one FN must illustrate package-level hit ≠ document-local coverage.
    expect(m.falseNegatives.some((f) => f.packageLevelHit)).toBe(true);
  });
});
