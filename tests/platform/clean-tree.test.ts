import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dirtyEntries, parsePorcelain } from "../../scripts/platform/clean-tree.mjs";

describe("pr-gate dirty-tree check", () => {
  it("parses porcelain v1", () => {
    expect(parsePorcelain(" M docs/a.json\n?? tmp/x\n")).toEqual([
      { status: " M", path: "docs/a.json" },
      { status: "??", path: "tmp/x" },
    ]);
    expect(parsePorcelain("")).toEqual([]);
  });
  it("reports a rewritten committed file and an untracked file, ignores gitignored output", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    fs.writeFileSync(path.join(dir, ".gitignore"), "ignored/\n");
    fs.writeFileSync(path.join(dir, "results.json"), "{}\n");
    git("add", "-A");
    git("commit", "-qm", "c");
    expect(dirtyEntries(dir)).toEqual([]);
    fs.mkdirSync(path.join(dir, "ignored"));
    fs.writeFileSync(path.join(dir, "ignored/out.json"), "{}");
    expect(dirtyEntries(dir)).toEqual([]);
    fs.writeFileSync(path.join(dir, "results.json"), '{"regenerated":true}\n');
    fs.mkdirSync(path.join(dir, "new"));
    fs.writeFileSync(path.join(dir, "new/dump.json"), "{}");
    expect(dirtyEntries(dir)).toEqual([
      { status: " M", path: "results.json" },
      { status: "??", path: "new/dump.json" },
    ]);
  });
});
