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
    });
  }
});
