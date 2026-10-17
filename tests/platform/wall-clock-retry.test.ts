import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Wall-clock timing tests get exactly one retry, never a looser threshold.
 * Each entry pins the file, the test title, and the unchanged threshold assertion.
 */
const TIMING_TESTS = [
  {
    file: "tests/contract-model/part-b-recert-finding4-independent.test.ts",
    title: "FIXED: wall-clock time now grows roughly linearly (sub-quadratic), not super-linearly, as the bare-or chain grows",
    threshold: "expect(ratio).toBeLessThan(8);",
  },
  {
    file: "tests/foundation-audit/context-retrieval-adversarial.test.ts",
    title: "14. CTX-01 (generalized, cycle protection)",
    threshold: "expect(elapsedMs).toBeLessThan(2000);",
  },
  {
    file: "tests/contract-model/part-b-terminal-recert-open3-independent.test.ts",
    title: "measured multi-point scaling is consistent with O(n), not O(n^2)",
    threshold: "expect(slope).toBeLessThan(1.7);",
  },
  {
    file: "tests/contract-model/open-3-n-way-claim-decomposition.test.ts",
    title: "multi-point measurement: doubling input size roughly doubles wall-clock time",
    threshold: "expect(timeRatio).toBeLessThan(sizeRatio * sizeRatio * 0.5);",
  },
  {
    file: "tests/contract-model/runtime/capacity/forensic-regression.test.ts",
    title: "supplemental: wall-clock log-log slope over materially increasing n is far below the audited 1.81",
    threshold: "expect(slope).toBeLessThan(1.5);",
  },
  {
    file: "tests/contract-model/part-b-recert-finding4-independent.test.ts",
    title: "deeply-nested but balanced parens on both sides of a genuine top-level 'or' do not cause pathological slowdown",
    threshold: "expect(elapsed).toBeLessThan(2000);",
  },
];

describe("wall-clock timing tests: one retry, threshold unchanged", () => {
  for (const t of TIMING_TESTS) {
    it(t.file, () => {
      const src = fs.readFileSync(t.file, "utf8");
      const at = src.indexOf(t.title);
      expect(at, "test title present").toBeGreaterThan(-1);
      const header = src.slice(at, src.indexOf("=> {", at));
      expect(header).toMatch(/\{\s*retry:\s*1\b/);
      expect(header).not.toMatch(/retry:\s*([2-9]|\d{2,})/);
      expect(src).toContain(t.threshold);
      expect(src).not.toMatch(/WALL_CLOCK_RETRY/);
    });
  }
});
