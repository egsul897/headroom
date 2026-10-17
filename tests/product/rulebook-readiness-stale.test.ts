/**
 * Rule 162 — rulebook readiness discloses stale summaries feeding the
 * ladder. Same gap as capacity (rule 161): discoveredSummaries and
 * interpretedProvisions counted stale items with no disclosure.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: {} }));

import { rulebookStaleNote } from "../../lib/product/customer-intelligence/rulebook-readiness";

describe("rule 162: rulebook readiness discloses stale summaries", () => {
  it("returns empty when no discovered summary is stale", () => {
    expect(rulebookStaleNote(0)).toBe("");
    expect(rulebookStaleNote(-1)).toBe("");
  });

  it("names the stale item count and asks for re-analysis", () => {
    expect(rulebookStaleNote(5)).toMatch(/5 discovered summary items come from analyses predating/i);
    expect(rulebookStaleNote(5)).toMatch(/re-analyze for current results/i);
  });

  it("loader wires staleness into the headline", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib/product/customer-intelligence/rulebook-readiness.ts"),
      "utf8",
    );
    const fn = source.slice(source.indexOf("export async function loadRulebookReadiness"));
    expect(fn).toContain("analysisStale");
    expect(fn).toContain("staleDiscoveredSummaries");
    expect(fn).toContain("rulebookStaleNote(staleDiscoveredSummaries)");
  });
});
