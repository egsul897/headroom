#!/usr/bin/env node
/**
 * PR-gate protected-path check.
 *
 * Fails when a PR adds, modifies, deletes or renames any path whose name marks it as
 * frozen evidence (held-out / blind sets, sealed baselines, FROZEN fixtures, ground truth, CLF unit dumps),
 * unless the PR carries the explicit owner label OWNER_LABEL.
 *
 * Matching is case-insensitive and general (no file list to keep in sync). Tokens held-out /
 * holdout / frozen / ground-truth / baseline(s) / sealed / unit-dump(s) must be delimited by "/", "_", "-", "."
 * or the string ends; "blind" matches anywhere (BLINDED, firstblind). It errs toward flagging:
 * a false positive costs one owner label, a false negative costs frozen evidence.
 *
 * CLI:  node protected-paths.mjs --base <ref> [--head <ref>]
 *       labels come from env PR_LABELS (JSON array of names, as from toJSON(...labels.*.name)).
 * Exit: 0 ok, 1 protected change without label, 2 usage / git error.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const OWNER_LABEL = "owner-approved-protected-paths";

export const PROTECTED_PATTERN =
  /(?:(?:^|[/_.\-])(?:held[-_]?out|hold[-_]?out|frozen|ground[-_]?truth|baselines?|sealed|unit[-_]?dumps?)(?=[/_.\-]|$))|blind/i;

/** @param {string} file */
export function isProtectedPath(file) {
  return PROTECTED_PATTERN.test(file.replace(/\\/g, "/"));
}

/**
 * @param {readonly string[]} changedPaths
 * @param {readonly string[]} labels
 */
export function checkProtectedPaths(changedPaths, labels) {
  const protectedChanged = [...new Set(changedPaths.filter((p) => p && isProtectedPath(p)))].sort();
  const approved = labels.includes(OWNER_LABEL);
  return { ok: protectedChanged.length === 0 || approved, approved, protectedChanged };
}

/** @param {string | undefined} raw */
export function parseLabels(raw) {
  if (!raw || !raw.trim()) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("PR_LABELS must be a JSON array");
  return parsed.map((l) => (typeof l === "string" ? l : String(l?.name ?? ""))).filter(Boolean);
}

/** Every path touched between base and head; renames contribute both sides (--no-renames). */
export function changedPathsBetween(base, head = "HEAD", cwd = process.cwd()) {
  const out = execFileSync("git", ["diff", "--name-only", "--no-renames", `${base}...${head}`], { cwd, encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const base = get("--base");
  const head = get("--head") ?? "HEAD";
  if (!base) {
    console.error("usage: protected-paths.mjs --base <ref> [--head <ref>]");
    process.exit(2);
  }
  let result;
  try {
    result = checkProtectedPaths(changedPathsBetween(base, head), parseLabels(process.env.PR_LABELS));
  } catch (err) {
    console.error(`protected-path check could not run: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  if (result.protectedChanged.length === 0) {
    console.log("protected-path check: no held-out / blind / baseline / frozen / ground-truth paths changed");
    return;
  }
  console.log(`protected paths changed (${result.protectedChanged.length}):`);
  for (const p of result.protectedChanged) console.log(`  ${p}`);
  if (result.approved) {
    console.log(`label "${OWNER_LABEL}" present: allowed by explicit owner approval`);
    return;
  }
  console.error(`FAIL: these paths are frozen evidence. An owner must add the label "${OWNER_LABEL}" to allow this PR.`);
  process.exit(1);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) main();
