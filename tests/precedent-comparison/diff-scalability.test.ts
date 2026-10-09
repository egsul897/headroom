import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchmarkDiff, exactTextDiff, getDefaultCorpus } from "../../lib/precedent-comparison";

describe("Diff scalability", () => {
  it("selects bounded or myers strategy for large authentic provisions", () => {
    const corpus = getDefaultCorpus();
    const longOnes = corpus
      .list()
      .map((p) => p.sourceText)
      .sort((a, b) => b.length - a.length);
    const left = longOnes[0] ?? "alpha beta gamma";
    const right = longOnes[1] ?? "alpha beta delta";
    const diff = exactTextDiff("L", left, "R", right);
    expect(["token-lcs.v1", "token-lcs-bounded.v1", "myers-line.v1"]).toContain(diff.algorithm);
    expect(diff.hunks.length).toBeGreaterThan(0);
    // Deterministic replay
    const again = exactTextDiff("L", left, "R", right, { algorithm: diff.algorithm });
    expect(again.hunks).toEqual(diff.hunks);
    expect(again.tokenJaccard).toBe(diff.tokenJaccard);
  });

  it("benchmarks algorithms on a large fixture excerpt without hanging", () => {
    const path = "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt";
    const text = readFileSync(path, "utf8");
    const left = text.slice(0, 12000);
    const right = text.slice(2000, 14000);
    const results = benchmarkDiff(left, right);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.ms).toBeLessThan(5000);
      expect(r.hunkCount).toBeGreaterThan(0);
    }
  });
});
