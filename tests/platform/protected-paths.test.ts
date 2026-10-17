import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { changedPathsBetween, checkProtectedPaths, classifyPath, isProtectedPath, OWNER_LABEL, parseLabels, PROTECTED_PATHS } from "../../scripts/platform/protected-paths.mjs";

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
    expect(checkProtectedPaths(changed, [])).toEqual({ ok: false, approved: false, protectedChanged: ["docs/x/HELD_OUT/a.json"], warnings: [] });
    expect(checkProtectedPaths(changed, ["bug"]).ok).toBe(false);
    expect(checkProtectedPaths(changed, [OWNER_LABEL]).ok).toBe(true);
    expect(checkProtectedPaths(["lib/a.ts"], []).ok).toBe(true);
  });
  it("protects the explicitly listed evidence that carries no token in its name", () => {
    for (const p of [
      "tests/contract-model/certified/golden-map.test.ts",
      "tests/contract-model/certified/golden-harness.ts",
      "docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/pin.json",
      "docs/phase-3-reliability-stratified-certification/README.md",
      "scripts/covenant-learning-factory/scoreboard/snapshot.json.gz",
      "scripts/covenant-learning-factory/scoreboard/ruleset.json",
      "scripts/covenant-learning-factory/scoreboard/fresh-tunable.txt",
      "scripts/covenant-learning-factory/scoreboard/baseline.json",
      "scripts/covenant-learning-factory/scoreboard/baselines/0007-identity-05b2234708d0-pr368.json",
      "./Scripts/covenant-learning-factory/scoreboard/RULESET.json",
    ]) expect(isProtectedPath(p), p).toBe(true);
    // every listed entry exists in the repo, so the list cannot silently go stale
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n");
    for (const e of PROTECTED_PATHS) expect(tracked.some((t) => (e.endsWith("/") ? t.startsWith(e) : t === e)), e).toBe(true);
  });
  it("does not protect the scoreboard's own source, nor near-miss directories", () => {
    for (const p of [
      "scripts/covenant-learning-factory/scoreboard/compare-reports.ts",
      "scripts/covenant-learning-factory/scoreboard/shard-run.sh",
      "tests/contract-model/certified-extra/a.test.ts",
      "tests/stratified-cert/eligibility-blockers.test.ts",
    ]) expect(isProtectedPath(p), p).toBe(false);
  });
  it("token directories protect everything under them, source included", () => {
    for (const p of ["docs/x/baselines/run.ts", "tests/fixtures/held_out/loader.ts", "docs/covenant-learning-factory/unit-dumps/x.ts", "a/blind/b.mjs", "a/sealed/b.sh"])
      expect(classifyPath(p).status, p).toBe("protected");
  });
  it("token-named data files are protected; token-named source files only warn", () => {
    for (const p of [
      "docs/phase-3-conmed-benchmark-recovery-preflight/01-red-baselines.json",
      "docs/a/run-baseline.jsonl",
      "docs/a/frozen-notes.md",
      "docs/a/ground-truth.csv",
      "docs/a/sealed-filing.htm",
      "docs/a/heldout.html",
      "docs/a/baseline.txt",
      "docs/a/baseline.json.gz",
      "docs/a/baseline.yaml",
      "docs/a/baseline", // no extension: not recognised as source, so protected
    ]) expect(classifyPath(p).status, p).toBe("protected");
    for (const p of [
      "scripts/p3-conmed-pilot/recovery-preflight-baseline.ts",
      "scripts/x/frozen-check.mjs",
      "tests/x/ground-truth-loader.test.ts",
      "scripts/x/baseline.sh",
    ]) expect(classifyPath(p).status, p).toBe("warn");
    const r = checkProtectedPaths(["scripts/p3-conmed-pilot/recovery-preflight-baseline.ts", "lib/a.ts"], []);
    expect(r).toEqual({ ok: true, approved: false, protectedChanged: [], warnings: ["scripts/p3-conmed-pilot/recovery-preflight-baseline.ts"] });
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
  it("renaming a protected file to an innocuous name, moving one out of a listed dir, or deleting one still fails", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    fs.mkdirSync(path.join(dir, "tests/contract-model/certified"), { recursive: true });
    fs.mkdirSync(path.join(dir, "docs/runs"), { recursive: true });
    fs.mkdirSync(path.join(dir, "scripts/covenant-learning-factory/scoreboard"), { recursive: true });
    fs.writeFileSync(path.join(dir, "tests/contract-model/certified/golden.test.ts"), "x\n");
    fs.writeFileSync(path.join(dir, "docs/runs/01-red-baselines.json"), "{}\n");
    fs.writeFileSync(path.join(dir, "scripts/covenant-learning-factory/scoreboard/ruleset.json"), "{}\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    const tryChange = (branch: string, act: () => void) => {
      git("checkout", "-q", "main");
      git("checkout", "-qb", branch);
      act();
      git("commit", "-qam", branch);
      return checkProtectedPaths(changedPathsBetween("main", "HEAD", dir), []);
    };
    const moved = tryChange("move-out", () => git("mv", "tests/contract-model/certified/golden.test.ts", "tests/golden.test.ts"));
    expect(moved.ok).toBe(false);
    expect(moved.protectedChanged).toEqual(["tests/contract-model/certified/golden.test.ts"]);
    const renamed = tryChange("rename", () => git("mv", "docs/runs/01-red-baselines.json", "docs/runs/01-results.json"));
    expect(renamed.ok).toBe(false);
    expect(renamed.protectedChanged).toEqual(["docs/runs/01-red-baselines.json"]);
    const deleted = tryChange("delete", () => git("rm", "-q", "scripts/covenant-learning-factory/scoreboard/ruleset.json"));
    expect(deleted.ok).toBe(false);
    expect(deleted.protectedChanged).toEqual(["scripts/covenant-learning-factory/scoreboard/ruleset.json"]);
  });
});
