#!/usr/bin/env node
/**
 * PR-gate dirty-tree check: after the test run the checkout must be byte-identical to the commit.
 * Any modified, deleted or untracked (non-ignored) file means a test or script wrote into the repo
 * (for example regenerating a committed artifact or ground truth). Tests must write to temp dirs
 * (see lib/platform/artifact-output.ts).
 *
 * CLI:  node clean-tree.mjs [--label <run label>]
 * Exit: 0 clean, 1 dirty, 2 git error.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Parse `git status --porcelain=v1` output into entries. @param {string} porcelain */
export function parsePorcelain(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
}

export function dirtyEntries(cwd = process.cwd()) {
  const out = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd, encoding: "utf8" });
  return parsePorcelain(out);
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--label");
  const label = i >= 0 ? args[i + 1] : "test run";
  let entries;
  try {
    entries = dirtyEntries();
  } catch (err) {
    console.error(`clean-tree check could not run: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  if (entries.length === 0) {
    console.log(`clean-tree: working tree unchanged after ${label}`);
    return;
  }
  console.error(`FAIL: ${label} changed ${entries.length} path(s) in the checkout. Tests must write only to temp dirs:`);
  for (const e of entries) console.error(`  ${e.status} ${e.path}`);
  process.exit(1);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) main();
