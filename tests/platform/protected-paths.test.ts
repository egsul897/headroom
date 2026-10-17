import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { changedPathsBetween, checkProtectedPaths, classifyPath, isProtectedPath, OWNER_LABEL, parseLabels, PROTECTED_PATHS, parseRawZ, protectedTrackedAt, resolveLinkTarget, SOURCE_WARN_ALLOWLIST, symlinkIsProtected, symlinksBetween } from "../../scripts/platform/protected-paths.mjs";

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
  it("token-named files are protected whatever their extension; source included (fail closed)", () => {
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
      "docs/a/baseline",
      "scripts/p3-conmed-pilot/recovery-preflight-baseline.ts",
      "scripts/x/frozen-check.mjs",
      "tests/x/ground-truth-loader.test.ts",
      "lib/x/replay-from-frozen-cache.ts",
      "docs/x/_holdout-sample-build-script.py",
    ]) expect(classifyPath(p).status, p).toBe("protected");
    const r = checkProtectedPaths(["scripts/p3-conmed-pilot/recovery-preflight-baseline.ts", "lib/a.ts"], []);
    expect(r).toEqual({ ok: false, approved: false, protectedChanged: ["scripts/p3-conmed-pilot/recovery-preflight-baseline.ts"], warnings: [] });
  });
  it("the seven frozen source-form evidence files are listed explicitly and fail the gate", () => {
    const seven = [
      "tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth.ts",
      "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth.ts",
      "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/human-ground-truth.ts",
      "tests/fixtures/context-retrieval-benchmark/fwrg-context-ground-truth.ts",
      "tests/fixtures/context-retrieval-benchmark/lsb-context-ground-truth.ts",
      "tests/autonomous-financial-computation/held-out-oracles.test.ts",
      "tests/contract-model/semantic-compiler/phase-3b-baseline.ts",
    ];
    for (const p of seven) {
      expect(PROTECTED_PATHS, p).toContain(p);
      expect(classifyPath(p), p).toEqual({ status: "protected", reason: `listed: ${p}` });
      // even an allowlist entry cannot release them
      expect(classifyPath(p, { warnAllowlist: [p] }).status, p).toBe("protected");
      expect(checkProtectedPaths([p], []).ok, p).toBe(false);
    }
  });
  it("only an explicit allowlist releases a token-named file, and only a source file under scripts/", () => {
    expect(SOURCE_WARN_ALLOWLIST).toEqual([]);
    const allow = ["scripts/x/red-baseline.ts", "tests/x/held-out-eval.test.ts", "docs/x/frozen.py", "scripts/x/baseline.json"];
    expect(classifyPath("scripts/x/red-baseline.ts", { warnAllowlist: allow }).status).toBe("warn");
    expect(classifyPath("tests/x/held-out-eval.test.ts", { warnAllowlist: allow }).status).toBe("protected");
    expect(classifyPath("docs/x/frozen.py", { warnAllowlist: allow }).status).toBe("protected");
    expect(classifyPath("scripts/x/baseline.json", { warnAllowlist: allow }).status).toBe("protected");
    expect(classifyPath("scripts/x/other-baseline.ts", { warnAllowlist: allow }).status).toBe("protected");
  });
  it("every tracked file the 220a6123 matcher protected is still protected (no file was released)", () => {
    // PROTECTED_PATTERN exactly as it stood at 220a6123 (copied verbatim, so this needs no git history)
    const oldPattern = /(?:(?:^|[/_.\-])(?:held[-_]?out|hold[-_]?out|frozen|ground[-_]?truth|baselines?|sealed|unit[-_]?dumps?)(?=[/_.\-]|$))|blind/i;
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const before = tracked.filter((f) => oldPattern.test(f));
    expect(before.length).toBeGreaterThan(35);
    const released = before.filter((f) => !isProtectedPath(f));
    expect(released).toEqual([]);
  });
  it("symlinks: a link to a protected file or directory, or out of the repo, is protected; a link to ordinary source is not", () => {
    expect(symlinkIsProtected({ link: "lib/gt.ts", target: "../tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth.ts" })).toBe(true);
    expect(symlinkIsProtected({ link: "docs/x/data.json", target: "../covenant-learning-factory/unit-dumps/mhk.units.json" })).toBe(true);
    expect(symlinkIsProtected({ link: "lib/certified", target: "../tests/contract-model/certified" })).toBe(true);
    expect(symlinkIsProtected({ link: "lib/a.ts", target: "/etc/passwd" })).toBe(true);
    expect(symlinkIsProtected({ link: "lib/a.ts", target: "../../outside" })).toBe(true);
    expect(symlinkIsProtected({ link: "lib/a.ts", target: "./b.ts" })).toBe(false);
    expect(resolveLinkTarget("lib/x/a.ts", "../b.ts")).toBe("lib/b.ts");
  });
  it("a NEW symlink to a protected file fails the gate end to end through git", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-link-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    fs.mkdirSync(path.join(dir, "tests/fixtures/x"), { recursive: true });
    fs.mkdirSync(path.join(dir, "lib"));
    fs.writeFileSync(path.join(dir, "tests/fixtures/x/human-ground-truth.ts"), "export {}\n");
    fs.writeFileSync(path.join(dir, "lib/ok.ts"), "export {}\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "pr");
    fs.symlinkSync("../tests/fixtures/x/human-ground-truth.ts", path.join(dir, "lib/answers.ts"));
    fs.symlinkSync("ok.ts", path.join(dir, "lib/alias.ts"));
    git("add", "-A");
    git("commit", "-qm", "links");
    const links = symlinksBetween("main", "HEAD", dir);
    expect(links).toEqual(expect.arrayContaining([{ link: "lib/answers.ts", target: "../tests/fixtures/x/human-ground-truth.ts" }, { link: "lib/alias.ts", target: "ok.ts" }]));
    const r = checkProtectedPaths(changedPathsBetween("main", "HEAD", dir), [], links);
    expect(r.ok).toBe(false);
    expect(r.protectedChanged).toEqual(["lib/answers.ts"]);
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
  it("names with non-ASCII, quote or backslash characters inside protected dirs are seen exactly (git -z, no quotePath)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-z-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "core.quotePath", "true");
    fs.writeFileSync(path.join(dir, "keep.txt"), "x\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "pr");
    const names = [
      "tests/contract-model/certified/\u00e9.test.ts",
      "docs/phase-3-reliability-stratified-certification/\u00f1.md",
      'tests/contract-model/certified/a\\"b.ts',
    ];
    for (const n of names) {
      fs.mkdirSync(path.join(dir, path.dirname(n)), { recursive: true });
      fs.writeFileSync(path.join(dir, n), "x\n");
    }
    git("add", "-A");
    git("commit", "-qm", "odd names");
    // the default (quoted) output really does mangle these names
    expect(git("diff", "--name-only", "main...HEAD")).toMatch(/"tests\/contract-model\/certified\/\\303\\251/);
    const changed = changedPathsBetween("main", "HEAD", dir);
    expect(changed.sort()).toEqual([...names].sort());
    for (const n of names) expect(isProtectedPath(n), n).toBe(true);
    const r = checkProtectedPaths(changed, [], symlinksBetween("main", "HEAD", dir), protectedTrackedAt("HEAD", dir));
    expect(r.ok).toBe(false);
    expect([...r.protectedChanged].sort()).toEqual([...names].sort());
  });
  it("parseRawZ keeps both sides of a rename/copy pair and refuses malformed output", () => {
    const z = (...p: string[]) => p.join("\0") + "\0";
    const out = z(
      ":100644 100644 aaaa bbbb M", "lib/a.ts",
      ":100644 100644 aaaa bbbb R087", "tests/contract-model/certified/old\u00e9.ts", "lib/new name.ts",
      ":000000 120000 0000 cccc A", "lib/link",
      ":100644 000000 aaaa 0000 D", "docs/x\ty.md",
    );
    const e = parseRawZ(out);
    expect(e.map((x) => x.paths)).toEqual([["lib/a.ts"], ["tests/contract-model/certified/old\u00e9.ts", "lib/new name.ts"], ["lib/link"], ["docs/x\ty.md"]]);
    expect(e[2]).toMatchObject({ dstMode: "120000", dstSha: "cccc", status: "A" });
    expect(() => parseRawZ("garbage\0")).toThrow(/unexpected/);
    expect(() => parseRawZ(":100644 100644 aaaa bbbb R100\0only-one\0")).toThrow(/truncated/);
  });
  it("a symlink to the repo root or to any directory that contains evidence is protected", () => {
    const tracked = ["tests/fixtures/unseen-packages/x/human-ground-truth.ts", "docs/covenant-learning-factory/unit-dumps/a.json"];
    expect(symlinkIsProtected({ link: "lib/root", target: ".." }, tracked)).toBe(true);
    expect(symlinkIsProtected({ link: "root", target: "." }, tracked)).toBe(true);
    expect(symlinkIsProtected({ link: "lib/fx", target: "../tests/fixtures" }, tracked)).toBe(true);
    expect(symlinkIsProtected({ link: "lib/t", target: "../tests" }, tracked)).toBe(true);
    // a parent of a listed entry, even with no tracked list
    expect(symlinkIsProtected({ link: "lib/cm", target: "../tests/contract-model" })).toBe(true);
    expect(symlinkIsProtected({ link: "lib/sc", target: "../scripts/covenant-learning-factory" })).toBe(true);
    // a directory with no evidence under it is fine
    expect(symlinkIsProtected({ link: "lib/u", target: "./util" }, tracked)).toBe(false);
    expect(symlinkIsProtected({ link: "lib/c", target: "../components" }, tracked)).toBe(false);
  });
});
