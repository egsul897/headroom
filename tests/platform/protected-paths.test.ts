import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { changedPathsBetween, checkProtectedPaths, isProtectedPath, OWNER_LABEL, parseLabels } from "../../scripts/platform/protected-paths.mjs";

describe("pr-gate protected-path check", () => {
  it("flags held-out / blind / baseline / frozen / ground-truth / sealed paths", () => {
    for (const p of [
      "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json",
      "docs/clf-scoreboard/section-tree-heldout-report.json",
      "docs/x/HELD_OUT/a.json",
      "docs/x/held-out/a.json",
      "docs/evaluation-v2-iteration/06-frozen-sample-packets-BLINDED.json",
      "tests/fixtures/unseen-packages/f/raw-x-firstblind.json",
      "docs/architecture/PHASE-3-TRACK-A.FROZEN.md",
      "docs/final-phase3-closure/00-baseline.json",
      "docs/x/_frozen-sample-labels-v3-SEALED.json",
      "docs/ground_truth/a.md",
      "docs/open4/02-holdout-manifest.json",
      // any change under unit-dumps, whatever the package name (release-1 commits rewrote the mhk dump timestamp-only)
      "docs/covenant-learning-factory/unit-dumps/mhk-2026-credit-agreement.units.json",
      "docs/covenant-learning-factory/unit-dumps/chwy.units.json",
    ]) expect(isProtectedPath(p), p).toBe(true);
  });
  it("does not flag ordinary paths", () => {
    for (const p of ["lib/billing/webhook-events.ts", "scripts/platform/pr-gate-compare.mjs", "docs/platform/README.md", "lib/reports/baselined.ts", "app/frozenyogurt/page.tsx"])
      expect(isProtectedPath(p), p).toBe(false);
  });
  it("fails without the owner label and passes with it", () => {
    const changed = ["lib/a.ts", "docs/x/HELD_OUT/a.json"];
    expect(checkProtectedPaths(changed, [])).toEqual({ ok: false, approved: false, protectedChanged: ["docs/x/HELD_OUT/a.json"] });
    expect(checkProtectedPaths(changed, ["bug"]).ok).toBe(false);
    expect(checkProtectedPaths(changed, [OWNER_LABEL]).ok).toBe(true);
    expect(checkProtectedPaths(["lib/a.ts"], []).ok).toBe(true);
  });
  it("parses labels from the workflow's JSON (names or label objects)", () => {
    expect(parseLabels(undefined)).toEqual([]);
    expect(parseLabels('["a","owner-approved-protected-paths"]')).toEqual(["a", OWNER_LABEL]);
    expect(parseLabels('[{"name":"x"}]')).toEqual(["x"]);
    expect(() => parseLabels('{"a":1}')).toThrow();
  });
  it("sees both sides of a rename and deletions between base and head", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    fs.mkdirSync(path.join(dir, "fixtures"));
    fs.writeFileSync(path.join(dir, "fixtures/ground-truth.json"), "{}\n");
    fs.writeFileSync(path.join(dir, "keep.txt"), "x\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "pr");
    git("mv", "fixtures/ground-truth.json", "fixtures/renamed.json");
    git("commit", "-qm", "rename");
    const changed = changedPathsBetween("main", "HEAD", dir);
    expect(changed).toContain("fixtures/ground-truth.json");
    expect(checkProtectedPaths(changed, []).ok).toBe(false);
  });
});
