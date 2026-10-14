/**
 * Scoreboard gate: an injected HELDOUT regression fails; no change passes;
 * DEV-only movement does not trip the HELDOUT gate; dropped HELDOUT sources fail closed.
 */
import { describe, expect, it } from "vitest";
import {
  aggregate,
  compareToBaseline,
  emptyCounts,
  scoreSource,
  splitFor,
  type DevManifest,
  type SourceScore,
} from "@/lib/covenant-learning-factory/scoreboard";
import { emptyRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";

const manifest: DevManifest = { description: "test", sourceIds: ["fixture:a"] };

function s(sourceId: string, cg: number, dg: number, us = 0): SourceScore {
  const counts = { ...emptyCounts(), COVERAGE_GAP: cg, DISCOVERY_GAP: dg, UNSUPPORTED_SEMANTICS: us };
  return { sourceId, split: splitFor(sourceId, manifest), counts, total: cg + dg + us };
}
const rep = (xs: SourceScore[]) => aggregate(xs, { mode: "snapshot", rulesetVersion: 0 });

describe("clf scoreboard gate", () => {
  const base = rep([s("fixture:a", 3, 1), s("edgar:x", 2, 5), s("edgar:y", 0, 4, 1)]);

  it("splits by manifest and totals by class", () => {
    expect(base.totals.DEV).toMatchObject({ sources: 1, total: 4, COVERAGE_GAP: 3 });
    expect(base.totals.HELDOUT).toMatchObject({ sources: 2, total: 12, DISCOVERY_GAP: 9, UNSUPPORTED_SEMANTICS: 1 });
  });

  it("passes when nothing changes", () => {
    const g = compareToBaseline(base, rep([s("fixture:a", 3, 1), s("edgar:x", 2, 5), s("edgar:y", 0, 4, 1)]));
    expect(g.pass).toBe(true);
    expect(g.deltas).toEqual([]);
  });

  it("fails on an injected HELDOUT regression and reports the per-source delta", () => {
    const g = compareToBaseline(base, rep([s("fixture:a", 3, 1), s("edgar:x", 2, 6), s("edgar:y", 0, 4, 1)]));
    expect(g.pass).toBe(false);
    expect(g.reasons[0]).toMatch(/HELDOUT errors increased 12 → 13/);
    expect(g.deltas).toEqual([
      expect.objectContaining({ sourceId: "edgar:x", split: "HELDOUT", delta: 1, byClass: { DISCOVERY_GAP: 1 } }),
    ]);
  });

  it("passes on a HELDOUT improvement even if DEV moves", () => {
    const g = compareToBaseline(base, rep([s("fixture:a", 9, 1), s("edgar:x", 1, 5), s("edgar:y", 0, 4, 1)]));
    expect(g.pass).toBe(true);
    expect(g.heldoutAfter).toBe(11);
  });

  it("fails closed when a HELDOUT source disappears", () => {
    const g = compareToBaseline(base, rep([s("fixture:a", 3, 1), s("edgar:x", 2, 5)]));
    expect(g.pass).toBe(false);
    expect(g.reasons.join(" ")).toMatch(/missing/);
  });

  it("scoreSource is deterministic on a tiny real input", () => {
    const input = {
      source: { sourceId: "edgar:t", contentSha256: null },
      documentText:
        "Section 7.01 Indebtedness. The Borrower shall not incur any Indebtedness, except: (a) Indebtedness in an aggregate principal amount not to exceed $25,000,000; and (b) other Indebtedness not to exceed the greater of $10,000,000 and 5% of Total Assets.",
      candidates: [{ candidateId: "c1", sourceId: "edgar:t", family: "DEBT", excerpt: "a covenant limb that appears nowhere in the citations at all" }],
      definitions: [],
      conditions: [],
    };
    const a = scoreSource(input, emptyRuleSet(0), manifest);
    const b = scoreSource(input, emptyRuleSet(0), manifest);
    expect(a).toEqual(b);
    expect(a.split).toBe("HELDOUT");
    expect(a.counts.DISCOVERY_GAP).toBeGreaterThanOrEqual(1);
  });
});
