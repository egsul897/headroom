import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

describe("capacity-math-eval-matrix (offline)", () => {
  it("emits a matrix with attempted/skipped separation and zero failures on scored rows", () => {
    execFileSync("npx", ["tsx", "scripts/intelligence-factory/capacity-math-eval-matrix.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, GIT_SHA: "test" },
      stdio: "pipe",
    });
    const out = path.join(process.cwd(), "docs/intelligence-factory/capacity-math-eval-matrix.json");
    expect(existsSync(out)).toBe(true);
    const report = JSON.parse(readFileSync(out, "utf8")) as {
      summary: { failed: number; attempted: number; skipped: number; passed: number };
      rows: Array<{ attemptStatus: string; pass?: boolean }>;
      paidInferenceCostUsd: number;
      neonMutations: number;
    };
    expect(report.paidInferenceCostUsd).toBe(0);
    expect(report.neonMutations).toBe(0);
    expect(report.summary.attempted).toBeGreaterThan(0);
    expect(report.summary.skipped).toBeGreaterThan(0);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.passed).toBe(report.summary.attempted);
    expect(report.rows.every((r) => r.attemptStatus === "attempted" || r.attemptStatus === "skipped")).toBe(
      true,
    );
  });
});
