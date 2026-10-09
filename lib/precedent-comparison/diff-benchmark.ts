/**
 * Diff correctness / performance harness (Phase 3).
 *
 * Never presents a bounded/abbreviated diff as exhaustive.
 */
import { exactTextDiff, benchmarkDiff } from "./diff";
import type { DiffAlgorithm } from "./types";

export interface DiffCaseResult {
  caseId: string;
  description: string;
  leftChars: number;
  rightChars: number;
  results: Array<{
    algorithm: DiffAlgorithm;
    ms: number;
    hunkCount: number;
    bounded: boolean;
    identical: boolean;
    comparedLeft: number;
    comparedRight: number;
    exhaustive: boolean;
    truncationNote: string | null;
  }>;
}

function pad(token: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `${token}${i % 7}`).join(" ");
}

export function buildDiffBenchmarkCases(): Array<{ id: string; description: string; left: string; right: string }> {
  const shortL = "The Borrower shall not incur Indebtedness except as permitted by Section 7.02.";
  const shortR = "The Borrower shall not incur Indebtedness except as permitted by Section 7.03.";
  const defL = `"Consolidated EBITDA" means Consolidated Net Income plus interest expense, taxes, depreciation and amortization ${pad("addback", 200)} without synergies.`;
  const defR = `"Consolidated EBITDA" means Consolidated Net Income plus interest expense, taxes, depreciation and amortization ${pad("addback", 200)} plus expected synergies not to exceed 25%.`;
  const amdL = Array.from({ length: 80 }, (_, i) => `Section 7.02(${String.fromCharCode(97 + (i % 26))}) Indebtedness basket ${i} not to exceed $${(i + 1) * 1_000_000}.`).join("\n");
  const amdR = amdL.replace(/\$(\d)/g, "$$$12").replace("7.02", "7.02 as amended");
  const repL = ("Permitted Lien " + "ordinary course ".repeat(400)).trim();
  const repR = ("Permitted Lien " + "ordinary course ".repeat(390) + "arm's-length ").trim();
  const advL = pad("alpha", 500);
  const advR = pad("beta", 500);
  return [
    { id: "short", description: "Short provisions", left: shortL, right: shortR },
    { id: "large-def", description: "Large definitions", left: defL, right: defR },
    { id: "amendment-blackline", description: "Long amendment blacklines", left: amdL, right: amdR },
    { id: "repetitive", description: "Highly repetitive text", left: repL, right: repR },
    { id: "adversarial-tokens", description: "Adversarial token sequences", left: advL, right: advR },
  ];
}

export function runDiffBenchmarkSuite(): {
  cases: DiffCaseResult[];
  notes: string[];
} {
  const cases: DiffCaseResult[] = [];
  for (const c of buildDiffBenchmarkCases()) {
    const bench = benchmarkDiff(c.left, c.right);
    const detailed = (["token-lcs.v1", "token-lcs-bounded.v1", "myers-line.v1"] as DiffAlgorithm[]).map((algorithm) => {
      const d = exactTextDiff("l", c.left, "r", c.right, {
        algorithm,
        tokenBound: algorithm === "token-lcs.v1" ? Number.MAX_SAFE_INTEGER : 400,
      });
      const b = bench.find((x) => x.algorithm === algorithm)!;
      const exhaustive = !d.bounded && algorithm !== "myers-line.v1";
      return {
        algorithm,
        ms: b.ms,
        hunkCount: d.hunks.length,
        bounded: d.bounded,
        identical: d.identical,
        comparedLeft: d.comparedTokenCount.left,
        comparedRight: d.comparedTokenCount.right,
        exhaustive: algorithm === "myers-line.v1" ? false : exhaustive,
        truncationNote: d.bounded
          ? "BOUNDED — abbreviated token window; not an exhaustive textual difference"
          : algorithm === "myers-line.v1"
            ? "Line-oriented Myers — token-level exhaustiveness not claimed"
            : null,
      };
    });
    cases.push({
      caseId: c.id,
      description: c.description,
      leftChars: c.left.length,
      rightChars: c.right.length,
      results: detailed,
    });
  }
  return {
    cases,
    notes: [
      "Bounded LCS must never be reported as an exhaustive diff.",
      "Myers-line compares normalized lines, not tokens — semantic information may be lost at intra-line granularity.",
      "Runtimes are process-local and non-certified performance claims.",
    ],
  };
}
