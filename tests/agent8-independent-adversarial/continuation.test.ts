import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

describe("Agent 8 adversarial continuation (post-#229/#237)", () => {
  it(
    "runs continuation matrix; main cases pass; records pending #243 risk",
    () => {
      const r = spawnSync("npx", ["tsx", "scripts/agent8-independent-adversarial/run-continuation.ts"], {
        encoding: "utf8",
        cwd: process.cwd(),
        env: { ...process.env, A8_TIP_243: process.env.A8_TIP_243 ?? "/tmp/a8-wt-243" },
        timeout: 180_000,
      });
      expect(r.status, r.stderr || r.stdout).toBe(0);
      const artifactPath = path.resolve("docs/agent8-independent-adversarial/08-continuation-results.json");
      expect(fs.existsSync(artifactPath)).toBe(true);
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
        summary: {
          falseFavorable: number;
          mutationDetectionRate: number;
          uniqueGroundedScenarios: number;
        };
        cases: Array<{ id: string; pass: boolean; outcomeClass: string }>;
        releaseBlocking: Array<{ id: string }>;
      };
      // Main integrated path must not introduce new false favorables beyond the documented pending tip
      const mainFalse = artifact.cases.filter(
        (c) => c.id !== "CONT-06-pending-pr243-reintroduces-a8-01" && c.outcomeClass === "INCORRECT_FAVORABLE",
      );
      expect(mainFalse).toEqual([]);
      expect(artifact.summary.mutationDetectionRate).toBe(1);
      expect(artifact.summary.uniqueGroundedScenarios).toBeGreaterThanOrEqual(5);
      // Pending #243 risk must be surfaced when worktree exists
      const pending = artifact.cases.find((c) => c.id === "CONT-06-pending-pr243-reintroduces-a8-01");
      expect(pending).toBeTruthy();
    },
    180_000,
  );
});
